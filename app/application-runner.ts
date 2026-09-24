import type { ApplicationProfile } from './application-profile';

export type ApplicationRun = {
  id: string;
  status: 'queued' | 'running' | 'waiting_user' | 'ready' | 'review' | 'unsupported' | 'failed' | 'closed';
  message: string;
  step: number;
  created_at: string;
  updated_at: string;
  result: string | null;
  resume_name: string | null;
  resume_ready: boolean;
};

type JobTarget = { company: string; role: string; officialUrl: string };
const harnessUrl = process.env.NEXT_PUBLIC_BROWSER_HARNESS_URL ?? 'http://127.0.0.1:8765';

async function harnessRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${harnessUrl}${path}`, { ...init, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `Browser Harness 请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export function startApplication(job: JobTarget, profile: ApplicationProfile, resume: File | null) {
  const body = new FormData();
  body.set('payload', JSON.stringify({ job: { company: job.company, role: job.role, official_url: job.officialUrl }, profile }));
  if (resume) body.set('resume', resume);
  return harnessRequest<ApplicationRun>('/applications', {
    method: 'POST',
    body,
  });
}

export function readApplication(id: string) {
  return harnessRequest<ApplicationRun>(`/applications/${encodeURIComponent(id)}`);
}

export function resumeApplication(id: string, profile: ApplicationProfile) {
  return harnessRequest<ApplicationRun>(`/applications/${encodeURIComponent(id)}/resume`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
}

export function uploadApplicationResume(id: string) {
  return harnessRequest<ApplicationRun>(`/applications/${encodeURIComponent(id)}/upload-resume`, { method: 'POST' });
}

export function closeApplication(id: string) {
  return harnessRequest<ApplicationRun>(`/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
