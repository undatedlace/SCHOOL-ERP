import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NAV } from '../../core/nav';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="'Welcome, ' + firstName()" subtitle="Here is what you can do." />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      @for (item of shortcuts(); track item.path) {
        <a
          [routerLink]="item.path"
          class="rounded-lg border bg-card p-5 shadow-sm transition hover:border-ring"
        >
          <h2 class="font-medium">{{ item.label }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ item.description }}</p>
        </a>
      } @empty {
        <p class="text-sm text-muted-foreground">
          Nothing is set up for your role yet. Ask the school office if you need access.
        </p>
      }
    </div>

    <p class="mt-8 text-sm text-muted-foreground">
      School insights (admissions, fees, attendance and results) arrive in a later phase.
    </p>
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.me()?.fullName.split(' ')[0] ?? '');
  protected readonly shortcuts = computed(() =>
    NAV.filter(
      (i) => i.path !== '/app/dashboard' && (!i.permission || this.auth.has(i.permission)),
    ),
  );
}
