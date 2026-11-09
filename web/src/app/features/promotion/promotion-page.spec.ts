import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AcademicYear, PromotionPlan, PromotionStatus } from '../../core/models';
import { PromotionPage } from './promotion-page';

const years: AcademicYear[] = [
  {
    id: 'y2',
    name: '2027-28',
    startDate: '2027-04-01',
    endDate: '2028-03-31',
    isCurrent: false,
    ageCutoffDate: null,
  },
  {
    id: 'y1',
    name: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    isCurrent: true,
    ageCutoffDate: null,
  },
];
const status: PromotionStatus = {
  from: { id: 'y1', name: '2026-27' },
  to: { id: 'y2', name: '2027-28' },
  divisions: [
    { id: 'd1', name: 'A', class: { id: 'c1', name: 'Std 1' }, total: 3, done: 1, remaining: 2 },
    { id: 'd2', name: 'B', class: { id: 'c1', name: 'Std 1' }, total: 2, done: 2, remaining: 0 },
  ],
};
const plan: PromotionPlan = {
  from: status.from,
  to: status.to,
  division: { id: 'd1', name: 'A', class: { id: 'c1', name: 'Std 1' } },
  nextClass: { id: 'c2', name: 'Std 2', divisions: [{ id: 'e1', name: 'A' }] },
  sameClassDivisions: [{ id: 'd1', name: 'A' }],
  alreadyDone: 1,
  students: [
    {
      studentId: 's1',
      admissionNo: '1',
      name: 'Noor Khan',
      rollNo: null,
      suggested: { action: 'PROMOTE', divisionId: 'e1' },
    },
    {
      studentId: 's2',
      admissionNo: '2',
      name: 'Imran Shaikh',
      rollNo: null,
      suggested: { action: 'PROMOTE', divisionId: null },
    },
  ],
};

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
    ],
  });
  const fixture = TestBed.createComponent(PromotionPage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/academic-years').flush(years);
  await fixture.whenStable();
  http.expectOne((r) => r.url === '/api/promotion/status').flush(status);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').trim().startsWith(text),
  ) as HTMLButtonElement | undefined;

describe('PromotionPage', () => {
  it('chooses the current year and the one after it, and shows progress for each division', async () => {
    const { http, el } = await setup();
    const text = el.textContent ?? '';
    expect(text).toContain('Std 1-A');
    expect(text).toContain('1 of 3 dealt with');
    expect(text).toContain('All 2 dealt with');
    expect(button(el, 'Done')!.disabled).toBe(true);
    http.verify();
  });

  it('opens a division, leaves the unplaced student waiting, and sends the choices after confirming', async () => {
    const { fixture, http, el } = await setup();
    button(el, 'Open')!.click();
    const req = http.expectOne((r) => r.url === '/api/promotion/plan');
    expect(req.request.params.get('divisionId')).toBe('d1');
    req.flush(plan);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Noor Khan');
    expect(el.textContent).toContain('Choose a division for 1 more');
    expect(button(el, 'Move 2 students')!.disabled).toBe(true);

    // Imran leaves instead, so nothing is missing any more.
    const page = fixture.componentInstance as unknown as {
      setAction(p: PromotionPlan, id: string, a: 'LEFT'): void;
      confirmRun(p: PromotionPlan): void;
    };
    page.setAction(plan, 's2', 'LEFT');
    fixture.detectChanges();
    expect(button(el, 'Move 2 students')!.disabled).toBe(false);

    TestBed.inject(ConfirmationService).requireConfirmation$.subscribe((c) => c?.accept?.());
    page.confirmRun(plan);
    const run = http.expectOne((r) => r.method === 'POST' && r.url === '/api/promotion/run');
    expect(run.request.body).toEqual({
      fromAcademicYearId: 'y1',
      toAcademicYearId: 'y2',
      divisionId: 'd1',
      entries: [
        { studentId: 's1', action: 'PROMOTE', divisionId: 'e1' },
        { studentId: 's2', action: 'LEFT' },
      ],
    });
    run.flush({ promoted: 1, repeated: 0, left: 1, skipped: [] });
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/promotion/status').flush(status);
  });

  it('asks the school to set up next year when there is no later year', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
      ],
    });
    const fixture = TestBed.createComponent(PromotionPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/academic-years').flush([years[1]]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Set up next year');
  });
});
