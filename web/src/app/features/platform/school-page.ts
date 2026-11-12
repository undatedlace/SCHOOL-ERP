import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { apiError } from '../../core/api-error';
import {
  ADMIN_ROLE_LABEL,
  AdminRole,
  IssuedLogin,
  PlatformAdmin,
  PlatformSchool,
  PlatformService,
} from '../../core/platform.service';
import { formatDate } from '../../shared/dates';
import { Avatar } from '../../shared/ui/avatar';
import { Badge } from '../../shared/ui/badge';
import { FormField } from '../../shared/ui/form-field';
import { PageHeader } from '../../shared/ui/page-header';
import { StatTile } from '../../shared/ui/stat-tile';
import { IssuedLoginsDialog } from './issued-logins-dialog';

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One school, as the owner sees it: name, code, status, counts and its administrators. */
@Component({
  selector: 'app-platform-school',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    Avatar,
    Badge,
    FormField,
    PageHeader,
    StatTile,
    IssuedLoginsDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (school(); as s) {
      <app-page-header
        [title]="s.name"
        [crumbs]="[{ label: 'Schools', link: '/platform' }, { label: s.name }]"
        [subtitle]="
          s.isHome
            ? 'The home school: its people sign in without a school code.'
            : 'Its people sign in with the school code ' + s.code + '.'
        "
      >
        <p-button label="Edit" severity="secondary" [outlined]="true" (onClick)="openEdit(s)" />
        @if (s.status === 'ACTIVE') {
          <p-button label="Pause school" severity="danger" [outlined]="true" (onClick)="pause(s)" />
        } @else {
          <p-button label="Resume school" (onClick)="resume(s)" />
        }
      </app-page-header>

      <section aria-label="At a glance" class="mb-6 grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl bg-card p-5 shadow-sm">
          <p class="app-eyebrow">Status</p>
          <p class="mt-2">
            <app-badge
              [label]="s.status === 'ACTIVE' ? 'Active' : 'Paused: nobody can sign in'"
              [tone]="s.status === 'ACTIVE' ? 'good' : 'warn'"
            />
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Code <span class="font-mono text-foreground">{{ s.code }}</span> · onboarded
            {{ date(s.createdAt) }}
          </p>
        </div>
        <app-stat-tile
          label="Students"
          icon="students"
          tone="info"
          [value]="'' + s.students"
          hint="Studying now"
        />
        <app-stat-tile
          label="Staff"
          icon="teachers"
          tone="amber"
          [value]="'' + s.staff"
          hint="Working now"
        />
      </section>

      <section class="overflow-hidden rounded-xl bg-card shadow-sm" aria-labelledby="admins">
        <div class="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id="admins" class="text-base font-bold">Administrators</h2>
            <p class="text-sm text-muted-foreground">
              Super Admins (trustees) and School Admins. Everyone else is added by the school.
            </p>
          </div>
          <p-button
            label="Add administrator"
            severity="secondary"
            [outlined]="true"
            (onClick)="adminOpen.set(true)"
          />
        </div>
        <ul>
          @for (a of s.admins; track a.id) {
            <li class="flex flex-wrap items-center gap-3 border-t px-5 py-3">
              <app-avatar [name]="a.fullName" size="sm" />
              <div class="min-w-0 flex-1 leading-tight">
                <p class="font-semibold">{{ a.fullName }}</p>
                <p class="mt-1 text-xs text-muted-foreground">{{ a.email }}</p>
              </div>
              @for (r of a.roles; track r.code) {
                <app-badge
                  [label]="r.name"
                  [tone]="r.code === 'SUPER_ADMIN' ? 'primary' : 'info'"
                  [dot]="false"
                />
              }
              @if (a.status !== 'ACTIVE') {
                <app-badge label="Switched off" tone="neutral" />
              } @else if (a.mustChangePassword) {
                <app-badge label="Has not signed in yet" tone="amber" />
              }
              <p-button
                label="Reset password"
                severity="secondary"
                [text]="true"
                size="small"
                [ariaLabel]="'Reset the password of ' + a.fullName"
                (onClick)="reset(s, a)"
              />
            </li>
          } @empty {
            <li class="border-t px-5 py-6 text-sm text-muted-foreground">
              No administrators. Add one.
            </li>
          }
        </ul>
      </section>
    } @else if (error(); as text) {
      <p class="text-destructive" role="alert">{{ text }}</p>
    }

    <p-dialog
      header="Edit school"
      [(visible)]="editOpen"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="editForm" (ngSubmit)="saveEdit()" class="flex flex-col gap-4" novalidate>
        @if (editError(); as text) {
          <p-message severity="error" [text]="text" />
        }
        <app-form-field label="School name" for="ed-name" [control]="editForm.controls.name">
          <input pInputText id="ed-name" formControlName="name" [fluid]="true" />
        </app-form-field>
        <app-form-field
          label="School code"
          for="ed-code"
          [control]="editForm.controls.code"
          hint="Changing it changes what everyone in the school types at sign-in. Tell them first."
        >
          <input
            pInputText
            id="ed-code"
            formControlName="code"
            class="font-mono"
            autocapitalize="off"
            [fluid]="true"
          />
        </app-form-field>
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="editOpen.set(false)"
          />
          <p-button type="submit" label="Save" [loading]="busy()" />
        </div>
      </form>
    </p-dialog>

    <p-dialog
      header="Add administrator"
      [(visible)]="adminOpen"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
      (onHide)="adminForm.reset()"
    >
      <form [formGroup]="adminForm" (ngSubmit)="addAdmin()" class="flex flex-col gap-4" novalidate>
        @if (adminError(); as text) {
          <p-message severity="error" [text]="text" />
        }
        <div class="flex flex-col gap-1">
          <span id="ad-role" class="text-sm font-medium">Role</span>
          <p-selectbutton
            [options]="roleOptions"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            formControlName="role"
            aria-labelledby="ad-role"
          />
        </div>
        <app-form-field
          label="Full name"
          for="ad-name"
          [control]="adminForm.controls.fullName"
          [required]="true"
        >
          <input pInputText id="ad-name" formControlName="fullName" [fluid]="true" />
        </app-form-field>
        <app-form-field
          label="Email"
          for="ad-email"
          [control]="adminForm.controls.email"
          [required]="true"
        >
          <input pInputText id="ad-email" type="email" formControlName="email" [fluid]="true" />
        </app-form-field>
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="adminOpen.set(false)"
          />
          <p-button type="submit" label="Add" [loading]="busy()" />
        </div>
      </form>
    </p-dialog>

    <app-issued-logins-dialog
      [logins]="issued()"
      [schoolCode]="school()?.isHome ? null : (school()?.code ?? null)"
      (closed)="issued.set(null)"
    />
  `,
})
export class PlatformSchoolPage implements OnInit {
  /** From the route. */
  readonly id = input.required<string>();

  private readonly platform = inject(PlatformService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly date = formatDate;
  protected readonly school = signal<PlatformSchool | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly issued = signal<IssuedLogin[] | null>(null);

  protected readonly editOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(30),
        Validators.pattern(CODE),
      ],
    ],
  });

  protected readonly adminOpen = signal(false);
  protected readonly adminError = signal<string | null>(null);
  protected readonly roleOptions = (['SUPER_ADMIN', 'SCHOOL_ADMIN'] as const).map((value) => ({
    value,
    label: ADMIN_ROLE_LABEL[value],
  }));
  protected readonly adminForm = this.fb.group({
    role: ['SCHOOL_ADMIN' as AdminRole],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit() {
    void this.load();
  }

  protected openEdit(s: PlatformSchool) {
    this.editForm.setValue({ name: s.name, code: s.code });
    this.editError.set(null);
    this.editOpen.set(true);
  }

  protected async saveEdit() {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid || this.busy()) return;
    await this.run(this.editError, async () => {
      const v = this.editForm.getRawValue();
      await firstValueFrom(
        this.platform.updateSchool(this.id(), { name: v.name.trim(), code: v.code.trim() }),
      );
      this.editOpen.set(false);
      this.toast.add({ severity: 'success', summary: 'School saved' });
      await this.load();
    });
  }

  protected pause(s: PlatformSchool) {
    this.confirm.confirm({
      header: `Pause ${s.name}?`,
      message:
        'Everyone in the school is signed out at once and nobody can sign in until you resume it. Nothing is deleted.',
      acceptLabel: 'Pause school',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: () => void this.setStatus('SUSPENDED'),
    });
  }

  protected resume(s: PlatformSchool) {
    void s;
    void this.setStatus('ACTIVE');
  }

  protected reset(s: PlatformSchool, a: PlatformAdmin) {
    this.confirm.confirm({
      header: `Reset ${a.fullName}'s password?`,
      message: `They are signed out everywhere and get a temporary password to change within 2 days.`,
      acceptLabel: 'Reset password',
      rejectLabel: 'Cancel',
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: () =>
        void this.run(null, async () => {
          const r = await firstValueFrom(this.platform.resetAdmin(s.id, a.id));
          this.issued.set([
            {
              fullName: r.fullName,
              email: r.email,
              role: a.roles[0]?.code ?? '',
              temporaryPassword: r.temporaryPassword,
            },
          ]);
          await this.load();
        }),
    });
  }

  protected async addAdmin() {
    this.adminForm.markAllAsTouched();
    if (this.adminForm.invalid || this.busy()) return;
    await this.run(this.adminError, async () => {
      const v = this.adminForm.getRawValue();
      const login = await firstValueFrom(
        this.platform.addAdmin(this.id(), {
          fullName: v.fullName.trim(),
          email: v.email.trim(),
          role: v.role,
        }),
      );
      this.adminOpen.set(false);
      this.issued.set([login]);
      await this.load();
    });
  }

  private async setStatus(status: 'ACTIVE' | 'SUSPENDED') {
    await this.run(null, async () => {
      this.school.set(await firstValueFrom(this.platform.setStatus(this.id(), status)));
      this.toast.add({
        severity: 'success',
        summary: status === 'ACTIVE' ? 'School resumed' : 'School paused',
      });
    });
  }

  /** Runs one change; shows a failure in the dialog's message, or as a toast. */
  private async run(
    target: ReturnType<typeof signal<string | null>> | null,
    job: () => Promise<void>,
  ) {
    this.busy.set(true);
    target?.set(null);
    try {
      await job();
    } catch (error) {
      if (target) target.set(apiError(error));
      else
        this.toast.add({
          severity: 'error',
          summary: 'Could not do that',
          detail: apiError(error),
        });
    } finally {
      this.busy.set(false);
    }
  }

  private async load() {
    try {
      this.school.set(await firstValueFrom(this.platform.school(this.id())));
      this.error.set(null);
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
