import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { apiError } from '../../core/api-error';
import { Badge } from '../../shared/ui/badge';
import { DateField } from '../../shared/ui/date-field';
import { PageHeader } from '../../shared/ui/page-header';
import { StatTile } from '../../shared/ui/stat-tile';
import { Time12Pipe } from './time12';
import { TimetableApi } from './timetable-api';
import {
  DayPeriod,
  DayView,
  FreeTeachers,
  PersonRef,
  addDays,
  shortDate,
  todayInIndia,
  weekdayOf,
} from './timetable-models';

interface Covering {
  period: DayPeriod;
  /** Whose period it is, for the reason. */
  away: PersonRef;
  leaveType: string;
}

/**
 * One day across the school: who is on approved leave, which of their periods still need a
 * substitute (with the free teachers suggested), and every change made for the day, which can be undone.
 */
@Component({
  selector: 'app-day-changes-page',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    Badge,
    DateField,
    PageHeader,
    StatTile,
    Time12Pipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Daily changes"
      subtitle="Teachers on leave, the periods that need a substitute, and every change made for one day."
      [crumbs]="[
        { label: 'Dashboard', link: '/app/dashboard' },
        { label: 'Timetable', link: '/app/timetable' },
        { label: 'Daily changes' },
      ]"
    />

    <div class="mb-4 flex flex-wrap items-end gap-2">
      <div class="flex flex-col gap-1 text-xs text-muted-foreground">
        <span aria-hidden="true">Day</span>
        <app-date-field label="Day" [value]="date()" (valueChange)="go($event)" />
      </div>
      <p-button label="Previous day" severity="secondary" [text]="true" (onClick)="step(-1)" />
      <p-button label="Today" severity="secondary" [outlined]="true" (onClick)="go(today)" />
      <p-button label="Next day" severity="secondary" [text]="true" (onClick)="step(1)" />
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-4" />
    }

    @if (day(); as d) {
      <h2 class="mb-3 text-lg font-semibold">{{ dayTitle() }}</h2>
      @if (d.weekday === 7) {
        <p class="text-sm text-muted-foreground">Sunday: no school.</p>
      } @else {
        @if (d.holiday) {
          <p-message severity="warn" [text]="'A school holiday: ' + d.holiday" styleClass="mb-4" />
        }
        <section class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="The day in numbers">
          <app-stat-tile
            label="Teachers on leave"
            [value]="d.onLeave.length"
            icon="teachers"
            tone="info"
          />
          <app-stat-tile
            label="Periods needing a substitute"
            [value]="d.needsSubstitute"
            icon="clock"
            [tone]="d.needsSubstitute ? 'bad' : 'good'"
          />
          <app-stat-tile
            label="Changes made"
            [value]="d.changes.length"
            icon="layers"
            tone="primary"
          />
        </section>

        <section class="mb-4 rounded-2xl bg-card shadow-sm" aria-labelledby="away-title">
          <h3 id="away-title" class="border-b border-border p-4 font-semibold">On leave</h3>
          @for (a of d.onLeave; track a.staff.id) {
            <div class="border-b border-border p-4 last:border-0">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ a.staff.fullName }}</span>
                <app-badge [label]="a.leaveType + (a.halfDay ? ', half day' : '')" tone="info" />
              </div>
              @if (a.periods.length) {
                <ul class="flex flex-col gap-2">
                  @for (p of a.periods; track p.division.id + p.slot.id) {
                    <li class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span class="w-24 tabular-nums text-muted-foreground"
                        >{{ p.slot.startsAt | time12 }}–{{ p.slot.endsAt | time12 }}</span
                      >
                      <span class="w-40">{{ p.division.label }}, {{ p.slot.label }}</span>
                      <span class="w-32 text-muted-foreground">{{ p.subject?.name ?? '' }}</span>
                      @if (p.change; as ch) {
                        @if (ch.kind === 'CANCELLED') {
                          <app-badge label="Cancelled" tone="bad" />
                        } @else {
                          <app-badge
                            [label]="'Covered by ' + (ch.substitute?.fullName ?? '')"
                            tone="good"
                          />
                        }
                      } @else {
                        <app-badge label="Needs a substitute" tone="warn" />
                        @if (!d.holiday) {
                          <p-button
                            label="Find a substitute"
                            size="small"
                            [ariaLabel]="
                              'Find a substitute for ' + p.division.label + ', ' + p.slot.label
                            "
                            (onClick)="
                              openCover({ period: p, away: a.staff, leaveType: a.leaveType })
                            "
                          />
                        }
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-sm text-muted-foreground">No lessons that day.</p>
              }
            </div>
          } @empty {
            <p class="p-4 text-sm text-muted-foreground">Nobody is on approved leave this day.</p>
          }
        </section>

        <section class="rounded-2xl bg-card shadow-sm" aria-labelledby="changes-title">
          <h3 id="changes-title" class="border-b border-border p-4 font-semibold">
            Changes for the day
          </h3>
          <div class="overflow-x-auto">
            <table class="app-table w-full min-w-[48rem] text-sm">
              <thead>
                <tr>
                  <th scope="col" class="p-2 text-left">Time</th>
                  <th scope="col" class="p-2 text-left">Class</th>
                  <th scope="col" class="p-2 text-left">Usually</th>
                  <th scope="col" class="p-2 text-left">Change</th>
                  <th scope="col" class="p-2 text-left">Reason</th>
                  <th scope="col" class="p-2 text-right"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of d.changes; track c.id) {
                  <tr>
                    <td class="whitespace-nowrap p-2 tabular-nums">
                      {{ c.slot.startsAt | time12 }}–{{ c.slot.endsAt | time12 }}
                    </td>
                    <td class="p-2">
                      <a
                        class="text-primary underline-offset-2 hover:underline"
                        routerLink="/app/timetable"
                        [queryParams]="{ division: c.division.id, weekOf: c.date }"
                        >{{ c.division.label }}</a
                      >,
                      {{ c.slot.label }}
                    </td>
                    <td class="p-2">
                      {{ c.regularSubject?.name ?? '' }}
                      {{ c.regularStaff ? '· ' + c.regularStaff.fullName : '' }}
                    </td>
                    <td class="p-2">
                      @if (c.kind === 'CANCELLED') {
                        <app-badge label="Cancelled" tone="bad" />
                      } @else {
                        <app-badge
                          [label]="'Substitute: ' + (c.substitute?.fullName ?? '')"
                          tone="warn"
                        />
                      }
                    </td>
                    <td class="p-2 text-muted-foreground">
                      {{ c.reason }} <span class="text-xs">({{ c.by }})</span>
                    </td>
                    <td class="p-2 text-right">
                      <p-button
                        label="Undo"
                        size="small"
                        severity="secondary"
                        [text]="true"
                        [ariaLabel]="
                          'Undo the change for ' + c.division.label + ', ' + c.slot.label
                        "
                        (onClick)="undo(c.id)"
                      />
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="p-6 text-center text-muted-foreground">
                      No changes for this day. Press a box on the Timetable page to change a single
                      day.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    }

    <p-dialog
      [header]="
        cover()
          ? 'Substitute for ' + cover()!.period.division.label + ', ' + cover()!.period.slot.label
          : ''
      "
      [visible]="!!cover()"
      (visibleChange)="!$event && cover.set(null)"
      [modal]="true"
      [style]="{ width: '32rem', 'max-width': '95vw' }"
    >
      @if (cover(); as c) {
        <div class="flex flex-col gap-3">
          <p class="text-sm text-muted-foreground">
            {{ c.period.subject?.name ?? 'Lesson' }}, {{ c.period.slot.startsAt | time12 }}–{{
              c.period.slot.endsAt | time12
            }}, usually {{ c.away.fullName }}.
          </p>
          <div class="flex flex-col gap-1 text-sm">
            <label for="dc-sub">Free teachers, best fit first</label>
            <p-select
              inputId="dc-sub"
              [options]="free()?.teachers ?? []"
              optionLabel="fullName"
              optionValue="id"
              [filter]="true"
              [loading]="freeLoading()"
              [placeholder]="freeLoading() ? 'Finding free teachers...' : 'Choose a teacher'"
              emptyMessage="Nobody is free then"
              [ngModel]="substituteId()"
              (ngModelChange)="substituteId.set($event)"
              appendTo="body"
              [fluid]="true"
            >
              <ng-template let-t #item>
                <span>{{ t.fullName }}</span>
                <span class="ml-2 text-xs text-muted-foreground">{{ hint(t) }}</span>
              </ng-template>
            </p-select>
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <label for="dc-reason">Reason</label>
            <input
              id="dc-reason"
              pInputText
              maxlength="300"
              [fluid]="true"
              [ngModel]="reason()"
              (ngModelChange)="reason.set($event)"
            />
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <p-button
              label="Cancel the period instead"
              severity="danger"
              [outlined]="true"
              [disabled]="reason().trim().length < 2"
              [loading]="saving()"
              (onClick)="save('CANCELLED')"
            />
            <p-button
              label="Set substitute"
              [disabled]="!substituteId() || reason().trim().length < 2"
              [loading]="saving()"
              (onClick)="save('SUBSTITUTE')"
            />
          </div>
        </div>
      }
    </p-dialog>
  `,
})
export class DayChangesPage {
  private readonly tt = inject(TimetableApi);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly today = todayInIndia();
  protected readonly date = signal(this.route.snapshot.queryParamMap.get('date') ?? this.today);
  protected readonly day = signal<DayView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly cover = signal<Covering | null>(null);
  protected readonly free = signal<FreeTeachers | null>(null);
  protected readonly freeLoading = signal(false);
  protected readonly substituteId = signal<string | null>(null);
  protected readonly reason = signal('');

  protected readonly dayTitle = computed(() => {
    const d = this.date();
    const label = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return d === this.today ? `Today, ${label}` : label;
  });

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.day.set(await firstValueFrom(this.tt.day(this.date())));
      this.error.set(null);
    } catch (e) {
      this.error.set(apiError(e));
    }
  }

  protected go(date: string) {
    if (!date) return;
    this.date.set(date);
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { date },
    });
    void this.load();
  }

  protected step(by: number) {
    let next = addDays(this.date(), by);
    if (weekdayOf(next) === 7) next = addDays(next, by);
    this.go(next);
  }

  protected hint(t: FreeTeachers['teachers'][number]) {
    return [
      t.teachesSubjectHere
        ? 'teaches this subject here'
        : t.teachesDivision
          ? 'teaches this class'
          : '',
      `${t.periodsThatDay} period${t.periodsThatDay === 1 ? '' : 's'} that day`,
      t.halfDayLeave ? 'half day leave' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected async openCover(c: Covering) {
    this.cover.set(c);
    this.substituteId.set(null);
    this.reason.set(`${c.away.fullName} on ${c.leaveType.toLowerCase()} leave`);
    this.free.set(null);
    this.freeLoading.set(true);
    try {
      this.free.set(
        await firstValueFrom(
          this.tt.freeTeachers(this.date(), c.period.division.id, c.period.slot.id),
        ),
      );
    } catch (e) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not find free teachers',
        detail: apiError(e),
      });
    } finally {
      this.freeLoading.set(false);
    }
  }

  protected async save(kind: 'SUBSTITUTE' | 'CANCELLED') {
    const c = this.cover();
    if (!c) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.tt.addChange({
          date: this.date(),
          divisionId: c.period.division.id,
          slotId: c.period.slot.id,
          kind,
          ...(kind === 'SUBSTITUTE' ? { substituteStaffId: this.substituteId()! } : {}),
          reason: this.reason().trim(),
        }),
      );
      this.cover.set(null);
      await this.load();
      this.toast.add({
        severity: 'success',
        summary: kind === 'SUBSTITUTE' ? 'Substitute set; they have been told' : 'Period cancelled',
      });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiError(e), life: 10000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async undo(id: string) {
    try {
      await firstValueFrom(this.tt.removeChange(id));
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Undone' });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not undone', detail: apiError(e) });
    }
  }

  protected readonly shortDate = shortDate;
}
