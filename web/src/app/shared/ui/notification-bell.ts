import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, interval } from 'rxjs';
import { Api } from '../../core/api';
import { AppNotification } from '../../core/models';
import { Icon } from './icon';
import { timeAgo } from './time-ago';
import { ButtonModule } from '@openng/optimus-ui/button';

const POLL_MS = 60_000;

/** The bell in the top bar: how many messages are unread, and the latest few. */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon, RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        class="relative inline-flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        [attr.aria-label]="unread() ? 'Notifications, ' + unread() + ' unread' : 'Notifications'"
        aria-haspopup="true"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <app-icon name="bell" />
        @if (unread() > 0) {
          <span
            class="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white"
            aria-hidden="true"
            >{{ unread() > 99 ? '99+' : unread() }}</span
          >
        }
      </button>
      @if (open()) {
        <div
          class="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-2 shadow-lg"
          role="region"
          aria-label="Latest notifications"
        >
          <div class="flex items-center justify-between px-2 py-1.5">
            <h2 class="text-sm font-semibold">Notifications</h2>
            @if (unread() > 0) {
              <p-button label="Mark all as read" size="small" [text]="true" (onClick)="readAll()" />
            }
          </div>
          <ul class="max-h-96 overflow-y-auto">
            @for (n of items(); track n.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-accent"
                  [class.bg-accent]="!n.read"
                  (click)="go(n)"
                >
                  <span class="text-sm" [class.font-semibold]="!n.read">{{ n.title }}</span>
                  @if (n.body) {
                    <span class="line-clamp-2 text-xs text-muted-foreground">{{ n.body }}</span>
                  }
                  <span class="text-xs text-muted-foreground">{{ ago(n.createdAt) }}</span>
                </button>
              </li>
            } @empty {
              <li class="px-2 py-4 text-sm text-muted-foreground">
                {{ loaded() ? 'Nothing new.' : 'Loading...' }}
              </li>
            }
          </ul>
          <div class="border-t px-2 pt-2">
            <a [routerLink]="allLink()" class="app-link text-sm" (click)="open.set(false)"
              >See all</a
            >
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationBell {
  /** Where "See all" goes (staff and portal have different addresses). */
  readonly allLink = input('/app/notifications');

  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly unread = signal(0);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly open = signal(false);
  protected readonly loaded = signal(false);
  protected readonly ago = (iso: string) => timeAgo(iso);

  constructor() {
    void this.refreshCount();
    interval(POLL_MS)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => void this.refreshCount());
  }

  private async refreshCount() {
    try {
      this.unread.set((await firstValueFrom(this.api.unreadNotifications())).unread);
    } catch {
      // The bell just keeps its last number.
    }
  }

  protected async toggle() {
    const next = !this.open();
    this.open.set(next);
    if (!next) return;
    try {
      const page = await firstValueFrom(this.api.notifications({ page: 1, pageSize: 8 }));
      this.items.set(page.items);
      this.unread.set(page.unread);
    } catch {
      this.items.set([]);
    } finally {
      this.loaded.set(true);
    }
  }

  protected async go(n: AppNotification) {
    this.open.set(false);
    if (!n.read) {
      try {
        this.unread.set((await firstValueFrom(this.api.markNotificationRead(n.id))).unread);
      } catch {
        // Opening the page matters more than the count.
      }
    }
    if (n.link) await this.router.navigateByUrl(n.link);
  }

  protected async readAll() {
    try {
      await firstValueFrom(this.api.markAllNotificationsRead());
      this.unread.set(0);
      this.items.update((list) => list.map((n) => ({ ...n, read: true })));
    } catch {
      // Nothing changed.
    }
  }

  @HostListener('document:click', ['$event'])
  protected onOutside(e: Event) {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
