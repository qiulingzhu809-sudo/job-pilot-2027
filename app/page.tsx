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

type AgentJob = Omit<Job, 'id' | 'source'>;

const seed = (id: number, data: Partial<Job> & Pick<Job, 'company' | 'role' | 'officialUrl'>): Job => ({
  id: `seed-${id}`,
  base: ['未知'], industry: '互联网科技', companyType: '科技企业', track: '开发', tags: [],
  batch: '2027届校园招聘', graduationYear: 2027, applyStatus: '可投递', remoteInterview: '官网未说明',
  verifiedAt: '2026-09-01', duplicateCheck: '未发现重复', score: 8, scoreReason: '官网已核验', source: '内置核验',
  ...data,
});

const seedJobs: Job[] = [
  seed(1,{company:'影石 Insta360',role:'前端工程师-2027校招',base:['深圳'],industry:'智能影像 · 消费电子 · AI',companyType:'智能硬件科技企业',track:'前端',tags:['React','工程化','性能优化'],score:8.4,scoreReason:'方向匹配、产品场景完整；Base按中性7分计算',officialUrl:'https://arashivision.jobs.feishu.cn/campus/position/7663455345154640169/detail'}),
  seed(2,{company:'影石 Insta360',role:'Data Agent 全栈开发工程师',base:['深圳'],industry:'智能影像 · AI 数据平台',companyType:'智能硬件科技企业',track:'全栈',tags:['TypeScript','Python','RAG','Agent'],score:8.5,scoreReason:'全栈与AI匹配度高；JD存在正式/实习措辞差异',notes:'投递前建议向 HR 确认岗位性质',officialUrl:'https://arashivision.jobs.feishu.cn/campus/position/7678174819064318246/detail'}),
  seed(3,{company:'深信服',role:'开发工程师（Java/Python/Go）',base:['深圳'],industry:'网络安全 · 云计算 · 企业服务',companyType:'上市科技企业',track:'后端/全栈',tags:['Java','Python','Go','AI Agent'],score:8.2,scoreReason:'AI-Native培养完整，行业稳定',officialUrl:'https://hr.sangfor.com/campucompon/Delivery/4560'}),
  seed(4,{company:'4399',role:'游戏广告开发工程师（互动玩法）',base:['广州'],industry:'游戏 · 内容平台 · 出海',companyType:'游戏科技企业',track:'游戏前端',tags:['TypeScript','H5','Cocos'],score:8,scoreReason:'互动开发和作品集辨识度较高',officialUrl:'https://hr.4399om.com/campus/graduate/?jobType=campus_kaifalei&jobID=JO20260813005'}),
  seed(5,{company:'阿里巴巴',role:'前端开发工程师',base:['北京','杭州'],industry:'电商 · AI · 云计算',companyType:'大型民营科技',track:'前端',tags:['React','Node.js'],verifiedAt:'2026-08-06',officialUrl:'https://campus-talent.alibaba.com/campus/position/199907720100'}),
  seed(6,{company:'阿里巴巴',role:'全栈开发工程师',base:['北京','杭州'],industry:'电商 · AI · 云计算',companyType:'大型民营科技',track:'全栈',tags:['Java','跨端','AI'],verifiedAt:'2026-08-06',officialUrl:'https://campus-talent.alibaba.com/campus/position/199907720099'}),
  seed(7,{company:'腾讯',role:'AI 全栈工程师',base:['多地'],industry:'社交 · 游戏 · 云',companyType:'大型民营科技',track:'全栈',tags:['RAG','Agent','微服务'],remoteInterview:'支持远程面试',officialUrl:'https://join.qq.com/post_detail.html?postid=1282707398326592512&activity=1289677489068326912'}),
  seed(8,{company:'字节跳动',role:'飞书全栈工程师',base:['杭州','深圳'],industry:'协同办公 · AI',companyType:'大型民营科技',track:'全栈',tags:['Android','iOS','服务端'],officialUrl:'https://jobs.bytedance.com/campus/position/7668317078402828597/detail'}),
  seed(9,{company:'网易有道',role:'AI Agent 应用开发',base:['北京'],industry:'教育科技 · AI',companyType:'上市互联网公司',track:'前端',tags:['Web','移动端','Agent'],verifiedAt:'2026-08-27',officialUrl:'https://campus.163.com/app/detail/index?id=4858&projectId=103'}),
];

const sampleImport = `[
  {
    "company": "示例公司",
    "role": "前端开发工程师-2027校招",
    "companyType": "企业服务科技公司",
    "industry": "企业服务 · AI",
    "base": ["上海"],
    "track": "前端",
    "tags": ["React", "TypeScript"],
    "batch": "2027届秋季校园招聘",
    "graduationYear": 2027,
    "officialUrl": "https://careers.example.com/campus/position/123",
    "applyStatus": "可投递",
    "remoteInterview": "官网未说明",
    "verifiedAt": "2026-09-02",
    "duplicateCheck": "未发现重复",
    "score": 8.1,
    "scoreReason": "方向匹配；Base按中性7分计算",
    "notes": ""
  }
]`;

