import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { FileRef } from '../../core/models';
import { FilePicker } from '../../shared/ui/file-picker';
import { Conversation, FamilyContact, MessagesApi, StudentContact } from './messages-api';

interface TeacherOption {
  key: string;
  label: string;
  studentId: string;
  teacherUserId: string;
}

/** Start a conversation: a family picks a teacher, a teacher picks a student. */
@Component({
  selector: 'app-new-message-dialog',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    FilePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="New message"
      [visible]="open()"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [style]="{ width: '34rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-4 text-sm">
        @if (loadError()) {
          <p class="text-destructive" role="alert">{{ loadError() }}</p>
        }

        @if (kind() === 'family') {
          <div class="flex flex-col gap-1">
            <span id="nm-teacher">Who do you want to write to?</span>
            <p-select
              [options]="teacherOptions()"
              optionLabel="label"
              optionValue="key"
              placeholder="Choose a teacher"
              [filter]="true"
              [ngModel]="teacherKey()"
              (ngModelChange)="teacherKey.set($event)"
              ariaLabel="Teacher"
              appendTo="body"
              [fluid]="true"
            />
            @if (loaded() && !teacherOptions().length) {
              <small class="text-muted-foreground"
                >No teacher can be written to yet. Ask the school office.</small
              >
            }
          </div>
        } @else if (kind() === 'teacher') {
          <div class="flex flex-col gap-1">
            <label for="nm-search">Student</label>
            <input
              pInputText
              id="nm-search"
              type="search"
              placeholder="Search by name or admission number"
              [fluid]="true"
              [value]="search()"
              (input)="searchChanged($any($event.target).value)"
            />
            <ul
              class="mt-1 max-h-44 divide-y overflow-y-auto rounded-lg border"
              aria-label="Students you teach"
            >
              @for (s of students(); track s.studentId) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
                    [class.bg-primary-soft]="studentId() === s.studentId"
                    [attr.aria-pressed]="studentId() === s.studentId"
                    (click)="studentId.set(s.studentId)"
                  >
                    <span>{{ s.name }}</span>
                    <span class="text-xs text-muted-foreground"
                      >{{ s.className }}-{{ s.divisionName }} · {{ s.admissionNo }}</span
                    >
                  </button>
                </li>
              } @empty {
                <li class="px-3 py-3 text-muted-foreground">
                  {{ loaded() ? 'No students found.' : 'Loading...' }}
                </li>
              }
            </ul>
          </div>
        }

        <div class="flex flex-col gap-1">
          <label for="nm-subject">Subject</label>
          <input
            pInputText
            id="nm-subject"
            maxlength="120"
            placeholder="For example: Homework in maths"
            [fluid]="true"
            [value]="subject()"
            (input)="subject.set($any($event.target).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="nm-body">Message</label>
          <textarea
            pTextarea
            id="nm-body"
            rows="5"
            maxlength="2000"
            [fluid]="true"
            [value]="body()"
            (input)="body.set($any($event.target).value)"
          ></textarea>
          <small class="text-muted-foreground"
            >Plain text. The school can read messages for safety.</small
          >
        </div>
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
        <div class="flex flex-wrap items-center justify-between gap-2">
          <app-file-picker
            label="Attach a photo or PDF"
            [disabled]="files().length >= 3"
            [busy]="uploading()"
            (picked)="upload($event)"
          />
          <div class="flex gap-2">
            <p-button label="Cancel" severity="secondary" (onClick)="closed.emit()" />
            <p-button label="Send" [disabled]="!ready()" [loading]="saving()" (onClick)="send()" />
          </div>
        </div>
        @if (error()) {
          <p class="text-destructive" role="alert">{{ error() }}</p>
        }
      </div>
    </p-dialog>
  `,
})
export class NewMessageDialog {
  readonly open = input(false);
  readonly closed = output<void>();
  /** The conversation just started, with the notice to show (for a message in quiet hours). */
  readonly started = output<{ conversation: Conversation; deliveredQuietly: boolean }>();

  private readonly messagesApi = inject(MessagesApi);
  private readonly api = inject(Api);

  protected readonly kind = signal<'family' | 'teacher' | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly family = signal<FamilyContact[]>([]);
  protected readonly students = signal<StudentContact[]>([]);
  protected readonly teacherKey = signal<string | null>(null);
  protected readonly studentId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly files = signal<FileRef[]>([]);
  protected readonly uploading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly teacherOptions = computed<TeacherOption[]>(() => {
    const kids = new Set(this.family().map((c) => c.studentId));
    return this.family().map((c) => ({
      key: `${c.studentId}:${c.teacherUserId}`,
      studentId: c.studentId,
      teacherUserId: c.teacherUserId,
      label: [
        c.teacherName,
        c.isClassTeacher ? 'Class teacher' : c.subjects.join(', '),
        kids.size > 1 ? `about ${c.studentName}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }));
  });
  protected readonly ready = computed(
    () =>
      !!this.subject().trim() &&
      !!this.body().trim() &&
      (this.kind() === 'family' ? !!this.teacherKey() : !!this.studentId()),
  );

  constructor() {
    effect(() => {
      if (this.open()) void this.start();
    });
  }

  private async start() {
    this.subject.set('');
    this.body.set('');
    this.files.set([]);
    this.error.set(null);
    this.teacherKey.set(null);
    this.studentId.set(null);
    this.search.set('');
    this.loaded.set(false);
    await this.loadContacts();
  }

  private async loadContacts() {
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.messagesApi.contacts({ q: this.search() }));
      this.kind.set(res.kind);
      if (res.kind === 'family') this.family.set(res.items);
      else this.students.set(res.items);
    } catch (error) {
      this.loadError.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected searchChanged(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadContacts(), 250);
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
    if (!this.ready() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const pick = this.teacherOptions().find((o) => o.key === this.teacherKey());
      const res = await firstValueFrom(
        this.messagesApi.start({
          ...(this.kind() === 'family'
            ? { teacherUserId: pick?.teacherUserId, studentId: pick?.studentId }
            : { studentId: this.studentId() ?? undefined }),
          subject: this.subject().trim(),
          body: this.body().trim(),
          fileIds: this.files().map((f) => f.id),
        }),
      );
      this.started.emit({ conversation: res.conversation, deliveredQuietly: res.deliveredQuietly });
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
