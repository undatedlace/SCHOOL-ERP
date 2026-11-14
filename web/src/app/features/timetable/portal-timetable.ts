import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { apiError } from '../../core/api-error';
import { TimetableApi } from './timetable-api';
import { TimetableGrid } from './timetable-grid';
import { DivisionOption, DivisionWeek, addDays, weekTitle } from './timetable-models';

/** The class timetable of a parent's child (or a student's own class), with this week's changes. */
@Component({
  selector: 'app-portal-timetable',
  imports: [FormsModule, ButtonModule, MessageModule, SelectModule, TimetableGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 text-xl font-semibold">Timetable</h1>
    <p class="mb-4 text-sm text-muted-foreground">
      The class week. Cancelled periods and substitute teachers show on their day.
    </p>

    @if (classes().length > 1) {
      <div class="mb-3 flex flex-col gap-1 text-sm">
        <label for="pt-class">Child</label>
        <p-select
          inputId="pt-class"
          [options]="classes()"
          optionLabel="title"
          optionValue="id"
          [ngModel]="divisionId()"
          (ngModelChange)="choose($event)"
          [fluid]="true"
        />
      </div>
    }

    <div class="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Week">
      <p-button
        label="Previous"
        severity="secondary"
        [text]="true"
        size="small"
        ariaLabel="Previous week"
        (onClick)="step(-7)"
      />
      <p-button
        label="This week"
        severity="secondary"
        [outlined]="true"
        size="small"
        (onClick)="load(undefined)"
      />
      <p-button
        label="Next"
        severity="secondary"
        [text]="true"
        size="small"
        ariaLabel="Next week"
        (onClick)="step(7)"
      />
      <span class="text-sm font-medium tabular-nums" aria-live="polite">{{ title() }}</span>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (week(); as w) {
      <section
        class="rounded-2xl bg-card shadow-sm"
        [attr.aria-label]="'Timetable for class ' + w.division.label"
      >
        <header class="border-b border-border p-4">
          <h2 class="font-semibold">Class {{ w.division.label }}</h2>
          @if (w.classTeacher) {
            <p class="text-sm text-muted-foreground">Class teacher {{ w.classTeacher.fullName }}</p>
          }
        </header>
        @if (w.schedule) {
          <app-timetable-grid
            [view]="w"
            [caption]="'Weekly timetable for class ' + w.division.label"
            emptyText="The school has not filled in the timetable yet."
          />
        } @else {
          <p class="p-4 text-sm text-muted-foreground">
            The school has not set up the timetable yet.
          </p>
        }
      </section>
    } @else if (loaded()) {
      <p class="text-sm text-muted-foreground">No class this year.</p>
    }
  `,
})
export class PortalTimetable {
  private readonly tt = inject(TimetableApi);

  protected readonly options = signal<DivisionOption[]>([]);
  protected readonly divisionId = signal<string | null>(null);
  protected readonly week = signal<DivisionWeek | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly classes = computed(() =>
    this.options().map((o) => ({
      id: o.id,
      title: `${o.students.map((s) => s.fullName).join(', ')} (${o.label})`,
    })),
  );
  protected readonly title = computed(() => (this.week() ? weekTitle(this.week()!.days) : ''));

  constructor() {
    void this.start();
  }

  private async start() {
    try {
      const options = await firstValueFrom(this.tt.divisions());
      this.options.set(options);
      this.divisionId.set(options[0]?.id ?? null);
      await this.load(undefined);
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.loaded.set(true);
    }
  }

  protected choose(id: string) {
    this.divisionId.set(id);
    void this.load(this.week()?.weekOf);
  }

  protected async load(weekOf: string | undefined) {
    const id = this.divisionId();
    if (!id) return;
    try {
      this.week.set(await firstValueFrom(this.tt.divisionWeek(id, weekOf)));
      this.error.set(null);
    } catch (e) {
      this.error.set(apiError(e));
    }
  }

  protected step(days: number) {
    const w = this.week();
    if (w) void this.load(addDays(w.weekOf, days));
  }
}
