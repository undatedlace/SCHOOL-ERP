import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AttendanceDivisionReport, MyStaffAttendance } from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { PageHeader } from '../../shared/ui/page-header';
import { AttendanceGrid } from '../attendance/attendance-grid';
import { monthBounds, percentText } from '../attendance/attendance-utils';
import { asGridReport } from './staff-grid';

/** A teacher's or staff member's own attendance. They can look but not change it. */
@Component({
  selector: 'app-my-attendance-page',
  imports: [FormsModule, MessageModule, PageHeader, AttendanceGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="My attendance"
      subtitle="Your attendance as recorded by the school. Ask the school office if something looks wrong."
    />

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        From
        <input
          type="date"
          class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          [max]="today"
          [ngModel]="from()"
          (ngModelChange)="onRange('from', $event)"
          aria-label="From"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        To
        <input
          type="date"
          class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          [max]="today"
          [ngModel]="to()"
          (ngModelChange)="onRange('to', $event)"
          aria-label="To"
        />
      </label>
      <button
        type="button"
        class="h-10 rounded-md border px-3 text-sm hover:bg-accent"
        (click)="preset(0)"
      >
        This month
      </button>
      <button
        type="button"
        class="h-10 rounded-md border px-3 text-sm hover:bg-accent"
        (click)="preset(1)"
      >
        Last month
      </button>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (mine(); as m) {
      @if (m.people[0]; as me) {
        <section class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Totals">
          <div class="rounded-xl bg-lavender p-4">
            <div class="text-xs">Attendance</div>
            <div class="text-2xl font-semibold">{{ percent(me) }}</div>
          </div>
          <div class="rounded-xl bg-card p-4 shadow-sm">
            <div class="text-xs text-muted-foreground">Present</div>
            <div class="text-2xl font-semibold">{{ me.present }}</div>
          </div>
          <div class="rounded-xl bg-card p-4 shadow-sm">
            <div class="text-xs text-muted-foreground">Late</div>
            <div class="text-2xl font-semibold">{{ me.late }}</div>
          </div>
          <div class="rounded-xl bg-card p-4 shadow-sm">
            <div class="text-xs text-muted-foreground">Absent</div>
            <div class="text-2xl font-semibold">{{ me.absent }}</div>
          </div>
          <div class="rounded-xl bg-card p-4 shadow-sm">
            <div class="text-xs text-muted-foreground">On leave</div>
            <div class="text-2xl font-semibold">{{ me.onLeave }}</div>
          </div>
        </section>
      }
      <app-attendance-grid [report]="grid()!" nameHeader="Name" numberLabel="Emp. no." />
      @if (notes().length) {
        <section class="mt-4 rounded-xl bg-card p-4 shadow-sm" aria-label="Notes">
          <h2 class="mb-2 font-semibold">Notes</h2>
          <ul class="text-sm">
            @for (n of notes(); track n.date) {
              <li>{{ dateText(n.date) }}: {{ n.note }}</li>
            }
          </ul>
        </section>
      }
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class MyAttendancePage {
  private readonly api = inject(Api);
  protected readonly today = toIsoDate(new Date());
  protected readonly dateText = formatDate;
  protected readonly percent = percentText;

  protected readonly from = signal(this.today.slice(0, 8) + '01');
  protected readonly to = signal(this.today);
  protected readonly mine = signal<MyStaffAttendance | null>(null);
  protected readonly grid = signal<AttendanceDivisionReport | null>(null);
  protected readonly notes = signal<{ date: string; note: string }[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected onRange(which: 'from' | 'to', value: string) {
    if (!value) return;
    (which === 'from' ? this.from : this.to).set(value);
    void this.load();
  }

  protected preset(monthsBack: number) {
    const b = monthBounds(this.today, monthsBack);
    this.from.set(b.from);
    this.to.set(monthsBack === 0 ? this.today : b.to);
    void this.load();
  }

  private async load() {
    this.error.set(null);
    try {
      const m = await firstValueFrom(
        this.api.myStaffAttendance({ from: this.from(), to: this.to() }),
      );
      this.mine.set(m);
      this.grid.set(asGridReport(m));
      this.notes.set(m.records.flatMap((r) => (r.note ? [{ date: r.date, note: r.note }] : [])));
    } catch (error) {
      this.mine.set(null);
      this.error.set(apiError(error));
    }
  }
}
