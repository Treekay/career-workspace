import type {
  AnalyticsApplication,
  AnalyticsEvent,
  AnalyticsReport,
  VolumeBucket,
} from '../../shared/analytics.js';
import type { ApplicationStage } from '../../shared/tracker.js';

const progression: Partial<Record<ApplicationStage, number>> = {
  SAVED: 0,
  PREPARING: 1,
  APPLIED: 2,
  SCREENING: 3,
  INTERVIEW: 4,
  OFFERED: 5,
};
const progressionLabels = [
  'Saved',
  'Preparing',
  'Applied',
  'Screening',
  'Interview',
  'Offered',
];
const validTime = (value: string | null) =>
  value !== null && Number.isFinite(Date.parse(value));
function bucketStart(value: string, period: 'weekly' | 'monthly') {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (period === 'monthly') date.setUTCDate(1);
  else date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function volumeBuckets(
  dates: string[],
  period: 'weekly' | 'monthly',
): VolumeBucket[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = bucketStart(date, period);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  if (!keys.length) return [];
  const cursor = new Date(keys[0] + 'T00:00:00Z');
  const last = keys[keys.length - 1];
  const output: VolumeBucket[] = [];
  // Fill only the observed date range. Zero is an actual absence, not a forecast.
  while (cursor.toISOString().slice(0, 10) <= last) {
    const start = cursor.toISOString().slice(0, 10);
    output.push({ start, count: counts.get(start) || 0 });
    if (period === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return output;
}
export function calculateAnalytics(
  applications: AnalyticsApplication[],
  events: AnalyticsEvent[],
  now = new Date(),
): AnalyticsReport {
  const byId = new Map<string, AnalyticsEvent[]>();
  const known = new Set(applications.map((a) => a.id));
  for (const event of [...events].sort((a, b) => a.id - b.id)) {
    if (
      !known.has(event.application_id) ||
      !['CREATED', 'STAGE_CHANGED'].includes(event.event_type)
    )
      continue;
    const history = byId.get(event.application_id) || [];
    history.push(event);
    byId.set(event.application_id, history);
  }
  const histories = applications.map((a) => byId.get(a.id) || []);
  const conversion = (
    from: ApplicationStage,
    to: ApplicationStage,
    label: string,
  ) => {
    let denominator = 0,
      numerator = 0;
    for (const history of histories) {
      const first = history.findIndex((e) => e.stage === from);
      if (first < 0) continue;
      denominator++;
      if (history.slice(first + 1).some((e) => e.stage === to)) numerator++;
    }
    return {
      label,
      numerator,
      denominator,
      rate: denominator ? numerator / denominator : null,
    };
  };
  const groupedPaths = new Map<
    string,
    { stages: ApplicationStage[]; count: number }
  >();
  let pathsCount = 0;
  for (const history of histories) {
    const first = history.findIndex((e) => e.stage === 'APPLIED');
    if (first < 0) continue;
    pathsCount++;
    const stages = history
      .slice(first)
      .map((e) => e.stage)
      .filter((stage, index, all) => index === 0 || stage !== all[index - 1]);
    const key = stages.join('>');
    const existing = groupedPaths.get(key);
    if (existing) existing.count++;
    else groupedPaths.set(key, { stages, count: 1 });
  }
  const waiting = applications
    .filter(
      (a) => !a.deleted_at && !['REJECTED', 'WITHDRAWN'].includes(a.stage),
    )
    .map((a) => {
      const history = byId.get(a.id) || [];
      const last = history[history.length - 1];
      const since =
        last && last.stage === a.stage && validTime(last.event_at)
          ? last.event_at
          : null;
      const elapsed = since ? now.getTime() - Date.parse(since) : null;
      return {
        ...a,
        stage_since: since,
        days:
          elapsed === null || elapsed < 0
            ? null
            : Math.floor(elapsed / 86400000),
      };
    })
    .sort(
      (a, b) =>
        (b.days ?? -1) - (a.days ?? -1) || a.company.localeCompare(b.company),
    );
  const fit = applications
    .filter((a) => a.fit_score !== null && Number.isFinite(a.fit_score))
    .sort(
      (a, b) =>
        b.fit_score! - a.fit_score! || a.company.localeCompare(b.company),
    );
  const points = fit.flatMap((a) => {
    const ranks = (byId.get(a.id) || [])
      .map((e) => progression[e.stage])
      .filter((rank): rank is number => rank !== undefined);
    if (!ranks.length) return [];
    const rank = Math.max(...ranks);
    return [
      {
        ...a,
        score: a.fit_score!,
        progression: rank,
        progression_label: progressionLabels[rank],
      },
    ];
  });
  const enough = points.length >= 5;
  const variedScore = new Set(points.map((p) => p.score)).size >= 2;
  const variedProgression = new Set(points.map((p) => p.progression)).size >= 2;
  const reason = !enough
    ? 'Record fit scores and progression history for at least 5 applications. ' +
      points.length +
      ' currently qualify.'
    : !variedScore
      ? 'At least two distinct fit scores are needed to compare outcomes.'
      : !variedProgression
        ? 'All scored applications have the same recorded progression. More varied history is needed.'
        : null;
  const appliedDates: string[] = [];
  let undated = 0;
  for (const a of applications) {
    const first = (byId.get(a.id) || []).find((e) => e.stage === 'APPLIED');
    const date = validTime(a.applied_at)
      ? a.applied_at
      : first && validTime(first.event_at)
        ? first.event_at
        : null;
    if (date) appliedDates.push(date);
    else undated++;
  }
  return {
    generated_at: now.toISOString(),
    total: applications.length,
    archived: applications.filter((a) => a.deleted_at).length,
    conversions: [
      conversion('APPLIED', 'INTERVIEW', 'Applied → Interview'),
      conversion('INTERVIEW', 'OFFERED', 'Interview → Offer'),
      conversion('APPLIED', 'OFFERED', 'Applied → Offer'),
    ],
    paths: [...groupedPaths.values()].sort(
      (a, b) =>
        b.count - a.count ||
        a.stages.join('>').localeCompare(b.stages.join('>')),
    ),
    paths_count: pathsCount,
    without_applied_event: applications.length - pathsCount,
    waiting,
    fit,
    scatter: { points, eligible: reason === null, reason, minimum: 5 },
    volume: {
      weekly: volumeBuckets(appliedDates, 'weekly'),
      monthly: volumeBuckets(appliedDates, 'monthly'),
      included: appliedDates.length,
      undated,
    },
  };
}
