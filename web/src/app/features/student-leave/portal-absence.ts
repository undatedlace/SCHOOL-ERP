import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { apiError } from '../../core/api-error';
import { formatDate, toIsoDate } from '../../shared/dates';
import { Badge } from '../../shared/ui/badge';
import { DateField } from '../../shared/ui/date-field';
import { ChildSwitcher } from '../portal/child-switcher';
import { PortalChildren } from '../portal/portal-children';
import { StudentLeave, StudentLeaveApi, StudentLeavePreview } from './student-leave.service';
import {
  STATUS_LABEL,
  STATUS_SEVERITY,
  daysText,
  rangeText,
  schoolDaysText,
} from './student-leave-utils';

/** "Report absence": a parent or student tells the school a child will be away. */
@Component({
  selector: 'app-portal-absence',
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    TextareaModule,
    DateField,
    Badge,
    ChildSwitcher,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 text-xl font-semibold">Report absence</h1>
    <p class="mb-4 text-sm text-muted-foreground">
      Tell the school when a child will be away. The class teacher approves it, and approved leave
      is not counted against attendance.
    </p>
    <app-child-switcher />

    @if (portal.selected(); as child) {
      <form class="mb-6 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm" (ngSubmit)="send()">
        <h2 class="font-semibold">New request for {{ child.firstName }}</h2>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm" for="abs-from">
            First day
            <app-date-field
              inputId="abs-from"
              label="First day"
              [value]="from()"
              [min]="today"
              (valueChange)="setFrom($event)"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm" for="abs-to">
            Last day
            <app-date-field
              inputId="abs-to"
              label="Last day"
              [value]="to()"
              [min]="from() || today"
              (valueChange)="setTo($event)"
            />
          </label>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <p-checkbox
            [binary]="true"
            inputId="abs-half"
            [disabled]="!!to() && to() !== from()"
            [ngModel]="half()"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="setHalf($event)"
            ariaLabel="Half day"
          />
          <label for="abs-half">Half day (for a single day only)</label>
        </div>

        <label class="flex flex-col gap-1 text-sm" for="abs-reason">
          Reason
          <textarea
            id="abs-reason"
            rows="3"
            maxlength="500"
            pTextarea
            [fluid]="true"
            [ngModel]="reason()"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="reason.set($event)"
          ></textarea>
        </label>

        @if (preview(); as p) {
          <div class="rounded-lg bg-accent p-3 text-sm" aria-live="polite">
            @if (p.problem) {
              <p class="text-destructive">{{ p.problem }}</p>
            } @else {
              <p class="font-medium">{{ schoolDays(p.days) }}</p>
              @if (p.skipped.length) {
                <p class="text-muted-foreground">
                  Not counted:
                  @for (d of p.skipped; track d.date; let last = $last) {
                    {{ format(d.date) }} ({{
                      d.reason === 'SUNDAY' ? 'Sunday' : 'school holiday'
                    }}){{ last ? '' : ',' }}
                  }
                </p>
              }
            }
          </div>
        }
        @if (error()) {
          <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
        }
        <div>
          <p-button
            type="submit"
            label="Send to the school"
            [loading]="sending()"
            [disabled]="!canSend()"
          />
        </div>
      </form>

      <h2 class="mb-2 font-semibold">Requests for {{ child.firstName }}</h2>
      <ul class="flex flex-col gap-3">
        @for (r of requests(); track r.id) {
          <li class="rounded-xl bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium">{{ range(r) }}</span>
              <app-badge [label]="label[r.status]" [severity]="severity[r.status]" />
            </div>
            <p class="text-sm text-muted-foreground">
              {{ daysText(r.days) }}{{ r.halfDay ? ' (half day)' : '' }}. {{ r.reason }}
            </p>
            @if (r.decisionNote) {
              <p class="mt-1 text-sm">
                {{ r.decidedBy?.name ?? 'The school' }}: {{ r.decisionNote }}
              </p>
            }
            @if (r.canWithdraw) {
              <div class="mt-2">
                <p-button
                  label="Withdraw"
                  size="small"
                  severity="danger"
                  [text]="true"
                  [ariaLabel]="'Withdraw the request for ' + range(r)"
                  (onClick)="withdraw(r)"
                />
              </div>
            }
          </li>
        } @empty {
          <li class="text-sm text-muted-foreground">
            {{ loaded() ? 'No requests yet.' : 'Loading...' }}
          </li>
        }
      </ul>
    } @else if (portal.loaded()) {
      <p class="text-muted-foreground">There is no child to report an absence for.</p>
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class PortalAbsence {
  private readonly leave = inject(StudentLeaveApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly portal = inject(PortalChildren);

  protected readonly today = toIsoDate(new Date());
  protected readonly label = STATUS_LABEL;
  protected readonly severity = STATUS_SEVERITY;
  protected readonly daysText = daysText;
  protected readonly range = rangeText;
  protected readonly schoolDays = schoolDaysText;
  protected readonly format = formatDate;

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly half = signal(false);
  protected readonly reason = signal('');
  protected readonly preview = signal<StudentLeavePreview | null>(null);
  protected readonly requests = signal<StudentLeave[]>([]);
  protected readonly loaded = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.portal.load();
    // Reload the list when the chosen child changes.
    effect(() => {
      const id = this.portal.selected()?.id;
      if (id) void this.loadRequests(id);
    });
  }

  protected canSend() {
    const p = this.preview();
    return !!this.from() && this.reason().trim().length > 0 && !!p && !p.problem && !this.sending();
  }

  protected setFrom(v: string) {
    this.from.set(v);
    if (this.to() && v && this.to() < v) this.to.set(v);
    void this.refreshPreview();
  }
  protected setTo(v: string) {
    this.to.set(v);
    if (v && v !== this.from()) this.half.set(false);
    void this.refreshPreview();
  }
  protected setHalf(v: boolean) {
    this.half.set(v);
    void this.refreshPreview();
  }

  private async refreshPreview() {
    const child = this.portal.selected();
    if (!child || !this.from()) {
      this.preview.set(null);
      return;
    }
    try {
      this.preview.set(
        await firstValueFrom(
          this.leave.preview({
            studentId: child.id,
            fromDate: this.from(),
            toDate: this.to() || this.from(),
            halfDay: this.half(),
          }),
        ),
      );
    } catch (error) {
      this.preview.set(null);
      this.error.set(apiError(error));
    }
  }

  private async loadRequests(studentId: string) {
    try {
      const page = await firstValueFrom(this.leave.list({ studentId, page: 1, pageSize: 50 }));
      this.requests.set(page.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async send() {
    const child = this.portal.selected();
    if (!child || !this.canSend()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.leave.request({
          studentId: child.id,
          fromDate: this.from(),
          toDate: this.to() || this.from(),
          halfDay: this.half(),
          reason: this.reason().trim(),
        }),
      );
      this.toast.add({ severity: 'success', summary: 'Sent to the school' });
      this.from.set('');
      this.to.set('');
      this.half.set(false);
      this.reason.set('');
      this.preview.set(null);
      await this.loadRequests(child.id);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  protected withdraw(r: StudentLeave) {
    this.confirm.confirm({
      header: 'Withdraw this request?',
      message: `${r.student.name}, ${rangeText(r)}.`,
      acceptLabel: 'Withdraw',
      rejectLabel: 'Keep it',
      accept: async () => {
        try {
          await firstValueFrom(this.leave.withdraw(r.id));
          await this.loadRequests(r.student.id);
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not withdraw',
            detail: apiError(error),
          });
        }
      },
    });
  }
}
