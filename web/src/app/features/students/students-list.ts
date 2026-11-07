import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { SchoolClass, StudentListItem } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-students-list',
  imports: [
    FormsModule,
    RouterLink,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Students"
      subtitle="Students enrolled this academic year. New students come from granted admission applications."
    />

    <div class="mb-4 flex flex-wrap gap-3">
      <input
        pInputText
        class="w-full sm:w-72"
        placeholder="Search by name or admission number"
        aria-label="Search students"
        (input)="onSearch($any($event.target).value)"
      />
      <p-select
        [options]="classes()"
        optionLabel="name"
        optionValue="id"
        placeholder="Any class"
        [showClear]="true"
        [ngModel]="classId"
        ariaLabel="Filter by class"
        (onChange)="onClass($event.value)"
      />
      <p-select
        [options]="divisions()"
        optionLabel="name"
        optionValue="id"
        placeholder="Any division"
        [showClear]="true"
        [disabled]="!classId"
        [ngModel]="divisionId"
        ariaLabel="Filter by division"
        (onChange)="onDivision($event.value)"
      />
      <p-select
        [options]="statuses"
        optionLabel="label"
        optionValue="value"
        placeholder="Any status"
        [showClear]="true"
        ariaLabel="Filter by status"
        (onChange)="onStatus($event.value)"
      />
    </div>

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
              class="flex items-center gap-3 font-medium underline-offset-4 hover:underline"
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
              [value]="row.status === 'ACTIVE' ? 'Active' : 'Left'"
              [severity]="row.status === 'ACTIVE' ? 'success' : 'secondary'"
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
  protected readonly statuses = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Left', value: 'LEFT' },
  ];

  protected readonly rows = signal<StudentListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly divisions = signal<{ id: string; name: string }[]>([]);

  protected classId: string | null = null;
  protected divisionId: string | null = null;
  private search = '';
  private status: string | null = null;
  private pageSize = 20;
  private timer?: ReturnType<typeof setTimeout>;

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

  protected onSearch(value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refilter(() => (this.search = value.trim())), 300);
  }
  protected onClass(value: string | null) {
    this.refilter(() => {
      this.classId = value;
      this.divisionId = null;
      this.divisions.set(this.classes().find((c) => c.id === value)?.divisions ?? []);
    });
  }
  protected onDivision(value: string | null) {
    this.refilter(() => (this.divisionId = value));
  }
  protected onStatus(value: string | null) {
    this.refilter(() => (this.status = value));
  }

  private refilter(apply: () => void) {
    apply();
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
          search: this.search,
          status: this.status,
          classId: this.classId,
          divisionId: this.divisionId,
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
