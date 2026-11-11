import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { fromIsoDate, toIsoDate } from '../dates';

/**
 * A date box (Optimus date picker) that works with plain ISO dates ("2026-11-10") like the rest of the app,
 * so a screen never handles a time zone. An empty string means no date.
 */
@Component({
  selector: 'app-date-field',
  imports: [FormsModule, DatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-datepicker
      [ngModel]="date()"
      (ngModelChange)="valueChange.emit($event ? iso($event) : '')"
      dateFormat="dd/mm/yy"
      placeholder="dd/mm/yyyy"
      [minDate]="minDate()"
      [maxDate]="maxDate()"
      [showClear]="clearable()"
      [ariaLabel]="label()"
      [inputId]="inputId()"
      [disabled]="disabled()"
      appendTo="body"
      [fluid]="true"
    />
  `,
})
export class DateField {
  /** The day, as "YYYY-MM-DD", or empty. */
  readonly value = input('');
  readonly min = input('');
  readonly max = input('');
  readonly label = input('Date');
  readonly inputId = input<string | undefined>(undefined);
  readonly clearable = input(false);
  readonly disabled = input(false);
  /** The new day as "YYYY-MM-DD" ("" when cleared). */
  readonly valueChange = output<string>();

  protected readonly iso = toIsoDate;
  protected readonly date = computed(() => (this.value() ? fromIsoDate(this.value()) : null));
  protected readonly minDate = computed(() => (this.min() ? fromIsoDate(this.min()) : null));
  protected readonly maxDate = computed(() => (this.max() ? fromIsoDate(this.max()) : null));
}
