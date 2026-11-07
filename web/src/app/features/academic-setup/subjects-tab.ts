import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Subject } from '../../core/models';
import { HasPermission } from '../../shared/has-permission.directive';
import { FormField } from '../../shared/ui/form-field';

@Component({
  selector: 'app-subjects-tab',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    FormField,
    HasPermission,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex justify-end" *appHasPermission="'academics.manage'">
      <p-button label="Add subject" (onClick)="openDialog(null)" />
    </div>

    <p-table [value]="subjects()" [loading]="loading()">
      <ng-template #header>
        <tr>
          <th>Subject</th>
          <th>Code</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-subject>
        <tr>
          <td class="font-medium">{{ subject.name }}</td>
          <td>{{ subject.code }}</td>
          <td class="whitespace-nowrap text-right" *appHasPermission="'academics.manage'">
            <p-button label="Edit" size="small" [text]="true" (onClick)="openDialog(subject)" />
            <p-button
              label="Delete"
              size="small"
              severity="danger"
              [text]="true"
              (onClick)="confirmDelete(subject)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="3" class="p-4 text-center text-slate-500">
            No subjects yet. Add the first one.
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      [header]="editing() ? 'Edit subject' : 'Add subject'"
      [(visible)]="open"
      [modal]="true"
      [style]="{ width: '26rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field label="Name" for="subjectName" [control]="form.controls.name">
          <input pInputText id="subjectName" formControlName="name" [fluid]="true" />
        </app-form-field>
        <app-form-field label="Code (optional)" for="subjectCode" [control]="form.controls.code">
          <input pInputText id="subjectCode" formControlName="code" [fluid]="true" />
        </app-form-field>
        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class SubjectsTab {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly subjects = signal<Subject[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Subject | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    code: ['', Validators.maxLength(20)],
  });

  constructor() {
    void this.refresh();
  }

  protected openDialog(subject: Subject | null) {
    this.editing.set(subject);
    this.form.reset({ name: subject?.name ?? '', code: subject?.code ?? '' });
    this.open.set(true);
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const { name, code } = this.form.getRawValue();
    const body = { name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}) };
    const editing = this.editing();

    this.saving.set(true);
    try {
      await firstValueFrom(
        editing ? this.api.updateSubject(editing.id, body) : this.api.createSubject(body),
      );
      this.toast.add({ severity: 'success', summary: 'Saved' });
      this.open.set(false);
      await this.refresh();
    } catch (error) {
      this.fail('Could not save', error);
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmDelete(subject: Subject) {
    this.confirm.confirm({
      header: 'Delete subject',
      message: `Delete ${subject.name}?`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.deleteSubject(subject.id));
          await this.refresh();
        } catch (error) {
          this.fail('Could not delete', error);
        }
      },
    });
  }

  private async refresh() {
    this.loading.set(true);
    try {
      this.subjects.set(await firstValueFrom(this.api.subjects()));
    } catch (error) {
      this.fail('Could not load subjects', error);
    } finally {
      this.loading.set(false);
    }
  }

  private fail(summary: string, error: unknown) {
    this.toast.add({ severity: 'error', summary, detail: apiError(error) });
  }
}
