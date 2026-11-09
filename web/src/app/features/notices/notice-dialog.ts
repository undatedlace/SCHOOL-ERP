import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Notice, NoticeAudience, NoticeAudiences, NoticeInput } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { FormField } from '../../shared/ui/form-field';
import { AUDIENCE_LABEL, toggle } from './notice-utils';

/** Write a new notice, or change one. People who may only write to their own divisions see only that. */
@Component({
  selector: 'app-notice-dialog',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, InputTextModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="editing() ? 'Change notice' : 'New notice'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '36rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field
          label="Title"
          for="noticeTitle"
          [control]="form.controls.title"
          [required]="true"
        >
          <input
            pInputText
            id="noticeTitle"
            formControlName="title"
            maxlength="150"
            [fluid]="true"
          />
        </app-form-field>
        <app-form-field
          label="Message"
          for="noticeBody"
          [control]="form.controls.body"
          [required]="true"
          hint="Plain text. Line breaks are kept."
        >
          <textarea
            id="noticeBody"
            formControlName="body"
            rows="6"
            maxlength="5000"
            class="w-full rounded-md border bg-background p-3 text-sm"
          ></textarea>
        </app-form-field>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">Send to</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (a of audienceOptions(); track a) {
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="audience"
                  [value]="a"
                  [checked]="audience() === a"
                  (change)="setAudience(a)"
                />
                {{ label[a] }}
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
          @if (problem()) {
            <small class="text-destructive" role="alert">{{ problem() }}</small>
          }
        </fieldset>

        <app-form-field
          label="Show until (optional)"
          for="noticeUntil"
          hint="The last day it is shown. Leave empty to keep it until you remove it."
        >
          <input
            id="noticeUntil"
            type="date"
            formControlName="expiresOn"
            [min]="today"
            class="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </app-form-field>

        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="visible.set(false)"
          />
          <p-button
            type="submit"
            [label]="editing() ? 'Save' : 'Send notice'"
            [loading]="saving()"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export class NoticeDialog {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  readonly visible = model(false);
  readonly saved = output<Notice>();

  protected readonly label = AUDIENCE_LABEL;
  protected readonly toggle = toggle;
  protected readonly today = toIsoDate(new Date());
  protected readonly editing = signal<Notice | null>(null);
  protected readonly options = signal<NoticeAudiences | null>(null);
  protected readonly audience = signal<NoticeAudience>('DIVISIONS');
  protected readonly classIds = signal<string[]>([]);
  protected readonly divisionIds = signal<string[]>([]);
  protected readonly problem = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    body: ['', [Validators.required, Validators.maxLength(5000)]],
    expiresOn: [''],
  });

  protected audienceOptions(): NoticeAudience[] {
    return this.options()?.canAddressAnyone
      ? ['ALL', 'STAFF', 'CLASSES', 'DIVISIONS']
      : ['DIVISIONS'];
  }

  /** Opens the dialog, empty for a new notice or filled in for one being changed. */
  async open(notice: Notice | null) {
    this.editing.set(notice);
    this.problem.set(null);
    this.form.reset({
      title: notice?.title ?? '',
      body: notice?.body ?? '',
      expiresOn: notice?.expiresOn ?? '',
    });
    this.classIds.set(notice?.classes.map((c) => c.id) ?? []);
    this.divisionIds.set(notice?.divisions.map((d) => d.id) ?? []);
    this.visible.set(true);
    try {
      const options = this.options() ?? (await firstValueFrom(this.api.noticeAudiences()));
      this.options.set(options);
      this.audience.set(notice?.audience ?? (options.canAddressAnyone ? 'ALL' : 'DIVISIONS'));
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
    const body: NoticeInput = {
      title: v.title.trim(),
      body: v.body.trim(),
      audience,
      classIds: audience === 'CLASSES' ? this.classIds() : [],
      divisionIds: audience === 'DIVISIONS' ? this.divisionIds() : [],
      expiresOn: v.expiresOn || null,
    };
    const editing = this.editing();
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        editing ? this.api.updateNotice(editing.id, body) : this.api.createNotice(body),
      );
      this.toast.add({ severity: 'success', summary: editing ? 'Saved' : 'Notice sent' });
      this.visible.set(false);
      this.saved.emit(saved);
    } catch (error) {
      this.problem.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
