import { buildApp } from './app.js';
import { readConfig } from '../config/runtime.js';
const config = readConfig();
const app = buildApp(config, true);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        app.log.error(error);
        process.exit(1);
      });
  });
}
try {
  await app.listen({ host: config.host, port: config.apiPort });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
