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
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { FormsModule } from '@angular/forms';
import { Avatar } from '../../shared/ui/avatar';
import { ClassPill } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { AdmissionsImport } from '../imports/import-launchers';

@Component({
  selector: 'app-applications',
  imports: [
    RouterLink,
    ButtonModule,
    TableModule,
    FilterBar,
    PageHeader,
    StatusTag,
    HasPermission,
    SelectButtonModule,
    FormsModule,
    Avatar,
    ClassPill,
    Icon,
    AdmissionsImport,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Admissions"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Admissions' }]"
      subtitle="Applications for the current academic year: received, reviewed, then granted or refused."
    >
      <ng-container *appHasPermission="'admissions.manage'">
        <app-admissions-import *appHasPermission="'students.manage'" (imported)="reload()" />
      </ng-container>
      <p-button
        *appHasPermission="'admissions.manage'"
        label="New application"
        routerLink="/app/admissions/new"
      />
    </app-page-header>

    <section class="overflow-hidden rounded-xl bg-card shadow-sm">
      <div class="flex flex-col gap-4 border-b p-5 pb-1">
        @if (statusTabs().length) {
          <p-selectbutton
            [options]="statusTabs()"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
            [ngModel]="statusChoice()"
            (ngModelChange)="onStatus($event === 'ALL' ? null : $event)"
            aria-label="Show applications by status"
          >
            <ng-template #item let-item>
              <span>{{ item.label }}</span>
              <span
                class="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums"
                >{{ item.count }}</span
              >
            </ng-template>
          </p-selectbutton>
        }
        <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />
      </div>

      <p-table
        [value]="rows()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="20"
        [rowsPerPageOptions]="[20, 50, 100]"
        [showCurrentPageReport]="true"
        currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
        [first]="first()"
        [totalRecords]="total()"
        [loading]="loading()"
        [tableStyle]="{ 'min-width': '48rem' }"
      >
        <ng-template #header>
          <tr>
            <th class="!pl-5">Child</th>
            <th>Class applied for</th>
            <th>Received</th>
            <th>Status</th>
            <th class="!pr-5"><span class="sr-only">Open</span></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td class="!pl-5">
              <div class="flex items-center gap-3">
                <app-avatar [name]="row.studentName" />
                <div class="min-w-0 leading-tight">
                  <a class="font-semibold app-link" [routerLink]="['/app/admissions', row.id]">{{
                    row.studentName
                  }}</a>
                  <p class="mt-1 text-xs text-muted-foreground">Form no. {{ row.formNo }}</p>
                </div>
              </div>
            </td>
            <td>
              @if (row.class) {
                <app-class-pill [label]="row.class.name" />
              } @else {
                <span class="text-muted-foreground">&mdash;</span>
              }
            </td>
            <td class="text-sm whitespace-nowrap">{{ format(row.receivedOn) }}</td>
            <td><app-status-tag [status]="row.status" /></td>
            <td class="!pr-5 text-right">
              <a
                [routerLink]="['/app/admissions', row.id]"
                class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
                [attr.aria-label]="'Open the application of ' + row.studentName"
                ><app-icon name="eye"
              /></a>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="5" class="p-8 text-center text-muted-foreground">
              No applications match these filters.
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>
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
  /** The chosen status tab ('ALL' for every application). */
  protected readonly statusChoice = signal<ApplicationStatus | 'ALL'>('ALL');
  /** The status tabs above the list, each with its count. */
  protected readonly statusTabs = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      { label: 'All', value: 'ALL' as const, count: s.total },
      ...this.statuses.map((o) => ({ label: o.label, value: o.value, count: s.counts[o.value] })),
    ];
  });
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
    this.statusChoice.set(value ?? 'ALL');
    this.first.set(0);
    void this.fetch();
  }

  /** After an Excel import: show what came in. */
  protected reload() {
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
