import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Centered card for login and change-password. */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div class="w-full max-w-md rounded-xl bg-white p-6 shadow sm:p-8">
        <router-outlet />
      </div>
    </main>
  `,
})
export class AuthShell {}
