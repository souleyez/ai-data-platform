const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const STANDALONE_SERVER_CANDIDATES = [
  path.join(__dirname, '.next', 'standalone', 'apps', 'web', 'server.js'),
  path.join(__dirname, '.next', 'standalone', 'server.js'),
];

function findStandaloneServer() {
  return STANDALONE_SERVER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || '';
}

function recreatePath(targetPath, sourcePath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(sourcePath, targetPath, symlinkType);
  } catch {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function ensureStandaloneRuntimeAssets(serverPath) {
  const standaloneAppDir = path.dirname(serverPath);
  const runtimeAssets = [
    {
      sourcePath: path.join(__dirname, '.next', 'static'),
      targetPath: path.join(standaloneAppDir, '.next', 'static'),
    },
    {
      sourcePath: path.join(__dirname, 'public'),
      targetPath: path.join(standaloneAppDir, 'public'),
    },
  ];

  runtimeAssets.forEach(({ sourcePath, targetPath }) => {
    if (!fs.existsSync(sourcePath)) return;

    let shouldRefresh = true;
    if (fs.existsSync(targetPath)) {
      try {
        shouldRefresh = fs.realpathSync(targetPath) !== fs.realpathSync(sourcePath);
      } catch {
        shouldRefresh = true;
      }
    }

    if (!shouldRefresh) return;
    recreatePath(targetPath, sourcePath);
  });
}

function runStandaloneServer(serverPath) {
  ensureStandaloneRuntimeAssets(serverPath);
  process.chdir(path.dirname(serverPath));
  require(serverPath);
}

function runNextStartFallback() {
  const nextCliPath = require.resolve('next/dist/bin/next');
  const port = String(process.env.PORT || process.env.WEB_PORT || '3000');
  const host = String(process.env.HOSTNAME || process.env.HOST || '0.0.0.0');
  const child = spawn(process.execPath, [nextCliPath, 'start', '-p', port, '-H', host], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

const standaloneServerPath = findStandaloneServer();

if (standaloneServerPath) {
  runStandaloneServer(standaloneServerPath);
} else {
  runNextStartFallback();
}
