import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { AutoCompleteModule } from '@openng/optimus-ui/autocomplete';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import {
  Collection,
  DuesReport,
  DuesStatus,
  DuesStudent,
  Gender,
  SchoolClass,
  StudentListItem,
} from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { inr } from '../../shared/money';
import { Avatar } from '../../shared/ui/avatar';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { FeesImport } from '../imports/import-launchers';
import { StatTile } from '../../shared/ui/stat-tile';
import { FilterCard, FilterCards } from '../../shared/ui/filter-cards';
import {
  DUES_STATUS,
  DUES_TABS,
  GENDER_GROUP,
  genderGroups,
  GenderChoice,
  fromPaise,
  toPaise,
  MODE_LABEL,
  daysBetween,
  lateText,
  percentText,
  share,
  todayInIndia,
} from './fee-view';

/** The four owing states, in the order the breakdown bar draws them. */
const BREAKDOWN: { status: DuesStatus; bar: string }[] = [
  { status: 'PAID', bar: 'bg-good-fill' },
  { status: 'PARTIAL', bar: 'bg-amber' },
  { status: 'UNPAID', bar: 'bg-border-strong' },
  { status: 'OVERDUE', bar: 'bg-bad-fill' },
];

@Component({
  selector: 'app-dues-page',
  imports: [
    FormsModule,
    RouterLink,
    AutoCompleteModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    HasPermission,
    PageHeader,
    StatTile,
    FilterCards,
    Avatar,
    Badge,
    Icon,
    FeesImport,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Fee dues"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Fee dues' }]"
      subtitle="Who owes what this year. Dues carried from earlier years are included."
    >
      <ng-container *appHasPermission="'fees.structure.manage'">
        <app-fees-import *appHasPermission="'fees.payment.create'" (imported)="reloadAll()" />
      </ng-container>
      <p-button
        *appHasPermission="'fees.payment.create'"
        label="Record payment"
        (onClick)="openPicker()"
      />
    </app-page-header>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (report(); as r) {
      <section aria-label="Totals" class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <app-stat-tile
          label="Billed"
          icon="file"
          tone="neutral"
          [value]="money(r.totals.billed)"
          [hint]="r.totals.students + ' students this year'"
        />
        <app-stat-tile
          label="Collected"
          icon="check"
          tone="good"
          [value]="money(r.totals.collected)"
          [progress]="collectedShare()"
          [hint]="percent(collectedShare()) + ' of what was billed'"
        />
        <app-stat-tile
          label="Still to collect"
          icon="clock"
          tone="amber"
          [value]="money(r.totals.pending)"
          [hint]="r.counts.PARTIAL + r.counts.OVERDUE + r.counts.UNPAID + ' students owe something'"
        />
        <app-stat-tile
          label="Overdue"
          icon="bell"
          tone="bad"
          [value]="money(r.totals.overdue)"
          [hint]="r.counts.OVERDUE + ' students past a due date'"
        />
      </section>

      @if (genderCards().length > 1) {
        <app-filter-cards
          class="mb-6"
          label="Show fees for everyone, boys or girls"
          [cards]="genderCards()"
          [value]="gender()"
          (changed)="onGender($any($event))"
        />
      }

      <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section class="min-w-0 overflow-hidden rounded-xl bg-card shadow-sm" aria-label="Students">
          <div class="flex flex-col gap-4 border-b p-5">
            <div>
              <h2 class="text-base font-bold">Students</h2>
              <p class="text-sm text-muted-foreground">
                Most owed first. Open a student to see every instalment.
              </p>
            </div>
            <p-selectbutton
              [options]="tabs()"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              [ngModel]="status()"
              (ngModelChange)="onStatus($event)"
              aria-label="Show students by fee status"
            >
              <ng-template #item let-item>
                <span>{{ item.label }}</span>
                <span
                  class="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums"
                  >{{ item.count }}</span
                >
              </ng-template>
            </p-selectbutton>
            <div class="flex flex-wrap gap-3">
              <input
                pInputText
                class="w-full sm:w-72"
                placeholder="Name or admission number"
                aria-label="Search students"
                [ngModel]="search()"
                (ngModelChange)="onSearch($event)"
              />
              <p-select
                [options]="classes()"
                optionLabel="name"
                optionValue="id"
                placeholder="All classes"
                [showClear]="true"
                [ngModel]="classId()"
                (ngModelChange)="onClass($event)"
                aria-label="Class"
                class="w-full sm:w-48"
              />
            </div>
          </div>

          <p-table
            [value]="r.students.items"
            [lazy]="true"
            [paginator]="true"
            [rows]="pageSize"
            [showCurrentPageReport]="true"
            currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
            [totalRecords]="r.students.total"
            [first]="(page() - 1) * pageSize"
            (onLazyLoad)="onPage($event)"
            [loading]="loading()"
            [tableStyle]="{ 'min-width': '46rem' }"
          >
            <ng-template #header>
              <tr>
                <th class="!pl-5">Student</th>
                <th>Due</th>
                <th class="text-right">Still to pay</th>
                <th>Status</th>
                <th class="!pr-5"><span class="sr-only">Action</span></th>
              </tr>
            </ng-template>
            <ng-template #body let-s>
              <tr>
                <td class="!pl-5">
                  <div class="flex items-center gap-3">
                    <app-avatar [name]="s.fullName" />
                    <div class="min-w-0 leading-tight">
                      <a
                        class="font-semibold app-link"
                        [routerLink]="['/app/students', s.studentId]"
                        >{{ s.fullName }}</a
                      >
                      <p class="mt-1 text-xs text-muted-foreground">
                        {{ s.class }}-{{ s.division }} &middot; ID {{ s.admissionNo }}
                      </p>
                    </div>
                  </div>
                </td>
                <td class="text-sm whitespace-nowrap">
                  @if (s.oldestOverdueOn) {
                    {{ date(s.oldestOverdueOn) }}
                    <span class="block text-xs font-semibold text-bad">{{
                      late(s.oldestOverdueOn)
                    }}</span>
                  } @else if (s.nextDueOn) {
                    {{ date(s.nextDueOn) }}
                    <span class="block text-xs text-muted-foreground">next due</span>
                  } @else {
                    <span class="text-muted-foreground">&mdash;</span>
                  }
                </td>
                <td class="text-right whitespace-nowrap">
                  <span class="font-semibold">{{ money(s.pending) }}</span>
                  <span class="block text-xs text-muted-foreground">of {{ money(s.billed) }}</span>
                  @if (s.previousYearsPending !== '0.00') {
                    <span class="block text-xs text-warn"
                      >{{ money(s.previousYearsPending) }} from earlier years</span
                    >
                  }
                </td>
                <td>
                  <app-badge [label]="statusOf(s).label" [tone]="statusOf(s).tone" />
                </td>
                <td class="!pr-5 text-right whitespace-nowrap">
                  @if (s.pending !== '0.00' && canPay) {
                    <p-button
                      label="Record payment"
                      size="small"
                      severity="secondary"
                      [outlined]="true"
                      [ariaLabel]="'Record a payment for ' + s.fullName"
                      (onClick)="pay(s.studentId)"
                    />
                  } @else if (s.lastPaidOn) {
                    <span class="inline-flex items-center gap-1.5 text-xs text-good"
                      ><app-icon name="check" />Paid {{ date(s.lastPaidOn) }}</span
                    >
                  }
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr>
                <td colspan="5" class="p-8 text-center text-muted-foreground">
                  No students match.
                </td>
              </tr>
            </ng-template>
          </p-table>
        </section>

        <aside class="flex min-w-0 flex-col gap-6">
          <section class="rounded-xl bg-card p-5 shadow-sm">
            <h2 class="text-base font-bold">Where students stand</h2>
            <p class="text-sm text-muted-foreground">Everyone billed this year, by status.</p>
            @if (breakdown().total) {
              <div
                class="mt-4 flex h-2.5 overflow-hidden rounded-full bg-accent"
                role="img"
                [attr.aria-label]="breakdownText()"
              >
                @for (b of breakdown().parts; track b.status) {
                  <div [class]="b.bar" [style.width.%]="b.share * 100"></div>
                }
              </div>
              <ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                @for (b of breakdown().parts; track b.status) {
                  <li class="flex items-center gap-2">
                    <span [class]="'size-2.5 rounded-sm ' + b.bar" aria-hidden="true"></span>
                    {{ b.label }}
                    <span class="ml-auto font-bold tabular-nums">{{ b.count }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-3 text-sm text-muted-foreground">Nothing has been billed yet.</p>
            }

            @if (methods().length) {
              <h3 class="mt-6 border-t pt-5 text-sm font-bold">
                How money came in
                <span class="font-normal text-muted-foreground">this year</span>
              </h3>
              <ul class="mt-3 flex flex-col gap-2.5 text-sm">
                @for (m of methods(); track m.label) {
                  <li class="grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3">
                    <span>{{ m.label }}</span>
                    <span class="h-1.5 overflow-hidden rounded-full bg-accent" aria-hidden="true"
                      ><span
                        class="block h-full rounded-full bg-primary"
                        [style.width.%]="m.share * 100"
                      ></span
                    ></span>
                    <span class="text-right font-bold tabular-nums">{{ percent(m.share) }}</span>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="rounded-xl bg-card p-5 shadow-sm">
            <h2 class="text-base font-bold">Longest overdue</h2>
            <p class="text-sm text-muted-foreground">Waiting longest since a due date passed.</p>
            @if (r.longestOverdue.length) {
              <ul class="mt-2">
                @for (s of r.longestOverdue; track s.studentId) {
                  <li class="flex items-center gap-3 border-t py-3 first:border-t-0">
                    <app-avatar [name]="s.fullName" size="sm" />
                    <div class="min-w-0 flex-1 text-sm leading-tight">
                      <a
                        class="font-semibold app-link"
                        [routerLink]="['/app/students', s.studentId]"
                        >{{ s.fullName }}</a
                      >
                      <p class="mt-1 text-xs text-muted-foreground">
                        <span class="font-semibold text-foreground">{{ money(s.overdue) }}</span>
                        &middot; {{ s.class }}-{{ s.division }} &middot;
                        <span class="text-bad">{{ late(s.oldestOverdueOn!) }}</span>
                      </p>
                    </div>
                    <p-button
                      *appHasPermission="'fees.reminder.send'"
                      severity="secondary"
                      [text]="true"
                      size="small"
                      [ariaLabel]="'Remind the class teacher of ' + s.fullName"
                      [loading]="reminding() === s.studentId"
                      (onClick)="remind(s)"
                      ><app-icon name="bell"
                    /></p-button>
                    @if (canPay) {
                      <p-button
                        severity="secondary"
                        [text]="true"
                        size="small"
                        [ariaLabel]="'Record a payment for ' + s.fullName"
                        (onClick)="pay(s.studentId)"
                        ><app-icon name="wallet"
                      /></p-button>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-3 text-sm text-muted-foreground">Nobody is past a due date.</p>
            }
          </section>
        </aside>
      </div>

      <section class="mt-6 overflow-hidden rounded-xl bg-card shadow-sm" aria-label="By class">
        <div class="p-5 pb-3">
          <h2 class="text-base font-bold">By class and division</h2>
          <p class="text-sm text-muted-foreground">Totals for each standard, then its divisions.</p>
        </div>
        <p-table [value]="groups(r)" [tableStyle]="{ 'min-width': '44rem' }">
          <ng-template #header>
            <tr>
              <th class="!pl-5">Class</th>
              <th class="text-right">Students owing</th>
              <th class="text-right">Billed</th>
              <th class="text-right">Collected</th>
              <th class="text-right">Still to pay</th>
              <th class="!pr-5 text-right">Overdue</th>
            </tr>
          </ng-template>
          <ng-template #body let-g>
            <tr [class.font-semibold]="g.isClass">
              <td class="!pl-5" [class.!pl-10]="!g.isClass">{{ g.label }}</td>
              <td class="text-right">{{ g.owing }} of {{ g.students }}</td>
              <td class="text-right">{{ money(g.billed) }}</td>
              <td class="text-right">{{ money(g.collected) }}</td>
              <td class="text-right">{{ money(g.pending) }}</td>
              <td class="!pr-5 text-right" [class.text-bad]="g.overdue !== '0.00'">
                {{ money(g.overdue) }}
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="6" class="p-6 text-center text-muted-foreground">
                No students enrolled this year.
              </td>
            </tr>
          </ng-template>
        </p-table>
      </section>
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }

    <p-dialog
      header="Record a payment"
      [visible]="pickerOpen()"
      (visibleChange)="!$event && pickerOpen.set(false)"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <p class="mb-3 text-sm text-muted-foreground">
        Find the student; their fees open with the payment form ready.
      </p>
      <label for="pay-student" class="mb-1 block text-sm font-medium">Student</label>
      <p-autocomplete
        inputId="pay-student"
        [suggestions]="matches()"
        (completeMethod)="find($event.query)"
        (onSelect)="pay($event.value.id)"
        optionLabel="fullName"
        [minLength]="2"
        [delay]="250"
        placeholder="Name or admission number"
        appendTo="body"
        [fluid]="true"
      >
        <ng-template #item let-s>
          <div class="leading-tight">
            <span class="font-semibold">{{ s.fullName }}</span>
            <span class="block text-xs text-muted-foreground">
              ID {{ s.admissionNo }}
              @if (s.current) {
                &middot; {{ s.current.class.name }}-{{ s.current.division.name }}
              }
            </span>
          </div>
        </ng-template>
      </p-autocomplete>
    </p-dialog>
  `,
})
export class DuesPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  protected readonly canPay = inject(AuthService).has('fees.payment.create');

  protected readonly money = inr;
  protected readonly date = formatDate;
  protected readonly pageSize = 20;
  private readonly today = todayInIndia();

  protected readonly report = signal<DuesReport | null>(null);
  protected readonly collection = signal<Collection | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly classId = signal<string | null>(null);
  protected readonly status = signal<DuesStatus | 'ALL'>('ALL');
  protected readonly gender = signal<GenderChoice>('ALL');
  protected readonly page = signal(1);
  protected readonly reminding = signal<string | null>(null);
  protected readonly pickerOpen = signal(false);
  protected readonly matches = signal<StudentListItem[]>([]);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly tabs = computed(() => {
    const counts = this.report()?.counts;
    return DUES_TABS.map((value) => ({
      value,
      label: value === 'ALL' ? 'All' : DUES_STATUS[value].label,
      count: !counts
        ? 0
        : value === 'ALL'
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : counts[value],
    }));
  });

  /** Everyone, boys, girls: what was collected and what is left, also a filter. */
  protected readonly genderCards = computed<FilterCard[]>(() => {
    const r = this.report();
    if (!r) return [];
    const groups = genderGroups(r.byGender, (gender) => ({
      gender,
      students: 0,
      owing: 0,
      billed: '0.00',
      collected: '0.00',
      pending: '0.00',
      overdue: '0.00',
    }));
    const sum = (k: 'collected' | 'pending') =>
      fromPaise(groups.reduce((a, g) => a + toPaise(g[k]), 0));
    const card = (
      value: string,
      label: string,
      g: { collected: string; pending: string; students: number },
    ): FilterCard => ({
      value,
      label,
      amount: inr(g.collected) + ' collected',
      hint: `${g.students} ${g.students === 1 ? 'student' : 'students'} · ${inr(g.pending)} still to collect`,
    });
    return [
      card('ALL', 'Everyone', {
        collected: sum('collected'),
        pending: sum('pending'),
        students: groups.reduce((a, g) => a + g.students, 0),
      }),
      ...groups.map((g) => card(g.gender, GENDER_GROUP[g.gender], g)),
    ];
  });

  protected readonly collectedShare = computed(() => {
    const t = this.report()?.totals;
    return t ? share(t.collected, t.billed) : 0;
  });

  protected readonly breakdown = computed(() => {
    const counts = this.report()?.counts;
    const total = counts ? BREAKDOWN.reduce((a, b) => a + counts[b.status], 0) : 0;
    return {
      total,
      parts: BREAKDOWN.map((b) => ({
        ...b,
        label: DUES_STATUS[b.status].label,
        count: counts?.[b.status] ?? 0,
        share: total ? (counts?.[b.status] ?? 0) / total : 0,
      })),
    };
  });
  protected readonly breakdownText = computed(() =>
    this.breakdown()
      .parts.map((p) => `${p.label} ${p.count}`)
      .join(', '),
  );

  protected readonly methods = computed(() => {
    const c = this.collection();
    if (!c || c.total === '0.00') return [];
    return c.byMode
      .map((m) => ({ label: MODE_LABEL[m.mode] ?? m.mode, share: share(m.total, c.total) }))
      .sort((a, b) => b.share - a.share);
  });

  constructor() {
    void firstValueFrom(this.api.classes())
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
    void this.loadCollection();
    void this.load();
  }

  protected statusOf(s: DuesStudent) {
    return DUES_STATUS[s.status];
  }
  protected late(dueIso: string) {
    return lateText(daysBetween(dueIso, this.today));
  }
  protected percent(x: number) {
    return percentText(x);
  }

  protected groups(r: DuesReport) {
    const out: ((typeof r.byClass)[number] & { isClass: boolean })[] = [];
    for (const c of r.byClass) {
      out.push({ ...c, isClass: true });
      // Divisions are labelled "Class-Division"; show those that belong to this class.
      for (const d of r.byDivision) {
        if (d.label.startsWith(c.label + '-')) out.push({ ...d, isClass: false });
      }
    }
    return out;
  }

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 300);
  }
  protected onClass(id: string | null) {
    this.classId.set(id);
    this.page.set(1);
    void this.load();
  }
  protected onGender(value: GenderChoice) {
    this.gender.set(value);
    this.page.set(1);
    void this.load();
  }
  protected onStatus(value: DuesStatus | 'ALL') {
    this.status.set(value);
    this.page.set(1);
    void this.load();
  }
  protected onPage(event: { first?: number | null }) {
    const page = Math.floor((event.first ?? 0) / this.pageSize) + 1;
    if (page === this.page()) return;
    this.page.set(page);
    void this.load();
  }

  /** Opens the student's fees with the payment form ready. */
  protected pay(studentId: string) {
    this.pickerOpen.set(false);
    void this.router.navigate(['/app/students', studentId], { queryParams: { pay: 1 } });
  }

  protected openPicker() {
    this.matches.set([]);
    this.pickerOpen.set(true);
  }

  protected async find(query: string) {
    try {
      const page = await firstValueFrom(
        this.api.students({ page: 1, pageSize: 8, search: query, status: 'ACTIVE' }),
      );
      this.matches.set(page.items);
    } catch {
      this.matches.set([]);
    }
  }

  protected async remind(s: DuesStudent) {
    if (this.reminding()) return;
    this.reminding.set(s.studentId);
    try {
      const res = await firstValueFrom(this.api.remindClassTeacher(s.studentId));
      this.toast.add({
        severity: 'success',
        summary: `${res.notified} has been told`,
        detail: `Class teacher of ${res.class}`,
      });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not send', detail: apiError(error) });
    } finally {
      this.reminding.set(null);
    }
  }

  /** Money received this academic year, by payment method (for the side panel). */
  /** After an Excel import: the totals and lists change. */
  protected reloadAll() {
    void this.load();
    void this.loadCollection();
  }

  private async loadCollection() {
    try {
      const year = (await firstValueFrom(this.api.years())).find((y) => y.isCurrent);
      if (!year) return;
      const from = year.startDate.slice(0, 10);
      const to = this.today < year.endDate.slice(0, 10) ? this.today : year.endDate.slice(0, 10);
      if (to < from) return;
      this.collection.set(await firstValueFrom(this.api.collection(from, to)));
    } catch {
      // The panel simply leaves the payment methods out.
    }
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(
        await firstValueFrom(
          this.api.dues({
            page: this.page(),
            pageSize: this.pageSize,
            classId: this.classId(),
            search: this.search().trim() || undefined,
            status: this.status() === 'ALL' ? null : (this.status() as DuesStatus),
            gender: this.gender() === 'ALL' ? null : (this.gender() as Gender),
          }),
        ),
      );
    } catch (error) {
      this.error.set(apiError(error));
      this.toast.add({ severity: 'error', summary: 'Could not load', detail: apiError(error) });
    } finally {
      this.loading.set(false);
    }
  }
}
