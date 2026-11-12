import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { StaffMember, StaffType } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { GENDER_OPTIONS, LOGIN_OPTIONS } from '../../shared/ui/filter-options';
import { PageHeader } from '../../shared/ui/page-header';
import { Avatar } from '../../shared/ui/avatar';
import { Badge, ClassPill } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
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
    HasPermission,
    PageHeader,
    FilterBar,
    Avatar,
    Badge,
    ClassPill,
    Icon,
    StatTile,
    StaffForm,
    TempPasswordDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Staff"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Staff' }]"
      subtitle="Teachers and other staff. Leaving is recorded, never deleted."
    >
      <p-button
        *appHasPermission="'staff.manage'"
        label="Add staff member"
        (onClick)="formOpen.set(true)"
      />
    </app-page-header>

    @if (typeTiles().length) {
      <section aria-label="Staff by type" class="mb-6">
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          @for (t of typeTiles(); track t.id) {
            <li>
              <app-stat-tile
                [compact]="true"
                [label]="t.name"
                [value]="t.count"
                [hint]="(t.teaching ? 'Teaching' : 'Not teaching') + ', on record'"
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
        [tableStyle]="{ 'min-width': '50rem' }"
      >
        <ng-template #header>
          <tr>
            <th class="!pl-5">Name</th>
            <th>Designation</th>
            <th>Joined</th>
            <th>Login</th>
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
                  <a class="font-semibold app-link" [routerLink]="['/app/staff', row.id]">{{
                    row.fullName
                  }}</a>
                  <p class="mt-1 text-xs text-muted-foreground">
                    No. {{ row.employeeNo }}
                    @if (row.mobile) {
                      &middot; {{ row.mobile }}
                    }
                  </p>
                </div>
              </div>
            </td>
            <td class="text-sm">
              {{ row.designation }}
              @if (row.staffType) {
                <span class="mt-1 block"><app-class-pill [label]="row.staffType.name" /></span>
              }
            </td>
            <td class="text-sm whitespace-nowrap">{{ format(row.joinedOn) }}</td>
            <td class="text-sm">
              @if (row.account; as a) {
                <app-badge [label]="roleNames(a.roles)" tone="neutral" [dot]="false" />
              } @else {
                <span class="text-muted-foreground">No login</span>
              }
            </td>
            <td>
              <app-badge
                [label]="row.status === 'ACTIVE' ? 'Active' : 'Left'"
                [tone]="row.status === 'ACTIVE' ? 'good' : 'neutral'"
              />
            </td>
            <td class="!pr-5 text-right">
              <a
                [routerLink]="['/app/staff', row.id]"
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
              No staff match these filters.
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>

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
  private readonly types = signal<StaffType[]>([]);
  /** One small tile per kind of staff (at most eight), with how many there are. */
  protected readonly typeTiles = computed(() => {
    const types = this.types().filter((t) => t.active);
    if (!types.length || types.length > 8) return [];
    return types.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.staffCount,
      teaching: t.isTeaching,
    }));
  });
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly formOpen = signal(false);
  protected readonly temp = signal<TempPassword | null>(null);
  private newId: string | null = null;

  private filters: FilterValues = {};
  private pageSize = 20;

  private readonly typeOptions = signal<{ label: string; value: string }[]>([]);

  protected readonly fields = computed<FilterField[]>(() => [
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
  ]);

  constructor() {
    firstValueFrom(this.api.staffTypes())
      .then((types) => {
        this.types.set(types);
        this.typeOptions.set(types.map((t) => ({ label: t.name, value: t.id })));
      })
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
          staffTypeId: this.filters['staffTypeId'],
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
