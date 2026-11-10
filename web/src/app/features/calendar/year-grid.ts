import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CalendarEvent } from '../../core/models';
import { yearMonths } from './calendar-utils';

/** The twelve months of a year. A dot under a day means something is planned. */
@Component({
  selector: 'app-year-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      @for (m of months(); track m.month) {
        <section [attr.aria-label]="m.name">
          <h3 class="mb-2">
            <button
              type="button"
              class="text-lg font-medium text-destructive hover:underline"
              (click)="pickMonth.emit(m.month)"
            >
              {{ m.name }}
            </button>
          </h3>
          <div
            class="grid grid-cols-7 text-center text-xs text-muted-foreground"
            aria-hidden="true"
          >
            @for (d of letters; track $index) {
              <span class="py-1">{{ d }}</span>
            }
          </div>
          @for (week of m.weeks; track $index) {
            <div class="grid grid-cols-7 text-center text-sm">
              @for (cell of week; track cell.iso) {
                @if (cell.inMonth) {
                  <button
                    type="button"
                    class="flex flex-col items-center py-0.5 hover:bg-accent"
                    [attr.aria-label]="cell.iso + (busy().has(cell.iso) ? ', has events' : '')"
                    (click)="pickDay.emit(cell.iso)"
                  >
                    <span
                      class="inline-flex size-6 items-center justify-center rounded-full font-medium"
                      [class.bg-destructive]="cell.iso === today()"
                      [class.text-white]="cell.iso === today()"
                      >{{ cell.day }}</span
                    >
                    <span
                      class="size-1 rounded-full"
                      [class.bg-foreground]="busy().has(cell.iso)"
                    ></span>
                  </button>
                } @else {
                  <span class="py-0.5"><span class="inline-block size-6"></span></span>
                }
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class YearGrid {
  readonly year = input.required<number>();
  readonly events = input.required<CalendarEvent[]>();
  readonly today = input.required<string>();
  /** A month's name was pressed. */
  readonly pickMonth = output<number>();
  readonly pickDay = output<string>();

  protected readonly letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  protected readonly months = computed(() => yearMonths(this.year()));
  /** Every day that has at least one event. */
  protected readonly busy = computed(() => {
    const days = new Set<string>();
    for (const e of this.events()) {
      let d = e.startsOn;
      // Events last at most 60 days, so this stays short.
      for (let i = 0; i < 61 && d <= e.endsOn; i++) {
        days.add(d);
        d = nextDay(d);
      }
    }
    return days;
  });
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
