import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { grantableRoles } from '../../core/admin-roles';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import { Role, UserRow } from '../../core/models';
import { FormField } from '../../shared/ui/form-field';
import { PageHeader } from '../../shared/ui/page-header';
import { TempPasswordDialog } from '../../shared/ui/temp-password-dialog';
import { Badge } from '../../shared/ui/badge';

const needsContact = (group: AbstractControl): ValidationErrors | null =>
  group.get('email')?.value || group.get('mobile')?.value
    ? null
    : { mismatch: 'Enter an email address or a mobile number' };

@Component({
  selector: 'app-users',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TableModule,
    FormField,
    PageHeader,
    TempPasswordDialog,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Users" subtitle="Accounts for staff, parents and students.">
      <p-button label="Add user" (onClick)="openCreate()" />
    </app-page-header>

    <div class="mb-4 flex flex-wrap gap-3">
      <input
        pInputText
        class="w-full sm:w-72"
        placeholder="Search name, email or mobile"
        aria-label="Search users"
        (input)="onSearch($any($event.target).value)"
      />
      <p-select
        [options]="roles()"
        optionLabel="name"
        optionValue="code"
        placeholder="All roles"
        [showClear]="true"
        ariaLabel="Filter by role"
        (onChange)="onRole($event.value)"
      />
      <p-select
        [options]="statuses"
        optionLabel="label"
        optionValue="value"
        placeholder="Any status"
        [showClear]="true"
        ariaLabel="Filter by status"
        (onChange)="onStatus($event.value)"
      />
    </div>

    <p-table
      [value]="rows()"
      [lazy]="true"
      (onLazyLoad)="load($event)"
      [paginator]="true"
      [rows]="20"
      [first]="first()"
      [totalRecords]="total()"
      [loading]="loading()"
      [tableStyle]="{ 'min-width': '48rem' }"
    >
      <ng-template #header>
        <tr>
          <th>Name</th>
          <th>Email / mobile</th>
          <th>Roles</th>
          <th>Status</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-user>
        <tr>
          <td>{{ user.fullName }}</td>
          <td class="text-sm">
            <div>{{ user.email }}</div>
            <div class="text-muted-foreground">{{ user.mobile }}</div>
          </td>
          <td>
            <div class="flex flex-wrap gap-1">
              @for (role of user.roles; track role.code) {
                <app-badge [label]="role.name" severity="secondary" />
              }
            </div>
          </td>
          <td>
            <app-badge
              [label]="user.status === 'ACTIVE' ? 'Active' : 'Disabled'"
              [severity]="user.status === 'ACTIVE' ? 'success' : 'danger'"
            />
            @if (user.mustChangePassword) {
              <app-badge class="ml-1" label="Temporary password" severity="warn" />
            }
          </td>
          <td class="whitespace-nowrap text-right">
            <p-button label="Edit" size="small" [text]="true" (onClick)="openEdit(user)" />
            <p-button
              label="Reset password"
              size="small"
              [text]="true"
              (onClick)="confirmReset(user)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5" class="p-4 text-center text-muted-foreground">No users found.</td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      [header]="editing() ? 'Edit user' : 'Add user'"
      [(visible)]="formOpen"
      [modal]="true"
      [style]="{ width: '34rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        <app-form-field label="Full name" for="fullName" [control]="form.controls.fullName">
          <input pInputText id="fullName" formControlName="fullName" [fluid]="true" />
        </app-form-field>
        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field label="Email" for="email" [control]="form.controls.email">
            <input pInputText id="email" type="email" formControlName="email" [fluid]="true" />
          </app-form-field>
          <app-form-field label="Mobile" for="mobile" [control]="form.controls.mobile">
            <input pInputText id="mobile" inputmode="tel" formControlName="mobile" [fluid]="true" />
          </app-form-field>
        </div>
        @if (
          form.errors?.['mismatch'] && form.controls.email.touched && form.controls.mobile.touched
        ) {
          <small class="text-destructive" role="alert">{{ form.errors?.['mismatch'] }}</small>
        }
        <app-form-field label="Roles" for="roles" [control]="form.controls.roleCodes">
          <p-multiselect
            inputId="roles"
            formControlName="roleCodes"
            [options]="grantable()"
            optionLabel="name"
            optionValue="code"
            display="chip"
            placeholder="Select one or more roles"
            appendTo="body"
            [fluid]="true"
          />
        </app-form-field>
        @if (editing()) {
          <app-form-field label="Status" for="status">
            <p-select
              inputId="status"
              formControlName="status"
              [options]="statuses"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
        } @else {
          <p class="text-sm text-muted-foreground">
            A temporary password is generated. The user must change it the first time they sign in.
          </p>
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="formOpen.set(false)"
          />
          <p-button type="submit" label="Save" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>

    <app-temp-password-dialog [info]="temp()" (closed)="temp.set(null)" />
  `,
})
export class Users {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly statuses = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Disabled', value: 'DISABLED' },
  ];

  protected readonly rows = signal<UserRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly roles = signal<Role[]>([]);
  private readonly auth = inject(AuthService);
  /** What the Roles pickers offer: admin roles only for a Super Admin. */
  protected readonly grantable = computed(() =>
    grantableRoles(this.roles(), this.auth.has('admins.manage')),
  );

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<UserRow | null>(null);
  protected readonly saving = signal(false);
  protected readonly temp = signal<{ name: string; password: string } | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', Validators.email],
      mobile: ['', Validators.pattern(/^(\+?[0-9]{10,15})?$/)],
      roleCodes: [[] as string[], Validators.required],
      status: ['ACTIVE'],
    },
    { validators: needsContact },
  );

  private search = '';
  private role: string | null = null;
  private status: string | null = null;
  private pageSize = 20;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    firstValueFrom(this.api.roles())
      .then((roles) => this.roles.set(roles))
      .catch((e) => this.fail('Could not load roles', e));
  }

  protected load(e: { first?: number | null; rows?: number | null }) {
    this.first.set(e.first ?? 0);
    this.pageSize = e.rows ?? 20;
    void this.fetch();
  }

  protected onSearch(value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refilter(() => (this.search = value.trim())), 300);
  }
  protected onRole(value: string | null) {
    this.refilter(() => (this.role = value));
  }
  protected onStatus(value: string | null) {
    this.refilter(() => (this.status = value));
  }

  protected openCreate() {
    this.editing.set(null);
    this.form.reset({ fullName: '', email: '', mobile: '', roleCodes: [], status: 'ACTIVE' });
    this.formOpen.set(true);
  }

  protected openEdit(user: UserRow) {
    this.editing.set(user);
    this.form.reset({
      fullName: user.fullName,
      email: user.email ?? '',
      mobile: user.mobile ?? '',
      roleCodes: user.roles.map((r) => r.code),
      status: user.status,
    });
    this.formOpen.set(true);
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const v = this.form.getRawValue();
    const contact = {
      ...(v.email.trim() ? { email: v.email.trim() } : {}),
      ...(v.mobile.trim() ? { mobile: v.mobile.trim() } : {}),
    };
    const editing = this.editing();

    this.saving.set(true);
    try {
      if (editing) {
        await firstValueFrom(
          this.api.updateUser(editing.id, {
            fullName: v.fullName.trim(),
            ...contact,
            roleCodes: v.roleCodes,
            status: v.status,
          }),
        );
        this.toast.add({ severity: 'success', summary: 'User updated' });
      } else {
        const created = await firstValueFrom(
          this.api.createUser({ fullName: v.fullName.trim(), ...contact, roleCodes: v.roleCodes }),
        );
        if (created.temporaryPassword) {
          this.temp.set({ name: created.fullName, password: created.temporaryPassword });
        }
      }
      this.formOpen.set(false);
      await this.fetch();
    } catch (error) {
      this.fail('Could not save the user', error);
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmReset(user: UserRow) {
    this.confirm.confirm({
      header: 'Reset password',
      message: `Create a new temporary password for ${user.fullName}? They will be signed out everywhere.`,
      acceptLabel: 'Reset',
      rejectLabel: 'Cancel',
      accept: async () => {
        try {
          const { temporaryPassword } = await firstValueFrom(this.api.resetPassword(user.id));
          this.temp.set({ name: user.fullName, password: temporaryPassword });
          await this.fetch();
        } catch (error) {
          this.fail('Could not reset the password', error);
        }
      },
    });
  }

  private refilter(apply: () => void) {
    apply();
    this.first.set(0);
    void this.fetch();
  }

  private async fetch() {
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.users({
          page: Math.floor(this.first() / this.pageSize) + 1,
          pageSize: this.pageSize,
          search: this.search,
          role: this.role,
          status: this.status,
        }),
      );
      this.rows.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.fail('Could not load users', error);
    } finally {
      this.loading.set(false);
    }
  }

  private fail(summary: string, error: unknown) {
    this.toast.add({ severity: 'error', summary, detail: apiError(error) });
  }
}
