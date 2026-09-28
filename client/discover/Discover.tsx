import { formatDate } from '../format';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { DiscoverData, DiscoverFailure } from '../../shared/discover';
import { filterJobs, type DiscoverFilters } from './model';
const initial: DiscoverFilters = {
  scope: 'Today',
  fit: 'All',
  source: 'All',
  search: '',
  sort: 'Recommended',
};
export function Discover() {
  const [state, setState] = useState<{
    data?: DiscoverData;
    error?: DiscoverFailure;
  }>({});
  const [version, setVersion] = useState(0);
  const [params, setParams] = useSearchParams();
  const filters: DiscoverFilters = {
    scope: params.get('scope') === 'Last 30 Days' ? 'Last 30 Days' : 'Today',
    fit: ['All', 'HIGH', 'MEDIUM', 'LOW', 'SKIP', 'UNASSESSED'].includes(
      params.get('fit') || '',
    )
      ? params.get('fit')!
      : initial.fit,
    source: ['All', 'SEEK', 'LINKEDIN'].includes(params.get('source') || '')
      ? params.get('source')!
      : initial.source,
    sort: ['Recommended', 'Newest', 'Company', 'Fit'].includes(
      params.get('sort') || '',
    )
      ? params.get('sort')!
      : initial.sort,
    search: params.get('search') || '',
  };
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({});
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch('/api/discover', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (active) setState(response.ok ? { data: body } : { error: body });
      })
      .catch(() => {
        if (active)
          setState({
            error: {
              status: 'unavailable',
              error: 'Cannot load the Discover export.',
              hint: 'Check the workspace API and try again.',
            },
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [version]);
  const { data, error } = state;
  const rows = data ? filterJobs(data, filters) : [];
  function change<K extends keyof DiscoverFilters>(
    key: K,
    value: DiscoverFilters[K],
  ) {
    setParams(
      (p) => {
        p.set(key, value);
        return p;
      },
      { replace: key === 'search' },
    );
  }
  const format = (value: string) => formatDate(value, true, data?.timezone);
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">FROM YOUR JOB ALERTS</p>
          <h1>Discover</h1>
          <p>
            Find roles worth exploring. Open the source; EasySeek handles
            browsing and marking.
          </p>
        </div>
        <div className="form-actions">
          <Link to="/settings">Integration settings</Link>
          <button onClick={() => setVersion((v) => v + 1)}>
            Refresh export
          </button>
        </div>
      </div>
      {error ? (
        <section className="notice" role="alert">
          <h2>{error.error}</h2>
          <p>{error.hint}</p>
          <button onClick={() => setVersion((v) => v + 1)}>Try again</button>
        </section>
      ) : !data ? (
        <p role="status">Reading review queue…</p>
      ) : (
        <>
          {data.status === 'stale' && (
            <section className="notice discover-warning" role="alert">
              <strong>The review queue is stale.</strong>
              <p>
                The export or recorded run is older than the{' '}
                {data.stale_after_hours}-hour freshness window. Showing the last
                available snapshot; newer jobs may be missing. Run
                job-alert-workflow separately, then refresh.
              </p>
            </section>
          )}
          <div className="discover-kpis">
            <article className="kpi">
              <span>Last job-alert run</span>
              <strong className="run-date">{data.last_run_date}</strong>
              <small>Exact run time is not exported · {data.timezone}</small>
            </article>
            <article className="kpi">
              <span>Current job count</span>
              <strong>{data.current_job_count}</strong>
              <small>Seen in the last 30 calendar days</small>
            </article>
            <article className="kpi">
              <span>Today's new jobs</span>
              <strong>{data.today_new_count}</strong>
              <small>First seen on {data.today}</small>
            </article>
          </div>
          <p className="discover-meta">
            Export updated {format(data.export_modified_at)} · Data watermark{' '}
            {format(data.data_updated_at)} · Dates use {data.timezone}
          </p>
          {data.warnings.length > 0 && (
            <ul className="notice" role="status">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <section className="discover-controls" aria-label="Discover filters">
            <div className="filter-tabs" role="group" aria-label="Date scope">
              {(['Today', 'Last 30 Days'] as const).map((scope) => (
                <button
                  key={scope}
                  aria-pressed={filters.scope === scope}
                  onClick={() => change('scope', scope)}
                >
                  {scope}
                </button>
              ))}
            </div>
            <div className="discover-filter-row">
              <label>
                Fit
                <select
                  aria-label="Fit"
                  value={filters.fit}
                  onChange={(e) => change('fit', e.target.value)}
                >
                  {[
                    'All',
                    'HIGH',
                    'MEDIUM',
                    'LOW',
                    'SKIP',
                    ...(data.jobs.some((j) => j.fit === 'UNASSESSED')
                      ? ['UNASSESSED']
                      : []),
                  ].map((fit) => (
                    <option key={fit}>{fit}</option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  aria-label="Source"
                  value={filters.source}
                  onChange={(e) => change('source', e.target.value)}
                >
                  <option value="All">All</option>
                  <option value="SEEK">SEEK</option>
                  <option value="LINKEDIN">LinkedIn</option>
                </select>
              </label>
              <label>
                Sort
                <select
                  aria-label="Sort"
                  value={filters.sort}
                  onChange={(e) => change('sort', e.target.value)}
                >
                  {['Recommended', 'Newest', 'Company', 'Fit'].map((sort) => (
                    <option key={sort}>{sort}</option>
                  ))}
                </select>
              </label>
              <label className="discover-search">
                Search
                <input
                  type="search"
                  placeholder="Title, company, location or reason…"
                  value={filters.search}
                  onChange={(e) => change('search', e.target.value)}
                />
              </label>
            </div>
          </section>
          <div className="discover-results-heading">
            <p role="status">
              {rows.length} {rows.length === 1 ? 'job' : 'jobs'} ·{' '}
              {filters.scope}
            </p>
            <span>Recommended follows the producer's ranking</span>
          </div>
          {!rows.length ? (
            <section className="empty-inline">
              <h2>
                {data.current_job_count === 0
                  ? 'No current jobs'
                  : filters.scope === 'Today' && data.today_new_count === 0
                    ? 'No new jobs today'
                    : 'No matching jobs'}
              </h2>
              <p>
                {filters.scope === 'Today'
                  ? 'Try Last 30 Days to browse retained opportunities.'
                  : 'Try another fit, source, or search filter.'}
              </p>
            </section>
          ) : (
            <div className="discover-grid">
              {rows.map((job) => (
                <article className="discover-card" key={job.canonical_key}>
                  <div className="discover-card-top">
                    <span className={'fit-badge fit-' + job.fit}>
                      {job.fit === 'UNASSESSED' ? 'Unassessed' : job.fit}{' '}
                      <span>fast fit</span>
                    </span>
                    <span className="discover-source">
                      {job.source === 'LINKEDIN' ? 'LinkedIn' : job.source}
                    </span>
                  </div>
                  <h2>{job.title || 'Title not provided'}</h2>
                  <p className="discover-company">
                    {job.company || 'Company not provided'}
                  </p>
                  <p className="discover-location">
                    {job.location || 'Location not provided'}
                  </p>
                  <p className="discover-reason">
                    {job.reason || 'No reason provided.'}
                  </p>
                  <div className="discover-card-footer">
                    <time dateTime={job.first_seen_at}>
                      First seen {format(job.first_seen_at)}
                    </time>
                    {job.url ? (
                      <a
                        className="primary-button"
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        Open on{' '}
                        {job.source === 'LINKEDIN' ? 'LinkedIn' : 'SEEK'} ↗
                      </a>
                    ) : (
                      <span className="disabled-link">
                        Source link unavailable
                      </span>
                    )}
                  </div>
                  {job.url && (
                    <a
                      className="source-url"
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      title="Source URL"
                    >
                      {job.url}
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
