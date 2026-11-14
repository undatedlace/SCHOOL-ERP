import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { apiError } from '../../core/api-error';
import { FileRef } from '../../core/models';
import { Api } from '../../core/api';
import { Avatar } from '../../shared/ui/avatar';
import { Badge } from '../../shared/ui/badge';
import { FilePicker } from '../../shared/ui/file-picker';
import { timeAgo } from '../../shared/ui/time-ago';
import { Conversation, ConversationDetail, ChatMessage, MessagesApi } from './messages-api';

const MAX_FILES = 3;
const MAX_BODY = 2000;

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** One conversation: the bubbles, attachments, the reply box and, for administrators, Close. */
@Component({
  selector: 'app-message-thread',
  imports: [ButtonModule, DialogModule, TextareaModule, Avatar, Badge, FilePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (detail(); as c) {
      <header class="flex items-start gap-3 border-b px-4 py-3">
        <p-button
          class="md:hidden"
          label="Back"
          size="small"
          severity="secondary"
          [text]="true"
          (onClick)="back.emit()"
        />
        <app-avatar [name]="otherName()" />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-base font-semibold">{{ c.subject }}</h2>
          <p class="truncate text-sm text-muted-foreground">{{ context() }}</p>
        </div>
        @if (c.status === 'CLOSED') {
          <app-badge label="Closed" tone="neutral" />
        }
        @if (canClose()) {
          <p-button
            label="Close"
            size="small"
            severity="secondary"
            [outlined]="true"
            (onClick)="openClose()"
          />
        }
      </header>

      <div
        #scroller
        class="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-3"
        role="log"
        aria-live="polite"
        [attr.aria-label]="'Messages in ' + c.subject"
      >
        @if (c.hasMore) {
          <div class="mb-3 text-center">
            <p-button
              label="Show earlier messages"
              size="small"
              severity="secondary"
              [outlined]="true"
              [loading]="loadingMore()"
              (onClick)="earlier()"
            />
          </div>
        }
        <ul class="flex flex-col gap-3">
          @for (m of messages(); track m.id) {
            <li class="flex" [class.justify-end]="m.senderIsMe">
              <div
                class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%]"
                [class]="
                  m.senderIsMe
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md bg-card'
                "
              >
                @if (!m.senderIsMe) {
                  <p class="mb-0.5 text-xs font-semibold text-muted-foreground">
                    {{ m.sender.name }}
                  </p>
                }
                <p class="whitespace-pre-wrap break-words">{{ m.body }}</p>
                @if (m.files.length) {
                  <ul class="mt-1.5 flex flex-col gap-0.5">
                    @for (f of m.files; track f.id) {
                      <li>
                        <a
                          class="underline"
                          [href]="fileUrl(f)"
                          target="_blank"
                          rel="noopener"
                          [attr.aria-label]="'Open attachment ' + f.name"
                          >{{ f.name }}</a
                        >
                        <span class="text-xs opacity-80"> ({{ size(f.sizeBytes) }})</span>
                      </li>
                    }
                  </ul>
                }
                <p class="mt-1 text-right text-[11px] opacity-75">{{ ago(m.createdAt) }}</p>
              </div>
            </li>
          }
        </ul>
      </div>

      <footer class="border-t bg-card px-4 py-3">
        @if (notice()) {
          <p class="mb-2 rounded-lg bg-info-soft px-3 py-1.5 text-sm text-info" role="status">
            {{ notice() }}
          </p>
        }
        @if (c.canReply) {
          <div class="flex flex-col gap-2">
            <textarea
              pTextarea
              rows="2"
              [attr.maxlength]="maxBody"
              [fluid]="true"
              placeholder="Write a message"
              aria-label="Your message"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              (keydown.control.enter)="send()"
            ></textarea>
            @if (files().length) {
              <ul class="flex flex-wrap gap-2">
                @for (f of files(); track f.id) {
                  <li class="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs">
                    {{ f.name }}
                    <p-button
                      label="Remove"
                      size="small"
                      severity="danger"
                      [text]="true"
                      [ariaLabel]="'Remove ' + f.name"
                      (onClick)="removeFile(f.id)"
                    />
                  </li>
                }
              </ul>
            }
            <div class="flex flex-wrap items-center gap-2">
              <app-file-picker
                label="Attach a photo or PDF"
                [disabled]="files().length >= maxFiles"
                [busy]="uploading()"
                (picked)="upload($event)"
              />
              <span class="text-xs text-muted-foreground"
                >{{ draft().length }} / {{ maxBody }}</span
              >
              <p-button
                class="ml-auto"
                label="Send"
                [disabled]="!draft().trim() || sending()"
                [loading]="sending()"
                (onClick)="send()"
              />
            </div>
          </div>
        } @else {
          <p class="rounded-lg bg-accent px-3 py-2 text-sm" role="status">
            This conversation is read only. {{ c.readOnlyReason }}
          </p>
          @if (c.status === 'CLOSED' && c.closeReason) {
            <p class="mt-1 text-xs text-muted-foreground">Reason: {{ c.closeReason }}</p>
          }
        }
        @if (error()) {
          <p class="mt-2 text-sm text-destructive" role="alert">{{ error() }}</p>
        }
        <p class="mt-2 text-xs text-muted-foreground">{{ c.safetyNotice }}</p>
      </footer>
    } @else {
      <div class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {{ failed() ? failed() : 'Loading...' }}
      </div>
    }

    <p-dialog
      header="Close this conversation"
      [visible]="closing()"
      (visibleChange)="!$event && closing.set(false)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-2 text-sm">
        <p>
          Both sides will be told, and neither can write again. The messages stay and the school can
          still read them.
        </p>
        <label for="close-reason" class="font-medium">Reason (required)</label>
        <textarea
          pTextarea
          id="close-reason"
          rows="3"
          maxlength="500"
          [fluid]="true"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>
        @if (closeError()) {
          <p class="text-destructive" role="alert">{{ closeError() }}</p>
        }
        <div class="mt-2 flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="closing.set(false)" />
          <p-button
            label="Close conversation"
            severity="danger"
            [disabled]="reason().trim().length < 3"
            [loading]="closeBusy()"
            (onClick)="confirmClose()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class MessageThread {
  readonly conversationId = input.required<string>();
  /** Fired with the fresh row after anything changes, so the inbox can update. */
  readonly changed = output<Conversation>();
  readonly back = output<void>();

  private readonly messagesApi = inject(MessagesApi);
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly maxBody = MAX_BODY;
  protected readonly maxFiles = MAX_FILES;
  protected readonly detail = signal<ConversationDetail | null>(null);
  protected readonly extra = signal<ChatMessage[]>([]);
  protected readonly draft = signal('');
  protected readonly files = signal<FileRef[]>([]);
  protected readonly uploading = signal(false);
  protected readonly sending = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly failed = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly closing = signal(false);
  protected readonly reason = signal('');
  protected readonly closeError = signal<string | null>(null);
  protected readonly closeBusy = signal(false);

  /** Earlier pages first, then the newest page. */
  protected readonly messages = computed(() => [
    ...this.extra(),
    ...(this.detail()?.messages ?? []),
  ]);
  protected readonly canClose = computed(() => {
    const d = this.detail();
    return !!d && d.myRole === 'admin' && d.status === 'OPEN';
  });
  protected readonly otherName = computed(() => {
    const d = this.detail();
    if (!d) return '';
    return d.myRole === 'family' ? d.teacher.name : d.student.name;
  });
  protected readonly context = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const place = [d.student.className, d.student.divisionName].filter(Boolean).join('-');
    const student = `${d.student.name}${place ? ` (${place})` : ''}`;
    const teacher = d.teacher.isClassTeacher
      ? `${d.teacher.name}, class teacher`
      : d.teacher.subjects.length
        ? `${d.teacher.name}, ${d.teacher.subjects.join(', ')}`
        : d.teacher.name;
    if (d.myRole === 'family') return teacher;
    if (d.myRole === 'teacher') return student;
    return `${student} with ${teacher}`;
  });

  protected readonly ago = (iso: string) => timeAgo(iso);
  protected readonly size = sizeText;

  constructor() {
    effect(() => {
      const id = this.conversationId();
      this.reset();
      void this.load(id);
    });
  }

  private reset() {
    this.detail.set(null);
    this.extra.set([]);
    this.draft.set('');
    this.files.set([]);
    this.error.set(null);
    this.failed.set(null);
    this.notice.set(null);
  }

  /** Reloads the newest page (the inbox calls this on its timer through the shared id). */
  async load(id: string) {
    try {
      const d = await firstValueFrom(this.messagesApi.conversation(id));
      if (id !== this.conversationId()) return;
      this.detail.set(d);
      this.extra.set([]);
      this.scrollDown();
      if (d.myRole !== 'admin' && d.unreadCount > 0) {
        await firstValueFrom(this.messagesApi.markRead(id));
        this.changed.emit({ ...d, unreadCount: 0 });
      }
    } catch (error) {
      if (id === this.conversationId()) this.failed.set(apiError(error));
    }
  }

  protected fileUrl(f: FileRef) {
    return this.messagesApi.fileUrl(this.conversationId(), f.id);
  }

  protected async earlier() {
    const d = this.detail();
    if (!d?.nextBefore) return;
    this.loadingMore.set(true);
    try {
      const older = await firstValueFrom(this.messagesApi.conversation(d.id, d.nextBefore));
      this.extra.set([...older.messages, ...this.extra()]);
      this.detail.set({ ...d, hasMore: older.hasMore, nextBefore: older.nextBefore });
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected async upload(file: File) {
    this.uploading.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.uploadFile(file, 'message-attachment'));
      this.files.set([
        ...this.files(),
        { id: saved.id, name: file.name, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes },
      ]);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.uploading.set(false);
    }
  }

  protected removeFile(id: string) {
    this.files.set(this.files().filter((f) => f.id !== id));
  }

  protected async send() {
    const d = this.detail();
    const body = this.draft().trim();
    if (!d || !body || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await firstValueFrom(
        this.messagesApi.send(d.id, { body, fileIds: this.files().map((f) => f.id) }),
      );
      this.detail.set({
        ...d,
        messages: [...d.messages, res.message],
        lastMessageAt: res.message.createdAt,
      });
      this.draft.set('');
      this.files.set([]);
      if (res.deliveredQuietly) {
        this.notice.set('The teacher will see this in school hours.');
      }
      this.changed.emit(res.conversation);
      this.scrollDown();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  protected openClose() {
    this.reason.set('');
    this.closeError.set(null);
    this.closing.set(true);
  }

  protected async confirmClose() {
    const d = this.detail();
    if (!d) return;
    this.closeBusy.set(true);
    this.closeError.set(null);
    try {
      const row = await firstValueFrom(this.messagesApi.close(d.id, this.reason().trim()));
      this.closing.set(false);
      this.toast.add({ severity: 'success', summary: 'Conversation closed' });
      this.detail.set({ ...d, ...row });
      this.changed.emit(row);
    } catch (error) {
      this.closeError.set(apiError(error));
    } finally {
      this.closeBusy.set(false);
    }
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
