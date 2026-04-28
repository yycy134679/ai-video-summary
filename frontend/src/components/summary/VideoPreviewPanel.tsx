import { ExternalLink, Film } from "lucide-react";
import type { VideoInfo } from "../../types";
import { formatDuration } from "../../utils/format";
import "./VideoPreviewPanel.css";

export function VideoPreviewPanel({ video }: { video: VideoInfo | null }) {
  return (
    <aside className="video-panel" aria-label="视频信息">
      <div className="video-cover">
        {video?.thumbnail ? (
          <img src={video.thumbnail} alt={`${video.title} 封面`} referrerPolicy="no-referrer" />
        ) : (
          <div className="video-cover-empty">
            <Film aria-hidden="true" size={36} />
            <span>{video?.title || "等待视频解析"}</span>
          </div>
        )}
      </div>
      <div className="video-meta">
        <h3>{video?.title || "正在解析视频信息"}</h3>
        <div className="meta-list">
          <span>{video?.uploader || "未知作者"}</span>
          <span>{formatDuration(video?.duration ?? null)}</span>
        </div>
        {video?.webpageUrl ? (
          <a className="origin-link" href={video.webpageUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" size={16} />
            打开原站视频
          </a>
        ) : null}
      </div>
    </aside>
  );
}
