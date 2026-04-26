import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Film,
  Flame,
  Headphones,
  Link,
  Loader2,
  Network,
  Sparkles,
  Star,
  X,
  Zap
} from "lucide-react";
import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { DownloadCanceledError, downloadVideoFile, parseVideo } from "./api";
import type { Quality, QualityOption, VideoInfo } from "./types";

const qualityIcon: Record<Quality, ReactElement> = {
  source: <Film aria-hidden="true" size={18} />,
  "4k": <Film aria-hidden="true" size={18} />,
  "1080p": <Film aria-hidden="true" size={18} />,
  "720p": <Film aria-hidden="true" size={18} />,
  audio: <Headphones aria-hidden="true" size={18} />
};

const featureCards = [
  {
    title: "智能总结",
    description: "提炼长视频核心观点，自动生成时间轴摘要，跳过废话直达重点。",
    icon: FileText
  },
  {
    title: "思维导图",
    description: "一键将视频结构转化为可视化脑图，支持导出 XMind 格式，构建知识体系。",
    icon: Network
  },
  {
    title: "高效学习",
    description: "双语字幕生成，关键术语解释，让专业课程或外语演讲的吸收率提升 300%。",
    icon: Zap
  }
];

const planRows = [
  ["智能总结次数", "10 次 / 月", "无限制"],
  ["视频下载画质", "最高 1080p", "支持 4K 原画"],
  ["思维导图导出", "x", "check"],
  ["处理速度", "标准队列", "极速通道优先"]
] as const;

const testimonials = [
  {
    initial: "L",
    name: "林同学",
    role: "在读研究生",
    quote: "看长篇讲座视频再也不头疼了。思维导图功能帮我理清了复杂的逻辑脉络，复习效率提升了不止一星半点。"
  },
  {
    initial: "Z",
    name: "张经理",
    role: "产品经理",
    quote: "竞品分析和行业发布会总结必备神器。以前要花半天时间看的内容，现在几分钟就能掌握核心要点。"
  }
];

interface DownloadState {
  quality: Quality;
  label: string;
  phase: "preparing" | "transferring" | "saving" | "done";
  receivedBytes: number;
  totalBytes: number | null;
  startedAt: number;
}

