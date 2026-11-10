import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { CalendarEvent } from '../../core/models';
import { fromIsoDate, toIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { audienceText } from '../notices/notice-utils';
import {
  CATEGORY_CLASS,
  CATEGORY_LABEL,
  CalendarView,
  VIEW_LABEL,
  dateRangeText,
  eventsOn,
  shiftView,
  timeRangeText,
  viewRange,
  viewTitle,
  weekDays,
} from './calendar-utils';
import { EventDialog } from './event-dialog';
import { MonthGrid } from './month-grid';
import { TimeGrid } from './time-grid';
import { YearGrid } from './year-grid';

const VIEWS: CalendarView[] = ['day', 'week', 'month', 'year'];
const VIEW_KEY = 'calendar-view';

function savedView(): CalendarView {
  try {
    const v = localStorage.getItem(VIEW_KEY) as CalendarView | null;
    return v && VIEWS.includes(v) ? v : 'month';
  } catch {
    return 'month';
  }
}

@Component({
  selector: 'app-calendar-page',
  imports: [
    ButtonModule,
    MessageModule,
    HasPermission,
    PageHeader,
    Icon,
    EventDialog,
    MonthGrid,
    TimeGrid,
    YearGrid,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Calendar" subtitle="School events, holidays, exams and meetings.">
      <p-button
        *appHasPermission="'calendar.manage'"
        label="New event"
        (onClick)="dialog().open(null, selected())"
      />
    </app-page-header>

    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-4" />
    }

    <div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section class="min-w-0 rounded-xl border-0 bg-card p-4 shadow-sm" aria-label="Calendar">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="View">
            @for (v of views; track v) {
              <button
                type="button"
                class="rounded-full px-3.5 py-1.5 text-sm transition"
                [class.bg-card]="view() === v"
                [class.shadow-sm]="view() === v"
                [class.font-semibold]="view() === v"
                [attr.aria-pressed]="view() === v"
                (click)="setView(v)"
              >
                {{ viewLabel[v] }}
              </button>
            }
          </div>
          <h2 class="order-last w-full text-center text-lg font-semibold sm:order-none sm:w-auto">
            {{ title() }}
          </h2>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-full border hover:bg-accent"
              aria-label="Previous"
              (click)="move(-1)"
            >
              <span class="rotate-180"><app-icon name="chevron" /></span>
            </button>
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
              (click)="goToday()"
            >
              Today
            </button>
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-full border hover:bg-accent"
              aria-label="Next"
              (click)="move(1)"
            >
              <app-icon name="chevron" />
            </button>
          </div>
        </div>

        @switch (view()) {
          @case ('day') {
            <app-time-grid
              [days]="[selected()]"
              [events]="events()"
              [selected]="selected()"
              [today]="today"
              (pick)="selected.set($event)"
            />
          }
          @case ('week') {
            <app-time-grid
              [days]="week()"
              [events]="events()"
              [selected]="selected()"
              [today]="today"
              (pick)="selected.set($event)"
            />
          }
          @case ('month') {
            <app-month-grid
              [anchor]="selected()"
              [events]="events()"
              [selected]="selected()"
              [today]="today"
              (pick)="selected.set($event)"
            />
          }
          @case ('year') {
            <app-year-grid
              [year]="yearOf()"
              [events]="events()"
              [today]="today"
              (pickMonth)="openMonth($event)"
              (pickDay)="openDay($event)"
            />
          }
        }

        <ul class="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Key">
          @for (c of categoryKeys; track c) {
            <li class="flex items-center gap-1.5">
              <span class="size-3 rounded" [class]="categoryClass[c]"></span>{{ categoryLabel[c] }}
            </li>
          }
        </ul>
      </section>

      <section class="rounded-xl border-0 bg-card p-4 shadow-sm" aria-labelledby="agenda-title">
        <h2 id="agenda-title" class="mb-3 font-semibold">Agenda &middot; {{ selectedText() }}</h2>
        @for (e of dayEvents(); track e.id) {
          <article class="mb-3 rounded-lg p-3" [class]="categoryClass[e.category]">
            <p class="text-xs">
              {{ timeRange(e) }} &middot; {{ categoryLabel[e.category] }}
              @if (e.startsOn !== e.endsOn) {
                &middot; {{ dateRange(e) }}
              }
            </p>
            <h3 class="font-medium">{{ e.title }}</h3>
            @if (e.description) {
              <p class="mt-1 text-sm whitespace-pre-line">{{ e.description }}</p>
            }
            <p class="mt-1 text-xs">For: {{ audienceOf(e) }}</p>
            @if (e.canChange) {
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs hover:bg-accent"
                  (click)="dialog().open(e)"
                >
                  <app-icon name="edit" />Change
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs hover:bg-accent"
                  (click)="remove(e)"
                >
                  <app-icon name="trash" />Remove
                </button>
              </div>
            }
          </article>
        } @empty {
          <p class="text-sm text-muted-foreground">
            @if (loading()) {
              Loading...
            } @else {
              Nothing planned for this day.
            }
          </p>
        }
      </section>
    </div>

    <app-event-dialog (saved)="reload()" />
  `,
})
export class CalendarPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly dialog = viewChild.required(EventDialog);

  protected readonly today = toIsoDate(new Date());
  protected readonly views = VIEWS;
  protected readonly viewLabel = VIEW_LABEL;
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly categoryKeys = ['EVENT', 'HOLIDAY', 'EXAM', 'MEETING'] as const;
  protected readonly dateRange = dateRangeText;
  protected readonly timeRange = timeRangeText;
  protected readonly audienceOf = audienceText;

  protected readonly view = signal<CalendarView>(savedView());
  /** The day in focus: the one the agenda shows, and the one the view is built around. */
  protected readonly selected = signal(this.today);
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly range = computed(() => viewRange(this.view(), this.selected()));
  protected readonly title = computed(() => viewTitle(this.view(), this.selected()));
  protected readonly week = computed(() => weekDays(this.selected()));
  protected readonly yearOf = computed(() => fromIsoDate(this.selected()).getFullYear());
  protected readonly dayEvents = computed(() => eventsOn(this.events(), this.selected()));
  protected readonly selectedText = computed(() =>
    fromIsoDate(this.selected()).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  constructor() {
    // Fetch again whenever the days on show change (a new month, a new view, and so on).
    effect(() => {
      const { from, to } = this.range();
      untracked(() => void this.load(from, to));
    });
  }

  protected setView(v: CalendarView) {
    this.view.set(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // The choice just will not be remembered.
    }
  }

  protected move(by: number) {
    this.selected.set(shiftView(this.view(), this.selected(), by));
  }

  protected goToday() {
    this.selected.set(this.today);
  }

  /** From the year view: a month's name opens that month. */
  protected openMonth(month: number) {
    const year = this.yearOf();
    this.selected.set(toIsoDate(new Date(year, month, 1)));
    this.setView('month');
  }

  /** From the year view: a day opens that day. */
  protected openDay(iso: string) {
    this.selected.set(iso);
    this.setView('day');
  }

  protected reload() {
    const { from, to } = this.range();
    return this.load(from, to);
  }

  private async load(from: string, to: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.events.set(await firstValueFrom(this.api.calendarEvents(from, to)));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected remove(e: CalendarEvent) {
    this.confirm.confirm({
      header: 'Remove this event?',
      message: `"${e.title}" will no longer show on the calendar. A notice already sent stays.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      accept: async () => {
        try {
          await firstValueFrom(this.api.archiveCalendarEvent(e.id));
          this.toast.add({ severity: 'success', summary: 'Removed' });
          await this.reload();
        } catch (error) {
          this.error.set(apiError(error));
        }
      },
    });
  }
}
