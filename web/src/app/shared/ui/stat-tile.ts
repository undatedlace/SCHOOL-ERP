import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from './icon';

export type StatTone = 'primary' | 'amber' | 'good' | 'bad' | 'info' | 'neutral';

const ICON_TONE: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary',
  amber: 'bg-amber-soft text-warn',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  neutral: 'bg-accent text-muted-foreground',
};

/**
 * One number with its label and a line of context, optionally with a progress bar
 * (for example "₹2,85,000 collected, 83% of billed"). The share is also written out.
 */
@Component({
  selector: 'app-stat-tile',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="h-full rounded-xl bg-card p-5 shadow-sm" [class.p-4]="compact()">
      <div class="flex items-center gap-3">
        @if (icon()) {
          <span
            [class]="'inline-flex size-9 items-center justify-center rounded-[10px] ' + iconTone()"
            ><app-icon [name]="icon()!"
          /></span>
        }
        <p [class]="compact() ? 'app-eyebrow' : 'text-sm font-semibold text-foreground-2'">
          {{ label() }}
        </p>
      </div>
      <p
        class="mt-3 font-bold tracking-tight tabular-nums"
        [class.text-3xl]="!compact()"
        [class.text-2xl]="compact()"
        [class.mt-2]="compact()"
      >
        {{ value() }}
        @if (suffix()) {
          <span class="text-sm font-medium text-muted-foreground">{{ suffix() }}</span>
        }
      </p>
      @if (progress() !== null) {
        <div
          class="mt-3 h-1.5 overflow-hidden rounded-full bg-accent"
          role="progressbar"
          [attr.aria-valuenow]="percent()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="label()"
        >
          <div class="h-full rounded-full bg-primary" [style.width.%]="percent()"></div>
        </div>
      }
      @if (hint()) {
        <p class="mt-2 text-xs text-muted-foreground" [class.mt-1]="compact()">{{ hint() }}</p>
      }
    </div>
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly suffix = input<string>();
  readonly hint = input<string>();
  readonly icon = input<string>();
  readonly tone = input<StatTone>('primary');
  /** A share from 0 to 1, drawn as a bar. */
  readonly progress = input<number | null>(null);
  /** Smaller tile, for a row of many (for example one per class). */
  readonly compact = input(false);

  protected readonly iconTone = computed(() => ICON_TONE[this.tone()]);
  protected readonly percent = computed(() =>
    Math.round(Math.min(Math.max(this.progress() ?? 0, 0), 1) * 100),
  );
}
