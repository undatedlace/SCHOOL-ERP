import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { apiError } from '../../core/api-error';
import { formatDate } from '../../shared/dates';
import { Badge, BadgeTone } from '../../shared/ui/badge';
import { PageHeader } from '../../shared/ui/page-header';
import { IMPORT_TITLES, ImportListItem, ImportStatus } from './import-models';
import { ImportsApi, saveFile } from './imports-api';

const STATUS: Record<ImportStatus, { label: string; tone: BadgeTone }> = {
  CHECKED: { label: 'Checked, not imported', tone: 'warn' },
  RUNNING: { label: 'Importing', tone: 'info' },
  IMPORTED: { label: 'Imported', tone: 'good' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

/**
 * Every Excel file brought in (the kinds this person may import): when, by whom, what went in,
 * and the rows to fix. Imports themselves start from the page they belong to.
 */
@Component({
  selector: 'app-imports-history',
  imports: [ButtonModule, Badge, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Excel imports"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Excel imports' }]"
      subtitle="Files brought in from Excel. Start an import from its own page: Admissions, Fee dues, or Attendance."
    />

    <section class="overflow-hidden rounded-xl bg-card shadow-sm">
      @if (error()) {
        <p class="p-5 text-sm text-bad" role="alert">{{ error() }}</p>
      } @else if (!loaded()) {
        <p class="p-5 text-sm text-muted-foreground">Loading…</p>
      } @else if (rows().length === 0) {
        <p class="p-8 text-center text-sm text-muted-foreground">Nothing has been imported yet.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="app-table w-full min-w-[48rem] text-sm">
            <thead>
              <tr>
                <th class="!pl-5">When</th>
                <th>What</th>
                <th>File</th>
                <th>Rows</th>
                <th>Status</th>
                <th class="!pr-5"><span class="sr-only">Rows to fix</span></th>
              </tr>
            </thead>
            <tbody>
              @for (b of rows(); track b.id) {
                <tr>
                  <td class="!pl-5 whitespace-nowrap">
                    {{ format(b.createdAt) }}
                    <p class="text-xs text-muted-foreground">{{ b.createdBy }}</p>
                  </td>
                  <td>{{ title(b) }}</td>
                  <td class="max-w-56 truncate" [title]="b.fileName">{{ b.fileName }}</td>
                  <td class="text-xs leading-5 tabular-nums">
                    @if (b.summary.imported !== undefined) {
                      <span>{{ b.summary.imported }} imported</span>
                    } @else {
                      <span>{{ b.summary.ready }} ready</span>
                    }
                    @if (problems(b)) {
                      <br /><span class="text-bad">{{ problems(b) }} to fix</span>
                    }
                    @if (b.summary.unchanged) {
                      <br /><span class="text-muted-foreground"
                        >{{ b.summary.unchanged }} already in the app</span
                      >
                    }
                  </td>
                  <td>
                    <app-badge [label]="status(b).label" [tone]="status(b).tone" />
                  </td>
                  <td class="!pr-5 text-right whitespace-nowrap">
                    @if (problems(b)) {
                      <p-button
                        label="Rows to fix"
                        size="small"
                        severity="secondary"
                        [text]="true"
                        [loading]="downloading() === b.id"
                        (onClick)="download(b)"
                      />
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class ImportsHistory {
  private readonly api = inject(ImportsApi);
  protected readonly rows = signal<ImportListItem[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly format = (iso: string) => formatDate(iso.slice(0, 10));
  protected readonly title = (b: ImportListItem) => IMPORT_TITLES[b.slug];
  protected readonly status = (b: ImportListItem) => STATUS[b.status];
  protected readonly problems = (b: ImportListItem) =>
    b.summary.withErrors + (b.summary.failed ?? 0);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.rows.set(await firstValueFrom(this.api.list()));
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async download(b: ImportListItem) {
    this.downloading.set(b.id);
    try {
      saveFile(await firstValueFrom(this.api.problems(b.id)));
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.downloading.set(null);
    }
  }
}
