import { executePlatformControlCommand } from '../lib/platform-control.js';

async function main() {
  try {
    const result = await executePlatformControlCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'platform-control failed');
    process.stderr.write(`${JSON.stringify({
      ok: false,
      action: 'platform-control',
      summary: message,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

void main();
