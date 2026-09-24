'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationProfile, applicationProfileStorageKey, emptyApplicationProfile, importApplicationProfile, loadApplicationProfile, profileCompleteness, ProfileSection, saveApplicationProfile } from './application-profile';
import { prepareAgentHandoff } from './agent-handoff';
import { ApplicationRun, closeApplication, readApplication, resumeApplication, startApplication, uploadApplicationResume } from './application-runner';
import { ProfileVault } from './profile-vault';
import { loadResumeFile, loadResumeMetadata, ResumeMetadata, saveResumeFile } from './resume-vault';

type Job = {
  id: string; company: string; role: string; base: string[]; industry: string;
  companyType: string; track: string; tags: string[]; batch: string;
  graduationYear: number; officialUrl: string; applyStatus: string;
  remoteInterview: string; verifiedAt: string; duplicateCheck: string;
  score: number; scoreReason: string; notes?: string; source: string;
};

const progressStages = ['关注', '准备材料', '已投递', '测评', '面试中', 'Offer', '已结束'];
const activeStatuses = new Set(['准备材料', '已投递', '测评', '面试中', 'Offer']);

function colorFor(company: string) {
  const colors = ['#ff6a2b', '#397cff', '#171717', '#e33b34', '#7a4df3', '#16876b', '#d49316'];
  return colors[[...company].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

function daysSince(date: string) {
  const timestamp = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function freshnessLabel(date: string) {
  const days = daysSince(date);
  if (days === 0) return '今天核验';
  if (days <= 7) return `${days} 天前核验`;
  return `${date} 核验`;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [base, setBase] = useState('全部 Base');
  const [track, setTrack] = useState('全部方向');
  const [view, setView] = useState<'all' | 'high' | 'fresh' | 'active'>('all');
  const [selectedId, setSelectedId] = useState('');
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<ApplicationProfile>(emptyApplicationProfile);
  const [profileReady, setProfileReady] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [applicationRun, setApplicationRun] = useState<ApplicationRun | null>(null);
  const [applicationError, setApplicationError] = useState('');
  const [pendingApplication, setPendingApplication] = useState<Job | null>(null);
  const [startingApplication, setStartingApplication] = useState(false);
  const [resume, setResume] = useState<ResumeMetadata | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const profileTimer = window.setTimeout(() => {
      setProfile(loadApplicationProfile());
      loadResumeMetadata().then(setResume).catch(() => setProfileNotice('无法读取本地简历文件'));
      setProfileReady(true);
    }, 0);
    Promise.all([
      fetch('/api/jobs').then((response) => {
        if (!response.ok) throw new Error('jobs');
        return response.json() as Promise<Job[]>;
      }),
      fetch('/api/progress').then((response) => {
        if (!response.ok) throw new Error('progress');
        return response.json() as Promise<{ jobKey: string; status: string }[]>;
      }),
    ])
      .then(([jobRows, progressRows]) => {
        setJobs(jobRows);
        setProgress(Object.fromEntries(progressRows.map((row) => [row.jobKey, row.status])));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    const jobsTimer = window.setInterval(() => {
      fetch('/api/jobs')
        .then(response => { if (!response.ok) throw new Error('jobs'); return response.json() as Promise<Job[]>; })
        .then(setJobs)
        .catch(() => { /* Keep the last successful list during a temporary outage. */ });
    }, 60000);
    return () => { window.clearTimeout(profileTimer); window.clearInterval(jobsTimer); };
  }, []);

  useEffect(() => {
    const syncProfile = (event: StorageEvent) => {
      if (event.key !== applicationProfileStorageKey) return;
      setProfile(loadApplicationProfile());
      setProfileNotice('已同步另一个工作台标签页保存的资料');
    };
    window.addEventListener('storage', syncProfile);
    return () => window.removeEventListener('storage', syncProfile);
  }, []);

  useEffect(() => {
    if (!applicationRun || !['queued', 'running', 'waiting_user'].includes(applicationRun.status)) return;
    const timer = window.setInterval(() => {
      readApplication(applicationRun.id)
        .then(setApplicationRun)
        .catch((error) => setApplicationError(error instanceof Error ? error.message : '无法读取网申任务'));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [applicationRun]);

  const profileStatus = useMemo(() => profileCompleteness(profile), [profile]);

  function updateProfile(section: ProfileSection, field: string, value: string) {
    setProfile((current) => saveApplicationProfile({
      ...current,
      [section]: { ...current[section], [field]: value },
    }));
    setProfileNotice('已自动保存在当前浏览器');
  }

  function persistProfile() {
    setProfile(saveApplicationProfile(profile));
    setProfileNotice('资料已保存在当前浏览器，不会写入 Git');
  }

  function exportProfile() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'job-pilot-profile.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function handleProfileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setProfile(saveApplicationProfile(importApplicationProfile(JSON.parse(await file.text()))));
      setProfileNotice('资料已导入并自动保存，请核对');
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : '资料导入失败');
    } finally { event.target.value = ''; }
  }

  async function handleResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const metadata = await saveResumeFile(file);
      setResume(metadata);
      updateProfile('attachments', 'resumeName', metadata.name);
      setProfileNotice('简历与文件名已自动保存在当前浏览器');
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : '简历保存失败');
    } finally { event.target.value = ''; }
  }

  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const bases = [...new Set(jobs.flatMap((job) => job.base))].sort();
  const tracks = [...new Set(jobs.map((job) => job.track))].sort();
  const metrics = useMemo(() => ({
    fresh: jobs.filter((job) => daysSince(job.verifiedAt) <= 7).length,
    verified: jobs.filter((job) => job.applyStatus === '可投递').length,
    high: jobs.filter((job) => job.score >= 8).length,
    active: jobs.filter((job) => activeStatuses.has(progress[job.id] ?? '')).length,
  }), [jobs, progress]);
  const filtered = jobs.filter((job) => {
    const haystack = `${job.company}${job.role}${job.industry}${job.companyType}${job.tags.join('')}`.toLowerCase();
    const viewMatch = view === 'all' ||
      (view === 'high' && job.score >= 8) ||
      (view === 'fresh' && daysSince(job.verifiedAt) <= 7) ||
      (view === 'active' && activeStatuses.has(progress[job.id] ?? ''));
    return viewMatch && haystack.includes(query.toLowerCase()) &&
      (base === '全部 Base' || job.base.includes(base)) &&
      (track === '全部方向' || job.track === track);
  });

  function clearFilters() {
    setView('all'); setQuery(''); setBase('全部 Base'); setTrack('全部方向');
  }

  async function updateProgress(status: string) {
    if (!selected) return;
    const previous = progress[selected.id];
    setProgress((current) => ({ ...current, [selected.id]: status }));
    const response = await fetch('/api/progress', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobKey: selected.id, status }),
    });
    if (!response.ok) setProgress((current) => ({ ...current, [selected.id]: previous ?? '关注' }));
  }

  async function beginApplication() {
    if (!selected) { setApplicationError('请先选择岗位'); return; }
    if (!profileReady) { setApplicationError('资料库正在加载，请稍后重试'); return; }
    setPendingApplication(selected);
  }

  async function confirmApplication() {
    if (!pendingApplication || startingApplication) return;
    setStartingApplication(true);
    setApplicationError('');
    try {
      const savedProfile = loadApplicationProfile();
      const savedResume = await loadResumeFile();
      setProfile(savedProfile);
      prepareAgentHandoff(pendingApplication, savedProfile);
      setApplicationRun(await startApplication(pendingApplication, savedProfile, savedResume));
      setPendingApplication(null);
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : '无法启动 Browser Harness');
    } finally {
      setStartingApplication(false);
    }
  }

  async function continueApplication() {
    if (!applicationRun || !selected) return;
    const confirmed = window.confirm(
      `请确认你已经登录 ${selected.company} 招聘官网。\n\n下一步会把资料库中已填写的资料写入 ${selected.role} 的申请表，并在网站允许时上传基础简历；最终提交仍由你完成。是否开始填写？`,
    );
    if (!confirmed) return;
    setApplicationError('');
    try {
      setApplicationRun(await resumeApplication(applicationRun.id, loadApplicationProfile()));
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : '无法继续填写');
    }
  }

  async function uploadResumeToCompany() {
    if (!applicationRun?.resume_ready || !applicationRun.resume_name || !selected) return;
    const confirmed = window.confirm(
      `即将把本机资料库中的 ${applicationRun.resume_name} 上传到 ${selected.company} 招聘页面。\n\n只上传文件，不会点击最终提交。是否继续？`,
    );
    if (!confirmed) return;
    setApplicationError('');
    try {
      setApplicationRun(await uploadApplicationResume(applicationRun.id));
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : '无法上传基础简历');
    }
  }

  async function stopApplication() {
    if (!applicationRun) return;
    try {
      setApplicationRun(await closeApplication(applicationRun.id));
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : '无法关闭任务');
    }
  }

  return <main>
    {pendingApplication && <div role="dialog" aria-modal="true" aria-label="确认启动智能填写" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0009', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: '#fff', padding: 28, maxWidth: 520, margin: 20 }}>
        <h2>确认启动智能填写</h2>
        <p>{pendingApplication.company} · {pendingApplication.role}</p>
        <p>将打开招聘官网，并将已保存的个人、联系方式和教育资料用于填写。{resume ? `包含基础简历 ${resume.name}。` : ''}登录和验证码由你完成，最终提交仍由你确认。</p>
        {applicationError && <p role="alert">{applicationError}</p>}
        <button className="primary" onClick={confirmApplication} disabled={startingApplication}>{startingApplication ? '正在读取资料并启动浏览器…' : '确认并打开浏览器'}</button>
        <button onClick={() => setPendingApplication(null)} disabled={startingApplication}>取消</button>
      </div>
    </div>}
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">秋</span><span>秋招雷达 <small>JOB PILOT</small></span></a>
      <nav><a href="#profile">网申资料库</a><a href="#jobs">机会雷达</a><a href="#agent-flow">数据与网申</a><a href="#workflow">投递驾驶舱</a></nav>
      <button className="ghost" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>查看运行方式 <span>↘</span></button>
    </header>

    <section className="dashboard-hero" id="top">
      <div className="hero-intro">
        <p className="eyebrow"><span /> LOCAL-FIRST JOB WORKBENCH</p>
        <h1>岗位持续更新，<br /><em>投递按需接管。</em></h1>
        <p>定时数据任务负责发现、去重和更新岗位；需要网申时，本地 Browser Harness 直接打开官网并填写，未知网站再由 Codex 接管。</p>
        <div className="hero-actions"><button className="primary compact" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>了解运行架构 <span>↓</span></button><a href="#jobs">查看岗位库</a></div>
      </div>
      <div className="radar-status">
        <div className="radar-visual" aria-hidden="true"><i /><i /><i /><span /></div>
        <div className="radar-copy"><small>RADAR STATUS</small><strong>{loading ? '正在连接工作台' : loadError ? '数据服务未连接' : jobs.length ? '岗位雷达已就绪' : '等待岗位数据'}</strong><p>{jobs.length ? `正在管理 ${jobs.length} 个官网核验岗位` : '仓库不附带演示岗位，等待定时采集或外部数据导入。'}</p></div>
      </div>
    </section>

    <section className="metric-grid" aria-label="求职概览">
      <button className={view === 'fresh' ? 'active' : ''} onClick={() => setView(view === 'fresh' ? 'all' : 'fresh')}><small>近 7 天新增 / 更新</small><strong>{String(metrics.fresh).padStart(2, '0')}</strong><span>保持岗位新鲜度 ↗</span></button>
      <button onClick={() => setView('all')}><small>官网核验可投</small><strong>{String(metrics.verified).padStart(2, '0')}</strong><span>不是转载链接 ↗</span></button>
      <button className={view === 'high' ? 'active' : ''} onClick={() => setView(view === 'high' ? 'all' : 'high')}><small>高匹配机会</small><strong>{String(metrics.high).padStart(2, '0')}</strong><span>匹配分 ≥ 8.0 ↗</span></button>
      <button className={view === 'active' ? 'active' : ''} onClick={() => setView(view === 'active' ? 'all' : 'active')}><small>正在推进</small><strong>{String(metrics.active).padStart(2, '0')}</strong><span>材料到 Offer ↗</span></button>
    </section>

    <ProfileVault profile={profile} ready={profileReady} notice={profileNotice} completeness={profileStatus} importInput={importInput} onChange={updateProfile} onSave={persistProfile} onExport={exportProfile} onImport={handleProfileImport} resume={resume} onResume={handleResume} />

    <section className="agent-flow" id="agent-flow">
      <div className="flow-copy"><p className="section-no">02 / 分层运行</p><h2>数据定时更新，<br />网申登录后再填写。</h2><p>Browser Harness 会打开目标岗位并主动触发登录入口；你只负责手机号、扫码或验证码验证，完成后回到工作台继续填写。</p><div className="flow-steps"><span><b>1</b>打开目标岗位</span><span><b>2</b>Harness 触发登录</span><span><b>3</b>用户完成验证</span><span><b>4</b>填写并人工提交</span></div></div>
      <div className="run-console"><div className="console-head"><span>LOCAL HARNESS</span><i>{jobs.length ? 'READY' : 'NO DATA'}</i></div><div className="console-line"><b>01</b><span>首次执行 <strong>npm run setup</strong></span><i className="done">安装浏览器</i></div><div className="console-line"><b>02</b><span>执行 <strong>npm run dev:all</strong></span><i>网页 + Harness</i></div><div className="console-line"><b>03</b><span>点击 <strong>智能填写</strong></span><i>无需模型 Key</i></div><div className="console-foot"><span className="pulse" /> {jobs.length ? `工作台已有 ${jobs.length} 个岗位` : '等待采集任务写入'}<code>127.0.0.1:8765</code></div></div>
    </section>

    <section className="workspace" id="jobs">
      <div className="job-panel">
        <div className="panel-head"><div><p className="section-no">03 / 机会雷达</p><h2>{view === 'high' ? '高匹配机会' : view === 'fresh' ? '最近核验岗位' : view === 'active' ? '正在推进的岗位' : '官网可投岗位'}</h2></div><button className="clear-filter" onClick={clearFilters}>清除筛选</button></div>
        <div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、行业或技术栈" /></label><select value={base} onChange={(event) => setBase(event.target.value)}><option>全部 Base</option>{bases.map((item) => <option key={item}>{item}</option>)}</select><select value={track} onChange={(event) => setTrack(event.target.value)}><option>全部方向</option>{tracks.map((item) => <option key={item}>{item}</option>)}</select></div>
        <p className="result-count">显示 {filtered.length} / {jobs.length} · 按最近核验排序</p>
        <div className="job-list">{filtered.map((job) => <button key={job.id} className={`job-row ${selected?.id === job.id ? 'active' : ''}`} onClick={() => setSelectedId(job.id)}><span className="company-icon" style={{ background: colorFor(job.company) }}>{job.company[0]}</span><span className="job-main"><span className="job-meta"><i>{freshnessLabel(job.verifiedAt)}</i><i>{progress[job.id] ?? '关注'}</i></span><strong>{job.role}</strong><span>{job.company} · {job.companyType}</span><small>{job.industry}</small></span><span className="bases">{job.base.map((item) => <i key={item}>⌖ {item}</i>)}</span><span className="tags">{job.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span><span className="score-pill">{job.score.toFixed(1)}</span></button>)}
          {!loading && !loadError && filtered.length === 0 && <div className="empty-state"><span>◎</span><strong>{jobs.length ? '当前筛选没有结果' : '这里不会预装虚构岗位'}</strong><p>{jobs.length ? '调整关键词、Base 或方向继续查看。' : '岗位由定时采集或外部数据任务写入，网页不会现场调用 Agent 搜索。'}</p><button className="secondary" onClick={jobs.length ? clearFilters : () => document.querySelector('#agent-flow')?.scrollIntoView()}>{jobs.length ? '清除筛选' : '查看运行架构'}</button></div>}
          {loading && <div className="empty-state"><span className="spinner">◌</span><strong>正在读取私人岗位库</strong></div>}
          {loadError && <div className="empty-state error"><span>!</span><strong>数据服务暂时不可用</strong><p>确认本地开发服务器和数据库迁移已经正常启动。</p></div>}
        </div>
      </div>

      <aside className="action-panel" id="workflow"><p className="section-no">04 / 投递驾驶舱</p>{selected ? <><div className="selected-company"><span style={{ background: colorFor(selected.company) }}>{selected.company[0]}</span><div><small>{selected.source} · {selected.batch}</small><strong>{selected.company}</strong></div></div><h2>{selected.role}</h2><div className="evidence"><span><b>✓</b> 官方详情页</span><span><b>✓</b> {selected.duplicateCheck}</span><span><b>✓</b> {freshnessLabel(selected.verifiedAt)}</span></div><div className="fact-grid"><div><small>BASE</small><strong>{selected.base.join(' / ')}</strong></div><div><small>方向</small><strong>{selected.track}</strong></div><div><small>远程面试</small><strong>{selected.remoteInterview}</strong></div><div><small>状态</small><strong className="live">● {selected.applyStatus}</strong></div></div><p className="score-reason"><b>{selected.score.toFixed(1)}</b><span>{selected.scoreReason}</span></p>{selected.notes && <p className="warning-note">⚠ {selected.notes}</p>}<label className="progress-select"><span>我的投递阶段</span><select value={progress[selected.id] ?? '关注'} onChange={(event) => updateProgress(event.target.value)}>{progressStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><div className="steps"><p><b>1</b><span><strong>Browser Harness 打开官网</strong><small>已支持网站使用确定性适配器</small></span></p><p><b>2</b><span><strong>登录后继续填写</strong><small>未知与敏感问题留给用户</small></span></p><p><b>3</b><span><strong>停在提交前检查</strong><small>附件与最终提交保持人工确认</small></span></p></div>{(applicationRun || applicationError) && <div className={`application-run ${applicationRun?.status ?? 'failed'}`}><span>{applicationRun?.status === 'running' ? '● RUNNING' : applicationRun?.status === 'waiting_user' ? '● YOUR TURN' : applicationRun?.status === 'review' ? '● REVIEW' : applicationRun?.status === 'unsupported' ? '● CODEX' : '● NOTICE'}</span><strong>{applicationError || applicationRun?.message}</strong>{applicationRun?.result && <small>{applicationRun.result}</small>}{applicationRun?.status === 'waiting_user' && <button onClick={continueApplication}>我已登录，继续填写</button>}{applicationRun?.status === 'review' && applicationRun.resume_ready && <button onClick={uploadResumeToCompany}>确认后上传基础简历</button>}{applicationRun && !['closed', 'failed'].includes(applicationRun.status) && <button onClick={stopApplication}>关闭任务与浏览器</button>}</div>}<div className="action-buttons"><button className="primary" onClick={beginApplication} disabled={applicationRun ? ['queued', 'running'].includes(applicationRun.status) : false}>智能填写 <span>↗</span></button><a className="secondary" href={selected.officialUrl} target="_blank" rel="noreferrer">只打开官网</a></div><p className="note">资料只发送给本机 Browser Harness 和当前招聘网站。验证码、附件上传与最终提交由你完成；未知网站可切换为 Codex 接管。</p></> : <div className="empty action-empty"><span>↗</span><strong>选中岗位后继续行动</strong><p>岗位证据、匹配理由和投递阶段会集中显示在这里。</p></div>}</aside>
    </section>

    <section className="trust-strip"><p className="section-no">05 / 为什么不是一次聊天</p><div><strong>持续发现</strong><span>轮换来源，避免只看到搜索排名靠前的大厂。</span></div><div><strong>证据收口</strong><span>二级渠道只做线索，最终以招聘官网为准。</span></div><div><strong>长期状态</strong><span>岗位、核验时间和投递阶段持续留在你的数据库。</span></div><div><strong>安全行动</strong><span>敏感资料、附件和最终提交始终需要确认。</span></div></section>
    <footer><span>秋招雷达 · JOB PILOT</span><p>招聘信息以企业官网实时状态为准；仓库不包含真实岗位或个人投递数据。</p></footer>
  </main>;
}
