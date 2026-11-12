import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { HandInRoster, Homework } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FileLinks } from './file-links';
import { Badge } from '../../shared/ui/badge';

interface Draft {
  marks: number | null;
  feedback: string;
}

/** The teacher sees who has handed in, opens the work, and marks it or sends it back. */
@Component({
  selector: 'app-hand-ins-dialog',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    FileLinks,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'Hand-ins: ' + (homework()?.title ?? '')"
      [visible]="!!homework()"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [style]="{ width: '46rem', 'max-width': '95vw' }"
    >
      @if (error()) {
        <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
      }
      @if (roster(); as r) {
        <p class="mb-3 text-sm text-muted-foreground">
          {{ r.counts.handedIn }} of {{ r.counts.students }} handed in,
          {{ r.counts.marked }} marked.
          @if (r.maxMarks) {
            Marks are out of {{ r.maxMarks }}.
          }
        </p>
        <ul class="flex flex-col gap-3">
          @for (s of r.students; track s.studentId) {
            <li class="rounded-lg bg-accent p-3 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ s.name }}</span>
                <span class="text-xs text-muted-foreground"
                  >{{ s.division }} &middot; No. {{ s.admissionNo }}</span
                >
                @if (s.submission; as sub) {
                  <app-badge
                    [label]="
                      sub.status === 'REVIEWED'
                        ? 'Marked'
                        : sub.status === 'REDO'
                          ? 'Sent back'
                          : 'Handed in'
                    "
                    [severity]="
                      sub.status === 'REVIEWED'
                        ? 'success'
                        : sub.status === 'REDO'
                          ? 'danger'
                          : 'info'
                    "
                  />
                  @if (sub.late) {
                    <app-badge label="Late" severity="warn" />
                  }
                  <span class="text-xs text-muted-foreground">{{ when(sub.submittedAt) }}</span>
                } @else {
                  <app-badge label="Not handed in" severity="warn" />
                }
              </div>
              @if (s.submission; as sub) {
                @if (sub.note) {
                  <p class="mt-2 whitespace-pre-line">{{ sub.note }}</p>
                }
                <div class="mt-1">
                  <app-file-links [homeworkId]="homework()!.id" [files]="sub.files" />
                </div>
                @if (sub.status === 'REVIEWED') {
                  <p class="mt-2">
                    @if (sub.marks !== null) {
                      <strong>{{ sub.marks }} / {{ r.maxMarks }}</strong>
                    }
                    {{ sub.feedback }}
                  </p>
                }
                <div class="mt-2 flex flex-wrap items-end gap-2">
                  @if (r.maxMarks) {
                    <p-inputnumber
                      [min]="0"
                      [max]="+r.maxMarks"
                      [maxFractionDigits]="2"
                      placeholder="Marks"
                      [ariaLabel]="'Marks for ' + s.name"
                      [ngModel]="draft(s.studentId, sub.marks).marks"
                      (ngModelChange)="setMarks(s.studentId, sub.marks, $event)"
                      styleClass="w-24"
                    />
                  }
                  <input
                    pInputText
                    maxlength="1000"
                    class="min-w-48 flex-1"
                    placeholder="Comment (needed when sending back)"
                    [attr.aria-label]="'Comment for ' + s.name"
                    [value]="draft(s.studentId, sub.marks).feedback || (sub.feedback ?? '')"
                    (input)="setFeedback(s.studentId, sub.marks, $any($event.target).value)"
                  />
                  <p-button
                    label="Mark"
                    size="small"
                    (onClick)="review(s.studentId, sub.feedback, 'REVIEWED')"
                  />
                  <p-button
                    label="Send back"
                    size="small"
                    severity="secondary"
                    (onClick)="review(s.studentId, sub.feedback, 'REDO')"
                  />
                </div>
              }
            </li>
          } @empty {
            <li class="text-sm text-muted-foreground">No students.</li>
          }
        </ul>
      } @else if (!error()) {
        <p class="text-sm text-muted-foreground">Loading...</p>
      }
    </p-dialog>
  `,
})
export class HandInsDialog {
  readonly homework = input<Homework | null>(null);
  readonly closed = output<void>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  protected readonly roster = signal<HandInRoster | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly drafts = signal<Record<string, Draft>>({});

  constructor() {
    effect(() => {
      const h = this.homework();
      this.roster.set(null);
      this.error.set(null);
      this.drafts.set({});
      if (h) void this.load(h.id);
    });
  }

  protected when(iso: string) {
    return formatDate(iso);
  }

  protected draft(id: string, savedMarks: string | null): Draft {
    return this.drafts()[id] ?? { marks: savedMarks === null ? null : +savedMarks, feedback: '' };
  }
  protected setMarks(id: string, saved: string | null, marks: number | null) {
    this.drafts.update((d) => ({ ...d, [id]: { ...this.draft(id, saved), marks } }));
  }
  protected setFeedback(id: string, saved: string | null, feedback: string) {
    this.drafts.update((d) => ({ ...d, [id]: { ...this.draft(id, saved), feedback } }));
  }

  private async load(id: string) {
    try {
      this.roster.set(await firstValueFrom(this.api.handIns(id)));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected async review(
    studentId: string,
    savedFeedback: string | null,
    status: 'REVIEWED' | 'REDO',
  ) {
    const h = this.homework();
    if (!h) return;
    const d = this.draft(studentId, null);
    const feedback = (d.feedback || savedFeedback || '').trim();
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.reviewHandIn(h.id, studentId, {
          status,
          ...(status === 'REVIEWED' && d.marks !== null ? { marks: d.marks } : {}),
          ...(feedback ? { feedback } : {}),
        }),
      );
      this.toast.add({
        severity: 'success',
        summary: status === 'REVIEWED' ? 'Marked' : 'Sent back',
      });
      this.drafts.update((all) =>
        Object.fromEntries(Object.entries(all).filter(([k]) => k !== studentId)),
      );
      await this.load(h.id);
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
