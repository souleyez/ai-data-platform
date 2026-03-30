import { refreshOpenClawMemoryCatalogNow } from '../lib/openclaw-memory-sync.js';

async function main() {
  const result = await refreshOpenClawMemoryCatalogNow('manual-refresh-script');
  console.log(JSON.stringify({
    status: 'ok',
    ...result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
