import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageService } from '@openng/optimus-ui/api';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuditLogItem } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-audit-log',
  imports: [DatePipe, TableModule, InputTextModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Audit log"
      subtitle="Logins, user changes and academic setup changes."
    />

    <div class="mb-4 max-w-sm">
      <input
        pInputText
        class="w-full"
        placeholder="Filter by action, for example users."
        aria-label="Filter by action"
        (input)="onFilter($any($event.target).value)"
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
      [tableStyle]="{ 'min-width': '40rem' }"
    >
      <ng-template #header>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Action</th>
          <th>Record</th>
        </tr>
      </ng-template>
      <ng-template #body let-row>
        <tr>
          <td class="whitespace-nowrap">{{ row.createdAt | date: 'd MMM y, h:mm a' }}</td>
          <td>{{ row.actorName ?? '-' }}</td>
          <td class="font-mono text-sm">{{ row.action }}</td>
          <td class="text-sm text-muted-foreground">{{ row.entityType ?? '' }}</td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="4" class="p-4 text-center text-muted-foreground">Nothing recorded yet.</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class AuditLog {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly rows = signal<AuditLogItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  private action = '';
  private pageSize = 20;
  private timer?: ReturnType<typeof setTimeout>;

  protected load(e: { first?: number | null; rows?: number | null }) {
    this.first.set(e.first ?? 0);
    this.pageSize = e.rows ?? 20;
    void this.fetch();
  }

  protected onFilter(value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.action = value.trim();
      this.first.set(0);
      void this.fetch();
    }, 300);
  }

  private async fetch() {
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.auditLogs({
          page: Math.floor(this.first() / this.pageSize) + 1,
          pageSize: this.pageSize,
          action: this.action,
        }),
      );
      this.rows.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not load the audit log',
        detail: apiError(error),
      });
    } finally {
      this.loading.set(false);
    }
  }
}
