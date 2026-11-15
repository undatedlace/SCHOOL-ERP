import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, useApiQuery } from '@/api';
import { useOwnStudent } from '@/features/family-student/useOwnStudent';
import { downloadAndShare } from '@/features/files/download';
import { formatDay } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Money, Screen, SegmentedControl, Skeleton, StatTile, Text } from '@/ui';
import { feeTotals, instalmentStatus, invoiceTitle, MODE_LABEL, statement } from './fee-statement';
import type { LedgerPayment, StudentLedger } from './types';

type View_ = 'dues' | 'statement' | 'payments';

/** Fees for the signed-in student: balance tiles, dues by instalment, a statement and the receipts. */
export function FeesScreen() {
  const student = useOwnStudent();
  const studentId = student.data?.id;
  const ledger = useApiQuery<StudentLedger>(`/students/${studentId}/fees`, { enabled: Boolean(studentId) });
  const [view, setView] = useState<View_>('dues');

  const loading = student.isLoading || (Boolean(studentId) && ledger.isLoading);
  const failed = student.isError ? student.error : ledger.isError ? ledger.error : null;

  const refresh = () => {
    void student.refetch();
    void ledger.refetch();
  };

  return (
    <Screen onRefresh={refresh} refreshing={ledger.isRefetching && !ledger.isLoading}>
      {loading ? (
        <View style={styles.gap}>
          <View style={styles.tiles}>
            <Skeleton height={96} rounded={22} width="48%" />
            <Skeleton height={96} rounded={22} width="48%" />
          </View>
          <Skeleton height={180} rounded={22} />
        </View>
      ) : failed ? (
        <ErrorState message={failed.message} onRetry={refresh} retrying={ledger.isRefetching} />
      ) : !ledger.data ? (
        <EmptyState icon="wallet-outline" title="No fees to show" description="There is no student on this account yet." />
      ) : (
        <LedgerView ledger={ledger.data} view={view} onView={setView} />
      )}
    </Screen>
  );
}

function LedgerView({
  ledger,
  view,
  onView,
}: {
  ledger: StudentLedger;
  view: View_;
  onView: (v: View_) => void;
}) {
  const { colors } = useTheme();
  const totals = feeTotals(ledger);
  const noFees = ledger.invoices.length === 0;

  return (
    <View style={styles.gap}>
      <View style={styles.tiles}>
        <StatTile label="Fees billed" value={rupees(totals.billed)} icon="receipt-outline" />
        <StatTile label="Paid" value={rupees(totals.paid)} icon="checkmark-circle-outline" tone="good" />
      </View>
      <View style={styles.tiles}>
        <StatTile
          label="To pay"
          value={rupees(totals.toPay)}
          icon="wallet-outline"
          tone={totals.toPay > 0 ? 'amber' : 'good'}
          hint={totals.toPay > 0 ? undefined : 'All paid'}
        />
        <StatTile
          label="Overdue"
          value={rupees(totals.overdue)}
          icon="alert-circle-outline"
          tone={totals.overdue > 0 ? 'bad' : 'default'}
          hint={totals.overdue > 0 ? 'Past the due date' : 'Nothing overdue'}
        />
      </View>

      <Card tone="amber" style={styles.office}>
        <Icon name="business-outline" size={22} color={colors.amberInk} />
        <View style={styles.officeText}>
          <Text variant="smallStrong" tone="amber">
            Pay at the school office
          </Text>
          <Text variant="small" tone="amber">
            Fees are paid at the office. Keep the receipt; it shows here once the office records your payment.
          </Text>
        </View>
      </Card>

      {noFees ? (
        <EmptyState icon="wallet-outline" title="No fees billed yet" description="When the school bills this year's fees they will show here." />
      ) : (
        <>
          <SegmentedControl
            accessibilityLabel="Fee views"
            value={view}
            onChange={onView}
            options={[
              { value: 'dues', label: 'Dues' },
              { value: 'statement', label: 'Statement' },
              { value: 'payments', label: 'Payments', count: ledger.payments.length },
            ]}
          />
          {view === 'dues' ? <Dues ledger={ledger} /> : view === 'statement' ? <Statement ledger={ledger} /> : <Payments payments={ledger.payments} />}
        </>
      )}
    </View>
  );
}

const rupees = (paise: number) => formatPaise(paise);

