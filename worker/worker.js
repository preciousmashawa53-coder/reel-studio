/**
 * Reel Studio server (Cloudflare Worker)
 *
 * Sits between the website and fal.ai so your fal.ai key is never visible to visitors.
 * Users sign in with an access code. Each code has a credit balance, and every video
 * costs credits. You sell credits (for example by EcoCash) and top up codes from the admin page.
 *
 * Settings in the Cloudflare dashboard:
 *   Secrets:    FAL_KEY (from fal.ai), ADMIN_KEY (a long password you choose)
 *               RESEND_API_KEY (from resend.com, for order emails; optional)
 *   KV binding: STUDIO
 *   Variables:  ALLOWED_ORIGIN (your website address, e.g. https://studio.preciousmashawa.co.zw)
 *               ORDER_EMAIL (where new-order alerts go, e.g. you@gmail.com)
 *               MAIL_FROM (sender, e.g. Reel Studio <studio@preciousmashawa.co.zw>)
 */

// ----------------------------------------------------------------- models

/** Prices are what fal.ai charges you. Credits are what you charge users (1 credit = US$0.10 by default). */
export const MODELS = {
  standard: {
    label: 'Standard',
    engine: 'Kling O3',
    description: 'Sharp, smooth motion. Best value.',
    endpoint: 'fal-ai/kling-video/o3/standard/text-to-video',
    durations: [5, 10, 15],
    aspects: ['9:16', '16:9', '1:1'],
    audioOptional: true,
    costPerSecond: (o) => (o.audio ? 0.112 : 0.084),
    creditsPerSecond: (o) => (o.audio ? 3 : 2),
    input: (o) => ({
      prompt: o.prompt,
      duration: String(o.duration),
      aspect_ratio: o.aspect,
      generate_audio: o.audio,
    }),
  },
  premium: {
    label: 'Premium',
    engine: 'Happy Horse 1.1',
    description: 'Top-ranked realism in 1080p, with sound.',
    endpoint: 'alibaba/happy-horse/v1.1/text-to-video',
    durations: [5, 10, 15],
    aspects: ['9:16', '16:9', '1:1'],
    audioOptional: false,
    costPerSecond: () => 0.18,
    creditsPerSecond: () => 4,
    input: (o) => ({
      prompt: o.prompt,
      duration: o.duration,
      resolution: '1080p',
      aspect_ratio: o.aspect,
    }),
  },
};

export function creditsFor(modelKey, options) {
  const m = MODELS[modelKey];
  return m.creditsPerSecond(options) * options.duration;
}

export function publicModels() {
  return Object.entries(MODELS).map(([key, m]) => ({
    key,
    label: m.label,
    engine: m.engine,
    description: m.description,
    durations: m.durations,
    aspects: m.aspects,
    audioOptional: m.audioOptional,
    creditsPerSecond: { audio: m.creditsPerSecond({ audio: true }), silent: m.creditsPerSecond({ audio: false }) },
  }));
}

// ----------------------------------------------------------------- credit packs

/** What customers can buy. Price in US$. The website shows these, so change prices here only. */
export const PACKS = [
  { name: 'Starter', credits: 50, price: 5 },
  { name: 'Creator', credits: 120, price: 10, note: 'Most popular' },
  { name: 'Business', credits: 300, price: 22, note: 'Best value' },
];

// ----------------------------------------------------------------- helpers

const MAX_PROMPT = 1500;
const CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  });
}

function fail(env, status, message) {
  return json(env, { error: message }, status);
}

function normaliseCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

async function getAccount(env, code) {
  if (!CODE_PATTERN.test(code)) return null;
  const raw = await env.STUDIO.get(`code:${code}`);
  return raw ? JSON.parse(raw) : null;
}

