import 'dotenv/config.js';
import { createApp } from './app.js';
import { ensureDefaultProjectSamples } from './lib/default-project-samples.js';

const app = createApp();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '0.0.0.0';

app.listen({ port, host }).then(() => {
  app.log.info(`API server running at http://${host}:${port}`);
  void ensureDefaultProjectSamples().catch((error) => {
    app.log.warn({ error }, 'default project sample sync failed');
  });
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
