import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const DARK_CLASS = 'app-dark';
const STORAGE_KEY = 'theme';

/** Dark is the default. The choice is remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;

  readonly theme = signal<Theme>(this.root.classList.contains(DARK_CLASS) ? 'dark' : 'light');

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    this.root.classList.toggle(DARK_CLASS, theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be blocked (private windows); the choice just won't be remembered.
    }
  }
}
