import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import {
  AcademicYear,
  LedgerInvoice,
  LedgerPayment,
  PaymentMode,
  StudentLedger,
} from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { PastYearFees } from '../imports/past-year-fees';
import { inr, isMoney } from '../../shared/money';
import { FormField } from '../../shared/ui/form-field';
import { Badge } from '../../shared/ui/badge';
import { StatTile } from '../../shared/ui/stat-tile';
import { fromPaise, percentText, share, statement, toPaise } from '../fees/fee-view';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { FormsModule } from '@angular/forms';

const MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
];
const modeLabel = (m: PaymentMode) => MODES.find((x) => x.value === m)?.label ?? m;
const REFERENCE_LABEL: Record<string, string> = {
  CHEQUE: 'Cheque number',
  UPI: 'UPI reference',
  BANK_TRANSFER: 'Transaction reference',
};

const moneyValidator = (c: { value: string }) =>
  isMoney(String(c.value ?? '').trim()) ? null : { money: 'Enter an amount like 1500 or 1500.50' };

/** A student's fees: what is owed and when, what was paid, and the tools to record a payment. */
@Component({
  selector: 'app-student-fees',
  imports: [
    PastYearFees,
    Badge,
    StatTile,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    FormField,
    HasPermission,
    SelectButtonModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl bg-card p-5 shadow-sm" *appHasPermission="'fees.read'">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-bold">Fees</h2>
        <div class="flex flex-wrap gap-2">
          <p-button
            *appHasPermission="'fees.structure.manage'"
            label="Previous dues"
            size="small"
            severity="secondary"
            [outlined]="true"
            (onClick)="openDues()"
          />
          <ng-container *appHasPermission="'fees.structure.manage'">
            <app-past-year-fees
              *appHasPermission="'fees.payment.create'"
              [studentId]="studentId()"
              (saved)="reloadLedger()"
            />
          </ng-container>
          <p-button
            *appHasPermission="'fees.reminder.send'"
            label="Remind class teacher"
            size="small"
            severity="secondary"
            [outlined]="true"
            [disabled]="!ledger() || ledger()!.totals.pending === '0.00'"
            [loading]="reminding()"
            (onClick)="remind()"
          />
          <p-button
            *appHasPermission="'fees.payment.create'"
            label="Record payment"
            size="small"
            [disabled]="!ledger() || ledger()!.totals.pending === '0.00'"
            (onClick)="openPay()"
          />
        </div>
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      } @else if (ledger(); as l) {
        <div class="mb-5 grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <app-stat-tile [compact]="true" label="Billed" [value]="money(l.totals.gross)" />
          <app-stat-tile
            [compact]="true"
            label="Concessions"
            [value]="money(l.totals.concessions)"
          />
          <app-stat-tile
            [compact]="true"
            label="Paid"
            [value]="money(l.totals.paid)"
            [progress]="paidShare()"
            [hint]="percent(paidShare()) + ' of what is due'"
          />
          <app-stat-tile
            [compact]="true"
            label="Still to pay"
            [value]="money(l.totals.pending)"
            [hint]="l.totals.pending === '0.00' ? 'Nothing owed' : nextDueText()"
          />
        </div>

        @if (l.invoices.length) {
          <p-selectbutton
            class="mb-4 block"
            [options]="views"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="view()"
            (ngModelChange)="view.set($event)"
            [ngModelOptions]="{ standalone: true }"
            aria-label="Show fees by instalment or as a statement"
          />
        }

        @if (view() === 'statement' && l.invoices.length) {
          <div class="overflow-x-auto rounded-lg border">
            <table class="w-full min-w-[36rem] text-sm">
              <thead class="bg-muted text-left">
                <tr class="app-eyebrow">
                  <th class="p-2.5 pl-3 font-semibold">Date</th>
                  <th class="p-2.5 font-semibold">Description</th>
                  <th class="p-2.5 text-right font-semibold">Charge</th>
                  <th class="p-2.5 text-right font-semibold">Paid or reduced</th>
                  <th class="p-2.5 pr-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of statementRows(); track $index) {
                  <tr class="border-t">
                    <td class="p-2.5 pl-3 whitespace-nowrap">{{ date(row.date) }}</td>
                    <td class="p-2.5">
                      {{ row.description }}
                      @if (row.detail) {
                        <span class="block text-xs text-muted-foreground">{{ row.detail }}</span>
                      }
                    </td>
                    <td class="p-2.5 text-right whitespace-nowrap">
                      {{ row.charge ? money(row.charge) : '' }}
                    </td>
                    <td class="p-2.5 text-right whitespace-nowrap text-good">
                      {{ row.credit ? money(row.credit) : '' }}
                    </td>
                    <td class="p-2.5 pr-3 text-right font-semibold whitespace-nowrap">
                      {{ money(row.balance) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          @for (inv of l.invoices; track inv.id) {
            <div class="mb-5 rounded-md border">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div>
                  <span class="font-medium">{{ invoiceTitle(inv) }}</span>
                  @if (inv.note) {
                    <span class="ml-2 text-sm text-muted-foreground">{{ inv.note }}</span>
                  }
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-muted-foreground">Still to pay</span>
                  <span class="font-semibold">{{ money(inv.pending) }}</span>
                  <p-button
                    *appHasPermission="'fees.concession.manage'"
                    label="Concession"
                    size="small"
                    [text]="true"
                    (onClick)="openConcession(inv)"
                  />
                </div>
              </div>
              <table class="block w-full overflow-x-auto text-sm">
                <thead class="text-left text-xs text-muted-foreground">
                  <tr>
                    <th class="p-2 pl-3">Instalment</th>
                    <th class="p-2">Due on</th>
                    <th class="p-2 text-right">Amount</th>
                    <th class="p-2 text-right">Paid</th>
                    <th class="p-2 pr-3 text-right">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  @for (i of inv.instalments; track i.seq) {
                    <tr class="border-t">
                      <td class="p-2 pl-3">{{ i.label }}</td>
                      <td class="p-2">
                        {{ date(i.dueDate) }}
                        @if (i.overdue) {
                          <app-badge class="ml-1" label="Overdue" tone="bad" />
                        }
                      </td>
                      <td class="p-2 text-right">{{ money(i.due) }}</td>
                      <td class="p-2 text-right">{{ money(i.paid) }}</td>
                      <td class="p-2 pr-3 text-right font-medium">{{ money(i.pending) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="border-t p-3 text-xs text-muted-foreground">
                @for (line of inv.lines; track $index) {
                  <span class="mr-3">{{ line.description }} {{ money(line.amount) }}</span>
                }
              </div>
              @for (c of inv.concessions; track c.id) {
                <div class="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
                  <span [class.line-through]="c.revoked">
                    Concession {{ money(c.amount) }}: {{ c.reason }}
                  </span>
                  @if (c.revoked) {
                    <span class="text-xs text-muted-foreground"
                      >Taken back: {{ c.revokedReason }}</span
                    >
                  } @else {
                    <p-button
                      *appHasPermission="'fees.concession.manage'"
                      label="Take back"
                      size="small"
                      severity="danger"
                      [text]="true"
                      (onClick)="askRevoke(c.id)"
                    />
                  }
                </div>
              }
            </div>
          } @empty {
            <p class="mb-5 text-sm text-muted-foreground">
              No fees have been billed to this student yet.
              <ng-container *appHasPermission="'fees.structure.manage'">
                <p-button
                  label="Bill this year's fees"
                  size="small"
                  severity="secondary"
                  [loading]="busy()"
                  (onClick)="generate()"
                />
              </ng-container>
            </p>
          }

          <h3 class="mb-2 text-sm font-semibold">Payments</h3>
          @for (p of l.payments; track p.id) {
            <div
              class="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0"
            >
              <div [class.opacity-60]="!!p.reversed">
                <span class="font-medium" [class.line-through]="!!p.reversed">{{
                  money(p.amount)
                }}</span>
                <span class="ml-2">{{ p.receiptNo }}</span>
                <div class="text-xs text-muted-foreground">
                  {{ date(p.paidOn) }} &middot; {{ mode(p.mode)
                  }}{{ p.reference ? ' ' + p.reference : '' }}
                  @if (p.reversed) {
                    &middot; Reversed: {{ p.reversed.reason }}
                  }
                </div>
              </div>
              <div class="flex gap-1">
                <a
                  class="inline-flex h-8 items-center rounded-md px-3 text-sm hover:bg-muted"
                  [href]="'/api/payments/' + p.id + '/receipt'"
                  target="_blank"
                  rel="noopener"
                  >Receipt</a
                >
                @if (!p.reversed) {
                  <p-button
                    *appHasPermission="'fees.payment.reverse'"
                    label="Reverse"
                    size="small"
                    severity="danger"
                    [text]="true"
                    (onClick)="askReverse(p)"
                  />
                }
              </div>
            </div>
          } @empty {
            <p class="text-sm text-muted-foreground">No payments yet.</p>
          }
        }
      } @else {
        <p class="text-sm text-muted-foreground">Loading...</p>
      }

      <p-dialog
        header="Record payment"
        [(visible)]="payOpen"
        [modal]="true"
        [style]="{ width: '28rem', 'max-width': '95vw' }"
      >
        <form [formGroup]="payForm" (ngSubmit)="submitPay()" class="flex flex-col gap-4" novalidate>
          @if (ledger(); as l) {
            <p class="text-sm text-muted-foreground">
              Still to pay: <strong>{{ money(l.totals.pending) }}</strong
              >. The oldest dues are paid first.
            </p>
          }
          <app-form-field
            label="Amount received"
            for="pay_amount"
            [required]="true"
            [control]="payForm.controls.amount"
          >
            <input
              pInputText
              id="pay_amount"
              formControlName="amount"
              inputmode="decimal"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="Paid by" for="pay_mode">
            <p-select
              inputId="pay_mode"
              formControlName="mode"
              [options]="modes"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          @if (referenceLabel()) {
            <app-form-field
              [label]="referenceLabel()!"
              for="pay_ref"
              [required]="true"
              [control]="payForm.controls.reference"
            >
              <input pInputText id="pay_ref" formControlName="reference" [fluid]="true" />
            </app-form-field>
          }
          <app-form-field label="Date" for="pay_date">
            <p-datepicker
              inputId="pay_date"
              formControlName="paidOn"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [maxDate]="today"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="Note" for="pay_note" hint="Optional">
            <input pInputText id="pay_note" formControlName="note" [fluid]="true" />
          </app-form-field>
          @if (formError()) {
            <p-message severity="error" [text]="formError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="payOpen.set(false)"
            />
            <p-button type="submit" label="Save payment" [loading]="busy()" />
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [header]="amountDialog()?.title ?? ''"
        [visible]="!!amountDialog()"
        (visibleChange)="!$event && amountDialog.set(null)"
        [modal]="true"
        [style]="{ width: '28rem', 'max-width': '95vw' }"
      >
        <form
          [formGroup]="amountForm"
          (ngSubmit)="submitAmount()"
          class="flex flex-col gap-4"
          novalidate
        >
          <app-form-field
            label="Amount"
            for="am_amount"
            [required]="true"
            [control]="amountForm.controls.amount"
          >
            <input
              pInputText
              id="am_amount"
              formControlName="amount"
              inputmode="decimal"
              [fluid]="true"
            />
          </app-form-field>
          @if (amountDialog()?.kind === 'dues') {
            <app-form-field label="For the year" for="am_year" [required]="true">
              <p-select
                inputId="am_year"
                formControlName="yearId"
                [options]="years()"
                optionLabel="name"
                optionValue="id"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
            <app-form-field label="Due on" for="am_due" [required]="true">
              <p-datepicker
                inputId="am_due"
                formControlName="dueDate"
                dateFormat="dd/mm/yy"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
          }
          <app-form-field
            [label]="amountDialog()?.kind === 'dues' ? 'Note' : 'Reason'"
            for="am_reason"
            [required]="amountDialog()?.kind !== 'dues'"
            [control]="amountForm.controls.reason"
          >
            <input pInputText id="am_reason" formControlName="reason" [fluid]="true" />
          </app-form-field>
          @if (formError()) {
            <p-message severity="error" [text]="formError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="amountDialog.set(null)"
            />
            <p-button type="submit" label="Save" [loading]="busy()" />
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [header]="reasonDialog()?.title ?? ''"
        [visible]="!!reasonDialog()"
        (visibleChange)="!$event && reasonDialog.set(null)"
        [modal]="true"
        [style]="{ width: '26rem', 'max-width': '95vw' }"
      >
        <form
          [formGroup]="reasonForm"
          (ngSubmit)="submitReason()"
          class="flex flex-col gap-4"
          novalidate
        >
          <app-form-field
            label="Reason"
            for="rs_reason"
            [required]="true"
            [control]="reasonForm.controls.reason"
            hint="This is kept in the record."
          >
            <input pInputText id="rs_reason" formControlName="reason" [fluid]="true" />
          </app-form-field>
          @if (formError()) {
            <p-message severity="error" [text]="formError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="reasonDialog.set(null)"
            />
            <p-button
              type="submit"
              [label]="reasonDialog()?.action ?? 'Save'"
              severity="danger"
              [loading]="busy()"
            />
          </div>
        </form>
      </p-dialog>
    </section>
  `,
})
export class StudentFees {
  readonly studentId = input.required<string>();
  /** Open the payment form as soon as the fees have loaded (arriving from Fee dues). */
  readonly openPayment = input(false);
  private paymentOffered = false;
  private readonly canPay = inject(AuthService).has('fees.payment.create');

  protected readonly views = [
    { label: 'By instalment', value: 'instalments' as const },
    { label: 'Statement', value: 'statement' as const },
  ];
  protected readonly view = signal<'instalments' | 'statement'>('instalments');

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  protected readonly money = inr;
  protected readonly date = formatDate;
  protected readonly mode = modeLabel;
  protected readonly modes = MODES;
  protected readonly today = new Date();

  protected readonly ledger = signal<StudentLedger | null>(null);
  protected readonly statementRows = computed(() => {
    const l = this.ledger();
    return l ? statement(l) : [];
  });
  /** Paid as a share of what is due after concessions. */
  protected readonly paidShare = computed(() => {
    const t = this.ledger()?.totals;
    if (!t) return 0;
    return share(t.paid, fromPaise(toPaise(t.gross) - toPaise(t.concessions)));
  });
  protected readonly nextDueText = computed(() => {
    const next = this.ledger()
      ?.invoices.flatMap((i) => i.instalments)
      .filter((i) => i.pending !== '0.00')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (!next) return '';
    return (next.overdue ? 'Overdue since ' : 'Next due ') + formatDate(next.dueDate);
  });
  protected readonly percent = percentText;
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly years = signal<AcademicYear[]>([]);

  protected readonly payOpen = signal(false);
  protected readonly payForm = this.fb.nonNullable.group({
    amount: ['', moneyValidator],
    mode: ['CASH' as PaymentMode],
    reference: [''],
    paidOn: [new Date() as Date | null],
    note: [''],
  });
  protected readonly referenceLabel = signal<string | null>(null);

  protected readonly amountDialog = signal<{
    kind: 'concession' | 'dues';
    title: string;
    invoiceId?: string;
  } | null>(null);
  protected readonly amountForm = this.fb.nonNullable.group({
    amount: ['', moneyValidator],
    reason: [''],
    yearId: [''],
    dueDate: [null as Date | null],
  });

  protected readonly reasonDialog = signal<{
    title: string;
    action: string;
    run: (reason: string) => Promise<void>;
  } | null>(null);
  protected readonly reasonForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
  });

  constructor() {
    effect(() => {
      void this.load(this.studentId());
    });
    this.payForm.controls.mode.valueChanges.subscribe((m) => {
      const label = REFERENCE_LABEL[m] ?? null;
      this.referenceLabel.set(label);
      this.payForm.controls.reference.setValidators(
        label ? [Validators.required, Validators.maxLength(60)] : [],
      );
      this.payForm.controls.reference.updateValueAndValidity();
    });
  }

  protected readonly reminding = signal(false);

  /** Tells the student's class teacher in the app that fees are pending. */
  protected async remind() {
    if (this.reminding()) return;
    this.reminding.set(true);
    try {
      const res = await firstValueFrom(this.api.remindClassTeacher(this.studentId()));
      this.toast.add({
        severity: 'success',
        summary: `${res.notified} has been told`,
        detail: `Class teacher of ${res.class}`,
      });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not send', detail: apiError(error) });
    } finally {
      this.reminding.set(false);
    }
  }

  protected invoiceTitle(inv: LedgerInvoice) {
    return inv.kind === 'OPENING_BALANCE'
      ? `Previous dues (${inv.academicYear.name})`
      : `Fees ${inv.academicYear.name}`;
  }

  /** After a past year's fees were added. */
  protected reloadLedger() {
    void this.load(this.studentId());
  }

  private async load(id: string) {
    this.error.set(null);
    try {
      const ledger = await firstValueFrom(this.api.studentFees(id));
      this.ledger.set(ledger);
      if (
        this.openPayment() &&
        !this.paymentOffered &&
        this.canPay &&
        ledger.totals.pending !== '0.00'
      ) {
        this.paymentOffered = true;
        this.openPay();
      }
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  // ---------- record a payment ----------

  protected openPay() {
    this.formError.set(null);
    this.payForm.reset({ amount: '', mode: 'CASH', reference: '', paidOn: new Date(), note: '' });
    this.referenceLabel.set(null);
    this.payOpen.set(true);
  }

  protected async submitPay() {
    this.payForm.markAllAsTouched();
    if (this.payForm.invalid || this.busy()) return;
    const v = this.payForm.getRawValue();
    this.busy.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(
        this.api.recordPayment(this.studentId(), {
          amount: v.amount.trim(),
          mode: v.mode,
          reference: v.reference.trim() || undefined,
          paidOn: v.paidOn ? toIsoDate(v.paidOn) : undefined,
          note: v.note.trim() || undefined,
        }),
      );
      this.payOpen.set(false);
      await this.load(this.studentId());
      this.toast.add({ severity: 'success', summary: 'Payment recorded' });
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- concession and previous dues ----------

  protected openConcession(inv: LedgerInvoice) {
    this.formError.set(null);
    this.amountForm.reset({ amount: '', reason: '', yearId: '', dueDate: null });
    this.amountForm.controls.reason.setValidators([
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(200),
    ]);
    this.amountDialog.set({ kind: 'concession', title: 'Give a concession', invoiceId: inv.id });
  }

  protected async openDues() {
    this.formError.set(null);
    this.amountForm.reset({ amount: '', reason: '', yearId: '', dueDate: null });
    this.amountForm.controls.reason.setValidators([Validators.maxLength(200)]);
    this.amountDialog.set({ kind: 'dues', title: 'Add previous dues' });
    if (this.years().length === 0) this.years.set(await firstValueFrom(this.api.years()));
  }

  protected async submitAmount() {
    const dialog = this.amountDialog();
    this.amountForm.markAllAsTouched();
    if (!dialog || this.amountForm.invalid || this.busy()) return;
    const v = this.amountForm.getRawValue();
    if (dialog.kind === 'dues' && (!v.yearId || !v.dueDate)) {
      this.formError.set('Choose the year and the date the dues were due');
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      if (dialog.kind === 'concession') {
        await firstValueFrom(
          this.api.addConcession(dialog.invoiceId!, {
            amount: v.amount.trim(),
            reason: v.reason.trim(),
          }),
        );
      } else {
        await firstValueFrom(
          this.api.addOpeningBalance({
            studentId: this.studentId(),
            academicYearId: v.yearId,
            amount: v.amount.trim(),
            dueDate: toIsoDate(v.dueDate!),
            note: v.reason.trim() || undefined,
          }),
        );
      }
      this.amountDialog.set(null);
      await this.load(this.studentId());
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- things that need a reason ----------

  protected askReason(title: string, action: string, run: (reason: string) => Promise<void>) {
    this.formError.set(null);
    this.reasonForm.reset({ reason: '' });
    this.reasonDialog.set({ title, action, run });
  }

  protected async submitReason() {
    const dialog = this.reasonDialog();
    this.reasonForm.markAllAsTouched();
    if (!dialog || this.reasonForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.formError.set(null);
    try {
      await dialog.run(this.reasonForm.getRawValue().reason.trim());
      this.reasonDialog.set(null);
      await this.load(this.studentId());
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected askReverse(p: LedgerPayment) {
    this.askReason('Reverse this payment', 'Reverse', async (reason) => {
      await firstValueFrom(this.api.reversePayment(p.id, reason));
    });
  }

  protected askRevoke(concessionId: string) {
    this.askReason('Take back this concession', 'Take back', async (reason) => {
      await firstValueFrom(this.api.revokeConcession(concessionId, reason));
    });
  }

  protected async generate() {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.generateInvoices({ studentIds: [this.studentId()] }));
      if (r.noStructure.length) {
        this.toast.add({
          severity: 'warn',
          summary: 'No fee structure',
          detail: 'Set up the fees for this class first (Fees > Setup).',
        });
      }
      await this.load(this.studentId());
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not bill', detail: apiError(error) });
    } finally {
      this.busy.set(false);
    }
  }
}
