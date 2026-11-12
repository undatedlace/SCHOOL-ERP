import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Page, StudentAttendance, StudentLedger, StudentListItem } from '../../core/models';
import { ChildSwitcher } from './child-switcher';
import { PortalChildren } from './portal-children';
import { PortalHome } from './portal-home';

const child = (id: string, firstName: string): StudentListItem => ({
  id,
  admissionNo: id,
  fullName: `${firstName} Khan`,
  firstName,
  surname: 'Khan',
  gender: 'FEMALE',
  dateOfBirth: '2020-01-01',
  status: 'ACTIVE',
  photoFileId: null,
  current: {
    academicYear: { id: 'y', name: '2026-27' },
    class: { id: 'c', name: 'Std 1' },
    division: { id: 'd', name: 'A' },
  },
});
const list = (items: StudentListItem[]): Page<StudentListItem> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
});

function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({
    id: 'u',
    fullName: 'Imran Shaikh',
    roles: [],
    permissions: ['attendance.read', 'fees.read', 'students.read', 'notices.read'],
    mustChangePassword: false,
  });
  return { http: TestBed.inject(HttpTestingController), portal: TestBed.inject(PortalChildren) };
}

describe('PortalChildren', () => {
  it('chooses the first child until one is picked, and remembers the pick', async () => {
    const { http, portal } = setup();
    const loading = portal.load();
    http
      .expectOne((r) => r.url === '/api/students')
      .flush(list([child('a', 'Noor'), child('b', 'Zara')]));
    await loading;
    expect(portal.selected()?.id).toBe('a');
    portal.choose('b');
    expect(portal.selected()?.id).toBe('b');
    expect(localStorage.getItem('portal.child')).toBe('b');
  });

  it('ignores a remembered child that is no longer linked', async () => {
    const { http, portal } = setup();
    localStorage.setItem('portal.child', 'gone');
    const fresh = TestBed.inject(PortalChildren);
    const loading = fresh.load();
    http.expectOne((r) => r.url === '/api/students').flush(list([child('a', 'Noor')]));
    await loading;
    expect(fresh.selected()?.id).toBe('a');
    expect(portal).toBe(fresh);
  });

  it('asks only once however many pages ask', async () => {
    const { http, portal } = setup();
    const first = portal.load();
    const second = portal.load();
    http.expectOne((r) => r.url === '/api/students').flush(list([]));
    await Promise.all([first, second]);
  });

  it('forgets the children on sign out', async () => {
    const { http, portal } = setup();
    const loading = portal.load();
    http.expectOne((r) => r.url === '/api/students').flush(list([child('a', 'Noor')]));
    await loading;
    portal.reset();
    expect(portal.children()).toEqual([]);
    expect(portal.loaded()).toBe(false);
  });
});

describe('ChildSwitcher', () => {
  it('appears only when there is more than one child', async () => {
    const { http, portal } = setup();
    const fixture = TestBed.createComponent(ChildSwitcher);
    const loading = portal.load();
    http.expectOne((r) => r.url === '/api/students').flush(list([child('a', 'Noor')]));
    await loading;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="button"]').length).toBe(
      0,
    );

    portal.children.set([child('a', 'Noor'), child('b', 'Zara')]);
    fixture.detectChanges();
    const names = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[role="button"]'),
    ).map((b) => b.textContent?.trim());
    expect(names).toEqual(['Noor', 'Zara']);
  });
});

describe('PortalHome', () => {
  it('shows attendance and what is owed for the chosen child, and the latest notices', async () => {
    const { http, portal } = setup();
    const fixture = TestBed.createComponent(PortalHome);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/notices')
      .flush({
        items: [
          {
            id: 'n',
            title: 'Sports day',
            body: 'On Monday',
            audience: 'ALL',
            classes: [],
            divisions: [],
            createdBy: { id: 'u', fullName: 'Asha Rao' },
            createdAt: '2026-11-08T10:00:00.000Z',
            expiresOn: null,
            expired: false,
            canChange: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 3,
      });
    http.expectOne((r) => r.url === '/api/students').flush(list([child('a', 'Noor')]));
    await fixture.whenStable();
    fixture.detectChanges();
    await portal.load();

    const attendance = { summary: { percent: 92.5 } } as StudentAttendance;
    const fees = { totals: { pending: '26200.50' } } as StudentLedger;
    http.expectOne('/api/attendance/students/a').flush(attendance);
    http.expectOne('/api/students/a/fees').flush(fees);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Noor Khan');
    expect(text).toContain('92.5%');
    expect(text).toContain('₹26,200.50');
    expect(text).toContain('Sports day');
  });

  it('stays calm when a number cannot be loaded', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(PortalHome);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/notices')
      .flush({ items: [], total: 0, page: 1, pageSize: 3 });
    http.expectOne((r) => r.url === '/api/students').flush(list([child('a', 'Noor')]));
    await fixture.whenStable();
    fixture.detectChanges();
    http
      .expectOne('/api/attendance/students/a')
      .flush('no', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/students/a/fees').flush('no', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Noor Khan');
  });
});
