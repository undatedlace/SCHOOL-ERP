import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Assignment, SchoolClass, StaffMember, Subject } from '../../core/models';
import { HasPermission } from '../../shared/has-permission.directive';
import { FormField } from '../../shared/ui/form-field';

/** Who teaches what, this academic year: class teachers and subject teachers by division. */
@Component({
  selector: 'app-teaching-tab',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    FormField,
    HasPermission,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p-select
        [options]="divisionOptions()"
        optionLabel="label"
        optionValue="id"
        placeholder="All divisions"
        [showClear]="true"
        ariaLabel="Filter by division"
        (onChange)="onDivision($event.value)"
      />
      <p-button
        *appHasPermission="'academics.manage'"
        label="Assign a teacher"
        (onClick)="openAssign()"
      />
    </div>

    <p-table [value]="rows()" [loading]="loading()">
      <ng-template #header>
        <tr>
          <th>Division</th>
          <th>Role</th>
          <th>Teacher</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-a>
        <tr>
          <td class="font-medium">{{ a.division.class.name }}-{{ a.division.name }}</td>
          <td>
            @if (a.kind === 'CLASS_TEACHER') {
              <p-tag value="Class teacher" severity="info" />
            } @else {
              {{ a.subject.name }}
            }
          </td>
          <td>
            <a class="app-link" [routerLink]="['/app/staff', a.staff.id]">{{ a.staff.fullName }}</a>
            @if (a.staff.status === 'LEFT') {
              <p-tag class="ml-2" value="Left" severity="warn" />
            }
          </td>
          <td class="whitespace-nowrap text-right" *appHasPermission="'academics.manage'">
            <p-button label="Change" size="small" [text]="true" (onClick)="openChange(a)" />
            <p-button
              label="Remove"
              size="small"
              severity="danger"
              [text]="true"
              (onClick)="confirmRemove(a)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="4" class="p-4 text-center text-muted-foreground">
            No teachers assigned yet this year.
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      [header]="changing() ? 'Change teacher' : 'Assign a teacher'"
      [visible]="dialogOpen()"
      (visibleChange)="!$event && dialogOpen.set(false)"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        @if (!changing()) {
          <app-form-field
            label="Division"
            for="t_div"
            [control]="form.controls.divisionId"
            [required]="true"
          >
            <p-select
              inputId="t_div"
              formControlName="divisionId"
              [options]="divisionOptions()"
              optionLabel="label"
              optionValue="id"
              appendTo="body"
              [fluid]="true"
              placeholder="Choose"
            />
          </app-form-field>
          <app-form-field
            label="Role"
            for="t_role"
            hint="Class teacher, or the subject they teach."
          >
            <p-select
              inputId="t_role"
              formControlName="subjectId"
              [options]="roleOptions()"
              optionLabel="label"
              optionValue="id"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
        } @else {
          <p class="text-sm text-muted-foreground">
            {{ changing()!.division.class.name }}-{{ changing()!.division.name }},
            {{ changing()!.subject?.name ?? 'class teacher' }}. Now:
            {{ changing()!.staff.fullName }}.
          </p>
        }
        <app-form-field
          label="Teacher"
          for="t_staff"
          [control]="form.controls.staffId"
          [required]="true"
        >
          <p-select
            inputId="t_staff"
            formControlName="staffId"
            [options]="staff()"
            optionLabel="fullName"
            optionValue="id"
            [filter]="true"
            filterBy="fullName"
            appendTo="body"
            [fluid]="true"
            placeholder="Choose a member of staff"
          />
        </app-form-field>
        @if (error()) {
          <p-message severity="error" [text]="error()!" />
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="dialogOpen.set(false)"
          />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class TeachingTab {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<Assignment[]>([]);
  protected readonly loading = signal(false);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly subjects = signal<Subject[]>([]);
  protected readonly staff = signal<StaffMember[]>([]);

  protected readonly divisionOptions = computed(() =>
    this.classes().flatMap((c) =>
      c.divisions.map((d) => ({ id: d.id, label: `${c.name}-${d.name}` })),
    ),
  );
  protected readonly roleOptions = computed(() => [
    { id: '', label: 'Class teacher' },
    ...this.subjects().map((s) => ({ id: s.id, label: s.name })),
  ]);

  protected readonly dialogOpen = signal(false);
  protected readonly changing = signal<Assignment | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    divisionId: ['', Validators.required],
    subjectId: [''],
    staffId: ['', Validators.required],
  });

  private divisionFilter: string | null = null;

  constructor() {
    void this.refresh();
    firstValueFrom(this.api.classes())
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
    firstValueFrom(this.api.subjects())
      .then((s) => this.subjects.set(s))
      .catch(() => undefined);
    // Only people who may manage staff can list them; for everyone else this stays empty.
    firstValueFrom(this.api.staffList({ page: 1, pageSize: 100, status: 'ACTIVE' }))
      .then((p) => this.staff.set(p.items))
      .catch(() => undefined);
  }

  protected onDivision(id: string | null) {
    this.divisionFilter = id;
    void this.refresh();
  }

  protected openAssign() {
    this.error.set(null);
    this.changing.set(null);
    this.form.reset({ divisionId: this.divisionFilter ?? '', subjectId: '', staffId: '' });
    this.form.controls.divisionId.enable();
    this.dialogOpen.set(true);
  }

  protected openChange(a: Assignment) {
    this.error.set(null);
    this.changing.set(a);
    this.form.reset({ divisionId: a.division.id, subjectId: a.subject?.id ?? '', staffId: '' });
    this.dialogOpen.set(true);
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const changing = this.changing();

    this.saving.set(true);
    this.error.set(null);
    try {
      if (changing) {
        await firstValueFrom(this.api.changeTeacher(changing.id, v.staffId));
      } else {
        await firstValueFrom(
          this.api.assign({
            staffId: v.staffId,
            divisionId: v.divisionId,
            ...(v.subjectId ? { subjectId: v.subjectId } : {}),
          }),
        );
      }
      this.dialogOpen.set(false);
      this.toast.add({ severity: 'success', summary: 'Saved' });
      await this.refresh();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmRemove(a: Assignment) {
    this.confirmation.confirm({
      header: 'Remove assignment',
      message: `Remove ${a.staff.fullName} as ${a.subject?.name ?? 'class teacher'} of ${a.division.class.name}-${a.division.name}? They stop seeing that division's students.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.removeAssignment(a.id));
          await this.refresh();
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not remove',
            detail: apiError(error),
          });
        }
      },
    });
  }

  private async refresh() {
    this.loading.set(true);
    try {
      this.rows.set(
        await firstValueFrom(this.api.assignments({ divisionId: this.divisionFilter })),
      );
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not load assignments',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
