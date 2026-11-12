import { TestBed } from '@angular/core/testing';
import { FormSchema } from '../../core/models';
import { PapersChecklist, papersFor } from './papers-checklist';

const schema: FormSchema = {
  sections: [
    {
      id: 'a',
      title: 'Details',
      fields: [{ id: 'subjects', type: 'text', label: 'Subjects taught' }],
    },
    {
      id: 'docs',
      title: 'Documents',
      fields: [
        { id: 'idProof', type: 'document', label: 'Identity proof' },
        { id: 'addressProof', type: 'document', label: 'Address proof' },
        { id: 'police', type: 'document', label: 'Police verification certificate' },
      ],
    },
  ],
};

describe('papersFor', () => {
  it('lists only the document questions and marks the uploaded ones', () => {
    expect(papersFor(schema, { idProof: 'f1', subjects: 'Maths' })).toEqual([
      { id: 'idProof', label: 'Identity proof', received: true },
      { id: 'addressProof', label: 'Address proof', received: false },
      { id: 'police', label: 'Police verification certificate', received: false },
    ]);
  });

  it('treats an empty answer as missing', () => {
    expect(papersFor(schema, { idProof: '' })[0].received).toBe(false);
  });

  it('is empty for a form with no documents', () => {
    expect(papersFor({ sections: [schema.sections[0]] }, {})).toEqual([]);
  });
});

describe('PapersChecklist', () => {
  const render = (answers: Record<string, unknown>, s: FormSchema = schema) => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(PapersChecklist);
    fixture.componentRef.setInput('schema', s);
    fixture.componentRef.setInput('answers', answers);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('says how many are in and names the missing ones in words', () => {
    const el = render({ idProof: 'f1' });
    expect(el.textContent).toContain('1 of 3 papers received');
    expect(el.textContent).toContain('Address proof');
    expect(el.textContent).toContain('Police verification certificate');
    expect(el.textContent).not.toContain('Identity proof');
    const bar = el.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('3');
  });

  it('says nothing is missing when all are in', () => {
    const el = render({ idProof: 'a', addressProof: 'b', police: 'c' });
    expect(el.textContent).toContain('3 of 3 papers received');
    expect(el.textContent).toContain('nothing is missing');
    expect(el.textContent).not.toContain('Still missing');
  });

  it('shows nothing for a form without documents', () => {
    const el = render({}, { sections: [schema.sections[0]] });
    expect(el.textContent?.trim()).toBe('');
  });
});
