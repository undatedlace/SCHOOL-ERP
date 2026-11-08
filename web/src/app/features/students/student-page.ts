import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  Gender,
  PortalAccount,
  Relationship,
  StudentDetail,
  StudentGuardian,
} from '../../core/models';
import { ageText, formatDate, fromIsoDate, toIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { StudentDocuments } from './student-documents';
import { StudentFees } from './student-fees';
import { FormField } from '../../shared/ui/form-field';
import { TempPassword, TempPasswordDialog } from '../../shared/ui/temp-password-dialog';
import { GENDERS, RELATIONSHIPS, genderLabel, relationshipLabel } from '../../shared/ui/labels';

@Component({
  selector: 'app-student-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    FormField,
    HasPermission,
    TempPasswordDialog,
    StudentDocuments,
    StudentFees,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/students" class="text-sm text-muted-foreground hover:text-foreground"
      >&larr; All students</a
    >

    @if (error()) {
      <p-message class="mt-4 block" severity="error" [text]="error()!" />
    } @else if (student(); as s) {
      <div class="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-4">
          @if (s.photoFileId) {
            <img
              [src]="'/api/files/' + s.photoFileId"
              [alt]="'Photograph of ' + s.fullName"
              class="h-24 w-20 shrink-0 rounded-lg border object-cover"
            />
          }
          <div>
            <h1 class="text-2xl font-semibold">{{ s.fullName }}</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Admission no. {{ s.admissionNo }}
              @if (s.enrollments[0]; as e) {
                &middot; {{ e.class.name }}-{{ e.division.name }} ({{ e.academicYear.name }})
              }
            </p>
            <p class="text-sm text-muted-foreground">
              Born {{ format(s.dateOfBirth) }} ({{ age(s.dateOfBirth) }} old)
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <p-tag
            [value]="s.status === 'ACTIVE' ? 'Active' : 'Left'"
            [severity]="s.status === 'ACTIVE' ? 'success' : 'secondary'"
          />
          <ng-container *appHasPermission="'students.manage'">
            <p-button label="Edit" size="small" severity="secondary" (onClick)="openEdit(s)" />
            @if (s.status === 'ACTIVE') {
              <p-button
                label="Mark as left"
                size="small"
                severity="danger"
                [outlined]="true"
                (onClick)="confirmLeft(s)"
              />
            } @else {
              <p-button label="Rejoin" size="small" severity="secondary" (onClick)="rejoin(s)" />
            }
          </ng-container>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="rounded-lg border bg-card p-5 lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-semibold">Parents and guardians</h2>
            <p-button
              *appHasPermission="'students.manage'"
              label="Add"
              size="small"
              severity="secondary"
              (onClick)="openGuardian(null)"
            />
          </div>
          <p-table [value]="s.guardians">
            <ng-template #header>
              <tr>
                <th>Name</th>
                <th>Relationship</th>
                <th>Contact</th>
                <th><span class="sr-only">Actions</span></th>
              </tr>
            </ng-template>
            <ng-template #body let-g>
              <tr>
                <td>
                  <span class="font-medium">{{ g.fullName }}</span>
                  @if (g.isPrimary) {
                    <p-tag class="ml-2" value="Primary" severity="info" />
                  }
                  @if (g.occupation) {
                    <div class="text-xs text-muted-foreground">{{ g.occupation }}</div>
                  }
                </td>
                <td>{{ relationship(g.relationship) }}</td>
                <td class="text-sm">
                  <div>{{ g.mobile }}</div>
                  <div class="text-muted-foreground">{{ g.email }}</div>
                  @if (g.hasLogin) {
                    <p-tag class="mt-1" value="Can sign in" severity="secondary" />
                  }
                </td>
                <td class="whitespace-nowrap text-right" *appHasPermission="'students.manage'">
                  <ng-container *appHasPermission="'portal.accounts.manage'">
                    @if (g.hasLogin) {
                      <p-button
                        label="Reset password"
                        size="small"
                        [text]="true"
                        (onClick)="resetGuardian(s, g)"
                      />
                    } @else if (g.mobile) {
                      <p-button
                        label="Give login"
                        size="small"
                        [text]="true"
                        (onClick)="giveLogin(s, g)"
                      />
                    }
                  </ng-container>
                  <p-button label="Edit" size="small" [text]="true" (onClick)="openGuardian(g)" />
                  <p-button
                    label="Remove"
                    size="small"
                    severity="danger"
                    [text]="true"
                    (onClick)="confirmUnlink(s, g)"
                  />
                </td>
              </tr>
            </ng-template>
          </p-table>
        </section>

        <app-student-fees [studentId]="s.id" />

        <aside class="flex flex-col gap-6">
          <app-student-documents [studentId]="s.id" />

          <section
            class="rounded-lg border bg-card p-5"
            *appHasPermission="'portal.accounts.manage'"
          >
            <h2 class="mb-1 font-semibold">Student login</h2>
            <p class="mb-3 text-sm text-muted-foreground">
              The student signs in with the admission number ({{ s.admissionNo }}) and can only see
              their own records.
            </p>
            @if (s.hasLogin) {
              <p-button
                label="Reset password"
                size="small"
                severity="secondary"
                (onClick)="resetStudent(s)"
              />
            } @else if (s.status === 'ACTIVE') {
              <p-button
                label="Give login"
                size="small"
                severity="secondary"
                [loading]="saving()"
                (onClick)="giveStudentLogin(s)"
              />
            } @else {
              <p class="text-sm text-muted-foreground">A student who has left has no login.</p>
            }
          </section>

          <section class="rounded-lg border bg-card p-5">
            <h2 class="mb-3 font-semibold">Details</h2>
            <dl class="grid gap-3 text-sm">
              <div>
                <dt class="text-xs text-muted-foreground">Gender</dt>
                <dd>{{ gender(s.gender) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Joined</dt>
                <dd>{{ format(s.joinedOn) }}</dd>
              </div>
              @if (s.leftOn) {
                <div>
                  <dt class="text-xs text-muted-foreground">Left</dt>
                  <dd>{{ format(s.leftOn) }}</dd>
                </div>
              }
              @if (s.application) {
                <div>
                  <dt class="text-xs text-muted-foreground">Admission application</dt>
                  <dd>
                    <a
                      class="underline-offset-4 hover:underline"
                      [routerLink]="['/app/admissions', s.application.id]"
                      >Form no. {{ s.application.formNo }}</a
                    >
                  </dd>
                </div>
              }
            </dl>
          </section>

          <section class="rounded-lg border bg-card p-5">
            <h2 class="mb-3 font-semibold">Class history</h2>
            <ul class="grid gap-2 text-sm">
              @for (e of s.enrollments; track e.id) {
                <li>
                  <span class="font-medium">{{ e.academicYear.name }}</span
                  >: {{ e.class.name }}-{{ e.division.name }}
                  <span class="block text-xs text-muted-foreground"
                    >from {{ format(e.startedOn) }}</span
                  >
                </li>
              }
            </ul>
          </section>
        </aside>
      </div>

      <p-dialog
        header="Edit student"
        [(visible)]="editOpen"
        [modal]="true"
        [style]="{ width: '34rem', 'max-width': '95vw' }"
      >
        <form [formGroup]="editForm" (ngSubmit)="saveEdit()" class="flex flex-col gap-4" novalidate>
          <div class="grid gap-4 sm:grid-cols-3">
            <app-form-field
              label="First name"
              for="e_first"
              [control]="editForm.controls.firstName"
              [required]="true"
            >
              <input pInputText id="e_first" formControlName="firstName" [fluid]="true" />
            </app-form-field>
            <app-form-field label="Father's name" for="e_father">
              <input pInputText id="e_father" formControlName="fatherName" [fluid]="true" />
            </app-form-field>
            <app-form-field
              label="Surname"
              for="e_sur"
              [control]="editForm.controls.surname"
              [required]="true"
            >
              <input pInputText id="e_sur" formControlName="surname" [fluid]="true" />
            </app-form-field>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <app-form-field label="Gender" for="e_gender">
              <p-select
                inputId="e_gender"
                formControlName="gender"
                [options]="genders"
                optionLabel="label"
                optionValue="value"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
            <app-form-field
              label="Date of birth"
              for="e_dob"
              [control]="editForm.controls.dateOfBirth"
              [required]="true"
            >
              <p-datepicker
                inputId="e_dob"
                formControlName="dateOfBirth"
                dateFormat="dd/mm/yy"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
          </div>
          <app-form-field
            label="Admission number"
            for="e_adm"
            [control]="editForm.controls.admissionNo"
            [required]="true"
            [error]="editError()"
          >
            <input pInputText id="e_adm" formControlName="admissionNo" [fluid]="true" />
          </app-form-field>
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="editOpen.set(false)"
            />
            <p-button type="submit" label="Save" [loading]="saving()" />
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [header]="editingGuardian() ? 'Edit guardian' : 'Add guardian'"
        [(visible)]="guardianOpen"
        [modal]="true"
        [style]="{ width: '30rem', 'max-width': '95vw' }"
      >
        <form
          [formGroup]="guardianForm"
          (ngSubmit)="saveGuardian()"
          class="flex flex-col gap-4"
          novalidate
        >
          <app-form-field
            label="Full name"
            for="g_name"
            [control]="guardianForm.controls.fullName"
            [required]="true"
          >
            <input pInputText id="g_name" formControlName="fullName" [fluid]="true" />
          </app-form-field>
          @if (!editingGuardian()) {
            <app-form-field label="Relationship" for="g_rel">
              <p-select
                inputId="g_rel"
                formControlName="relationship"
                [options]="relationships"
                optionLabel="label"
                optionValue="value"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
          }
          <div class="grid gap-4 sm:grid-cols-2">
            <app-form-field label="Mobile" for="g_mob" [control]="guardianForm.controls.mobile">
              <input
                pInputText
                id="g_mob"
                formControlName="mobile"
                inputmode="tel"
                [fluid]="true"
              />
            </app-form-field>
            <app-form-field label="Email" for="g_email" [control]="guardianForm.controls.email">
              <input pInputText id="g_email" type="email" formControlName="email" [fluid]="true" />
            </app-form-field>
          </div>
          <app-form-field label="Occupation" for="g_occ">
            <input pInputText id="g_occ" formControlName="occupation" [fluid]="true" />
          </app-form-field>
          @if (guardianError()) {
            <p-message severity="error" [text]="guardianError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="guardianOpen.set(false)"
            />
            <p-button type="submit" label="Save" [loading]="saving()" />
          </div>
        </form>
      </p-dialog>
      <app-temp-password-dialog [info]="temp()" (closed)="temp.set(null)" />
    } @else {
      <p class="mt-4 text-muted-foreground">Loading...</p>
    }
  `,
})
export class StudentPage {
  /** From the route: /app/students/:id */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  protected readonly format = formatDate;
  protected readonly age = (dob: string) => ageText(dob);
  protected readonly gender = genderLabel;
  protected readonly relationship = relationshipLabel;
  protected readonly genders = GENDERS;
  protected readonly relationships = RELATIONSHIPS;

  protected readonly student = signal<StudentDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly temp = signal<TempPassword | null>(null);

  protected readonly editOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    fatherName: ['', Validators.maxLength(60)],
    surname: ['', [Validators.required, Validators.maxLength(60)]],
    gender: ['MALE' as Gender],
    dateOfBirth: [null as Date | null, Validators.required],
    admissionNo: ['', [Validators.required, Validators.maxLength(30)]],
  });

  protected readonly guardianOpen = signal(false);
  protected readonly editingGuardian = signal<StudentGuardian | null>(null);
  protected readonly guardianError = signal<string | null>(null);
  protected readonly guardianForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    relationship: ['FATHER' as Relationship],
    mobile: ['', Validators.pattern(/^(\+?[0-9]{10,15})?$/)],
    email: ['', Validators.email],
    occupation: ['', Validators.maxLength(100)],
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  private async load(id: string) {
    this.error.set(null);
    this.student.set(null);
    try {
      this.student.set(await firstValueFrom(this.api.student(id)));
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This student was not found.'
          : apiError(error),
      );
    }
  }

  // ---------- details ----------

  protected openEdit(s: StudentDetail) {
    this.editError.set(null);
    this.editForm.reset({
      firstName: s.firstName,
      fatherName: s.fatherName ?? '',
      surname: s.surname,
      gender: s.gender,
      dateOfBirth: fromIsoDate(s.dateOfBirth),
      admissionNo: s.admissionNo,
    });
    this.editOpen.set(true);
  }

  protected async saveEdit() {
    const s = this.student();
    this.editForm.markAllAsTouched();
    if (!s || this.editForm.invalid || this.saving()) return;
    const v = this.editForm.getRawValue();

    this.saving.set(true);
    this.editError.set(null);
    try {
      this.student.set(
        await firstValueFrom(
          this.api.updateStudent(s.id, {
            firstName: v.firstName.trim(),
            ...(v.fatherName.trim() ? { fatherName: v.fatherName.trim() } : {}),
            surname: v.surname.trim(),
            gender: v.gender,
            dateOfBirth: toIsoDate(v.dateOfBirth as Date),
            admissionNo: v.admissionNo.trim(),
          }),
        ),
      );
      this.editOpen.set(false);
      this.toast.add({ severity: 'success', summary: 'Student updated' });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409)
        this.editError.set(apiError(error));
      else
        this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmLeft(s: StudentDetail) {
    this.confirmation.confirm({
      header: 'Mark as left',
      message: `Record that ${s.fullName} has left the school today? Their history is kept, and you can undo this.`,
      acceptLabel: 'Mark as left',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.setStatus(s, 'LEFT'),
    });
  }

  protected rejoin(s: StudentDetail) {
    void this.setStatus(s, 'ACTIVE');
  }

  private async setStatus(s: StudentDetail, status: 'ACTIVE' | 'LEFT') {
    try {
      this.student.set(await firstValueFrom(this.api.updateStudent(s.id, { status })));
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not change the status',
        detail: apiError(error),
      });
    }
  }

  // ---------- guardians ----------

  protected openGuardian(g: StudentGuardian | null) {
    this.guardianError.set(null);
    this.editingGuardian.set(g);
    this.guardianForm.reset({
      fullName: g?.fullName ?? '',
      relationship: g?.relationship ?? 'FATHER',
      mobile: g?.mobile ?? '',
      email: g?.email ?? '',
      occupation: g?.occupation ?? '',
    });
    this.guardianOpen.set(true);
  }

  protected async saveGuardian() {
    const s = this.student();
    this.guardianForm.markAllAsTouched();
    if (!s || this.guardianForm.invalid || this.saving()) return;
    const v = this.guardianForm.getRawValue();
    const contact = {
      ...(v.mobile.trim() ? { mobile: v.mobile.trim() } : {}),
      ...(v.email.trim() ? { email: v.email.trim() } : {}),
      ...(v.occupation.trim() ? { occupation: v.occupation.trim() } : {}),
    };
    const editing = this.editingGuardian();

    this.saving.set(true);
    this.guardianError.set(null);
    try {
      if (editing) {
        await firstValueFrom(
          this.api.updateGuardian(editing.id, { fullName: v.fullName.trim(), ...contact }),
        );
        this.student.set(await firstValueFrom(this.api.student(s.id)));
      } else {
        this.student.set(
          await firstValueFrom(
            this.api.addGuardian(s.id, {
              fullName: v.fullName.trim(),
              relationship: v.relationship,
              ...contact,
            }),
          ),
        );
      }
      this.guardianOpen.set(false);
    } catch (error) {
      this.guardianError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- logins ----------

  protected async giveLogin(s: StudentDetail, g: StudentGuardian) {
    await this.issue(s, g.fullName, () => this.api.guardianAccount(g.id));
  }

  protected async giveStudentLogin(s: StudentDetail) {
    await this.issue(s, s.fullName, () => this.api.studentAccount(s.id));
  }

  protected resetGuardian(s: StudentDetail, g: StudentGuardian) {
    this.confirmReset(s, g.fullName, () => this.api.resetGuardianPassword(g.id));
  }

  protected resetStudent(s: StudentDetail) {
    this.confirmReset(s, s.fullName, () => this.api.resetStudentPassword(s.id));
  }

  private confirmReset(s: StudentDetail, name: string, call: () => Observable<PortalAccount>) {
    this.confirmation.confirm({
      header: 'Reset password',
      message: `Give ${name} a new temporary password? Their current password stops working and they are signed out.`,
      acceptLabel: 'Reset',
      rejectLabel: 'Cancel',
      accept: () => this.issue(s, name, call),
    });
  }

  /** Runs a login call, then shows the temporary password once (or says the login was shared). */
  private async issue(s: StudentDetail, name: string, call: () => Observable<PortalAccount>) {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const result = await firstValueFrom(call());
      this.student.set(await firstValueFrom(this.api.student(s.id)));
      if (result.temporaryPassword) {
        this.temp.set({ name, password: result.temporaryPassword, loginId: result.loginId });
      } else {
        this.toast.add({
          severity: 'success',
          summary: 'Login shared',
          detail: `${name} signs in with the same mobile number and password as the other parent.`,
        });
      }
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not give a login',
        detail: apiError(error),
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmUnlink(s: StudentDetail, g: StudentGuardian) {
    this.confirmation.confirm({
      header: 'Remove guardian',
      message: `Remove ${g.fullName} from ${s.fullName}? They stay linked to any other children.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.unlinkGuardian(s.id, g.id));
          this.student.set(await firstValueFrom(this.api.student(s.id)));
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
}
