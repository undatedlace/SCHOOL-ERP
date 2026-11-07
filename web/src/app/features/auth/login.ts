import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { PasswordModule } from '@openng/optimus-ui/password';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { FormField } from '../../shared/ui/form-field';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 text-2xl font-semibold">Sign in</h1>
    <p class="mb-6 text-sm text-slate-600">Use your email address or mobile number.</p>

    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
      @if (error(); as text) {
        <p-message severity="error" [text]="text" />
      }
      <app-form-field
        label="Email or mobile number"
        for="identifier"
        [control]="form.controls.identifier"
      >
        <input
          pInputText
          id="identifier"
          formControlName="identifier"
          autocomplete="username"
          [fluid]="true"
        />
      </app-form-field>
      <app-form-field label="Password" for="password" [control]="form.controls.password">
        <p-password
          inputId="password"
          formControlName="password"
          [feedback]="false"
          [toggleMask]="true"
          [fluid]="true"
          autocomplete="current-password"
        />
      </app-form-field>
      <p-button type="submit" label="Sign in" [loading]="busy()" [fluid]="true" />
    </form>
    <p class="mt-6 text-center text-xs text-slate-500">
      Forgot your password? Ask the school office to reset it.
    </p>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const { identifier, password } = this.form.getRawValue();
      const me = await this.auth.login(identifier, password);
      await this.router.navigateByUrl(
        me.mustChangePassword ? '/change-password' : this.auth.homeUrl(),
      );
    } catch (error) {
      this.error.set(
        (error as { status?: number }).status === 401
          ? 'The email, mobile number or password is not correct.'
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
