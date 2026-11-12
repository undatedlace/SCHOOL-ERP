import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import { ButtonModule } from '@openng/optimus-ui/button';

/** Sun/moon button that switches between dark and light. */
@Component({
  selector: 'app-theme-toggle',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      severity="secondary"
      [text]="true"
      [ariaLabel]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      (onClick)="theme.toggle()"
    >
      @if (theme.theme() === 'dark') {
        <svg
          viewBox="0 0 24 24"
          class="size-[18px]"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
      } @else {
        <svg
          viewBox="0 0 24 24"
          class="size-[18px]"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      }
    </p-button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
