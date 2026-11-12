import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppInfo, EnvBanner } from './env-banner';

describe('EnvBanner', () => {
  async function setup(info: AppInfo | 'error') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EnvBanner);
    fixture.detectChanges();
    const req = http.expectOne('/api/app-info');
    if (info === 'error') req.flush('down', { status: 502, statusText: 'Bad Gateway' });
    else req.flush(info);
    await fixture.whenStable();
    fixture.detectChanges();
    http.verify();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing in production', async () => {
    const el = await setup({ environmentLabel: null, feedbackUrl: null });
    expect(el.textContent?.trim()).toBe('');
  });

  it('shows nothing when the server cannot be asked', async () => {
    const el = await setup('error');
    expect(el.textContent?.trim()).toBe('');
  });

  it('on a test copy, says the data is not real and links to the feedback form', async () => {
    const el = await setup({
      environmentLabel: 'Test environment',
      feedbackUrl: 'https://forms.gle/abc',
    });
    expect(el.querySelector('[role="note"]')?.textContent).toContain(
      'Test environment: sample data only',
    );
    const link = el.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://forms.gle/abc');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('leaves out the link when there is no form', async () => {
    const el = await setup({ environmentLabel: 'Test environment', feedbackUrl: null });
    expect(el.querySelector('[role="note"]')).not.toBeNull();
    expect(el.querySelector('a')).toBeNull();
  });
});