function Dues({ ledger }: { ledger: StudentLedger }) {
  const { colors } = useTheme();
  return (
    <View style={styles.gap}>
      {ledger.invoices.map((inv) => (
        <Card key={inv.id} style={styles.gap} testID={`invoice-${inv.id}`}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text variant="subheading">{invoiceTitle(inv)}</Text>
              <Text variant="small" tone="muted">
                Billed <Money amount={inv.gross} variant="small" tone="muted" />
                {inv.concessionTotal !== '0.00' ? (
                  <Text variant="small" tone="muted">
                    {' '}
                    · concession <Money amount={inv.concessionTotal} variant="small" tone="muted" />
                  </Text>
                ) : null}
              </Text>
            </View>
            <View style={styles.right}>
              <Text variant="caption" tone="muted">
                To pay
              </Text>
              <Money amount={inv.pending} variant="bodyStrong" />
            </View>
          </View>
          {inv.instalments.map((i) => {
            const status = instalmentStatus(i);
            return (
              <View
                key={i.seq}
                style={[styles.instalment, { borderTopColor: colors.border }]}
              >
                <View style={styles.grow}>
                  <Text variant="bodyStrong">{i.label}</Text>
                  <Text variant="small" tone={i.overdue && status.tone !== 'good' ? 'bad' : 'muted'}>
                    Due {formatDay(i.dueDate)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Money amount={i.due} variant="bodyStrong" />
                  {i.pending !== i.due ? (
                    <Text variant="caption" tone="muted">
                      <Money amount={i.pending} variant="caption" tone="muted" /> left
                    </Text>
                  ) : null}
                  <Badge label={status.label} tone={status.tone} />
                </View>
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

function Statement({ ledger }: { ledger: StudentLedger }) {
  const { colors } = useTheme();
  const rows = statement(ledger);
  return (
    <Card padding={0} style={styles.statement}>
      {rows.map((r, n) => (
        <View
          key={`${r.date}-${n}`}
          style={[styles.line, n < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          accessible
          accessibilityLabel={`${formatDay(r.date)}, ${r.description}`}
        >
          <View style={styles.grow}>
            <Text variant="caption" tone="muted">
              {formatDay(r.date)}
            </Text>
            <Text variant="smallStrong">{r.description}</Text>
            {r.detail ? (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {r.detail}
              </Text>
            ) : null}
          </View>
          <View style={styles.right}>
            {r.charge !== null ? (
              <Money paise={r.charge} variant="smallStrong" tone="strong" />
            ) : (
              <Money paise={-(r.credit ?? 0)} variant="smallStrong" tone="good" />
            )}
            <Text variant="caption" tone="muted">
              Balance <Money paise={r.balance} variant="caption" tone="muted" />
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

function Payments({ payments }: { payments: LedgerPayment[] }) {
  if (payments.length === 0) {
    return <EmptyState icon="receipt-outline" title="No payments yet" description="Payments recorded by the school office show here with a receipt." />;
  }
  return (
    <View style={styles.gap}>
      {payments.map((p) => (
        <PaymentCard key={p.id} payment={p} />
      ))}
    </View>
  );
}

function PaymentCard({ payment: p }: { payment: LedgerPayment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receipt = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadAndShare({
        path: `/payments/${p.id}/receipt`,
        fileName: `receipt-${p.receiptNo.replace(/[^\w-]+/g, '-')}.pdf`,
        mimeType: 'application/pdf',
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.gap} testID={`payment-${p.id}`}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text variant="subheading">Receipt {p.receiptNo}</Text>
          <Text variant="small" tone="muted">
            {formatDay(p.paidOn)} · {MODE_LABEL[p.mode]}
            {p.reference ? `, ${p.reference}` : ''}
          </Text>
        </View>
        <Money amount={p.amount} variant="heading" />
      </View>
      {p.reversed ? (
        <View style={styles.reversed}>
          <Badge label="Taken back" tone="bad" />
          <Text variant="small" tone="muted">
            {formatDay(p.reversed.on)}: {p.reversed.reason}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title="Download receipt"
        icon="download-outline"
        variant="secondary"
        size="sm"
        fullWidth={false}
        onPress={() => void receipt()}
        loading={busy}
        testID={`receipt-${p.id}`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.md },
  office: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  officeText: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  grow: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  instalment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statement: { overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  reversed: { gap: spacing.xs },
});
