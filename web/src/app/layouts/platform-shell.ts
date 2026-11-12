import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@openng/optimus-ui/button';
import { PlatformService } from '../core/platform.service';
import { EnvBanner } from '../shared/ui/env-banner';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** The platform owner's area: a plain top bar, no school menu (an owner is not in any school). */
@Component({
  selector: 'app-platform-shell',
  imports: [RouterOutlet, RouterLink, ButtonModule, ThemeToggle, EnvBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-background">
      <app-env-banner />
      <header
        class="sticky top-0 z-30 flex h-16 items-center gap-3 bg-linear-to-r from-sidebar-top to-sidebar-bottom px-4 text-white md:px-8"
      >
        <a routerLink="/platform" class="flex items-center gap-2.5 font-bold tracking-tight">
          <span
            class="flex size-8 items-center justify-center rounded-lg bg-amber text-sm font-bold text-amber-ink"
            aria-hidden="true"
            >P</span
          >
          Platform
        </a>
        <span class="hidden text-sm opacity-70 sm:inline"
          >Schools and their first administrators</span
        >
        <div class="ml-auto flex items-center gap-3">
          <app-theme-toggle />
          <span class="hidden text-right text-sm leading-tight sm:block">
            <span class="block font-semibold">{{ platform.me()?.fullName }}</span>
            <span class="block text-xs opacity-70">Platform owner</span>
          </span>
          <p-button
            label="Sign out"
            severity="secondary"
            size="small"
            (onClick)="platform.logout()"
          />
        </div>
      </header>
      <main class="px-4 py-6 md:px-8 md:py-8">
        <div class="mx-auto max-w-6xl"><router-outlet /></div>
      </main>
    </div>
  `,
})
export class PlatformShell {
  protected readonly platform = inject(PlatformService);
}
