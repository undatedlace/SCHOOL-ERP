import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { Homework, HomeworkSubmission } from '../../core/models';
import { HandInsDialog } from './hand-ins-dialog';
import { HomeworkCard } from './homework-card';

const sub = (over: Partial<HomeworkSubmission> = {}): HomeworkSubmission => ({
  id: 'sub1',
  studentId: 'st1',
  status: 'SUBMITTED',
  note: 'Done',
  submittedAt: '2026-11-11T08:00:00Z',
  late: false,
  files: [],
  marks: null,
  feedback: null,
  reviewedAt: null,
  ...over,
});
const hw = (over: Partial<Homework> = {}): Homework => ({
  id: 'h1',
  title: 'Chapter 3',
  instructions: 'Do it',
  subject: null,
  dueOn: '2099-06-01',
  overdue: false,
  createdBy: { id: 'u1', fullName: 'Asha Rao' },
  createdAt: '2026-11-10T10:00:00Z',
  divisions: [{ id: 'd1', label: 'Std 1-A' }],
  students: [],
  forChildren: ['Noor Khan'],
  canChange: false,
  handIn: true,
  maxMarks: '10',
  attachments: [{ id: 'f1', name: 'worksheet.pdf', mimeType: 'application/pdf', sizeBytes: 2048 }],
  children: [{ studentId: 'st1', name: 'Noor Khan', submission: null }],
  ...over,
});

function setup() {
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

describe('homework attachments and hand-in on the card', () => {
  function render(h: Homework) {
    const http = setup();
    const fixture = TestBed.createComponent(HomeworkCard);
    fixture.componentRef.setInput('homework', h);
    fixture.componentRef.setInput('forFamily', true);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('links the teacher worksheet to the homework file route', () => {
    const { el } = render(hw());
    const link = el.querySelector('a[href="/api/homework/h1/files/f1"]');
    expect(link?.textContent).toContain('worksheet.pdf');
    expect(el.textContent).toContain('Hand in through the app');
    expect(el.textContent).toContain('Out of 10');
  });

  it('shows "Not handed in" with a form, and hands in a note', async () => {
    const { fixture, http, el } = render(hw());
    expect(el.textContent).toContain('Not handed in');
    const handInButton = fixture.debugElement
      .queryAll(By.css('p-button'))
      .find((b) => b.nativeElement.textContent.includes('Hand in'))!;
    expect(handInButton.componentInstance.disabled).toBe(true);

    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'All done';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(handInButton.componentInstance.disabled).toBe(false);

    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    handInButton.componentInstance.onClick.emit(new Event('click'));
    const req = http.expectOne('/api/homework/h1/students/st1/hand-in');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ note: 'All done', fileIds: [] });
    req.flush(sub({ note: 'All done' }));
    await settle(fixture);
    expect(changed).toBe(1);
  });

  it('shows the marks and comment once marked, and no form', () => {
    const { el } = render(
      hw({
        children: [
          {
            studentId: 'st1',
            name: 'Noor Khan',
            submission: sub({ status: 'REVIEWED', marks: '8.5', feedback: 'Neat work' }),
          },
        ],
      }),
    );
    expect(el.textContent).toContain('Marked');
    expect(el.textContent).toContain('8.5 / 10');
    expect(el.textContent).toContain('Neat work');
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('says what to redo when sent back, and offers the form again', () => {
    const { el } = render(
      hw({
        children: [
          {
            studentId: 'st1',
            name: 'Noor Khan',
            submission: sub({ status: 'REDO', feedback: 'Show steps' }),
          },
        ],
      }),
    );
    expect(el.textContent).toContain('Please do again');
    expect(el.textContent).toContain('Show steps');
    expect(el.querySelector('textarea')).not.toBeNull();
  });

  it('has no hand-in section for a staff view or homework without hand-in', () => {
    setup();
    const fixture = TestBed.createComponent(HomeworkCard);
    fixture.componentRef.setInput('homework', hw({ handIn: false }));
    fixture.componentRef.setInput('forFamily', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('textarea')).toBeNull();
  });
});

describe('HandInsDialog', () => {
  const roster = {
    handIn: true,
    maxMarks: '10',
    counts: { students: 2, handedIn: 1, marked: 0 },
    students: [
      {
        studentId: 'st1',
        name: 'Noor Khan',
        admissionNo: '1',
        division: 'Std 1-A',
        submission: sub({ note: 'Here it is' }),
      },
      {
        studentId: 'st2',
        name: 'Zara Ali',
        admissionNo: '2',
        division: 'Std 1-A',
        submission: null,
      },
    ],
  };

  it('lists who has and has not handed in, and sends a mark with a comment', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(HandInsDialog);
    fixture.componentRef.setInput('homework', hw());
    fixture.detectChanges();
    http.expectOne('/api/homework/h1/hand-ins').flush(roster);
    await settle(fixture);

    const text = document.body.textContent ?? '';
    expect(text).toContain('1 of 2 handed in');
    expect(text).toContain('Not handed in');
    expect(text).toContain('Here it is');

    const marks = fixture.debugElement.query(By.css('p-inputnumber'));
    marks.triggerEventHandler('ngModelChange', 9);
    const comment = document.body.querySelector(
      'input[aria-label="Comment for Noor Khan"]',
    ) as HTMLInputElement;
    comment.value = 'Good';
    comment.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const mark = fixture.debugElement
      .queryAll(By.css('p-button'))
      .find((b) => b.componentInstance.label === 'Mark')!;
    mark.componentInstance.onClick.emit(new Event('click'));
    const req = http.expectOne('/api/homework/h1/students/st1/review');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'REVIEWED', marks: 9, feedback: 'Good' });
    req.flush(sub({ status: 'REVIEWED', marks: '9', feedback: 'Good' }));
    await settle(fixture);
    http.expectOne('/api/homework/h1/hand-ins').flush(roster);
    fixture.destroy();
  });
});
