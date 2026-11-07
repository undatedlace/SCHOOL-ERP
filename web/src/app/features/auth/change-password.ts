import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { PasswordModule } from '@openng/optimus-ui/password';
import { MessageService } from '@openng/optimus-ui/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { FormField } from '../../shared/ui/form-field';

const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirm')?.value;
  return next && confirm && next !== confirm
    ? { mismatch: 'The new passwords do not match' }
    : null;
};

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, ButtonModule, MessageModule, PasswordModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 text-2xl font-semibold">Change your password</h1>
    @if (auth.me()?.mustChangePassword) {
      <p class="mb-6 text-sm text-slate-600">
        You are using a temporary password. Choose a new one to continue.
      </p>
    } @else {
      <p class="mb-6 text-sm text-slate-600">Other devices will be signed out.</p>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
      @if (error(); as text) {
        <p-message severity="error" [text]="text" />
      }
      <app-form-field
        label="Current password"
        for="current"
        [control]="form.controls.currentPassword"
      >
        <p-password
          inputId="current"
          formControlName="currentPassword"
          [feedback]="false"
          [toggleMask]="true"
          [fluid]="true"
        />
      </app-form-field>
      <app-form-field label="New password" for="new" [control]="form.controls.newPassword">
        <p-password
          inputId="new"
          formControlName="newPassword"
          [toggleMask]="true"
          [fluid]="true"
        />
      </app-form-field>
      <app-form-field label="Confirm new password" for="confirm" [control]="form">
        <p-password
          inputId="confirm"
          formControlName="confirm"
          [feedback]="false"
          [toggleMask]="true"
          [fluid]="true"
        />
      </app-form-field>
      <p-button type="submit" label="Change password" [loading]="busy()" [fluid]="true" />
      <p-button
        type="button"
        label="Log out"
        severity="secondary"
        [text]="true"
        [fluid]="true"
        (onClick)="auth.logout()"
      />
    </form>
  `,
})
export class ChangePassword {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(10)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      await this.auth.changePassword(currentPassword, newPassword);
      this.toast.add({ severity: 'success', summary: 'Password changed' });
      await this.router.navigateByUrl(this.auth.homeUrl());
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
