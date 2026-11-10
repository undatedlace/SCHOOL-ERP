import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import { SchoolClass, StudentListItem } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { GENDER_OPTIONS, LOGIN_OPTIONS } from '../../shared/ui/filter-options';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-students-list',
  imports: [RouterLink, TableModule, TagModule, PageHeader, FilterBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Students"
      subtitle="Students enrolled this academic year. New students come from granted admission applications."
    />

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
      [tableStyle]="{ 'min-width': '44rem' }"
    >
      <ng-template #header>
        <tr>
          <th>Adm. no.</th>
          <th>Student</th>
          <th>Class</th>
          <th>Date of birth</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template #body let-row>
        <tr class="hover:bg-accent">
          <td class="font-mono text-sm">{{ row.admissionNo }}</td>
          <td>
            <a
              class="flex items-center gap-3 font-medium app-link"
              [routerLink]="['/app/students', row.id]"
            >
              @if (row.photoFileId) {
                <img
                  [src]="'/api/files/' + row.photoFileId"
                  alt=""
                  class="size-8 rounded-full border object-cover"
                />
              }
              {{ row.fullName }}
            </a>
          </td>
          <td>
            @if (row.current; as c) {
              {{ c.class.name }}-{{ c.division.name }}
            } @else {
              <span class="text-muted-foreground">Not enrolled this year</span>
            }
          </td>
          <td class="whitespace-nowrap text-sm">{{ format(row.dateOfBirth) }}</td>
          <td>
            <p-tag
              [value]="statusText(row.status)"
              [severity]="
                row.status === 'ACTIVE'
                  ? 'success'
                  : row.status === 'REMOVED'
                    ? 'danger'
                    : 'secondary'
              "
            />
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="5" class="p-4 text-center text-muted-foreground">No students found.</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class StudentsList {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly format = formatDate;
  protected readonly statusText = (s: string) =>
    s === 'ACTIVE' ? 'Active' : s === 'REMOVED' ? 'Removed' : 'Left';
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
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
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
