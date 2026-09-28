import { useEffect, useState } from 'react';
import type { Application } from './model';
export async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      response.status === 404
        ? 'Application not found.'
        : body?.error ||
            'Could not connect to the local API. Please try again.',
    );
  }
  return response.json() as Promise<T>;
}
export function useResource<T>(url: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({});
    const timer = setTimeout(() => controller.abort(), 10000);
    request<T>(url, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ data });
      })
      .catch((error) => {
        if (active)
          setState({
            error: controller.signal.aborted
              ? 'The request timed out. Please try again.'
              : error.message,
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, version]);
  return {
    ...state,
    reload: () => setVersion((v) => v + 1),
    replace: (data: T) => setState({ data }),
  };
}
export function useApplications() {
  const [state, setState] = useState<{ data?: Application[]; error?: string }>(
    {},
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    setState({});
    (async () => {
      const rows: Application[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await request<Application[]>(
          '/api/applications?limit=200&offset=' + offset,
          { signal: controller.signal },
        );
        rows.push(...page);
        if (page.length < 200) break;
      }
      if (active) setState({ data: rows });
    })()
      .catch((error) => {
        if (active)
          setState({
            error: controller.signal.aborted
              ? 'Loading applications timed out. Please try again.'
              : error.message,
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [version]);
  return { ...state, reload: () => setVersion((v) => v + 1) };
}
