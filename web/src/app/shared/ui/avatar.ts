import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Soft background and ink pairs; a name always gets the same pair, so a person is recognisable. */
const TONES = [
  'bg-primary-soft text-primary',
  'bg-amber-soft text-warn',
  'bg-info-soft text-info',
  'bg-good-soft text-good',
  'bg-bad-soft text-bad',
] as const;

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** A person's photograph, or their initials on a tinted square. Decorative: the name beside it carries the meaning. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (photoFileId()) {
      <img [src]="'/api/files/' + photoFileId()" alt="" [class]="box() + ' border object-cover'" />
    } @else {
      <span
        [class]="box() + ' inline-flex items-center justify-center font-semibold ' + tone()"
        aria-hidden="true"
        >{{ initials() }}</span
      >
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly photoFileId = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly tone = computed(() => {
    let h = 0;
    for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return TONES[h % TONES.length];
  });
  protected readonly box = computed(
    () =>
      ({
        sm: 'size-8 rounded-lg text-xs',
        md: 'size-9 rounded-[10px] text-[13px]',
        lg: 'size-16 rounded-2xl text-xl sm:size-20 sm:text-2xl',
      })[this.size()],
  );
}
