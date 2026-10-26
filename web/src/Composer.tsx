import { useState } from 'react';
import { creditsFor, type Model } from './api';

export const SHAPES = [
  { value: '9:16', label: 'Vertical', hint: 'TikTok, Reels, Shorts' },
  { value: '16:9', label: 'Wide', hint: 'YouTube, websites' },
  { value: '1:1', label: 'Square', hint: 'Instagram, Facebook feed' },
];

const STYLES = [
  { label: 'Cinematic', suffix: 'cinematic film look, shallow depth of field, dramatic lighting, smooth camera movement' },
  { label: 'Realistic', suffix: 'photorealistic, natural light, true-to-life detail, handheld documentary camera' },
  { label: 'Product ad', suffix: 'premium commercial product shot, clean studio lighting, slow orbiting camera, glossy reflections' },
  { label: '3D cartoon', suffix: 'colourful 3D animated film style, soft lighting, expressive characters' },
  { label: 'Anime', suffix: 'anime style, vibrant colours, hand-drawn look, dynamic motion' },
  { label: 'Drone', suffix: 'aerial drone shot, sweeping wide view, golden hour light' },
];

const IDEAS = [
  'A slow drone shot over Victoria Falls at sunrise, mist rising and rainbows in the spray',
  'A barista pouring latte art in a cosy Harare coffee shop, steam rising, warm morning light',
  'A young woman walking through a busy African market at golden hour, smiling at the camera',
  'A sleek pair of sneakers spinning on a pedestal as neon light ripples across them',
];

interface Props {
  models: Model[];
  credits: number | null;
  signedIn: boolean;
  busy: boolean;
  onGenerate: (req: { model: string; prompt: string; duration: number; aspect: string; audio: boolean }) => Promise<boolean>;
  onSignIn: () => void;
}

export function Composer({ models, credits, signedIn, busy, onGenerate, onSignIn }: Props) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<string | null>('Cinematic');
  const [aspect, setAspect] = useState('9:16');
  const [duration, setDuration] = useState(5);
  const [modelKey, setModelKey] = useState('standard');
  const [audio, setAudio] = useState(false);
  const [hint, setHint] = useState('');

  const model = models.find((m) => m.key === modelKey) ?? models[0];
  const cost = model ? creditsFor(model, duration, audio) : 0;
  const tooShort = prompt.trim().length < 8;
  const notEnough = credits !== null && credits < cost;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) return onSignIn();
    if (tooShort) {
      setHint('Describe your video in a few more words: who or what, where, and how the camera moves.');
      return;
    }
    const suffix = STYLES.find((s) => s.label === style)?.suffix;
    const finalPrompt = suffix ? `${prompt.trim().replace(/[.\s]+$/, '')}. Style: ${suffix}.` : prompt.trim();
    setHint('');
    const ok = await onGenerate({ model: model.key, prompt: finalPrompt, duration, aspect, audio: model.audioOptional ? audio : true });
    if (ok) setPrompt('');
  }

  return (
    <form className="composer" onSubmit={submit} aria-labelledby="composer-title">
      <h1 id="composer-title">
        Type an idea.
        <br />
        Get a video.
      </h1>

      <div className="field">
        <label htmlFor="prompt" className="field-label">
          Describe your video
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A slow drone shot over Victoria Falls at sunrise, mist rising…"
          rows={5}
          maxLength={1200}
        />
        <div className="ideas" aria-label="Example ideas">
          <span className="muted">Try:</span>
          {IDEAS.slice(0, 3).map((idea) => (
            <button key={idea} type="button" className="idea" onClick={() => setPrompt(idea)}>
              {idea.split(',')[0]}
            </button>
          ))}
        </div>
        {hint && <p className="hint-error">{hint}</p>}
      </div>

      <fieldset className="field">
        <legend className="field-label">Style</legend>
        <div className="chips">
          {STYLES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="chip"
              aria-pressed={style === s.label}
              onClick={() => setStyle(style === s.label ? null : s.label)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Shape</legend>
        <div className="shapes">
          {SHAPES.map((s) => (
            <label key={s.value} className="shape">
              <input type="radio" name="shape" value={s.value} checked={aspect === s.value} onChange={() => setAspect(s.value)} />
              <span className={`shape-icon shape-${s.value.replace(':', 'x')}`} aria-hidden="true" />
              <span className="shape-text">
                <strong>{s.label}</strong>
                <small>{s.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="row-2">
        <fieldset className="field">
          <legend className="field-label">Length</legend>
          <div className="segmented">
            {(model?.durations ?? [5, 10]).map((d) => (
              <label key={d}>
                <input type="radio" name="duration" checked={duration === d} onChange={() => setDuration(d)} />
                <span>{d} sec</span>
              </label>
            ))}
          </div>
        </fieldset>
        {model?.audioOptional && (
          <fieldset className="field">
            <legend className="field-label">Sound</legend>
            <div className="segmented">
              <label>
                <input type="radio" name="audio" checked={!audio} onChange={() => setAudio(false)} />
                <span>Silent</span>
              </label>
              <label>
                <input type="radio" name="audio" checked={audio} onChange={() => setAudio(true)} />
                <span>With sound</span>
              </label>
            </div>
          </fieldset>
        )}
      </div>

      <fieldset className="field">
        <legend className="field-label">Quality</legend>
        <div className="qualities">
          {models.map((m) => (
            <label key={m.key} className="quality">
              <input type="radio" name="quality" checked={modelKey === m.key} onChange={() => setModelKey(m.key)} />
              <span className="quality-body">
                <strong>{m.label}</strong>
                <span>{m.description}</span>
                <small>
                  {m.engine}, {m.audioOptional ? `${m.creditsPerSecond.silent}` : m.creditsPerSecond.audio} credits a second
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="submit-row">
        <p className="cost" aria-live="polite">
          Uses <strong>{cost} credits</strong>
          {credits !== null && <span className="muted"> of your {credits}</span>}
        </p>
        <button className="btn btn-primary btn-big" type="submit" disabled={busy || (signedIn && notEnough)}>
          {!signedIn ? 'Sign in to create' : busy ? 'Starting…' : notEnough ? 'Not enough credits' : 'Create video'}
        </button>
      </div>
    </form>
  );
}
