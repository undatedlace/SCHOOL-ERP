import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { AcademicYear, School } from '../core/models';
import { NAV_ENTRIES, NavEntry, visibleEntries } from '../core/nav';
import { initialsOf } from '../shared/ui/avatar';
import { GlobalSearch } from '../shared/ui/global-search';
import { NotificationBell } from '../shared/ui/notification-bell';
import { Icon } from '../shared/ui/icon';
import { ThemeToggle } from '../shared/ui/theme-toggle';
import { EnvBanner } from '../shared/ui/env-banner';

const COLLAPSED_KEY = 'sidebar-collapsed';
const SECTION_TITLES: Record<NavEntry['section'], string> = {
  overview: 'Overview',
  office: 'School office',
  admin: 'Administration',
};
const ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
  OFFICE_STAFF: 'Office',
  ACCOUNTANT: 'Accountant',
  TEACHER: 'Teacher',
  STAFF: 'Staff',
};

/** Today in India time, for example "Thu 12 Nov 2026". */
function todayLabel(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`;
}

/** Where today falls in the academic year: "Month 8 of 12", how far through, and the days left. */
export function yearProgress(year: Pick<AcademicYear, 'startDate' | 'endDate'>, now = new Date()) {
  // The API may send a plain date or a full timestamp; only the calendar day matters here.
  const start = new Date(year.startDate.slice(0, 10) + 'T00:00:00');
  const end = new Date(year.endDate.slice(0, 10) + 'T00:00:00');
  const day = 86_400_000;
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / day) + 1);
  const elapsed = Math.min(
    Math.max(Math.floor((now.getTime() - start.getTime()) / day) + 1, 0),
    total,
  );
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  const month = Math.min(
    Math.max(
      (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1,
      1,
    ),
    months,
  );
  return {
    started: now.getTime() >= start.getTime(),
    startsOn: start.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    month,
    months,
    share: elapsed / total,
    daysLeft: total - elapsed,
  };
}

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Staff area: a dark sidebar (sections, groups that fold, collapsible to icons on desktop,
 * a drawer on phones), a top bar with search, today's date, notifications and the signed-in person.
 */
@Component({
  selector: 'app-staff-shell',
  imports: [
    NgTemplateOutlet,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeToggle,
    Icon,
    GlobalSearch,
    NotificationBell,
    EnvBanner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-background">
      @if (navOpen()) {
        <div
          class="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
          (click)="navOpen.set(false)"
        ></div>
      }

      <aside
        id="main-nav"
        class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-linear-to-b from-sidebar-top to-sidebar-bottom text-white transition-[width,transform] duration-200 md:translate-x-0"
        [class.-translate-x-full]="!navOpen()"
        [class.md:w-[76px]]="collapsed()"
      >
        <div
          class="flex h-16 shrink-0 items-center gap-3 px-5"
          [class.md:justify-center]="collapsed()"
          [class.md:px-0]="collapsed()"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-amber text-base font-bold text-amber-ink"
            aria-hidden="true"
            >{{ schoolInitial() }}</span
          >
          <span class="min-w-0 leading-tight" [class.md:hidden]="collapsed()">
            <span class="block truncate text-[15px] font-bold">{{ schoolName() }}</span>
            <span class="block truncate text-xs text-white/60">School office</span>
          </span>
        </div>

        <nav class="app-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          @for (section of sections(); track section.title) {
            <p
              class="mt-5 mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-white/50 uppercase"
              [class.md:sr-only]="collapsed()"
            >
              {{ section.title }}
            </p>
            <ul class="flex flex-col gap-0.5">
              @for (entry of section.entries; track entry.label) {
                <li>
                  @if (entry.item; as link) {
                    <a
                      [routerLink]="link.path"
                      routerLinkActive="!bg-white/12 !text-white font-semibold before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-amber"
                      class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-white/75 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none"
                      [class.md:justify-center]="collapsed()"
                      [attr.title]="collapsed() ? entry.label : null"
                      (click)="navOpen.set(false)"
                    >
                      <app-icon [name]="entry.icon" /><span [class.md:sr-only]="collapsed()">{{
                        entry.label
                      }}</span>
                    </a>
                  } @else if (collapsed()) {
                    <a
                      [routerLink]="entry.items![0].path"
                      class="relative hidden items-center justify-center rounded-[10px] px-3 py-2.5 text-white/75 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none md:flex"
                      [class.!bg-white/12]="holdsCurrent(entry)"
                      [class.!text-white]="holdsCurrent(entry)"
                      [attr.title]="entry.label"
                      ><app-icon [name]="entry.icon" /><span class="sr-only">{{
                        entry.label
                      }}</span></a
                    >
                    <ng-container
                      *ngTemplateOutlet="group; context: { $implicit: entry, mobileOnly: true }"
                    />
                  } @else {
                    <ng-container
                      *ngTemplateOutlet="group; context: { $implicit: entry, mobileOnly: false }"
                    />
                  }
                </li>
              }
            </ul>
          }

          <p
            class="mt-5 mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-white/50 uppercase"
            [class.md:sr-only]="collapsed()"
          >
            Account
          </p>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[15px] text-white/75 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none"
            [class.md:justify-center]="collapsed()"
            [attr.title]="collapsed() ? 'Log out' : null"
            (click)="auth.logout()"
          >
            <app-icon name="logout" /><span [class.md:sr-only]="collapsed()">Log out</span>
          </button>
        </nav>

        @if (yearCard(); as y) {
          <div
            class="m-3 shrink-0 rounded-xl border border-white/10 bg-white/6 p-4"
            [class.md:hidden]="collapsed()"
          >
            <p class="text-[11px] font-semibold tracking-[0.08em] text-white/55 uppercase">
              Academic year {{ y.name }}
            </p>
            <p class="mt-1 text-[17px] font-bold">
              {{ y.started ? 'Month ' + y.month + ' of ' + y.months : 'Starts ' + y.startsOn }}
            </p>
            <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div class="h-full rounded-full bg-amber" [style.width.%]="y.share * 100"></div>
            </div>
            <p class="mt-2 text-xs text-white/60">
              {{ y.started ? y.daysLeft + ' days left in the year' : 'Not started yet' }}
            </p>
          </div>
        }
      </aside>

      <ng-template #group let-entry let-mobileOnly="mobileOnly">
        <div [class.md:hidden]="mobileOnly">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[15px] text-white/75 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none"
            [class.!text-white]="isOpen(entry)"
            [class.font-semibold]="isOpen(entry)"
            [attr.aria-expanded]="isOpen(entry)"
            [attr.aria-controls]="'group-' + entry.label"
            (click)="toggle(entry)"
          >
            <app-icon [name]="entry.icon" />
            <span class="flex-1">{{ entry.label }}</span>
            <span class="text-white/50 transition" [class.rotate-90]="isOpen(entry)"
              ><app-icon name="chevron"
            /></span>
          </button>
          @if (isOpen(entry)) {
            <ul
              [id]="'group-' + entry.label"
              class="mt-0.5 mb-1 ml-[1.35rem] flex flex-col gap-0.5 border-l border-white/15 pl-3"
            >
              @for (child of entry.items; track child.path) {
                <li>
                  <a
                    [routerLink]="child.path"
                    routerLinkActive="!bg-white/12 !text-white font-semibold"
                    class="block rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none"
                    (click)="navOpen.set(false)"
                    >{{ child.label }}</a
                  >
                </li>
              }
            </ul>
          }
        </div>
      </ng-template>

      <div
        class="transition-[padding] duration-200"
        [class.md:pl-64]="!collapsed()"
        [class.md:pl-[76px]]="collapsed()"
      >
        <app-env-banner />
        <header
          class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6"
        >
          <button
            type="button"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            [attr.aria-label]="navOpen() ? 'Close menu' : 'Open menu'"
            [attr.aria-expanded]="navOpen()"
            aria-controls="main-nav"
            (click)="navOpen.set(!navOpen())"
          >
            <app-icon name="menu" />
          </button>
          <button
            type="button"
            class="hidden size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex"
            [attr.aria-label]="collapsed() ? 'Expand the menu' : 'Collapse the menu'"
            [attr.aria-pressed]="collapsed()"
            (click)="toggleCollapsed()"
          >
            <app-icon name="sidebar" />
          </button>
          <div class="min-w-0 flex-1 md:max-w-xl"><app-global-search /></div>
          <div class="ml-auto flex items-center gap-2">
            <span
              class="hidden items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-primary lg:inline-flex"
            >
              <app-icon name="calendar" />{{ today }}
            </span>
            <span class="hidden md:block"><app-theme-toggle /></span>
            <app-notification-bell />
            <div class="ml-1 flex items-center gap-2.5">
              <span
                class="flex size-9 items-center justify-center rounded-[10px] bg-amber-soft text-[13px] font-bold text-amber-ink"
                aria-hidden="true"
                >{{ initials() }}</span
              >
              <span class="hidden min-w-0 leading-tight sm:block">
                <span class="block max-w-44 truncate text-sm font-semibold">{{
                  auth.me()?.fullName
                }}</span>
                <span class="block max-w-44 truncate text-xs text-muted-foreground">{{
                  roleNames()
                }}</span>
              </span>
            </div>
          </div>
        </header>
        <main class="px-4 py-6 md:px-8 md:py-8">
          <div class="mx-auto max-w-7xl">
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
  /** Only asked for by people who may read academic setup; anyone else simply gets no year card. */
  private readonly years = httpResource<AcademicYear[]>(() =>
    this.auth.has('academics.read') ? '/api/academic-years' : undefined,
  );
  protected readonly navOpen = signal(false);
  protected readonly collapsed = signal(readCollapsed());
  protected readonly today = todayLabel();

  private readonly url = signal(this.router.url);
  private readonly closed = signal<ReadonlySet<string>>(new Set());
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  protected readonly schoolName = computed(() => this.school.value()?.name ?? 'School ERP');
  protected readonly schoolInitial = computed(() => this.schoolName().charAt(0).toUpperCase());
  protected readonly entries = computed(() => visibleEntries(NAV_ENTRIES, (p) => this.auth.has(p)));
  protected readonly sections = computed(() =>
    (['overview', 'office', 'admin'] as const)
      .map((key) => ({
        title: SECTION_TITLES[key],
        entries: this.entries().filter((e) => e.section === key),
      }))
      .filter((s) => s.entries.length),
  );

  protected readonly yearCard = computed(() => {
    if (this.years.error()) return null;
    const year = this.years.value()?.find((y) => y.isCurrent);
    return year ? { name: year.name, ...yearProgress(year) } : null;
  });

  protected readonly roleNames = computed(() =>
    (this.auth.me()?.roles ?? [])
      .map((r) => ROLE_NAMES[r] ?? r.replaceAll('_', ' ').toLowerCase())
      .join(', '),
  );
  protected readonly initials = computed(() => initialsOf(this.auth.me()?.fullName ?? ''));

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

  protected toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed() ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  /** True when the current page is one of the group's pages. */
  protected holdsCurrent(entry: NavEntry): boolean {
    const path = this.url().split(/[?#]/)[0];
    return (entry.items ?? []).some((i) => path === i.path || path.startsWith(i.path + '/'));
  }

  /** A group is open when it holds the current page (unless folded by hand) or was opened by hand. */
  protected isOpen(entry: NavEntry): boolean {
    if (this.opened().has(entry.label)) return true;
    if (this.closed().has(entry.label)) return false;
    return this.holdsCurrent(entry);
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
