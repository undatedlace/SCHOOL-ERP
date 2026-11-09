import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { CalendarEvent } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { CalendarPage } from './calendar-page';
import { UpcomingEvents } from './upcoming-events';

const today = toIsoDate(new Date());
const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Annual Day',
  description: null,
  category: 'EVENT',
  startsOn: today,
  endsOn: today,
  startTime: '10:00',
  endTime: null,
  audience: 'ALL',
  classes: [],
  divisions: [],
  announced: false,
  canChange: false,
  ...over,
});

function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
    ],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({ id: 'u', fullName: 'U', roles: [], permissions, mustChangePassword: false });
  return TestBed.inject(HttpTestingController);
}

describe('CalendarPage', () => {
  it('asks for the days on the grid and shows the day agenda', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/calendar');
    expect(req.request.params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(req.request.params.get('to')! >= req.request.params.get('from')!).toBe(true);
    req.flush([
      event(),
      event({ id: 'e2', title: 'Diwali', category: 'HOLIDAY', startTime: null }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const agenda = el.querySelector('[aria-labelledby="agenda-title"]')!.textContent!;
    expect(agenda).toContain('Annual Day');
    expect(agenda).toContain('10:00 am');
    expect(agenda).toContain('Diwali');
    expect(agenda).toContain('All day');
    http.verify();
  });

  it('shows text exactly as written, never as HTML', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/calendar')
      .flush([event({ description: '<img src=x onerror=alert(1)>' })]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.querySelector('article img')).toBeNull();
  });

  it('shows New event, Change and Remove only to people who manage the calendar', async () => {
    for (const manage of [false, true]) {
      TestBed.resetTestingModule();
      const http = setup(manage ? ['calendar.read', 'calendar.manage'] : ['calendar.read']);
      const fixture = TestBed.createComponent(CalendarPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url === '/api/calendar').flush([event({ canChange: manage })]);
      await fixture.whenStable();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent!;
      expect(text.includes('New event')).toBe(manage);
      expect(text.includes('Remove')).toBe(manage);
    }
  });

  it('loads the next month when asked', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    await fixture.whenStable();
    const next = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Next month"]',
    ) as HTMLButtonElement;
    next.click();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    await fixture.whenStable();
    http.verify();
  });

  it('says so when the request fails', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/calendar')
      .flush({ message: 'Nope' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nope');
  });
});

describe('UpcomingEvents', () => {
  it('lists only the first few events, with a link to the calendar', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(UpcomingEvents);
    fixture.componentRef.setInput('limit', 2);
    fixture.componentRef.setInput('calendarLink', '/portal/calendar');
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/calendar')
      .flush([
        event({ id: 'a', title: 'One' }),
        event({ id: 'b', title: 'Two' }),
        event({ id: 'c', title: 'Three' }),
      ]);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('One');
    expect(el.textContent).toContain('Two');
    expect(el.textContent).not.toContain('Three');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/portal/calendar');
  });

  it('says when nothing is planned', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(UpcomingEvents);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nothing is planned');
  });
});
