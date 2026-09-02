import { cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'skills', 'campus-job-radar');
const targets = [
  path.join(root, '.agents', 'skills', 'campus-job-radar'),
  path.join(root, '.claude', 'skills', 'campus-job-radar'),
];

for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

const result = spawnSync(
  'npx',
  ['skills', 'add', 'https://github.com/browser-use/browser-use', '--skill', 'browser-use', '-y'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error('\nBrowser Use Skill 安装失败。请检查网络后重新运行 npm run setup:agent。');
  process.exit(result.status ?? 1);
}

console.log('\n秋招雷达 Skill 与 Browser Use Skill 已安装。');
console.log('现在直接告诉 Agent：“运行秋招雷达”，Agent 会询问求职偏好、搜索岗位、写回结果并启动网页。');
