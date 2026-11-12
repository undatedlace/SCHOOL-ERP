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
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import { CalendarEvent, LeaveCalendarItem } from '../../core/models';
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
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { FormsModule } from '@angular/forms';

/** A leave from the staff calendar, shaped like an event so every view can draw it. It cannot be changed here. */
const leaveAsEvent = (l: LeaveCalendarItem): CalendarEvent => ({
  id: `leave-${l.id}`,
  title: l.title,
  description: null,
  category: 'LEAVE',
  startsOn: l.startsOn,
  endsOn: l.endsOn,
  startTime: null,
  endTime: null,
  audience: 'STAFF',
  classes: [],
  divisions: [],
  announced: false,
  canChange: false,
});
const byStart = (a: CalendarEvent, b: CalendarEvent) => a.startsOn.localeCompare(b.startsOn);

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
    SelectButtonModule,
    FormsModule,
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
          <p-selectbutton
            [options]="viewOptions"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="view()"
            (ngModelChange)="setView($event)"
            aria-label="View"
          />
          <h2 class="order-last w-full text-center text-lg font-semibold sm:order-none sm:w-auto">
            {{ title() }}
          </h2>
          <div class="flex items-center gap-2">
            <p-button
              severity="secondary"
              [outlined]="true"
              ariaLabel="Previous"
              (onClick)="move(-1)"
              ><span class="rotate-180"><app-icon name="chevron" /></span
            ></p-button>
            <p-button label="Today" severity="secondary" [outlined]="true" (onClick)="goToday()" />
            <p-button severity="secondary" [outlined]="true" ariaLabel="Next" (onClick)="move(1)"
              ><app-icon name="chevron"
            /></p-button>
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
          @for (c of categoryKeys(); track c) {
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
            @if (e.category !== 'LEAVE') {
              <p class="mt-1 text-xs">For: {{ audienceOf(e) }}</p>
            }
            @if (e.canChange) {
              <div class="mt-2 flex gap-2">
                <p-button
                  label="Change"
                  size="small"
                  severity="secondary"
                  [outlined]="true"
                  (onClick)="dialog().open(e)"
                />
                <p-button
                  label="Remove"
                  size="small"
                  severity="danger"
                  [text]="true"
                  (onClick)="remove(e)"
                />
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
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly dialog = viewChild.required(EventDialog);

  protected readonly today = toIsoDate(new Date());
  protected readonly views = VIEWS;
  protected readonly viewLabel = VIEW_LABEL;
  protected readonly viewOptions = VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }));
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly categoryKeys = computed(() =>
    this.auth.has('leave.apply')
      ? (['EVENT', 'HOLIDAY', 'EXAM', 'MEETING', 'LEAVE'] as const)
      : (['EVENT', 'HOLIDAY', 'EXAM', 'MEETING'] as const),
  );
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
      // Staff leave is asked for at the same time, but only by people who may see it (their own, or
      // everyone's for an administrator). Without it the page behaves exactly as before.
      const leaveRequest = this.auth.has('leave.apply')
        ? firstValueFrom(this.api.leaveCalendar(from, to)).catch(() => [] as LeaveCalendarItem[])
        : null;
      const events = await firstValueFrom(this.api.calendarEvents(from, to));
      const leave = leaveRequest ? await leaveRequest : [];
      this.events.set([...events, ...leave.map(leaveAsEvent)].sort(byStart));
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
