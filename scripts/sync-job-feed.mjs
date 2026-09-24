const feedUrl = process.env.JOB_FEED_URL;
const radarUrl = (process.env.JOB_RADAR_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.JOB_FEED_TOKEN;

if (!feedUrl) {
  console.error('缺少 JOB_FEED_URL。请设置私有岗位 JSON 的文件路径或 HTTPS 地址。');
  process.exit(1);
}

async function readFeed(location) {
  if (/^https:\/\//i.test(location)) {
    const response = await fetch(location, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`读取岗位源失败：HTTP ${response.status}`);
    return response.json();
  }

  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  return JSON.parse(await readFile(resolve(location), 'utf8'));
}

const payload = await readFeed(feedUrl);
const jobs = Array.isArray(payload) ? payload : payload.jobs;
if (!Array.isArray(jobs)) throw new Error('岗位源格式错误：需要 JSON 数组或包含 jobs 数组的对象。');

let imported = 0;
for (let offset = 0; offset < jobs.length; offset += 25) {
  const batch = jobs.slice(offset, offset + 25);
  const response = await fetch(`${radarUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobs: batch }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`导入第 ${offset + 1}–${offset + batch.length} 条失败：HTTP ${response.status} ${detail}`);
  }
  imported += batch.length;
}

console.log(`已从私有岗位源同步 ${imported} 条岗位。`);
