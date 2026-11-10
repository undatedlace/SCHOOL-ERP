import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CalendarEvent } from '../../core/models';
import { fromIsoDate } from '../../shared/dates';
import { CATEGORY_CLASS, eventsOn, monthGrid, timeText } from './calendar-utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One month as a bordered grid, each day showing up to two events and "+N more". */
@Component({
  selector: 'app-month-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-hidden rounded-lg border">
      <div
        class="grid grid-cols-7 bg-accent text-center text-xs font-medium uppercase"
        aria-hidden="true"
      >
        @for (d of weekdays; track d) {
          <span class="py-2.5">{{ d }}</span>
        }
      </div>
      @for (week of weeks(); track $index) {
        <div class="grid grid-cols-7 border-t">
          @for (cell of week; track cell.iso; let last = $last) {
            <button
              type="button"
              class="flex min-h-16 flex-col items-start gap-1 p-1.5 text-left text-sm transition hover:bg-accent sm:min-h-24"
              [class.border-r]="!last"
              [class.text-muted-foreground]="!cell.inMonth"
              [class.bg-accent]="cell.iso === selected()"
              [attr.aria-pressed]="cell.iso === selected()"
              [attr.aria-label]="cell.iso + ', ' + countText(cell.iso)"
              (click)="pick.emit(cell.iso)"
            >
              <span
                class="inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold"
                [class.bg-destructive]="cell.iso === today()"
                [class.text-white]="cell.iso === today()"
                >{{ cell.day }}</span
              >
              @for (e of cellEvents()[cell.iso] ?? []; track e.id; let i = $index) {
                @if (i < 2) {
                  <span
                    class="hidden w-full truncate rounded px-1.5 py-0.5 text-xs text-foreground sm:block"
                    [class]="categoryClass[e.category]"
                    >{{ e.startTime && e.startsOn === e.endsOn ? time(e.startTime) + ' ' : ''
                    }}{{ e.title }}</span
                  >
                }
              }
              @if ((cellEvents()[cell.iso] ?? []).length) {
                <span class="text-xs text-muted-foreground sm:hidden"
                  >&bull; {{ (cellEvents()[cell.iso] ?? []).length }}</span
                >
              }
              @if ((cellEvents()[cell.iso] ?? []).length > 2) {
                <span class="hidden rounded bg-muted px-1.5 text-xs text-muted-foreground sm:block"
                  >{{ (cellEvents()[cell.iso] ?? []).length - 2 }} more</span
                >
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class MonthGrid {
  /** Any day in the month to show. */
  readonly anchor = input.required<string>();
  readonly events = input.required<CalendarEvent[]>();
  readonly selected = input.required<string>();
  readonly today = input.required<string>();
  readonly pick = output<string>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly time = timeText;
  protected readonly weeks = computed(() => {
    const d = fromIsoDate(this.anchor());
    return monthGrid(d.getFullYear(), d.getMonth());
  });
  protected readonly cellEvents = computed(() => {
    const out: Record<string, CalendarEvent[]> = {};
    for (const week of this.weeks()) {
      for (const c of week) out[c.iso] = eventsOn(this.events(), c.iso);
    }
    return out;
  });

  protected countText(iso: string): string {
    const n = (this.cellEvents()[iso] ?? []).length;
    return n === 0 ? 'nothing planned' : `${n} ${n === 1 ? 'event' : 'events'}`;
  }
}
