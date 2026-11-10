import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CalendarEvent } from '../../core/models';
import { fromIsoDate } from '../../shared/dates';
import {
  CATEGORY_CLASS,
  eventsOn,
  hourLabel,
  isAllDay,
  layoutTimed,
  timeRangeText,
} from './calendar-utils';

/** Height of one hour, in pixels. */
const HOUR = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** The grid opens scrolled to this hour, so the school day is in view. */
const OPEN_AT = 7;

/** One day or a week as hours down the side, with an "all-day" band on top. */
@Component({
  selector: 'app-time-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-hidden rounded-lg border">
      <!-- Day names -->
      <div class="grid border-b bg-accent" [style.grid-template-columns]="columnsStyle()">
        <span></span>
        @for (c of columns(); track c.iso) {
          <button
            type="button"
            class="flex items-center justify-center gap-2 py-2.5 text-sm hover:bg-card/60"
            [attr.aria-pressed]="c.iso === selected()"
            (click)="pick.emit(c.iso)"
          >
            <span class="text-muted-foreground">{{ c.weekday }}</span>
            <span
              class="inline-flex size-7 items-center justify-center rounded-full font-semibold"
              [class.bg-destructive]="c.iso === today()"
              [class.text-white]="c.iso === today()"
              >{{ c.day }}</span
            >
          </button>
        }
      </div>

      <!-- All-day band -->
      <div class="grid border-b" [style.grid-template-columns]="columnsStyle()">
        <span class="px-1 py-2 text-right text-xs text-muted-foreground">all-day</span>
        @for (c of columns(); track c.iso) {
          <div class="flex min-h-9 flex-col gap-1 border-l p-1">
            @for (e of c.allDay; track e.id) {
              <button
                type="button"
                class="truncate rounded px-1.5 py-0.5 text-left text-xs text-foreground"
                [class]="categoryClass[e.category]"
                [attr.aria-label]="e.title + ', all day'"
                (click)="pick.emit(c.iso)"
              >
                {{ e.title }}
              </button>
            }
          </div>
        }
      </div>

      <!-- Hours -->
      <div #scroller class="max-h-[32rem] overflow-y-auto">
        <div class="grid" [style.grid-template-columns]="columnsStyle()">
          <div>
            @for (h of hours; track h) {
              <div class="pr-2 text-right text-xs text-muted-foreground" [style.height.px]="hourPx">
                <span class="relative -top-2">{{ h === 0 ? '' : label(h) }}</span>
              </div>
            }
          </div>
          @for (c of columns(); track c.iso) {
            <div class="relative border-l" [style.height.px]="hourPx * 24">
              @for (h of hours; track h) {
                <div class="border-b" [style.height.px]="hourPx"></div>
              }
              @for (p of c.placed; track p.event.id) {
                <button
                  type="button"
                  class="absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-xs text-foreground shadow-sm"
                  [class]="categoryClass[p.event.category]"
                  [style.top.px]="(p.startMin / 60) * hourPx"
                  [style.height.px]="((p.endMin - p.startMin) / 60) * hourPx - 2"
                  [style.left.%]="(p.lane / p.lanes) * 100"
                  [style.width.%]="100 / p.lanes"
                  [attr.aria-label]="p.event.title + ', ' + range(p.event)"
                  (click)="pick.emit(c.iso)"
                >
                  <span class="block truncate font-medium">{{ p.event.title }}</span>
                  <span class="block truncate">{{ range(p.event) }}</span>
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class TimeGrid {
  /** The days to show: one for the day view, seven for the week view. */
  readonly days = input.required<string[]>();
  readonly events = input.required<CalendarEvent[]>();
  readonly selected = input.required<string>();
  readonly today = input.required<string>();
  readonly pick = output<string>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly hours = HOURS;
  protected readonly hourPx = HOUR;
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly label = hourLabel;
  protected readonly range = timeRangeText;

  protected readonly columnsStyle = computed(() => `3.5rem repeat(${this.days().length}, 1fr)`);
  protected readonly columns = computed(() =>
    this.days().map((iso) => {
      const day = eventsOn(this.events(), iso);
      const d = fromIsoDate(iso);
      return {
        iso,
        day: d.getDate(),
        weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        allDay: day.filter(isAllDay),
        placed: layoutTimed(day),
      };
    }),
  );

  constructor() {
    afterNextRender(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = OPEN_AT * HOUR;
    });
  }
}
