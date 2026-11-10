import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Collection, PaymentMode, PaymentRow } from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { inr } from '../../shared/money';
import { PageHeader } from '../../shared/ui/page-header';

export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};
const MODE_OPTIONS = (Object.keys(MODE_LABEL) as PaymentMode[])
  .filter((m) => m !== 'ONLINE')
  .map((value) => ({ value, label: MODE_LABEL[value] }));

/** Money received between two dates (today by default): totals by mode and every receipt. */
@Component({
  selector: 'app-collection-page',
  imports: [
    FormsModule,
    RouterLink,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Fee collection"
      subtitle="Money received between two dates. Payments that were reversed are shown but not counted."
    />

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>From</span>
        <input
          type="date"
          class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          [max]="today"
          [ngModel]="from()"
          (ngModelChange)="onDate('from', $event)"
          aria-label="From"
        />
      </div>
      <div class="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>To</span>
        <input
          type="date"
          class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          [max]="today"
          [ngModel]="to()"
          (ngModelChange)="onDate('to', $event)"
          aria-label="To"
        />
      </div>
      <p-select
        [options]="modes"
        optionLabel="label"
        optionValue="value"
        placeholder="Any payment mode"
        [showClear]="true"
        [ngModel]="mode()"
        (ngModelChange)="onMode($event)"
        aria-label="Payment mode"
        class="w-48"
      />
      <input
        pInputText
        placeholder="Search by name or admission number"
        class="w-72"
        aria-label="Search"
        [ngModel]="search()"
        (ngModelChange)="onSearch($event)"
      />
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else {
      @if (collection(); as c) {
        <dl class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div class="rounded-md bg-muted p-3">
            <dt class="text-xs text-muted-foreground">Collected</dt>
            <dd class="text-lg font-semibold">{{ money(c.total) }}</dd>
          </div>
          @for (m of c.byMode; track m.mode) {
            <div class="rounded-md border p-3">
              <dt class="text-xs text-muted-foreground">{{ modeText(m.mode) }} ({{ m.count }})</dt>
              <dd class="text-lg font-semibold">{{ money(m.total) }}</dd>
            </div>
          }
        </dl>
      }

      <p-table
        [value]="payments()"
        [lazy]="true"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [first]="(page() - 1) * pageSize"
        (onLazyLoad)="onPage($event)"
        [loading]="loading()"
      >
        <ng-template #header>
          <tr>
            <th>Receipt</th>
            <th>Date</th>
            <th>Student</th>
            <th>Mode</th>
            <th class="text-right">Amount</th>
            <th><span class="sr-only">Receipt</span></th>
          </tr>
        </ng-template>
        <ng-template #body let-p>
          <tr [class.text-muted-foreground]="p.reversed">
            <td class="font-medium">
              {{ p.receiptNo }}
              @if (p.reversed) {
                <span class="block text-xs">Reversed</span>
              }
            </td>
            <td>{{ date(p.paidOn) }}</td>
            <td>
              <a class="app-link" [routerLink]="['/app/students', p.studentId]">{{
                p.studentName
              }}</a>
              <div class="text-xs text-muted-foreground">Admission no. {{ p.admissionNo }}</div>
            </td>
            <td>
              {{ modeText(p.mode) }}
              @if (p.reference) {
                <span class="block text-xs text-muted-foreground">{{ p.reference }}</span>
              }
            </td>
            <td class="text-right font-medium" [class.line-through]="p.reversed">
              {{ money(p.amount) }}
            </td>
            <td class="text-right">
              <a
                class="text-sm app-link"
                [href]="'/api/payments/' + p.id + '/receipt'"
                target="_blank"
                rel="noopener"
                >Receipt</a
              >
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6" class="p-4 text-center text-muted-foreground">
              No payments in this period.
            </td>
          </tr>
        </ng-template>
      </p-table>
    }
  `,
})
export class CollectionPage {
  private readonly api = inject(Api);

  protected readonly today = toIsoDate(new Date());
  protected readonly modes = MODE_OPTIONS;
  protected readonly modeText = (m: PaymentMode) => MODE_LABEL[m] ?? m;
  protected readonly money = inr;
  protected readonly date = formatDate;
  protected readonly pageSize = 20;

  protected readonly from = signal(this.today);
  protected readonly to = signal(this.today);
  protected readonly mode = signal<PaymentMode | null>(null);
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly payments = signal<PaymentRow[]>([]);
  protected readonly total = signal(0);
  protected readonly collection = signal<Collection | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.load();
  }

  protected onDate(which: 'from' | 'to', value: string) {
    if (!value) return;
    (which === 'from' ? this.from : this.to).set(value);
    // Keep the range the right way round.
    if (this.from() > this.to()) (which === 'from' ? this.to : this.from).set(value);
    this.page.set(1);
    void this.load();
  }
  protected onMode(mode: PaymentMode | null) {
    this.mode.set(mode);
    this.page.set(1);
    void this.load();
  }
  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 300);
  }
  protected onPage(event: { first?: number | null }) {
    const page = Math.floor((event.first ?? 0) / this.pageSize) + 1;
    if (page === this.page()) return;
    this.page.set(page);
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [list, collection] = await Promise.all([
        firstValueFrom(
          this.api.payments({
            page: this.page(),
            pageSize: this.pageSize,
            from: this.from(),
            to: this.to(),
            mode: this.mode(),
            search: this.search().trim() || undefined,
          }),
        ),
        firstValueFrom(this.api.collection(this.from(), this.to())),
      ]);
      this.payments.set(list.items);
      this.total.set(list.total);
      this.collection.set(collection);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
