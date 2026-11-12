import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { SchoolClass } from '../../core/models';
import { HasPermission } from '../../shared/has-permission.directive';
import { FormField } from '../../shared/ui/form-field';

type Dialog =
  { kind: 'class'; editing: SchoolClass | null } | { kind: 'division'; parent: SchoolClass };

@Component({
  selector: 'app-classes-tab',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
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
      <p-button label="Add class" (onClick)="openClass(null)" />
    </div>

    <p-table [value]="classes()" [loading]="loading()">
      <ng-template #header>
        <tr>
          <th>Class</th>
          <th>Minimum age</th>
          <th>Admissions</th>
          <th>Divisions</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-cls>
        <tr>
          <td class="font-medium">{{ cls.name }}</td>
          <td>
            @if (cls.minAgeYears !== null) {
              {{ cls.minAgeYears }} {{ cls.minAgeYears === 1 ? 'year' : 'years' }}
            } @else {
              <span class="text-muted-foreground">No rule</span>
            }
          </td>
          <td>
            <p-tag
              [value]="cls.admissionsOpen ? 'Open' : 'Closed'"
              [severity]="cls.admissionsOpen ? 'success' : 'secondary'"
            />
          </td>
          <td>
            <div class="flex flex-wrap gap-2">
              @for (d of cls.divisions; track d.id) {
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {{ d.name }}
                  <p-button
                    *appHasPermission="'academics.manage'"
                    severity="danger"
                    [text]="true"
                    [rounded]="true"
                    size="small"
                    styleClass="!size-6 !p-0"
                    [ariaLabel]="'Remove division ' + d.name + ' from ' + cls.name"
                    (onClick)="confirmDeleteDivision(cls, d)"
                    >&times;</p-button
                  >
                </span>
              } @empty {
                <span class="text-sm text-muted-foreground">None</span>
              }
            </div>
          </td>
          <td class="whitespace-nowrap text-right" *appHasPermission="'academics.manage'">
            <p-button
              label="Add division"
              size="small"
              [text]="true"
              (onClick)="openDivision(cls)"
            />
            <p-button label="Edit" size="small" [text]="true" (onClick)="openClass(cls)" />
            <p-button
              label="Delete"
              size="small"
              severity="danger"
              [text]="true"
              (onClick)="confirmDeleteClass(cls)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5" class="p-4 text-center text-muted-foreground">
            No classes yet. Add the first one.
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      [header]="dialogTitle()"
      [visible]="!!dialog()"
      (visibleChange)="!$event && dialog.set(null)"
      [modal]="true"
      [style]="{ width: '26rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field
          [label]="dialog()?.kind === 'division' ? 'Division name' : 'Class name'"
          for="nameInput"
          [control]="form.controls.name"
        >
          <input
            pInputText
            id="nameInput"
            formControlName="name"
            [placeholder]="dialog()?.kind === 'division' ? 'For example A' : 'For example Class 5'"
            [fluid]="true"
          />
        </app-form-field>
        @if (dialog()?.kind === 'class') {
          <app-form-field
            label="Minimum age (years)"
            for="minAge"
            hint="The youngest age a child may be admitted at. Leave empty for no age rule."
          >
            <p-inputnumber
              inputId="minAge"
              formControlName="minAgeYears"
              [useGrouping]="false"
              [min]="0"
              [max]="25"
              [fluid]="true"
            />
          </app-form-field>
          <div class="flex items-center gap-2">
            <p-checkbox formControlName="admissionsOpen" [binary]="true" inputId="admOpen" />
            <label for="admOpen" class="text-sm">Open for admission</label>
          </div>
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="dialog.set(null)"
          />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class ClassesTab {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    minAgeYears: [null as number | null],
    admissionsOpen: [true],
  });

  constructor() {
    void this.refresh();
  }

  protected dialogTitle(): string {
    const d = this.dialog();
    if (!d) return '';
    if (d.kind === 'division') return `Add division to ${d.parent.name}`;
    return d.editing ? 'Edit class' : 'Add class';
  }

  protected openClass(cls: SchoolClass | null) {
    this.form.reset({
      name: cls?.name ?? '',
      minAgeYears: cls?.minAgeYears ?? null,
      admissionsOpen: cls?.admissionsOpen ?? true,
    });
    this.dialog.set({ kind: 'class', editing: cls });
  }

  protected openDivision(parent: SchoolClass) {
    this.form.reset({ name: '', minAgeYears: null, admissionsOpen: true });
    this.dialog.set({ kind: 'division', parent });
  }

  protected async save() {
    this.form.markAllAsTouched();
    const dialog = this.dialog();
    if (!dialog || this.form.invalid || this.saving()) return;

    const { name: rawName, minAgeYears, admissionsOpen } = this.form.getRawValue();
    const name = rawName.trim();
    this.saving.set(true);
    try {
      if (dialog.kind === 'division') {
        await firstValueFrom(this.api.createDivision(dialog.parent.id, name));
      } else if (dialog.editing) {
        await firstValueFrom(
          this.api.updateClass(dialog.editing.id, { name, minAgeYears, admissionsOpen }),
        );
      } else {
        await firstValueFrom(this.api.createClass({ name, minAgeYears, admissionsOpen }));
      }
      this.toast.add({ severity: 'success', summary: 'Saved' });
      this.dialog.set(null);
      await this.refresh();
    } catch (error) {
      this.fail('Could not save', error);
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmDeleteClass(cls: SchoolClass) {
    this.confirm.confirm({
      header: 'Delete class',
      message: `Delete ${cls.name}? A class that still has divisions cannot be deleted.`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.remove(() => this.api.deleteClass(cls.id)),
    });
  }

  protected confirmDeleteDivision(cls: SchoolClass, division: { id: string; name: string }) {
    this.confirm.confirm({
      header: 'Remove division',
      message: `Remove division ${division.name} from ${cls.name}?`,
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.remove(() => this.api.deleteDivision(division.id)),
    });
  }

  private async remove(call: () => ReturnType<Api['deleteClass']>) {
    try {
      await firstValueFrom(call());
      await this.refresh();
    } catch (error) {
      this.fail('Could not delete', error);
    }
  }

  private async refresh() {
    this.loading.set(true);
    try {
      this.classes.set(await firstValueFrom(this.api.classes()));
    } catch (error) {
      this.fail('Could not load classes', error);
    } finally {
      this.loading.set(false);
    }
  }

  private fail(summary: string, error: unknown) {
    this.toast.add({ severity: 'error', summary, detail: apiError(error) });
  }
}
