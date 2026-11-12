import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { AcademicYear } from '../../core/models';
import { FeesSetup } from './fees-setup';

const year = (id: string, name: string, start: string, isCurrent = false): AcademicYear => ({
  id,
  name,
  startDate: start,
  endDate: start.replace(/^(\d{4})-04-01$/, (_m, y) => `${Number(y) + 1}-03-31`),
  isCurrent,
  ageCutoffDate: null,
});

interface Internals {
  openCopy(): void;
  runCopy(): Promise<void>;
  copyFrom: () => string | null;
  copyResult: () => { copied: string[]; skipped: { class: string; reason: string }[] } | null;
}

// The tabs component measures itself; jsdom has no ResizeObserver.
const nothing = () => undefined;
class FakeResizeObserver {
  observe = nothing;
  unobserve = nothing;
  disconnect = nothing;
}
globalThis.ResizeObserver ??= FakeResizeObserver;

describe('FeesSetup: copying fees to a new year', () => {
  it('offers the latest earlier year, copies into the current one and shows what was left alone', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        MessageService,
      ],
    });
    const auth = TestBed.inject(AuthService);
    auth.clear();
    auth.me.set({
      id: 'u',
      fullName: 'U',
      roles: [],
      permissions: ['fees.read_all', 'fees.structure.manage'],
      mustChangePassword: false,
    });
    const fixture = TestBed.createComponent(FeesSetup);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/academic-years')
      .flush([
        year('y1', '2024-25', '2024-04-01'),
        year('y2', '2025-26', '2025-04-01'),
        year('y3', '2026-27', '2026-04-01', true),
      ]);
    http.expectOne('/api/classes').flush([]);
    http.expectOne('/api/fee-heads').flush([]);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne((r) => r.url === '/api/fee-structures').flush([]);
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as Internals;
    page.openCopy();
    expect(page.copyFrom()).toBe('y2'); // the most recent earlier year

    const copying = page.runCopy();
    const req = http.expectOne('/api/fee-structures/copy');
    expect(req.request.body).toEqual({ fromAcademicYearId: 'y2', toAcademicYearId: 'y3' });
    req.flush({
      from: '2025-26',
      to: '2026-27',
      copied: ['Std 1'],
      skipped: [{ class: 'Std 2', reason: 'Already has fees for 2026-27' }],
    });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne((r) => r.url === '/api/fee-structures').flush([]);
    await copying;
    expect(page.copyResult()?.copied).toEqual(['Std 1']);
    expect(page.copyResult()?.skipped[0].reason).toMatch(/Already has fees/);
  });
});
