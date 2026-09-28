import {
  discoverFits,
  type DiscoverData,
  type DiscoverJob,
} from '../../shared/discover.js';
export interface DiscoverFilters {
  scope: 'Today' | 'Last 30 Days';
  fit: string;
  source: string;
  search: string;
  sort: string;
}
function day(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  return ['year', 'month', 'day']
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join('-');
}
export function filterJobs(
  data: DiscoverData,
  filters: DiscoverFilters,
): DiscoverJob[] {
  const query = filters.search.toLocaleLowerCase().trim();
  const rows = data.jobs.filter(
    (job) =>
      (filters.scope === 'Last 30 Days' ||
        day(job.first_seen_at, data.timezone) === data.today) &&
      (filters.fit === 'All' || job.fit === filters.fit) &&
      (filters.source === 'All' || job.source === filters.source) &&
      (!query ||
        [job.title, job.company, job.location, job.reason]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)),
  );
  if (filters.sort === 'Recommended') return rows; // Producer ranking; never re-score here.
  return rows.sort((a, b) =>
    filters.sort === 'Newest'
      ? Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at)
      : filters.sort === 'Company'
        ? (a.company || '').localeCompare(b.company || '')
        : discoverFits.indexOf(a.fit) - discoverFits.indexOf(b.fit),
  );
}
