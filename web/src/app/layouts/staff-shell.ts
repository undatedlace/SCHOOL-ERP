import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { AuthService } from '../core/auth.service';
import { NAV } from '../core/nav';
import { School } from '../core/models';

/** Staff area: sidebar on desktop, a slide-down menu on phones. */
@Component({
  selector: 'app-staff-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50 md:flex">
      <header class="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <span class="font-semibold">{{ school.value()?.name ?? 'School ERP' }}</span>
        <p-button
          [label]="navOpen() ? 'Close' : 'Menu'"
          severity="secondary"
          size="small"
          (onClick)="navOpen.set(!navOpen())"
        />
      </header>

      <aside
        class="w-full flex-col border-r bg-white p-4 md:flex md:min-h-screen md:w-64"
        [class.hidden]="!navOpen()"
        [class.flex]="navOpen()"
      >
        <div class="mb-6 hidden md:block">
          <p class="text-lg font-semibold text-slate-900">
            {{ school.value()?.name ?? 'School ERP' }}
          </p>
          <p class="text-xs text-slate-500">School management</p>
        </div>

        <nav class="flex flex-1 flex-col gap-1" aria-label="Main">
          @for (item of items(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-slate-900 text-white"
              class="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              (click)="navOpen.set(false)"
              >{{ item.label }}</a
            >
          }
        </nav>

        <div class="mt-6 border-t pt-4">
          <p class="truncate text-sm font-medium">{{ auth.me()?.fullName }}</p>
          <p class="mb-3 truncate text-xs text-slate-500">{{ roleNames() }}</p>
          <p-button label="Log out" severity="secondary" size="small" (onClick)="auth.logout()" />
        </div>
      </aside>

      <main class="min-w-0 flex-1 p-4 md:p-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class StaffShell {
  protected readonly auth = inject(AuthService);
  protected readonly school = httpResource<School>(() => '/api/school');
  protected readonly navOpen = signal(false);

  protected readonly items = computed(() =>
    NAV.filter((i) => !i.permission || this.auth.has(i.permission)),
  );
  protected readonly roleNames = computed(() =>
    (this.auth.me()?.roles ?? []).map((r) => r.replaceAll('_', ' ').toLowerCase()).join(', '),
  );
}