async function putAccount(env, code, account) {
  await env.STUDIO.put(`code:${code}`, JSON.stringify(account));
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

async function fal(env, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

// ----------------------------------------------------------------- routes

async function me(request, env) {
  const code = normaliseCode(request.headers.get('X-Access-Code'));
  const account = await getAccount(env, code);
  if (!account) return fail(env, 401, 'That access code was not found. Check it and try again.');
  return json(env, { name: account.name, credits: account.credits });
}

async function generate(request, env) {
  const code = normaliseCode(request.headers.get('X-Access-Code'));
  const account = await getAccount(env, code);
  if (!account) return fail(env, 401, 'Sign in with your access code first.');

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(env, 400, 'The request was not valid JSON.');
  }
  const model = MODELS[body.model];
  if (!model) return fail(env, 400, 'Choose Standard or Premium quality.');
  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 8) return fail(env, 400, 'Describe your video in at least a few words.');
  if (prompt.length > MAX_PROMPT) return fail(env, 400, `Keep your description under ${MAX_PROMPT} characters.`);
  const duration = Number(body.duration);
  if (!model.durations.includes(duration)) return fail(env, 400, `Length must be ${model.durations.slice(0, -1).join(', ')} or ${model.durations.at(-1)} seconds.`);
  const aspect = String(body.aspect);
  if (!model.aspects.includes(aspect)) return fail(env, 400, 'Choose a supported video shape.');
  const audio = model.audioOptional ? Boolean(body.audio) : true;
  const options = { prompt, duration, aspect, audio };

  const credits = creditsFor(body.model, options);
  if (account.credits < credits) {
    return fail(env, 402, `This video needs ${credits} credits and you have ${account.credits}. Top up to continue.`);
  }

  const submitted = await fal(env, `https://queue.fal.run/${model.endpoint}`, {
    method: 'POST',
    body: JSON.stringify(model.input(options)),
  });
  if (!submitted.ok || !submitted.data?.request_id) {
    console.log('fal submit failed', submitted.status, JSON.stringify(submitted.data));
    return fail(env, 502, 'The video service did not accept the request. No credits were used. Please try again shortly.');
  }

  // Charge now; refunded automatically if the video fails
  account.credits -= credits;
  account.used = (account.used || 0) + credits;
  await putAccount(env, code, account);

  const jobId = submitted.data.request_id;
  const job = {
    code,
    model: body.model,
    credits,
    prompt,
    duration,
    aspect,
    statusUrl: submitted.data.status_url,
    responseUrl: submitted.data.response_url,
    createdAt: Date.now(),
    state: 'queued',
  };
  await env.STUDIO.put(`job:${jobId}`, JSON.stringify(job), { expirationTtl: 60 * 60 * 24 * 7 });
  return json(env, { jobId, credits: account.credits, charged: credits });
}

async function jobStatus(request, env, jobId) {
  const code = normaliseCode(request.headers.get('X-Access-Code'));
  const raw = await env.STUDIO.get(`job:${jobId}`);
  if (!raw) return fail(env, 404, 'That video was not found.');
  const job = JSON.parse(raw);
  if (job.code !== code) return fail(env, 404, 'That video was not found.');

  if (job.state === 'done') return json(env, { status: 'done', videoUrl: job.videoUrl });
  if (job.state === 'failed') return json(env, { status: 'failed', error: job.error, refunded: job.credits });

  const status = await fal(env, job.statusUrl);
  if (!status.ok) return json(env, { status: 'running' });
  const s = status.data?.status;
  if (s === 'IN_QUEUE') return json(env, { status: 'queued', position: status.data.queue_position ?? null });
  if (s === 'IN_PROGRESS') return json(env, { status: 'running' });

  // COMPLETED: fetch the result, or refund if it failed
  const result = await fal(env, job.responseUrl);
  const videoUrl = result.data?.video?.url;
  if (result.ok && videoUrl && !status.data?.error) {
    job.state = 'done';
    job.videoUrl = videoUrl;
    await env.STUDIO.put(`job:${jobId}`, JSON.stringify(job), { expirationTtl: 60 * 60 * 24 * 7 });
    return json(env, { status: 'done', videoUrl });
  }

  console.log('fal job failed', jobId, JSON.stringify(status.data), JSON.stringify(result.data));
  const blocked = JSON.stringify(result.data || {}).toLowerCase().includes('safety') ||
    JSON.stringify(status.data || {}).toLowerCase().includes('safety');
  job.state = 'failed';
  job.error = blocked
    ? 'This description was blocked by the safety filter. Try different wording.'
    : 'The video could not be made. Your credits have been returned.';
  await env.STUDIO.put(`job:${jobId}`, JSON.stringify(job), { expirationTtl: 60 * 60 * 24 * 7 });
  const account = await getAccount(env, job.code);
  if (account) {
    account.credits += job.credits;
    account.used = Math.max(0, (account.used || 0) - job.credits);
    await putAccount(env, job.code, account);
  }
  return json(env, { status: 'failed', error: job.error, refunded: job.credits });
}

