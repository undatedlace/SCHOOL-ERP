import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { PasswordModule } from '@openng/optimus-ui/password';
import { apiError } from '../../core/api-error';
import { PlatformService } from '../../core/platform.service';
import { FormField } from '../../shared/ui/form-field';

/** Sign-in for the platform owner (not for school staff, parents or students). */
@Component({
  selector: 'app-platform-login',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="app-eyebrow mb-2">Platform</p>
    <h1 class="mb-1 text-2xl font-semibold">Owner sign-in</h1>
    <p class="mb-6 text-sm text-muted-foreground">
      For onboarding schools and their first administrators. School staff sign in at the
      <a class="app-link font-medium" routerLink="/login">school sign-in</a>.
    </p>
    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
      @if (error(); as text) {
        <p-message severity="error" [text]="text" />
      }
      <app-form-field label="Email" for="owner-email" [control]="form.controls.email">
        <input
          pInputText
          id="owner-email"
          type="email"
          formControlName="email"
          autocomplete="username"
          [fluid]="true"
        />
      </app-form-field>
      <app-form-field label="Password" for="owner-password" [control]="form.controls.password">
        <p-password
          inputId="owner-password"
          formControlName="password"
          [feedback]="false"
          [toggleMask]="true"
          [fluid]="true"
          autocomplete="current-password"
        />
      </app-form-field>
      <p-button type="submit" label="Sign in" [loading]="busy()" [fluid]="true" />
    </form>
  `,
})
export class PlatformLogin {
  private readonly platform = inject(PlatformService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const me = await this.platform.login(email, password);
      await this.router.navigateByUrl(
        me.mustChangePassword ? '/platform/change-password' : '/platform',
      );
    } catch (error) {
      this.error.set(
        (error as { status?: number }).status === 401 &&
          !String(apiError(error)).includes('expired')
          ? 'The email or password is not correct.'
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
