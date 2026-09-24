import { spawnSync } from 'node:child_process';

function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

if (spawnSync('uv', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.error('缺少 uv，请先安装 https://docs.astral.sh/uv/');
  process.exit(1);
}

const sync = run('uv', ['sync', '--project', 'browser-worker']);
if (sync.status !== 0) process.exit(sync.status ?? 1);

const browser = run('uv', ['run', '--project', 'browser-worker', 'playwright', 'install', 'chromium']);
if (browser.status !== 0) process.exit(browser.status ?? 1);

console.log('本地 Browser Harness 已就绪，不需要模型 API Key。');