// ----------------------------------------------------------------- admin

function isAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  return Boolean(env.ADMIN_KEY) && env.ADMIN_KEY.length >= 12 && key === env.ADMIN_KEY;
}

/** Create a new code, or add credits to an existing one. */
async function adminSaveCode(request, env) {
  if (!isAdmin(request, env)) return fail(env, 403, 'Wrong admin key.');
  const body = await request.json().catch(() => ({}));
  const add = Math.round(Number(body.credits || 0));
  if (!Number.isFinite(add) || add < 0 || add > 100000) return fail(env, 400, 'Credits must be a number from 0 to 100000.');
  let code = normaliseCode(body.code);
  let account = code ? await getAccount(env, code) : null;
  if (code && !CODE_PATTERN.test(code)) return fail(env, 400, 'Codes use 6 to 32 letters, numbers or dashes.');
  if (!code) code = randomCode();
  if (!account) {
    account = { name: String(body.name || 'Customer').slice(0, 60), credits: 0, used: 0, createdAt: Date.now() };
  } else if (body.name) {
    account.name = String(body.name).slice(0, 60);
  }
  account.credits += add;
  await putAccount(env, code, account);
  return json(env, { code, ...account });
}

async function adminList(request, env) {
  if (!isAdmin(request, env)) return fail(env, 403, 'Wrong admin key.');
  const list = await env.STUDIO.list({ prefix: 'code:' });
  const accounts = await Promise.all(
    list.keys.map(async (k) => ({ code: k.name.slice(5), ...JSON.parse((await env.STUDIO.get(k.name)) || '{}') })),
  );
  accounts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json(env, { accounts });
}

// ----------------------------------------------------------------- orders and email

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const ORDER_TTL = 60 * 60 * 24 * 90; // keep orders for 90 days

function money(n) {
  return Number.isInteger(n) ? `US$${n}` : `US$${n.toFixed(2)}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function orderId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join('');
}

/** Wraps lines of text in a simple, readable email. */
function emailHtml(title, lines) {
  const body = lines.map((l) => `<p style="margin:0 0 14px">${l}</p>`).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d2b2e;max-width:520px">
<h2 style="font-size:20px;margin:0 0 16px">${title}</h2>${body}
<p style="margin:24px 0 0;color:#6b7c7e;font-size:13px">Reel Studio</p></div>`;
}

/** Sends an email through Resend. Returns false (and never throws) if email is not set up or fails. */
export async function sendEmail(env, { to, subject, title, lines }) {
  if (!env.RESEND_API_KEY || !to) return false;
  const text = [title, '', ...lines.map((l) => l.replace(/<[^>]+>/g, '')), '', 'Reel Studio'].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Reel Studio <onboarding@resend.dev>',
        to: [to],
        reply_to: env.ORDER_EMAIL || undefined,
        subject,
        html: emailHtml(escapeHtml(title), lines),
        text,
      }),
    });
    if (!res.ok) console.log('email failed', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.log('email error', err && err.message);
    return false;
  }
}

function site(env) {
  return env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' ? env.ALLOWED_ORIGIN : '';
}

