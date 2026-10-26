import { useEffect, useState } from 'react';
import type { SavedVideo } from './store';

interface Props {
  video: SavedVideo | null;
  status?: { label: string; position?: number | null };
  onNew: () => void;
}

function useElapsed(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function shapeClass(aspect: string) {
  return `frame frame-${aspect.replace(':', 'x')}`;
}

/** The big preview area: idle, generating (a running film strip), finished or failed. */
export function Stage({ video, status, onNew }: Props) {
  const pending = video?.status === 'pending';
  const elapsed = useElapsed(pending ? video!.createdAt : null);
  const [copied, setCopied] = useState(false);

  if (!video) {
    return (
      <section className="stage stage-idle" aria-label="Preview">
        <div className="frame frame-9x16 frame-idle">
          <div className="sprockets" aria-hidden="true" />
          <div className="idle-text">
            <p className="idle-title">Your video appears here</p>
            <p>Most videos are ready in 1 to 3 minutes. You can keep working while it renders.</p>
          </div>
          <div className="sprockets sprockets-right" aria-hidden="true" />
        </div>
        <ul className="tips">
          <li>Say who or what is in the shot, where it is, and how the camera moves.</li>
          <li>One scene per video works best. Keep it simple and visual.</li>
        </ul>
      </section>
    );
  }

  if (pending) {
    const label =
      status?.label === 'running'
        ? 'Rendering your video'
        : status?.position
          ? `Waiting in line, position ${status.position}`
          : 'Getting started';
    return (
      <section className="stage" aria-label="Preview" aria-busy="true">
        <div className={`${shapeClass(video.aspect)} frame-busy`}>
          <div className="sprockets rolling" aria-hidden="true" />
          <div className="busy-text">
            <p className="busy-label" aria-live="polite">
              {label}
            </p>
            <p className="busy-time">{elapsed}</p>
            <div className="bar" aria-hidden="true">
              <span />
            </div>
          </div>
          <div className="sprockets sprockets-right rolling" aria-hidden="true" />
        </div>
        <p className="stage-prompt">“{video.prompt.split('. Style:')[0]}”</p>
      </section>
    );
  }

  if (video.status === 'failed') {
    return (
      <section className="stage" aria-label="Preview">
        <div className={`${shapeClass(video.aspect)} frame-idle`}>
          <div className="idle-text">
            <p className="idle-title">This one didn't work</p>
            <p>{video.error || 'The video could not be made.'} Your credits have been returned.</p>
            <button className="btn btn-ghost" onClick={onNew}>
              Try another idea
            </button>
          </div>
        </div>
      </section>
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(video!.videoUrl!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt?.('Copy this link', video!.videoUrl!);
    }
  }

  return (
    <section className="stage" aria-label="Preview">
      <div className={shapeClass(video.aspect)}>
        <video key={video.videoUrl} src={video.videoUrl} controls autoPlay loop muted playsInline />
      </div>
      <div className="stage-actions">
        <a className="btn btn-primary" href={video.videoUrl} target="_blank" rel="noopener" download>
          Download video
        </a>
        <button className="btn btn-ghost" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button className="btn btn-ghost" onClick={onNew}>
          Make another
        </button>
      </div>
      <p className="stage-prompt">“{video.prompt.split('. Style:')[0]}”</p>
      <p className="stage-note">Download your videos. Links from the video service expire after a while.</p>
    </section>
  );
}
