import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { TagModule } from '@openng/optimus-ui/tag';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { FileRef, Homework, HomeworkSubmission } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FilePicker } from '../../shared/ui/file-picker';
import { FileLinks } from './file-links';

type Child = Homework['children'][number];

/** One child's hand-in for one homework: what was handed in, the teacher's marks, and the form to hand in. */
@Component({
  selector: 'app-hand-in-form',
  imports: [ButtonModule, TagModule, TextareaModule, FilePicker, FileLinks],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mt-3 rounded-lg bg-accent p-3 text-sm"
      [attr.aria-label]="'Hand-in for ' + child().name"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h4 class="font-medium">{{ child().name }}</h4>
        <p-tag [value]="statusText()" [severity]="severity()" />
        @if (sub()?.late) {
          <p-tag value="Handed in late" severity="warn" />
        }
      </div>

      @if (sub(); as s) {
        @if (s.status === 'REVIEWED') {
          <p class="mt-2">
            @if (s.marks !== null) {
              <strong>{{ s.marks }} / {{ homework().maxMarks }}</strong>
            }
            @if (s.feedback) {
              <span class="whitespace-pre-line"> {{ s.feedback }}</span>
            }
          </p>
        } @else if (s.status === 'REDO') {
          <p class="mt-2 whitespace-pre-line"><strong>Please do again:</strong> {{ s.feedback }}</p>
        }
      }

      @if (canEdit()) {
        <div class="mt-3 flex flex-col gap-2">
          <textarea
            pTextarea
            rows="3"
            maxlength="2000"
            [fluid]="true"
            placeholder="A note for the teacher (optional)"
            [attr.aria-label]="'Note for ' + homework().title"
            [value]="note() ?? sub()?.note ?? ''"
            (input)="note.set($any($event.target).value)"
          ></textarea>
          <app-file-links [homeworkId]="homework().id" [files]="files()" />
          @if (files().length) {
            <ul class="flex flex-wrap gap-2">
              @for (f of files(); track f.id) {
                <li>
                  <p-button
                    [label]="'Remove ' + f.name"
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
              [disabled]="files().length >= 5"
              [busy]="uploading()"
              (picked)="upload($event)"
            />
            <p-button
              [label]="sub() ? 'Hand in again' : 'Hand in'"
              size="small"
              [disabled]="!(note() ?? sub()?.note ?? '').trim() && files().length === 0"
              [loading]="saving()"
              (onClick)="save()"
            />
            @if (sub() && sub()!.status !== 'REVIEWED') {
              <p-button
                label="Take back"
                size="small"
                severity="secondary"
                (onClick)="withdraw()"
              />
            }
          </div>
          @if (error()) {
            <p class="text-destructive" role="alert">{{ error() }}</p>
          }
        </div>
      } @else if (sub(); as s) {
        @if (s.note) {
          <p class="mt-2 whitespace-pre-line text-muted-foreground">{{ s.note }}</p>
        }
        <div class="mt-1"><app-file-links [homeworkId]="homework().id" [files]="s.files" /></div>
      }
    </section>
  `,
})
export class HandInForm {
  readonly homework = input.required<Homework>();
  readonly child = input.required<Child>();
  /** Fired after anything changed, so the list can be reloaded. */
  readonly changed = output<void>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly sub = computed<HomeworkSubmission | null>(() => this.child().submission);
  protected readonly note = signal<string | null>(null);
  protected readonly extraFiles = signal<FileRef[] | null>(null);
  protected readonly uploading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canEdit = computed(() => this.sub()?.status !== 'REVIEWED');
  /** What is attached right now: the saved hand-in's files until the person changes them. */
  protected readonly files = computed(() => this.extraFiles() ?? this.sub()?.files ?? []);

  protected statusText = computed(() => {
    const s = this.sub();
    if (!s) return 'Not handed in';
    return s.status === 'REVIEWED'
      ? 'Marked'
      : s.status === 'REDO'
        ? 'To be done again'
        : 'Handed in';
  });
  protected severity = computed<'success' | 'warn' | 'info' | 'danger'>(() => {
    const s = this.sub();
    if (!s) return 'warn';
    return s.status === 'REVIEWED' ? 'success' : s.status === 'REDO' ? 'danger' : 'info';
  });
  protected readonly format = formatDate;

  protected async upload(file: File) {
    this.uploading.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.uploadFile(file, 'homework-submission'));
      this.extraFiles.set([
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
    this.extraFiles.set(this.files().filter((f) => f.id !== id));
  }

  protected async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.submitHandIn(this.homework().id, this.child().studentId, {
          note: (this.note() ?? this.sub()?.note ?? '').trim() || undefined,
          fileIds: this.files().map((f) => f.id),
        }),
      );
      this.extraFiles.set(null);
      this.note.set(null);
      this.toast.add({ severity: 'success', summary: 'Handed in' });
      this.changed.emit();
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async withdraw() {
    this.error.set(null);
    try {
      await firstValueFrom(this.api.withdrawHandIn(this.homework().id, this.child().studentId));
      this.extraFiles.set(null);
      this.note.set(null);
      this.changed.emit();
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
