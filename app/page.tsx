'use client';

import { useEffect, useMemo, useState } from 'react';

type Job = {
  id: string;
  company: string;
  role: string;
  base: string[];
  industry: string;
  companyType: string;
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
  source: string;
};

function colorFor(company: string) {
  const colors = ['#ff6a2b','#397cff','#171717','#e33b34','#7a4df3','#16876b','#d49316'];
  return colors[[...company].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

export default function Home() {
  const [imported, setImported] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [base, setBase] = useState('全部 Base');
  const [track, setTrack] = useState('全部方向');
  const [selectedId, setSelectedId] = useState('');
  const [progress, setProgress] = useState<Record<string,string>>({});

  useEffect(() => {
    fetch('/api/jobs')
      .then((response) => (response.ok ? response.json() : []))
      .then(setImported)
      .catch(() => {});
    fetch('/api/progress')
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: { jobKey: string; status: string }[]) => {
        setProgress(Object.fromEntries(rows.map((row) => [row.jobKey, row.status])));
      })
      .catch(() => {});
  }, []);

  const allJobs = useMemo(() => imported, [imported]);
  const selected = allJobs.find((job) => job.id === selectedId) ?? allJobs[0];
  const bases = [...new Set(allJobs.flatMap((job) => job.base))].sort();
  const tracks = [...new Set(allJobs.map((job) => job.track))].sort();
  const filtered = allJobs.filter((job) => {
    const haystack = `${job.company}${job.role}${job.industry}${job.tags.join('')}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (base === '全部 Base' || job.base.includes(base)) && (track === '全部方向' || job.track === track);
  });

  const updateProgress = async (status: string) => {
    if (!selected) return;
    const key = selected.id; setProgress((old) => ({...old,[key]:status}));
    await fetch('/api/progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobKey:key,status})});
  };

  return <main>
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">秋</span><span>秋招雷达 <small>2027</small></span></a>
      <nav><a href="#jobs">岗位库</a><a href="#agent-flow">Agent 工作流</a><a href="#workflow">投递行动台</a></nav>
      <button className="ghost" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>Agent 自动流程</button>
    </header>

    <section className="hero" id="top"><div><p className="eyebrow"><span/> 官网核验 · Agent 协作</p><h1>让 Agent 去找，<br/><em>由你决定投。</em></h1><p className="hero-copy">从 README 启动 Agent。它会询问求职偏好、调用 Browser Use、把结果写入你的岗位数据库，然后为你打开这张工作台。这里不需要复制任何提示词。</p></div><div className="scorecard"><div><strong>{String(allJobs.length).padStart(2,'0')}</strong><span>岗位库</span></div><div><strong>{new Set(allJobs.map((job)=>job.company)).size}</strong><span>目标公司</span></div><div><strong>{imported.length}</strong><span>Agent 核验</span></div><p>官网核验数据 <span>REVIEW FIRST</span></p></div></section>

    <section className="agent-flow" id="agent-flow">
      <div className="flow-copy"><p className="section-no">01 / AGENT 自动流程</p><h2>一句“运行秋招雷达”就够了</h2><p>Agent 从仓库说明中发现 Skill，先询问你的岗位与城市偏好，再用 Browser Use 核验官网。结果通过 API 写入岗位数据库，随后打开本页。</p><div className="flow-steps"><span><b>1</b>询问求职偏好</span><span><b>2</b>浏览招聘官网</span><span><b>3</b>写入私人数据库</span><span><b>4</b>打开本地工作台</span></div></div>
      <div className="import-panel"><div className="import-head"><div><small>PRIVATE JOB DATABASE</small><strong>{allJobs.length ? '本轮结果已载入' : '等待 Agent 首次搜索'}</strong></div><span className="live">● {allJobs.length ? 'READY' : 'SETUP'}</span></div><p className="agent-state-copy">{allJobs.length ? `数据库中有 ${allJobs.length} 个官网核验岗位。重新让 Agent 运行秋招雷达即可更新。` : '按照 README 完成 setup:agent 后，回到 Agent 对话说“运行秋招雷达”。搜索结果会通过 API 写入本地数据库并自动显示。'}</p><code>POST /api/jobs</code></div>
    </section>

    <section className="workspace" id="jobs"><div className="job-panel"><div className="panel-head"><div><p className="section-no">02 / 岗位库</p><h2>官网可投岗位</h2></div><p className="result-count">显示 {filtered.length} / {allJobs.length}</p></div><div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索公司、岗位或技术栈"/></label><select value={base} onChange={(event)=>setBase(event.target.value)}><option>全部 Base</option>{bases.map((item)=><option key={item}>{item}</option>)}</select><select value={track} onChange={(event)=>setTrack(event.target.value)}><option>全部方向</option>{tracks.map((item)=><option key={item}>{item}</option>)}</select></div><div className="job-list">{filtered.map((job)=><button key={job.id} className={`job-row ${selected?.id===job.id?'active':''}`} onClick={()=>setSelectedId(job.id)}><span className="company-icon" style={{background:colorFor(job.company)}}>{job.company[0]}</span><span className="job-main"><strong>{job.role}</strong><span>{job.company} · {job.companyType}</span><small>{job.industry}</small></span><span className="bases">{job.base.map((item)=><i key={item}>⌖ {item}</i>)}</span><span className="tags">{job.tags.slice(0,2).map((tag)=><i key={tag}>{tag}</i>)}</span><span className="score-pill">{job.score.toFixed(1)}</span></button>)}{filtered.length===0&&<div className="empty">{allJobs.length ? '没有匹配结果，换个关键词或清除筛选。' : '岗位库为空，运行秋招雷达后会自动显示结果。'}</div>}</div></div>
      <aside className="action-panel" id="workflow"><p className="section-no">03 / 投递行动台</p>{selected ? <><div className="selected-company"><span style={{background:colorFor(selected.company)}}>{selected.company[0]}</span><div><small>{selected.source}</small><strong>{selected.company}</strong></div></div><h2>{selected.role}</h2><div className="fact-grid"><div><small>BASE</small><strong>{selected.base.join(' / ')}</strong></div><div><small>方向</small><strong>{selected.track}</strong></div><div><small>核验</small><strong>{selected.verifiedAt}</strong></div><div><small>状态</small><strong className="live">● {selected.applyStatus}</strong></div></div><p className="score-reason"><b>{selected.score.toFixed(1)}</b><span>{selected.scoreReason}</span></p>{selected.notes&&<p className="warning-note">⚠ {selected.notes}</p>}<label className="progress-select"><span>我的进度</span><select value={progress[selected.id]??'关注'} onChange={(event)=>updateProgress(event.target.value)}><option>关注</option><option>准备材料</option><option>已投递</option><option>面试中</option><option>已结束</option></select></label><div className="steps"><p><b>1</b><span><strong>打开官网复核</strong><small>确认 JD、届别与投递状态</small></span></p><p><b>2</b><span><strong>回到 Agent 说明选择</strong><small>说“帮我投递 {selected.company} 的这个岗位”</small></span></p><p><b>3</b><span><strong>确认后填写</strong><small>上传与最终提交分别确认</small></span></p></div><a className="primary" href={selected.officialUrl} target="_blank" rel="noreferrer">打开官方岗位 <span>↗</span></a><p className="note">Agent 会从当前页面或岗位名称识别目标，不需要复制提示词。不会未经确认上传简历或提交申请。</p></> : <div className="empty"><strong>岗位库还是空的</strong><p>运行秋招雷达后，Agent 会把官网核验结果写入你的数据库。</p></div>}</aside></section>

    <section className="profile-strip" id="profile"><p className="section-no">04 / 资料安全</p><div><h2>资料留在你选择的位置，平台只保存岗位和进度。</h2><p>Agent 开始填写前会先询问简历版本；姓名、联系方式、经历等写入目标网站前必须确认。</p></div><a href="https://github.com/qiulingzhu809-sudo/job-pilot-2027/tree/main/skills/campus-job-radar" target="_blank" rel="noreferrer">查看 Skill 规范 ↗</a></section><footer><span>秋招雷达 2027</span><p>招聘信息以企业官网实时状态为准；最终投递由你决定。</p></footer>
  </main>;
}
