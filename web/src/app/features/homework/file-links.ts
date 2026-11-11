import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Api } from '../../core/api';
import { FileRef } from '../../core/models';

/** Download links for the files of one homework (the teacher's worksheet, or a student's hand-in). */
@Component({
  selector: 'app-file-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (files().length) {
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        @for (f of files(); track f.id) {
          <li>
            <a class="app-link" [href]="url(f)" target="_blank" rel="noopener">{{ f.name }}</a>
            <span class="text-xs text-muted-foreground"> ({{ size(f.sizeBytes) }})</span>
          </li>
        }
      </ul>
    }
  `,
})
export class FileLinks {
  readonly homeworkId = input.required<string>();
  readonly files = input.required<FileRef[]>();
  private readonly api = inject(Api);

  protected url(f: FileRef) {
    return this.api.homeworkFileUrl(this.homeworkId(), f.id);
  }

  protected size(bytes: number) {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}
