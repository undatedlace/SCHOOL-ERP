import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Homework } from '../../core/models';
import { HomeworkCard } from './homework-card';

/** Homework set for a family's children (parents and students). */
@Component({
  selector: 'app-portal-homework',
  imports: [HomeworkCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 text-xl font-semibold">Homework</h1>
    <div class="mb-4 flex gap-1 rounded-md border p-1 w-fit" role="tablist">
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="!all()"
        [class.text-primary-foreground]="!all()"
        [attr.aria-selected]="!all()"
        (click)="setAll(false)"
      >
        Still to do
      </button>
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="all()"
        [class.text-primary-foreground]="all()"
        [attr.aria-selected]="all()"
        (click)="setAll(true)"
      >
        Everything
      </button>
    </div>
    @if (error()) {
      <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
    }
    <div class="flex flex-col gap-3">
      @for (h of items(); track h.id) {
        <app-homework-card [homework]="h" [forFamily]="true" (changed)="load()" />
      } @empty {
        <p class="text-sm text-muted-foreground">
          {{ loaded() ? 'No homework right now.' : 'Loading...' }}
        </p>
      }
    </div>
  `,
})
export class PortalHomework {
  private readonly api = inject(Api);
  protected readonly items = signal<Homework[]>([]);
  protected readonly all = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected setAll(all: boolean) {
    this.all.set(all);
    void this.load();
  }

  protected async load() {
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.api.homework({ page: 1, pageSize: 50, status: this.all() ? 'all' : 'open' }),
      );
      this.items.set(page.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
