import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear } from '../../core/models';
import { formatDate, fromIsoDate, toIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { FormField } from '../../shared/ui/form-field';

const endAfterStart = (group: AbstractControl): ValidationErrors | null => {
  const start: Date | null = group.get('startDate')?.value;
  const end: Date | null = group.get('endDate')?.value;
  return start && end && end <= start
    ? { mismatch: 'The end date must be after the start date' }
    : null;
};

@Component({
  selector: 'app-years-tab',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
    FormField,
    HasPermission,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex justify-end" *appHasPermission="'academics.manage'">
      <p-button label="Add academic year" (onClick)="openCreate()" />
    </div>

    <p-table [value]="years()" [loading]="loading()">
      <ng-template #header>
        <tr>
          <th>Year</th>
          <th>Starts</th>
          <th>Ends</th>
          <th>Status</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-year>
        <tr>
          <td class="font-medium">{{ year.name }}</td>
          <td>{{ format(year.startDate) }}</td>
          <td>{{ format(year.endDate) }}</td>
          <td>
            @if (year.isCurrent) {
              <p-tag value="Current" severity="success" />
            }
          </td>
          <td class="whitespace-nowrap text-right" *appHasPermission="'academics.manage'">
            @if (!year.isCurrent) {
              <p-button
                label="Make current"
                size="small"
                [text]="true"
                (onClick)="makeCurrent(year)"
              />
            }
            <p-button label="Edit" size="small" [text]="true" (onClick)="openEdit(year)" />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5" class="p-4 text-center text-slate-500">
            No academic years yet. Add the first one.
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      [header]="editing() ? 'Edit academic year' : 'Add academic year'"
      [(visible)]="open"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field label="Name" for="yearName" [control]="form.controls.name">
          <input
            pInputText
            id="yearName"
            formControlName="name"
            placeholder="For example 2026-27"
            [fluid]="true"
          />
        </app-form-field>
        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field label="Start date" for="startDate" [control]="form.controls.startDate">
            <p-datepicker
              inputId="startDate"
              formControlName="startDate"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="End date" for="endDate" [control]="form.controls.endDate">
            <p-datepicker
              inputId="endDate"
              formControlName="endDate"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
        </div>
        @if (form.errors?.['mismatch']) {
          <small class="text-red-600" role="alert">{{ form.errors?.['mismatch'] }}</small>
        }
        <div class="flex items-center gap-2 text-sm">
          <p-checkbox formControlName="isCurrent" [binary]="true" inputId="isCurrent" />
          <label for="isCurrent">Make this the current academic year</label>
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class YearsTab {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly format = formatDate;
  protected readonly years = signal<AcademicYear[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<AcademicYear | null>(null);

  protected readonly form = inject(FormBuilder).group(
    {
      name: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(20)]],
      startDate: [null as Date | null, Validators.required],
      endDate: [null as Date | null, Validators.required],
      isCurrent: [false],
    },
    { validators: endAfterStart },
  );

  constructor() {
    void this.refresh();
  }

  protected openCreate() {
    this.editing.set(null);
    this.form.reset({
      name: '',
      startDate: null,
      endDate: null,
      isCurrent: this.years().length === 0,
    });
    this.open.set(true);
  }

  protected openEdit(year: AcademicYear) {
    this.editing.set(year);
    this.form.reset({
      name: year.name,
      startDate: fromIsoDate(year.startDate),
      endDate: fromIsoDate(year.endDate),
      isCurrent: year.isCurrent,
    });
    this.open.set(true);
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const v = this.form.getRawValue();
    const body = {
      name: (v.name ?? '').trim(),
      startDate: toIsoDate(v.startDate as Date),
      endDate: toIsoDate(v.endDate as Date),
      isCurrent: !!v.isCurrent,
    };
    const editing = this.editing();

    this.saving.set(true);
    try {
      await firstValueFrom(
        editing ? this.api.updateYear(editing.id, body) : this.api.createYear(body),
      );
      this.toast.add({
        severity: 'success',
        summary: editing ? 'Academic year updated' : 'Academic year added',
      });
      this.open.set(false);
      await this.refresh();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  protected async makeCurrent(year: AcademicYear) {
    try {
      await firstValueFrom(this.api.setCurrentYear(year.id));
      this.toast.add({ severity: 'success', summary: `${year.name} is now the current year` });
      await this.refresh();
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not change the current year',
        detail: apiError(error),
      });
    }
  }

  private async refresh() {
    this.loading.set(true);
    try {
      this.years.set(await firstValueFrom(this.api.years()));
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not load academic years',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
