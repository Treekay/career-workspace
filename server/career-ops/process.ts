import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export function executable(value: string, root: string): string | null {
  const candidates =
    isAbsolute(value) || /[\\/]/.test(value)
      ? [resolve(root, value)]
      : (process.env.PATH || '')
          .split(delimiter)
          .filter(Boolean)
          .map((dir) =>
            join(
              dir,
              process.platform === 'win32' &&
                !value.toLowerCase().endsWith('.exe')
                ? value + '.exe'
                : value,
            ),
          );
  for (const file of candidates) {
    try {
      if (process.platform === 'win32' && !file.toLowerCase().endsWith('.exe'))
        continue;
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      /* Try the next PATH directory; never invoke a command shell/shim. */
    }
  }
  return null;
}
export interface ProcessRequest {
  bin: string;
  args: string[];
  cwd: string;
  input?: string;
  timeout: number;
  signal?: AbortSignal;
}
export type Runner = (
  request: ProcessRequest,
) => Promise<{ code: number; stdout: string; stderr: string }>;
export const runProcess: Runner = ({
  bin,
  args,
  cwd,
  input,
  timeout,
  signal,
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      bytes = 0,
      failure = '';
    function stop(reason: string) {
      if (failure) return;
      failure = reason;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn(
          join(
            process.env.SystemRoot || 'C:\\Windows',
            'System32',
            'taskkill.exe',
          ),
          ['/PID', String(child.pid), '/T', '/F'],
          { shell: false, windowsHide: true, stdio: 'ignore' },
        );
        killer.on('error', () => child.kill());
      } else {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }
    const abort = () => stop('Career Ops run was cancelled.');
    const timer = setTimeout(
      () =>
        stop(
          'Career Ops timed out. The draft was not imported; retry explicitly.',
        ),
      timeout,
    );
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    for (const [stream, error] of [
      [child.stdout, false],
      [child.stderr, true],
    ] as const) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 2 * 1024 * 1024) {
          stop('Career Ops exceeded the output limit.');
          return;
        }
        if (error) stderr += chunk.toString();
        else stdout += chunk.toString();
      });
    }
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    child.on('error', () => {
      cleanup();
      reject(new Error('Could not start the configured Codex executable.'));
    });
    child.on('close', (code) => {
      cleanup();
      failure
        ? reject(new Error(failure))
        : resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.on('error', () => {
      /* Early process exit is reported by close. */
    });
    child.stdin.end(input || '');
  });
