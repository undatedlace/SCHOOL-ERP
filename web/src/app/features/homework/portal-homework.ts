import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Homework } from '../../core/models';
import { HomeworkCard } from './homework-card';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { FormsModule } from '@angular/forms';

/** Homework set for a family's children (parents and students). */
@Component({
  selector: 'app-portal-homework',
  imports: [HomeworkCard, SelectButtonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 text-xl font-semibold">Homework</h1>
    <p-selectbutton
      class="mb-4 block"
      [options]="[
        { label: 'Still to do', value: false },
        { label: 'Everything', value: true },
      ]"
      optionLabel="label"
      optionValue="value"
      [allowEmpty]="false"
      [ngModel]="all()"
      (ngModelChange)="setAll($event)"
      aria-label="Which to show"
    />
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
