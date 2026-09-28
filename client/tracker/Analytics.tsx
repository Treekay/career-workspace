import { useState } from 'react';
import { Sankey } from './Sankey';
import { Link } from 'react-router-dom';
import type {
  AnalyticsApplication,
  AnalyticsReport,
  VolumeBucket,
} from '../../shared/analytics';
import { useResource } from './api';
import { ErrorState, StageBadge } from './components';
import { labels, colors } from './model';

function Identity({ row }: { row: AnalyticsApplication }) {
  const content = (
    <>
      <strong>{row.company}</strong>
      <small>
        {row.title}
        {row.deleted_at ? ' · Archived' : ''}
      </small>
    </>
  );
  return row.deleted_at ? (
    <div>{content}</div>
  ) : (
    <Link to={'/applications/' + row.id}>{content}</Link>
  );
}
function Paths({ data }: { data: AnalyticsReport }) {
  if (!data.paths.length)
    return (
      <p className="empty-copy">
        No Applied stage is recorded yet. Paths appear when an application is
        created as Applied or moves into Applied.
      </p>
    );
  const max = Math.max(...data.paths.map((p) => p.count));
  return (
    <div className="path-funnel">
      {data.paths.map((path, i) => (
        <div className="path-flow" key={i}>
          <div
            className="path-stages"
            aria-label={
              'Recorded path: ' + path.stages.map((s) => labels[s]).join(' → ')
            }
          >
            {path.stages.map((stage, index) => (
              <span className="path-step" key={index}>
                {index > 0 && (
                  <span aria-hidden="true" className="path-arrow">
                    →
                  </span>
                )}
                <StageBadge stage={stage} />
              </span>
            ))}
          </div>
          <div className="path-count">
            <meter
              aria-label={'Applications on path ' + (i + 1)}
              min={0}
              max={max}
              value={path.count}
            />
            <strong>
              {path.count} {path.count === 1 ? 'application' : 'applications'}
            </strong>
          </div>
        </div>
      ))}
    </div>
  );
}
function Scatter({ data }: { data: AnalyticsReport }) {
  if (!data.scatter.eligible)
    return (
      <div className="empty-inline">
        <h3>Not enough comparable outcomes yet</h3>
        <p>{data.scatter.reason}</p>
        <p>
          No values are estimated. Keep tracking stages and saving fit scores.
        </p>
      </div>
    );
  // Identical coordinates intentionally overlap; the grouped title and data list
  // preserve every observation without adding invented jitter.
  const groups = new Map<string, typeof data.scatter.points>();
  for (const point of data.scatter.points) {
    const key = point.score + ':' + point.progression;
    const group = groups.get(key) || [];
    group.push(point);
    groups.set(key, group);
  }
  return (
    <>
      <div className="plot-scroll">
        <svg
          className="scatter-plot"
          viewBox="0 0 650 290"
          role="img"
          aria-label="Fit score versus furthest recorded progression"
        >
          {[0, 1, 2, 3, 4, 5].map((rank) => (
            <g key={rank}>
              <line
                x1="100"
                x2="620"
                y1={235 - rank * 38}
                y2={235 - rank * 38}
              />
              <text x="89" y={239 - rank * 38} textAnchor="end">
                {
                  [
                    'Saved',
                    'Preparing',
                    'Applied',
                    'Screening',
                    'Interview',
                    'Offered',
                  ][rank]
                }
              </text>
            </g>
          ))}
          {[0, 25, 50, 75, 100].map((score) => (
            <text key={score} x={100 + score * 5.2} y="257" textAnchor="middle">
              {score}
            </text>
          ))}
          <text x="360" y="282" textAnchor="middle">
            Fit score (0–100)
          </text>
          {[...groups.entries()].map(([key, points]) => (
            <g key={key}>
              <circle
                cx={100 + points[0].score * 5.2}
                cy={235 - points[0].progression * 38}
                r="7"
                fill={points.length > 1 ? '#6d7d73' : colors[points[0].stage]}
                tabIndex={0}
                aria-label={points
                  .map(
                    (p) =>
                      p.company +
                      ': fit ' +
                      p.score +
                      ', reached ' +
                      p.progression_label +
                      ', current ' +
                      labels[p.stage],
                  )
                  .join('; ')}
              >
                <title>
                  {points
                    .map(
                      (p) =>
                        p.company +
                        ' — ' +
                        p.score +
                        '/100; reached ' +
                        p.progression_label +
                        '; current ' +
                        labels[p.stage],
                    )
                    .join('\n')}
                </title>
              </circle>
              {points.length > 1 && (
                <text
                  x={100 + points[0].score * 5.2 + 10}
                  y={230 - points[0].progression * 38}
                >
                  {points.length}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="chart-note">
        Y = furthest explicit milestone in the event history, not success
        probability. Rejections and withdrawals keep their earlier progression;
        their current stage remains visible below. Overlapping points are
        counted, never jittered.
      </p>
      <details className="data-details">
        <summary>View {data.scatter.points.length} scored observations</summary>
        <ul>
          {data.scatter.points.map((p) => (
            <li key={p.id}>
              {p.company} · {p.title}: {p.score}/100 · reached{' '}
              {p.progression_label} · current {labels[p.stage]}
              {p.deleted_at ? ' · Archived' : ''}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
function Volume({ buckets }: { buckets: VolumeBucket[] }) {
  if (!buckets.length)
    return (
      <p className="empty-copy">
        No application date is recorded. Set an applied date or move a tracked
        job into Applied to start this trend.
      </p>
    );
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="volume-scroll">
      <div
        className="volume-chart"
        style={{ minWidth: Math.max(300, buckets.length * 65) }}
      >
        {buckets.map((b) => (
          <div className="volume-column" key={b.start}>
            <div className="volume-track">
              <span className="volume-count">{b.count}</span>
              <div
                className="volume-fill"
                style={{ height: (b.count / max) * 140 }}
              />
            </div>
            <span>{b.start}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function Analytics() {
  const { data, error, reload } =
    useResource<AnalyticsReport>('/api/analytics');
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [waitingOnly, setWaitingOnly] = useState(false);
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">YOUR SEARCH, IN CONTEXT</p>
          <h1>Analytics</h1>
          <p>
            Recorded journeys and outcomes. No forecasts or inferred stages.
          </p>
        </div>
        <button onClick={reload}>Refresh</button>
      </div>
      {error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data ? (
        <p role="status">Loading analytics…</p>
      ) : (
        <>
          <p className="analytics-scope">
            All {data.total} tracked records, including {data.archived}{' '}
            archived. Historical metrics retain archived applications; active
            charts exclude them.
          </p>
          <div className="conversion-grid">
            {data.conversions.map((metric) => (
              <article className="kpi conversion-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>
                  {metric.rate === null
                    ? '—'
                    : (metric.rate * 100).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      }) + '%'}
                </strong>
                <small>
                  {metric.numerator} / {metric.denominator} applications
                  {metric.denominator === 0 ? ' · No source-stage history' : ''}
                </small>
              </article>
            ))}
          </div>
          <p className="chart-note">
            Each rate counts distinct applications with an explicit source-stage
            event and a later destination-stage event. Repeated visits count
            once. Stages that were skipped are never assumed; these are observed
            rates, including still-open applications.
          </p>
          <section className="dashboard-panel analytics-section">
            <div className="panel-title">
              <h2>Application funnel · recorded paths</h2>
              <span>{data.paths_count} applications</span>
            </div>
            <p className="panel-caption">
              Exact paths from the first recorded Applied event to the latest
              stage event. Reopened paths and skipped stages remain intact. Bar
              length = applications following that complete path.
            </p>
            <Sankey paths={data.paths} />
            <p className="chart-note">
              Columns follow event order, not a mandatory hiring sequence.
              Ribbon widths show recorded counts; paths can end at any node.
              Revisited stages occupy a later column.
            </p>
            <Paths data={data} />
            {data.without_applied_event > 0 && (
              <p className="chart-note">
                {data.without_applied_event} records have no Applied event and
                are excluded from this funnel.
              </p>
            )}
          </section>
          <div className="dashboard-grid analytics-section">
            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Time in current stage</h2>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={waitingOnly}
                    onChange={(e) => setWaitingOnly(e.target.checked)}
                  />
                  Waiting only
                </label>
              </div>
              <p className="panel-caption">
                Whole days since the latest stage event. Active = non-archived,
                non-closed; waiting = Applied or Screening.
              </p>
              <div className="analytics-bars">
                {data.waiting
                  .filter(
                    (a) =>
                      !waitingOnly ||
                      ['APPLIED', 'SCREENING'].includes(a.stage),
                  )
                  .map((row) => (
                    <div className="analytics-bar-row" key={row.id}>
                      <div className="bar-heading">
                        <Identity row={row} />
                        <span>
                          {row.days === null ? 'Unknown' : row.days + ' days'}
                        </span>
                      </div>
                      <StageBadge stage={row.stage} />
                      {row.days !== null ? (
                        <meter
                          min={0}
                          max={Math.max(
                            1,
                            ...data.waiting.map((a) => a.days ?? 0),
                          )}
                          value={row.days}
                          aria-label={
                            'Days in current stage for ' + row.company
                          }
                        />
                      ) : (
                        <small>No matching, valid stage-event date.</small>
                      )}
                    </div>
                  ))}
              </div>
              {!data.waiting.some(
                (a) =>
                  !waitingOnly || ['APPLIED', 'SCREENING'].includes(a.stage),
              ) && (
                <p className="empty-copy">
                  No {waitingOnly ? 'waiting' : 'active'} applications to
                  measure.
                </p>
              )}
            </section>
            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Fit ranking</h2>
                <span>{data.fit.length} scored records</span>
              </div>
              <p className="panel-caption">
                All recorded fit scores, including closed and archived jobs.
              </p>
              <div className="analytics-bars">
                {data.fit.map((row) => (
                  <div className="analytics-bar-row" key={row.id}>
                    <div className="bar-heading">
                      <Identity row={row} />
                      <span>{row.fit_score}/100</span>
                    </div>
                    <StageBadge stage={row.stage} />
                    <meter
                      min={0}
                      max={100}
                      value={row.fit_score!}
                      aria-label={'Fit score for ' + row.company}
                    />
                  </div>
                ))}
              </div>
              {!data.fit.length && (
                <p className="empty-copy">
                  No fit scores recorded yet. Save an assessment score on an
                  application to compare it here.
                </p>
              )}
            </section>
          </div>
          <section className="dashboard-panel analytics-section">
            <div className="panel-title">
              <h2>Match vs outcome</h2>
              <span>Descriptive, not predictive</span>
            </div>
            <Scatter data={data} />
          </section>
          <section className="dashboard-panel analytics-section">
            <div className="panel-title">
              <h2>Application volume over time</h2>
              <div
                className="filter-tabs"
                role="group"
                aria-label="Volume interval"
              >
                {(['weekly', 'monthly'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                  >
                    {value === 'weekly' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            <p className="panel-caption">
              One application per record: applied_at when known, otherwise its
              first Applied event date.{' '}
              {period === 'weekly'
                ? 'Weeks start Monday'
                : 'Months start on the first'}{' '}
              in UTC. {data.volume.undated} records lack an application date.
            </p>
            <Volume buckets={data.volume[period]} />
            <details className="data-details">
              <summary>
                View {period} counts ({data.volume.included} applications)
              </summary>
              <ul>
                {data.volume[period].map((b) => (
                  <li key={b.start}>
                    {b.start}: {b.count}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </>
      )}
    </>
  );
}
