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
  beforeEach(() => localStorage.clear());

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
      'button[aria-label="Next"]',
    ) as HTMLButtonElement;
    next.click();
    fixture.detectChanges();
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

describe('CalendarPage views', () => {
  beforeEach(() => localStorage.clear());

  async function open(permissions = ['calendar.read']) {
    const http = setup(permissions);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const choose = async (label: string, events: CalendarEvent[] = []) => {
      const button = Array.from(el.querySelectorAll('[aria-label="View"] [role="button"]')).find(
        (b) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      const req = http.expectOne((r) => r.url === '/api/calendar');
      req.flush(events);
      await fixture.whenStable();
      fixture.detectChanges();
      return req.request.params;
    };
    return { http, fixture, el, choose };
  }

  it('starts on the month and offers day, week, month and year', async () => {
    const { el } = await open();
    const labels = Array.from(el.querySelectorAll('[aria-label="View"] [role="button"]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['Day', 'Week', 'Month', 'Year']);
    expect(el.querySelector('app-month-grid')).not.toBeNull();
  });

  it('week view asks for seven days and draws a timed event on the hourly grid', async () => {
    const { el, choose } = await open();
    const p = await choose('Week', [event({ startTime: '09:00', endTime: '10:30' })]);
    const from = new Date(`${p.get('from')}T00:00:00`);
    expect(from.getDay()).toBe(0);
    expect(p.get('to')).toBe(
      toIsoDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6)),
    );
    const block = el.querySelector('app-time-grid button[aria-label^="Annual Day"]')!;
    expect(block.getAttribute('aria-label')).toContain('9:00 am - 10:30 am');
    expect(el.querySelectorAll('app-time-grid [aria-pressed]').length).toBe(7);
  });

  it('day view asks for one day and puts an untimed event in the all-day band', async () => {
    const { el, choose } = await open();
    const p = await choose('Day', [event({ startTime: null })]);
    expect(p.get('from')).toBe(today);
    expect(p.get('to')).toBe(today);
    expect(
      el.querySelector('app-time-grid button[aria-label="Annual Day, all day"]'),
    ).not.toBeNull();
  });

  it('year view asks for the whole year, shows twelve months, and a day opens the day view', async () => {
    const { http, fixture, el, choose } = await open();
    const p = await choose('Year', [event()]);
    const year = new Date().getFullYear();
    expect(p.get('from')).toBe(`${year}-01-01`);
    expect(p.get('to')).toBe(`${year}-12-31`);
    expect(el.querySelectorAll('app-year-grid section').length).toBe(12);
    const busy = el.querySelector(
      `app-year-grid button[aria-label="${today}, has events"]`,
    ) as HTMLButtonElement;
    expect(busy).not.toBeNull();
    busy.click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([event()]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-time-grid')).not.toBeNull();
  });

  it('remembers the view on this device', async () => {
    const first = await open();
    await first.choose('Week');
    expect(localStorage.getItem('calendar-view')).toBe('week');
    TestBed.resetTestingModule();
    const again = await (async () => {
      const http = setup(['calendar.read']);
      const fixture = TestBed.createComponent(CalendarPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url === '/api/calendar').flush([]);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    })();
    expect(again.querySelector('app-time-grid')).not.toBeNull();
  });

  it('steps back and forward by the view', async () => {
    const { el, http, fixture } = await open();
    const title = () => el.querySelector('h2')!.textContent!.trim();
    const before = title();
    (el.querySelector('button[aria-label="Previous"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(title()).not.toBe(before);
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

describe('CalendarPage staff leave', () => {
  beforeEach(() => localStorage.clear());

  it('shows leave on the calendar for people who may see it, as a read-only item, and lists it in the key', async () => {
    const http = setup(['calendar.read', 'leave.apply']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    http
      .expectOne((r) => r.url === '/api/leave/calendar')
      .flush([
        {
          id: 'l1',
          title: 'Asha Rao: Casual leave',
          startsOn: today,
          endsOn: today,
          status: 'APPROVED',
          halfDay: false,
        },
      ]);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const agenda = el.querySelector('[aria-labelledby="agenda-title"]')!.textContent!;
    expect(agenda).toContain('Asha Rao: Casual leave');
    expect(agenda).toContain('Staff leave');
    expect(agenda).not.toContain('For:');
    expect(agenda).not.toContain('Remove');
    expect(el.querySelector('[aria-label="Key"]')!.textContent).toContain('Staff leave');
  });

  it('does not ask for leave at all from people who cannot see it', async () => {
    const http = setup(['calendar.read']);
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/calendar').flush([]);
    http.expectNone((r) => r.url === '/api/leave/calendar');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Key"]')!.textContent,
    ).not.toContain('Staff leave');
  });
});
