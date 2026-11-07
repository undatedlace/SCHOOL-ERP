import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const html = () => TestBed.inject(DOCUMENT).documentElement;

  beforeEach(() => {
    localStorage.clear();
    html().classList.remove('app-dark');
  });

  it('follows the class the page started with', () => {
    html().classList.add('app-dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('switches to light and back, updating the page and remembering the choice', () => {
    html().classList.add('app-dark');
    const service = TestBed.inject(ThemeService);

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(html().classList.contains('app-dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(html().classList.contains('app-dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('still works when storage is blocked', () => {
    const service = TestBed.inject(ThemeService);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => service.set('dark')).not.toThrow();
    expect(service.theme()).toBe('dark');
    vi.restoreAllMocks();
  });
});
