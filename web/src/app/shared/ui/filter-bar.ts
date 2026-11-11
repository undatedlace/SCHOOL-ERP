import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { fromIsoDate, toIsoDate } from '../dates';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterField {
  key: string;
  label: string;
  type: 'search' | 'select' | 'date';
  options?: FilterOption[];
  placeholder?: string;
  /** Another field's key. This field is cleared whenever that one changes (a division follows its class). */
  dependsOn?: string;
  disabled?: boolean;
}

export type FilterValues = Record<string, string>;

/**
 * The row of filters above a list: one shared look and one behaviour for every list screen.
 * It emits every value that is set (empty ones are left out) and offers "Clear filters".
 */
@Component({
  selector: 'app-filter-bar',
  imports: [FormsModule, ButtonModule, DatePickerModule, InputTextModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex flex-wrap items-end gap-3" role="search">
      @for (f of fields(); track f.key) {
        <div
          class="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
          [class.w-full]="f.type === 'search'"
          [class.sm:w-72]="f.type === 'search'"
        >
          <span aria-hidden="true">{{ f.label }}</span>
          @switch (f.type) {
            @case ('search') {
              <input
                pInputText
                type="search"
                autocomplete="off"
                [attr.aria-label]="f.label"
                [placeholder]="f.placeholder ?? ''"
                [value]="values()[f.key] ?? ''"
                [fluid]="true"
                (input)="onSearch(f.key, $any($event.target).value)"
              />
            }
            @case ('select') {
              <p-select
                [options]="f.options ?? []"
                optionLabel="label"
                optionValue="value"
                [placeholder]="f.placeholder ?? 'Any'"
                [showClear]="true"
                [disabled]="!!f.disabled"
                [ngModel]="values()[f.key] || null"
                (ngModelChange)="set(f.key, $event ?? '')"
                [ariaLabel]="f.label"
                appendTo="body"
                styleClass="min-w-44"
              />
            }
            @case ('date') {
              <p-datepicker
                [ngModel]="toDate(values()[f.key])"
                (ngModelChange)="set(f.key, $event ? iso($event) : '')"
                dateFormat="dd/mm/yy"
                placeholder="dd/mm/yyyy"
                [showClear]="true"
                [ariaLabel]="f.label"
                appendTo="body"
              />
            }
          }
        </div>
      }
      @if (activeCount() > 0) {
        <p-button
          type="button"
          [label]="'Clear filters (' + activeCount() + ')'"
          severity="secondary"
          [outlined]="true"
          (onClick)="clear()"
        />
      }
    </div>
  `,
})
export class FilterBar {
  readonly fields = input.required<FilterField[]>();
  /** Every filter that is set, by key. Fires once per change (searching waits for a pause in typing). */
  readonly changed = output<FilterValues>();

  protected readonly values = signal<FilterValues>({});
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly activeCount = computed(
    () => Object.values(this.values()).filter((v) => v !== '').length,
  );

  constructor() {
    // A field that depends on another loses its value when the other changes or disappears.
    effect(() => {
      const fields = this.fields();
      untracked(() => {
        const v = this.values();
        const keep = new Set(fields.map((f) => f.key));
        const stale = Object.keys(v).filter((k) => !keep.has(k) && v[k] !== '');
        if (stale.length) {
          const next = { ...v };
          for (const k of stale) delete next[k];
          this.values.set(next);
          this.emit();
        }
      });
    });
  }

  protected readonly iso = toIsoDate;
  protected toDate(value: string | undefined): Date | null {
    return value ? fromIsoDate(value) : null;
  }

  protected onSearch(key: string, value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.set(key, value.trim()), 300);
  }

  protected set(key: string, value: string) {
    const next: FilterValues = { ...this.values(), [key]: value };
    for (const f of this.fields()) {
      if (f.dependsOn === key) next[f.key] = '';
    }
    this.values.set(next);
    this.emit();
  }

  protected clear() {
    clearTimeout(this.timer);
    this.values.set({});
    this.emit();
  }

  private emit() {
    const out: FilterValues = {};
    for (const [k, v] of Object.entries(this.values())) if (v !== '') out[k] = v;
    this.changed.emit(out);
  }
}
