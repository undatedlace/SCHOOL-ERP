import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AttendanceRoster } from '../../core/models';
import { draftsFrom } from '../attendance/attendance-utils';
import { StudentLeavePage } from './student-leave-page';
import { StudentLeave } from './student-leave.service';
import { daysText, rangeText, schoolDaysText } from './student-leave-utils';

const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
};

const leave = (over: Partial<StudentLeave> = {}): StudentLeave => ({
  id: 'r1',
  student: { id: 's1', name: 'Zaid Khan', className: 'Std 1', divisionName: 'A' },
  fromDate: '2099-06-01',
  toDate: '2099-06-02',
  halfDay: false,
  days: 2,
  reason: 'Fever',
  status: 'PENDING',
  requestedBy: { name: 'Imran Shaikh' },
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  withdrawnAt: null,
  createdAt: '2099-05-30T00:00:00Z',
  canWithdraw: false,
  canDecide: true,
  ...over,
});

describe('student leave helpers', () => {
  it('writes days and ranges in plain words', () => {
    expect(daysText(1)).toBe('1 day');
    expect(daysText(3)).toBe('3 days');
    expect(daysText(0.5)).toBe('Half a day');
    expect(schoolDaysText(2)).toBe('2 school days');
    expect(schoolDaysText(0.5)).toBe('Half a school day');
    expect(rangeText({ fromDate: '2099-06-01', toDate: '2099-06-01' })).not.toContain(' to ');
    expect(rangeText({ fromDate: '2099-06-01', toDate: '2099-06-03' })).toContain(' to ');
  });
});

describe('attendance pre-fill', () => {
  const roster = (): AttendanceRoster =>
    ({
      students: [
        {
          studentId: 'a',
          admissionNo: '1',
          name: 'A',
          rollNo: 1,
          status: null,
          note: null,
          approvedLeave: { requestId: 'x', halfDay: false },
          suggestedStatus: 'ON_LEAVE',
        },
        {
          studentId: 'b',
          admissionNo: '2',
          name: 'B',
          rollNo: 2,
          status: 'PRESENT',
          note: null,
          approvedLeave: { requestId: 'y', halfDay: false },
          suggestedStatus: null,
        },
        { studentId: 'c', admissionNo: '3', name: 'C', rollNo: 3, status: null, note: null },
      ],
    }) as AttendanceRoster;

  it('pre-selects leave only for an unmarked student, and lets a saved mark win', () => {
    const d = draftsFrom(roster());
    expect(d['a'].status).toBe('ON_LEAVE');
    expect(d['b'].status).toBe('PRESENT');
    expect(d['c'].status).toBeNull();
  });
});

describe('StudentLeavePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  const page = (items: StudentLeave[]) => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    counts: { PENDING: items.length, APPROVED: 3, REFUSED: 1, WITHDRAWN: 0 },
  });

  it('lists waiting requests with counts and approves one', async () => {
    const f = TestBed.createComponent(StudentLeavePage);
    f.detectChanges();
    http.expectOne('/api/classes').flush([]);
    http
      .expectOne((r) => r.url === '/api/student-leave' && r.params.get('status') === 'PENDING')
      .flush(page([leave()]));
    await settle(f);
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Zaid Khan');
    expect(text).toContain('Fever');
    expect(text).toContain('Waiting');

    const approve = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Approve',
    );
    expect(approve).toBeTruthy();
    approve!.click();
    const post = http.expectOne('/api/student-leave/r1/decision');
    expect(post.request.body).toEqual({ approve: true, note: undefined });
    post.flush(leave({ status: 'APPROVED', canDecide: false }));
    await settle(f);
    http.expectOne((r) => r.url === '/api/student-leave').flush(page([]));
  });

  it('offers no buttons for a request the person cannot decide', async () => {
    const f = TestBed.createComponent(StudentLeavePage);
    f.detectChanges();
    http.expectOne('/api/classes').flush([]);
    http
      .expectOne((r) => r.url === '/api/student-leave')
      .flush(page([leave({ canDecide: false })]));
    await settle(f);
    const labels = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).map(
      (b) => b.textContent?.trim(),
    );
    expect(labels).not.toContain('Approve');
    expect(labels).not.toContain('Refuse');
  });
});
