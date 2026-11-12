import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalChildren } from './portal-children';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { FormsModule } from '@angular/forms';

/** Tabs to choose a child; nothing is shown when there is only one. */
@Component({
  selector: 'app-child-switcher',
  imports: [SelectButtonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (portal.children().length > 1) {
      <p-selectbutton
        class="mb-4 block"
        [options]="portal.children()"
        optionLabel="firstName"
        optionValue="id"
        [allowEmpty]="false"
        [ngModel]="portal.selected()?.id"
        (ngModelChange)="portal.choose($event)"
        aria-label="Child"
      />
    }
  `,
})
export class ChildSwitcher {
  protected readonly portal = inject(PortalChildren);
}