/** A customer says they have paid. Saves the order and emails both of you. */
async function createOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').replace(/[^\d+]/g, '');
  const reference = String(body.reference || '').trim().toUpperCase().replace(/\s+/g, '');
  const pack = PACKS.find((p) => p.name === body.pack);
  const existingCode = normaliseCode(body.code);

  if (!pack) return fail(env, 400, 'Choose a credit pack.');
  if (name.length < 2 || name.length > 60) return fail(env, 400, 'Enter your name.');
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 120)) {
    return fail(env, 400, 'Check your email address, or leave it blank to get your code on WhatsApp.');
  }
  if (phone.replace(/\D/g, '').length < 9 || phone.length > 16) return fail(env, 400, 'Enter your phone number.');
  if (!/^[A-Z0-9.\-/]{5,40}$/.test(reference)) {
    return fail(env, 400, 'Enter the EcoCash reference from your confirmation message (for example MP261026.1234.A12345).');
  }
  // Limit how many orders one connection can send, so nobody can flood your inbox
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hour = Math.floor(Date.now() / 3600000);
  const rateKey = `rate:${ip}:${hour}`;
  const recent = Number((await env.STUDIO.get(rateKey)) || 0);
  if (recent >= 5) return fail(env, 429, 'Too many orders from this connection. Please wait an hour or message us on WhatsApp.');
  await env.STUDIO.put(rateKey, String(recent + 1), { expirationTtl: 7200 });

  if (await env.STUDIO.get(`ref:${reference}`)) {
    return fail(env, 409, 'This EcoCash reference has already been sent. If this is a mistake, message us on WhatsApp.');
  }

  const id = orderId();
  const order = {
    id,
    name,
    email,
    phone,
    reference,
    pack: pack.name,
    credits: pack.credits,
    price: pack.price,
    code: existingCode && (await getAccount(env, existingCode)) ? existingCode : null,
    status: 'pending',
    createdAt: Date.now(),
  };
  await env.STUDIO.put(`order:${id}`, JSON.stringify(order), { expirationTtl: ORDER_TTL });
  await env.STUDIO.put(`ref:${reference}`, id, { expirationTtl: ORDER_TTL });

  const adminUrl = site(env) ? `${site(env)}/?admin` : '';
  const [toYou, toCustomer] = await Promise.all([
    sendEmail(env, {
      to: env.ORDER_EMAIL,
      subject: `New order: ${name} paid ${money(pack.price)} for ${pack.name}`,
      title: `${name} paid ${money(pack.price)} for the ${pack.name} pack`,
      lines: [
        `<strong>${escapeHtml(name)}</strong> says they paid <strong>${money(pack.price)}</strong> by EcoCash for the <strong>${pack.name}</strong> pack (${pack.credits} credits) on Reel Studio.`,
        `EcoCash reference: <strong>${escapeHtml(reference)}</strong><br>Phone: ${escapeHtml(phone)}<br>Email: ${email ? escapeHtml(email) : 'none (send the code on WhatsApp)'}${order.code ? `<br>Top up existing code: ${order.code}` : ''}`,
        `Check that this payment is in your EcoCash messages, then approve it on your admin page${adminUrl ? `: <a href="${adminUrl}">${adminUrl}</a>` : '.'}`,
      ],
    }),
    sendEmail(env, {
      to: email || null,
      subject: `We've received your Reel Studio order (${money(pack.price)})`,
      title: `Thank you, ${name}!`,
      lines: [
        `We've received your order for the <strong>${pack.name}</strong> pack: <strong>${pack.credits} credits</strong> for <strong>${money(pack.price)}</strong>, paid by EcoCash (reference ${escapeHtml(reference)}).`,
        `We're confirming your payment now. Your access code will arrive in another email, usually within a few minutes during the day.`,
        `Order number: ${id}`,
      ],
    }),
  ]);
  return json(env, { id, status: 'pending', emailed: toCustomer, notified: toYou });
}

async function adminOrders(request, env) {
  if (!isAdmin(request, env)) return fail(env, 403, 'Wrong admin key.');
  const list = await env.STUDIO.list({ prefix: 'order:' });
  const orders = (
    await Promise.all(list.keys.map(async (k) => JSON.parse((await env.STUDIO.get(k.name)) || 'null')))
  ).filter(Boolean);
  orders.sort((a, b) => b.createdAt - a.createdAt);
  return json(env, { orders });
}

