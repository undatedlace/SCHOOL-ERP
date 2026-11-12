import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { ApplicationListItem, Assignment } from '../../core/models';
import { NAV } from '../../core/nav';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { inr } from '../../shared/money';
import { Avatar } from '../../shared/ui/avatar';
import { ClassPill } from '../../shared/ui/badge';
import { PageHeader } from '../../shared/ui/page-header';
import { StatTile, StatTone } from '../../shared/ui/stat-tile';
import { StatusTag } from '../../shared/ui/status-tag';
import { UpcomingEvents } from '../calendar/upcoming-events';
import { percentText, share } from '../fees/fee-view';
import { AdmissionsInsightCard } from './insights/admissions-insight';
import { AttendanceInsightCard } from './insights/attendance-insight';
import { FeesInsightCard } from './insights/fees-insight';
import { StaffInsightCard } from './insights/staff-insight';

interface Tile {
  key: string;
  label: string;
  icon: string;
  tone: StatTone;
  value: string;
  hint: string;
  progress?: number | null;
  link: string;
}

/** "Good morning" and so on, by the time in India. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    ButtonModule,
    PageHeader,
    HasPermission,
    StatTile,
    Avatar,
    ClassPill,
    StatusTag,
    AdmissionsInsightCard,
    AttendanceInsightCard,
    FeesInsightCard,
    StaffInsightCard,
    UpcomingEvents,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [title]="greeting + ', ' + firstName()"
      [crumbs]="[{ label: 'Dashboard' }]"
      subtitle="Admissions, students, staff and fees at a glance."
    >
      <p-button
        *appHasPermission="'admissions.manage'"
        label="New application"
        severity="secondary"
        [outlined]="true"
        (onClick)="go('/app/admissions/new')"
      />
      <p-button
        *appHasPermission="'fees.payment.create'"
        label="Record payment"
        (onClick)="go('/app/fees/dues')"
      />
    </app-page-header>

    @if (tiles().length) {
      <section
        aria-label="At a glance"
        class="mb-6 grid gap-4 sm:grid-cols-2"
        [class.xl:grid-cols-4]="tiles().length >= 4"
        [class.xl:grid-cols-3]="tiles().length === 3"
      >
        @for (t of tiles(); track t.key) {
          <a [routerLink]="t.link" class="block rounded-xl transition hover:-translate-y-0.5">
            <app-stat-tile
              [label]="t.label"
              [icon]="t.icon"
              [tone]="t.tone"
              [value]="t.value"
              [hint]="t.hint"
              [progress]="t.progress ?? null"
            />
          </a>
        }
      </section>
    }

    @if (mine().length) {
      <section class="mb-6 rounded-xl bg-card p-5 shadow-sm" aria-labelledby="my-classes">
        <h2 id="my-classes" class="mb-3 text-base font-bold">Your classes this year</h2>
        <ul class="flex flex-wrap gap-2 text-sm">
          @for (a of mine(); track a.id) {
            <li class="flex items-center gap-2 rounded-lg border px-3 py-2">
              <app-class-pill [label]="a.division.class.name + '-' + a.division.name" />
              <span class="text-muted-foreground">{{
                a.kind === 'CLASS_TEACHER' ? 'Class teacher' : a.subject?.name
              }}</span>
            </li>
          }
        </ul>
      </section>
    }

    <div class="mb-6 grid items-start gap-6 lg:grid-cols-2">
      @if (recent().length) {
        <section class="overflow-hidden rounded-xl bg-card shadow-sm" aria-labelledby="recent">
          <div class="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h2 id="recent" class="text-base font-bold">Recent applications</h2>
              <p class="text-sm text-muted-foreground">The newest admission forms received.</p>
            </div>
            <a routerLink="/app/admissions" class="text-sm font-semibold app-link"
              >All applications</a
            >
          </div>
          <ul>
            @for (a of recent(); track a.id) {
              <li class="flex items-center gap-3 border-t px-5 py-3">
                <app-avatar [name]="a.studentName" size="sm" />
                <div class="min-w-0 flex-1 leading-tight">
                  <a class="font-semibold app-link" [routerLink]="['/app/admissions', a.id]">{{
                    a.studentName
                  }}</a>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Form {{ a.formNo }} &middot; received {{ date(a.receivedOn) }}
                  </p>
                </div>
                @if (a.class) {
                  <app-class-pill [label]="a.class.name" />
                }
                <app-status-tag [status]="a.status" />
              </li>
            }
          </ul>
        </section>
      }
      <app-upcoming-events *appHasPermission="'calendar.read'" />
    </div>

    <div class="mb-8 grid items-start gap-6 lg:grid-cols-2">
      <app-fees-insight *appHasPermission="'fees.read_all'" />
      <app-attendance-insight *appHasPermission="'attendance.read'" />
      <app-admissions-insight *appHasPermission="'insights.admissions'" />
      <app-staff-insight *appHasPermission="'insights.staff'" />
    </div>

    @if (shortcuts().length) {
      <section aria-labelledby="go-to">
        <h2 id="go-to" class="app-eyebrow mb-3">Go to</h2>
        <ul class="flex flex-wrap gap-2">
          @for (item of shortcuts(); track item.path) {
            <li>
              <a
                [routerLink]="item.path"
                [attr.title]="item.description"
                class="inline-flex rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium transition hover:border-primary hover:text-primary"
                >{{ item.label }}</a
              >
            </li>
          }
        </ul>
      </section>
    } @else {
      <p class="text-sm text-muted-foreground">
        Nothing is set up for your role yet. Ask the school office if you need access.
      </p>
    }
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly greeting = greeting();
  protected readonly date = formatDate;

  /** The signed-in teacher's own classes and subjects (empty for everyone else). */
  protected readonly mine = signal<Assignment[]>([]);
  protected readonly recent = signal<ApplicationListItem[]>([]);
  private readonly loaded = signal<Record<string, Tile>>({});

  /** Number tiles, each shown only to people who may open the page it leads to. */
  protected readonly tiles = computed(() =>
    ['students', 'applications', 'fees', 'staff']
      .map((k) => this.loaded()[k])
      .filter((t): t is Tile => !!t),
  );

  constructor() {
    if (this.auth.has('academics.read')) {
      firstValueFrom(this.api.myAssignments())
        .then((rows) => this.mine.set(rows))
        .catch(() => undefined);
    }
    void this.loadTiles();
  }

  protected readonly firstName = computed(() => this.auth.me()?.fullName.split(' ')[0] ?? '');
  protected readonly shortcuts = computed(() =>
    NAV.filter(
      (i) => i.path !== '/app/dashboard' && (!i.permission || this.auth.has(i.permission)),
    ),
  );

  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }

  private put(tile: Tile) {
    this.loaded.update((m) => ({ ...m, [tile.key]: tile }));
  }

  /** Each tile asks for one small number; a tile that cannot load is simply left out. */
  private async loadTiles() {
    const jobs: Promise<void>[] = [];
    if (this.auth.has('students.read_all')) {
      jobs.push(
        firstValueFrom(this.api.students({ page: 1, pageSize: 1, status: 'ACTIVE' })).then((p) =>
          this.put({
            key: 'students',
            label: 'Students',
            icon: 'students',
            tone: 'primary',
            value: String(p.total),
            hint: 'Studying here now',
            link: '/app/students',
          }),
        ),
      );
    }
    if (this.auth.has('admissions.read')) {
      jobs.push(
        firstValueFrom(this.api.applicationsSummary()).then((s) => {
          const waiting = s.counts.RECEIVED + s.counts.UNDER_REVIEW;
          this.put({
            key: 'applications',
            label: 'Applications waiting',
            icon: 'clipboard',
            tone: 'amber',
            value: String(waiting),
            hint: `${s.total} received this year, ${s.counts.GRANTED} granted`,
            link: '/app/admissions',
          });
        }),
        firstValueFrom(this.api.applications({ page: 1, pageSize: 5 })).then((p) =>
          this.recent.set(p.items),
        ),
      );
    }
    if (this.auth.has('fees.read_all')) {
      jobs.push(
        firstValueFrom(this.api.dues({ page: 1, pageSize: 1 })).then((r) => {
          const part = share(r.totals.collected, r.totals.billed);
          this.put({
            key: 'fees',
            label: 'Fees collected',
            icon: 'wallet',
            tone: 'good',
            value: inr(r.totals.collected),
            hint: `${percentText(part)} of ${inr(r.totals.billed)} billed`,
            progress: part,
            link: '/app/fees/dues',
          });
        }),
      );
    }
    if (this.auth.has('staff.read_all')) {
      jobs.push(
        firstValueFrom(this.api.staffList({ page: 1, pageSize: 1, status: 'ACTIVE' })).then((p) =>
          this.put({
            key: 'staff',
            label: 'Staff',
            icon: 'teachers',
            tone: 'info',
            value: String(p.total),
            hint: 'Working here now',
            link: '/app/staff',
          }),
        ),
      );
    }
    await Promise.allSettled(jobs);
  }
}
