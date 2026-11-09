import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Notice } from '../../core/models';
import { HasPermission } from '../../shared/has-permission.directive';
import { PageHeader } from '../../shared/ui/page-header';
import { NoticeCard } from './notice-card';
import { NoticeDialog } from './notice-dialog';

type Tab = 'active' | 'all';

/** The staff view: what is showing to you, and (for writers) everything you may change. */
@Component({
  selector: 'app-notices-page',
  imports: [ButtonModule, MessageModule, HasPermission, PageHeader, NoticeCard, NoticeDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Notices"
      subtitle="Messages from the school to staff, parents and students."
    >
      <p-button
        *appHasPermission="'notices.create'"
        label="New notice"
        (onClick)="dialog().open(null)"
      />
    </app-page-header>

    <div
      class="mb-4 flex gap-1 rounded-md border p-1 w-fit"
      role="tablist"
      *appHasPermission="'notices.create'"
    >
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="tab() === 'active'"
        [class.text-primary-foreground]="tab() === 'active'"
        [attr.aria-selected]="tab() === 'active'"
        (click)="setTab('active')"
      >
        Showing now
      </button>
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="tab() === 'all'"
        [class.text-primary-foreground]="tab() === 'all'"
        [attr.aria-selected]="tab() === 'all'"
        (click)="setTab('all')"
      >
        Ones I can change
      </button>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (loaded()) {
      <div class="flex flex-col gap-3">
        @for (n of items(); track n.id) {
          <app-notice-card [notice]="n" [showAudience]="true">
            @if (n.canChange) {
              <span class="flex gap-1">
                <p-button label="Change" size="small" [text]="true" (onClick)="dialog().open(n)" />
                <p-button
                  label="Remove"
                  size="small"
                  severity="danger"
                  [text]="true"
                  (onClick)="confirmRemove(n)"
                />
              </span>
            }
          </app-notice-card>
        } @empty {
          <p class="text-muted-foreground">There are no notices.</p>
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

    <app-notice-dialog (saved)="reload()" />
  `,
})
export class NoticesPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  protected readonly dialog = viewChild.required(NoticeDialog);

  private readonly pageSize = 20;
  protected readonly tab = signal<Tab>('active');
  protected readonly items = signal<Notice[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  private page = 1;

  constructor() {
    void this.load(1);
  }

  protected setTab(tab: Tab) {
    this.tab.set(tab);
    void this.load(1);
  }
  protected reload() {
    void this.load(1);
  }
  protected more() {
    void this.load(this.page + 1);
  }

  protected confirmRemove(n: Notice) {
    this.confirmation.confirm({
      header: 'Remove notice',
      message: `Take down "${n.title}"? People will no longer see it.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.archiveNotice(n.id));
          this.toast.add({ severity: 'success', summary: 'Removed' });
          await this.load(1);
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not remove',
            detail: apiError(error),
          });
        }
      },
    });
  }

  private async load(page: number) {
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.notices({ page, pageSize: this.pageSize, status: this.tab() }),
      );
      this.page = page;
      this.items.set(page === 1 ? res.items : [...this.items(), ...res.items]);
      this.total.set(res.total);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
