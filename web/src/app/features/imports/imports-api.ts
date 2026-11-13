import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ImportBatch, ImportListItem, ImportSlug, SingleFees } from './import-models';

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

/** The file name the server gave in Content-Disposition, or a fallback. */
function fileNameOf(res: HttpResponse<Blob>, fallback: string): string {
  const header = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

/** Excel templates and imports. Kept beside the feature so the shared API client stays as it is. */
@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly http = inject(HttpClient);

  private download(url: string, params: HttpParams, fallback: string): Observable<DownloadedFile> {
    return this.http
      .get(url, { params, responseType: 'blob', observe: 'response' })
      .pipe(map((res) => ({ blob: res.body ?? new Blob(), fileName: fileNameOf(res, fallback) })));
  }

  template = (slug: ImportSlug, query: Record<string, string | undefined> = {}) => {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) if (v) params = params.set(k, v);
    return this.download(`/api/imports/${slug}/template`, params, `${slug}-template.xlsx`);
  };

  check = (slug: ImportSlug, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ImportBatch>(`/api/imports/${slug}/check`, body);
  };

  get = (id: string) => this.http.get<ImportBatch>(`/api/imports/batches/${id}`);
  run = (id: string) => this.http.post<ImportBatch>(`/api/imports/batches/${id}/run`, {});
  cancel = (id: string) => this.http.delete<void>(`/api/imports/batches/${id}`);
  problems = (id: string) =>
    this.download(`/api/imports/batches/${id}/problems`, new HttpParams(), 'rows-to-fix.xlsx');
  list = (slug?: ImportSlug) =>
    this.http.get<ImportListItem[]>('/api/imports', {
      params: slug ? new HttpParams().set('kind', slug) : new HttpParams(),
    });
  singleFees = (body: SingleFees) =>
    this.http.post<{ warnings: string[] }>('/api/imports/fees/single', body);
}

/** Hands a downloaded file to the browser to save. */
export function saveFile(file: DownloadedFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
