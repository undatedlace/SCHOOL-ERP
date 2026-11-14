import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  DayView,
  DivisionOption,
  DivisionWeek,
  EntryInput,
  FreeTeachers,
  GenerateInput,
  Schedule,
  Slot,
  StaffWeek,
  TimingsList,
} from './timetable-models';

const week = (weekOf?: string) =>
  weekOf ? new HttpParams().set('weekOf', weekOf) : new HttpParams();

/** The timetable API (/api/timetable/...). */
@Injectable({ providedIn: 'root' })
export class TimetableApi {
  private readonly http = inject(HttpClient);

  // Timings
  timings = () => this.http.get<TimingsList>('/api/timetable/schedules');
  preview = (body: GenerateInput) =>
    this.http.post<{ slots: Slot[] }>('/api/timetable/schedules/preview', body);
  createSchedule = (body: { name: string; copyFromId?: string }) =>
    this.http.post<Schedule>('/api/timetable/schedules', body);
  updateSchedule = (id: string, body: { name?: string; active?: boolean }) =>
    this.http.patch<Schedule>(`/api/timetable/schedules/${id}`, body);
  deleteSchedule = (id: string) => this.http.delete<void>(`/api/timetable/schedules/${id}`);
  saveSlots = (id: string, slots: Slot[]) =>
    this.http.put<Schedule>(`/api/timetable/schedules/${id}/slots`, { slots });
  setClassSchedules = (classes: { classId: string; scheduleId: string | null }[]) =>
    this.http.put<TimingsList>('/api/timetable/class-schedules', { classes });

  // The week
  divisions = () => this.http.get<DivisionOption[]>('/api/timetable/divisions');
  divisionWeek = (id: string, weekOf?: string) =>
    this.http.get<DivisionWeek>(`/api/timetable/divisions/${id}`, { params: week(weekOf) });
  staffWeek = (id: string, weekOf?: string) =>
    this.http.get<StaffWeek>(`/api/timetable/staff/${id}`, { params: week(weekOf) });
  mine = (weekOf?: string) =>
    this.http.get<StaffWeek>('/api/timetable/mine', { params: week(weekOf) });
  setEntries = (divisionId: string, entries: EntryInput[]) =>
    this.http.put<DivisionWeek>(`/api/timetable/divisions/${divisionId}/entries`, { entries });
  clearDivision = (divisionId: string) =>
    this.http.delete<{ cleared: number }>(`/api/timetable/divisions/${divisionId}/entries`);
  reassign = (body: {
    divisionId: string;
    subjectId: string;
    fromStaffId: string;
    toStaffId: string;
    alsoSubjectTeacher: boolean;
  }) => this.http.post<{ moved: number; view: DivisionWeek }>('/api/timetable/reassign', body);
  copy = (fromAcademicYearId: string) =>
    this.http.post<{
      from: string;
      to: string;
      schedules: number;
      lessons: number;
      withoutTeacher: string[];
    }>('/api/timetable/copy', { fromAcademicYearId });

  // One day
  day = (date: string) =>
    this.http.get<DayView>('/api/timetable/day', { params: new HttpParams().set('date', date) });
  freeTeachers = (date: string, divisionId: string, slotId: string) =>
    this.http.get<FreeTeachers>('/api/timetable/free-teachers', {
      params: new HttpParams()
        .set('date', date)
        .set('divisionId', divisionId)
        .set('slotId', slotId),
    });
  addChange = (body: {
    date: string;
    divisionId: string;
    slotId: string;
    kind: 'SUBSTITUTE' | 'CANCELLED';
    substituteStaffId?: string;
    reason: string;
  }) => this.http.post<{ id: string }>('/api/timetable/adjustments', body);
  removeChange = (id: string) => this.http.delete<void>(`/api/timetable/adjustments/${id}`);
}
