import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { AuthService } from '../core/auth.service';
import { School } from '../core/models';

/** Parent and student portal: mobile first, a single column. */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50">
      <header
        class="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3"
      >
        <div class="min-w-0">
          <p class="truncate font-semibold">{{ school.value()?.name ?? 'School ERP' }}</p>
          <p class="truncate text-xs text-slate-500">{{ auth.me()?.fullName }}</p>
        </div>
        <p-button label="Log out" severity="secondary" size="small" (onClick)="auth.logout()" />
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
