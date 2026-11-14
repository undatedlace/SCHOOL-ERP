import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { PersonRef } from './timetable-models';

/** Every current member of staff, a page at a time (the list API gives at most 100 a page). */
export async function loadAllStaff(api: Api): Promise<PersonRef[]> {
  const out: PersonRef[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await firstValueFrom(api.staffList({ page, pageSize: 100, status: 'ACTIVE' }));
    out.push(...res.items.map((s) => ({ id: s.id, fullName: s.fullName })));
    if (out.length >= res.total || res.items.length === 0) break;
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
}
