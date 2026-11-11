import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
  it('offers the filters the school asked for, as Optimus controls', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const labels = Array.from(el.querySelectorAll('app-filter-bar span[aria-hidden="true"]')).map(
      (c) => c.textContent?.trim(),
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
    expect(fixture.debugElement.queryAll(By.css('app-filter-bar p-select')).length).toBe(5);
    expect(fixture.debugElement.queryAll(By.css('app-filter-bar p-datepicker')).length).toBe(2);
    expect(el.querySelector('app-filter-bar select')).toBeNull();
  });

  it('sends the chosen filters to the API and returns to the first page', async () => {
    const { fixture, http } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    http
      .match((r) => r.url === '/api/students')
      .forEach((r) => r.flush({ items: [], total: 0, page: 1, pageSize: 20 }));
    // Gender is the fourth drop-down: class, division, status, gender, login.
    fixture.debugElement
      .queryAll(By.css('app-filter-bar p-select'))[3]
      .triggerEventHandler('ngModelChange', 'FEMALE');
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/students');
    expect(req.request.params.get('gender')).toBe('FEMALE');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
