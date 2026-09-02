import { env } from 'cloudflare:workers';
import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

type AgentJob = {
  company: string;
  role: string;
  companyType: string;
  industry: string;
  base: string[];
  track: string;
  tags: string[];
  batch: string;
  graduationYear: number;
  officialUrl: string;
  applyStatus: string;
  remoteInterview: string;
  verifiedAt: string;
  duplicateCheck: string;
  score: number;
  scoreReason: string;
  notes?: string;
};

async function currentUserId() {
  return (await getChatGPTUser())?.userId ?? 'local-preview';
}

function isValid(job: AgentJob) {
  try {
    const url = new URL(job.officialUrl);
    return Boolean(job.company && job.role && job.companyType && job.industry && job.track && job.batch &&
      Array.isArray(job.base) && job.base.length && Array.isArray(job.tags) &&
      job.graduationYear === 2027 && job.applyStatus === '可投递' && url.protocol === 'https:' &&
      /^\d{4}-\d{2}-\d{2}$/.test(job.verifiedAt) && job.score >= 0 && job.score <= 10);
  } catch {
    return false;
  }
}

export async function GET() {
  const userId = await currentUserId();
  const result = await env.DB.prepare(`
    SELECT id, company, role, company_type, industry, base_json, track, tags_json,
      batch, graduation_year, official_url, apply_status, remote_interview,
      verified_at, duplicate_check, score_tenths, score_reason, notes
    FROM jobs WHERE user_id = ? ORDER BY verified_at DESC, id DESC
  `).bind(userId).all();
  const jobs = result.results.map((row) => ({
    id: `db-${row.id}`,
    company: row.company,
    role: row.role,
    companyType: row.company_type,
    industry: row.industry,
    base: JSON.parse(String(row.base_json)),
    track: row.track,
    tags: JSON.parse(String(row.tags_json)),
    batch: row.batch,
    graduationYear: row.graduation_year,
    officialUrl: row.official_url,
    applyStatus: row.apply_status,
    remoteInterview: row.remote_interview,
    verifiedAt: row.verified_at,
    duplicateCheck: row.duplicate_check,
    score: Number(row.score_tenths) / 10,
    scoreReason: row.score_reason,
    notes: row.notes,
    source: 'Agent 导入',
  }));
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  const body = await request.json() as { jobs?: AgentJob[] };
  if (!Array.isArray(body.jobs) || body.jobs.length === 0 || body.jobs.length > 25) {
    return NextResponse.json({ error: '每次需要导入 1–25 个岗位' }, { status: 400 });
  }
  const invalid = body.jobs.findIndex((job) => !isValid(job));
  if (invalid >= 0) return NextResponse.json({ error: `第 ${invalid + 1} 个岗位未通过官网、届别或字段校验` }, { status: 400 });

  const now = Date.now();
  const statements = body.jobs.map((job) => env.DB.prepare(`
    INSERT INTO jobs (
      user_id, company, role, company_type, industry, base_json, track, tags_json,
      batch, graduation_year, official_url, apply_status, remote_interview,
      verified_at, duplicate_check, score_tenths, score_reason, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, official_url) DO UPDATE SET
      company = excluded.company, role = excluded.role, company_type = excluded.company_type,
      industry = excluded.industry, base_json = excluded.base_json, track = excluded.track,
      tags_json = excluded.tags_json, batch = excluded.batch,
      graduation_year = excluded.graduation_year, apply_status = excluded.apply_status,
      remote_interview = excluded.remote_interview, verified_at = excluded.verified_at,
      duplicate_check = excluded.duplicate_check, score_tenths = excluded.score_tenths,
      score_reason = excluded.score_reason, notes = excluded.notes, updated_at = excluded.updated_at
  `).bind(
    userId, job.company, job.role, job.companyType, job.industry, JSON.stringify(job.base),
    job.track, JSON.stringify(job.tags.slice(0, 6)), job.batch, job.graduationYear,
    job.officialUrl, job.applyStatus, job.remoteInterview || '官网未说明', job.verifiedAt,
    job.duplicateCheck, Math.round(job.score * 10), job.scoreReason, job.notes ?? '', now, now,
  ));
  await env.DB.batch(statements);
  return NextResponse.json({ ok: true, imported: body.jobs.length });
}
