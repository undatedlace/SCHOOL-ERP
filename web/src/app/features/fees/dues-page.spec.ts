import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { DuesReport } from '../../core/models';
import { DuesPage } from './dues-page';

const sums = { billed: '3000.00', collected: '1250.50', pending: '1749.50', overdue: '1749.50' };
const report: DuesReport = {
  academicYearId: 'y',
  totals: { students: 3, owing: 2, ...sums },
  byClass: [{ id: 'c1', label: 'Nursery', students: 3, owing: 2, ...sums }],
  byDivision: [{ id: 'd1', label: 'Nursery-A', students: 3, owing: 2, ...sums }],
  students: {
    items: [
      {
        studentId: 's1',
        admissionNo: '7',
        fullName: 'Noor Khan',
        class: 'Nursery',
        division: 'A',
        billed: '1000.00',
        collected: '0.00',
        pending: '1000.00',
        overdue: '1000.00',
        previousYearsPending: '200.00',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  },
};

describe('DuesPage', () => {
  it('shows totals, divisions under their class, and who owes what', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
      ],
    });
    const fixture = TestBed.createComponent(DuesPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/classes').flush([]);
    http.expectOne((r) => r.url === '/api/fees/dues').flush(report);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('₹1,749.50');
    expect(text).toContain('2 of 3');
    expect(text).toContain('Nursery-A');
    expect(text).toContain('Noor Khan');
    expect(text).toContain('₹200.00'); // from earlier years
  });
});
