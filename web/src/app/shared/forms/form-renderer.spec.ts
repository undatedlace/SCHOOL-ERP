import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FormSchema } from '../../core/models';
import { FormRenderer } from './form-renderer';

function render(schema: FormSchema) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(FormRenderer);
  fixture.componentRef.setInput('schema', schema);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FormRenderer layout', () => {
  const schema: FormSchema = {
    sections: [
      {
        id: 's',
        title: 'Admission',
        fields: [
          { id: 'cls', type: 'text', label: 'Class', width: 'half' },
          { id: 'p1', type: 'image', label: 'Child photo', width: 'quarter', newRow: true },
          { id: 'p2', type: 'image', label: 'Mother photo', width: 'quarter' },
        ],
      },
    ],
  };

  it('puts a field that starts on a new row in column 1, so it moves to the next row', () => {
    const cells = Array.from(render(schema).querySelectorAll('.grid > div')) as HTMLElement[];
    expect(cells).toHaveLength(3);
    expect(cells[0].className).not.toContain('col-start-1');
    expect(cells[1].className).toContain('col-start-1');
    expect(cells[2].className).not.toContain('col-start-1');
  });

  it("keeps each field's width as well", () => {
    const cells = Array.from(render(schema).querySelectorAll('.grid > div')) as HTMLElement[];
    expect(cells[0].className).toContain('sm:col-span-6');
    expect(cells[1].className).toContain('lg:col-span-3');
  });

  describe('the age limits table', () => {
    const limitsSchema: FormSchema = {
      sections: [
        {
          id: 'a',
          title: 'Age limits',
          fields: [{ id: 'limits', type: 'ageLimits', label: 'Age limits' }],
        },
      ],
    };
    const classes = [
      { id: '2', name: 'Junior KG', sortOrder: 2, minAgeYears: 4, admissionsOpen: true },
      { id: '1', name: 'Nursery', sortOrder: 1, minAgeYears: 3, admissionsOpen: true },
      { id: '9', name: 'Std 5', sortOrder: 9, minAgeYears: null, admissionsOpen: true },
      { id: '3', name: 'Std 1', sortOrder: 3, minAgeYears: 1, admissionsOpen: false },
    ];

    function renderLimits(withClasses: typeof classes, asOn: string | null = null) {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(FormRenderer);
      fixture.componentRef.setInput('schema', limitsSchema);
      fixture.componentRef.setInput('classes', withClasses);
      fixture.componentRef.setInput('ageAsOn', asOn);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it("lists the classes that have a minimum age, in the school's order", () => {
      const rows = Array.from(renderLimits(classes).querySelectorAll('tbody tr')).map((r) =>
        r.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(rows).toEqual(['Nursery 3 years', 'Junior KG 4 years', 'Std 1 1 year (not open)']);
    });

    it('leaves out classes with no age rule, and says when the age is counted', () => {
      const html = renderLimits(classes, '31 Jul 2026');
      expect(html.textContent).not.toContain('Std 5');
      expect(html.textContent).toContain('Age is counted as on 31 Jul 2026.');
    });

    it('explains when no age limits are set yet, and has nothing to fill in', () => {
      const html = renderLimits([
        { id: '9', name: 'Std 5', sortOrder: 9, minAgeYears: null, admissionsOpen: true },
      ]);
      expect(html.textContent).toContain('No age limits have been set yet');
      expect(html.querySelector('input, select, textarea')).toBeNull();
    });
  });
});

describe('FormRenderer answers to check (filled from photos)', () => {
  it('outlines a field to check and says what was read, leaving others alone', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('schema', {
      sections: [
        {
          id: 's',
          title: 'Student',
          fields: [
            { id: 'surname', type: 'text', label: 'Surname' },
            { id: 'religion', type: 'text', label: 'Religion' },
          ],
        },
      ],
    } satisfies FormSchema);
    fixture.componentRef.setInput('value', { surname: 'MEMON', religion: 'Muslim' });
    fixture.componentRef.setInput('review', {
      surname: { confidence: 0.4, read: 'MEMDN', note: 'Read with low confidence' },
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const outlined = el.querySelectorAll('.ring-amber');
    expect(outlined).toHaveLength(1);
    expect(outlined[0].textContent).toContain('Surname');
    expect(outlined[0].textContent).toContain('read as “MEMDN”');
    expect((el.querySelector('#f_surname') as HTMLInputElement).value).toBe('MEMON');
  });
});
