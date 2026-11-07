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
});
