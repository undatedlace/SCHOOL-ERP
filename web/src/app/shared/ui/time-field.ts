import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';

/** "09:30" to a Date on an arbitrary day (only the hours and minutes matter). */
export function fromTime(value: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(2000, 0, 1);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/** A Date to "09:30". */
export function toTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A time box (Optimus date picker in time-only mode) that works with plain "HH:mm" text,
 * like the API. An empty string means no time.
 */
@Component({
  selector: 'app-time-field',
  imports: [FormsModule, DatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-datepicker
      [ngModel]="time()"
      (ngModelChange)="valueChange.emit($event ? toTime($event) : '')"
      [timeOnly]="true"
      hourFormat="24"
      [stepMinute]="5"
      placeholder="hh:mm"
      [showClear]="true"
      [ariaLabel]="label()"
      [inputId]="inputId()"
      [disabled]="disabled()"
      appendTo="body"
      [fluid]="true"
    />
  `,
})
export class TimeField {
  /** The time as "HH:mm", or empty. */
  readonly value = input('');
  readonly label = input('Time');
  readonly inputId = input<string | undefined>(undefined);
  readonly disabled = input(false);
  /** The new time as "HH:mm" ("" when cleared). */
  readonly valueChange = output<string>();

  protected readonly toTime = toTime;
  protected readonly time = computed(() => fromTime(this.value()));
}
