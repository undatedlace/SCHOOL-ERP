import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  CalendarCategory,
  CalendarEvent,
  CalendarEventInput,
  NoticeAudience,
  NoticeAudiences,
} from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { DateField } from '../../shared/ui/date-field';
import { TimeField } from '../../shared/ui/time-field';
import { FormField } from '../../shared/ui/form-field';
import { AUDIENCE_LABEL, toggle } from '../notices/notice-utils';
import { CATEGORY_LABEL } from './calendar-utils';
import { SelectModule } from '@openng/optimus-ui/select';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { RadioButtonModule } from '@openng/optimus-ui/radiobutton';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { FormsModule } from '@angular/forms';

const CATEGORIES: CalendarCategory[] = ['EVENT', 'HOLIDAY', 'EXAM', 'MEETING'];
const AUDIENCES: NoticeAudience[] = ['ALL', 'STAFF', 'CLASSES', 'DIVISIONS'];

/** Add an event to the calendar, or change one. Optionally sends a notice about it too. */
@Component({
  selector: 'app-event-dialog',
  imports: [
    DateField,
    TimeField,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    FormField,
    SelectModule,
    TextareaModule,
    RadioButtonModule,
    CheckboxModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="editing() ? 'Change event' : 'New event'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '38rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field
          label="Title"
          for="eventTitle"
          [control]="form.controls.title"
          [required]="true"
        >
          <input
            pInputText
            id="eventTitle"
            formControlName="title"
            maxlength="150"
            [fluid]="true"
          />
        </app-form-field>

        <app-form-field label="Kind" for="eventCategory">
          <p-select
            inputId="eventCategory"
            formControlName="category"
            [options]="categoryOptions"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            [fluid]="true"
          />
        </app-form-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field
            label="First day"
            for="eventStart"
            [control]="form.controls.startsOn"
            [required]="true"
          >
            <app-date-field
              inputId="eventStart"
              label="First day"
              [clearable]="false"
              [value]="form.controls.startsOn.value"
              (valueChange)="
                form.controls.startsOn.setValue($event); form.controls.startsOn.markAsTouched()
              "
            />
          </app-form-field>
          <app-form-field
            label="Last day (optional)"
            for="eventEnd"
            hint="Leave empty for a one-day event."
          >
            <app-date-field
              inputId="eventEnd"
              label="Last day"
              [clearable]="true"
              [value]="form.controls.endsOn.value"
              (valueChange)="
                form.controls.endsOn.setValue($event); form.controls.endsOn.markAsTouched()
              "
            />
          </app-form-field>
          <app-form-field label="Starts at (optional)" for="eventFrom">
            <app-time-field
              inputId="eventFrom"
              label="Starts at"
              [value]="form.controls.startTime.value"
              (valueChange)="form.controls.startTime.setValue($event)"
            />
          </app-form-field>
          <app-form-field label="Ends at (optional)" for="eventTo">
            <app-time-field
              inputId="eventTo"
              label="Ends at"
              [value]="form.controls.endTime.value"
              (valueChange)="form.controls.endTime.setValue($event)"
            />
          </app-form-field>
        </div>

        <app-form-field
          label="Details (optional)"
          for="eventDescription"
          hint="Plain text. Line breaks are kept."
        >
          <textarea
            pTextarea
            id="eventDescription"
            formControlName="description"
            rows="3"
            maxlength="2000"
            [fluid]="true"
          ></textarea>
        </app-form-field>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">Who sees it</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (a of audiences; track a) {
              <span class="flex items-center gap-2 text-sm">
                <p-radiobutton
                  name="eventAudience"
                  [inputId]="'eventAudience-' + a"
                  [value]="a"
                  [ngModel]="audience()"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="setAudience($event)"
                />
                <label [for]="'eventAudience-' + a">{{ audienceLabel[a] }}</label>
              </span>
            }
          </div>
          @if (audience() === 'CLASSES') {
            <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Classes">
              @for (c of options()?.classes ?? []; track c.id) {
                <span class="flex items-center gap-2 text-sm">
                  <p-checkbox
                    [binary]="true"
                    [inputId]="'event-classes-' + c.id"
                    [ngModel]="classIds().includes(c.id)"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="classIds.set(toggle(classIds(), c.id))"
                  />
                  <label [for]="'event-classes-' + c.id">{{ c.name }}</label>
                </span>
              }
            </div>
          }
          @if (audience() === 'DIVISIONS') {
            <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Divisions">
              @for (d of options()?.divisions ?? []; track d.id) {
                <span class="flex items-center gap-2 text-sm">
                  <p-checkbox
                    [binary]="true"
                    [inputId]="'event-divisions-' + d.id"
                    [ngModel]="divisionIds().includes(d.id)"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="divisionIds.set(toggle(divisionIds(), d.id))"
                  />
                  <label [for]="'event-divisions-' + d.id">{{ d.label }}</label>
                </span>
              }
            </div>
          }
        </fieldset>

        @if (!editing()) {
          <div class="flex items-start gap-2 text-sm">
            <p-checkbox [binary]="true" inputId="eventAnnounce" formControlName="announce" />
            <label for="eventAnnounce">
              Also send a notice about it
              <span class="block text-muted-foreground">
                Parents, students and staff in the audience will see it under Notices.
              </span>
            </label>
          </div>
        }

        @if (problem()) {
          <small class="text-destructive" role="alert">{{ problem() }}</small>
        }

        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="visible.set(false)"
          />
          <p-button
            type="submit"
            [label]="editing() ? 'Save' : 'Add to calendar'"
            [loading]="saving()"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export class EventDialog {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  readonly visible = model(false);
  readonly saved = output<CalendarEvent>();

  protected readonly categories = CATEGORIES;
  protected readonly audiences = AUDIENCES;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly categoryOptions = CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABEL[value],
  }));
  protected readonly audienceLabel = AUDIENCE_LABEL;
  protected readonly toggle = toggle;
  protected readonly editing = signal<CalendarEvent | null>(null);
  protected readonly options = signal<NoticeAudiences | null>(null);
  protected readonly audience = signal<NoticeAudience>('ALL');
  protected readonly classIds = signal<string[]>([]);
  protected readonly divisionIds = signal<string[]>([]);
  protected readonly problem = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    category: ['EVENT' as CalendarCategory],
    startsOn: ['', Validators.required],
    endsOn: [''],
    startTime: [''],
    endTime: [''],
    description: [''],
    announce: [false],
  });

  /** Opens the dialog: empty for a new event (on the given day), or filled in for one being changed. */
  async open(event: CalendarEvent | null, day: string = toIsoDate(new Date())) {
    this.editing.set(event);
    this.problem.set(null);
    this.form.reset({
      title: event?.title ?? '',
      category: event?.category ?? 'EVENT',
      startsOn: event?.startsOn ?? day,
      endsOn: event && event.endsOn !== event.startsOn ? event.endsOn : '',
      startTime: event?.startTime ?? '',
      endTime: event?.endTime ?? '',
      description: event?.description ?? '',
      announce: false,
    });
    this.audience.set(event?.audience ?? 'ALL');
    this.classIds.set(event?.classes.map((c) => c.id) ?? []);
    this.divisionIds.set(event?.divisions.map((d) => d.id) ?? []);
    this.visible.set(true);
    try {
      this.options.set(this.options() ?? (await firstValueFrom(this.api.calendarAudiences())));
    } catch (error) {
      this.problem.set(apiError(error));
    }
  }

  protected setAudience(a: NoticeAudience) {
    this.audience.set(a);
    this.problem.set(null);
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const audience = this.audience();
    if (audience === 'CLASSES' && this.classIds().length === 0) {
      this.problem.set('Choose at least one class');
      return;
    }
    if (audience === 'DIVISIONS' && this.divisionIds().length === 0) {
      this.problem.set('Choose at least one division');
      return;
    }
    const v = this.form.getRawValue();
    const editing = this.editing();
    const body: CalendarEventInput = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      category: v.category,
      startsOn: v.startsOn,
      endsOn: v.endsOn || v.startsOn,
      startTime: v.startTime || null,
      endTime: v.endTime || null,
      audience,
      classIds: audience === 'CLASSES' ? this.classIds() : [],
      divisionIds: audience === 'DIVISIONS' ? this.divisionIds() : [],
      ...(editing ? {} : { announce: v.announce }),
    };
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        editing
          ? this.api.updateCalendarEvent(editing.id, body)
          : this.api.createCalendarEvent(body),
      );
      this.toast.add({
        severity: 'success',
        summary: editing ? 'Saved' : saved.announced ? 'Added, and notice sent' : 'Added',
      });
      this.visible.set(false);
      this.saved.emit(saved);
    } catch (error) {
      this.problem.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
