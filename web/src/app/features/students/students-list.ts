import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { TableModule } from '@openng/optimus-ui/table';
import { ButtonModule } from '@openng/optimus-ui/button';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import { SchoolClass, StudentListItem } from '../../core/models';
import { ageText, formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { Avatar } from '../../shared/ui/avatar';
import { Badge, BadgeTone, ClassPill } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { genderLabel } from '../../shared/ui/labels';
import { StatTile } from '../../shared/ui/stat-tile';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { GENDER_OPTIONS, LOGIN_OPTIONS } from '../../shared/ui/filter-options';
import { PageHeader } from '../../shared/ui/page-header';

const MAX_CLASS_TILES = 12;

@Component({
  selector: 'app-students-list',
  imports: [
    RouterLink,
    TableModule,
    ButtonModule,
    PageHeader,
    FilterBar,
    HasPermission,
    Avatar,
    Badge,
    ClassPill,
    StatTile,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Students"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Students' }]"
      [subtitle]="subtitle()"
    >
      <p-button
        *appHasPermission="'admissions.manage'"
        label="New application"
        routerLink="/app/admissions/new"
      />
    </app-page-header>

    @if (classTiles().length) {
      <section aria-label="Students by class" class="mb-6">
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          @for (t of classTiles(); track t.id) {
            <li>
              <app-stat-tile
                [compact]="true"
                [label]="t.name"
                [value]="t.count ?? '…'"
                [hint]="t.divisions === 1 ? '1 division' : t.divisions + ' divisions'"
              />
            </li>
          }
        </ul>
      </section>
    }

    <section class="overflow-hidden rounded-xl bg-card shadow-sm">
      <div class="border-b p-5 pb-1">
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
        [tableStyle]="{ 'min-width': '46rem' }"
      >
        <ng-template #header>
          <tr>
            <th class="!pl-5">Student</th>
            <th>Class</th>
            <th>Date of birth</th>
            <th>Gender</th>
            <th>Status</th>
            <th class="!pr-5"><span class="sr-only">Open</span></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td class="!pl-5">
              <div class="flex items-center gap-3">
                <app-avatar [name]="row.fullName" [photoFileId]="row.photoFileId" />
                <div class="min-w-0 leading-tight">
                  <a class="font-semibold app-link" [routerLink]="['/app/students', row.id]">{{
                    row.fullName
                  }}</a>
                  <p class="mt-1 text-xs text-muted-foreground">ID {{ row.admissionNo }}</p>
                </div>
              </div>
            </td>
            <td>
              @if (row.current; as c) {
                <app-class-pill [label]="c.class.name + '-' + c.division.name" />
              } @else {
                <span class="text-sm text-muted-foreground">Not enrolled this year</span>
              }
            </td>
            <td class="text-sm whitespace-nowrap">
              {{ format(row.dateOfBirth) }}
              <span class="block text-xs text-muted-foreground">{{ age(row.dateOfBirth) }}</span>
            </td>
            <td class="text-sm">{{ gender(row.gender) }}</td>
            <td>
              <app-badge [label]="statusText(row.status)" [tone]="statusTone(row.status)" />
            </td>
            <td class="!pr-5 text-right">
              <a
                [routerLink]="['/app/students', row.id]"
                class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
                [attr.aria-label]="'Open ' + row.fullName"
                ><app-icon name="eye"
              /></a>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6" class="p-8 text-center text-muted-foreground">
              No students match these filters.
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
})
export class StudentsList {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly format = formatDate;
  protected readonly gender = genderLabel;
  protected readonly age = (dob: string) => ageText(dob) + ' old';
  protected readonly statusText = (s: string) =>
    s === 'ACTIVE' ? 'Active' : s === 'REMOVED' ? 'Removed' : 'Left';
  protected readonly statusTone = (s: string): BadgeTone =>
    s === 'ACTIVE' ? 'good' : s === 'REMOVED' ? 'bad' : 'neutral';
  protected readonly statuses = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Left', value: 'LEFT' },
  ];
  /** Removed students are listed only for the people who may restore them. */
  private readonly auth = inject(AuthService);
  private readonly statusOptions = this.auth.has('students.remove')
    ? [...this.statuses, { label: 'Removed', value: 'REMOVED' }]
    : this.statuses;

  protected readonly rows = signal<StudentListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly classes = signal<SchoolClass[]>([]);
  /** Active students in each class, filled in as the counts arrive. */
  private readonly counts = signal<Record<string, number>>({});
  protected readonly subtitle = computed(() =>
    this.loading() && !this.total()
      ? 'Students enrolled this academic year.'
      : `${this.total()} ${this.total() === 1 ? 'student' : 'students'} found. New students come from granted admission applications.`,
  );
  /** One small tile per class, for a school with a handful of classes; a long list would only crowd the page. */
  protected readonly classTiles = computed(() => {
    const classes = this.classes();
    if (!classes.length || classes.length > MAX_CLASS_TILES) return [];
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      divisions: c.divisions.length,
      count: this.counts()[c.id] ?? null,
    }));
  });

  private filters: FilterValues = {};
  private pageSize = 20;

  protected readonly fields = computed<FilterField[]>(() => {
    const classId = this.classId();
    return [
      {
        key: 'search',
        label: 'Search',
        type: 'search',
        placeholder: 'Name, admission number, parent name or phone',
      },
      {
        key: 'classId',
        label: 'Class',
        type: 'select',
        placeholder: 'Any class',
        options: this.classes().map((c) => ({ label: c.name, value: c.id })),
      },
      {
        key: 'divisionId',
        label: 'Division',
        type: 'select',
        placeholder: 'Any division',
        dependsOn: 'classId',
        disabled: !classId,
        options: (this.classes().find((c) => c.id === classId)?.divisions ?? []).map((d) => ({
          label: d.name,
          value: d.id,
        })),
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        placeholder: 'Any status',
        options: this.statusOptions,
      },
      {
        key: 'gender',
        label: 'Gender',
        type: 'select',
        placeholder: 'Any gender',
        options: GENDER_OPTIONS,
      },
      {
        key: 'hasLogin',
        label: 'Login',
        type: 'select',
        placeholder: 'Any',
        options: LOGIN_OPTIONS,
      },
      { key: 'joinedFrom', label: 'Joined from', type: 'date' },
      { key: 'joinedTo', label: 'Joined to', type: 'date' },
    ];
  });

  /** The class chosen in the filter bar, so the division list can follow it. */
  private readonly classId = signal<string | null>(null);

  constructor() {
    firstValueFrom(this.api.classes())
      .then((c) => {
        this.classes.set(c);
        if (c.length <= MAX_CLASS_TILES) void this.countByClass(c);
      })
      .catch(() => undefined);
  }

  /** How many active students each class has (one small request per class; a few classes at most). */
  private async countByClass(classes: SchoolClass[]) {
    await Promise.all(
      classes.map(async (c) => {
        try {
          const page = await firstValueFrom(
            this.api.students({ page: 1, pageSize: 1, status: 'ACTIVE', classId: c.id }),
          );
          this.counts.update((m) => ({ ...m, [c.id]: page.total }));
        } catch {
          // A count that fails to load just stays as "…".
        }
      }),
    );
  }

  protected load(e: { first?: number | null; rows?: number | null }) {
    this.first.set(e.first ?? 0);
    this.pageSize = e.rows ?? 20;
    void this.fetch();
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    this.classId.set(values['classId'] ?? null);
    this.first.set(0);
    void this.fetch();
  }

  private async fetch() {
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.students({
          page: Math.floor(this.first() / this.pageSize) + 1,
          pageSize: this.pageSize,
          search: this.filters['search'],
          status: this.filters['status'],
          classId: this.filters['classId'],
          divisionId: this.filters['divisionId'],
          gender: this.filters['gender'],
          hasLogin: this.filters['hasLogin'],
          joinedFrom: this.filters['joinedFrom'],
          joinedTo: this.filters['joinedTo'],
        }),
      );
      this.rows.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not load students',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
