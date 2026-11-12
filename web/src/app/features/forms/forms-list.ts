import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { FormSummary } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';
import { Badge } from '../../shared/ui/badge';

@Component({
  selector: 'app-forms-list',
  imports: [DatePipe, RouterLink, TableModule, PageHeader, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Forms"
      subtitle="Change the questions the office asks. Applications keep the version they were filled in with."
    />
    <p-table [value]="forms()" [loading]="loading()">
      <ng-template #header>
        <tr>
          <th>Form</th>
          <th>Live version</th>
          <th>Draft</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </ng-template>
      <ng-template #body let-form>
        <tr>
          <td class="font-medium">{{ form.name }}</td>
          <td>
            @if (form.publishedVersion) {
              Version {{ form.publishedVersion }}
              <span class="text-xs text-muted-foreground"
                >({{ form.publishedAt | date: 'd MMM y' }})</span
              >
            } @else {
              <app-badge label="Not published" severity="warn" />
            }
          </td>
          <td>
            @if (form.hasDraft) {
              <app-badge label="Draft in progress" severity="info" />
            }
          </td>
          <td class="text-right">
            <a class="font-medium app-link" [routerLink]="['/app/settings/forms', form.key]"
              >Open</a
            >
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class FormsList {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly forms = signal<FormSummary[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    firstValueFrom(this.api.forms())
      .then((f) => this.forms.set(f))
      .catch((e) =>
        this.toast.add({ severity: 'error', summary: 'Could not load forms', detail: apiError(e) }),
      )
      .finally(() => this.loading.set(false));
  }
}
