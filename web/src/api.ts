/** Talks to the Reel Studio server. With no server configured it runs a demo that costs nothing. */

export interface Model {
  key: string;
  label: string;
  engine: string;
  description: string;
  durations: number[];
  aspects: string[];
  audioOptional: boolean;
  creditsPerSecond: { audio: number; silent: number };
}

export interface Account {
  name: string;
  credits: number;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  duration: number;
  aspect: string;
  audio: boolean;
}

export type JobStatus =
  | { status: 'queued'; position: number | null }
  | { status: 'running' }
  | { status: 'done'; videoUrl: string }
  | { status: 'failed'; error: string; refunded?: number };

export interface AdminAccount {
  code: string;
  name: string;
  credits: number;
  used?: number;
  createdAt?: number;
}

declare global {
  interface Window {
    STUDIO_CONFIG?: { apiUrl?: string; brand?: string; whatsapp?: string };
  }
}

export const config = {
  apiUrl: (window.STUDIO_CONFIG?.apiUrl || '').replace(/\/+$/, ''),
  brand: window.STUDIO_CONFIG?.brand || 'Reel Studio',
  whatsapp: window.STUDIO_CONFIG?.whatsapp || '',
};

export const DEMO = !config.apiUrl;

export function creditsFor(model: Model, duration: number, audio: boolean): number {
  const perSecond = model.audioOptional ? (audio ? model.creditsPerSecond.audio : model.creditsPerSecond.silent) : model.creditsPerSecond.audio;
  return perSecond * duration;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { code?: string; admin?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.code) headers['X-Access-Code'] = init.code;
  if (init.admin) headers['X-Admin-Key'] = init.admin;
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status);
  return data as T;
}

// ----------------------------------------------------------------- demo mode

const DEMO_MODELS: Model[] = [
  {
    key: 'standard',
    label: 'Standard',
    engine: 'Kling O3',
    description: 'Sharp, smooth motion. Best value.',
    durations: [5, 10],
    aspects: ['9:16', '16:9', '1:1'],
    audioOptional: true,
    creditsPerSecond: { audio: 3, silent: 2 },
  },
  {
    key: 'premium',
    label: 'Premium',
    engine: 'Happy Horse 1.1',
    description: 'Top-ranked realism in 1080p, with sound.',
    durations: [5, 10],
    aspects: ['9:16', '16:9', '1:1'],
    audioOptional: false,
    creditsPerSecond: { audio: 4, silent: 4 },
  },
];

let demoCredits = 120;
const demoJobs = new Map<string, { started: number; aspect: string }>();

function demoVideo(aspect: string): string {
  const file = aspect === '9:16' ? 'demo-portrait.mp4' : aspect === '1:1' ? 'demo-square.mp4' : 'demo-landscape.mp4';
  return new URL(file, document.baseURI).href;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- API

export const api = {
  async models(): Promise<Model[]> {
    if (DEMO) return DEMO_MODELS;
    return (await request<{ models: Model[] }>('/api/models')).models;
  },

  async me(code: string): Promise<Account> {
    if (DEMO) {
      await wait(300);
      return { name: 'Demo', credits: demoCredits };
    }
    return request<Account>('/api/me', { code });
  },

  async generate(code: string, body: GenerateRequest): Promise<{ jobId: string; credits: number; charged: number }> {
    if (DEMO) {
      await wait(500);
      const model = DEMO_MODELS.find((m) => m.key === body.model)!;
      const charged = creditsFor(model, body.duration, body.audio);
      if (demoCredits < charged) throw new ApiError(`This video needs ${charged} credits and you have ${demoCredits}.`, 402);
      demoCredits -= charged;
      const jobId = `demo-${Date.now()}`;
      demoJobs.set(jobId, { started: Date.now(), aspect: body.aspect });
      return { jobId, credits: demoCredits, charged };
    }
    return request('/api/generate', { method: 'POST', code, body: JSON.stringify(body) });
  },

  async job(code: string, jobId: string): Promise<JobStatus> {
    if (DEMO) {
      const job = demoJobs.get(jobId);
      if (!job) return { status: 'failed', error: 'That video was not found.' };
      const t = Date.now() - job.started;
      if (t < 2500) return { status: 'queued', position: 1 };
      if (t < 8000) return { status: 'running' };
      return { status: 'done', videoUrl: demoVideo(job.aspect) };
    }
    return request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, { code });
  },

  admin: {
    async list(key: string): Promise<AdminAccount[]> {
      if (DEMO) throw new ApiError('Connect your server in config.js to manage access codes.', 0);
      return (await request<{ accounts: AdminAccount[] }>('/api/admin/codes', { admin: key })).accounts;
    },
    async save(key: string, body: { code?: string; name?: string; credits: number }): Promise<AdminAccount> {
      if (DEMO) throw new ApiError('Connect your server in config.js to manage access codes.', 0);
      return request<AdminAccount>('/api/admin/codes', { method: 'POST', admin: key, body: JSON.stringify(body) });
    },
  },
};
