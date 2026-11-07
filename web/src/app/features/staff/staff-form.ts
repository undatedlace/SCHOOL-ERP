import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { Gender, NewStaff, StaffMember } from '../../core/models';
import { fromIsoDate, toIsoDate } from '../../shared/dates';
import { ImageUpload } from '../../shared/forms/image-upload';
import { FormField } from '../../shared/ui/form-field';
import { GENDERS } from '../../shared/ui/labels';

/** Roles a member of staff can be given a login with. */
export const STAFF_ROLE_OPTIONS = [
  { code: 'TEACHER', name: 'Teacher' },
  { code: 'OFFICE_STAFF', name: 'Office staff' },
  { code: 'ACCOUNTANT', name: 'Accountant' },
  { code: 'STAFF', name: 'Other staff' },
  { code: 'SCHOOL_ADMIN', name: 'School admin' },
];

/** Add a member of staff, or change one. */
@Component({
  selector: 'app-staff-form',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    FormField,
    ImageUpload,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="staff() ? 'Edit staff member' : 'Add staff member'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '44rem', 'max-width': '96vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <div class="grid gap-4 sm:grid-cols-[auto_1fr]">
          <app-form-field label="Photograph" for="s_photo">
            <app-image-upload
              formControlName="photoFileId"
              inputId="s_photo"
              purpose="staff-photo"
              altText="Photograph of the staff member"
            />
          </app-form-field>
          <div class="grid content-start gap-4 sm:grid-cols-2">
            <app-form-field
              label="First name"
              for="s_first"
              [control]="form.controls.firstName"
              [required]="true"
            >
              <input pInputText id="s_first" formControlName="firstName" [fluid]="true" />
            </app-form-field>
            <app-form-field
              label="Surname"
              for="s_sur"
              [control]="form.controls.surname"
              [required]="true"
            >
              <input pInputText id="s_sur" formControlName="surname" [fluid]="true" />
            </app-form-field>
            <app-form-field label="Gender" for="s_gender">
              <p-select
                inputId="s_gender"
                formControlName="gender"
                [options]="genders"
                optionLabel="label"
                optionValue="value"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
            <app-form-field
              label="Designation"
              for="s_des"
              [control]="form.controls.designation"
              [required]="true"
              hint="For example Teacher, Clerk, Peon"
            >
              <input pInputText id="s_des" formControlName="designation" [fluid]="true" />
            </app-form-field>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field label="Mobile" for="s_mob" [control]="form.controls.mobile">
            <input pInputText id="s_mob" formControlName="mobile" inputmode="tel" [fluid]="true" />
          </app-form-field>
          <app-form-field label="Email" for="s_email" [control]="form.controls.email">
            <input pInputText id="s_email" type="email" formControlName="email" [fluid]="true" />
          </app-form-field>
          <app-form-field label="Date of birth" for="s_dob">
            <p-datepicker
              inputId="s_dob"
              formControlName="dateOfBirth"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="Joined on" for="s_joined">
            <p-datepicker
              inputId="s_joined"
              formControlName="joinedOn"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="Qualification" for="s_qual">
            <input pInputText id="s_qual" formControlName="qualification" [fluid]="true" />
          </app-form-field>
          <app-form-field
            label="Employee number"
            for="s_emp"
            hint="Empty = next number"
            [error]="employeeNoError()"
          >
            <input pInputText id="s_emp" formControlName="employeeNo" [fluid]="true" />
          </app-form-field>
        </div>
        <app-form-field label="Address" for="s_addr">
          <input pInputText id="s_addr" formControlName="address" [fluid]="true" />
        </app-form-field>

        @if (!staff() && canGiveLogin()) {
          <div class="rounded-md border p-3">
            <div class="flex items-center gap-2">
              <p-checkbox formControlName="giveLogin" [binary]="true" inputId="s_login" />
              <label for="s_login" class="text-sm font-medium">Give this person a login</label>
            </div>
            @if (form.controls.giveLogin.value) {
              <p class="mt-2 mb-3 text-xs text-muted-foreground">
                They sign in with the email or mobile number above. A temporary password is
                generated and shown once.
              </p>
              <app-form-field
                label="Role"
                for="s_roles"
                [control]="form.controls.roleCodes"
                [required]="true"
              >
                <p-multiselect
                  inputId="s_roles"
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
            }
          </div>
        }

        @if (error()) {
          <p-message severity="error" [text]="error()!" />
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="visible.set(false)"
          />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class StaffForm {
  /** The person being changed, or null to add a new one. */
  readonly staff = input<StaffMember | null>(null);
  readonly visible = model(false);
  /** Emits the saved person (with the temporary password when a login was created). */
  readonly saved = output<StaffMember>();

  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly canGiveLogin = () => this.auth.has('users.manage');

  protected readonly genders = GENDERS;
  protected readonly roleOptions = STAFF_ROLE_OPTIONS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly employeeNoError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    photoFileId: [null as string | null],
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    surname: ['', [Validators.required, Validators.maxLength(60)]],
    gender: ['FEMALE' as Gender],
    designation: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    mobile: ['', Validators.pattern(/^(\+?[0-9]{10,15})?$/)],
    email: ['', Validators.email],
    dateOfBirth: [null as Date | null],
    joinedOn: [null as Date | null],
    qualification: [''],
    employeeNo: [''],
    address: [''],
    giveLogin: [false],
    roleCodes: [[] as string[]],
  });

  constructor() {
    effect(() => {
      if (this.visible()) this.load(this.staff());
    });
  }

  private load(s: StaffMember | null) {
    this.error.set(null);
    this.employeeNoError.set(null);
    this.form.reset({
      photoFileId: s?.photoFileId ?? null,
      firstName: s?.firstName ?? '',
      surname: s?.surname ?? '',
      gender: s?.gender ?? 'FEMALE',
      designation: s?.designation ?? '',
      mobile: s?.mobile ?? '',
      email: s?.email ?? '',
      dateOfBirth: s?.dateOfBirth ? fromIsoDate(s.dateOfBirth) : null,
      joinedOn: s ? fromIsoDate(s.joinedOn) : new Date(),
      qualification: s?.qualification ?? '',
      employeeNo: s?.employeeNo ?? '',
      address: s?.address ?? '',
      giveLogin: false,
      roleCodes: [],
    });
  }

  protected async save() {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || this.saving()) return;
    if (v.giveLogin && v.roleCodes.length === 0) {
      this.error.set('Choose a role for the login.');
      return;
    }
    if (v.giveLogin && !v.email.trim() && !v.mobile.trim()) {
      this.error.set('Enter an email address or a mobile number so the person can sign in.');
      return;
    }

    const text = (value: string) => (value.trim() ? value.trim() : undefined);
    const body: NewStaff = {
      firstName: v.firstName.trim(),
      surname: v.surname.trim(),
      gender: v.gender,
      designation: v.designation.trim(),
      ...(v.photoFileId ? { photoFileId: v.photoFileId } : {}),
      ...(text(v.mobile) ? { mobile: text(v.mobile) } : {}),
      ...(text(v.email) ? { email: text(v.email) } : {}),
      ...(text(v.qualification) ? { qualification: text(v.qualification) } : {}),
      ...(text(v.address) ? { address: text(v.address) } : {}),
      ...(text(v.employeeNo) ? { employeeNo: text(v.employeeNo) } : {}),
      ...(v.dateOfBirth ? { dateOfBirth: toIsoDate(v.dateOfBirth) } : {}),
      ...(v.joinedOn ? { joinedOn: toIsoDate(v.joinedOn) } : {}),
    };

    this.saving.set(true);
    this.error.set(null);
    this.employeeNoError.set(null);
    try {
      const existing = this.staff();
      const saved = existing
        ? await firstValueFrom(this.api.updateStaff(existing.id, body))
        : await firstValueFrom(
            this.api.createStaff(
              v.giveLogin ? { ...body, account: { roleCodes: v.roleCodes } } : body,
            ),
          );
      this.visible.set(false);
      this.saved.emit(saved);
    } catch (error) {
      const message = apiError(error);
      if (
        error instanceof HttpErrorResponse &&
        error.status === 409 &&
        /employee number/i.test(message)
      ) {
        this.employeeNoError.set(message);
      } else {
        this.error.set(message);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
