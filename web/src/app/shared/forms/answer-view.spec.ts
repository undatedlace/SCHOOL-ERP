import { TestBed } from '@angular/core/testing';
import { FormSchema } from '../../core/models';
import { AnswerView } from './answer-view';

const schema: FormSchema = {
  sections: [
    {
      id: 's',
      title: 'Documents',
      fields: [
        { id: 'idProof', type: 'document', label: 'Identity proof' },
        { id: 'subjects', type: 'text', label: 'Subjects taught' },
      ],
    },
  ],
};

describe('AnswerView documents', () => {
  it('shows a document as an Open link to the private file, never inline', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(AnswerView);
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('answers', { idProof: 'f1', subjects: 'Maths' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a[aria-label="Open Identity proof"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/files/f1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('Maths');
  });
});
