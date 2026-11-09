import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalChildren } from './portal-children';

/** Tabs to choose a child; nothing is shown when there is only one. */
@Component({
  selector: 'app-child-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (portal.children().length > 1) {
      <div class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Child">
        @for (c of portal.children(); track c.id) {
          <button
            type="button"
            role="tab"
            class="rounded-full border px-4 py-1.5 text-sm"
            [class.bg-primary]="c.id === portal.selected()?.id"
            [class.text-primary-foreground]="c.id === portal.selected()?.id"
            [attr.aria-selected]="c.id === portal.selected()?.id"
            (click)="portal.choose(c.id)"
          >
            {{ c.firstName }}
          </button>
        }
      </div>
    }
  `,
})
export class ChildSwitcher {
  protected readonly portal = inject(PortalChildren);
}
