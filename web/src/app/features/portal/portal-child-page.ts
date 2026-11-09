import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageModule } from '@openng/optimus-ui/message';
import { StudentAttendanceSection } from '../students/student-attendance';
import { StudentFees } from '../students/student-fees';
import { ChildSwitcher } from './child-switcher';
import { PortalChildren } from './portal-children';

/** One child's attendance or fees, for the page the route chose. */
@Component({
  selector: 'app-portal-child-page',
  imports: [MessageModule, ChildSwitcher, StudentAttendanceSection, StudentFees],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-child-switcher />
    @if (portal.error()) {
      <p-message severity="error" [text]="portal.error()!" />
    } @else if (portal.selected(); as child) {
      <p class="mb-3 text-sm text-muted-foreground">
        {{ child.fullName }}
        @if (child.current) {
          , {{ child.current.class.name }}-{{ child.current.division.name }}
        }
      </p>
      @switch (kind) {
        @case ('attendance') {
          <app-student-attendance [studentId]="child.id" />
        }
        @case ('fees') {
          <app-student-fees [studentId]="child.id" />
        }
      }
    } @else if (portal.loaded()) {
      <p class="text-muted-foreground">
        No student is linked to this login yet. Please ask the school office.
      </p>
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class PortalChildPage {
  protected readonly portal = inject(PortalChildren);
  /** Set by the route's data: 'attendance' or 'fees'. */
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'attendance' | 'fees';

  constructor() {
    void this.portal.load();
  }
}
