import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SearchGroup } from '../../core/models';
import { GlobalSearch } from './global-search';

const groups: SearchGroup[] = [
  {
    type: 'students',
    label: 'Students',
    more: true,
    hits: [
      { id: 's1', title: 'Noor Khan', subtitle: 'No. 11 · Std 1-A', path: '/app/students/s1' },
      { id: 's2', title: 'Noor Shaikh', subtitle: 'No. 12 · Std 1-B', path: '/app/students/s2' },
    ],
  },
  {
    type: 'staff',
    label: 'Staff',
    more: false,
    hits: [
      { id: 't1', title: 'Noorjahan Rao', subtitle: 'Teacher · No. 3', path: '/app/staff/t1' },
    ],
  },
];

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(GlobalSearch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, el, input, type, http: TestBed.inject(HttpTestingController) };
}

describe('GlobalSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing until two letters are typed', () => {
    const { el, type, http } = setup();
    type('n');
    vi.advanceTimersByTime(500);
    http.expectNone((r) => r.url === '/api/search');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('waits for a pause, asks once, and shows results grouped with a note when there are more', async () => {
    const { fixture, el, type, http } = setup();
    type('no');
    type('noor');
    vi.advanceTimersByTime(300);
    const req = http.expectOne((r) => r.url === '/api/search');
    expect(req.request.params.get('q')).toBe('noor');
    req.flush({ query: 'noor', groups });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const text = el.querySelector('[role="listbox"]')!.textContent!;
    expect(text).toContain('Students');
    expect(text).toContain('Noor Khan');
    expect(text).toContain('Staff');
    expect(text).toContain('Noorjahan Rao');
    expect(text).toContain('More students match');
    expect(text).not.toContain('More staff match');
    expect(el.querySelectorAll('[role="option"]').length).toBe(3);
  });

  it('opens a result with the keyboard (arrows then Enter) and closes', async () => {
    const { fixture, el, input, type, http } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    type('noor');
    vi.advanceTimersByTime(300);
    http.expectOne((r) => r.url === '/api/search').flush({ query: 'noor', groups });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith('/app/students/s2');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe('');
  });

  it('says when nothing matches, and shows a failure instead of stale results', async () => {
    const { fixture, el, type, http } = setup();
    type('zzz');
    vi.advanceTimersByTime(300);
    http.expectOne((r) => r.url === '/api/search').flush({ query: 'zzz', groups: [] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing found for "zzz"');

    type('zzzz');
    vi.advanceTimersByTime(300);
    http
      .expectOne((r) => r.url === '/api/search')
      .flush({ message: 'Broken' }, { status: 500, statusText: 'Server Error' });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Broken');
  });

  it('ignores an answer that arrives after a newer search', async () => {
    const { fixture, el, type, http } = setup();
    type('noor');
    vi.advanceTimersByTime(300);
    const first = http.expectOne((r) => r.url === '/api/search');
    type('noorj');
    vi.advanceTimersByTime(300);
    const second = http.expectOne((r) => r.url === '/api/search');
    second.flush({ query: 'noorj', groups: [groups[1]] });
    await vi.advanceTimersByTimeAsync(0);
    first.flush({ query: 'noor', groups: [groups[0]] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const text = el.querySelector('[role="listbox"]')!.textContent!;
    expect(text).toContain('Noorjahan Rao');
    expect(text).not.toContain('Noor Khan');
  });
});
