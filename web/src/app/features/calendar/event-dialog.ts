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
import { FormField } from '../../shared/ui/form-field';
import { AUDIENCE_LABEL, toggle } from '../notices/notice-utils';
import { CATEGORY_LABEL } from './calendar-utils';

const CATEGORIES: CalendarCategory[] = ['EVENT', 'HOLIDAY', 'EXAM', 'MEETING'];
const AUDIENCES: NoticeAudience[] = ['ALL', 'STAFF', 'CLASSES', 'DIVISIONS'];

/** Add an event to the calendar, or change one. Optionally sends a notice about it too. */
@Component({
  selector: 'app-event-dialog',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, InputTextModule, FormField],
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
          <select
            id="eventCategory"
            formControlName="category"
            class="h-10 rounded-md border bg-background px-3 text-sm"
          >
            @for (c of categories; track c) {
              <option [value]="c">{{ categoryLabel[c] }}</option>
            }
          </select>
        </app-form-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field
            label="First day"
            for="eventStart"
            [control]="form.controls.startsOn"
            [required]="true"
          >
            <input
              id="eventStart"
              type="date"
              formControlName="startsOn"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </app-form-field>
          <app-form-field
            label="Last day (optional)"
            for="eventEnd"
            hint="Leave empty for a one-day event."
          >
            <input
              id="eventEnd"
              type="date"
              formControlName="endsOn"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </app-form-field>
          <app-form-field label="Starts at (optional)" for="eventFrom">
            <input
              id="eventFrom"
              type="time"
              formControlName="startTime"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </app-form-field>
          <app-form-field label="Ends at (optional)" for="eventTo">
            <input
              id="eventTo"
              type="time"
              formControlName="endTime"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </app-form-field>
        </div>

        <app-form-field
          label="Details (optional)"
          for="eventDescription"
          hint="Plain text. Line breaks are kept."
        >
          <textarea
            id="eventDescription"
            formControlName="description"
            rows="3"
            maxlength="2000"
            class="w-full rounded-md border bg-background p-3 text-sm"
          ></textarea>
        </app-form-field>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">Who sees it</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (a of audiences; track a) {
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="eventAudience"
                  [value]="a"
                  [checked]="audience() === a"
                  (change)="setAudience(a)"
                />
                {{ audienceLabel[a] }}
              </label>
            }
          </div>
          @if (audience() === 'CLASSES') {
            <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Classes">
              @for (c of options()?.classes ?? []; track c.id) {
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    [checked]="classIds().includes(c.id)"
                    (change)="classIds.set(toggle(classIds(), c.id))"
                  />
                  {{ c.name }}
                </label>
              }
            </div>
          }
          @if (audience() === 'DIVISIONS') {
            <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Divisions">
              @for (d of options()?.divisions ?? []; track d.id) {
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    [checked]="divisionIds().includes(d.id)"
                    (change)="divisionIds.set(toggle(divisionIds(), d.id))"
                  />
                  {{ d.label }}
                </label>
              }
            </div>
          }
        </fieldset>

        @if (!editing()) {
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1" formControlName="announce" />
            <span>
              Also send a notice about it
              <span class="block text-muted-foreground">
                Parents, students and staff in the audience will see it under Notices.
              </span>
            </span>
          </label>
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
