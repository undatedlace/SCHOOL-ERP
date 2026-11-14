import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ImportKind } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CheckedRow,
  IMPORT_HANDLERS,
  ImportHandler,
  KIND_BY_SLUG,
  SLUG_BY_KIND,
} from './import-types.js';
import { loadWorkbook, readAbout, rewriteRows } from './workbook.js';
import type { FeesImport } from './fees/fees-import.js';
import type { SingleFeesDto } from './imports.dto.js';

/** A checked file waits this long for "Import"; after that it must be uploaded again. */
const CHECK_EXPIRES_MS = 24 * 60 * 60 * 1000;

export interface Summary {
  total: number;
  ready: number;
  withWarnings: number;
  withErrors: number;
  unchanged: number;
  imported?: number;
  failed?: number;
}

const ready = (r: CheckedRow) => r.errors.length === 0 && !r.unchanged;

function summarise(rows: CheckedRow[]): Summary {
  const s: Summary = {
    total: rows.length,
    ready: rows.filter(ready).length,
    withWarnings: rows.filter(
      (r) => r.errors.length === 0 && r.warnings.length > 0,
    ).length,
    withErrors: rows.filter((r) => r.errors.length > 0).length,
    unchanged: rows.filter((r) => r.errors.length === 0 && r.unchanged).length,
  };
  if (rows.some((r) => r.outcome)) {
    s.imported = rows.filter((r) => r.outcome?.status === 'IMPORTED').length;
    s.failed = rows.filter((r) => r.outcome?.status === 'FAILED').length;
  }
  return s;
}

/** What the screen shows of a row: everything but the raw values and the internal data. */
const rowView = (r: CheckedRow) => ({
  sheet: r.sheet,
  rowNumber: r.rowNumber,
  label: r.label,
  errors: r.errors,
  warnings: r.warnings,
  unchanged: !!r.unchanged,
  outcome: r.outcome ?? null,
});

/**
 * Excel imports, whatever the kind: download a template, upload it to be checked, look at the
 * report, then import the rows that passed. The file is checked in full before anything is
 * written, the good rows go in one at a time (a bad one never undoes the others), and a batch
 * can only ever be imported once.
 */
