import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { StudentListItem } from '../../core/models';

const KEY = 'portal.child';
const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * The children a parent can see (or the student themself) and which one is chosen.
 * The choice is only remembered for convenience; the API decides what may be seen.
 */
@Injectable({ providedIn: 'root' })
export class PortalChildren {
  private readonly api = inject(Api);

  readonly children = signal<StudentListItem[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  private readonly chosen = signal<string | null>(read());

  /** The chosen child, or the first one when nothing valid is chosen. */
  readonly selected = computed(() => {
    const all = this.children();
    return all.find((c) => c.id === this.chosen()) ?? all[0] ?? null;
  });

  private loading: Promise<void> | null = null;

  /** Loads the list once; later calls share the same result. */
  load(): Promise<void> {
    this.loading ??= this.fetch();
    return this.loading;
  }

  choose(id: string) {
    this.chosen.set(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // The choice just is not remembered.
    }
  }

  /** Forget everything, for example after signing out. */
  reset() {
    this.children.set([]);
    this.loaded.set(false);
    this.loading = null;
  }

  private async fetch() {
    try {
      const page = await firstValueFrom(this.api.students({ page: 1, pageSize: 50 }));
      this.children.set(page.items.filter((s) => s.status === 'ACTIVE'));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
