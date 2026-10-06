import { hardFilterLabels } from '@minnow/core';

type Snapshot = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value : '';
export const searchTitle = (snapshot: Snapshot) => text(snapshot.role) || 'Search';
// One line describing what was searched: place, work mode, experience and a count of other filters.
export function searchSummary(snapshot: Snapshot) {
  const filters = (snapshot.filters ?? {}) as Record<string, unknown>;
  const experience = (filters.experience as { band?: string } | undefined)?.band;
  const parts = [text(snapshot.location_label), text(snapshot.work_mode) !== 'any' ? text(snapshot.work_mode) : '', experience && experience !== 'any' ? `experience ${experience}` : '',
    text(filters.employmentType) && filters.employmentType !== 'any' ? text(filters.employmentType).replace('_', ' ') : '', snapshot.deep === true ? 'Deep Search' : ''];
  return parts.filter(Boolean).join(' · ') || 'No extra filters';
}
// "Work mode removed 12" lines from a finished search, ignoring the always-on role match.
export function dropLines(snapshot: Snapshot) {
  return Object.entries((snapshot.hard_filter_drops ?? {}) as Record<string, number>).filter(([key]) => key !== 'role').map(([key, count]) => `${hardFilterLabels[key] ?? key} removed ${count}`);
}
