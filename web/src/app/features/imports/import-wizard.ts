import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { apiError } from '../../core/api-error';
import { Badge } from '../../shared/ui/badge';
import { FilePicker } from '../../shared/ui/file-picker';
import { IMPORT_TITLES, ImportBatch, ImportRow, ImportSlug } from './import-models';
import { ImportsApi, saveFile } from './imports-api';

type Step = 'start' | 'report' | 'done';
type Show = 'problems' | 'all';

const XLSX = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The whole Excel import in one dialog, the same for every kind:
 *   1. download the template (options such as the year or month are projected in above it),
 *   2. upload the filled-in file: it is checked, nothing is saved,
 *   3. look at the report, then import the rows that passed,
 *   4. see what went in, and download the rows to fix.
 */
@Component({
  selector: 'app-import-wizard',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ButtonModule,
    DialogModule,
    SelectButtonModule,
    Badge,
    FilePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="header()"
      [visible]="visible()"
      (visibleChange)="!$event && close()"
      [modal]="true"
      [style]="{ width: '46rem', 'max-width': '96vw' }"
      [contentStyle]="{ 'max-height': '75vh' }"
    >
      @switch (step()) {
        @case ('start') {
          <ol class="flex flex-col gap-5 text-sm">
            <li class="flex flex-col gap-3">
              <p class="font-semibold">1. Download the template</p>
              <ng-content />
              <p class="text-muted-foreground">
                The file explains how to fill it in on its first sheet. Keep its columns as they
                are.
              </p>
              <div>
                <p-button
                  label="Download template"
                  severity="secondary"
                  size="small"
                  [loading]="downloading()"
                  [disabled]="!canDownload()"
                  (onClick)="downloadTemplate()"
                />
              </div>
            </li>
            <li class="flex flex-col gap-3">
              <p class="font-semibold">2. Upload the filled-in file</p>
              <p class="text-muted-foreground">
                Nothing is saved yet: every row is checked first and you see what was found.
              </p>
              <div>
                <app-file-picker
                  label="Choose file and check"
                  [accept]="xlsx"
                  [busy]="checking()"
                  (picked)="upload($event)"
                />
              </div>
            </li>
          </ol>
        }

        @case ('report') {
          @if (batch(); as b) {
            <p class="mb-3 text-sm text-muted-foreground">
              {{ b.fileName }}: {{ b.summary.total }}
              {{ b.summary.total === 1 ? 'row' : 'rows' }} read.
            </p>
            <div class="mb-4 flex flex-wrap gap-2" aria-label="What the check found">
              <app-badge tone="good" [label]="b.summary.ready + ' ready to import'" />
              @if (b.summary.withWarnings) {
                <app-badge tone="warn" [label]="b.summary.withWarnings + ' to look at'" />
              }
              @if (b.summary.withErrors) {
                <app-badge tone="bad" [label]="b.summary.withErrors + ' with errors (left out)'" />
              }
              @if (b.summary.unchanged) {
                <app-badge tone="neutral" [label]="b.summary.unchanged + ' already in the app'" />
              }
            </div>
            <ng-container *ngTemplateOutlet="rowsTable" />
          }
        }

        @case ('done') {
          @if (batch(); as b) {
            <div class="mb-4 flex flex-wrap gap-2" aria-label="What was imported">
              <app-badge tone="good" [label]="(b.summary.imported ?? 0) + ' imported'" />
              @if (b.summary.failed) {
                <app-badge tone="bad" [label]="b.summary.failed + ' could not be imported'" />
              }
              @if (b.summary.withErrors) {
                <app-badge tone="bad" [label]="b.summary.withErrors + ' left out (errors)'" />
              }
            </div>
            @if (problemCount() === 0) {
              <p class="text-sm">Every row that passed the check is in the app.</p>
            } @else {
              <p class="mb-3 text-sm">
                Download the rows that did not go in, fix them in Excel and upload that file again.
              </p>
              <ng-container *ngTemplateOutlet="rowsTable" />
            }
          }
        }
      }

      @if (error()) {
        <p class="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad" role="alert">{{ error() }}</p>
      }

      <ng-template #rowsTable>
        @if (step() === 'report') {
          <p-selectbutton
            class="mb-3"
            [options]="showOptions"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="show()"
            (ngModelChange)="show.set($event)"
            aria-label="Which rows to list"
          />
        }
        @if (shownRows().length === 0) {
          <p class="text-sm text-muted-foreground">Nothing to look at: every row is fine.</p>
        } @else {
          <div class="max-h-80 overflow-auto rounded-lg border">
            <table class="app-table w-full text-sm">
              <thead>
                <tr>
                  <th class="w-28">Where</th>
                  <th>Row</th>
                  <th>What was found</th>
                </tr>
              </thead>
              <tbody>
                @for (r of shownRows(); track r.sheet + r.rowNumber) {
                  <tr>
                    <td class="align-top whitespace-nowrap text-muted-foreground">
                      {{ r.sheet }}<br />row {{ r.rowNumber }}
                    </td>
                    <td class="align-top font-medium">{{ r.label }}</td>
                    <td class="align-top">
                      <ul class="flex flex-col gap-1">
                        @for (e of r.errors; track $index) {
                          <li><span class="font-semibold text-bad">Error:</span> {{ e }}</li>
                        }
                        @if (r.outcome?.status === 'FAILED') {
                          <li>
                            <span class="font-semibold text-bad">Not imported:</span>
                            {{ r.outcome?.message }}
                          </li>
                        }
                        @for (w of r.warnings; track $index) {
                          <li><span class="font-semibold text-warn">Check:</span> {{ w }}</li>
                        }
                        @if (!r.errors.length && !r.warnings.length && !r.outcome) {
                          <li class="text-muted-foreground">
                            {{ r.unchanged ? 'Already in the app: skipped' : 'Ready' }}
                          </li>
                        }
                      </ul>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </ng-template>

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        @switch (step()) {
          @case ('start') {
            <p-button label="Close" severity="secondary" [text]="true" (onClick)="close()" />
          }
          @case ('report') {
            @if (batch()?.summary?.withErrors) {
              <p-button
                label="Download rows to fix"
                severity="secondary"
                [text]="true"
                [loading]="downloading()"
                (onClick)="downloadProblems()"
              />
            }
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancel()" />
            <p-button
              [label]="importLabel()"
              [disabled]="!batch()?.summary?.ready"
              [loading]="running()"
              (onClick)="runImport()"
            />
          }
          @case ('done') {
            @if (problemCount() > 0) {
              <p-button
                label="Download rows to fix"
                severity="secondary"
                [text]="true"
                [loading]="downloading()"
                (onClick)="downloadProblems()"
              />
            }
            <p-button label="Done" (onClick)="close()" />
          }
        }
      </div>
    </p-dialog>
  `,
})
export class ImportWizard {
  private readonly api = inject(ImportsApi);

  readonly slug = input.required<ImportSlug>();
  /** Options for the template (year, month, division ...), sent as the query. */
  readonly params = input<Record<string, string | undefined>>({});
  readonly canDownload = input(true);
  readonly visible = model(false);
  /** Emitted after an import, so the page can reload what it shows. */
  readonly imported = output<ImportBatch>();

  protected readonly xlsx = XLSX;
  protected readonly step = signal<Step>('start');
  protected readonly batch = signal<ImportBatch | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal(false);
  protected readonly checking = signal(false);
  protected readonly running = signal(false);
  protected readonly show = signal<Show>('problems');
  protected readonly showOptions = [
    { label: 'Rows to look at', value: 'problems' },
    { label: 'All rows', value: 'all' },
  ];

  protected readonly header = computed(() => `Import from Excel: ${IMPORT_TITLES[this.slug()]}`);
  protected readonly importLabel = computed(() => {
    const n = this.batch()?.summary.ready ?? 0;
    return `Import ${n} ${n === 1 ? 'row' : 'rows'}`;
  });

  private readonly needsLook = (r: ImportRow) =>
    r.errors.length > 0 || r.warnings.length > 0 || r.outcome?.status === 'FAILED';

  protected readonly shownRows = computed(() => {
    const rows = this.batch()?.rows ?? [];
    if (this.step() === 'done')
      return rows.filter((r) => r.errors.length > 0 || r.outcome?.status === 'FAILED');
    return this.show() === 'all' ? rows : rows.filter(this.needsLook);
  });
  protected readonly problemCount = computed(
    () =>
      (this.batch()?.rows ?? []).filter(
        (r) => r.errors.length > 0 || r.outcome?.status === 'FAILED',
      ).length,
  );

  protected async downloadTemplate() {
    this.error.set(null);
    this.downloading.set(true);
    try {
      saveFile(await firstValueFrom(this.api.template(this.slug(), this.params())));
    } catch (e) {
      this.error.set(await readBlobError(e));
    } finally {
      this.downloading.set(false);
    }
  }

  protected async upload(file: File) {
    this.error.set(null);
    this.checking.set(true);
    try {
      const batch = await firstValueFrom(this.api.check(this.slug(), file));
      this.batch.set(batch);
      this.show.set(batch.rows.some(this.needsLook) ? 'problems' : 'all');
      this.step.set('report');
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.checking.set(false);
    }
  }

  protected async runImport() {
    const b = this.batch();
    if (!b) return;
    this.error.set(null);
    this.running.set(true);
    try {
      const done = await firstValueFrom(this.api.run(b.id));
      this.batch.set(done);
      this.step.set('done');
      this.imported.emit(done);
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.running.set(false);
    }
  }

  protected async downloadProblems() {
    const b = this.batch();
    if (!b) return;
    this.downloading.set(true);
    try {
      saveFile(await firstValueFrom(this.api.problems(b.id)));
    } catch (e) {
      this.error.set(await readBlobError(e));
    } finally {
      this.downloading.set(false);
    }
  }

  protected async cancel() {
    const b = this.batch();
    if (b) {
      try {
        await firstValueFrom(this.api.cancel(b.id));
      } catch {
        // Already gone or expired: nothing to undo.
      }
    }
    this.reset();
  }

  protected close() {
    this.visible.set(false);
    this.reset();
  }

  private reset() {
    this.step.set('start');
    this.batch.set(null);
    this.error.set(null);
  }
}

/** A download that failed comes back as a Blob holding the JSON error. */
async function readBlobError(e: unknown): Promise<string> {
  const err = e as { error?: unknown };
  if (err?.error instanceof Blob) {
    try {
      const body = JSON.parse(await err.error.text()) as { message?: string | string[] };
      if (Array.isArray(body.message)) return body.message.join('. ');
      if (body.message) return body.message;
    } catch {
      // fall through
    }
  }
  return apiError(e);
}
