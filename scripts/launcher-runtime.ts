import { createServer as createSocketServer } from 'node:net';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { readConfig } from '../config/runtime.js';
import { buildApp } from '../server/app.js';

const emit = (value: object) =>
  process.stdout.write('CW_LAUNCHER ' + JSON.stringify(value) + '\n');
const config = readConfig();
let web: ViteDevServer | undefined;
let api: ReturnType<typeof buildApp> | undefined;
let stopping = false;
async function available(port: number) {
  await new Promise<void>((resolve, reject) => {
    const probe = createSocketServer();
    probe.once('error', () =>
      reject(
        new Error(
          `Port ${port} is occupied. Stop your manually started workspace or change ports in Settings.`,
        ),
      ),
    );
    probe.listen(port, config.host, () => probe.close(() => resolve()));
  });
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 20000);
  try {
    await web?.close();
    await api?.close();
    emit({ state: 'stopped' });
  } catch (error) {
    emit({ state: 'error', message: (error as Error).message });
    code = 1;
  } finally {
    clearTimeout(deadline);
    process.exit(code);
  }
}
// The launcher owns stdin: closing it also stops services after an unexpected UI exit.
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line.trim() === 'stop') void started.finally(() => stop());
});
input.on('close', () => {
  void started.finally(() => stop());
});
process.once('SIGINT', () => {
  void started.finally(() => stop());
});
process.once('SIGTERM', () => {
  void started.finally(() => stop());
});
const started = (async () => {
  try {
    await available(config.apiPort);
    await available(config.webPort);
    api = buildApp(config, false);
    await api.listen({ host: config.host, port: config.apiPort });
    web = await createServer({
      configFile: join(config.root, 'vite.config.ts'),
      root: config.root,
      clearScreen: false,
      logLevel: 'error',
    });
    await web.listen();
    emit({ state: 'ready', url: `http://${config.host}:${config.webPort}` });
  } catch (error) {
    emit({ state: 'error', message: (error as Error).message });
    await stop(1);
  }
})();
