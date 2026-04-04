import 'dotenv/config.js';
import { createApp } from './app.js';
import { ensureDefaultProjectSamples } from './lib/default-project-samples.js';
import { startWecomLongConnectionManager } from './lib/wecom-long-connection.js';

const app = createApp();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '0.0.0.0';
let stopWecomLongConnections: null | (() => Promise<void>) = null;

app.listen({ port, host }).then(() => {
  app.log.info(`API server running at http://${host}:${port}`);
  void ensureDefaultProjectSamples().catch((error) => {
    app.log.warn({ error }, 'default project sample sync failed');
  });
  void startWecomLongConnectionManager(app.log)
    .then((manager) => {
      stopWecomLongConnections = manager.stop;
    })
    .catch((error) => {
      app.log.warn({ error }, 'wecom long connection startup failed');
    });
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

async function shutdown() {
  try {
    if (stopWecomLongConnections) {
      await stopWecomLongConnections();
    }
  } finally {
    await app.close();
  }
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
