import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { Api } from '../../core/api';
import { SchoolClass } from '../../core/models';
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
import { StudentAttendanceSection } from './student-attendance';
import { StudentFees } from './student-fees';
import { FormField } from '../../shared/ui/form-field';
import { Avatar } from '../../shared/ui/avatar';
import { Badge, BadgeTone, ClassPill } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthService } from '../../core/auth.service';
import { TempPassword, TempPasswordDialog } from '../../shared/ui/temp-password-dialog';
import { GENDERS, RELATIONSHIPS, genderLabel, relationshipLabel } from '../../shared/ui/labels';
import { TextareaModule } from '@openng/optimus-ui/textarea';

@Component({
  selector: 'app-student-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    FormField,
    HasPermission,
    TempPasswordDialog,
    StudentDocuments,
    StudentFees,
    StudentAttendanceSection,
    Avatar,
    Badge,
    ClassPill,
    Icon,
    PageHeader,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <app-page-header
        title="Student"
        [crumbs]="[
          { label: 'Dashboard', link: '/app/dashboard' },
          { label: 'Students', link: '/app/students' },
          { label: 'Not found' },
        ]"
      />
      <p-message severity="error" [text]="error()!" />
    } @else if (student(); as s) {
      <nav aria-label="Breadcrumb" class="mb-3 text-[13px] font-medium text-muted-foreground">
        <ol class="flex flex-wrap items-center gap-1.5">
          <li>
            <a routerLink="/app/dashboard" class="hover:text-foreground hover:underline"
              >Dashboard</a
            >
          </li>
          <li aria-hidden="true" class="text-faint">/</li>
          <li>
            <a routerLink="/app/students" class="hover:text-foreground hover:underline">Students</a>
          </li>
          <li aria-hidden="true" class="text-faint">/</li>
          <li class="text-foreground" aria-current="page">{{ s.fullName }}</li>
        </ol>
      </nav>

      <section class="mb-6 rounded-2xl bg-card p-6 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-6">
          <div class="flex min-w-0 items-start gap-5">
            @if (s.photoFileId) {
              <img
                [src]="'/api/files/' + s.photoFileId"
                [alt]="'Photograph of ' + s.fullName"
                class="h-24 w-20 shrink-0 rounded-xl border object-cover"
              />
            } @else {
              <app-avatar [name]="s.fullName" size="lg" />
            }
            <div class="min-w-0">
              <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">
                {{ s.fullName }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                @if (s.enrollments[0]; as e) {
                  <app-class-pill [label]="e.class.name + '-' + e.division.name" />
                }
                <app-badge [label]="statusText(s.status)" [tone]="statusTone(s.status)" />
                <span class="text-muted-foreground">Student ID {{ s.admissionNo }}</span>
                @if (s.schoolEmail) {
                  <span class="text-muted-foreground">&middot; {{ s.schoolEmail }}</span>
                }
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                Born {{ format(s.dateOfBirth) }} ({{ age(s.dateOfBirth) }} old) &middot; Joined
                {{ format(s.joinedOn) }}
                @if (s.enrollments[0]; as e) {
                  &middot; {{ e.academicYear.name }}
                }
              </p>
            </div>
          </div>

          <dl class="grid grid-cols-3 divide-x overflow-hidden rounded-xl border text-sm">
            <div class="px-4 py-3">
              <dt class="text-xs text-muted-foreground">Class this year</dt>
              <dd class="mt-1 text-lg font-bold">
                @if (s.enrollments[0]; as e) {
                  {{ e.class.name }}-{{ e.division.name }}
                } @else {
                  &mdash;
                }
              </dd>
            </div>
            <div class="px-4 py-3">
              <dt class="text-xs text-muted-foreground">Parents</dt>
              <dd class="mt-1 text-lg font-bold">{{ s.guardians.length }}</dd>
            </div>
            <div class="px-4 py-3">
              <dt class="text-xs text-muted-foreground">Years here</dt>
              <dd class="mt-1 text-lg font-bold">{{ s.enrollments.length }}</dd>
            </div>
          </dl>
        </div>

        @if (s.status !== 'REMOVED' || canRemove) {
          <div class="mt-5 flex flex-wrap items-center gap-2 border-t pt-5">
            @if (s.status !== 'REMOVED') {
              <ng-container *appHasPermission="'students.manage'">
                <p-button label="Edit" size="small" (onClick)="openEdit(s)" />
                @if (s.status === 'ACTIVE') {
                  <p-button
                    label="Move to another division"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    (onClick)="openMove(s)"
                  />
                  <p-button
                    label="Mark as left"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    (onClick)="confirmLeft(s)"
                  />
                } @else {
                  <p-button
                    label="Rejoin"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    (onClick)="rejoin(s)"
                  />
                }
              </ng-container>
            }
            <span class="flex-1"></span>
            <ng-container *appHasPermission="'students.remove'">
              @if (s.status === 'REMOVED') {
                <p-button label="Restore student" size="small" (onClick)="restore(s)" />
              } @else {
                <p-button
                  label="Remove student"
                  size="small"
                  severity="danger"
                  [text]="true"
                  (onClick)="openRemove()"
                />
              }
            </ng-container>
          </div>
        }
      </section>

      @if (s.removal; as r) {
        <p-message
          class="mb-4 block"
          severity="warn"
          [text]="
            'Removed' +
            (r.by ? ' by ' + r.by : '') +
            ' on ' +
            format(r.at) +
            '. Reason: ' +
            r.reason +
            '. Their records are kept; an administrator can restore them.'
          "
        />
      }

      @if (moveNote(); as note) {
        <p-message class="mb-4 block" severity="info" [text]="note" />
      }

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div class="flex min-w-0 flex-col gap-6">
          <section class="rounded-xl bg-card p-5 shadow-sm">
            <h2 class="mb-2 text-base font-bold">Details</h2>
            <dl class="text-sm">
              <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                <dt class="text-muted-foreground">Date of birth</dt>
                <dd>{{ format(s.dateOfBirth) }} ({{ age(s.dateOfBirth) }})</dd>
              </div>
              <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                <dt class="text-muted-foreground">Gender</dt>
                <dd>{{ gender(s.gender) }}</dd>
              </div>
              @if (s.enrollments[0]; as e) {
                <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                  <dt class="text-muted-foreground">Class</dt>
                  <dd>{{ e.class.name }}, division {{ e.division.name }}</dd>
                </div>
              }
              <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                <dt class="text-muted-foreground">Joined</dt>
                <dd>{{ format(s.joinedOn) }}</dd>
              </div>
              @if (s.leftOn) {
                <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                  <dt class="text-muted-foreground">Left</dt>
                  <dd>{{ format(s.leftOn) }}</dd>
                </div>
              }
              @if (s.schoolEmail) {
                <div class="grid grid-cols-[9rem_1fr] gap-3 border-b py-2.5">
                  <dt class="text-muted-foreground">School e-mail</dt>
                  <dd class="break-all">{{ s.schoolEmail }}</dd>
                </div>
              }
              @if (s.application) {
                <div class="grid grid-cols-[9rem_1fr] gap-3 py-2.5">
                  <dt class="text-muted-foreground">Admission</dt>
                  <dd>
                    <a class="app-link" [routerLink]="['/app/admissions', s.application.id]"
                      >Form no. {{ s.application.formNo }}</a
                    >
                  </dd>
                </div>
              }
            </dl>
          </section>

          <section class="rounded-xl bg-card p-5 shadow-sm">
            <div class="mb-1 flex items-center justify-between">
              <h2 class="text-base font-bold">Parents and guardians</h2>
              <p-button
                *appHasPermission="'students.manage'"
                label="Add"
                size="small"
                severity="secondary"
                [text]="true"
                (onClick)="openGuardian(null)"
              />
            </div>
            @if (!s.guardians.length) {
              <p class="py-2 text-sm text-muted-foreground">No parent or guardian recorded yet.</p>
            }
            <ul>
              @for (g of s.guardians; track g.id) {
                <li class="flex gap-3 border-t py-4 first:border-t-0">
                  <app-avatar [name]="g.fullName" size="sm" />
                  <div class="min-w-0 flex-1 text-sm">
                    <p class="flex flex-wrap items-center gap-2 font-semibold">
                      {{ g.fullName }}
                      @if (g.isPrimary) {
                        <app-badge label="Primary contact" tone="amber" [dot]="false" />
                      }
                      @if (g.hasLogin) {
                        <app-badge label="Can sign in" tone="neutral" [dot]="false" />
                      }
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {{ relationship(g.relationship) }}
                      @if (g.occupation) {
                        &middot; {{ g.occupation }}
                      }
                    </p>
                    @if (g.mobile) {
                      <p class="mt-2 flex items-center gap-2 text-foreground-2">
                        <app-icon name="phone" class="text-muted-foreground" />
                        <a class="hover:underline" [href]="'tel:' + g.mobile">{{ g.mobile }}</a>
                      </p>
                    }
                    @if (g.email) {
                      <p class="mt-1 flex items-center gap-2 break-all text-foreground-2">
                        <app-icon name="mail" class="text-muted-foreground" />{{ g.email }}
                      </p>
                    }
                    <div class="mt-2 -ml-2 flex flex-wrap" *appHasPermission="'students.manage'">
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
                      <p-button
                        label="Edit"
                        size="small"
                        [text]="true"
                        (onClick)="openGuardian(g)"
                      />
                      <p-button
                        label="Remove"
                        size="small"
                        severity="danger"
                        [text]="true"
                        (onClick)="confirmUnlink(s, g)"
                      />
                    </div>
                  </div>
                </li>
              }
            </ul>
          </section>

          <section
            class="rounded-xl bg-card p-5 shadow-sm"
            *appHasPermission="'portal.accounts.manage'"
          >
            <h2 class="mb-1 text-base font-bold">Student login</h2>
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

          <section class="rounded-xl bg-card p-5 shadow-sm">
            <h2 class="mb-3 text-base font-bold">Class history</h2>
            <ol class="relative ml-1.5 border-l pl-5 text-sm">
              @for (e of s.enrollments; track e.id; let first = $first) {
                <li class="relative pb-4 last:pb-0">
                  <span
                    class="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-card"
                    [class.bg-primary]="first"
                    [class.bg-border-strong]="!first"
                    aria-hidden="true"
                  ></span>
                  <span class="font-semibold">{{ e.academicYear.name }}</span
                  >: {{ e.class.name }}-{{ e.division.name }}
                  <span class="block text-xs text-muted-foreground"
                    >from {{ format(e.startedOn) }}</span
                  >
                </li>
              }
            </ol>
          </section>
        </div>

        <div class="flex min-w-0 flex-col gap-6">
          <app-student-attendance [studentId]="s.id" />
          <app-student-fees [studentId]="s.id" />
          <app-student-documents [studentId]="s.id" />
        </div>
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
      <p-dialog
        header="Move to another division"
        [visible]="moveOpen()"
        (visibleChange)="!$event && moveOpen.set(false)"
        [modal]="true"
        [style]="{ width: '28rem', 'max-width': '95vw' }"
      >
        <p class="mb-3 text-sm text-muted-foreground">
          This changes the class for this academic year. The old division's attendance days stay
          with the student; fees already billed are not changed.
        </p>
        <div class="mb-3 flex flex-col gap-3">
          <div class="flex flex-col gap-1 text-sm">
            <span>Class</span>
            <p-select
              inputId="move-class"
              [options]="classes()"
              optionLabel="name"
              optionValue="id"
              placeholder="Choose a class"
              [ngModel]="moveClassId() || null"
              (ngModelChange)="moveClassId.set($event ?? ''); moveDivisionId.set('')"
              ariaLabel="Class"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Division</span>
            <p-select
              inputId="move-division"
              [options]="moveDivisions()"
              optionLabel="name"
              optionValue="id"
              placeholder="Choose a division"
              [disabled]="!moveClassId()"
              [ngModel]="moveDivisionId() || null"
              (ngModelChange)="moveDivisionId.set($event ?? '')"
              ariaLabel="Division"
              appendTo="body"
              [fluid]="true"
            />
          </div>
        </div>
        @if (moveError()) {
          <p class="mb-3 text-sm text-destructive" role="alert">{{ moveError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="moveOpen.set(false)" />
          <p-button
            label="Move student"
            [disabled]="!moveDivisionId()"
            [loading]="saving()"
            (onClick)="move()"
          />
        </div>
      </p-dialog>

      <p-dialog
        header="Remove this student?"
        [visible]="removeOpen()"
        (visibleChange)="!$event && removeOpen.set(false)"
        [modal]="true"
        [style]="{ width: '30rem', 'max-width': '95vw' }"
      >
        <p class="mb-3 text-sm text-muted-foreground">
          The student disappears from the lists and their login is switched off. Fees, receipts and
          attendance are kept, and an administrator can restore them later.
        </p>
        <label class="mb-3 flex flex-col gap-1 text-sm" for="remove-reason">
          Reason (required)
          <textarea
            id="remove-reason"
            rows="3"
            maxlength="300"
            pTextarea
            [fluid]="true"
            [value]="removeReason()"
            (input)="removeReason.set($any($event.target).value)"
          ></textarea>
        </label>
        @if (removeError()) {
          <p class="mb-3 text-sm text-destructive" role="alert">{{ removeError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="removeOpen.set(false)" />
          <p-button
            label="Remove student"
            severity="danger"
            [disabled]="removeReason().trim().length < 3"
            [loading]="saving()"
            (onClick)="remove()"
          />
        </div>
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

  protected readonly canRemove = inject(AuthService).has('students.remove');
  protected readonly statusText = (s: string) =>
    s === 'ACTIVE' ? 'Active' : s === 'REMOVED' ? 'Removed' : 'Left';
  protected readonly statusTone = (s: string): BadgeTone =>
    s === 'ACTIVE' ? 'good' : s === 'REMOVED' ? 'bad' : 'neutral';
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

  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly moveOpen = signal(false);
  protected readonly moveClassId = signal('');
  protected readonly moveDivisionId = signal('');
  protected readonly moveError = signal<string | null>(null);
  /** What to tell the person after a move, for example that fees were billed for the old class. */
  protected readonly moveNote = signal<string | null>(null);
  protected readonly moveDivisions = computed(
    () => this.classes().find((c) => c.id === this.moveClassId())?.divisions ?? [],
  );
  protected readonly removeOpen = signal(false);
  protected readonly removeReason = signal('');
  protected readonly removeError = signal<string | null>(null);

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

  protected async openMove(s: StudentDetail) {
    void s;
    this.moveError.set(null);
    this.moveClassId.set('');
    this.moveDivisionId.set('');
    this.moveOpen.set(true);
    if (this.classes().length === 0) {
      try {
        this.classes.set(await firstValueFrom(this.api.classes()));
      } catch (error) {
        this.moveError.set(apiError(error));
      }
    }
  }

  protected async move() {
    const s = this.student();
    if (!s || !this.moveDivisionId() || this.saving()) return;
    this.saving.set(true);
    this.moveError.set(null);
    try {
      const res = await firstValueFrom(this.api.moveStudent(s.id, this.moveDivisionId()));
      this.student.set(res);
      this.moveOpen.set(false);
      this.toast.add({ severity: 'success', summary: `Moved to ${res.moved.to}` });
      this.moveNote.set(
        res.moved.feesNeedReview
          ? `Moved from ${res.moved.from} to ${res.moved.to}. Fees were billed for the old class, so ask the accountant to check them.`
          : null,
      );
    } catch (error) {
      this.moveError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected openRemove() {
    this.removeReason.set('');
    this.removeError.set(null);
    this.removeOpen.set(true);
  }

  protected async remove() {
    const s = this.student();
    if (!s || this.saving()) return;
    this.saving.set(true);
    this.removeError.set(null);
    try {
      this.student.set(
        await firstValueFrom(this.api.removeStudent(s.id, this.removeReason().trim())),
      );
      this.removeOpen.set(false);
      this.toast.add({ severity: 'success', summary: 'Student removed' });
    } catch (error) {
      this.removeError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async restore(s: StudentDetail) {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      this.student.set(await firstValueFrom(this.api.restoreStudent(s.id)));
      this.toast.add({ severity: 'success', summary: 'Student restored' });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not restore', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
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
