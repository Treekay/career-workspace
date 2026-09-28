import { useState, type FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { applicationStages } from '../../shared/tracker';
import { useApplications, request } from './api';
import { StageControl, StageBadge, ErrorState } from './components';
import {
  date,
  daysInStage,
  fit,
  labels,
  matches,
  type Application,
} from './model';
export function Applications() {
  const { data, error, reload } = useApplications();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const filters = ['Active', 'Waiting', 'Closed', 'All'];
  const filter = filters.includes(params.get('filter') || '')
    ? params.get('filter')!
    : 'Active';
  const adding = params.get('add') === 'true';
  function setFilter(value: string) {
    setParams((p) => {
      p.set('filter', value);
      return p;
    });
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setSaveError('');
    try {
      const row = await request<Application>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          company: form.get('company'),
          source: form.get('source'),
          url: form.get('url') || null,
          stage: form.get('stage'),
        }),
      });
      navigate('/applications/' + row.id);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.filter(
    (a) =>
      matches(a, filter) &&
      [a.company, a.title, a.location || '']
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">YOUR OPPORTUNITIES</p>
          <h1>Applications</h1>
          <p>A clear view of every role you’re actively following.</p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            setParams((p) => {
              p.set('add', 'true');
              return p;
            })
          }
        >
          + Add application
        </button>
      </div>
      {adding && (
        <form className="dashboard-panel add-form" onSubmit={add}>
          <h2>Add application</h2>
          <div className="form-grid">
            <label>
              Company
              <input name="company" required maxLength={1000} />
            </label>
            <label>
              Job title
              <input name="title" required maxLength={1000} />
            </label>
            <label>
              Source
              <select name="source">
                <option value="seek">SEEK</option>
                <option value="linkedin">LinkedIn</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Initial stage
              <select name="stage">
                {applicationStages.map((s) => (
                  <option value={s} key={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Job URL
              <input name="url" type="url" placeholder="https://…" />
            </label>
          </div>
          {saveError && (
            <p role="alert" className="inline-error">
              {saveError}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" disabled={busy}>
              {busy ? 'Saving…' : 'Save application'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setParams((p) => {
                  p.delete('add');
                  return p;
                })
              }
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="filter-bar">
        <div
          role="group"
          aria-label="Application filters"
          className="filter-tabs"
        >
          {filters.map((f) => (
            <button
              key={f}
              aria-pressed={f === filter}
              onClick={() => setFilter(f)}
            >
              {f}
              {data && <span>{data.filter((a) => matches(a, f)).length}</span>}
            </button>
          ))}
        </div>
        <label className="search-label">
          <span className="sr-only">Search applications</span>
          <input
            type="search"
            placeholder="Search company or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="filter-hint">
        Active includes all non-closed stages. Waiting: Applied and Screening.
        Closed: Rejected and Withdrawn.
      </p>
      {error ? (
        <ErrorState error={error} retry={reload} />
      ) : !rows ? (
        <p role="status">Loading applications…</p>
      ) : !rows.length ? (
        <section className="empty-inline">
          <h2>
            {data?.length ? 'No matching applications' : 'No applications yet'}
          </h2>
          <p>
            {data?.length
              ? 'Try another filter or search.'
              : 'Save a role to begin tracking its progress.'}
          </p>
        </section>
      ) : (
        <div className="application-list">
          {rows.map((a) => (
            <article key={a.id} className="application-row">
              <div className="application-primary">
                <div className="company-avatar" aria-hidden="true">
                  {a.company.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <Link to={'/applications/' + a.id}>
                    <h2>{a.company}</h2>
                    <p>{a.title}</p>
                  </Link>
                  <small>
                    {a.location || 'Location not recorded'} ·{' '}
                    <span className="source-label">{a.source}</span>
                  </small>
                </div>
              </div>
              <div className="application-stats">
                <div>
                  <span>Fit</span>
                  <strong>{fit(a)}</strong>
                </div>
                <div>
                  <span>Applied</span>
                  <strong>
                    {a.applied_at ? date(a.applied_at) : 'Not applied'}
                  </strong>
                </div>
                <div>
                  <span>In stage</span>
                  <strong>{daysInStage(a)} days</strong>
                </div>
              </div>
              <div className="application-stage">
                <StageBadge stage={a.stage} />
                <StageControl application={a} onSaved={reload} />
              </div>
              <div className="application-next">
                <span>Next action</span>
                <strong>{a.next_action || 'No next action set'}</strong>
                {a.next_action_at && <small>{date(a.next_action_at)}</small>}
                <Link to={'/applications/' + a.id}>View details →</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
