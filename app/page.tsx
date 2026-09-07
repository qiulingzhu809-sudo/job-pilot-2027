'use client';

import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
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
  }, []);

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

  return <main>
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">秋</span><span>秋招雷达 <small>JOB PILOT</small></span></a>
      <nav><a href="#jobs">机会雷达</a><a href="#agent-flow">运行流程</a><a href="#workflow">投递驾驶舱</a></nav>
      <button className="ghost" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>运行雷达 <span>↘</span></button>
    </header>

    <section className="dashboard-hero" id="top">
      <div className="hero-intro">
        <p className="eyebrow"><span /> LOCAL-FIRST JOB AGENT</p>
        <h1>你的 Agent，<br /><em>持续盯住机会。</em></h1>
        <p>从多种渠道发现公司，在招聘官网确认岗位，再根据你的方向排序。搜索、核验和投递进度都沉淀到自己的工作台。</p>
        <div className="hero-actions"><button className="primary compact" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>开始一次雷达扫描 <span>↓</span></button><a href="#jobs">查看岗位库</a></div>
      </div>
      <div className="radar-status">
        <div className="radar-visual" aria-hidden="true"><i /><i /><i /><span /></div>
        <div className="radar-copy"><small>RADAR STATUS</small><strong>{loading ? '正在连接工作台' : loadError ? '数据服务未连接' : jobs.length ? '岗位雷达已就绪' : '等待首次扫描'}</strong><p>{jobs.length ? `正在管理 ${jobs.length} 个官网核验岗位` : '仓库不附带演示岗位，首轮结果由你的 Agent 建立。'}</p></div>
      </div>
    </section>

    <section className="metric-grid" aria-label="求职概览">
      <button className={view === 'fresh' ? 'active' : ''} onClick={() => setView(view === 'fresh' ? 'all' : 'fresh')}><small>近 7 天新增 / 更新</small><strong>{String(metrics.fresh).padStart(2, '0')}</strong><span>保持岗位新鲜度 ↗</span></button>
      <button onClick={() => setView('all')}><small>官网核验可投</small><strong>{String(metrics.verified).padStart(2, '0')}</strong><span>不是转载链接 ↗</span></button>
      <button className={view === 'high' ? 'active' : ''} onClick={() => setView(view === 'high' ? 'all' : 'high')}><small>高匹配机会</small><strong>{String(metrics.high).padStart(2, '0')}</strong><span>匹配分 ≥ 8.0 ↗</span></button>
      <button className={view === 'active' ? 'active' : ''} onClick={() => setView(view === 'active' ? 'all' : 'active')}><small>正在推进</small><strong>{String(metrics.active).padStart(2, '0')}</strong><span>材料到 Offer ↗</span></button>
    </section>

    <section className="agent-flow" id="agent-flow">
      <div className="flow-copy"><p className="section-no">01 / 一句话启动</p><h2>回到 Agent，说“运行秋招雷达”</h2><p>第一次运行时，Agent 会询问届别、方向、Base 和行业偏好。之后它从多来源扩展公司池，到官方招聘系统核验，再自动把结果送回这里。</p><div className="flow-steps"><span><b>1</b>理解你的方向</span><span><b>2</b>多来源发现公司</span><span><b>3</b>招聘官网核验</span><span><b>4</b>结果进入工作台</span></div></div>
      <div className="run-console"><div className="console-head"><span>AGENT RUNBOOK</span><i>{jobs.length ? 'READY' : 'FIRST RUN'}</i></div><div className="console-line"><b>01</b><span>执行 <strong>npm run setup:agent</strong></span><i className="done">安装 Skill</i></div><div className="console-line"><b>02</b><span>告诉 Agent <strong>运行秋招雷达</strong></span><i>无需复制提示词</i></div><div className="console-line"><b>03</b><span>Agent 写入 <strong>私人岗位数据库</strong></span><i>不会提交到 Git</i></div><div className="console-foot"><span className="pulse" /> {jobs.length ? `已接收 ${jobs.length} 个岗位` : '等待 Agent 首次写入'}<code>POST /api/jobs</code></div></div>
    </section>

    <section className="workspace" id="jobs">
      <div className="job-panel">
        <div className="panel-head"><div><p className="section-no">02 / 机会雷达</p><h2>{view === 'high' ? '高匹配机会' : view === 'fresh' ? '最近核验岗位' : view === 'active' ? '正在推进的岗位' : '官网可投岗位'}</h2></div><button className="clear-filter" onClick={clearFilters}>清除筛选</button></div>
        <div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、行业或技术栈" /></label><select value={base} onChange={(event) => setBase(event.target.value)}><option>全部 Base</option>{bases.map((item) => <option key={item}>{item}</option>)}</select><select value={track} onChange={(event) => setTrack(event.target.value)}><option>全部方向</option>{tracks.map((item) => <option key={item}>{item}</option>)}</select></div>
        <p className="result-count">显示 {filtered.length} / {jobs.length} · 按最近核验排序</p>
        <div className="job-list">{filtered.map((job) => <button key={job.id} className={`job-row ${selected?.id === job.id ? 'active' : ''}`} onClick={() => setSelectedId(job.id)}><span className="company-icon" style={{ background: colorFor(job.company) }}>{job.company[0]}</span><span className="job-main"><span className="job-meta"><i>{freshnessLabel(job.verifiedAt)}</i><i>{progress[job.id] ?? '关注'}</i></span><strong>{job.role}</strong><span>{job.company} · {job.companyType}</span><small>{job.industry}</small></span><span className="bases">{job.base.map((item) => <i key={item}>⌖ {item}</i>)}</span><span className="tags">{job.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span><span className="score-pill">{job.score.toFixed(1)}</span></button>)}
          {!loading && !loadError && filtered.length === 0 && <div className="empty-state"><span>◎</span><strong>{jobs.length ? '当前筛选没有结果' : '这里不会预装虚构岗位'}</strong><p>{jobs.length ? '调整关键词、Base 或方向继续查看。' : '完成 setup:agent 后，在 Agent 对话中说“运行秋招雷达”。它会核验真实岗位并自动写入工作台。'}</p><button className="secondary" onClick={jobs.length ? clearFilters : () => document.querySelector('#agent-flow')?.scrollIntoView()}>{jobs.length ? '清除筛选' : '查看运行方法'}</button></div>}
          {loading && <div className="empty-state"><span className="spinner">◌</span><strong>正在读取私人岗位库</strong></div>}
          {loadError && <div className="empty-state error"><span>!</span><strong>数据服务暂时不可用</strong><p>确认本地开发服务器和数据库迁移已经正常启动。</p></div>}
        </div>
      </div>

      <aside className="action-panel" id="workflow"><p className="section-no">03 / 投递驾驶舱</p>{selected ? <><div className="selected-company"><span style={{ background: colorFor(selected.company) }}>{selected.company[0]}</span><div><small>{selected.source} · {selected.batch}</small><strong>{selected.company}</strong></div></div><h2>{selected.role}</h2><div className="evidence"><span><b>✓</b> 官方详情页</span><span><b>✓</b> {selected.duplicateCheck}</span><span><b>✓</b> {freshnessLabel(selected.verifiedAt)}</span></div><div className="fact-grid"><div><small>BASE</small><strong>{selected.base.join(' / ')}</strong></div><div><small>方向</small><strong>{selected.track}</strong></div><div><small>远程面试</small><strong>{selected.remoteInterview}</strong></div><div><small>状态</small><strong className="live">● {selected.applyStatus}</strong></div></div><p className="score-reason"><b>{selected.score.toFixed(1)}</b><span>{selected.scoreReason}</span></p>{selected.notes && <p className="warning-note">⚠ {selected.notes}</p>}<label className="progress-select"><span>我的投递阶段</span><select value={progress[selected.id] ?? '关注'} onChange={(event) => updateProgress(event.target.value)}>{progressStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><div className="steps"><p><b>1</b><span><strong>打开官网复核</strong><small>确认 JD、届别与最新状态</small></span></p><p><b>2</b><span><strong>让 Agent 匹配材料</strong><small>选择简历版本并核对字段</small></span></p><p><b>3</b><span><strong>确认后协助填写</strong><small>上传与最终提交分别确认</small></span></p></div><a className="primary" href={selected.officialUrl} target="_blank" rel="noreferrer">打开官方岗位 <span>↗</span></a><p className="note">登录、验证码、附件上传和最终提交都保留人工确认。平台不会替你编造求职资料。</p></> : <div className="empty action-empty"><span>↗</span><strong>选中岗位后继续行动</strong><p>岗位证据、匹配理由和投递阶段会集中显示在这里。</p></div>}</aside>
    </section>

    <section className="trust-strip"><p className="section-no">04 / 为什么不是一次聊天</p><div><strong>持续发现</strong><span>轮换来源，避免只看到搜索排名靠前的大厂。</span></div><div><strong>证据收口</strong><span>二级渠道只做线索，最终以招聘官网为准。</span></div><div><strong>长期状态</strong><span>岗位、核验时间和投递阶段持续留在你的数据库。</span></div><div><strong>安全行动</strong><span>敏感资料、附件和最终提交始终需要确认。</span></div></section>
    <footer><span>秋招雷达 · JOB PILOT</span><p>招聘信息以企业官网实时状态为准；仓库不包含真实岗位或个人投递数据。</p></footer>
  </main>;
}
