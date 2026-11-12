import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { DuesReport, SchoolClass } from '../../core/models';
import { inr } from '../../shared/money';
import { PageHeader } from '../../shared/ui/page-header';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';

@Component({
  selector: 'app-dues-page',
  imports: [
    FormsModule,
    RouterLink,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    PageHeader,
    CheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Fee dues"
      subtitle="Who owes what. Dues from earlier years stay in the totals."
    />

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <input
        pInputText
        placeholder="Search by name or admission number"
        class="w-72"
        aria-label="Search students"
        [ngModel]="search()"
        (ngModelChange)="onSearch($event)"
      />
      <p-select
        [options]="classes()"
        optionLabel="name"
        optionValue="id"
        placeholder="All classes"
        [showClear]="true"
        [ngModel]="classId()"
        (ngModelChange)="onClass($event)"
        aria-label="Class"
        class="w-48"
      />
      <div class="flex items-center gap-2 text-sm">
        <p-checkbox
          [binary]="true"
          inputId="only-owing"
          [ngModel]="onlyOwing()"
          (ngModelChange)="onOwing($event)"
        />
        <label for="only-owing">Only students who owe</label>
      </div>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (report(); as r) {
      <dl class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="rounded-md bg-muted p-3">
          <dt class="text-xs text-muted-foreground">Billed</dt>
          <dd class="text-lg font-semibold">{{ money(r.totals.billed) }}</dd>
        </div>
        <div class="rounded-md bg-muted p-3">
          <dt class="text-xs text-muted-foreground">Collected</dt>
          <dd class="text-lg font-semibold">{{ money(r.totals.collected) }}</dd>
        </div>
        <div class="rounded-md border p-3">
          <dt class="text-xs text-muted-foreground">Pending</dt>
          <dd class="text-lg font-semibold">{{ money(r.totals.pending) }}</dd>
        </div>
        <div class="rounded-md border p-3">
          <dt class="text-xs text-muted-foreground">Overdue</dt>
          <dd class="text-lg font-semibold">{{ money(r.totals.overdue) }}</dd>
        </div>
        <div class="rounded-md bg-muted p-3">
          <dt class="text-xs text-muted-foreground">Students owing</dt>
          <dd class="text-lg font-semibold">{{ r.totals.owing }} of {{ r.totals.students }}</dd>
        </div>
      </dl>

      <h2 class="mb-2 font-semibold">By class and division</h2>
      <p-table [value]="groups(r)" class="mb-8">
        <ng-template #header>
          <tr>
            <th>Class</th>
            <th class="text-right">Students owing</th>
            <th class="text-right">Billed</th>
            <th class="text-right">Collected</th>
            <th class="text-right">Pending</th>
            <th class="text-right">Overdue</th>
          </tr>
        </ng-template>
        <ng-template #body let-g>
          <tr [class.bg-muted]="g.isClass" [class.font-medium]="g.isClass">
            <td [class.pl-8]="!g.isClass">{{ g.label }}</td>
            <td class="text-right">{{ g.owing }} of {{ g.students }}</td>
            <td class="text-right">{{ money(g.billed) }}</td>
            <td class="text-right">{{ money(g.collected) }}</td>
            <td class="text-right">{{ money(g.pending) }}</td>
            <td class="text-right">{{ money(g.overdue) }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6" class="p-4 text-center text-muted-foreground">
              No students enrolled this year.
            </td>
          </tr>
        </ng-template>
      </p-table>

      <h2 class="mb-2 font-semibold">Students</h2>
      <p-table
        [value]="r.students.items"
        [lazy]="true"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="r.students.total"
        [first]="(page() - 1) * pageSize"
        (onLazyLoad)="onPage($event)"
        [loading]="loading()"
      >
        <ng-template #header>
          <tr>
            <th>Student</th>
            <th>Class</th>
            <th class="text-right">Pending</th>
            <th class="text-right">Overdue</th>
            <th class="text-right">From earlier years</th>
          </tr>
        </ng-template>
        <ng-template #body let-s>
          <tr>
            <td>
              <a class="font-medium app-link" [routerLink]="['/app/students', s.studentId]">{{
                s.fullName
              }}</a>
              <div class="text-xs text-muted-foreground">Admission no. {{ s.admissionNo }}</div>
            </td>
            <td>{{ s.class }}-{{ s.division }}</td>
            <td class="text-right font-medium">{{ money(s.pending) }}</td>
            <td class="text-right">{{ money(s.overdue) }}</td>
            <td class="text-right">{{ money(s.previousYearsPending) }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="5" class="p-4 text-center text-muted-foreground">No students match.</td>
          </tr>
        </ng-template>
      </p-table>
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class DuesPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly money = inr;
  protected readonly pageSize = 20;
  protected readonly report = signal<DuesReport | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly classId = signal<string | null>(null);
  protected readonly onlyOwing = signal(false);
  protected readonly page = signal(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void firstValueFrom(this.api.classes()).then((c) => this.classes.set(c));
    void this.load();
  }

  protected groups(r: DuesReport) {
    const out: ((typeof r.byClass)[number] & { isClass: boolean })[] = [];
    for (const c of r.byClass) {
      out.push({ ...c, isClass: true });
      // Divisions are labelled "Class-Division"; show those that belong to this class.
      for (const d of r.byDivision) {
        if (d.label.startsWith(c.label + '-')) out.push({ ...d, isClass: false });
      }
    }
    return out;
  }

  protected onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 300);
  }
  protected onClass(id: string | null) {
    this.classId.set(id);
    this.page.set(1);
    void this.load();
  }
  protected onOwing(value: boolean) {
    this.onlyOwing.set(value);
    this.page.set(1);
    void this.load();
  }
  protected onPage(event: { first?: number | null }) {
    const page = Math.floor((event.first ?? 0) / this.pageSize) + 1;
    if (page === this.page()) return;
    this.page.set(page);
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(
        await firstValueFrom(
          this.api.dues({
            page: this.page(),
            pageSize: this.pageSize,
            classId: this.classId(),
            search: this.search().trim() || undefined,
            onlyOwing: this.onlyOwing(),
          }),
        ),
      );
    } catch (error) {
      this.error.set(apiError(error));
      this.toast.add({ severity: 'error', summary: 'Could not load', detail: apiError(error) });
    } finally {
      this.loading.set(false);
    }
  }
}
