import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormSchema } from '../../core/models';

export interface Paper {
  id: string;
  label: string;
  received: boolean;
}

/**
 * The papers a form asks for (its "document" questions) and whether each has been uploaded.
 * Papers usually arrive after a person starts, so this is a checklist, not a condition for saving.
 */
export function papersFor(schema: FormSchema, answers: Record<string, unknown>): Paper[] {
  return schema.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.type === 'document')
    .map((f) => ({
      id: f.id,
      label: f.label,
      received: typeof answers[f.id] === 'string' && (answers[f.id] as string).length > 0,
    }));
}

/** "5 of 9 papers received", with the ones still missing listed in words (never by colour alone). */
@Component({
  selector: 'app-papers-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (papers().length) {
      <div class="mb-6 rounded-lg bg-muted/40 p-4" role="group" aria-label="Papers checklist">
        <p class="text-sm font-medium">
          {{ received() }} of {{ papers().length }} papers received
          @if (missing().length === 0) {
            <span class="font-normal text-muted-foreground">: nothing is missing.</span>
          }
        </p>
        <div
          class="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Papers received"
          [attr.aria-valuenow]="received()"
          aria-valuemin="0"
          [attr.aria-valuemax]="papers().length"
        >
          <div
            class="h-full rounded-full bg-primary"
            [style.width.%]="(received() / papers().length) * 100"
          ></div>
        </div>
        @if (missing().length) {
          <p class="mt-3 text-xs text-muted-foreground">Still missing</p>
          <ul class="mt-1 list-disc pl-5 text-sm">
            @for (p of missing(); track p.id) {
              <li>{{ p.label }}</li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class PapersChecklist {
  readonly schema = input.required<FormSchema>();
  readonly answers = input.required<Record<string, unknown>>();

  protected readonly papers = computed(() => papersFor(this.schema(), this.answers()));
  protected readonly missing = computed(() => this.papers().filter((p) => !p.received));
  protected readonly received = computed(() => this.papers().filter((p) => p.received).length);
}
