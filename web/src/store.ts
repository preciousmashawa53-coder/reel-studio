/** Remembers the access code and the videos made on this device. Every call is guarded, since storage can be blocked. */

export interface SavedVideo {
  jobId: string;
  prompt: string;
  aspect: string;
  duration: number;
  model: string;
  createdAt: number;
  videoUrl?: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

const CODE_KEY = 'reel-studio:code';
const videosKey = (code: string) => `reel-studio:videos:${code}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const store = {
  code: () => read<string>(CODE_KEY, ''),
  setCode: (code: string) => write(CODE_KEY, code),
  clearCode: () => {
    try {
      localStorage.removeItem(CODE_KEY);
    } catch {
      /* ignore */
    }
  },
  videos: (code: string) => read<SavedVideo[]>(videosKey(code), []),
  saveVideos: (code: string, videos: SavedVideo[]) => write(videosKey(code), videos.slice(0, 60)),
};
