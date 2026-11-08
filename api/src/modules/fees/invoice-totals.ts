import { Prisma } from '../../generated/prisma/client.js';
import { toPaise } from './ledger.js';

export interface InvoiceTotals {
  invoiceId: string;
  studentId: string;
  academicYearId: string;
  /** All in paise. */
  gross: number;
  concessions: number;
  paid: number;
  pending: number;
}

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

interface Row {
  id: string;
  student_id: string;
  academic_year_id: string;
  gross: Prisma.Decimal;
  concessions: Prisma.Decimal;
  paid: Prisma.Decimal;
}

/**
 * The one place a balance is worked out, straight from the rows:
 *   gross (the invoice lines) - concessions that were not taken back
 *   - payments that were not reversed.
 * Nothing about a balance is stored, so it cannot drift from the ledger.
 */
export async function invoiceTotals(
  db: Db,
  schoolId: string,
  filter: {
    studentIds?: string[];
    invoiceIds?: string[];
    academicYearId?: string;
  },
): Promise<InvoiceTotals[]> {
  if (filter.studentIds && filter.studentIds.length === 0) return [];
  if (filter.invoiceIds && filter.invoiceIds.length === 0) return [];
  const conditions: Prisma.Sql[] = [
    Prisma.sql`i.school_id = ${schoolId}::uuid`,
  ];
  if (filter.studentIds)
    conditions.push(
      Prisma.sql`i.student_id IN (${Prisma.join(filter.studentIds.map((id) => Prisma.sql`${id}::uuid`))})`,
    );
  if (filter.invoiceIds)
    conditions.push(
      Prisma.sql`i.id IN (${Prisma.join(filter.invoiceIds.map((id) => Prisma.sql`${id}::uuid`))})`,
    );
  if (filter.academicYearId)
    conditions.push(
      Prisma.sql`i.academic_year_id = ${filter.academicYearId}::uuid`,
    );

  const rows = await db.$queryRaw<Row[]>`
    SELECT i.id, i.student_id, i.academic_year_id,
      COALESCE((SELECT SUM(l.amount) FROM fee_invoice_lines l WHERE l.invoice_id = i.id), 0) AS gross,
      COALESCE((SELECT SUM(c.amount) FROM concessions c
                WHERE c.invoice_id = i.id AND c.revoked_at IS NULL), 0) AS concessions,
      COALESCE((SELECT SUM(a.amount) FROM payment_allocations a
                JOIN payments p ON p.id = a.payment_id
                WHERE a.invoice_id = i.id
                  AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)), 0) AS paid
    FROM fee_invoices i
    WHERE ${Prisma.join(conditions, ' AND ')}`;

  return rows.map((r) => {
    const gross = toPaise(r.gross.toString());
    const concessions = toPaise(r.concessions.toString());
    const paid = toPaise(r.paid.toString());
    return {
      invoiceId: r.id,
      studentId: r.student_id,
      academicYearId: r.academic_year_id,
      gross,
      concessions,
      paid,
      pending: gross - concessions - paid,
    };
  });
}
