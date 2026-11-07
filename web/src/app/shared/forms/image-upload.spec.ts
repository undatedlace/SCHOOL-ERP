import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import { ImageUpload } from './image-upload';

@Component({
  imports: [ReactiveFormsModule, ImageUpload],
  template: `<app-image-upload [formControl]="control" inputId="photo" />`,
})
class Host {
  control = new FormControl<string | null>(null);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
  const choose = (file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, http, choose, flush, host: fixture.componentInstance };
}

const png = (size = 10) => new File([new Uint8Array(size)], 'child.png', { type: 'image/png' });

describe('ImageUpload', () => {
  it('shows an empty box to start with', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.textContent).toContain('Click to add a photograph');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('shows the photo for an existing id', async () => {
    const { fixture, host, flush } = setup();
    host.control.setValue('file-1');
    await flush();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      '/api/files/file-1',
    );
  });

  it('uploads the chosen image and sets the control to the new file id', async () => {
    const { host, http, choose, flush } = setup();
    choose(png());
    const req = http.expectOne('/api/files');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('purpose')).toBe('application-photo');
    expect((body.get('file') as File).name).toBe('child.png');
    req.flush({ id: 'abc', mimeType: 'image/png', sizeBytes: 10 });
    await flush();

    expect(host.control.value).toBe('abc');
    expect(host.control.touched).toBe(true);
    http.verify();
  });

  it('refuses a file that is not an allowed image, without calling the server', async () => {
    const { fixture, host, http, choose, flush } = setup();
    choose(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    await flush();
    expect(fixture.nativeElement.textContent).toContain('Choose a JPEG, PNG or WebP image');
    expect(host.control.value).toBeNull();
    http.expectNone('/api/files');
  });

  it('refuses a file over 5 MB, without calling the server', async () => {
    const { fixture, http, choose, flush } = setup();
    choose(png(5 * 1024 * 1024 + 1));
    await flush();
    expect(fixture.nativeElement.textContent).toContain('smaller than 5 MB');
    http.expectNone('/api/files');
  });

  it("shows the server's message when the upload fails, and keeps the old photo", async () => {
    const { fixture, host, http, choose, flush } = setup();
    host.control.setValue('keep-me');
    await flush();
    choose(png());
    http
      .expectOne('/api/files')
      .flush(
        { message: 'Upload a JPEG, PNG or WebP image' },
        { status: 415, statusText: 'Unsupported' },
      );
    await flush();

    expect(fixture.nativeElement.textContent).toContain('Upload a JPEG, PNG or WebP image');
    expect(host.control.value).toBe('keep-me');
  });

  it('removes the photo', async () => {
    const { fixture, host, flush } = setup();
    host.control.setValue('file-1');
    await flush();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await flush();
    expect(host.control.value).toBeNull();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
