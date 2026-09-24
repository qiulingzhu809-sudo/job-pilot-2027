const databaseName = 'job-pilot-private-vault';
const storeName = 'documents';
const resumeKey = 'primary-resume';

type StoredResume = {
  key: string;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
  blob: Blob;
};

export type ResumeMetadata = Omit<StoredResume, 'key' | 'blob'>;

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    const timer = window.setTimeout(() => reject(new Error('读取本地简历超时，请关闭其他工作台标签页后重试')), 8000);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'key' });
    request.onsuccess = () => { window.clearTimeout(timer); resolve(request.result); };
    request.onerror = () => { window.clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { window.clearTimeout(timer); reject(new Error('本地简历库被其他标签页占用，请关闭其他工作台标签页后重试')); };
  });
}

async function readStoredResume(): Promise<StoredResume | null> {
  const database = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(resumeKey);
    request.onsuccess = () => resolve((request.result as StoredResume | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveResumeFile(file: File): Promise<ResumeMetadata> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('基础简历目前只支持 PDF');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('简历文件不能超过 10 MB');
  const stored: StoredResume = {
    key: resumeKey,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    updatedAt: new Date().toISOString(),
    blob: file,
  };
  const database = await openVault();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(stored);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
  const { name, type, size, updatedAt } = stored;
  return { name, type, size, updatedAt };
}

export async function loadResumeMetadata(): Promise<ResumeMetadata | null> {
  const stored = await readStoredResume();
  if (!stored) return null;
  const { name, type, size, updatedAt } = stored;
  return { name, type, size, updatedAt };
}

export async function loadResumeFile(): Promise<File | null> {
  const stored = await readStoredResume();
  return stored ? new File([stored.blob], stored.name, { type: stored.type, lastModified: Date.parse(stored.updatedAt) }) : null;
}
