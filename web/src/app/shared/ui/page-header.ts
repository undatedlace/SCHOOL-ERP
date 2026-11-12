import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb {
  label: string;
  /** Omitted for the current page. */
  link?: string;
}

/**
 * Every page starts the same way: where you are (breadcrumb), the title, one plain sentence
 * of context, and the page's main actions on the right.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        @if (crumbs().length) {
          <nav aria-label="Breadcrumb" class="mb-1.5 text-[13px] font-medium text-muted-foreground">
            <ol class="flex flex-wrap items-center gap-1.5">
              @for (c of crumbs(); track c.label; let last = $last) {
                <li class="flex items-center gap-1.5">
                  @if (c.link && !last) {
                    <a [routerLink]="c.link" class="hover:text-foreground hover:underline">{{
                      c.label
                    }}</a>
                    <span aria-hidden="true" class="text-faint">/</span>
                  } @else {
                    <span class="text-foreground" aria-current="page">{{ c.label }}</span>
                  }
                </li>
              }
            </ol>
          </nav>
        }
        <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight text-foreground">
          {{ title() }}
        </h1>
        @if (subtitle()) {
          <p class="mt-1.5 max-w-3xl text-[15px] text-muted-foreground">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly crumbs = input<Crumb[]>([]);
}
