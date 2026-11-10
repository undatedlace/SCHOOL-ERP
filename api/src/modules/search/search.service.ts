import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import { ListApplicationsQueryDto } from '../admissions/dto/admissions.dto.js';
import { ListStaffQueryDto } from '../staff/dto/staff.dto.js';
import { StaffService } from '../staff/staff.service.js';
import { ListStudentsQueryDto } from '../students/dto/students.dto.js';
import { StudentsService } from '../students/students.service.js';

export const MIN_QUERY = 2;
export const MAX_PER_GROUP = 8;

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  /** Where the web app opens it. */
  path: string;
}

export interface SearchGroup {
  type: 'students' | 'staff' | 'applications';
  label: string;
  hits: SearchHit[];
  /** More matches exist than are shown. */
  more: boolean;
}

/** A page query with only what a search needs, so the other modules apply their own defaults. */
const page = <T extends object>(base: T, search: string, limit: number): T =>
  Object.assign(base, { search, page: 1, pageSize: limit });

/**
 * One search box over everything a person may see. It asks each module through that module's own list,
 * so the scope rules (a parent sees only their children, a teacher only what teachers may) are the same
 * as on the list screens and a search can never reveal what a list would hide.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly students: StudentsService,
    private readonly staff: StaffService,
    private readonly admissions: AdmissionsService,
  ) {}

  async search(
    auth: AuthContext,
    rawQuery: string,
    limit = 5,
  ): Promise<{ query: string; groups: SearchGroup[] }> {
    const q = rawQuery.trim();
    if (q.length < MIN_QUERY) return { query: q, groups: [] };
    const n = Math.min(Math.max(limit, 1), MAX_PER_GROUP);
    const can = (p: string) => auth.permissions.includes(p);

    const [students, staff, applications] = await Promise.all([
      can('students.read')
        ? this.students.list(auth, page(new ListStudentsQueryDto(), q, n))
        : null,
      can('staff.read')
        ? this.staff.list(auth, page(new ListStaffQueryDto(), q, n))
        : null,
      can('admissions.read')
        ? this.admissions.list(
            auth.schoolId,
            page(new ListApplicationsQueryDto(), q, n),
          )
        : null,
    ]);

    const groups: SearchGroup[] = [];
    if (students && students.items.length) {
      groups.push({
        type: 'students',
        label: 'Students',
        more: students.total > students.items.length,
        hits: students.items.map((s) => ({
          id: s.id,
          title: s.fullName,
          subtitle: [
            `No. ${s.admissionNo}`,
            s.current
              ? `${s.current.class.name}-${s.current.division.name}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
          path: `/app/students/${s.id}`,
        })),
      });
    }
    if (staff && staff.items.length) {
      groups.push({
        type: 'staff',
        label: 'Staff',
        more: staff.total > staff.items.length,
        hits: staff.items.map((s) => ({
          id: s.id,
          title: s.fullName,
          subtitle: `${s.designation} · No. ${s.employeeNo}`,
          path: `/app/staff/${s.id}`,
        })),
      });
    }
    if (applications && applications.items.length) {
      groups.push({
        type: 'applications',
        label: 'Applications',
        more: applications.total > applications.items.length,
        hits: applications.items.map((a) => ({
          id: a.id,
          title: a.studentName,
          subtitle: `Form ${a.formNo} · ${a.status.replace('_', ' ').toLowerCase()}`,
          path: `/app/admissions/${a.id}`,
        })),
      });
    }
    return { query: q, groups };
  }
}
