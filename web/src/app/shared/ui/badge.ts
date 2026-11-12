import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'primary' | 'amber';

/** Optimus/PrimeNG tag colour names, so a former p-tag can switch over without its logic changing. */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
const FROM_SEVERITY: Record<TagSeverity, BadgeTone> = {
  success: 'good',
  info: 'info',
  warn: 'warn',
  danger: 'bad',
  secondary: 'neutral',
  contrast: 'primary',
};

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
  /** The same colour named the Optimus way (success, warn, danger...); wins over tone when given. */
  readonly severity = input<TagSeverity | null | undefined>(undefined);
  protected readonly classes = computed(() => {
    const s = this.severity();
    return TONE[s ? FROM_SEVERITY[s] : this.tone()];
  });
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
