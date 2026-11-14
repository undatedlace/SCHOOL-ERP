import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear } from '../../core/models';
import { DateField } from '../../shared/ui/date-field';
import { ImportsApi } from './imports-api';
import { SingleFees } from './import-models';

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const MODES: { label: string; value: NonNullable<SingleFees['mode']> }[] = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
];

/** "1,25,000.5" or "₹ 900" as "125000.5" / "900": what the API takes. */
const cleanMoney = (s: string) => s.replace(/[₹,\s]/g, '');

/**
 * One student's year of fees kept on paper: what was billed and what had been paid. The same
 * rules as a row of the fees Excel file (it is saved through it), for a single student.
 */
@Component({
  selector: 'app-past-year-fees',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    DateField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      label="Past year's fees"
      size="small"
      severity="secondary"
      [outlined]="true"
      (onClick)="openDialog()"
    />
    <p-dialog
      header="Add a past year's fees"
      [visible]="open()"
      (visibleChange)="!$event && open.set(false)"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <form class="flex flex-col gap-4 text-sm" (ngSubmit)="save()" novalidate>
        <p class="text-muted-foreground">
          For a year kept on paper: the fees billed (after any concession) and what had been paid.
          What is still due is worked out.
        </p>
        <label class="flex flex-col gap-1" for="pyf-year">
          Academic year *
          <p-select
            inputId="pyf-year"
            name="year"
            [options]="years()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="yearId"
            appendTo="body"
            [fluid]="true"
          />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1" for="pyf-billed">
            Billed (₹) *
            <input
              pInputText
              id="pyf-billed"
              name="billed"
              inputmode="decimal"
              [ngModel]="billedText()"
              (ngModelChange)="billedText.set($event)"
            />
          </label>
          <label class="flex flex-col gap-1" for="pyf-paid">
            Paid so far (₹)
            <input
              pInputText
              id="pyf-paid"
              name="paid"
              inputmode="decimal"
              [ngModel]="paidText()"
              (ngModelChange)="paidText.set($event)"
            />
          </label>
        </div>
        @if (dueText()) {
          <p class="font-semibold">{{ dueText() }}</p>
        }
        @if (paidSomething()) {
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1" for="pyf-on">
              Last paid on
              <app-date-field
                inputId="pyf-on"
                label="Last paid on"
                [value]="paidOn()"
                (valueChange)="paidOn.set($event)"
              />
            </label>
            <label class="flex flex-col gap-1" for="pyf-mode">
              Mode
              <p-select
                inputId="pyf-mode"
                name="mode"
                [options]="modes"
                optionLabel="label"
                optionValue="value"
                [(ngModel)]="mode"
                appendTo="body"
                [fluid]="true"
              />
            </label>
          </div>
          <label class="flex flex-col gap-1" for="pyf-ref">
            Reference or old receipt numbers
            <input
              pInputText
              id="pyf-ref"
              name="reference"
              maxlength="100"
              [(ngModel)]="reference"
            />
          </label>
        }
        @if (error()) {
          <p-message severity="error" [text]="error()!" />
        }
        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button type="submit" label="Save" [loading]="busy()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class PastYearFees {
  private readonly api = inject(Api);
  private readonly imports = inject(ImportsApi);

  readonly studentId = input.required<string>();
  readonly saved = output<void>();

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly years = signal<AcademicYear[]>([]);
  protected readonly modes = MODES;

  protected yearId = '';
  protected readonly billedText = signal('');
  protected readonly paidText = signal('');
  protected readonly paidOn = signal('');
  protected mode: NonNullable<SingleFees['mode']> = 'CASH';
  protected reference = '';

  protected readonly paidSomething = computed(() => {
    const p = cleanMoney(this.paidText());
    return MONEY.test(p) && Number(p) > 0;
  });
  /** Shown only as a guide; the server works the real balance out from the ledger. */
  protected readonly dueText = computed(() => {
    const b = cleanMoney(this.billedText());
    const p = cleanMoney(this.paidText()) || '0';
    if (!MONEY.test(b) || !MONEY.test(p)) return '';
    const paise = (s: string) => {
      const [r, d = ''] = s.split('.');
      return Number(r) * 100 + Number(d.padEnd(2, '0'));
    };
    const due = paise(b) - paise(p);
    if (due < 0) return 'Paid is more than billed';
    return `Still due: ₹${(due / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  });

  protected async openDialog() {
    this.error.set(null);
    this.yearId = '';
    this.billedText.set('');
    this.paidText.set('');
    this.paidOn.set('');
    this.mode = 'CASH';
    this.reference = '';
    this.open.set(true);
    if (this.years().length === 0) {
      const years = await firstValueFrom(this.api.years());
      this.years.set(years.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)));
    }
  }

  protected async save() {
    const billed = cleanMoney(this.billedText());
    const paid = cleanMoney(this.paidText());
    if (!this.yearId) return this.error.set('Choose the academic year');
    if (!MONEY.test(billed)) return this.error.set('Write the amount billed in rupees');
    if (paid && !MONEY.test(paid)) return this.error.set('Write the amount paid in rupees');
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.imports.singleFees({
          studentId: this.studentId(),
          academicYearId: this.yearId,
          billed,
          ...(paid ? { paid } : {}),
          ...(this.paidSomething() && this.paidOn() ? { paidOn: this.paidOn() } : {}),
          ...(this.paidSomething() ? { mode: this.mode } : {}),
          ...(this.paidSomething() && this.reference.trim()
            ? { reference: this.reference.trim() }
            : {}),
        }),
      );
      this.open.set(false);
      this.saved.emit();
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
