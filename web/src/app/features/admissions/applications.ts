import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  AdmissionsSummary,
  ApplicationListItem,
  ApplicationStatus,
  SchoolClass,
} from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { STATUS_OPTIONS, StatusTag, statusLabel } from '../../shared/ui/status-tag';

@Component({
  selector: 'app-applications',
  imports: [RouterLink, ButtonModule, TableModule, FilterBar, PageHeader, StatusTag, HasPermission],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Admissions" subtitle="Applications for the current academic year.">
      <a *appHasPermission="'admissions.manage'" routerLink="/app/admissions/new">
        <p-button label="New application" />
      </a>
    </app-page-header>

    @if (summary(); as s) {
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          class="rounded-xl border-0 bg-card shadow-sm p-3 text-left hover:bg-accent"
          (click)="onStatus(null)"
        >
          <p class="text-xs text-muted-foreground">All applications</p>
          <p class="text-2xl font-semibold">{{ s.total }}</p>
        </button>
        @for (opt of statuses; track opt.value) {
          <button
            type="button"
            class="rounded-xl border-0 bg-card shadow-sm p-3 text-left hover:bg-accent"
            [class.ring-2]="status === opt.value"
            [class.ring-ring]="status === opt.value"
            (click)="onStatus(opt.value)"
          >
            <p class="text-xs text-muted-foreground">{{ opt.label }}</p>
            <p class="text-2xl font-semibold">{{ s.counts[opt.value] }}</p>
          </button>
        }
      </div>
    }

    <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />

    <p-table
      [value]="rows()"
      [lazy]="true"
      (onLazyLoad)="load($event)"
      [paginator]="true"
      [rows]="20"
      [first]="first()"
      [totalRecords]="total()"
      [loading]="loading()"
      [tableStyle]="{ 'min-width': '48rem' }"
    >
      <ng-template #header>
        <tr>
          <th>Form no.</th>
          <th>Student</th>
          <th>Class</th>
          <th>Received</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template #body let-row>
        <tr class="hover:bg-accent">
          <td class="font-mono text-sm">{{ row.formNo }}</td>
          <td>
            <a class="font-medium app-link" [routerLink]="['/app/admissions', row.id]">{{
              row.studentName
            }}</a>
          </td>
          <td>{{ row.class?.name }}</td>
          <td class="whitespace-nowrap text-sm">{{ format(row.receivedOn) }}</td>
          <td><app-status-tag [status]="row.status" /></td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5" class="p-4 text-center text-muted-foreground">No applications found.</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class Applications {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly statuses = STATUS_OPTIONS;
  protected readonly format = formatDate;
  protected readonly label = statusLabel;

  protected readonly rows = signal<ApplicationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly summary = signal<AdmissionsSummary | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);

  protected status: ApplicationStatus | null = null;
  private filters: FilterValues = {};
  private pageSize = 20;

  protected readonly fields = computed<FilterField[]>(() => [
    { key: 'search', label: 'Search', type: 'search', placeholder: 'Child name or form number' },
    {
      key: 'classId',
      label: 'Class applied for',
      type: 'select',
      placeholder: 'Any class',
      options: this.classes().map((c) => ({ label: c.name, value: c.id })),
    },
    { key: 'receivedFrom', label: 'Received from', type: 'date' },
    { key: 'receivedTo', label: 'Received to', type: 'date' },
    {
      key: 'admitted',
      label: 'Admitted',
      type: 'select',
      placeholder: 'Any',
      options: [
        { label: 'Admitted as a student', value: 'true' },
        { label: 'Not admitted yet', value: 'false' },
      ],
    },
  ]);

  constructor() {
    firstValueFrom(this.api.classes())
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
    firstValueFrom(this.api.applicationsSummary())
      .then((s) => this.summary.set(s))
      .catch(() => undefined);
  }

  protected load(e: { first?: number | null; rows?: number | null }) {
    this.first.set(e.first ?? 0);
    this.pageSize = e.rows ?? 20;
    void this.fetch();
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    this.first.set(0);
    void this.fetch();
  }

  /** The status tiles above the list. */
  protected onStatus(value: ApplicationStatus | null) {
    this.status = value;
    this.first.set(0);
    void this.fetch();
  }

  private async fetch() {
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.applications({
          page: Math.floor(this.first() / this.pageSize) + 1,
          pageSize: this.pageSize,
          search: this.filters['search'],
          status: this.status,
          classId: this.filters['classId'],
          receivedFrom: this.filters['receivedFrom'],
          receivedTo: this.filters['receivedTo'],
          admitted: this.filters['admitted'],
        }),
      );
      this.rows.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not load applications',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
