import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Assignment } from '../../core/models';
import { NAV } from '../../core/nav';
import { HasPermission } from '../../shared/has-permission.directive';
import { PageHeader } from '../../shared/ui/page-header';
import { AdmissionsInsightCard } from './insights/admissions-insight';
import { AttendanceInsightCard } from './insights/attendance-insight';
import { FeesInsightCard } from './insights/fees-insight';
import { StaffInsightCard } from './insights/staff-insight';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    PageHeader,
    HasPermission,
    AdmissionsInsightCard,
    AttendanceInsightCard,
    FeesInsightCard,
    StaffInsightCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="'Welcome, ' + firstName()" subtitle="Here is what you can do." />

    @if (mine().length) {
      <section class="mb-8 rounded-lg border bg-card p-5" aria-labelledby="my-classes">
        <h2 id="my-classes" class="mb-3 font-semibold">Your classes this year</h2>
        <ul class="grid gap-2 text-sm sm:grid-cols-2">
          @for (a of mine(); track a.id) {
            <li>
              <span class="font-medium">{{ a.division.class.name }}-{{ a.division.name }}</span>
              <span class="text-muted-foreground">
                &middot;
                {{ a.kind === 'CLASS_TEACHER' ? 'Class teacher' : a.subject?.name }}
              </span>
            </li>
          }
        </ul>
      </section>
    }

    <div class="mb-8 grid gap-4 lg:grid-cols-2">
      <app-fees-insight *appHasPermission="'fees.read_all'" />
      <app-attendance-insight *appHasPermission="'attendance.read'" />
      <app-admissions-insight *appHasPermission="'insights.admissions'" />
      <app-staff-insight *appHasPermission="'insights.staff'" />
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      @for (item of shortcuts(); track item.path) {
        <a
          [routerLink]="item.path"
          class="rounded-lg border bg-card p-5 shadow-sm transition hover:border-ring"
        >
          <h2 class="font-medium">{{ item.label }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ item.description }}</p>
        </a>
      } @empty {
        <p class="text-sm text-muted-foreground">
          Nothing is set up for your role yet. Ask the school office if you need access.
        </p>
      }
    </div>

    <p class="mt-8 text-sm text-muted-foreground">
      Exam results will appear here once marks are entered.
    </p>
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly api = inject(Api);

  /** The signed-in teacher's own classes and subjects (empty for everyone else). */
  protected readonly mine = signal<Assignment[]>([]);

  constructor() {
    if (this.auth.has('academics.read')) {
      firstValueFrom(this.api.myAssignments())
        .then((rows) => this.mine.set(rows))
        .catch(() => undefined);
    }
  }

  protected readonly firstName = computed(() => this.auth.me()?.fullName.split(' ')[0] ?? '');
  protected readonly shortcuts = computed(() =>
    NAV.filter(
      (i) => i.path !== '/app/dashboard' && (!i.permission || this.auth.has(i.permission)),
    ),
  );
}
