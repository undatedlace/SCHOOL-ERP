import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { ImportBatch } from './import-models';
import { ImportWizard } from './import-wizard';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** This month and the 35 before it, newest first, as { label: "Nov 2026", value: "2026-11" }. */
export function recentMonths(today: Date = new Date(), count = 36) {
  // India time: the month changes at midnight in India, not UTC.
  const india = new Date(today.getTime() + 330 * 60_000);
  let y = india.getUTCFullYear();
  let m = india.getUTCMonth();
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ label: `${MONTHS[m]} ${y}`, value: `${y}-${String(m + 1).padStart(2, '0')}` });
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }
  return out;
}

/** "Import from Excel" for admission applications, old and new. */
@Component({
  selector: 'app-admissions-import',
  imports: [ButtonModule, ImportWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      label="Import from Excel"
      severity="secondary"
      [outlined]="true"
      (onClick)="open.set(true)"
    />
    <app-import-wizard slug="admissions" [(visible)]="open" (imported)="imported.emit($event)">
      <p class="text-muted-foreground">
        The columns follow the admission form published in the app. Old forms can carry their
        status, decision date and, for children who joined, their class in every year since.
      </p>
    </app-import-wizard>
  `,
})
export class AdmissionsImport {
  protected readonly open = signal(false);
  readonly imported = output<ImportBatch>();
}

/** "Import from Excel" for fees billed and paid, one year or every year so far. */
@Component({
  selector: 'app-fees-import',
  imports: [FormsModule, ButtonModule, SelectModule, ImportWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      label="Import from Excel"
      severity="secondary"
      [outlined]="true"
      (onClick)="open.set(true)"
    />
    <app-import-wizard
      slug="fees"
      [(visible)]="open"
      [params]="{ academicYearId: year() ?? undefined }"
      [canDownload]="!!year()"
      (imported)="imported.emit($event)"
    >
      <label class="flex flex-col gap-1" for="fees-import-year">
        Academic year
        <p-select
          inputId="fees-import-year"
          [options]="yearOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="year()"
          (ngModelChange)="picked.set($event)"
          placeholder="Choose a year"
          class="w-full sm:w-72"
        />
      </label>
      <p class="text-muted-foreground">
        One row per student enrolled that year: what was billed and what has been paid. The due is
        worked out.
      </p>
    </app-import-wizard>
  `,
})
export class FeesImport {
  private readonly api = inject(Api);
  protected readonly open = signal(false);
  readonly imported = output<ImportBatch>();

  private readonly years = toSignal(this.api.years().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly yearOptions = computed(() => [
    ...this.years()
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((y) => ({ label: y.isCurrent ? `${y.name} (current)` : y.name, value: y.id })),
    { label: 'Every year so far (one sheet each)', value: 'all' },
  ]);
  /** The year chosen; until then the current year. */
  protected readonly picked = signal<string | null>(null);
  protected readonly year = computed(
    () => this.picked() ?? this.years().find((y) => y.isCurrent)?.id ?? null,
  );
}

/** "Import from Excel" for student attendance: a monthly register per division. */
@Component({
  selector: 'app-student-attendance-import',
  imports: [FormsModule, ButtonModule, SelectModule, ImportWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      label="Import from Excel"
      severity="secondary"
      [outlined]="true"
      (onClick)="open.set(true)"
    />
    <app-import-wizard
      slug="student-attendance"
      [(visible)]="open"
      [params]="{ month: month(), divisionId: division() }"
      (imported)="imported.emit($event)"
    >
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1" for="att-import-month">
          Month
          <p-select
            inputId="att-import-month"
            [options]="months"
            optionLabel="label"
            optionValue="value"
            [ngModel]="month()"
            (ngModelChange)="month.set($event)"
            class="w-44"
          />
        </label>
        <label class="flex flex-col gap-1" for="att-import-division">
          Division
          <p-select
            inputId="att-import-division"
            [options]="divisionOptions()"
            optionLabel="label"
            optionValue="value"
            [ngModel]="division()"
            (ngModelChange)="division.set($event)"
            class="w-56"
          />
        </label>
      </div>
    </app-import-wizard>
  `,
})
export class StudentAttendanceImport {
  private readonly api = inject(Api);
  protected readonly open = signal(false);
  readonly imported = output<ImportBatch>();

  protected readonly months = recentMonths();
  protected readonly month = signal(this.months[0].value);
  protected readonly division = signal('all');
  private readonly divisions = toSignal(
    this.api.attendanceDivisions().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly divisionOptions = computed(() => [
    { label: 'All my divisions (one sheet each)', value: 'all' },
    ...this.divisions()
      .filter((d) => d.canMark)
      .map((d) => ({ label: `${d.class.name} - ${d.name}`, value: d.id })),
  ]);
}

/** "Import from Excel" for staff attendance: one monthly register. */
@Component({
  selector: 'app-staff-attendance-import',
  imports: [FormsModule, ButtonModule, SelectModule, ImportWizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      label="Import from Excel"
      severity="secondary"
      [outlined]="true"
      (onClick)="open.set(true)"
    />
    <app-import-wizard
      slug="staff-attendance"
      [(visible)]="open"
      [params]="{ month: month() }"
      (imported)="imported.emit($event)"
    >
      <label class="flex flex-col gap-1" for="staff-import-month">
        Month
        <p-select
          inputId="staff-import-month"
          [options]="months"
          optionLabel="label"
          optionValue="value"
          [ngModel]="month()"
          (ngModelChange)="month.set($event)"
          class="w-44"
        />
      </label>
      <p class="text-muted-foreground">
        Approved leave is already filled in as LV. Leave it as it is unless the person came in.
      </p>
    </app-import-wizard>
  `,
})
export class StaffAttendanceImport {
  protected readonly open = signal(false);
  readonly imported = output<ImportBatch>();
  protected readonly months = recentMonths();
  protected readonly month = signal(this.months[0].value);
}
