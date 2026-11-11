import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { LeaveBalance, LeaveRequest, LeaveType } from '../../core/models';
import { DateField } from '../../shared/ui/date-field';
import { LeaveRequests } from './leave-requests';
import { canWithdraw, daysText, parseDays } from './leave-utils';
import { MyLeave } from './my-leave';

/** Waits for requests to finish and for the page to catch up (several requests settle in a row). */
const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
};

const types: LeaveType[] = [
  { id: 'c', name: 'Casual leave', unlimited: false, active: true },
  { id: 'u', name: 'Unpaid leave', unlimited: true, active: true },
];
const balance = (over: Partial<LeaveBalance> = {}): LeaveBalance => ({
  staff: { id: 's1', name: 'Asha Rao' },
  academicYear: { id: 'y', name: '2026-27' },
  balances: [
    {
      leaveType: { id: 'c', name: 'Casual leave', unlimited: false },
      entitled: 8,
      taken: 1,
      upcoming: 2,
      pending: 1,
      remaining: 4,
    },
    {
      leaveType: { id: 'u', name: 'Unpaid leave', unlimited: true },
      entitled: 0,
      taken: 0,
      upcoming: 0,
      pending: 0,
      remaining: null,
    },
  ],
  ...over,
});
const request = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'r1',
  staff: { id: 's1', name: 'Asha Rao', designation: 'Teacher' },
  leaveType: { id: 'c', name: 'Casual leave' },
  startsOn: '2099-06-01',
  endsOn: '2099-06-02',
  halfDay: false,
  days: 2,
  reason: 'Family function',
  status: 'PENDING',
  decidedAt: null,
  decisionNote: null,
  createdAt: '2026-11-10T00:00:00Z',
  mine: true,
  ...over,
});

function providers() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('leave helpers', () => {
  it('writes days for people', () => {
    expect(daysText(0.5)).toBe('Half a day');
    expect(daysText(1)).toBe('1 day');
    expect(daysText(3)).toBe('3 days');
    expect(daysText(2.5)).toBe('2 and a half days');
  });
  it('accepts whole and half days only', () => {
    expect(parseDays('12')).toBe(12);
    expect(parseDays(' 7.5 ')).toBe(7.5);
    expect(parseDays('0')).toBe(0);
    for (const bad of ['', 'x', '-1', '0.3', '400']) expect(parseDays(bad)).toBeNull();
  });
  it('offers withdrawing for waiting leave and approved leave that has not ended', () => {
    expect(canWithdraw('PENDING', '2020-01-01', '2026-11-10')).toBe(true);
    expect(canWithdraw('APPROVED', '2026-11-10', '2026-11-10')).toBe(true);
    expect(canWithdraw('APPROVED', '2026-11-09', '2026-11-10')).toBe(false);
    expect(canWithdraw('REJECTED', '2099-01-01', '2026-11-10')).toBe(false);
  });
});

