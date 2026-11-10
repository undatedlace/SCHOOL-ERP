import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { MessageModule } from '@openng/optimus-ui/message';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Assignment, StaffMember } from '../../core/models';
import { ageText, formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { AnswerView } from '../../shared/forms/answer-view';
import { FormField } from '../../shared/ui/form-field';
import { genderLabel } from '../../shared/ui/labels';
import { TempPassword, TempPasswordDialog } from '../../shared/ui/temp-password-dialog';
import { AuthService } from '../../core/auth.service';
import { grantableRoles } from '../../core/admin-roles';
import { STAFF_ROLE_OPTIONS, StaffForm } from './staff-form';

@Component({
  selector: 'app-staff-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    MessageModule,
    MultiSelectModule,
    TagModule,
    FormField,
    HasPermission,
    StaffForm,
    TempPasswordDialog,
    AnswerView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/staff" class="text-sm text-muted-foreground hover:text-foreground"
      >&larr; All staff</a
    >

    @if (error()) {
      <p-message class="mt-4 block" severity="error" [text]="error()!" />
    } @else if (staff(); as s) {
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
              {{ s.designation }}
              @if (s.staffType) {
                &middot; {{ s.staffType.name }}
              }
              &middot; Employee no. {{ s.employeeNo }}
            </p>
            @if (s.dateOfBirth) {
              <p class="text-sm text-muted-foreground">
                Born {{ format(s.dateOfBirth) }} ({{ age(s.dateOfBirth) }} old)
              </p>
            }
          </div>
        </div>
        <div class="flex items-center gap-2">
          <p-tag
            [value]="s.status === 'ACTIVE' ? 'Active' : 'Left'"
            [severity]="s.status === 'ACTIVE' ? 'success' : 'secondary'"
          />
          <ng-container *appHasPermission="'staff.manage'">
            <p-button
              label="Edit"
              size="small"
              severity="secondary"
              (onClick)="formOpen.set(true)"
            />
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

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border-0 bg-card shadow-sm p-5">
          <h2 class="mb-3 font-semibold">Details</h2>
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
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
            @if (s.mobile) {
              <div>
                <dt class="text-xs text-muted-foreground">Mobile</dt>
                <dd>{{ s.mobile }}</dd>
              </div>
            }
            @if (s.email) {
              <div>
                <dt class="text-xs text-muted-foreground">Email</dt>
                <dd>{{ s.email }}</dd>
              </div>
            }
            @if (s.qualification) {
              <div>
                <dt class="text-xs text-muted-foreground">Qualification</dt>
                <dd>{{ s.qualification }}</dd>
              </div>
            }
            @if (s.address) {
              <div class="sm:col-span-2">
                <dt class="text-xs text-muted-foreground">Address</dt>
                <dd>{{ s.address }}</dd>
              </div>
            }
          </dl>
        </section>

        @if (s.onboarding; as o) {
          <section
            class="rounded-xl border-0 bg-card shadow-sm p-5 lg:col-span-2"
            aria-label="Onboarding details"
          >
            <h2 class="mb-1 font-semibold">{{ s.staffType?.name }} details and documents</h2>
            <p class="mb-4 text-xs text-muted-foreground">
              Visible to administrators only. Filled in with version {{ o.version }} of the form.
            </p>
            <app-answer-view [schema]="o.schema" [answers]="o.answers" />
          </section>
        }

        @if (teaching().length) {
          <section class="rounded-xl border-0 bg-card shadow-sm p-5 lg:col-span-2">
            <h2 class="mb-3 font-semibold">Teaching this year</h2>
            <ul class="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              @for (a of teaching(); track a.id) {
                <li>
                  <span class="font-medium">{{ a.division.class.name }}-{{ a.division.name }}</span>
                  <span class="text-muted-foreground">
                    &middot; {{ a.kind === 'CLASS_TEACHER' ? 'Class teacher' : a.subject?.name }}
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        <section class="rounded-xl border-0 bg-card shadow-sm p-5">
          <h2 class="mb-3 font-semibold">Login</h2>
          @if (s.account; as a) {
            <div class="flex flex-wrap items-center gap-2">
              @for (role of a.roles; track role.code) {
                <p-tag [value]="role.name" severity="secondary" />
              }
              <p-tag
                [value]="a.status === 'ACTIVE' ? 'Can sign in' : 'Switched off'"
                [severity]="a.status === 'ACTIVE' ? 'success' : 'warn'"
              />
              @if (a.mustChangePassword) {
                <p-tag value="Temporary password" severity="warn" />
              }
            </div>
            @if (a.status !== 'ACTIVE') {
              <p class="mt-3 text-xs text-muted-foreground">
                The login is switched off while the person has left. It comes back when they rejoin.
              </p>
            }
          } @else {
            <p class="text-sm text-muted-foreground">This person has no login.</p>
            @if (s.status === 'ACTIVE') {
              <ng-container *appHasPermission="'users.manage'">
                <div class="mt-3" *appHasPermission="'staff.manage'">
                  <p-button
                    label="Give a login"
                    size="small"
                    severity="secondary"
                    (onClick)="openLogin()"
                  />
                </div>
              </ng-container>
            }
          }
        </section>
      </div>

      <app-staff-form [(visible)]="formOpen" [staff]="s" (saved)="staff.set($event)" />

      <p-dialog
        header="Give a login"
        [visible]="loginOpen()"
        (visibleChange)="!$event && loginOpen.set(false)"
        [modal]="true"
        [style]="{ width: '28rem', 'max-width': '95vw' }"
      >
        <form
          [formGroup]="loginForm"
          (ngSubmit)="giveLogin()"
          class="flex flex-col gap-4"
          novalidate
        >
          <p class="text-sm text-muted-foreground">
            {{ s.fullName }} signs in with
            {{ s.email || s.mobile || 'an email address or mobile number (add one first)' }}. A
            temporary password is shown once.
          </p>
          <app-form-field
            label="Role"
            for="l_roles"
            [control]="loginForm.controls.roleCodes"
            [required]="true"
          >
            <p-multiselect
              inputId="l_roles"
              formControlName="roleCodes"
              [options]="roleOptions"
              optionLabel="name"
              optionValue="code"
              display="chip"
              placeholder="Choose one or more"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          @if (loginError()) {
            <p-message severity="error" [text]="loginError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="loginOpen.set(false)"
            />
            <p-button type="submit" label="Give login" [loading]="busy()" />
          </div>
        </form>
      </p-dialog>

      <app-temp-password-dialog [info]="temp()" (closed)="temp.set(null)" />
    } @else {
      <p class="mt-4 text-muted-foreground">Loading...</p>
    }
  `,
})
export class StaffPage {
  /** From the route: /app/staff/:id */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  protected readonly format = formatDate;
  protected readonly age = (dob: string) => ageText(dob);
  protected readonly gender = genderLabel;
  protected readonly roleOptions = grantableRoles(
    STAFF_ROLE_OPTIONS,
    inject(AuthService).has('admins.manage'),
  );

  protected readonly staff = signal<StaffMember | null>(null);
  protected readonly teaching = signal<Assignment[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);

  protected readonly loginOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly loginError = signal<string | null>(null);
  protected readonly temp = signal<TempPassword | null>(null);
  protected readonly loginForm = this.fb.nonNullable.group({ roleCodes: [[] as string[]] });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  private async load(id: string) {
    this.error.set(null);
    this.staff.set(null);
    this.teaching.set([]);
    try {
      this.staff.set(await firstValueFrom(this.api.staffMember(id)));
      // What they teach this year. Shown when it can be read; left out otherwise.
      firstValueFrom(this.api.assignments({ staffId: id }))
        .then((rows) => this.teaching.set(rows))
        .catch(() => undefined);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This staff member was not found.'
          : apiError(error),
      );
    }
  }

  protected confirmLeft(s: StaffMember) {
    this.confirmation.confirm({
      header: 'Mark as left',
      message: s.account
        ? `Record that ${s.fullName} has left today? Their login is switched off and they are signed out everywhere. Their history is kept, and you can undo this.`
        : `Record that ${s.fullName} has left today? Their history is kept, and you can undo this.`,
      acceptLabel: 'Mark as left',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.setStatus(s, 'LEFT'),
    });
  }

  protected rejoin(s: StaffMember) {
    void this.setStatus(s, 'ACTIVE');
  }

  private async setStatus(s: StaffMember, status: 'ACTIVE' | 'LEFT') {
    try {
      this.staff.set(await firstValueFrom(this.api.updateStaff(s.id, { status })));
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not change the status',
        detail: apiError(error),
      });
    }
  }

  protected openLogin() {
    this.loginError.set(null);
    this.loginForm.reset({ roleCodes: [] });
    this.loginOpen.set(true);
  }

  protected async giveLogin() {
    const s = this.staff();
    const { roleCodes } = this.loginForm.getRawValue();
    if (!s || this.busy()) return;
    if (roleCodes.length === 0) {
      this.loginError.set('Choose a role.');
      return;
    }
    this.busy.set(true);
    this.loginError.set(null);
    try {
      const updated = await firstValueFrom(this.api.addStaffAccount(s.id, roleCodes));
      this.staff.set(updated);
      this.loginOpen.set(false);
      if (updated.temporaryPassword)
        this.temp.set({ name: updated.fullName, password: updated.temporaryPassword });
    } catch (error) {
      this.loginError.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
