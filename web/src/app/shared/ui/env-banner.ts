import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

export interface AppInfo {
  /** Set only on a test copy of the app (PPE), for example "Test environment". */
  environmentLabel: string | null;
  /** Where testers send bugs and ideas (an https address), or null. */
  feedbackUrl: string | null;
  /** More than one school: the sign-in page offers a school code. */
  schoolCodeOffered?: boolean;
}

/** What the server says about this copy of the app. Asked once per page load. */
@Injectable({ providedIn: 'root' })
export class AppInfoService {
  private readonly http = inject(HttpClient);
  readonly info = signal<AppInfo | null>(null);
  private asked = false;

  load() {
    if (this.asked) return;
    this.asked = true;
    this.http.get<AppInfo>('/api/app-info').subscribe({
      next: (i) => this.info.set(i),
      // Nothing to show when it cannot be read; production shows nothing anyway.
      error: () => undefined,
    });
  }
}

/**
 * A thin strip on a test copy of the app: says the data is not real and offers a feedback link.
 * Shows nothing in production, where the server sends no label.
 */
@Component({
  selector: 'app-env-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (service.info(); as i) {
      @if (i.environmentLabel) {
        <div
          role="note"
          class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-soft px-4 py-1.5 text-center text-[13px] text-amber-ink"
        >
          <span
            ><strong class="font-semibold">{{ i.environmentLabel }}:</strong> sample data only. Do
            not enter real children's details.</span
          >
          @if (i.feedbackUrl) {
            <a
              [href]="i.feedbackUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold underline underline-offset-2"
              >Send feedback<span class="sr-only"> (opens in a new tab)</span></a
            >
          }
        </div>
      }
    }
  `,
})
export class EnvBanner {
  protected readonly service = inject(AppInfoService);

  constructor() {
    this.service.load();
  }
}
