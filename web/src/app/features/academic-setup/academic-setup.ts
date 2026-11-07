import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TabsModule } from '@openng/optimus-ui/tabs';
import { PageHeader } from '../../shared/ui/page-header';
import { ClassesTab } from './classes-tab';
import { SubjectsTab } from './subjects-tab';
import { YearsTab } from './years-tab';

@Component({
  selector: 'app-academic-setup',
  imports: [TabsModule, PageHeader, YearsTab, ClassesTab, SubjectsTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Academic setup"
      subtitle="The school's structure: years, classes, divisions and subjects."
    />
    <p-tabs value="years">
      <p-tablist>
        <p-tab value="years">Academic years</p-tab>
        <p-tab value="classes">Classes and divisions</p-tab>
        <p-tab value="subjects">Subjects</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="years"><app-years-tab /></p-tabpanel>
        <p-tabpanel value="classes"><app-classes-tab /></p-tabpanel>
        <p-tabpanel value="subjects"><app-subjects-tab /></p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `,
})
export class AcademicSetup {}
