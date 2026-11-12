import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Badge, BadgeTone } from './badge';
import { ApplicationStatus } from '../../core/models';

const STATUS: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  RECEIVED: { label: 'Received', tone: 'info' },
  UNDER_REVIEW: { label: 'Under review', tone: 'warn' },
  GRANTED: { label: 'Granted', tone: 'good' },
  REFUSED: { label: 'Refused', tone: 'bad' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

export const STATUS_OPTIONS = (Object.keys(STATUS) as ApplicationStatus[]).map((value) => ({
  value,
  label: STATUS[value].label,
}));

export const statusLabel = (s: ApplicationStatus) => STATUS[s].label;

/** An admission application's status as a coloured tag. */
@Component({
  selector: 'app-status-tag',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-badge [label]="view().label" [tone]="view().tone" />`,
})
export class StatusTag {
  readonly status = input.required<ApplicationStatus>();
  protected readonly view = computed(() => STATUS[this.status()]);
}
