import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();

const envTargets = [
  'apps/api/.env',
  'apps/web/.env',
  'apps/worker/.env',
];

for (const relativeTarget of envTargets) {
  const targetPath = path.join(workspaceRoot, relativeTarget);
  const examplePath = `${targetPath}.example`;

  if (existsSync(targetPath) || !existsSync(examplePath)) {
    continue;
  }

  copyFileSync(examplePath, targetPath);
  console.log(`[ensure-env] created ${relativeTarget} from ${relativeTarget}.example`);
}
