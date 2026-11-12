import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'primary' | 'amber';

const TONE: Record<BadgeTone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  neutral: 'bg-accent text-muted-foreground',
  primary: 'bg-primary-soft text-primary',
  amber: 'bg-amber-soft text-amber-ink',
};

/** A small status pill: a dot and a word. The word carries the meaning; the colour only helps. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span
    [class]="
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ' +
      classes()
    "
  >
    @if (dot()) {
      <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
    }
    {{ label() }}</span
  >`,
})
export class Badge {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
  readonly dot = input(true);
  protected readonly classes = computed(() => TONE[this.tone()]);
}

/** A class and division as a compact pill, for example "Std 1-A". */
@Component({
  selector: 'app-class-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span
    class="inline-flex items-center rounded-md bg-primary-soft px-2 py-0.5 text-xs font-bold whitespace-nowrap text-primary"
    >{{ label() }}</span
  >`,
})
export class ClassPill {
  readonly label = input.required<string>();
}
