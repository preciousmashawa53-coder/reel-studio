import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { creditsFor } from './worker.js';

function kv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async list({ prefix }) { return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

const env = () => ({ STUDIO: kv(), FAL_KEY: 'test-key', ADMIN_KEY: 'admin-secret-123', ALLOWED_ORIGIN: 'https://example.com' });

function call(e, method, path, { body, code, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers['X-Access-Code'] = code;
  if (admin) headers['X-Admin-Key'] = admin;
  return worker.fetch(new Request(`https://api.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), e);
}

function falResponses(map) {
  globalThis.fetch = vi.fn(async (url, init) => {
    const key = `${init?.method || 'GET'} ${url}`;
    const hit = Object.entries(map).find(([k]) => key.startsWith(k));
    if (!hit) return new Response('{}', { status: 404 });
    const [status, body] = typeof hit[1] === 'function' ? hit[1](init) : hit[1];
    return new Response(JSON.stringify(body), { status });
  });
}

const SUBMIT = 'POST https://queue.fal.run/fal-ai/kling-video/o3/standard/text-to-video';
const STATUS = 'GET https://queue.fal.run/fal-ai/kling-video/requests/req-12345678/status';
const RESULT = 'GET https://queue.fal.run/fal-ai/kling-video/requests/req-12345678';
const submitted = [200, {
  request_id: 'req-12345678',
  status_url: 'https://queue.fal.run/fal-ai/kling-video/requests/req-12345678/status',
  response_url: 'https://queue.fal.run/fal-ai/kling-video/requests/req-12345678',
}];

async function makeCode(e, credits = 50) {
  const res = await call(e, 'POST', '/api/admin/codes', { admin: 'admin-secret-123', body: { name: 'Tendai', credits } });
  return (await res.json()).code;
}

describe('pricing', () => {
  it('charges credits per second, more with sound and for premium', () => {
    expect(creditsFor('standard', { duration: 5, audio: false })).toBe(10);
    expect(creditsFor('standard', { duration: 5, audio: true })).toBe(15);
    expect(creditsFor('premium', { duration: 5, audio: true })).toBe(20);
  });
});

describe('admin', () => {
  it('refuses the wrong admin key', async () => {
    const res = await call(env(), 'POST', '/api/admin/codes', { admin: 'nope', body: { credits: 10 } });
    expect(res.status).toBe(403);
  });

  it('creates a code and tops it up', async () => {
    const e = env();
    const code = await makeCode(e, 30);
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const res = await call(e, 'POST', '/api/admin/codes', { admin: 'admin-secret-123', body: { code, credits: 20 } });
    expect((await res.json()).credits).toBe(50);
    const list = await (await call(e, 'GET', '/api/admin/codes', { admin: 'admin-secret-123' })).json();
    expect(list.accounts).toHaveLength(1);
  });
});

describe('generating a video', () => {
  let e;
  let code;
  beforeEach(async () => {
    e = env();
    code = await makeCode(e, 50);
  });

  it('rejects unknown codes', async () => {
    const res = await call(e, 'GET', '/api/me', { code: 'NOPE-NOPE' });
    expect(res.status).toBe(401);
  });

  it('submits to fal.ai with the right input and charges credits', async () => {
    let sent;
    falResponses({ [SUBMIT]: (init) => ((sent = JSON.parse(init.body)), submitted) });
    const res = await call(e, 'POST', '/api/generate', {
      code,
      body: { model: 'standard', prompt: 'A drone shot over Victoria Falls at sunrise', duration: 5, aspect: '9:16', audio: false },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ jobId: 'req-12345678', credits: 40, charged: 10 });
    expect(sent).toEqual({ prompt: 'A drone shot over Victoria Falls at sunrise', duration: '5', aspect_ratio: '9:16', generate_audio: false });
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Key test-key');
  });

  it('does not charge when fal.ai rejects the request', async () => {
    falResponses({ [SUBMIT]: [500, { detail: 'down' }] });
    const res = await call(e, 'POST', '/api/generate', {
      code,
      body: { model: 'standard', prompt: 'A drone shot over Victoria Falls', duration: 5, aspect: '16:9' },
    });
    expect(res.status).toBe(502);
    expect((await (await call(e, 'GET', '/api/me', { code })).json()).credits).toBe(50);
  });

  it('refuses when there are not enough credits', async () => {
    const poor = await makeCode(e, 15);
    const res = await call(e, 'POST', '/api/generate', {
      code: poor,
      body: { model: 'premium', prompt: 'A long cinematic shot of a city at night', duration: 10, aspect: '16:9' },
    });
    expect(res.status).toBe(402);
  });

  it('validates the request', async () => {
    const bad = [
      { model: 'ultra', prompt: 'A cat dancing in the rain', duration: 5, aspect: '16:9' },
      { model: 'standard', prompt: 'cat', duration: 5, aspect: '16:9' },
      { model: 'standard', prompt: 'A cat dancing in the rain', duration: 7, aspect: '16:9' },
      { model: 'standard', prompt: 'A cat dancing in the rain', duration: 5, aspect: '4:7' },
    ];
    for (const body of bad) expect((await call(e, 'POST', '/api/generate', { code, body })).status).toBe(400);
  });

  it('reports progress and returns the finished video', async () => {
    falResponses({ [SUBMIT]: submitted, [STATUS]: [200, { status: 'IN_QUEUE', queue_position: 2 }] });
    await call(e, 'POST', '/api/generate', { code, body: { model: 'standard', prompt: 'A drone shot over Victoria Falls', duration: 5, aspect: '16:9' } });
    let s = await (await call(e, 'GET', '/api/jobs/req-12345678', { code })).json();
    expect(s).toEqual({ status: 'queued', position: 2 });

    falResponses({ [STATUS]: [200, { status: 'COMPLETED' }], [RESULT]: [200, { video: { url: 'https://v.fal.media/out.mp4' } }] });
    s = await (await call(e, 'GET', '/api/jobs/req-12345678', { code })).json();
    expect(s).toEqual({ status: 'done', videoUrl: 'https://v.fal.media/out.mp4' });
  });

  it('hides other people\'s videos', async () => {
    falResponses({ [SUBMIT]: submitted });
    await call(e, 'POST', '/api/generate', { code, body: { model: 'standard', prompt: 'A drone shot over Victoria Falls', duration: 5, aspect: '16:9' } });
    const other = await makeCode(e, 10);
    expect((await call(e, 'GET', '/api/jobs/req-12345678', { code: other })).status).toBe(404);
  });

  it('refunds credits once when a video fails', async () => {
    falResponses({ [SUBMIT]: submitted });
    await call(e, 'POST', '/api/generate', { code, body: { model: 'standard', prompt: 'A drone shot over Victoria Falls', duration: 5, aspect: '16:9' } });
    falResponses({ [STATUS]: [200, { status: 'COMPLETED', error: 'boom' }], [RESULT]: [422, { detail: 'failed' }] });
    const s = await (await call(e, 'GET', '/api/jobs/req-12345678', { code })).json();
    expect(s.status).toBe('failed');
    await call(e, 'GET', '/api/jobs/req-12345678', { code });
    expect((await (await call(e, 'GET', '/api/me', { code })).json()).credits).toBe(50);
  });

  it('answers browser preflight requests with CORS headers', async () => {
    const res = await call(e, 'OPTIONS', '/api/generate');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });
});
