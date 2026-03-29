import { spawn } from 'node:child_process';
import path from 'node:path';

const rawArgs = process.argv.slice(2);
const preflightOnly = rawArgs.includes('--preflight');
const forwardedArgs = rawArgs
  .filter((arg) => arg !== '--preflight')
  .filter((arg, index, list) => !(index === 0 && arg === '--' && list.length >= 1));

const scriptPath = path.join(process.cwd(), 'tools', 'deploy-remote.ps1');
const powershellArgs = [
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  scriptPath,
];

if (preflightOnly) {
  powershellArgs.push('-PreflightOnly');
}

powershellArgs.push(...forwardedArgs);

const child = spawn('powershell', powershellArgs, {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
