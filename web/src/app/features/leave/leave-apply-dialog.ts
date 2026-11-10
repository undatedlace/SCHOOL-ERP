import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { LeaveRequest, LeaveType } from '../../core/models';
import { toIsoDate } from '../../shared/dates';

/** Ask for leave, or (for an administrator) record leave for a member of staff, which is approved at once. */
@Component({
  selector: 'app-leave-apply-dialog',
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="staff() ? 'Record leave for a member of staff' : 'Ask for leave'"
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '32rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        @if (staff()) {
          <label class="flex flex-col gap-1 text-sm" for="lv-staff">
            Staff member
            <select
              id="lv-staff"
              class="h-10 rounded-md border bg-background px-3"
              [value]="staffId()"
              (change)="staffId.set($any($event.target).value)"
            >
              <option value="">Choose a person</option>
              @for (s of staff(); track s.id) {
                <option [value]="s.id">{{ s.name }}</option>
              }
            </select>
          </label>
        }
        <label class="flex flex-col gap-1 text-sm" for="lv-type">
          Kind of leave
          <select
            id="lv-type"
            class="h-10 rounded-md border bg-background px-3"
            [value]="typeId()"
            (change)="typeId.set($any($event.target).value)"
          >
            <option value="">Choose a kind</option>
            @for (t of types(); track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm" for="lv-start">
            First day
            <input
              id="lv-start"
              type="date"
              class="h-10 rounded-md border bg-background px-3"
              [min]="staff() ? '' : today"
              [value]="start()"
              (input)="start.set($any($event.target).value)"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm" for="lv-end">
            Last day (optional)
            <input
              id="lv-end"
              type="date"
              class="h-10 rounded-md border bg-background px-3"
              [value]="end()"
              (input)="end.set($any($event.target).value)"
            />
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm" for="lv-half">
          <input
            id="lv-half"
            type="checkbox"
            [checked]="half()"
            (change)="half.set($any($event.target).checked)"
          />
          Half a day (a single day only)
        </label>
        <label class="flex flex-col gap-1 text-sm" for="lv-reason">
          Reason
          <textarea
            id="lv-reason"
            rows="3"
            maxlength="300"
            class="rounded-md border bg-background p-3"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
        </label>
        <p class="text-xs text-muted-foreground">Sundays are not counted.</p>
        @if (error()) {
          <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="visible.set(false)" />
          <p-button
            [label]="staff() ? 'Record leave' : 'Send request'"
            [disabled]="
              !typeId() || !start() || reason().trim().length < 3 || (!!staff() && !staffId())
            "
            [loading]="saving()"
            (onClick)="send()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class LeaveApplyDialog {
  readonly visible = model(false);
  readonly types = input.required<LeaveType[]>();
  /** Give a list to record leave for others (administrators); leave out to ask for your own. */
  readonly staff = input<{ id: string; name: string }[] | null>(null);
  readonly saved = output<LeaveRequest>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly today = toIsoDate(new Date());
  protected readonly staffId = signal('');
  protected readonly typeId = signal('');
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly half = signal(false);
  protected readonly reason = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  /** Opens with an empty form. */
  open() {
    this.staffId.set('');
    this.typeId.set('');
    this.start.set('');
    this.end.set('');
    this.half.set(false);
    this.reason.set('');
    this.error.set(null);
    this.visible.set(true);
  }

  protected async send() {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(
        this.api.applyForLeave({
          leaveTypeId: this.typeId(),
          startsOn: this.start(),
          ...(this.end() ? { endsOn: this.end() } : {}),
          ...(this.half() ? { halfDay: true } : {}),
          reason: this.reason().trim(),
          ...(this.staff() ? { staffId: this.staffId() } : {}),
        }),
      );
      this.visible.set(false);
      this.toast.add({
        severity: 'success',
        summary: this.staff() ? 'Leave recorded' : 'Request sent to the school office',
      });
      this.saved.emit(saved);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
