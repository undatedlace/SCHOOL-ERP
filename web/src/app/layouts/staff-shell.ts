import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { School } from '../core/models';
import { NAV } from '../core/nav';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** Staff area: sidebar on desktop, a slide-down menu on phones. */
@Component({
  selector: 'app-staff-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-background md:flex">
      <header class="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <span class="font-semibold">{{ school.value()?.name ?? 'School ERP' }}</span>
        <div class="flex items-center gap-2">
          <app-theme-toggle />
          <button
            type="button"
            class="rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent"
            [attr.aria-expanded]="navOpen()"
            aria-controls="main-nav"
            (click)="navOpen.set(!navOpen())"
          >
            {{ navOpen() ? 'Close' : 'Menu' }}
          </button>
        </div>
      </header>

      <aside
        id="main-nav"
        class="w-full flex-col border-r bg-card p-4 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0"
        [class.hidden]="!navOpen()"
        [class.flex]="navOpen()"
      >
        <div class="mb-6 hidden items-center gap-3 md:flex">
          <div
            class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {{ (school.value()?.name ?? 'S').charAt(0) }}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ school.value()?.name ?? 'School ERP' }}</p>
            <p class="text-xs text-muted-foreground">School management</p>
          </div>
        </div>

        <nav class="flex flex-1 flex-col gap-1" aria-label="Main">
          @for (item of items(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-accent text-foreground"
              class="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              (click)="navOpen.set(false)"
              >{{ item.label }}</a
            >
          }
        </nav>

        <div class="mt-6 space-y-3 border-t pt-4">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ auth.me()?.fullName }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ roleNames() }}</p>
            </div>
            <span class="hidden md:block"><app-theme-toggle /></span>
          </div>
          <button
            type="button"
            class="w-full rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            (click)="auth.logout()"
          >
            Log out
          </button>
        </div>
      </aside>

      <main class="min-w-0 flex-1 p-4 md:p-8">
        <div class="mx-auto max-w-6xl">
          <router-outlet />
        </div>
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
