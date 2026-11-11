import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { School } from '../core/models';
import { PortalChildren } from '../features/portal/portal-children';
import { NotificationBell } from '../shared/ui/notification-bell';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** Parent and student portal: mobile first, a single column. */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, NotificationBell],
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
          <app-notification-bell allLink="/portal/notifications" />
          <app-theme-toggle />
          <button
            type="button"
            class="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            (click)="signOut()"
          >
            Log out
          </button>
        </div>
      </header>
      <nav
        class="sticky top-[61px] z-10 flex gap-1 overflow-x-auto border-b bg-card px-4"
        aria-label="Sections"
      >
        @for (item of items; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="border-foreground font-semibold"
            [routerLinkActiveOptions]="{ exact: item.path === '/portal' }"
            class="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm"
            >{{ item.label }}</a
          >
        }
      </nav>
      <main class="mx-auto max-w-2xl p-4">
        <router-outlet />
      </main>
    </div>
  `,
})
export class PortalShell {
  protected readonly auth = inject(AuthService);
  protected readonly items = [
    { label: 'Home', path: '/portal' },
    { label: 'Attendance', path: '/portal/attendance' },
    { label: 'Fees', path: '/portal/fees' },
    { label: 'Homework', path: '/portal/homework' },
    { label: 'Results', path: '/portal/results' },
    { label: 'Calendar', path: '/portal/calendar' },
    { label: 'Notices', path: '/portal/notices' },
  ];
  protected readonly school = httpResource<School>(() => '/api/school');
  private readonly children = inject(PortalChildren);

  /** Forgets the children shown, so the next person on this device never sees them. */
  protected signOut() {
    this.children.reset();
    void this.auth.logout();
  }
}