function colorFor(company: string) {
  const colors = ['#ff6a2b','#397cff','#171717','#e33b34','#7a4df3','#16876b','#d49316'];
  return colors[[...company].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

export default function Home() {
  const [imported, setImported] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [base, setBase] = useState('全部 Base');
  const [track, setTrack] = useState('全部方向');
  const [selectedId, setSelectedId] = useState(seedJobs[0].id);
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<AgentJob[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const [copied, setCopied] = useState('');
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

  const allJobs = useMemo(() => {
    const urls = new Set(imported.map((job) => job.officialUrl));
    return [...imported, ...seedJobs.filter((job) => !urls.has(job.officialUrl))];
  }, [imported]);
  const selected = allJobs.find((job) => job.id === selectedId) ?? allJobs[0];
  const bases = [...new Set(allJobs.flatMap((job) => job.base))].sort();
  const tracks = [...new Set(allJobs.map((job) => job.track))].sort();
  const filtered = allJobs.filter((job) => {
    const haystack = `${job.company}${job.role}${job.industry}${job.tags.join('')}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (base === '全部 Base' || job.base.includes(base)) && (track === '全部方向' || job.track === track);
  });

  const copy = async (name: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(name);
    setTimeout(() => setCopied(''), 1800);
  };
  const discoveryPrompt = `使用 $campus-job-radar 的 discover 模式。先按行业建立公司池，再逐家公司进入招聘官网，搜索并核验 2027 届校招岗位。我的关注方向优先前端、客户端和全栈，但岗位库不限方向。只输出符合 skill 结果数据契约的 JSON 数组，不要使用聚合站作为 officialUrl。`;
  const applyPrompt = `使用 $campus-job-radar 的 apply 模式协助申请这个岗位：${selected?.company}｜${selected?.role}｜${selected?.officialUrl}。先读取可见表单并建立字段映射，不要输入任何个人资料；询问我要使用的简历或资料文件。默认填写后停在最终提交前。输入个人资料、上传附件和最终提交时分别向我确认。`;

  const validateImport = () => {
    try {
      const data = JSON.parse(importText) as AgentJob[];
      if (!Array.isArray(data) || data.length === 0) throw new Error('需要一个非空 JSON 数组');
      const invalid = data.findIndex((job) => !job.company || !job.role || job.graduationYear !== 2027 || job.applyStatus !== '可投递' || !job.officialUrl?.startsWith('https://') || !Array.isArray(job.base));
      if (invalid >= 0) throw new Error(`第 ${invalid + 1} 条缺少官网、届别、状态或 Base`);
      setPreview(data);
      setImportMessage(`校验通过：${data.length} 个岗位等待保存`);
    } catch (error) {
      setPreview([]);
      setImportMessage(error instanceof Error ? error.message : 'JSON 无法解析');
    }
  };
  const saveImport = async () => {
    const response = await fetch('/api/jobs', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jobs:preview}) });
    const result = await response.json();
    if (!response.ok) return setImportMessage(result.error ?? '保存失败');
    const rows = await fetch('/api/jobs').then((r) => r.json());
    setImported(rows); setPreview([]); setImportText(''); setImportMessage(`已保存 ${result.imported} 个岗位`);
  };
  const updateProgress = async (status: string) => {
    const key = selected.id; setProgress((old) => ({...old,[key]:status}));
    await fetch('/api/progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobKey:key,status})});
  };

  return <main>
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">秋</span><span>秋招雷达 <small>2027</small></span></a>
      <nav><a href="#jobs">岗位库</a><a href="#agent-flow">Agent 工作流</a><a href="#workflow">投递行动台</a></nav>
      <button className="ghost" onClick={() => document.querySelector('#agent-flow')?.scrollIntoView()}>{imported.length ? `Agent 已导入 ${imported.length}` : '＋ Agent 导入'}</button>
    </header>

    <section className="hero" id="top"><div><p className="eyebrow"><span/> 官网核验 · Agent 协作</p><h1>让 Agent 去找，<br/><em>由你决定投。</em></h1><p className="hero-copy">Codex 或 Claude Code 负责公司发现、官网核验与结构化整理；秋招雷达负责审核、保存与投递进度。个人资料只在你确认后传给目标招聘网站。</p></div><div className="scorecard"><div><strong>{String(allJobs.length).padStart(2,'0')}</strong><span>岗位库</span></div><div><strong>{new Set(allJobs.map((job)=>job.company)).size}</strong><span>目标公司</span></div><div><strong>{imported.length}</strong><span>Agent 导入</span></div><p>官网核验数据 <span>REVIEW FIRST</span></p></div></section>

    <section className="agent-flow" id="agent-flow">
      <div className="flow-copy"><p className="section-no">01 / AGENT 工作流</p><h2>发现 → 审核 → 入库</h2><p>网站不会伪装成能直接控制你电脑上的 Agent。复制任务给 Codex / Claude Code，Agent 用 Browser Use 核验后返回 JSON，再粘贴回来审核保存。</p><div className="flow-steps"><span><b>1</b>复制发现任务</span><span><b>2</b>Agent 浏览官网</span><span><b>3</b>粘贴 JSON 审核</span><span><b>4</b>保存到岗位库</span></div><button className="primary compact" onClick={() => copy('discover',discoveryPrompt)}>{copied==='discover'?'发现任务已复制':'复制 Browser Use 发现任务'} <span>↗</span></button></div>
      <div className="import-panel"><div className="import-head"><div><small>AGENT JSON</small><strong>导入审核台</strong></div><button onClick={() => setImportText(sampleImport)}>载入格式示例</button></div><textarea value={importText} onChange={(event)=>setImportText(event.target.value)} placeholder="粘贴 $campus-job-radar 返回的 JSON 数组…"/><div className="import-actions"><button className="secondary" onClick={validateImport}>校验结果</button><button className="primary" disabled={!preview.length} onClick={saveImport}>保存 {preview.length || ''} 个岗位</button></div>{importMessage&&<p className={preview.length?'success-message':'error-message'}>{importMessage}</p>}{preview.length>0&&<div className="preview-list">{preview.map((job)=><div key={job.officialUrl}><strong>{job.company} · {job.role}</strong><span>{job.base.join('/')} · {job.industry} · {job.score.toFixed(1)}</span></div>)}</div>}</div>
    </section>

    <section className="workspace" id="jobs"><div className="job-panel"><div className="panel-head"><div><p className="section-no">02 / 岗位库</p><h2>官网可投岗位</h2></div><p className="result-count">显示 {filtered.length} / {allJobs.length}</p></div><div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索公司、岗位或技术栈"/></label><select value={base} onChange={(event)=>setBase(event.target.value)}><option>全部 Base</option>{bases.map((item)=><option key={item}>{item}</option>)}</select><select value={track} onChange={(event)=>setTrack(event.target.value)}><option>全部方向</option>{tracks.map((item)=><option key={item}>{item}</option>)}</select></div><div className="job-list">{filtered.map((job)=><button key={job.id} className={`job-row ${selected.id===job.id?'active':''}`} onClick={()=>setSelectedId(job.id)}><span className="company-icon" style={{background:colorFor(job.company)}}>{job.company[0]}</span><span className="job-main"><strong>{job.role}</strong><span>{job.company} · {job.companyType}</span><small>{job.industry}</small></span><span className="bases">{job.base.map((item)=><i key={item}>⌖ {item}</i>)}</span><span className="tags">{job.tags.slice(0,2).map((tag)=><i key={tag}>{tag}</i>)}</span><span className="score-pill">{job.score.toFixed(1)}</span></button>)}{filtered.length===0&&<div className="empty">没有匹配结果，换个关键词或清除筛选。</div>}</div></div>
      <aside className="action-panel" id="workflow"><p className="section-no">03 / 投递行动台</p><div className="selected-company"><span style={{background:colorFor(selected.company)}}>{selected.company[0]}</span><div><small>{selected.source}</small><strong>{selected.company}</strong></div></div><h2>{selected.role}</h2><div className="fact-grid"><div><small>BASE</small><strong>{selected.base.join(' / ')}</strong></div><div><small>方向</small><strong>{selected.track}</strong></div><div><small>核验</small><strong>{selected.verifiedAt}</strong></div><div><small>状态</small><strong className="live">● {selected.applyStatus}</strong></div></div><p className="score-reason"><b>{selected.score.toFixed(1)}</b><span>{selected.scoreReason}</span></p>{selected.notes&&<p className="warning-note">⚠ {selected.notes}</p>}<label className="progress-select"><span>我的进度</span><select value={progress[selected.id]??'关注'} onChange={(event)=>updateProgress(event.target.value)}><option>关注</option><option>准备材料</option><option>已投递</option><option>面试中</option><option>已结束</option></select></label><div className="steps"><p><b>1</b><span><strong>打开官网复核</strong><small>确认 JD、届别与投递状态</small></span></p><p><b>2</b><span><strong>让 Agent 建字段映射</strong><small>此时不输入个人资料</small></span></p><p><b>3</b><span><strong>确认后填写</strong><small>上传与最终提交分别确认</small></span></p></div><a className="primary" href={selected.officialUrl} target="_blank" rel="noreferrer">打开官方岗位 <span>↗</span></a><button className="secondary" onClick={()=>copy('apply',applyPrompt)}>{copied==='apply'?'网申任务已复制':'复制 Browser Use 网申任务'}</button><p className="note">不会自动读取仓库里的个人资料，也不会未经确认上传简历或提交申请。</p></aside></section>

    <section className="profile-strip" id="profile"><p className="section-no">04 / 资料安全</p><div><h2>资料留在你选择的位置，平台只保存岗位和进度。</h2><p>Agent 开始填写前会先询问简历版本；姓名、联系方式、经历等写入目标网站前必须确认。</p></div><a href="https://github.com/qiulingzhu809-sudo/job-pilot-2027/tree/main/skills/campus-job-radar" target="_blank" rel="noreferrer">查看 Skill 规范 ↗</a></section><footer><span>秋招雷达 2027</span><p>招聘信息以企业官网实时状态为准；最终投递由你决定。</p></footer>
  </main>;
}
