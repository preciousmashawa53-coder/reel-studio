import type { SavedVideo } from './store';

interface Props {
  videos: SavedVideo[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}

function when(t: number) {
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Gallery({ videos, activeId, onOpen, onRemove }: Props) {
  if (videos.length === 0) return null;
  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <h2 id="gallery-title">Your videos</h2>
      <ul>
        {videos.map((v) => (
          <li key={v.jobId} className={v.jobId === activeId ? 'is-active' : undefined}>
            <button className="thumb" onClick={() => onOpen(v.jobId)} aria-label={`Open video: ${v.prompt.split('. Style:')[0]}`}>
              {v.status === 'done' && v.videoUrl ? (
                <video src={v.videoUrl} muted playsInline preload="metadata" />
              ) : (
                <span className={`thumb-state thumb-${v.status}`}>{v.status === 'pending' ? 'Rendering' : 'Failed'}</span>
              )}
            </button>
            <div className="thumb-meta">
              <p className="thumb-prompt">{v.prompt.split('. Style:')[0]}</p>
              <p className="muted">
                {when(v.createdAt)}, {v.duration} sec, {v.aspect}
              </p>
            </div>
            <button className="remove" onClick={() => onRemove(v.jobId)} aria-label="Remove from list">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
