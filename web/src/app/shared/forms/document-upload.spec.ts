import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DocumentUpload } from './document-upload';

@Component({
  imports: [ReactiveFormsModule, DocumentUpload],
  template: `<app-document-upload [formControl]="control" inputId="doc" label="Identity proof" />`,
})
class Host {
  control = new FormControl<string | null>(null);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const choose = (file: File) => {
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, http, el, choose, settle, host: fixture.componentInstance };
}

const pdf = (size = 10) => new File([new Uint8Array(size)], 'id.pdf', { type: 'application/pdf' });

describe('DocumentUpload', () => {
  it('starts empty, with a clear way to choose a file', () => {
    const { el } = setup();
    expect(el.textContent).toContain('Choose a PDF or photo');
    expect(el.querySelector('a')).toBeNull();
  });

  it('uploads a PDF for the staff document purpose and holds the file id', async () => {
    const { http, el, choose, settle, host } = setup();
    choose(pdf());
    const req = http.expectOne('/api/files');
    expect((req.request.body as FormData).get('purpose')).toBe('staff-document');
    req.flush({ id: 'f1' });
    await settle();
    expect(host.control.value).toBe('f1');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/api/files/f1');
    expect(el.textContent).toContain('Replace file');
  });

  it('refuses other kinds of file and oversized files without asking the server', async () => {
    const { http, el, choose, settle } = setup();
    choose(new File(['x'], 'run.exe', { type: 'application/x-msdownload' }));
    await settle();
    expect(el.textContent).toContain('Choose a PDF, or a JPEG, PNG or WebP photograph.');
    choose(pdf(10 * 1024 * 1024 + 1));
    await settle();
    expect(el.textContent).toContain('smaller than 10 MB');
    http.expectNone('/api/files');
  });

  it('shows the server message when an upload is refused, and can remove the file', async () => {
    const { http, el, choose, settle, host } = setup();
    choose(pdf());
    http
      .expectOne('/api/files')
      .flush({ message: 'That PDF is not safe' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('not safe');
    expect(host.control.value).toBeNull();

    choose(pdf());
    http.expectOne('/api/files').flush({ id: 'f2' });
    await settle();
    (
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Remove',
      ) as HTMLButtonElement
    ).click();
    await settle();
    expect(host.control.value).toBeNull();
  });
});
