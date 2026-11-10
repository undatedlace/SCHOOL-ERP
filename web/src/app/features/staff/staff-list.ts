import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { StaffMember } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { GENDER_OPTIONS, LOGIN_OPTIONS } from '../../shared/ui/filter-options';
import { PageHeader } from '../../shared/ui/page-header';
import { TempPassword, TempPasswordDialog } from '../../shared/ui/temp-password-dialog';
import { StaffForm } from './staff-form';

@Component({
  selector: 'app-staff-list',
  imports: [
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    HasPermission,
    PageHeader,
    FilterBar,
    StaffForm,
    TempPasswordDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Staff"
      subtitle="Teachers and other staff. Leaving is recorded, never deleted."
    >
      <p-button
        *appHasPermission="'staff.manage'"
        label="Add staff member"
        (onClick)="formOpen.set(true)"
      />
    </app-page-header>

    <app-filter-bar [fields]="fields" (changed)="onFilters($event)" />

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
          <th>No.</th>
          <th>Name</th>
          <th>Designation</th>
          <th>Joined</th>
          <th>Login</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template #body let-row>
        <tr class="hover:bg-accent">
          <td class="font-mono text-sm">{{ row.employeeNo }}</td>
          <td>
            <a
              class="flex items-center gap-3 font-medium app-link"
              [routerLink]="['/app/staff', row.id]"
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
          <td>{{ row.designation }}</td>
          <td class="whitespace-nowrap text-sm">{{ format(row.joinedOn) }}</td>
          <td class="text-sm">
            @if (row.account; as a) {
              {{ roleNames(a.roles) }}
            } @else {
              <span class="text-muted-foreground">No login</span>
            }
          </td>
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
          <td colspan="6" class="p-4 text-center text-muted-foreground">No staff found.</td>
        </tr>
      </ng-template>
    </p-table>

    <app-staff-form [(visible)]="formOpen" (saved)="onSaved($event)" />
    <app-temp-password-dialog [info]="temp()" (closed)="afterPassword()" />
  `,
})
export class StaffList {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);

  protected readonly format = formatDate;
  protected readonly statuses = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Left', value: 'LEFT' },
  ];
  protected readonly roleNames = (roles: { name: string }[]) => roles.map((r) => r.name).join(', ');

  protected readonly rows = signal<StaffMember[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly formOpen = signal(false);
  protected readonly temp = signal<TempPassword | null>(null);
  private newId: string | null = null;

  private filters: FilterValues = {};
  private pageSize = 20;

  protected readonly fields: FilterField[] = [
    {
      key: 'search',
      label: 'Search',
      type: 'search',
      placeholder: 'Name, number, designation or mobile',
    },
    {
      key: 'designation',
      label: 'Designation',
      type: 'search',
      placeholder: 'For example Teacher',
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      placeholder: 'Any status',
      options: this.statuses,
    },
    {
      key: 'gender',
      label: 'Gender',
      type: 'select',
      placeholder: 'Any gender',
      options: GENDER_OPTIONS,
    },
    {
      key: 'role',
      label: 'Login role',
      type: 'select',
      placeholder: 'Any role',
      options: [
        { label: 'Teacher', value: 'TEACHER' },
        { label: 'Accountant', value: 'ACCOUNTANT' },
        { label: 'Office staff', value: 'OFFICE_STAFF' },
        { label: 'Other staff', value: 'STAFF' },
        { label: 'School admin', value: 'SCHOOL_ADMIN' },
      ],
    },
    { key: 'hasLogin', label: 'Login', type: 'select', placeholder: 'Any', options: LOGIN_OPTIONS },
    { key: 'joinedFrom', label: 'Joined from', type: 'date' },
    { key: 'joinedTo', label: 'Joined to', type: 'date' },
  ];

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

  /** After adding someone: show the temporary password if a login was made, then open their page. */
  protected onSaved(staff: StaffMember) {
    this.newId = staff.id;
    if (staff.temporaryPassword) {
      this.temp.set({ name: staff.fullName, password: staff.temporaryPassword });
    } else {
      void this.afterPassword();
    }
  }

  protected async afterPassword() {
    this.temp.set(null);
    if (this.newId) {
      const id = this.newId;
      this.newId = null;
      await this.router.navigate(['/app/staff', id]);
    }
  }

  private async fetch() {
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.staffList({
          page: Math.floor(this.first() / this.pageSize) + 1,
          pageSize: this.pageSize,
          search: this.filters['search'],
          status: this.filters['status'],
          designation: this.filters['designation'],
          gender: this.filters['gender'],
          role: this.filters['role'],
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
        summary: 'Could not load staff',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
