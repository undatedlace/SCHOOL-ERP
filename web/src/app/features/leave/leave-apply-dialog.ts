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
import { SelectModule } from '@openng/optimus-ui/select';
import { FormsModule } from '@angular/forms';
import { DateField } from '../../shared/ui/date-field';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { LeaveRequest, LeaveType } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';

/** Ask for leave, or (for an administrator) record leave for a member of staff, which is approved at once. */
@Component({
  selector: 'app-leave-apply-dialog',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    DateField,
    TextareaModule,
    CheckboxModule,
  ],
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
          <div class="flex flex-col gap-1 text-sm">
            <span>Staff member</span>
            <p-select
              inputId="lv-staff"
              [options]="staff() ?? []"
              optionLabel="name"
              optionValue="id"
              placeholder="Choose a person"
              [filter]="true"
              [ngModel]="staffId() || null"
              (ngModelChange)="staffId.set($event ?? '')"
              ariaLabel="Staff member"
              appendTo="body"
              [fluid]="true"
            />
          </div>
        }
        <div class="flex flex-col gap-1 text-sm">
          <span>Kind of leave</span>
          <p-select
            inputId="lv-type"
            [options]="types()"
            optionLabel="name"
            optionValue="id"
            placeholder="Choose a kind"
            [ngModel]="typeId() || null"
            (ngModelChange)="typeId.set($event ?? '')"
            ariaLabel="Kind of leave"
            appendTo="body"
            [fluid]="true"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1 text-sm">
            <span>First day</span>
            <app-date-field
              label="First day"
              inputId="lv-start"
              [min]="staff() ? '' : today"
              [value]="start()"
              (valueChange)="start.set($event)"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Last day (optional)</span>
            <app-date-field
              label="Last day"
              inputId="lv-end"
              [clearable]="true"
              [value]="end()"
              (valueChange)="end.set($event)"
            />
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <p-checkbox
            [binary]="true"
            inputId="lv-half"
            [ngModel]="half()"
            (ngModelChange)="half.set($event)"
          />
          <label for="lv-half">Half a day (a single day only)</label>
        </div>
        <label class="flex flex-col gap-1 text-sm" for="lv-reason">
          Reason
          <textarea
            id="lv-reason"
            rows="3"
            maxlength="300"
            pTextarea
            [fluid]="true"
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
