import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Notice } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { audienceText } from './notice-utils';

/** One notice. The text is shown exactly as written (never as HTML). */
@Component({
  selector: 'app-notice-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="rounded-xl border-0 bg-card shadow-sm p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h2 class="font-semibold">{{ notice().title }}</h2>
        <ng-content />
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ notice().createdBy.fullName }} on {{ date(notice().createdAt) }}
        @if (showAudience()) {
          <span> &middot; To: {{ audience() }}</span>
        }
        @if (notice().expiresOn) {
          <span>
            &middot;
            {{ notice().expired ? 'Ended' : 'Until' }} {{ date(notice().expiresOn!) }}
          </span>
        }
      </p>
      <p class="mt-3 whitespace-pre-wrap break-words text-sm">{{ notice().body }}</p>
    </article>
  `,
})
export class NoticeCard {
  readonly notice = input.required<Notice>();
  /** Staff see who a notice went to; parents just read it. */
  readonly showAudience = input(false);
  protected readonly date = formatDate;
  protected readonly audience = computed(() => audienceText(this.notice()));
}
