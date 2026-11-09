import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Notice } from '../../core/models';
import { NoticeCard } from '../notices/notice-card';

/** Notices for a parent or student: only what the API says they may read. */
@Component({
  selector: 'app-portal-notices',
  imports: [ButtonModule, MessageModule, NoticeCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 text-xl font-semibold">Notices</h1>
    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (loaded()) {
      <div class="flex flex-col gap-3">
        @for (n of items(); track n.id) {
          <app-notice-card [notice]="n" />
        } @empty {
          <p class="text-muted-foreground">There are no notices right now.</p>
        }
      </div>
      @if (items().length < total()) {
        <div class="mt-4">
          <p-button label="Show more" severity="secondary" [outlined]="true" (onClick)="more()" />
        </div>
      }
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class PortalNotices {
  private readonly api = inject(Api);
  protected readonly items = signal<Notice[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  private page = 0;

  constructor() {
    void this.more();
  }

  protected async more() {
    try {
      const res = await firstValueFrom(this.api.notices({ page: this.page + 1, pageSize: 10 }));
      this.page++;
      this.items.update((all) => [...all, ...res.items]);
      this.total.set(res.total);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
