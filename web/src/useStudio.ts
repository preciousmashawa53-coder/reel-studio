import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type Account, type GenerateRequest, type Model } from './api';
import { store, type SavedVideo } from './store';

const POLL_MS = 4000;

/** All app state: sign-in, credits, models, and the list of videos with live status polling. */
export function useStudio() {
  const [code, setCode] = useState(store.code());
  const [account, setAccount] = useState<Account | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [videos, setVideos] = useState<SavedVideo[]>(() => (code ? store.videos(code) : []));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, { label: string; position?: number | null }>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    api.models().then(setModels).catch(() => setError('Could not load video options. Refresh the page to try again.'));
  }, []);

  const refreshAccount = useCallback(async (c: string) => {
    try {
      setAccount(await api.me(c));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        store.clearCode();
        setCode('');
        setAccount(null);
      }
    }
  }, []);

  useEffect(() => {
    if (code) void refreshAccount(code);
  }, [code, refreshAccount]);

  const updateVideos = useCallback((fn: (v: SavedVideo[]) => SavedVideo[]) => {
    setVideos((prev) => {
      const next = fn(prev);
      if (codeRef.current) store.saveVideos(codeRef.current, next);
      return next;
    });
  }, []);

  async function signIn(raw: string): Promise<string | null> {
    const c = raw.trim().toUpperCase();
    try {
      const acc = await api.me(c);
      store.setCode(c);
      setCode(c);
      setAccount(acc);
      setVideos(store.videos(c));
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Could not sign in.';
    }
  }

  function signOut() {
    store.clearCode();
    setCode('');
    setAccount(null);
    setVideos([]);
    setActiveId(null);
  }

  async function generate(req: GenerateRequest): Promise<boolean> {
    if (!code) return false;
    setBusy(true);
    setError('');
    try {
      const { jobId, credits } = await api.generate(code, req);
      setAccount((a) => (a ? { ...a, credits } : a));
      const video: SavedVideo = {
        jobId,
        prompt: req.prompt,
        aspect: req.aspect,
        duration: req.duration,
        model: req.model,
        createdAt: Date.now(),
        status: 'pending',
      };
      updateVideos((v) => [video, ...v]);
      setActiveId(jobId);
      setStatus((s) => ({ ...s, [jobId]: { label: 'queued', position: null } }));
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the video. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Poll every pending video until it finishes
  const pendingIds = videos.filter((v) => v.status === 'pending').map((v) => v.jobId).join(',');
  useEffect(() => {
    if (!code || !pendingIds) return;
    let stopped = false;
    const tick = async () => {
      for (const id of pendingIds.split(',')) {
        try {
          const s = await api.job(code, id);
          if (stopped) return;
          if (s.status === 'done') {
            updateVideos((v) => v.map((x) => (x.jobId === id ? { ...x, status: 'done', videoUrl: s.videoUrl } : x)));
          } else if (s.status === 'failed') {
            updateVideos((v) => v.map((x) => (x.jobId === id ? { ...x, status: 'failed', error: s.error } : x)));
            void refreshAccount(code);
          } else {
            setStatus((st) => ({ ...st, [id]: { label: s.status, position: s.status === 'queued' ? s.position : undefined } }));
          }
        } catch {
          /* try again on the next tick */
        }
      }
    };
    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [code, pendingIds, updateVideos, refreshAccount]);

  function remove(jobId: string) {
    updateVideos((v) => v.filter((x) => x.jobId !== jobId));
    if (activeId === jobId) setActiveId(null);
  }

  const active = videos.find((v) => v.jobId === activeId) ?? null;

  return {
    code,
    account,
    models,
    videos,
    active,
    activeStatus: active ? status[active.jobId] : undefined,
    setActiveId,
    error,
    setError,
    busy,
    signIn,
    signOut,
    generate,
    remove,
  };
}
