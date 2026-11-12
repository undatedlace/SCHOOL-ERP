import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Collection, Gender, PaymentMode, PaymentRow } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { inr } from '../../shared/money';
import { DateField } from '../../shared/ui/date-field';
import { PageHeader } from '../../shared/ui/page-header';
import { Avatar } from '../../shared/ui/avatar';
import { Badge } from '../../shared/ui/badge';
import { StatTile } from '../../shared/ui/stat-tile';
import { FilterCard, FilterCards } from '../../shared/ui/filter-cards';
import {
  GENDER_GROUP,
  genderGroups,
  GenderChoice,
  MODE_LABEL,
  fromPaise,
  percentText,
  share,
  toPaise,
  todayInIndia,
} from './fee-view';
import { ButtonModule } from '@openng/optimus-ui/button';

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as PaymentMode[])
  .filter((m) => m !== 'ONLINE')
  .map((value) => ({ value, label: MODE_LABEL[value] }));

/** Money received between two dates (today by default): totals by mode and every receipt. */
@Component({
  selector: 'app-collection-page',
  imports: [
    Avatar,
    Badge,
    StatTile,
    FilterCards,
    DateField,
    FormsModule,
    RouterLink,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    PageHeader,
    ButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Fee collection"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Fee collection' }]"
      subtitle="Money received between two dates. Reversed payments are listed, struck through and not counted."
    />

    <section
      class="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-card p-5 shadow-sm"
      aria-label="Filters"
    >
      <div class="flex flex-col gap-1">
        <span class="app-eyebrow" aria-hidden="true">From</span>
        <app-date-field
          label="From"
          [max]="today"
          [value]="from()"
          (valueChange)="onDate('from', $event)"
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="app-eyebrow" aria-hidden="true">To</span>
        <app-date-field
          label="To"
          [max]="today"
          [value]="to()"
          (valueChange)="onDate('to', $event)"
        />
      </div>
      <div class="flex gap-2" role="group" aria-label="Quick range">
        <p-button label="Today" severity="secondary" [outlined]="true" (onClick)="range('today')" />
        <p-button
          label="This month"
          severity="secondary"
          [outlined]="true"
          (onClick)="range('month')"
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="app-eyebrow" aria-hidden="true">Payment mode</span>
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
      </div>
      <div class="flex flex-1 flex-col gap-1">
        <span class="app-eyebrow" aria-hidden="true">Search</span>
        <input
          pInputText
          placeholder="Name or admission number"
          class="w-full min-w-56"
          aria-label="Search"
          [ngModel]="search()"
          (ngModelChange)="onSearch($event)"
        />
      </div>
    </section>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else {
      @if (genderCards().length > 1) {
        <app-filter-cards
          class="mb-6"
          label="Show money received from everyone, boys or girls"
          [cards]="genderCards()"
          [value]="gender()"
          (changed)="onGender($any($event))"
        />
      }
      @if (collection(); as c) {
        <section aria-label="Totals" class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <app-stat-tile
            [label]="gender() === 'ALL' ? 'Collected' : 'Collected, ' + groupName(gender())"
            icon="wallet"
            tone="good"
            [value]="money(c.total)"
            [hint]="receipts(c) + (receipts(c) === 1 ? ' receipt' : ' receipts')"
          />
          @for (m of c.byMode; track m.mode) {
            <app-stat-tile
              [compact]="true"
              [label]="modeText(m.mode)"
              [value]="money(m.total)"
              [progress]="shareOf(m.total, c.total)"
              [hint]="
                m.count +
                (m.count === 1 ? ' payment' : ' payments') +
                ' · ' +
                pct(shareOf(m.total, c.total))
              "
            />
          }
        </section>
      }

      <section class="overflow-hidden rounded-xl bg-card shadow-sm" aria-label="Receipts">
        <p-table
          [value]="payments()"
          [lazy]="true"
          [paginator]="true"
          [rows]="pageSize"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
          [totalRecords]="total()"
          [first]="(page() - 1) * pageSize"
          (onLazyLoad)="onPage($event)"
          [loading]="loading()"
          [tableStyle]="{ 'min-width': '46rem' }"
        >
          <ng-template #header>
            <tr>
              <th class="!pl-5">Receipt</th>
              <th>Date</th>
              <th>Student</th>
              <th>Mode</th>
              <th class="text-right">Amount</th>
              <th class="!pr-5"><span class="sr-only">Download</span></th>
            </tr>
          </ng-template>
          <ng-template #body let-p>
            <tr [class.text-muted-foreground]="p.reversed">
              <td class="!pl-5 font-semibold whitespace-nowrap">
                {{ p.receiptNo }}
                @if (p.reversed) {
                  <app-badge class="mt-1 block" label="Reversed" tone="bad" />
                }
              </td>
              <td class="whitespace-nowrap">{{ date(p.paidOn) }}</td>
              <td>
                <div class="flex items-center gap-3">
                  <app-avatar [name]="p.studentName" size="sm" />
                  <div class="min-w-0 leading-tight">
                    <a
                      class="font-semibold app-link"
                      [routerLink]="['/app/students', p.studentId]"
                      >{{ p.studentName }}</a
                    >
                    <p class="mt-1 text-xs text-muted-foreground">ID {{ p.admissionNo }}</p>
                  </div>
                </div>
              </td>
              <td>
                <app-badge [label]="modeText(p.mode)" tone="primary" [dot]="false" />
                @if (p.reference) {
                  <span class="mt-1 block text-xs text-muted-foreground">{{ p.reference }}</span>
                }
              </td>
              <td
                class="text-right font-semibold whitespace-nowrap"
                [class.line-through]="p.reversed"
              >
                {{ money(p.amount) }}
              </td>
              <td class="!pr-5 text-right">
                <a
                  class="text-sm app-link"
                  [href]="'/api/payments/' + p.id + '/receipt'"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-label]="'Download receipt ' + p.receiptNo"
                  >Receipt</a
                >
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="6" class="p-8 text-center text-muted-foreground">
                No payments in this period.
              </td>
            </tr>
          </ng-template>
        </p-table>
      </section>
    }
  `,
})
export class CollectionPage {
  private readonly api = inject(Api);

  protected readonly today = todayInIndia();
  protected readonly shareOf = share;
  protected readonly pct = percentText;
  protected readonly receipts = (c: Collection) => c.byMode.reduce((a, m) => a + m.count, 0);
  protected readonly modes = MODE_OPTIONS;
  protected readonly modeText = (m: PaymentMode) => MODE_LABEL[m] ?? m;
  protected readonly money = inr;
  protected readonly date = formatDate;
  protected readonly pageSize = 20;

  protected readonly from = signal(this.today);
  protected readonly to = signal(this.today);
  protected readonly mode = signal<PaymentMode | null>(null);
  protected readonly gender = signal<GenderChoice>('ALL');
  protected readonly groupName = (g: GenderChoice) =>
    g === 'ALL' ? 'everyone' : GENDER_GROUP[g].toLowerCase();
  /** Everyone, boys, girls: what came in from each, also a filter. */
  protected readonly genderCards = computed<FilterCard[]>(() => {
    const c = this.collection();
    if (!c) return [];
    const groups = genderGroups(c.byGender, (gender) => ({
      gender,
      total: '0.00',
      count: 0,
      students: 0,
    }));
    const card = (
      value: string,
      label: string,
      total: string,
      count: number,
      students: number,
    ): FilterCard => ({
      value,
      label,
      amount: inr(total),
      hint: `${students} ${students === 1 ? 'student' : 'students'} · ${count} ${count === 1 ? 'payment' : 'payments'}`,
    });
    return [
      card(
        'ALL',
        'Everyone',
        fromPaise(groups.reduce((a, g) => a + toPaise(g.total), 0)),
        groups.reduce((a, g) => a + g.count, 0),
        groups.reduce((a, g) => a + g.students, 0),
      ),
      ...groups.map((g) => card(g.gender, GENDER_GROUP[g.gender], g.total, g.count, g.students)),
    ];
  });
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
  /** Today only, or from the 1st of this month to today. */
  protected range(which: 'today' | 'month') {
    this.from.set(which === 'today' ? this.today : this.today.slice(0, 8) + '01');
    this.to.set(this.today);
    this.page.set(1);
    void this.load();
  }
  protected onGender(value: GenderChoice) {
    this.gender.set(value);
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

  private genderFilter(): Gender | null {
    const g = this.gender();
    return g === 'ALL' ? null : g;
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
            gender: this.genderFilter(),
          }),
        ),
        firstValueFrom(this.api.collection(this.from(), this.to(), this.genderFilter())),
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