/** Approve (creates or tops up a code and emails it) or reject an order. */
async function adminDecide(request, env, id) {
  if (!isAdmin(request, env)) return fail(env, 403, 'Wrong admin key.');
  const body = await request.json().catch(() => ({}));
  const raw = await env.STUDIO.get(`order:${id}`);
  if (!raw) return fail(env, 404, 'That order was not found.');
  const order = JSON.parse(raw);
  if (order.status !== 'pending') return fail(env, 409, `This order was already ${order.status}.`);
  const studio = site(env);

  if (body.action === 'reject') {
    order.status = 'rejected';
    order.decidedAt = Date.now();
    await env.STUDIO.put(`order:${id}`, JSON.stringify(order), { expirationTtl: ORDER_TTL });
    const emailed = await sendEmail(env, {
      to: order.email,
      subject: 'About your Reel Studio order',
      title: `Hi ${order.name}, we couldn't confirm your payment`,
      lines: [
        `We couldn't find an EcoCash payment of <strong>${money(order.price)}</strong> with reference <strong>${escapeHtml(order.reference)}</strong>.`,
        `If you did pay, reply to this email or message us on WhatsApp with a screenshot of your EcoCash confirmation, and we'll sort it out.`,
      ],
    });
    return json(env, { order, emailed });
  }

  if (body.action !== 'approve') return fail(env, 400, 'Choose approve or reject.');

  let code = order.code;
  let account = code ? await getAccount(env, code) : null;
  if (!account) {
    code = randomCode();
    account = { name: order.name, credits: 0, used: 0, createdAt: Date.now(), email: order.email, phone: order.phone };
  }
  account.credits += order.credits;
  await putAccount(env, code, account);

  order.status = 'approved';
  order.code = code;
  order.decidedAt = Date.now();
  await env.STUDIO.put(`order:${id}`, JSON.stringify(order), { expirationTtl: ORDER_TTL });

  const emailed = await sendEmail(env, {
    to: order.email,
    subject: `Your Reel Studio access code: ${code}`,
    title: `Payment confirmed. You're ready to create, ${order.name}!`,
    lines: [
      `We've confirmed your EcoCash payment of <strong>${money(order.price)}</strong> for the <strong>${order.pack}</strong> pack.`,
      `Your access code: <strong style="font-size:20px;letter-spacing:1px">${code}</strong><br>Credits on your code: <strong>${account.credits}</strong>`,
      studio
        ? `Open <a href="${studio}">${studio}</a>, tap <strong>Sign in</strong> and enter your code. Keep it private: anyone with your code can use your credits.`
        : `Open Reel Studio, tap <strong>Sign in</strong> and enter your code. Keep it private: anyone with your code can use your credits.`,
    ],
  });
  return json(env, { order, code, credits: account.credits, emailed });
}

// ----------------------------------------------------------------- router

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    try {
      if (request.method === 'GET' && path === '/api/models') return json(env, { models: publicModels(), packs: PACKS, creditValueUsd: 0.1 });
      if (request.method === 'POST' && path === '/api/orders') return createOrder(request, env);
      if (request.method === 'GET' && path === '/api/admin/orders') return adminOrders(request, env);
      const orderMatch = path.match(/^\/api\/admin\/orders\/([A-Z0-9]{6,20})$/);
      if (request.method === 'POST' && orderMatch) return adminDecide(request, env, orderMatch[1]);
      if (request.method === 'GET' && path === '/api/me') return me(request, env);
      if (request.method === 'POST' && path === '/api/generate') return generate(request, env);
      const jobMatch = path.match(/^\/api\/jobs\/([A-Za-z0-9-]{8,80})$/);
      if (request.method === 'GET' && jobMatch) return jobStatus(request, env, jobMatch[1]);
      if (request.method === 'POST' && path === '/api/admin/codes') return adminSaveCode(request, env);
      if (request.method === 'GET' && path === '/api/admin/codes') return adminList(request, env);
      if (path === '' || path === '/api') return json(env, { ok: true, service: 'Reel Studio' });
      return fail(env, 404, 'Not found.');
    } catch (err) {
      console.log('error', err && err.stack);
      return fail(env, 500, 'Something went wrong on the server. Please try again.');
    }
  },
};
