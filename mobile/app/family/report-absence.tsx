import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (G) fills this in; replace the body of this file with the real screen. */
export default function FamilyReportAbsence() {
  return (
    <ComingSoon
      title="Report absence"
      icon="medkit-outline"
      description="Tell the class teacher your child will be away."
      willShow={["Dates and a reason", "Status of earlier requests"]}
    />
  );
}
