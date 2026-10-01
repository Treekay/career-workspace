import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRoot } from '../config/runtime.js';
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return value;
}
test(
  'launcher starts real services, stops on command/owner EOF, and never kills an occupied port',
  { timeout: 90000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-launcher-'));
    const apiPort = await port();
    let webPort = await port();
    while (webPort === apiPort) webPort = await port();
    async function run(mode: 'stop' | 'eof' | 'occupied') {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/launcher-runtime.ts'],
        {
          cwd: projectRoot,
          windowsHide: true,
          env: {
            ...process.env,
            WORKSPACE_CONFIG_PATH: join(root, 'settings.json'),
            DATABASE_PATH: join(root, 'workspace.db'),
            API_PORT: String(apiPort),
            WEB_PORT: String(webPort),
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.stderr.on('data', (data) => {
        output += data;
      });
      const exited = new Promise<number | null>((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', reject);
      });
      try {
        if (mode === 'occupied') {
          assert.equal(await exited, 1);
          assert.match(output, /occupied/);
          return;
        }
        for (
          let n = 0;
          n < 150 &&
          !output.includes('"state":"ready"') &&
          child.exitCode === null;
          n++
        )
          await new Promise((resolve) => setTimeout(resolve, 100));
        assert.match(output, /"state":"ready"/);
        assert.equal((await fetch(`http://127.0.0.1:${webPort}/`)).status, 200);
        const health = await fetch(
          `http://127.0.0.1:${apiPort}/api/health`,
        ).then((r) => r.json());
        assert.equal(health.service, 'career-workspace');
        if (mode === 'eof') child.stdin.end();
        else child.stdin.write('stop\n');
        assert.equal(await exited, 0);
        await assert.rejects(fetch(`http://127.0.0.1:${apiPort}/api/health`));
        await assert.rejects(fetch(`http://127.0.0.1:${webPort}/`));
      } finally {
        if (child.exitCode === null) {
          child.stdin.end();
          await exited;
        }
      }
    }
    try {
      await run('stop');
      await run('eof');
      const occupied = createServer();
      await new Promise<void>((resolve) =>
        occupied.listen(apiPort, '127.0.0.1', resolve),
      );
      try {
        await run('occupied');
        assert.equal(occupied.listening, true);
      } finally {
        await new Promise<void>((resolve) => occupied.close(() => resolve()));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
