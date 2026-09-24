import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, appendFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(root, '.runtime/feed');
const watch = process.argv.includes('--watch');
let config = {};
try { config = JSON.parse(await readFile(resolve(root, '.runtime/feed-source.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const repo = process.env.JOB_FEED_REPO || config.repository;
if (!repo) {
  console.log('私有岗位同步未配置：设置 JOB_FEED_REPO 或 .runtime/feed-source.json 的 repository。');
  process.exit(watch ? 0 : 1);
}
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('JOB_FEED_REPO 格式应为 owner/repository');
await mkdir(runtime, { recursive: true });

async function sync() {
  const started = new Date();
  const record = { startedAt: started.toISOString() };
  let stage = 'download';
  try {
    const { stdout } = await exec('gh', ['api', `repos/${repo}/contents/jobs.json?ref=feed-data`, '-H', 'Accept: application/vnd.github.raw+json'], { timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
    const feed = JSON.parse(stdout);
    if (!Array.isArray(feed.jobs)) throw new Error('私有源未返回 jobs 数组');
    const temporary = resolve(runtime, 'jobs.json.next');
    const destination = resolve(runtime, 'jobs.json');
    await writeFile(temporary, stdout);
    await rename(temporary, destination);
    stage = 'import';
    const result = await exec(process.execPath, [resolve(root, 'scripts/sync-job-feed.mjs')], {
      cwd: root, timeout: 180000, maxBuffer: 1024 * 1024,
      env: { ...process.env, JOB_FEED_URL: destination, JOB_RADAR_URL: process.env.JOB_RADAR_URL || 'http://localhost:3000', JOB_FEED_APPEND_ONLY: '1' },
    });
    record.status = 'success'; record.feedCount = feed.jobs.length;
    console.log(result.stdout.trim());
  } catch (error) {
    record.status = 'failed'; record.stage = stage; record.error = error.code || error.name;
    // Keep command output (which may contain job data or credentials) out of logs.
    record.reason = error.killed ? 'timeout' : stage === 'download'
      ? 'Download/JSON validation failed; check gh authentication and repository access.'
      : 'Local import failed; check the workbench server and its database migrations.';
    console.error(`私有岗位同步失败（${stage}/${record.error}）：${record.reason} 历史岗位保留。`);
  } finally {
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - started.getTime();
    await appendFile(resolve(runtime, 'sync-runs.jsonl'), JSON.stringify(record) + '\n');
  }
  return record.status === 'success';
}
if (watch) {
  // Give the parallel dev server time to bind its port. Never overlap syncs.
  await new Promise(resolve => setTimeout(resolve, 10000));
  for (;;) {
    const ok = await sync();
    await new Promise(resolve => setTimeout(resolve, ok ? 30 * 60 * 1000 : 60 * 1000));
  }
} else {
  if (!await sync()) process.exitCode = 1;
}
