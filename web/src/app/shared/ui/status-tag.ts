import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from '@openng/optimus-ui/tag';
import { ApplicationStatus } from '../../core/models';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const STATUS: Record<ApplicationStatus, { label: string; severity: Severity }> = {
  RECEIVED: { label: 'Received', severity: 'info' },
  UNDER_REVIEW: { label: 'Under review', severity: 'warn' },
  GRANTED: { label: 'Granted', severity: 'success' },
  REFUSED: { label: 'Refused', severity: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', severity: 'secondary' },
};

export const STATUS_OPTIONS = (Object.keys(STATUS) as ApplicationStatus[]).map((value) => ({
  value,
  label: STATUS[value].label,
}));

export const statusLabel = (s: ApplicationStatus) => STATUS[s].label;

/** An admission application's status as a coloured tag. */
@Component({
  selector: 'app-status-tag',
  imports: [TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p-tag [value]="view().label" [severity]="view().severity" />`,
})
export class StatusTag {
  readonly status = input.required<ApplicationStatus>();
  protected readonly view = computed(() => STATUS[this.status()]);
}
