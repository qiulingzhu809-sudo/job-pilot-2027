import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const processes = [
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell }),
  spawn('npm', ['run', 'browser:harness'], { stdio: 'inherit', shell }),
];
const feed = spawn(process.execPath, ['scripts/pull-private-feed.mjs', '--watch'], { stdio: 'inherit' });
processes.push(feed);

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 200).unref();
}

for (const child of processes) {
  child.on('exit', (code, signal) => {
    if (!stopping && (code !== 0 || signal)) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
