import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { StudentsList } from './students-list';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(StudentsList);
  fixture.detectChanges();
  http
    .expectOne('/api/classes')
    .flush([{ id: 'c1', name: 'Std 1', divisions: [{ id: 'd1', name: 'A' }] }]);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('StudentsList filters', () => {
  it('offers the filters the school asked for', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const labels = Array.from(el.querySelectorAll('app-filter-bar [aria-label]')).map((c) =>
      c.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'Search',
      'Class',
      'Division',
      'Status',
      'Gender',
      'Login',
      'Joined from',
      'Joined to',
    ]);
  });

  it('sends the chosen filters to the API and returns to the first page', async () => {
    const { fixture, http, el } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    // The table asks for its first page on load.
    http
      .match((r) => r.url === '/api/students')
      .forEach((r) => r.flush({ items: [], total: 0, page: 1, pageSize: 20 }));
    const gender = el.querySelector('app-filter-bar [aria-label="Gender"]') as HTMLSelectElement;
    gender.value = 'FEMALE';
    gender.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/students');
    expect(req.request.params.get('gender')).toBe('FEMALE');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
