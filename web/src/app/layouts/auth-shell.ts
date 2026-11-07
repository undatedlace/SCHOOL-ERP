import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** Centered card for login and change-password. */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterOutlet, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div class="absolute top-4 right-4"><app-theme-toggle /></div>
      <div class="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <router-outlet />
      </div>
    </main>
  `,
})
export class AuthShell {}
