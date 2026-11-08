import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { StudentAttendance } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { percentText, statusLabel } from '../attendance/attendance-utils';

/** A student's attendance this academic year so far. Parents and students see their own. */
@Component({
  selector: 'app-student-attendance',
  imports: [HasPermission],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border bg-card p-5" *appHasPermission="'attendance.read'">
      <h2 class="mb-1 font-semibold">Attendance</h2>
      @if (data(); as a) {
        <p class="mb-3 text-sm text-muted-foreground">
          {{ dateText(a.from) }} to {{ dateText(a.to) }}. Present and late count as attended;
          approved leave is left out.
        </p>
        @if (a.summary.markedDays === 0) {
          <p class="text-sm text-muted-foreground">No attendance has been marked yet.</p>
        } @else {
          <dl class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div class="rounded-md bg-muted p-3">
              <dt class="text-xs text-muted-foreground">Attendance</dt>
              <dd class="text-lg font-semibold">{{ percent(a.summary) }}</dd>
            </div>
            <div class="rounded-md border p-3">
              <dt class="text-xs text-muted-foreground">Present</dt>
              <dd class="text-lg font-semibold">{{ a.summary.present }}</dd>
            </div>
            <div class="rounded-md border p-3">
              <dt class="text-xs text-muted-foreground">Late</dt>
              <dd class="text-lg font-semibold">{{ a.summary.late }}</dd>
            </div>
            <div class="rounded-md border p-3">
              <dt class="text-xs text-muted-foreground">Absent</dt>
              <dd class="text-lg font-semibold">{{ a.summary.absent }}</dd>
            </div>
            <div class="rounded-md border p-3">
              <dt class="text-xs text-muted-foreground">On leave</dt>
              <dd class="text-lg font-semibold">{{ a.summary.onLeave }}</dd>
            </div>
          </dl>
          @if (away(a).length > 0) {
            <h3 class="mb-1 text-sm font-medium">Days not present</h3>
            <ul class="divide-y text-sm">
              @for (r of away(a); track r.date) {
                <li class="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>{{ dateText(r.date) }}</span>
                  <span>
                    {{ label(r.status) }}
                    @if (r.note) {
                      <span class="text-muted-foreground"> - {{ r.note }}</span>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        }
      } @else if (failed()) {
        <p class="text-sm text-muted-foreground">Attendance is not available.</p>
      } @else {
        <p class="text-sm text-muted-foreground">Loading...</p>
      }
    </section>
  `,
})
export class StudentAttendanceSection {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);

  readonly studentId = input.required<string>();
  protected readonly data = signal<StudentAttendance | null>(null);
  protected readonly failed = signal(false);
  protected readonly dateText = formatDate;
  protected readonly percent = percentText;
  protected readonly label = statusLabel;

  constructor() {
    effect(() => {
      const id = this.studentId();
      this.data.set(null);
      this.failed.set(false);
      if (!this.auth.has('attendance.read')) return;
      firstValueFrom(this.api.studentAttendance(id))
        .then((a) => this.data.set(a))
        .catch(() => this.failed.set(true));
    });
  }

  /** The last ten days the child was not simply present. */
  protected away(a: StudentAttendance) {
    return a.records.filter((r) => r.status !== 'PRESENT').slice(0, 10);
  }
}
