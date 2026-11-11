import { httpResource } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { School } from '../core/models';
import { NAV_ENTRIES, NavEntry, visibleEntries } from '../core/nav';
import { GlobalSearch } from '../shared/ui/global-search';
import { NotificationBell } from '../shared/ui/notification-bell';
import { Icon } from '../shared/ui/icon';
import { ThemeToggle } from '../shared/ui/theme-toggle';

/** Staff area: a grouped sidebar on desktop, a slide-down menu on phones, and a top bar. */
@Component({
  selector: 'app-staff-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeToggle,
    Icon,
    GlobalSearch,
    NotificationBell,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-background md:flex md:gap-4 md:p-4">
      <header class="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <span class="font-semibold">{{ school.value()?.name ?? 'School ERP' }}</span>
        <div class="flex items-center gap-2">
          <app-theme-toggle />
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-full border bg-card hover:bg-accent"
            [attr.aria-label]="navOpen() ? 'Close menu' : 'Open menu'"
            [attr.aria-expanded]="navOpen()"
            aria-controls="main-nav"
            (click)="navOpen.set(!navOpen())"
          >
            <app-icon name="menu" />
          </button>
        </div>
      </header>

      <aside
        id="main-nav"
        class="w-full flex-col overflow-y-auto bg-card p-4 md:sticky md:top-4 md:flex md:h-[calc(100vh-2rem)] md:w-64 md:shrink-0 md:rounded-xl md:shadow-sm"
        [class.hidden]="!navOpen()"
        [class.flex]="navOpen()"
      >
        <div class="mb-6 hidden items-center gap-3 px-2 md:flex">
          <div
            class="flex size-9 items-center justify-center rounded-lg bg-sun text-sm font-bold"
            aria-hidden="true"
          >
            {{ (school.value()?.name ?? 'S').charAt(0) }}
          </div>
          <p class="truncate text-lg font-semibold">{{ school.value()?.name ?? 'School ERP' }}</p>
        </div>

        <nav class="flex flex-1 flex-col" aria-label="Main">
          @for (section of sections(); track section.title) {
            <p
              class="mt-3 mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ section.title }}
            </p>
            <ul class="flex flex-col gap-1">
              @for (entry of section.entries; track entry.label) {
                <li>
                  @if (entry.item; as link) {
                    <a
                      [routerLink]="link.path"
                      routerLinkActive="bg-accent font-semibold text-foreground"
                      class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      (click)="navOpen.set(false)"
                    >
                      <app-icon [name]="entry.icon" />{{ entry.label }}
                    </a>
                  } @else {
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                      [class.font-semibold]="isOpen(entry)"
                      [class.text-foreground]="isOpen(entry)"
                      [attr.aria-expanded]="isOpen(entry)"
                      [attr.aria-controls]="'group-' + entry.label"
                      (click)="toggle(entry)"
                    >
                      <app-icon [name]="entry.icon" />
                      <span class="flex-1">{{ entry.label }}</span>
                      <span class="transition" [class.rotate-90]="isOpen(entry)"
                        ><app-icon name="chevron"
                      /></span>
                    </button>
                    @if (isOpen(entry)) {
                      <ul
                        [id]="'group-' + entry.label"
                        class="mt-1 mb-1 ml-6 flex flex-col gap-0.5 border-l pl-3"
                      >
                        @for (child of entry.items; track child.path) {
                          <li>
                            <a
                              [routerLink]="child.path"
                              routerLinkActive="bg-accent font-semibold text-foreground"
                              class="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              (click)="navOpen.set(false)"
                              >{{ child.label }}</a
                            >
                          </li>
                        }
                      </ul>
                    }
                  }
                </li>
              }
            </ul>
          }
        </nav>

        <div class="mt-6 border-t pt-4">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            (click)="auth.logout()"
          >
            <app-icon name="logout" />Log out
          </button>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <div
          class="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 pt-4 md:px-4 md:pt-0"
        >
          <div class="min-w-0 flex-1"><app-global-search /></div>
          <app-notification-bell />
          <span class="hidden md:block"><app-theme-toggle /></span>
          <div class="flex items-center gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5 shadow-sm">
            <span
              class="flex size-9 items-center justify-center rounded-full bg-lavender text-sm font-semibold"
              aria-hidden="true"
              >{{ initials() }}</span
            >
            <span class="min-w-0 leading-tight">
              <span class="block truncate text-sm font-semibold">{{ auth.me()?.fullName }}</span>
              <span class="block truncate text-xs text-muted-foreground capitalize">{{
                roleNames()
              }}</span>
            </span>
          </div>
        </div>
        <main class="p-4 md:px-4 md:py-6">
          <div class="mx-auto max-w-6xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class StaffShell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly school = httpResource<School>(() => '/api/school');
  protected readonly navOpen = signal(false);

  private readonly url = signal(this.router.url);
  private readonly closed = signal<ReadonlySet<string>>(new Set());
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  protected readonly entries = computed(() => visibleEntries(NAV_ENTRIES, (p) => this.auth.has(p)));
  protected readonly sections = computed(() =>
    [
      { title: 'Menu', entries: this.entries().filter((e) => e.section === 'menu') },
      { title: 'Other', entries: this.entries().filter((e) => e.section === 'other') },
    ].filter((s) => s.entries.length),
  );

  protected readonly roleNames = computed(() =>
    (this.auth.me()?.roles ?? []).map((r) => r.replaceAll('_', ' ').toLowerCase()).join(', '),
  );
  protected readonly initials = computed(() =>
    (this.auth.me()?.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join(''),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        // Following a link into a group opens it again, even if it was folded.
        this.closed.set(new Set());
      });
  }

  /** A group is open when it holds the current page (unless folded by hand) or was opened by hand. */
  protected isOpen(entry: NavEntry): boolean {
    if (this.opened().has(entry.label)) return true;
    if (this.closed().has(entry.label)) return false;
    const path = this.url().split(/[?#]/)[0];
    return (entry.items ?? []).some((i) => path === i.path || path.startsWith(i.path + '/'));
  }

  protected toggle(entry: NavEntry): void {
    const open = this.isOpen(entry);
    const flip = (set: ReadonlySet<string>, on: boolean) => {
      const next = new Set(set);
      if (on) next.add(entry.label);
      else next.delete(entry.label);
      return next;
    };
    this.opened.update((s) => flip(s, !open));
    this.closed.update((s) => flip(s, open));
  }
}
