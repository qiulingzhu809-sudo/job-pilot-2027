import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { applicationProgress } from '../../../db/schema';

async function userId() {
  return (await getChatGPTUser())?.userId ?? 'local-preview';
}

export async function GET() {
  const uid = await userId();
  const rows = await getDb().select().from(applicationProgress).where(eq(applicationProgress.userId, uid));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const uid = await userId();
  const body = await request.json() as { jobKey?: string; status?: string; note?: string };
  if (!body.jobKey || !body.status) return NextResponse.json({ error: '缺少岗位或状态' }, { status: 400 });
  const allowed = new Set(['关注', '准备材料', '已投递', '面试中', '已结束']);
  if (!allowed.has(body.status)) return NextResponse.json({ error: '无效状态' }, { status: 400 });
  const db = getDb();
  const existing = await db.select({ id: applicationProgress.id }).from(applicationProgress).where(and(eq(applicationProgress.userId, uid), eq(applicationProgress.jobKey, body.jobKey))).limit(1);
  const values = { userId: uid, jobKey: body.jobKey, status: body.status, note: body.note ?? '', updatedAt: new Date() };
  if (existing[0]) await db.update(applicationProgress).set(values).where(eq(applicationProgress.id, existing[0].id));
  else await db.insert(applicationProgress).values(values);
  return NextResponse.json({ ok: true, ...values });
}
