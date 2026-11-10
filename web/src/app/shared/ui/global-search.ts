import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { SearchGroup, SearchHit } from '../../core/models';
import { Icon } from './icon';

const MIN_LETTERS = 2;

/** The search box in the top bar. Finds students, staff and applications the person may see. */
@Component({
  selector: 'app-global-search',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative w-full max-w-md">
      <label class="sr-only" for="global-search">Search students, staff and applications</label>
      <span
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      >
        <app-icon name="search" />
      </span>
      <input
        #box
        id="global-search"
        type="search"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="global-search-results"
        [attr.aria-expanded]="open()"
        class="h-11 w-full rounded-full border bg-card pr-4 pl-11 text-sm shadow-sm"
        placeholder="Search students, staff, applications   ( / )"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKey($event)"
        (focus)="open.set(query().trim().length >= ${MIN_LETTERS})"
      />
      @if (open()) {
        <div
          id="global-search-results"
          role="listbox"
          class="absolute z-40 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border bg-card p-2 shadow-lg"
        >
          @if (error()) {
            <p class="p-3 text-sm text-destructive" role="alert">{{ error() }}</p>
          } @else if (loading() && flat().length === 0) {
            <p class="p-3 text-sm text-muted-foreground">Searching...</p>
          } @else if (groups().length === 0) {
            <p class="p-3 text-sm text-muted-foreground">
              Nothing found for "{{ query().trim() }}".
            </p>
          } @else {
            @for (g of groups(); track g.type) {
              <p
                class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {{ g.label }}
              </p>
              @for (h of g.hits; track h.id) {
                <button
                  type="button"
                  role="option"
                  class="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-accent"
                  [class.bg-accent]="flat()[active()]?.id === h.id"
                  [attr.aria-selected]="flat()[active()]?.id === h.id"
                  (mousedown)="$event.preventDefault()"
                  (click)="go(h)"
                >
                  <span class="text-sm font-medium">{{ h.title }}</span>
                  <span class="text-xs text-muted-foreground">{{ h.subtitle }}</span>
                </button>
              }
              @if (g.more) {
                <p class="px-3 pb-1 text-xs text-muted-foreground">
                  More {{ g.label.toLowerCase() }} match. Type more letters to narrow it down.
                </p>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class GlobalSearch {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly query = signal('');
  protected readonly groups = signal<SearchGroup[]>([]);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly active = signal(0);
  private timer?: ReturnType<typeof setTimeout>;
  /** Only the newest request may update the list. */
  private latest = 0;

  protected flat(): SearchHit[] {
    return this.groups().flatMap((g) => g.hits);
  }

  protected onInput(value: string) {
    this.query.set(value);
    clearTimeout(this.timer);
    if (value.trim().length < MIN_LETTERS) {
      this.groups.set([]);
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.loading.set(true);
    this.timer = setTimeout(() => void this.run(value.trim()), 250);
  }

  private async run(q: string) {
    const id = ++this.latest;
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.search(q));
      if (id !== this.latest) return;
      this.groups.set(res.groups);
      this.active.set(0);
    } catch (e) {
      if (id !== this.latest) return;
      this.groups.set([]);
      this.error.set(apiError(e));
    } finally {
      if (id === this.latest) this.loading.set(false);
    }
  }

  protected onKey(e: KeyboardEvent) {
    const items = this.flat();
    if (e.key === 'Escape') {
      this.open.set(false);
      this.box().nativeElement.blur();
    } else if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      this.active.set((this.active() + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      this.active.set((this.active() - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && items[this.active()]) {
      e.preventDefault();
      this.go(items[this.active()]);
    }
  }

  protected go(hit: SearchHit) {
    this.open.set(false);
    this.query.set('');
    this.groups.set([]);
    void this.router.navigateByUrl(hit.path);
  }

  /** "/" jumps to the box, like many tools do (unless typing somewhere else). */
  @HostListener('document:keydown', ['$event'])
  protected onShortcut(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.box().nativeElement.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  protected onOutside(e: Event) {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
