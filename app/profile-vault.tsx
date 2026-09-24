import { ChangeEvent, RefObject, useRef } from 'react';
import { ApplicationProfile, ProfileSection } from './application-profile';
import type { ResumeMetadata } from './resume-vault';

type Props = {
  profile: ApplicationProfile;
  ready: boolean;
  notice: string;
  completeness: { completed: number; total: number; percent: number };
  importInput: RefObject<HTMLInputElement | null>;
  onChange: (section: ProfileSection, field: string, value: string) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  resume: ResumeMetadata | null;
  onResume: (event: ChangeEvent<HTMLInputElement>) => void;
};

const options = (items: string[]) => items.map((item) => <option key={item}>{item}</option>);

export function ProfileVault({ profile, ready, notice, completeness, importInput, onChange, onSave, onExport, onImport, resume, onResume }: Props) {
  const resumeInput = useRef<HTMLInputElement>(null);
  const field = (section: ProfileSection, name: string) => ({
    value: (profile[section] as Record<string, string>)[name],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(section, name, event.target.value),
  });

  return <section className="profile-vault" id="profile">
    <div className="profile-intro">
      <p className="section-no">01 / 网申资料库</p>
      <h2>先准备标准资料，<br />网申时只做字段映射。</h2>
      <p>简历擅长描述经历，却覆盖不了籍贯、证件、学制和紧急联系人等字段。这里保存结构化资料，Agent 打开招聘网站后直接复用，只追问缺失项。</p>
      <div className="completion-card"><div><strong>{completeness.percent}%</strong><span>基础资料完整度</span></div><progress max="100" value={completeness.percent} /><small>{completeness.completed} / {completeness.total} 个通用必备字段已完成</small></div>
          <ul className="privacy-list"><li>只存当前浏览器的本地存储，不写入源码或 Git</li><li>请勿在公用设备填写；导出的 JSON 含明文个人资料</li><li>证件、附件和最终提交仍需逐次确认</li></ul>
    </div>

    <div className="profile-form-wrap">
      <div className="profile-toolbar"><div><strong>我的标准网申资料</strong><small>{profile.updatedAt ? `上次保存 ${new Date(profile.updatedAt).toLocaleString('zh-CN')}` : '尚未保存'}</small></div><div><button onClick={() => importInput.current?.click()}>导入资料</button><button onClick={onExport}>导出备份</button></div><input ref={importInput} type="file" accept="application/json" hidden onChange={onImport} /></div>

      <details open><summary><span>01</span>个人与证件信息 <small>高频必填</small></summary><div className="profile-fields">
        <label><span>姓名 *</span><input {...field('personal', 'name')} /></label>
        <label><span>性别 *</span><select {...field('personal', 'gender')}><option value="">请选择</option>{options(['女', '男'])}</select></label>
        <label><span>出生日期 *</span><input type="date" {...field('personal', 'birthDate')} /></label>
        <label><span>国籍/地区 *</span><input {...field('personal', 'nationality')} /></label>
        <label><span>籍贯</span><input {...field('personal', 'nativePlace')} placeholder="省 / 市" /></label>
        <label><span>民族</span><input {...field('personal', 'ethnicity')} /></label>
        <label><span>政治面貌</span><select {...field('personal', 'politicalStatus')}><option value="">请选择</option>{options(['群众', '共青团员', '中共预备党员', '中共党员'])}</select></label>
        <label><span>户籍类型</span><select {...field('personal', 'householdType')}><option value="">请选择</option>{options(['城镇', '农村'])}</select></label>
        <label><span>身高（cm）</span><input inputMode="numeric" {...field('personal', 'heightCm')} /></label>
        <label><span>体重（kg）</span><input inputMode="numeric" {...field('personal', 'weightKg')} /></label>
        <label><span>证件类型</span><select {...field('personal', 'idType')}>{options(['身份证', '护照', '港澳居民居住证'])}</select></label>
        <label><span>证件号码</span><input type="password" autoComplete="off" {...field('personal', 'idNumber')} placeholder="默认隐藏显示" /></label>
      </div></details>

      <details><summary><span>02</span>联系方式 <small>通用字段</small></summary><div className="profile-fields">
        <label><span>手机号 *</span><div className="phone-field"><input {...field('contact', 'phoneCountryCode')} /><input inputMode="tel" {...field('contact', 'phone')} /></div></label>
        <label><span>邮箱 *</span><input type="email" {...field('contact', 'email')} /></label>
        <label><span>现居城市 *</span><input {...field('contact', 'currentCity')} /></label>
        <label><span>详细地址</span><input {...field('contact', 'address')} /></label>
        <label><span>紧急联系人</span><input {...field('contact', 'emergencyContact')} /></label>
        <label><span>紧急联系电话</span><input inputMode="tel" {...field('contact', 'emergencyPhone')} /></label>
      </div></details>

      <details><summary><span>03</span>教育信息 <small>校招必备</small></summary><div className="profile-fields">
        <label><span>学校 *</span><input {...field('education', 'school')} /></label>
        <label><span>学院</span><input {...field('education', 'college')} /></label>
        <label><span>专业 *</span><input {...field('education', 'major')} /></label>
        <label><span>最高学历 *</span><select {...field('education', 'educationLevel')}><option value="">请选择</option>{options(['本科', '硕士', '博士', '专科'])}</select></label>
        <label><span>学位</span><select {...field('education', 'degree')}><option value="">请选择</option>{options(['学士', '硕士', '博士', '无'])}</select></label>
        <label><span>学习形式 *</span><select {...field('education', 'studyType')}>{options(['全日制', '非全日制'])}</select></label>
        <label><span>入学时间</span><input type="month" {...field('education', 'enrollmentDate')} /></label>
        <label><span>毕业时间 *</span><input type="month" {...field('education', 'graduationDate')} /></label>
        <label><span>GPA</span><input {...field('education', 'gpa')} /></label>
        <label><span>专业排名</span><input {...field('education', 'ranking')} placeholder="例如：前 15%" /></label>
      </div></details>

      <details><summary><span>04</span>求职偏好与附件 <small>用于字段预填</small></summary><div className="profile-fields">
        <label><span>毕业届别 *</span><input {...field('preference', 'graduationYear')} /></label>
        <label><span>目标岗位 *</span><input {...field('preference', 'targetRoles')} placeholder="前端开发、全栈开发" /></label>
        <label><span>意向工作城市</span><input {...field('preference', 'preferredCities')} placeholder="多个城市用顿号分隔" /></label>
        <label><span>接受调剂</span><select {...field('preference', 'acceptsRelocation')}><option value="">待确认</option>{options(['是', '否'])}</select></label>
        <label><span>接受海外派遣</span><select {...field('preference', 'acceptsOverseas')}><option value="">待确认</option>{options(['是', '否'])}</select></label>
        <label><span>最早到岗时间</span><input type="date" {...field('preference', 'earliestStartDate')} /></label>
        <label><span>期望薪资</span><input {...field('preference', 'expectedSalary')} placeholder="注明年薪或月薪" /></label>
        <label><span>作品集 / GitHub</span><input type="url" {...field('attachments', 'portfolioUrl')} /></label>
        <label><span>基础简历 PDF</span><button type="button" className="file-picker" onClick={() => resumeInput.current?.click()}>{resume ? `已保存：${resume.name}` : '选择 PDF（最大 10 MB）'}</button><input ref={resumeInput} type="file" accept="application/pdf,.pdf" hidden onChange={onResume} /></label>
        <label><span>证件照文件名</span><input {...field('attachments', 'portraitName')} placeholder="实际上传仍需确认" /></label>
        <label><span>成绩单文件名</span><input {...field('attachments', 'transcriptName')} placeholder="实际上传仍需确认" /></label>
      </div></details>

      <div className="profile-savebar"><span>{ready ? notice || '填写后保存，Agent 才能稳定复用' : '正在读取本地资料'}</span><button className="primary" onClick={onSave}>保存标准资料 <b>→</b></button></div>
    </div>
  </section>;
}
