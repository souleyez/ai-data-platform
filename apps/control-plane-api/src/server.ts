import 'dotenv/config.js';
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.CONTROL_PLANE_API_PORT || process.env.PORT || 3210);
const host = process.env.CONTROL_PLANE_API_HOST || process.env.HOST || '0.0.0.0';

app.listen({ port, host }).then(() => {
  app.log.info(`Control plane API running at http://${host}:${port}`);
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