@Injectable()
export class ImportsService {
  private readonly handlers: Map<ImportKind, ImportHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMPORT_HANDLERS) handlers: ImportHandler[],
  ) {
    this.handlers = new Map(handlers.map((h) => [h.kind, h]));
  }

  /** The handler for a kind, if this person may use it. A kind they may not use is a 403. */
  private handler(auth: AuthContext, slugOrKind: string): ImportHandler {
    const kind = KIND_BY_SLUG[slugOrKind] ?? (slugOrKind as ImportKind);
    const h = this.handlers.get(kind);
    if (!h) throw new NotFoundException('Unknown kind of import');
    if (!h.permissions.every((p) => auth.permissions.includes(p)))
      throw new ForbiddenException();
    return h;
  }

  private mayUse(auth: AuthContext, kind: ImportKind) {
    const h = this.handlers.get(kind);
    return !!h && h.permissions.every((p) => auth.permissions.includes(p));
  }

  /** The kinds this person may import, for the screens. */
  kinds(auth: AuthContext) {
    return [...this.handlers.values()]
      .filter((h) => this.mayUse(auth, h.kind))
      .map((h) => ({ kind: h.kind, slug: SLUG_BY_KIND[h.kind] }));
  }

  async template(
    auth: AuthContext,
    slug: string,
    query: Record<string, unknown>,
  ) {
    const h = this.handler(auth, slug);
    const t = await h.template(auth, query);
    const buffer = Buffer.from(await t.workbook.xlsx.writeBuffer());
    return { fileName: t.fileName, buffer };
  }

  async check(
    auth: AuthContext,
    slug: string,
    file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    const h = this.handler(auth, slug);
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose the Excel file to upload');
    const wb = await loadWorkbook(file.buffer);
    const about = readAbout(wb);
    if (about.kind !== h.kind) {
      const other = SLUG_BY_KIND[about.kind as ImportKind]?.replace('-', ' ');
      throw new BadRequestException(
        other
          ? `This is the ${other} template. Upload it from the ${other} page.`
          : 'This is not the right template for this import.',
      );
    }
    if (about.schoolId !== auth.schoolId) {
      throw new BadRequestException(
        'This template was made for another school. Download the template again from this app.',
      );
    }
    const result = await h.check(auth, wb, about.params);
    const summary = summarise(result.rows);
    const batch = await this.prisma.importBatch.create({
      data: {
        schoolId: auth.schoolId,
        kind: h.kind,
        fileName: file.originalname.slice(0, 200) || 'upload.xlsx',
        params: result.params as Prisma.InputJsonObject,
        rows: result.rows as unknown as Prisma.InputJsonArray,
        summary: summary as unknown as Prisma.InputJsonObject,
        createdById: auth.userId,
      },
    });
    return this.view(batch);
  }

  /** One batch with its report. Only its kind's people may see it. */
  async get(auth: AuthContext, id: string) {
    return this.view(await this.load(auth, id));
  }

  async list(auth: AuthContext, kind?: string) {
    const kinds = [...this.handlers.keys()].filter((k) => this.mayUse(auth, k));
    const wanted = kind ? KIND_BY_SLUG[kind] : undefined;
    const rows = await this.prisma.importBatch.findMany({
      where: {
        schoolId: auth.schoolId,
        kind: { in: wanted ? kinds.filter((k) => k === wanted) : kinds },
      },
      select: {
        id: true,
        kind: true,
        status: true,
        fileName: true,
        summary: true,
        createdAt: true,
        importedAt: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((b) => ({
      id: b.id,
      kind: b.kind,
      slug: SLUG_BY_KIND[b.kind],
      status: this.effectiveStatus(b.status, b.createdAt),
      fileName: b.fileName,
      summary: b.summary as unknown as Summary,
      createdAt: b.createdAt,
      importedAt: b.importedAt,
      createdBy: b.createdBy.fullName,
    }));
  }

  /** Imports the rows that passed. Only once: a second press, or a second person, is refused. */
  async run(auth: AuthContext, id: string, ip?: string) {
    const batch = await this.load(auth, id);
    const h = this.handler(auth, batch.kind);
    if (this.effectiveStatus(batch.status, batch.createdAt) === 'EXPIRED')
      throw new BadRequestException(
        'This check is more than a day old. Upload the file again.',
      );
    // Claim the batch: only one request can move it from CHECKED to RUNNING.
    const claimed = await this.prisma.importBatch.updateMany({
      where: { id, status: 'CHECKED' },
      data: { status: 'RUNNING', importedById: auth.userId },
    });
    if (claimed.count !== 1)
      throw new ConflictException(
        'This file has already been imported (or cancelled)',
      );

    const rows = batch.rows as unknown as CheckedRow[];
    try {
      await h.run(
        auth,
        { id, params: batch.params as Record<string, unknown> },
        rows.filter(ready),
      );
    } catch (error) {
      if (!rows.some((r) => r.outcome?.status === 'IMPORTED')) {
        // Nothing was written: put the batch back so it can be tried again.
        await this.prisma.importBatch.update({
          where: { id },
          data: { status: 'CHECKED', importedById: null },
        });
        throw error;
      }
      // Some rows are in already, so this batch must never run again: close it with what was done.
      for (const r of rows.filter(ready)) {
        r.outcome ??= {
          status: 'FAILED',
          message: 'Stopped before this row: upload the rows to fix again',
        };
      }
    }
    const summary = summarise(rows);
    const done = await this.prisma.importBatch.update({
      where: { id },
      data: {
        status: 'IMPORTED',
        importedAt: new Date(),
        rows: rows as unknown as Prisma.InputJsonArray,
        summary: summary as unknown as Prisma.InputJsonObject,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'imports.run',
      entityType: 'import_batch',
      entityId: id,
      metadata: {
        kind: batch.kind,
        file: batch.fileName,
        imported: summary.imported ?? 0,
        failed: summary.failed ?? 0,
        skipped: summary.withErrors,
      },
      ip,
    });
    return this.view(done);
  }

  async cancel(auth: AuthContext, id: string) {
    await this.load(auth, id);
    const res = await this.prisma.importBatch.updateMany({
      where: { id, status: 'CHECKED' },
      data: { status: 'CANCELLED' },
    });
    if (res.count !== 1)
      throw new ConflictException(
        'Only a file that has not been imported can be cancelled',
      );
  }

  /**
   * The rows that did not go in (errors, or failed while importing), written back into a fresh
   * copy of the template with an "Error" column, ready to fix and upload again.
   */
  async problemsFile(auth: AuthContext, id: string) {
    const batch = await this.load(auth, id);
    const h = this.handler(auth, batch.kind);
    const rows = (batch.rows as unknown as CheckedRow[]).filter(
      (r) => r.errors.length > 0 || r.outcome?.status === 'FAILED',
    );
    if (rows.length === 0)
      throw new NotFoundException('Every row went in: there is nothing to fix');
    const t = await h.template(auth, batch.params as Record<string, unknown>);
    const bySheet = new Map<string, typeof rows>();
    for (const r of rows)
      bySheet.set(r.sheet, [...(bySheet.get(r.sheet) ?? []), r]);

    const sheets = t.workbook.worksheets.filter((ws) => ws.state === 'visible');
    for (const ws of sheets) {
      const mine = bySheet.get(ws.name);
      if (mine) {
        rewriteRows(
          ws,
          mine.map((r) => ({
            rowNumber: r.rowNumber,
            values: r.values,
            problem: r.errors.length
              ? r.errors.join('; ')
              : (r.outcome?.message ?? ''),
          })),
          { inPlace: !!h.prefilled },
        );
      } else if (ws.name !== 'How to fill') {
        t.workbook.removeWorksheet(ws.id);
      }
    }
    const buffer = Buffer.from(await t.workbook.xlsx.writeBuffer());
    return { fileName: t.fileName.replace(/\.xlsx$/, '-to-fix.xlsx'), buffer };
  }

  /**
   * One student's year of fees typed in on the student's page. It goes through exactly the same
   * check and write as a row of the fees file, and is kept in the import history as a one-row batch.
   */
  async singleFees(auth: AuthContext, dto: SingleFeesDto, ip?: string) {
    const h = this.handler(auth, 'FEES') as FeesImport;
    const one = await h.singleRow(auth, dto);
    const row = await h.checkOne(auth, one.params, one.sheet, one.values);
    if (row.errors.length) throw new BadRequestException(row.errors.join('; '));
    if (row.unchanged)
      throw new BadRequestException(
        'Nothing to change: this is already recorded',
      );
    const batch = await this.prisma.importBatch.create({
      data: {
        schoolId: auth.schoolId,
        kind: 'FEES',
        fileName: 'Entered on the student page',
        params: one.params as Prisma.InputJsonObject,
        rows: [row] as unknown as Prisma.InputJsonArray,
        summary: summarise([row]) as unknown as Prisma.InputJsonObject,
        createdById: auth.userId,
      },
    });
    const done = await this.run(auth, batch.id, ip);
    const outcome = done.rows[0]?.outcome;
    if (outcome?.status === 'FAILED')
      throw new BadRequestException(outcome.message ?? 'Could not be saved');
    return { warnings: row.warnings };
  }

  // ---------- helpers ----------

  private async load(auth: AuthContext, id: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    // A batch of a kind this person may not import looks like one that does not exist.
    if (!batch || !this.mayUse(auth, batch.kind))
      throw new NotFoundException('Import not found');
    return batch;
  }

  private effectiveStatus(status: string, createdAt: Date) {
    return status === 'CHECKED' &&
      Date.now() - createdAt.getTime() > CHECK_EXPIRES_MS
      ? 'EXPIRED'
      : status;
  }

  private view(b: {
    id: string;
    kind: ImportKind;
    status: string;
    fileName: string;
    params: unknown;
    rows: unknown;
    summary: unknown;
    createdAt: Date;
    importedAt: Date | null;
  }) {
    return {
      id: b.id,
      kind: b.kind,
      slug: SLUG_BY_KIND[b.kind],
      status: this.effectiveStatus(b.status, b.createdAt),
      fileName: b.fileName,
      createdAt: b.createdAt,
      importedAt: b.importedAt,
      summary: b.summary as Summary,
      rows: (b.rows as CheckedRow[]).map(rowView),
    };
  }
}
