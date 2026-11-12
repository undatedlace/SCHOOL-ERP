import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Homework } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FileLinks } from './file-links';
import { HandInForm } from './hand-in-form';
import { Badge } from '../../shared/ui/badge';

/** One piece of homework. Plain text only: instructions are shown exactly as written, never as HTML. */
@Component({
  selector: 'app-homework-card',
  imports: [FileLinks, HandInForm, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="rounded-xl bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h3 class="font-semibold">{{ homework().title }}</h3>
        @if (homework().dueOn; as due) {
          <app-badge
            [label]="(homework().overdue ? 'Was due ' : 'Due ') + format(due)"
            [severity]="homework().overdue ? 'danger' : 'info'"
          />
        }
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        @if (homework().subject; as s) {
          {{ s.name }} &middot;
        }
        {{ homework().createdBy.fullName }}
      </p>
      <p class="mt-2 text-sm whitespace-pre-line">{{ homework().instructions }}</p>
      @if (homework().attachments.length) {
        <div class="mt-2">
          <app-file-links [homeworkId]="homework().id" [files]="homework().attachments" />
        </div>
      }
      <p class="mt-2 text-xs text-muted-foreground">
        For: {{ audience() }}
        @if (homework().handIn) {
          &middot; Hand in through the app
          @if (homework().maxMarks) {
            &middot; Out of {{ homework().maxMarks }}
          }
        }
      </p>
      @if (forFamily() && homework().handIn) {
        @for (c of homework().children; track c.studentId) {
          <app-hand-in-form [homework]="homework()" [child]="c" (changed)="changed.emit()" />
        }
      }
    </article>
  `,
})
export class HomeworkCard {
  readonly homework = input.required<Homework>();
  /** Staff see who it went to; a family sees which of their children it is for. */
  readonly forFamily = input(false);
  /** A hand-in was saved or taken back. */
  readonly changed = output<void>();

  protected readonly format = formatDate;

  protected audience(): string {
    const h = this.homework();
    if (this.forFamily() && h.forChildren.length) return h.forChildren.join(', ');
    const parts = [...h.divisions.map((d) => d.label), ...h.students.map((s) => s.name)];
    return parts.join(', ') || '-';
  }
}