describe('MyLeave', () => {
  async function setup(b = balance(), rows: LeaveRequest[] = [request()]) {
    const http = providers();
    const fixture = TestBed.createComponent(MyLeave);
    fixture.detectChanges();
    http.expectOne('/api/leave/balance').flush(b);
    http.expectOne('/api/leave/types').flush(types);
    http
      .expectOne((r) => r.url === '/api/leave/requests')
      .flush({ items: rows, total: rows.length, page: 1, pageSize: 50 });
    await settle(fixture);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('shows what is left for each kind, and "No limit" for unlimited kinds', async () => {
    const { el } = await setup();
    const text = el.textContent!;
    expect(text).toContain('Casual leave');
    expect(text).toContain('4 of 8 left');
    expect(text).toContain('Taken 1');
    expect(text).toContain('No limit');
    expect(text).toContain('Family function');
  });

  it('says so when the school has set up no leave yet, and cannot ask until it has', async () => {
    const { el } = await setup(balance({ balances: [] }));
    expect(el.textContent).toContain('An administrator does this before the year starts');
  });

  it('asks for leave with the form the person filled in', async () => {
    const { fixture, http, el } = await setup();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Ask for leave'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const setType = (value: string) => {
      fixture.debugElement
        .query(By.css('app-leave-apply-dialog p-select'))
        .triggerEventHandler('ngModelChange', value);
      fixture.detectChanges();
    };
    const setDate = (i: number, value: string) => {
      const fields = fixture.debugElement.queryAll(By.directive(DateField));
      fields[i].componentInstance.valueChange.emit(value);
      fixture.detectChanges();
    };
    const set = (id: string, value: string) => {
      if (id === 'lv-type') return setType(value);
      if (id === 'lv-start') return setDate(0, value);
      if (id === 'lv-end') return setDate(1, value);
      const c = document.getElementById(id) as HTMLInputElement;
      c.value = value;
      c.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    const send = () =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Send request',
      ) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    set('lv-type', 'c');
    set('lv-start', '2099-06-01');
    set('lv-end', '2099-06-02');
    set('lv-reason', 'Family function');
    expect(send().disabled).toBe(false);
    send().click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/leave/requests');
    expect(req.request.body).toEqual({
      leaveTypeId: 'c',
      startsOn: '2099-06-01',
      endsOn: '2099-06-02',
      reason: 'Family function',
    });
    req.flush(request());
    await settle(fixture);
    http.expectOne('/api/leave/balance').flush(balance());
    http.expectOne('/api/leave/types').flush(types);
    http
      .expectOne((r) => r.url === '/api/leave/requests')
      .flush({ items: [request()], total: 1, page: 1, pageSize: 50 });
  });

  it('shows the server message when a request is refused', async () => {
    const { fixture, http, el } = await setup();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Ask for leave'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const setType = (value: string) => {
      fixture.debugElement
        .query(By.css('app-leave-apply-dialog p-select'))
        .triggerEventHandler('ngModelChange', value);
      fixture.detectChanges();
    };
    const setDate = (i: number, value: string) => {
      const fields = fixture.debugElement.queryAll(By.directive(DateField));
      fields[i].componentInstance.valueChange.emit(value);
      fixture.detectChanges();
    };
    const set = (id: string, value: string) => {
      if (id === 'lv-type') return setType(value);
      if (id === 'lv-start') return setDate(0, value);
      if (id === 'lv-end') return setDate(1, value);
      const c = document.getElementById(id) as HTMLInputElement;
      c.value = value;
      c.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    set('lv-type', 'c');
    set('lv-start', '2099-06-01');
    set('lv-reason', 'Because');
    fixture.detectChanges();
    (
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Send request',
      ) as HTMLButtonElement
    ).click();
    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        { message: 'Only 1 day(s) of casual leave are left, and this asks for 2' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle(fixture);
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Only 1 day(s) of casual leave are left');
  });

  it('withdraws a waiting request after confirming', async () => {
    const { fixture, http, el } = await setup();
    const confirm = TestBed.inject(ConfirmationService);
    const spy = vi.spyOn(confirm, 'confirm').mockImplementation((c) => {
      void c.accept?.();
      return confirm;
    });
    (el.querySelector('button[aria-label^="Withdraw leave"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/leave/requests/r1/cancel')
      .flush(request({ status: 'CANCELLED' }));
    await settle(fixture);
  });
});

describe('LeaveRequests (administrator)', () => {
  async function setup(rows: LeaveRequest[]) {
    const http = providers();
    const fixture = TestBed.createComponent(LeaveRequests);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/leave/types').flush(types);
    http
      .expectOne((r) => r.url === '/api/staff')
      .flush({ items: [{ id: 's1', fullName: 'Asha Rao' }], total: 1, page: 1, pageSize: 100 });
    http
      .expectOne((r) => r.url === '/api/leave/requests')
      .flush({ items: rows, total: rows.length, page: 1, pageSize: 50 });
    await settle(fixture);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('starts with what is waiting, and approves with one press', async () => {
    const { fixture, http, el } = await setup([request({ mine: false })]);
    expect(el.textContent).toContain('Asha Rao');
    (
      el.querySelector('button[aria-label="Approve leave for Asha Rao"]') as HTMLButtonElement
    ).click();
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/leave/requests/r1/decision',
    );
    expect(req.request.body).toEqual({ decision: 'APPROVED' });
    req.flush(request({ status: 'APPROVED' }));
    await settle(fixture);
    http
      .expectOne((r) => r.url === '/api/leave/requests')
      .flush({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it('asks for the waiting list by default and switches tabs', async () => {
    const { fixture, http, el } = await setup([]);
    (
      Array.from(el.querySelectorAll('[role="tab"]')).find(
        (b) => b.textContent?.trim() === 'Approved',
      ) as HTMLButtonElement
    ).click();
    const req = http.expectOne((r) => r.url === '/api/leave/requests');
    expect(req.request.params.get('status')).toBe('APPROVED');
    req.flush({ items: [], total: 0, page: 1, pageSize: 50 });
    await settle(fixture);
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing here.');
  });

  it('needs a reason to refuse, and sends it', async () => {
    const { fixture, http, el } = await setup([request({ mine: false })]);
    (
      el.querySelector('button[aria-label="Refuse leave for Asha Rao"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const go = () =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Refuse leave',
      ) as HTMLButtonElement;
    expect(go().disabled).toBe(true);
    const note = document.getElementById('refuse-note') as HTMLTextAreaElement;
    note.value = 'Exams that week';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    go().click();
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/leave/requests/r1/decision',
    );
    expect(req.request.body).toEqual({ decision: 'REJECTED', note: 'Exams that week' });
    req.flush(request({ status: 'REJECTED' }));
    await settle(fixture);
    http
      .expectOne((r) => r.url === '/api/leave/requests')
      .flush({ items: [], total: 0, page: 1, pageSize: 50 });
  });
});
