import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { PasswordModule } from '@openng/optimus-ui/password';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { AppInfoService } from '../../shared/ui/env-banner';
import { FormField } from '../../shared/ui/form-field';

/** The last school code used on this device, so people of another school need not retype it. */
const CODE_KEY = 'school-code';
function storedCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

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
    <p class="mb-6 text-sm text-muted-foreground">Use your email address or mobile number.</p>

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
      @if (showCode()) {
        <app-form-field
          label="School code"
          for="school-code"
          [control]="form.controls.schoolCode"
          hint="From your school office. Leave empty for the main school."
        >
          <input
            pInputText
            id="school-code"
            formControlName="schoolCode"
            class="font-mono"
            autocapitalize="off"
            autocomplete="organization"
            spellcheck="false"
            [fluid]="true"
          />
        </app-form-field>
      } @else if (appInfo.info()?.schoolCodeOffered) {
        <p-button
          type="button"
          label="Signing in to another school?"
          [link]="true"
          size="small"
          class="-my-2 self-start"
          (onClick)="codeOpen.set(true)"
        />
      }
      <p-button type="submit" label="Sign in" [loading]="busy()" [fluid]="true" />
    </form>
    <p class="mt-6 text-center text-xs text-muted-foreground">
      Forgot your password? Ask the school office to reset it.
    </p>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly appInfo = inject(AppInfoService);
  protected readonly codeOpen = signal(!!storedCode());
  /** The school code box: shown once asked for, or when this device used a code before. */
  protected readonly showCode = this.codeOpen.asReadonly();
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
    schoolCode: [storedCode()],
  });

  protected async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const { identifier, password, schoolCode } = this.form.getRawValue();
      const code = schoolCode.trim().toLowerCase();
      const me = await this.auth.login(identifier, password, code || undefined);
      try {
        if (code) localStorage.setItem(CODE_KEY, code);
        else localStorage.removeItem(CODE_KEY);
      } catch {
        // Only a convenience.
      }
      await this.router.navigateByUrl(
        me.mustChangePassword ? '/change-password' : this.auth.homeUrl(),
      );
    } catch (error) {
      this.error.set(
        (error as { status?: number }).status === 401
          ? this.showCode()
            ? 'The school code, sign-in or password is not correct.'
            : 'The email, mobile number or password is not correct.'
          : apiError(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
