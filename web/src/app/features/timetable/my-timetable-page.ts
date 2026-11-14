import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { apiError } from '../../core/api-error';
import { PageHeader } from '../../shared/ui/page-header';
import { TimetableApi } from './timetable-api';
import { TimetableGrid } from './timetable-grid';
import { StaffWeek, addDays, weekTitle } from './timetable-models';

/** A teacher's own week, with the periods they cover for others and changes to their own lessons. */
@Component({
  selector: 'app-my-timetable-page',
  imports: [ButtonModule, MessageModule, PageHeader, RouterLink, TimetableGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="My timetable"
      subtitle="Your lessons this week. Periods you cover for someone else, and your own lessons that are covered or cancelled, show on their day."
    >
      <p-button label="Print" severity="secondary" [outlined]="true" (onClick)="print()" />
      <a routerLink="/app/timetable" class="no-print"
        ><p-button label="Other classes" severity="secondary" [text]="true" tabindex="-1"
      /></a>
    </app-page-header>

    <div class="no-print mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Week">
      <p-button
        label="Previous"
        severity="secondary"
        [text]="true"
        ariaLabel="Previous week"
        (onClick)="step(-7)"
      />
      <p-button
        label="This week"
        severity="secondary"
        [outlined]="true"
        (onClick)="go(undefined)"
      />
      <p-button
        label="Next"
        severity="secondary"
        [text]="true"
        ariaLabel="Next week"
        (onClick)="step(7)"
      />
      <span class="text-sm font-medium tabular-nums" aria-live="polite">{{ title() }}</span>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (week(); as w) {
      <section class="print-area rounded-2xl bg-card shadow-sm" aria-label="My week">
        <header class="border-b border-border p-4">
          <h2 class="font-semibold">{{ w.staff.fullName }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ w.periodsPerWeek }} periods a week · {{ title() }}
          </p>
        </header>
        <app-timetable-grid
          [view]="w"
          mode="staff"
          [staffId]="w.staff.id"
          caption="My weekly timetable"
          emptyText="You have no lessons in the timetable yet."
        />
      </section>
    }
  `,
})
export class MyTimetablePage {
  private readonly tt = inject(TimetableApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly week = signal<StaffWeek | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly title = computed(() => (this.week() ? weekTitle(this.week()!.days) : ''));

  constructor() {
    void this.go(this.route.snapshot.queryParamMap.get('weekOf') ?? undefined);
  }

  protected async go(weekOf: string | undefined) {
    try {
      this.week.set(await firstValueFrom(this.tt.mine(weekOf)));
      this.error.set(null);
    } catch (e) {
      this.error.set(apiError(e));
    }
  }

  protected step(days: number) {
    const w = this.week();
    if (w) void this.go(addDays(w.weekOf, days));
  }

  protected print() {
    window.print();
  }
}
