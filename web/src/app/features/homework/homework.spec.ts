import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { Homework } from '../../core/models';
import { DateField } from '../../shared/ui/date-field';
import { HomeworkCard } from './homework-card';
import { HomeworkPage } from './homework-page';
import { PortalHomework } from './portal-homework';

const hw = (over: Partial<Homework> = {}): Homework => ({
  id: 'h1',
  title: 'Chapter 3',
  instructions: 'Do exercise 3.2\nand 3.3',
  subject: { id: 's1', name: 'Maths' },
  dueOn: '2099-06-01',
  overdue: false,
  createdBy: { id: 'u1', fullName: 'Asha Rao' },
  createdAt: '2026-11-10T10:00:00Z',
  divisions: [{ id: 'd1', label: 'Std 1-A' }],
  students: [],
  forChildren: [],
  canChange: true,
  ...over,
});
const page = (items: Homework[]) => ({ items, total: items.length, page: 1, pageSize: 50 });

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
const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
};

describe('HomeworkCard', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  function render(h: Homework, forFamily = false) {
    const fixture = TestBed.createComponent(HomeworkCard);
    fixture.componentRef.setInput('homework', h);
    fixture.componentRef.setInput('forFamily', forFamily);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  it('shows instructions exactly as written, never as HTML', () => {
    const el = render(hw({ instructions: '<img src=x onerror=alert(1)> <b>bold</b>' }));
    expect(el.textContent).toContain('<b>bold</b>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
  });
  it('marks overdue homework, and says who it is for', () => {
    const el = render(hw({ overdue: true, dueOn: '2020-01-01' }));
    expect(el.textContent).toContain('Was due');
    expect(el.textContent).toContain('For: Std 1-A');
    const family = render(hw({ forChildren: ['Noor Khan'] }), true);
    expect(family.textContent).toContain('For: Noor Khan');
    expect(family.textContent).not.toContain('Std 1-A');
  });
});

describe('PortalHomework', () => {
  it('lists what is still open for the family, with the child it is for, and can show everything', async () => {
    const http = providers();
    const fixture = TestBed.createComponent(PortalHomework);
    fixture.detectChanges();
    const first = http.expectOne((r) => r.url === '/api/homework');
    expect(first.request.params.get('status')).toBe('open');
    first.flush(page([hw({ forChildren: ['Noor Khan'], canChange: false })]));
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Chapter 3');
    expect(el.textContent).toContain('For: Noor Khan');
    expect(el.textContent).not.toContain('Change');
    (
      Array.from(el.querySelectorAll('[role="tab"]')).find((b) =>
        b.textContent?.includes('Everything'),
      ) as HTMLButtonElement
    ).click();
    const second = http.expectOne((r) => r.url === '/api/homework');
    expect(second.request.params.get('status')).toBe('all');
    second.flush(page([]));
    await settle(fixture);
    expect(el.textContent).toContain('No homework right now.');
  });
});

describe('HomeworkPage', () => {
  async function setup(items: Homework[] = [hw()]) {
    const http = providers();
    const fixture = TestBed.createComponent(HomeworkPage);
    fixture.detectChanges();
    http.expectOne('/api/homework/audiences').flush({
      divisions: [
        { id: 'd1', classId: 'c1', label: 'Std 1-A' },
        { id: 'd2', classId: 'c1', label: 'Std 1-B' },
      ],
    });
    http.expectOne('/api/subjects').flush([{ id: 's1', name: 'Maths' }]);
    http.expectOne((r) => r.url === '/api/homework').flush(page(items));
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }
  const clickText = (text: string, root: ParentNode = document) =>
    (
      Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
      ) as HTMLButtonElement
    ).click();

  it('lists what the teacher set, with Change and Remove for their own', async () => {
    const { el } = await setup([hw(), hw({ id: 'h2', title: 'Not mine', canChange: false })]);
    expect(el.textContent).toContain('Chapter 3');
    expect(el.querySelector('button[aria-label="Change Chapter 3"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Change Not mine"]')).toBeNull();
  });

  it('sets homework for chosen divisions and sends it to the API', async () => {
    const { fixture, http, el } = await setup([]);
    clickText('Set homework', el);
    fixture.detectChanges();
    expect(
      Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Send to families')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    const title = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    title.value = 'Chapter 5';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const text = document.querySelector(
      'textarea[aria-label="Instructions"]',
    ) as HTMLTextAreaElement;
    text.value = 'Read it';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.debugElement
      .query(By.css('p-multiselect'))
      .triggerEventHandler('ngModelChange', ['d1']);
    fixture.debugElement
      .queryAll(By.directive(DateField))[0]
      .componentInstance.valueChange.emit('2099-06-01');
    fixture.detectChanges();
    clickText('Send to families');
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/homework');
    expect(req.request.body).toEqual({
      title: 'Chapter 5',
      instructions: 'Read it',
      dueOn: '2099-06-01',
      divisionIds: ['d1'],
    });
    req.flush(hw());
    await settle(fixture);
    http.expectOne((r) => r.url === '/api/homework').flush(page([]));
    await settle(fixture);
  });

  it('can be set for individual students of a division', async () => {
    const { fixture, http, el } = await setup([]);
    clickText('Set homework', el);
    fixture.detectChanges();
    fixture.debugElement
      .query(By.css('p-selectbutton'))
      .triggerEventHandler('ngModelChange', 'students');
    fixture.detectChanges();
    const selects = () => fixture.debugElement.queryAll(By.css('p-select'));
    // The two filters come first, then the subject, then the division of the students.
    selects()[3].triggerEventHandler('ngModelChange', 'd1');
    http
      .expectOne((r) => r.url === '/api/students' && r.params.get('divisionId') === 'd1')
      .flush({
        items: [{ id: 'k1', fullName: 'Noor Khan' }],
        total: 1,
        page: 1,
        pageSize: 100,
      });
    await settle(fixture);
    fixture.debugElement
      .queryAll(By.css('p-multiselect'))[0]
      .triggerEventHandler('ngModelChange', ['k1']);
    const title = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    title.value = 'Extra practice';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const text = document.querySelector(
      'textarea[aria-label="Instructions"]',
    ) as HTMLTextAreaElement;
    text.value = 'Page 10';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    clickText('Send to families');
    const req = http.expectOne((r) => r.method === 'POST');
    expect(req.request.body.studentIds).toEqual(['k1']);
    expect(req.request.body.divisionIds).toBeUndefined();
    req.flush(hw());
    await settle(fixture);
    http.expectOne((r) => r.url === '/api/homework').flush(page([]));
  });

  it('shows the server message when it is refused', async () => {
    const { fixture, http, el } = await setup([]);
    clickText('Set homework', el);
    fixture.detectChanges();
    const title = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    title.value = 'Chapter 5';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const text = document.querySelector(
      'textarea[aria-label="Instructions"]',
    ) as HTMLTextAreaElement;
    text.value = 'Read it';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.debugElement
      .query(By.css('p-multiselect'))
      .triggerEventHandler('ngModelChange', ['d2']);
    fixture.detectChanges();
    clickText('Send to families');
    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        { message: 'You can set homework only for the divisions you teach' },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle(fixture);
    expect(document.body.textContent).toContain('only for the divisions you teach');
  });

  it('removes homework after confirming', async () => {
    const { fixture, http, el } = await setup();
    const confirm = TestBed.inject(ConfirmationService);
    vi.spyOn(confirm, 'confirm').mockImplementation((c) => {
      void c.accept?.();
      return confirm;
    });
    (el.querySelector('button[aria-label="Remove Chapter 3"]') as HTMLButtonElement).click();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === '/api/homework/h1')
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    http.expectOne((r) => r.url === '/api/homework').flush(page([]));
  });
});
