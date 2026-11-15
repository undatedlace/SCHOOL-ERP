import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import { Badge } from '../../shared/ui/badge';
import { StudentLeave, StudentLeaveApi } from './student-leave.service';
import { STATUS_LABEL, STATUS_SEVERITY, daysText, rangeText } from './student-leave-utils';

/** The leave families have reported for one student. Shown to staff who may see student leave. */
@Component({
  selector: 'app-student-leave-card',
  imports: [Badge, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed()) {
      <section class="rounded-xl border-0 bg-card p-5 shadow-sm" aria-labelledby="student-leave-h">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 id="student-leave-h" class="font-semibold">Leave</h2>
          <a routerLink="/app/student-leave" class="app-link text-sm">All student leave</a>
        </div>
        <p class="mb-3 text-sm text-muted-foreground">
          Absences reported by the family. Approved leave is suggested when attendance is taken.
        </p>
        @if (error()) {
          <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
        } @else if (rows().length === 0) {
          <p class="text-sm text-muted-foreground">
            {{ loaded() ? 'No leave has been reported.' : 'Loading...' }}
          </p>
        } @else {
          <ul class="divide-y text-sm">
            @for (r of rows(); track r.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                <div class="min-w-0">
                  <span class="font-medium">{{ range(r) }}</span>
                  <span class="text-muted-foreground"> ({{ daysText(r.days) }})</span>
                  <p class="text-muted-foreground">{{ r.reason }}</p>
                </div>
                <app-badge [label]="label[r.status]" [severity]="severity[r.status]" />
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class StudentLeaveCard {
  private readonly leave = inject(StudentLeaveApi);
  private readonly auth = inject(AuthService);

  readonly studentId = input.required<string>();

  protected readonly label = STATUS_LABEL;
  protected readonly severity = STATUS_SEVERITY;
  protected readonly daysText = daysText;
  protected readonly range = rangeText;
  protected readonly rows = signal<StudentLeave[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  protected allowed = () =>
    ['student_leave.decide', 'student_leave.read_all', 'student_leave.decide_all'].some((p) =>
      this.auth.has(p),
    );

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (!this.allowed()) return;
      void this.load(id);
    });
  }

  private async load(studentId: string) {
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.leave.list({ studentId, page: 1, pageSize: 20 }));
      this.rows.set(page.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
