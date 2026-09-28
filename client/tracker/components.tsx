import { useState } from 'react';
import { applicationStages } from '../../shared/tracker';
import { request } from './api';
import { labels, type Application } from './model';
export function StageBadge({ stage }: { stage: Application['stage'] }) {
  return <span className={'stage-badge stage-' + stage}>{labels[stage]}</span>;
}
export function ErrorState({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="notice" role="alert">
      {error} <button onClick={retry}>Try again</button>
    </div>
  );
}
export function StageControl({
  application,
  onSaved,
}: {
  application: Application;
  onSaved: (data: Application) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function change(stage: string) {
    if (stage === application.stage) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const updated = await request<Application>(
        '/api/applications/' + application.id + '/stage',
        {
          method: 'POST',
          body: JSON.stringify({ stage }),
        },
      );
      setSuccess('Stage updated.');
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stage-control">
      <label>
        <span className="sr-only">Stage for {application.company}</span>
        <select
          aria-label={'Stage for ' + application.company}
          value={application.stage}
          disabled={busy}
          onChange={(e) => void change(e.target.value)}
        >
          {applicationStages.map((stage) => (
            <option key={stage} value={stage}>
              {labels[stage]}
            </option>
          ))}
        </select>
      </label>
      {busy && <span role="status">Saving…</span>}
      {success && (
        <span className="sr-only" role="status">
          {success}
        </span>
      )}
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}
    </div>
  );
}
