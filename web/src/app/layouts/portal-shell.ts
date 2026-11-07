import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { School } from '../core/models';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** Parent and student portal: mobile first, a single column. */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-background">
      <header
        class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-3"
      >
        <div class="min-w-0">
          <p class="truncate font-semibold">{{ school.value()?.name ?? 'School ERP' }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ auth.me()?.fullName }}</p>
        </div>
        <div class="flex items-center gap-2">
          <app-theme-toggle />
          <button
            type="button"
            class="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            (click)="auth.logout()"
          >
            Log out
          </button>
        </div>
      </header>
      <main class="mx-auto max-w-2xl p-4">
        <router-outlet />
      </main>
    </div>
  `,
})
export class PortalShell {
  protected readonly auth = inject(AuthService);
  protected readonly school = httpResource<School>(() => '/api/school');
}
