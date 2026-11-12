import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { apiError } from '../../core/api-error';
import { IssuedLogin, PlatformService, suggestSchoolCode } from '../../core/platform.service';
import { FormField } from '../../shared/ui/form-field';

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface Onboarded {
  school: { id: string; name: string; code: string };
  logins: IssuedLogin[];
}

/** Onboard a school: its name and sign-in code, its Super Admin and, if known, its School Admin. */
@Component({
  selector: 'app-onboard-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Onboard a school"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '40rem', 'max-width': '95vw' }"
      (onHide)="reset()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5" novalidate>
        <p class="text-sm text-muted-foreground">
          Creates the school with its starter staff types, onboarding forms and admission form, and
          logins for its first administrators. They set up everything else themselves.
        </p>
        @if (error(); as text) {
          <p-message severity="error" [text]="text" />
        }
        <fieldset class="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <legend class="app-eyebrow mb-3">School</legend>
          <app-form-field
            label="School name"
            for="ob-name"
            [control]="form.controls.name"
            [required]="true"
          >
            <input
              pInputText
              id="ob-name"
              formControlName="name"
              (input)="nameChanged()"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field
            label="School code"
            for="ob-code"
            [control]="form.controls.code"
            [required]="true"
            hint="Typed at sign-in. Lower case, digits, hyphens."
          >
            <input
              pInputText
              id="ob-code"
              formControlName="code"
              class="font-mono"
              (input)="codeTouched = true"
              autocapitalize="off"
              spellcheck="false"
              [fluid]="true"
            />
          </app-form-field>
        </fieldset>
        <fieldset class="grid gap-4 sm:grid-cols-2">
          <legend class="app-eyebrow mb-3">Super Admin (trustees)</legend>
          <app-form-field
            label="Full name"
            for="ob-sa-name"
            [control]="form.controls.superAdminName"
            [required]="true"
          >
            <input pInputText id="ob-sa-name" formControlName="superAdminName" [fluid]="true" />
          </app-form-field>
          <app-form-field
            label="Email"
            for="ob-sa-email"
            [control]="form.controls.superAdminEmail"
            [required]="true"
          >
            <input
              pInputText
              id="ob-sa-email"
              type="email"
              formControlName="superAdminEmail"
              [fluid]="true"
            />
          </app-form-field>
        </fieldset>
        <fieldset class="grid gap-4 sm:grid-cols-2">
          <legend class="app-eyebrow mb-3">School Admin (principal), optional</legend>
          <app-form-field
            label="Full name"
            for="ob-ad-name"
            [control]="form.controls.schoolAdminName"
          >
            <input pInputText id="ob-ad-name" formControlName="schoolAdminName" [fluid]="true" />
          </app-form-field>
          <app-form-field
            label="Email"
            for="ob-ad-email"
            [control]="form.controls.schoolAdminEmail"
          >
            <input
              pInputText
              id="ob-ad-email"
              type="email"
              formControlName="schoolAdminEmail"
              [fluid]="true"
            />
          </app-form-field>
        </fieldset>
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="visible.set(false)"
          />
          <p-button type="submit" label="Onboard school" [loading]="busy()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class OnboardDialog {
  readonly visible = model(false);
  readonly done = output<Onboarded>();

  private readonly platform = inject(PlatformService);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected codeTouched = false;

  protected readonly form = inject(FormBuilder).nonNullable.group({
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
    superAdminName: ['', [Validators.required, Validators.minLength(2)]],
    superAdminEmail: ['', [Validators.required, Validators.email]],
    schoolAdminName: [''],
    schoolAdminEmail: ['', Validators.email],
  });

  /** The code follows the name until someone types their own. */
  protected nameChanged() {
    if (!this.codeTouched) {
      this.form.controls.code.setValue(suggestSchoolCode(this.form.controls.name.value));
    }
  }

  protected reset() {
    this.form.reset();
    this.codeTouched = false;
    this.error.set(null);
  }

  protected async submit() {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (!!v.schoolAdminName.trim() !== !!v.schoolAdminEmail.trim()) {
      this.error.set('Give the School Admin both a name and an email, or leave both empty.');
      return;
    }
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.platform.onboard({
          name: v.name.trim(),
          code: v.code.trim(),
          superAdminName: v.superAdminName.trim(),
          superAdminEmail: v.superAdminEmail.trim(),
          ...(v.schoolAdminName.trim()
            ? {
                schoolAdminName: v.schoolAdminName.trim(),
                schoolAdminEmail: v.schoolAdminEmail.trim(),
              }
            : {}),
        }),
      );
      this.visible.set(false);
      this.done.emit(result);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
