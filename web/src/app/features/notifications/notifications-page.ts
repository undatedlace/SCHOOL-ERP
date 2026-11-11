import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AppNotification } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';
import { timeAgo } from '../../shared/ui/time-ago';

const PAGE = 20;

/** Every message sent to the signed-in person, newest first. */
@Component({
  selector: 'app-notifications-page',
  imports: [ButtonModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Notifications"
      subtitle="Messages from the school system about things that need you."
    >
      <p-button
        label="Mark all as read"
        severity="secondary"
        [disabled]="unread() === 0"
        (onClick)="readAll()"
      />
    </app-page-header>

    <div class="mb-4 flex gap-1 rounded-md border p-1 w-fit" role="tablist">
      @for (t of tabs; track t.id) {
        <button
          type="button"
          role="tab"
          class="rounded px-3 py-1 text-sm"
          [class.bg-primary]="onlyUnread() === t.unread"
          [class.text-primary-foreground]="onlyUnread() === t.unread"
          [attr.aria-selected]="onlyUnread() === t.unread"
          (click)="setTab(t.unread)"
        >
          {{ t.label }}{{ t.unread && unread() ? ' (' + unread() + ')' : '' }}
        </button>
      }
    </div>

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <ul class="divide-y rounded-xl bg-card shadow-sm">
      @for (n of items(); track n.id) {
        <li>
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 p-4 text-left hover:bg-accent"
            [class.bg-accent]="!n.read"
            (click)="open(n)"
          >
            <span [class.font-semibold]="!n.read">{{ n.title }}</span>
            @if (n.body) {
              <span class="text-sm text-muted-foreground">{{ n.body }}</span>
            }
            <span class="text-xs text-muted-foreground"
              >{{ ago(n.createdAt) }}{{ n.read ? '' : ' · unread' }}</span
            >
          </button>
        </li>
      } @empty {
        <li class="p-6 text-center text-sm text-muted-foreground">
          {{
            loaded() ? (onlyUnread() ? 'Nothing unread.' : 'No notifications yet.') : 'Loading...'
          }}
        </li>
      }
    </ul>
    @if (items().length < total()) {
      <div class="mt-4 text-center">
        <p-button label="Show more" severity="secondary" [outlined]="true" (onClick)="more()" />
      </div>
    }
  `,
})
export class NotificationsPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly tabs = [
    { id: 'all', label: 'All', unread: false },
    { id: 'unread', label: 'Unread', unread: true },
  ];
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly total = signal(0);
  protected readonly unread = signal(0);
  protected readonly onlyUnread = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly ago = (iso: string) => timeAgo(iso);
  private page = 1;

  constructor() {
    void this.load(true);
  }

  protected setTab(unread: boolean) {
    this.onlyUnread.set(unread);
    void this.load(true);
  }

  protected more() {
    this.page++;
    void this.load(false);
  }

  private async load(reset: boolean) {
    if (reset) this.page = 1;
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.notifications({ page: this.page, pageSize: PAGE, unread: this.onlyUnread() }),
      );
      this.items.set(reset ? res.items : [...this.items(), ...res.items]);
      this.total.set(res.total);
      this.unread.set(res.unread);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async open(n: AppNotification) {
    if (!n.read) {
      try {
        this.unread.set((await firstValueFrom(this.api.markNotificationRead(n.id))).unread);
        this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch {
        // Opening the page matters more.
      }
    }
    if (n.link) await this.router.navigateByUrl(n.link);
  }

  protected async readAll() {
    try {
      await firstValueFrom(this.api.markAllNotificationsRead());
      this.unread.set(0);
      this.items.update((l) => l.map((x) => ({ ...x, read: true })));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
