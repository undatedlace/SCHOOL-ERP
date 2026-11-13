import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NAV_ENTRIES, visibleEntries } from '../../core/nav';
import { recentMonths } from './import-launchers';
import { ImportBatch } from './import-models';
import { ImportWizard } from './import-wizard';
import { ImportsHistory } from './imports-history';

const batch = (over: Partial<ImportBatch> = {}): ImportBatch => ({
  id: 'b1',
  slug: 'admissions',
  status: 'CHECKED',
  fileName: 'old-forms.xlsx',
  createdAt: '2026-11-13T05:00:00.000Z',
  importedAt: null,
  summary: { total: 3, ready: 2, withWarnings: 1, withErrors: 1, unchanged: 0 },
  rows: [
    {
      sheet: 'Applications',
      rowNumber: 3,
      label: 'Aarav Shah (form 12)',
      errors: [],
      warnings: ['Aarav Shah, born 01/05/2019, is already in the app'],
      unchanged: false,
      outcome: null,
    },
    {
      sheet: 'Applications',
      rowNumber: 4,
      label: 'Row 4',
      errors: ['Date of birth is required'],
      warnings: [],
      unchanged: false,
      outcome: null,
    },
    {
      sheet: 'Applications',
      rowNumber: 5,
      label: 'Zoya Khan',
      errors: [],
      warnings: [],
      unchanged: false,
      outcome: null,
    },
  ],
  ...over,
});

const buttons = () => Array.from(document.querySelectorAll('button'));
const button = (text: string) =>
  buttons().find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

describe('recentMonths', () => {
  it('lists months newest first, in India time', () => {
    // 31 Oct 2026, 20:00 UTC is already 1 Nov in India.
    const months = recentMonths(new Date('2026-10-31T20:00:00Z'), 3);
    expect(months).toEqual([
      { label: 'Nov 2026', value: '2026-11' },
      { label: 'Oct 2026', value: '2026-10' },
      { label: 'Sep 2026', value: '2026-09' },
    ]);
    expect(recentMonths(new Date('2026-01-15T00:00:00Z'), 2)[1].value).toBe('2025-12');
  });
});

describe('ImportWizard', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ImportWizard);
    fixture.componentRef.setInput('slug', 'admissions');
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const emitted: ImportBatch[] = [];
    fixture.componentInstance.imported.subscribe((b) => emitted.push(b));
    return { fixture, http, emitted };
  }

  it('checks the file first and shows what it found, row by row', async () => {
    const { fixture, http } = await setup();
    expect(document.body.textContent).toContain('Download the template');

    const file = new File(['x'], 'old-forms.xlsx');
    void (fixture.componentInstance as unknown as { upload(f: File): Promise<void> }).upload(file);
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/imports/admissions/check',
    );
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(batch());
    await fixture.whenStable();
    fixture.detectChanges();

    const text = document.body.textContent ?? '';
    expect(text).toContain('2 ready to import');
    expect(text).toContain('1 with errors (left out)');
    // Only the rows to look at are listed at first; the fine one is not.
    expect(text).toContain('Date of birth is required');
    expect(text).toContain('already in the app');
    expect(text).not.toContain('Zoya Khan');
    expect(button('Import 2 rows')?.disabled).toBe(false);
    expect(button('Download rows to fix')).toBeTruthy();
  });

  it('imports the rows that passed and tells the page', async () => {
    const { fixture, http, emitted } = await setup();
    void (fixture.componentInstance as unknown as { upload(f: File): Promise<void> }).upload(
      new File(['x'], 'a.xlsx'),
    );
    http.expectOne('/api/imports/admissions/check').flush(batch());
    await fixture.whenStable();
    fixture.detectChanges();

    button('Import 2 rows')!.click();
    const done = batch({
      status: 'IMPORTED',
      summary: {
        total: 3,
        ready: 2,
        withWarnings: 1,
        withErrors: 1,
        unchanged: 0,
        imported: 2,
        failed: 0,
      },
    });
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/imports/batches/b1/run')
      .flush(done);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('2 imported');
    expect(emitted).toHaveLength(1);
    expect(button('Done')).toBeTruthy();
  });

  it('says plainly when the file is refused', async () => {
    const { fixture, http } = await setup();
    void (fixture.componentInstance as unknown as { upload(f: File): Promise<void> }).upload(
      new File(['x'], 'a.csv'),
    );
    http
      .expectOne('/api/imports/admissions/check')
      .flush(
        { message: 'Upload the Excel file (.xlsx).' },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Upload the Excel file',
    );
  });
});

describe('ImportsHistory', () => {
  it('lists past imports with what went in and what needs fixing', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ImportsHistory);
    fixture.detectChanges();
    http.expectOne('/api/imports').flush([
      {
        id: 'b1',
        slug: 'fees',
        status: 'IMPORTED',
        fileName: 'fees-2025-26.xlsx',
        summary: {
          total: 40,
          ready: 38,
          withWarnings: 0,
          withErrors: 2,
          unchanged: 0,
          imported: 38,
          failed: 0,
        },
        createdAt: '2026-11-13T05:00:00.000Z',
        importedAt: '2026-11-13T05:01:00.000Z',
        createdBy: 'Accounts Office',
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Fees billed and paid');
    expect(text).toContain('38 imported');
    expect(text).toContain('2 to fix');
    expect(text).toContain('Imported');
  });
});

describe('Excel imports in the menu', () => {
  const pages = (perms: string[]) =>
    visibleEntries(NAV_ENTRIES, (p) => perms.includes(p)).flatMap((e) =>
      e.item ? [e.item.path] : (e.items ?? []).map((i) => i.path),
    );

  it('is shown to the people who bring data in, not to a teacher', () => {
    expect(pages(['admissions.manage'])).toContain('/app/settings/imports');
    expect(pages(['fees.structure.manage'])).toContain('/app/settings/imports');
    expect(pages(['attendance.mark'])).not.toContain('/app/settings/imports');
  });
});
