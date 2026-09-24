export type ApplicationProfile = {
  personal: { name: string; gender: string; birthDate: string; nationality: string; nativePlace: string; ethnicity: string; politicalStatus: string; heightCm: string; weightKg: string; idType: string; idNumber: string; householdType: string };
  contact: { phoneCountryCode: string; phone: string; email: string; currentCity: string; address: string; emergencyContact: string; emergencyPhone: string };
  education: { school: string; college: string; major: string; degree: string; educationLevel: string; studyType: string; enrollmentDate: string; graduationDate: string; gpa: string; ranking: string };
  preference: { graduationYear: string; targetRoles: string; preferredCities: string; acceptsRelocation: string; acceptsOverseas: string; earliestStartDate: string; expectedSalary: string };
  attachments: { resumeName: string; portraitName: string; transcriptName: string; portfolioUrl: string };
  updatedAt: string;
};

export type ProfileSection = keyof Omit<ApplicationProfile, 'updatedAt'>;

export const emptyApplicationProfile: ApplicationProfile = {
  personal: { name: '', gender: '', birthDate: '', nationality: '中国', nativePlace: '', ethnicity: '', politicalStatus: '', heightCm: '', weightKg: '', idType: '身份证', idNumber: '', householdType: '' },
  contact: { phoneCountryCode: '+86', phone: '', email: '', currentCity: '', address: '', emergencyContact: '', emergencyPhone: '' },
  education: { school: '', college: '', major: '', degree: '', educationLevel: '', studyType: '全日制', enrollmentDate: '', graduationDate: '', gpa: '', ranking: '' },
  preference: { graduationYear: '2027', targetRoles: '', preferredCities: '', acceptsRelocation: '', acceptsOverseas: '', earliestStartDate: '', expectedSalary: '' },
  attachments: { resumeName: '', portraitName: '', transcriptName: '', portfolioUrl: '' },
  updatedAt: '',
};

export const applicationProfileStorageKey = 'job-pilot.application-profile.v1';
const requiredPaths: Array<[ProfileSection, string]> = [
  ['personal', 'name'], ['personal', 'gender'], ['personal', 'birthDate'], ['personal', 'nationality'],
  ['contact', 'phone'], ['contact', 'email'], ['contact', 'currentCity'], ['education', 'school'],
  ['education', 'major'], ['education', 'educationLevel'], ['education', 'studyType'],
  ['education', 'graduationDate'], ['preference', 'graduationYear'], ['preference', 'targetRoles'],
  ['preference', 'preferredCities'],
];

function mergeProfile(value: Partial<ApplicationProfile>): ApplicationProfile {
  return {
    personal: { ...emptyApplicationProfile.personal, ...value.personal },
    contact: { ...emptyApplicationProfile.contact, ...value.contact },
    education: { ...emptyApplicationProfile.education, ...value.education },
    preference: { ...emptyApplicationProfile.preference, ...value.preference },
    attachments: { ...emptyApplicationProfile.attachments, ...value.attachments },
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

export function loadApplicationProfile(): ApplicationProfile {
  if (typeof window === 'undefined') return emptyApplicationProfile;
  try {
    const saved = window.localStorage.getItem(applicationProfileStorageKey);
    return saved ? mergeProfile(JSON.parse(saved) as Partial<ApplicationProfile>) : emptyApplicationProfile;
  } catch { return emptyApplicationProfile; }
}

export function saveApplicationProfile(profile: ApplicationProfile): ApplicationProfile {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(applicationProfileStorageKey, JSON.stringify(next));
  return next;
}

export function importApplicationProfile(value: unknown): ApplicationProfile {
  if (!value || typeof value !== 'object') throw new Error('资料文件格式不正确');
  return mergeProfile(value as Partial<ApplicationProfile>);
}

export function profileCompleteness(profile: ApplicationProfile) {
  const completed = requiredPaths.filter(([section, field]) => (profile[section] as Record<string, string>)[field]?.trim()).length;
  return { completed, total: requiredPaths.length, percent: Math.round((completed / requiredPaths.length) * 100) };
}
