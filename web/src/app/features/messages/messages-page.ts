import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { SchoolClass } from '../../core/models';
import { Avatar } from '../../shared/ui/avatar';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { timeAgo } from '../../shared/ui/time-ago';
import { MessageThread } from './message-thread';
import { Conversation, MessagesApi } from './messages-api';
import { NewMessageDialog } from './new-message-dialog';

const PAGE = 20;
const REFRESH_MS = 30_000;

/**
 * Messages between a family and the teachers of their child. Used in the staff app (/app/messages) and the
 * parent and student portal (/portal/messages): an inbox on the left, the conversation on the right (one
 * pane at a time on a phone). Administrators can also look at every conversation, read only, and close one.
 */
@Component({
  selector: 'app-messages-page',
  imports: [
    FormsModule,
    ButtonModule,
    SelectButtonModule,
    Avatar,
    FilterBar,
    PageHeader,
    MessageThread,
    NewMessageDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="inPortal ? 'hidden md:block' : ''">
      <app-page-header
        title="Messages"
        subtitle="Write to your child's teachers, or to the families of your students. The school can read messages for safety."
      >
        @if (canUse()) {
          <p-button label="New message" (onClick)="composing.set(true)" />
        }
      </app-page-header>
    </div>
    @if (inPortal && !id()) {
      <div class="mb-3 flex items-center justify-between gap-2 md:hidden">
        <h1 class="text-xl font-semibold">Messages</h1>
        @if (canUse()) {
          <p-button label="New message" size="small" (onClick)="composing.set(true)" />
        }
      </div>
    }

    @if (notice()) {
      <p class="mb-3 rounded-lg bg-info-soft px-3 py-2 text-sm text-info" role="status">
        {{ notice() }}
      </p>
    }

    <div
      class="flex h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-xl bg-card shadow-sm"
    >
      <section
        class="min-h-0 w-full flex-col border-r md:flex md:w-[22rem] md:shrink-0"
        [class]="id() ? 'hidden' : 'flex'"
        aria-label="Conversations"
      >
        <div class="flex flex-col gap-2 border-b p-3">
          <div class="flex flex-wrap items-center gap-2">
            <p-selectbutton
              [options]="tabOptions()"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              [ngModel]="unreadOnly()"
              (ngModelChange)="setUnread($event)"
              aria-label="Which conversations to show"
            />
            @if (isAdmin()) {
              <p-selectbutton
                [options]="scopeOptions"
                optionLabel="label"
                optionValue="value"
                [allowEmpty]="false"
                [ngModel]="all()"
                (ngModelChange)="setAll($event)"
                aria-label="Whose conversations"
              />
            }
          </div>
          <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />
        </div>

        @if (error()) {
          <p class="p-3 text-sm text-destructive" role="alert">{{ error() }}</p>
        }
        <ul class="min-h-0 flex-1 divide-y overflow-y-auto">
          @for (c of items(); track c.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-accent"
                [class.bg-primary-soft]="c.id === id()"
                [attr.aria-current]="c.id === id() ? 'true' : null"
                (click)="open(c)"
              >
                <app-avatar [name]="other(c)" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="truncate" [class.font-semibold]="c.unreadCount > 0">{{
                      other(c)
                    }}</span>
                    <span class="shrink-0 text-xs text-muted-foreground">{{
                      ago(c.lastMessageAt)
                    }}</span>
                  </span>
                  <span class="block truncate text-sm" [class.font-semibold]="c.unreadCount > 0">{{
                    c.subject
                  }}</span>
                  <span class="flex items-center gap-2">
                    <span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      @if (c.lastMessage?.senderIsMe) {
                        <span>You: </span>
                      }
                      {{ c.lastMessage?.bodyPreview }}
                    </span>
                    @if (c.unreadCount > 0) {
                      <span
                        class="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                        [attr.aria-label]="c.unreadCount + ' unread'"
                        >{{ c.unreadCount }}</span
                      >
                    }
                  </span>
                  @if (all()) {
                    <span class="block truncate text-xs text-muted-foreground">{{
                      adminLine(c)
                    }}</span>
                  }
                  @if (c.status === 'CLOSED') {
                    <span class="text-xs text-muted-foreground">Closed</span>
                  } @else if (!c.canReply && !all()) {
                    <span class="text-xs text-muted-foreground">Read only</span>
                  }
                </span>
              </button>
            </li>
          } @empty {
            <li class="p-6 text-center text-sm text-muted-foreground">
              {{
                !loaded()
                  ? 'Loading...'
                  : unreadOnly()
                    ? 'Nothing unread.'
                    : 'No conversations yet.'
              }}
            </li>
          }
        </ul>
        @if (items().length < total()) {
          <div class="border-t p-2 text-center">
            <p-button
              label="Show more"
              size="small"
              severity="secondary"
              [outlined]="true"
              (onClick)="more()"
            />
          </div>
        }
      </section>

      <section
        class="min-h-0 min-w-0 flex-1 flex-col md:flex"
        [class]="id() ? 'flex' : 'hidden'"
        aria-label="Conversation"
      >
        @if (id(); as current) {
          <app-message-thread
            [conversationId]="current"
            (changed)="rowChanged($event)"
            (back)="close()"
          />
        } @else {
          <div class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Choose a conversation, or start a new message.
          </div>
        }
      </section>
    </div>

    <app-new-message-dialog
      [open]="composing()"
      (closed)="composing.set(false)"
      (started)="started($event)"
    />
  `,
})
export class MessagesPage {
  /** The conversation open on the right (the route's :id). */
  readonly id = input<string>();

  private readonly api = inject(Api);
  private readonly messagesApi = inject(MessagesApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly inPortal = this.router.url.startsWith('/portal');
  private readonly base = this.inPortal ? '/portal/messages' : '/app/messages';

  protected readonly canUse = computed(() => this.auth.has('messages.use'));
  protected readonly isAdmin = computed(() => this.auth.has('messages.read_all'));
  protected readonly items = signal<Conversation[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly unreadOnly = signal(false);
  protected readonly all = signal(false);
  protected readonly composing = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  private filters: FilterValues = {};
  private page = 1;

  protected readonly scopeOptions = [
    { label: 'My conversations', value: false },
    { label: 'All conversations', value: true },
  ];
  protected readonly unreadCount = computed(() =>
    this.items().reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0),
  );
  protected readonly tabOptions = computed(() => [
    { label: 'All', value: false },
    {
      label: this.unreadCount() > 0 ? `Unread (${this.unreadCount()})` : 'Unread',
      value: true,
    },
  ]);
  protected readonly fields = computed<FilterField[]>(() => {
    const search: FilterField = {
      key: 'q',
      label: 'Search',
      type: 'search',
      placeholder: this.all() ? 'Subject, student or teacher' : 'Search messages',
    };
    if (!this.all()) return [search];
    const classId = this.filters['classId'];
    return [
      search,
      {
        key: 'classId',
        label: 'Class',
        type: 'select',
        placeholder: 'Any class',
        options: this.classes().map((c) => ({ label: c.name, value: c.id })),
      },
      {
        key: 'divisionId',
        label: 'Division',
        type: 'select',
        placeholder: 'Any division',
        dependsOn: 'classId',
        disabled: !classId,
        options: (this.classes().find((c) => c.id === classId)?.divisions ?? []).map((d) => ({
          label: d.name,
          value: d.id,
        })),
      },
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
    ];
  });

  protected readonly ago = (iso: string) => timeAgo(iso);

  constructor() {
    void this.load(true);
    const timer = setInterval(() => void this.load(true, true), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Who the other side is: the teacher for a family, the student for a teacher. */
  protected other(c: Conversation) {
    return c.myRole === 'family' ? c.teacher.name : c.student.name;
  }

  protected adminLine(c: Conversation) {
    const place = [c.student.className, c.student.divisionName].filter(Boolean).join('-');
    return `${c.student.name}${place ? ` (${place})` : ''} with ${c.teacher.name}`;
  }

  protected setUnread(value: boolean) {
    this.unreadOnly.set(value);
    void this.load(true);
  }

  protected async setAll(value: boolean) {
    this.all.set(value);
    this.filters = {};
    if (value && this.classes().length === 0) {
      try {
        this.classes.set(await firstValueFrom(this.api.classes()));
      } catch {
        // The class filter stays empty; searching still works.
      }
    }
    void this.load(true);
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    void this.load(true);
  }

  protected more() {
    this.page++;
    void this.load(false);
  }

  /** Reloads the list. A quiet refresh keeps the pages already shown. */
  private async load(reset: boolean, quiet = false) {
    if (reset && !quiet) this.page = 1;
    const pages = quiet ? this.page : 1;
    this.error.set(null);
    try {
      const f = this.filters;
      const res = await firstValueFrom(
        this.messagesApi.conversations({
          page: quiet ? 1 : this.page,
          pageSize: quiet ? PAGE * pages : PAGE,
          all: this.all(),
          unread: this.unreadOnly() && !this.all(),
          q: f['q'],
          classId: f['classId'],
          divisionId: f['divisionId'],
          from: f['from'],
          to: f['to'],
        }),
      );
      this.items.set(reset || quiet ? res.items : [...this.items(), ...res.items]);
      this.total.set(res.total);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected open(c: Conversation) {
    void this.router.navigate([this.base, c.id]);
  }

  protected close() {
    void this.router.navigate([this.base]);
  }

  /** The open conversation changed (read, replied to, closed): update its row in the inbox. */
  protected rowChanged(row: Conversation) {
    const have = this.items().some((c) => c.id === row.id);
    this.items.update((list) =>
      have ? list.map((c) => (c.id === row.id ? { ...c, ...row } : c)) : [row, ...list],
    );
  }

  protected started(e: { conversation: Conversation; deliveredQuietly: boolean }) {
    this.composing.set(false);
    this.notice.set(
      e.deliveredQuietly && e.conversation.myRole === 'family'
        ? 'Sent. The teacher will see this in school hours.'
        : 'Message sent.',
    );
    this.rowChanged(e.conversation);
    this.open(e.conversation);
  }
}
