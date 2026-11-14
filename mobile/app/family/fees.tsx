import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (F) fills this in; replace the body of this file with the real screen. */
export default function FamilyFees() {
  return (
    <ComingSoon
      title="Fees"
      icon="wallet-outline"
      description="What is due, what is paid, and your receipts. Payment is made at the school office."
      willShow={["Balance and what is due when", "Statement of payments", "Download and share receipts"]}
    />
  );
}