function App() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [activeQuality, setActiveQuality] = useState<Quality | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [, setDownloadTick] = useState(0);

  const availableCount = useMemo(
    () => video?.options.filter((option) => option.available).length ?? 0,
    [video]
  );

  useEffect(() => {
    if (downloadState?.phase !== "preparing") {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setDownloadTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [downloadState?.phase]);

  async function handleParse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("请先粘贴一个公开视频链接。");
      return;
    }
    if (!isHttpUrl(normalizedUrl)) {
      setError("请输入有效的公开视频链接，仅支持 http 或 https 地址。");
      return;
    }

    setError("");
    setNotice("");
    setVideo(null);
    setIsParsing(true);
    try {
      const parsedVideo = await parseVideo(normalizedUrl);
      setVideo(parsedVideo);
      setNotice(`解析完成，已找到 ${parsedVideo.options.filter((option) => option.available).length} 个可下载档位。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败，请检查链接后重试。");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleDownload(option: QualityOption) {
    if (!video || !option.available || activeQuality) {
      return;
    }

    setError("");
    setActiveQuality(option.quality);
    setNotice("");
    setDownloadState({
      quality: option.quality,
      label: option.label,
      phase: "preparing",
      receivedBytes: 0,
      totalBytes: option.estimatedSize,
      startedAt: Date.now()
    });

    try {
      const { bytesWritten, filename } = await downloadVideoFile(
        video.webpageUrl || url,
        option.quality,
        buildSuggestedFilename(video.title, option.quality),
        ({ receivedBytes, totalBytes }) => {
          setDownloadState((current) => current && current.quality === option.quality
            ? {
                ...current,
                phase: "transferring",
                receivedBytes,
                totalBytes: totalBytes ?? current.totalBytes
              }
            : current
          );
        }
      );

      setDownloadState((current) => current && current.quality === option.quality
        ? { ...current, phase: "saving", receivedBytes: bytesWritten, totalBytes: bytesWritten }
        : current
      );
      setDownloadState((current) => current && current.quality === option.quality
        ? { ...current, phase: "done", receivedBytes: bytesWritten, totalBytes: bytesWritten }
        : current
      );
      setNotice(`文件已保存为 ${filename}。`);
    } catch (err) {
      if (err instanceof DownloadCanceledError) {
        setDownloadState(null);
        return;
      }
      setError(err instanceof Error ? err.message : "下载失败，请稍后重试。");
      setDownloadState(null);
    } finally {
      setActiveQuality(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="AI 视频摘要助手">
            <Bot aria-hidden="true" size={20} />
            <span>AI 视频摘要助手</span>
          </a>
          <nav className="nav-links" aria-label="主导航">
            <a className="active" href="#features">功能特性</a>
            <a href="#pricing">价格方案</a>
            <a href="#about">关于我们</a>
          </nav>
          <div className="account-actions">
            <button type="button" className="text-button">登录</button>
            <button type="button" className="register-button">免费注册</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-inner">
            <h1 id="hero-title">
              一键提取核心，<span>重塑视频学习效率</span>
            </h1>
            <p className="hero-subtitle">
              贴上视频链接，AI 瞬间为您生成精准总结、智能思维导图与原画质下载链接，让知识获取快人一步。
            </p>

            <form id="downloader" className="hero-search" onSubmit={handleParse}>
              <div className="search-row">
                <span className="input-icon">
                  <Link aria-hidden="true" size={18} />
                </span>
                <label className="sr-only" htmlFor="video-url">视频链接</label>
                <input
                  id="video-url"
                  type="text"
                  inputMode="url"
                  placeholder="在此粘贴 YouTube、Bilibili 或其他视频平台链接..."
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={isParsing}
                />
                <button type="submit" disabled={isParsing}>
                  {isParsing ? <Loader2 aria-hidden="true" className="spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
                  {isParsing ? "解析中" : "开始分析 / 下载"}
                </button>
              </div>
            </form>

            <div className="hero-chips" aria-label="支持的下载选项">
              <span><Film aria-hidden="true" size={14} />原视频 MP4</span>
              <span><Film aria-hidden="true" size={14} />4K 原画下载</span>
              <span><Film aria-hidden="true" size={14} />1080p 高清</span>
              <span><Film aria-hidden="true" size={14} />720p 流畅</span>
              <span className="chip-active"><Headphones aria-hidden="true" size={14} />纯音频提取</span>
            </div>

            {error ? (
              <div className="message message-error" role="alert">
                <AlertCircle aria-hidden="true" size={18} />
                <span>{error}</span>
              </div>
            ) : null}

            {notice ? (
              <div className="message message-info" role="status">
                <CheckCircle2 aria-hidden="true" size={18} />
                <span>{notice}</span>
              </div>
            ) : null}

            {video ? (
              <section className="download-result" aria-labelledby="result-title">
                <div className="result-media">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt={`${video.title} 封面`} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="thumbnail-empty">
                      <Film aria-hidden="true" size={32} />
                    </div>
                  )}
                </div>
                <div className="result-body">
                  <p className="result-kicker">解析结果</p>
                  <h2 id="result-title">{video.title}</h2>
                  <div className="meta-list">
                    <span>{video.uploader || "未知作者"}</span>
                    <span>{formatDuration(video.duration)}</span>
                    <span>{availableCount} 个可用档位</span>
                  </div>
                  <div className={`subtitle-status subtitle-status-${video.subtitleStatus}`}>
                    <FileText aria-hidden="true" size={15} />
                    <span>{formatSubtitleStatus(video)}</span>
                  </div>
                  <div className="quality-grid" aria-label="下载清晰度">
                    {video.options.map((option) => (
                      <button
                        key={option.quality}
                        type="button"
                        className="quality-card"
                        disabled={!option.available || activeQuality !== null}
                        onClick={() => handleDownload(option)}
                      >
                        <span className="quality-icon">{qualityIcon[option.quality]}</span>
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.available ? formatFileSize(option.estimatedSize) : "当前视频不可用"}</small>
                        </span>
                        {activeQuality === option.quality ? (
                          <Loader2 aria-hidden="true" className="spin" size={17} />
                        ) : (
                          <Download aria-hidden="true" size={17} />
                        )}
                      </button>
                    ))}
                  </div>
                  {downloadState ? (
                    <DownloadProgressPanel state={downloadState} />
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <section id="features" className="section features-section">
          <div className="section-heading">
            <h2>重新定义视频内容消费</h2>
            <p>基于前沿大模型技术，为您提供全方位的视听信息处理方案</p>
          </div>
          <div className="feature-grid">
            {featureCards.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="feature-card" key={feature.title}>
                  <span className="feature-icon">
                    <Icon aria-hidden="true" size={30} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="pricing" className="section pricing-section">
          <div className="offer-banner">
            <div>
              <Flame aria-hidden="true" size={23} />
              <div>
                <strong>限时优惠：年度会员低至 5 折</strong>
                <span>活动剩余时间: 02天 14小时 36分</span>
              </div>
            </div>
            <button type="button">立即抢购</button>
          </div>

          <div className="section-heading">
            <h2>选择适合您的方案</h2>
            <p>解锁无限潜力，构建您的私人视频知识库</p>
          </div>

          <div className="pricing-table" role="table" aria-label="会员权益对比">
            <div className="pricing-row pricing-head" role="row">
              <div role="columnheader">功能权益</div>
              <div role="columnheader">
                <strong>基础版 (免费)</strong>
                <span>体验核心功能</span>
              </div>
              <div className="premium-head" role="columnheader">
                <em>推荐</em>
                <strong>高级会员</strong>
                <span>无限制的高效工作流</span>
              </div>
            </div>
            {planRows.map(([label, freeValue, premiumValue]) => (
              <div className="pricing-row" role="row" key={label}>
                <div role="cell">{label}</div>
                <div role="cell">{renderPlanValue(freeValue)}</div>
                <div className="premium-cell" role="cell">{renderPlanValue(premiumValue)}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="section testimonials-section">
          <div className="section-heading">
            <h2>他们都在用</h2>
            <p>听听各行各业的专业人士如何评价</p>
          </div>
          <div className="testimonial-grid">
            {testimonials.map((testimonial) => (
              <article className="testimonial-card" key={testimonial.name}>
                <div className="testimonial-head">
                  <span className="avatar">{testimonial.initial}</span>
                  <div>
                    <strong>{testimonial.name}</strong>
                    <small>{testimonial.role}</small>
                  </div>
                  <div className="stars" aria-label="五星评价">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star aria-hidden="true" fill="currentColor" key={index} size={16} />
                    ))}
                  </div>
                </div>
                <p>"{testimonial.quote}"</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <strong>© 2024 AI 视频摘要助手. 智享高效视频学习体验。</strong>
          <nav aria-label="页脚导航">
            <a href="#top">服务条款</a>
            <a href="#top">隐私政策</a>
            <a href="#top">API接口</a>
            <a href="#top">联系支持</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function DownloadProgressPanel({ state }: { state: DownloadState }) {
  const percent = state.totalBytes
    ? Math.min(100, Math.round((state.receivedBytes / state.totalBytes) * 100))
    : null;
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
  const statusText = getDownloadStatusText(state, elapsedSeconds);

  return (
    <div className="download-progress" role="status" aria-live="polite">
      <div className="download-progress-head">
        <div>
          <strong>{state.label}</strong>
          <span>{statusText}</span>
        </div>
        <span className="download-progress-percent">
          {percent !== null ? `${percent}%` : `${elapsedSeconds}s`}
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div
          className={percent !== null ? "progress-bar" : "progress-bar progress-bar-indeterminate"}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className="download-progress-meta">
        <span>{formatFileSize(state.receivedBytes)}</span>
        <span>{state.totalBytes ? `共 ${formatFileSize(state.totalBytes)}` : "文件大小未知"}</span>
      </div>
    </div>
  );
}

function getDownloadStatusText(state: DownloadState, elapsedSeconds: number) {
  if (state.phase === "preparing") {
    return `服务器正在解析并准备文件，已等待 ${elapsedSeconds}s，长视频或高画质会更久。`;
  }
  if (state.phase === "transferring") {
    return "正在从服务器接收文件，请保持页面打开。";
  }
  if (state.phase === "saving") {
    return "正在交给浏览器保存文件。";
  }
  return "下载完成。";
}

function renderPlanValue(value: string): ReactElement | string {
  if (value === "check") {
    return <Check aria-label="支持" size={19} />;
  }
  if (value === "x") {
    return <X aria-label="不支持" size={18} />;
  }
  return value;
}

function formatDuration(duration: number | null): string {
  if (!duration || duration <= 0) {
    return "未知时长";
  }

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function formatSubtitleStatus(video: VideoInfo): string {
  if (video.subtitleStatus === "available" && video.subtitles.length > 0) {
    return `已解析字幕：${video.subtitles.map((item) => item.languageLabel || item.language).join("、")}`;
  }
  return `字幕不可用：${video.subtitleMessage || "当前视频没有可匿名访问字幕。"}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) {
    return "大小未知";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isHttpUrl(value: string): boolean {
  const urlMatch = value.match(/https?:\/\/[^\s]+/i);
  const candidate = urlMatch?.[0] ?? value;
  try {
    const parsedUrl = new URL(candidate);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function buildSuggestedFilename(title: string, quality: Quality): string {
  const extension = quality === "audio" ? "mp3" : "mp4";
  const safeTitle = title
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safeTitle || "video"}-${quality}.${extension}`;
}

export default App;
