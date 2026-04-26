import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Film,
  HelpCircle,
  Layers3,
  Link,
  Loader2,
  Map as MapIcon,
  MessageSquareText,
  ShieldCheck,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Zap
} from "lucide-react";
import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";

import {
  streamQaAnswer,
  streamVideoSummary
} from "./api";
import type {
  MindMapNode,
  QaMessage,
  StageStatus,
  StructuredSummary,
  SummaryStage,
  SummaryStageEvent,
  SummaryStyle,
  SummaryTranscript,
  VideoInfo
} from "./types";

const summaryStyles: Array<{ value: SummaryStyle; label: string; description: string }> = [
  { value: "study_notes", label: "学习笔记", description: "结构完整，适合复习沉淀" },
  { value: "quick_read", label: "简洁速读", description: "高密度提炼，快速掌握重点" },
  { value: "deep_analysis", label: "深度分析", description: "强调因果、风险和反例" },
  { value: "business_insight", label: "商业洞察", description: "聚焦策略、机会和行动" },
  { value: "custom", label: "自定义", description: "按你的关注点调整摘要正文" }
];

const stageDefinitions: Array<{ id: SummaryStage; label: string }> = [
  { id: "validating_url", label: "校验链接" },
  { id: "parsing", label: "解析视频" },
  { id: "loading_transcript", label: "获取字幕" },
  { id: "transcribing", label: "自动转写" },
  { id: "summarizing", label: "生成摘要" },
  { id: "building_mindmap", label: "生成脑图" },
  { id: "preparing_qa", label: "准备问答" },
  { id: "completed", label: "完成" }
];

const heroMetrics = [
  { value: "12x", label: "长视频吸收效率" },
  { value: "4K", label: "原画与音频保留" },
  { value: "0", label: "本地历史留存" }
];

const premiumSignals = [
  { icon: <Clock3 aria-hidden="true" size={18} />, title: "1 小时课程", text: "压缩成可复习的结构化笔记" },
  { icon: <Layers3 aria-hidden="true" size={18} />, title: "脑图 + 原文", text: "从观点、证据到时间点一屏回看" },
  { icon: <Download aria-hidden="true" size={18} />, title: "下载不丢进度", text: "大文件下载保留可见进度状态" }
];

const valueCards = [
  { icon: <Sparkles aria-hidden="true" size={20} />, title: "摘要像研究助理", text: "不是截几句字幕，而是按目标产出要点、风险、行动项和追问入口。" },
  { icon: <TrendingUp aria-hidden="true" size={20} />, title: "适合高频专业输入", text: "课程、发布会、访谈、竞品视频都能沉淀成可检索的知识资产。" },
  { icon: <ShieldCheck aria-hidden="true" size={20} />, title: "先保护本地边界", text: "不保存历史、不读取 Cookie，先让用户对隐私和处理链路有确定感。" }
];

const planRows = [
  ["AI 视频总结次数", "轻量体验", "高频无限使用"],
  ["长视频转写与摘要", "标准处理", "优先队列与更长时长"],
  ["知识资产导出", "复制 Markdown", "脑图、原文、摘要批量导出"],
  ["下载能力", "公开视频下载", "4K / 音频 / 大文件进度体验"]
];

type ActiveTab = "summary" | "mindmap" | "transcript" | "qa";
type AppPage = "home" | "summary";

function App() {
  const [page, setPage] = useState<AppPage>(() => getPageFromPath());
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState<SummaryStyle>("study_notes");
  const [customPrompt, setCustomPrompt] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [stages, setStages] = useState(() => createInitialStages());
  const [summaryMarkdown, setSummaryMarkdown] = useState("");
  const [structuredSummary, setStructuredSummary] = useState<StructuredSummary | null>(null);
  const [mindmap, setMindmap] = useState<MindMapNode | null>(null);
  const [transcript, setTranscript] = useState<SummaryTranscript | null>(null);
  const [qaSessionId, setQaSessionId] = useState<string | null>(null);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [qaQuestion, setQaQuestion] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("summary");
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const qaAbortRef = useRef<AbortController | null>(null);

  const hasResultSurface = Boolean(video || summaryMarkdown || transcript || isRunning);
  const currentStage = useMemo(
    () => stageDefinitions.find((stage) => stages[stage.id].status === "running")?.id ?? null,
    [stages]
  );

  useEffect(() => {
    function syncPageFromHistory() {
      setPage(getPageFromPath());
    }

    window.addEventListener("popstate", syncPageFromHistory);
    return () => window.removeEventListener("popstate", syncPageFromHistory);
  }, []);

  useEffect(() => {
    return () => {
      summaryAbortRef.current?.abort();
      qaAbortRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    resetResultState();
    setError("");
    setNotice("");
    setIsRunning(true);
    setActiveTab("summary");
    navigateTo("summary");

    try {
      await streamVideoSummary(
        {
          url: normalizedUrl,
          style,
          customPrompt: customPrompt.trim() || null
        },
        {
          onStage: updateStage,
          onVideo: setVideo,
          onTranscript: (payload) => {
            setTranscript(payload);
            setActiveTab("summary");
          },
          onSummaryDelta: (text) => {
            setSummaryMarkdown((current) => current + text);
            setActiveTab("summary");
          },
          onSummaryDone: ({ markdown, summary }) => {
            setSummaryMarkdown(markdown);
            setStructuredSummary(summary);
          },
          onMindMapDone: (payload) => {
            setMindmap(payload);
          },
          onQaReady: ({ sessionId }) => {
            setQaSessionId(sessionId);
          },
          onPartialError: ({ message }) => {
            setPartialErrors((current) => current.includes(message) ? current : [...current, message]);
          },
          onFatalError: (message) => {
            setError(message);
            setIsRunning(false);
          },
          onDone: () => {
            setNotice("视频总结已生成。");
            setIsRunning(false);
          }
        },
        controller.signal
      );
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : "视频总结失败，请检查链接后重试。");
      }
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setIsRunning(false);
      }
    }
  }

  function updateStage(event: SummaryStageEvent) {
    setStages((current) => ({
      ...current,
      [event.stage]: event
    }));
  }

  function resetResultState() {
    setVideo(null);
    setStages(createInitialStages());
    setSummaryMarkdown("");
    setStructuredSummary(null);
    setMindmap(null);
    setTranscript(null);
    setQaSessionId(null);
    setQaMessages([]);
    setQaQuestion("");
    setPartialErrors([]);
  }

  function handleReset() {
    summaryAbortRef.current?.abort();
    qaAbortRef.current?.abort();
    resetResultState();
    setError("");
    setNotice("");
    setIsRunning(false);
    setIsAsking(false);
    navigateTo("home");
  }

  function navigateTo(nextPage: AppPage) {
    const nextPath = nextPage === "summary" ? "/summary" : "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCopy(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(successMessage);
    } catch {
      setError("当前浏览器不支持自动复制，请手动选中文本复制。");
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = qaQuestion.trim();
    if (!question || !qaSessionId || isAsking) {
      return;
    }

    qaAbortRef.current?.abort();
    const controller = new AbortController();
    qaAbortRef.current = controller;
    const userMessage: QaMessage = { id: `user-${Date.now()}`, role: "user", content: question };
    const assistantMessage: QaMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      status: "streaming"
    };
    setQaMessages((current) => [...current, userMessage, assistantMessage]);
    setQaQuestion("");
    setIsAsking(true);

    try {
      await streamQaAnswer(
        qaSessionId,
        question,
        {
          onAnswerDelta: (text) => {
            setQaMessages((current) => current.map((message) => message.id === assistantMessage.id
              ? { ...message, content: message.content + text }
              : message
            ));
          },
          onAnswerDone: (messageId) => {
            setQaMessages((current) => current.map((message) => message.id === assistantMessage.id
              ? { ...message, id: messageId, status: "completed" }
              : message
            ));
          },
          onFatalError: (message) => {
            setQaMessages((current) => current.map((item) => item.id === assistantMessage.id
              ? { ...item, content: message, status: "failed" }
              : item
            ));
          }
        },
        controller.signal
      );
    } catch (err) {
      if (!isAbortError(err)) {
        setQaMessages((current) => current.map((item) => item.id === assistantMessage.id
          ? {
              ...item,
              content: err instanceof Error ? err.message : "问答请求失败，请稍后重试。",
              status: "failed"
            }
          : item
        ));
      }
    } finally {
      if (qaAbortRef.current === controller) {
        qaAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setIsAsking(false);
      }
    }
  }

  const isSummaryPage = page === "summary";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href="/"
            aria-label="AI 视频摘要助手"
            onClick={(event) => {
              event.preventDefault();
              handleReset();
            }}
          >
            <Bot aria-hidden="true" size={20} />
            <span>AI 视频摘要助手</span>
          </a>
          <nav className="nav-links" aria-label="主导航">
            <a
              className={!isSummaryPage ? "active" : undefined}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                handleReset();
              }}
            >
              视频总结
            </a>
            <a
              className={isSummaryPage ? "active" : undefined}
              href="/summary"
              onClick={(event) => {
                event.preventDefault();
                navigateTo("summary");
              }}
            >
              分析报告
            </a>
          </nav>
          <button type="button" className="ghost-button" onClick={handleReset}>
            <RefreshCw aria-hidden="true" size={16} />
            重新开始
          </button>
        </div>
      </header>

      <main id="top">
        {isSummaryPage ? (
          <SummaryPage
            hasResultSurface={hasResultSurface}
            video={video}
            stages={stages}
            currentStage={currentStage}
            summaryMarkdown={summaryMarkdown}
            structuredSummary={structuredSummary}
            mindmap={mindmap}
            transcript={transcript}
            qaSessionId={qaSessionId}
            qaMessages={qaMessages}
            qaQuestion={qaQuestion}
            activeTab={activeTab}
            error={error}
            notice={notice}
            partialErrors={partialErrors}
            isRunning={isRunning}
            isAsking={isAsking}
            onReset={handleReset}
            onCopy={handleCopy}
            onActiveTabChange={setActiveTab}
            onQuestionChange={setQaQuestion}
            onAsk={handleAsk}
          />
        ) : (
          <HomePage
            url={url}
            style={style}
            customPrompt={customPrompt}
            error={error}
            notice={notice}
            partialErrors={partialErrors}
            isRunning={isRunning}
            onUrlChange={setUrl}
            onStyleChange={setStyle}
            onCustomPromptChange={setCustomPrompt}
            onSubmit={handleSubmit}
          />
        )}
      </main>
    </div>
  );
}

function HomePage({
  url,
  style,
  customPrompt,
  error,
  notice,
  partialErrors,
  isRunning,
  onUrlChange,
  onStyleChange,
  onCustomPromptChange,
  onSubmit
}: {
  url: string;
  style: SummaryStyle;
  customPrompt: string;
  error: string;
  notice: string;
  partialErrors: string[];
  isRunning: boolean;
  onUrlChange: (value: string) => void;
  onStyleChange: (value: SummaryStyle) => void;
  onCustomPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <section className="workspace-hero premium-hero">
        <div className="premium-hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <Crown aria-hidden="true" size={16} />
              为重度学习者和内容团队打造
            </p>
            <h1>
              把一小时视频变成
              <span>值得付费的知识资产</span>
            </h1>
            <p>
              粘贴公开视频链接，自动完成解析、字幕或 STT 文稿、DeepSeek 摘要、思维导图和临时问答。让课程、访谈和发布会从“看过”变成“可复用”。
            </p>
            <div className="hero-actions" aria-label="核心价值">
              {heroMetrics.map((item) => (
                <div className="hero-metric" key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <form className="summary-form premium-summary-form" onSubmit={onSubmit}>
            <div className="url-row">
              <label htmlFor="video-url">
                <Link aria-hidden="true" size={18} />
                视频链接
              </label>
              <input
                id="video-url"
                type="text"
                inputMode="url"
                placeholder="粘贴 YouTube、Bilibili、抖音或其他公开视频链接"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                disabled={isRunning}
              />
              <button type="submit" disabled={isRunning}>
                {isRunning ? <Loader2 aria-hidden="true" className="spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
                {isRunning ? "生成中" : "立即生成报告"}
                {!isRunning ? <ArrowRight aria-hidden="true" size={17} /> : null}
              </button>
            </div>

            <div className="premium-signal-grid">
              {premiumSignals.map((item) => (
                <div className="premium-signal" key={item.title}>
                  {item.icon}
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                </div>
              ))}
            </div>

            <fieldset className="style-grid" disabled={isRunning}>
              <legend>选择你愿意付费保留的输出风格</legend>
              {summaryStyles.map((item) => (
                <label className={style === item.value ? "style-option style-option-active" : "style-option"} key={item.value}>
                  <input
                    type="radio"
                    name="summary-style"
                    value={item.value}
                    checked={style === item.value}
                    onChange={() => onStyleChange(item.value)}
                  />
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </label>
              ))}
            </fieldset>

            <label className="custom-prompt" htmlFor="custom-prompt">
              <span>让报告更像你的专属顾问</span>
              <textarea
                id="custom-prompt"
                rows={3}
                maxLength={2000}
                placeholder="可选，例如：请重点提炼产品策略、风险和可执行建议"
                value={customPrompt}
                onChange={(event) => onCustomPromptChange(event.target.value)}
                disabled={isRunning}
              />
            </label>
          </form>

          <div className="hero-preview" aria-label="AI 视频总结结果预览">
            <div className="preview-toolbar">
              <span />
              <span />
              <span />
              <strong>AI Summary Studio</strong>
            </div>
            <div className="preview-video">
              <Film aria-hidden="true" size={32} />
              <div>
                <span>视频处理中</span>
                <strong>行业发布会 58:24</strong>
              </div>
            </div>
            <div className="preview-summary">
              <p>一句话总结</p>
              <strong>这不是再多一个下载器，而是一套把视频转成决策材料的工作台。</strong>
            </div>
            <div className="preview-bars" aria-hidden="true">
              <span style={{ width: "92%" }} />
              <span style={{ width: "74%" }} />
              <span style={{ width: "86%" }} />
            </div>
            <div className="preview-pill-row">
              <span>脑图已生成</span>
              <span>问答就绪</span>
              <span>4K 可下载</span>
            </div>
          </div>
        </div>
      </section>

      <section className="conversion-section" aria-labelledby="value-title">
        <div className="section-heading">
          <p className="eyebrow">为什么值得付费</p>
          <h2 id="value-title">付费点不在“总结一次”，而在持续节省高价值时间</h2>
        </div>
        <div className="value-card-grid">
          {valueCards.map((item) => (
            <article className="value-card" key={item.title}>
              <div className="value-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-title">
        <div className="pricing-banner">
          <div>
            <p className="eyebrow">
              <Zap aria-hidden="true" size={15} />
              Pro 转化锚点
            </p>
            <h2 id="pricing-title">把免费体验设计成“试一次就想长期用”</h2>
          </div>
          <button type="button" className="primary-button" onClick={() => document.getElementById("video-url")?.focus()}>
            <Sparkles aria-hidden="true" size={16} />
            先生成一份报告
          </button>
        </div>

        <div className="plan-table" aria-label="免费版和 Pro 版权益对比">
          <div className="plan-head">
            <strong>权益</strong>
            <strong>免费体验</strong>
            <strong>
              <Crown aria-hidden="true" size={16} />
              Pro 会员
            </strong>
          </div>
          {planRows.map(([feature, free, pro]) => (
            <div className="plan-row" key={feature}>
              <span>{feature}</span>
              <span>{free}</span>
              <span>{pro}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="testimonial-section" aria-labelledby="testimonial-title">
        <div className="section-heading">
          <p className="eyebrow">付费前的关键心理</p>
          <h2 id="testimonial-title">用户需要看到：它能替我完成原本很贵的脑力劳动</h2>
        </div>
        <div className="testimonial-grid">
          <article>
            <div className="star-row" aria-label="五星评价">
              {[1, 2, 3, 4, 5].map((item) => <Star aria-hidden="true" size={16} fill="currentColor" key={item} />)}
            </div>
            <p>“以前看竞品发布会要边看边记，现在直接拿到摘要、脑图和追问入口，省下来的时间远超过会员费。”</p>
            <strong>产品经理 · 高频视频调研</strong>
          </article>
          <article>
            <div className="star-row" aria-label="五星评价">
              {[1, 2, 3, 4, 5].map((item) => <Star aria-hidden="true" size={16} fill="currentColor" key={item} />)}
            </div>
            <p>“课程视频不再只收藏吃灰，报告可以直接变成复习材料，脑图特别适合考前回看。”</p>
            <strong>研究生 · 课程与讲座学习</strong>
          </article>
        </div>
      </section>

      <StatusMessages error={error} notice={notice} partialErrors={partialErrors} />
    </>
  );
}

function SummaryPage({
  hasResultSurface,
  video,
  stages,
  currentStage,
  summaryMarkdown,
  structuredSummary,
  mindmap,
  transcript,
  qaSessionId,
  qaMessages,
  qaQuestion,
  activeTab,
  error,
  notice,
  partialErrors,
  isRunning,
  isAsking,
  onReset,
  onCopy,
  onActiveTabChange,
  onQuestionChange,
  onAsk
}: {
  hasResultSurface: boolean;
  video: VideoInfo | null;
  stages: Record<SummaryStage, SummaryStageEvent>;
  currentStage: SummaryStage | null;
  summaryMarkdown: string;
  structuredSummary: StructuredSummary | null;
  mindmap: MindMapNode | null;
  transcript: SummaryTranscript | null;
  qaSessionId: string | null;
  qaMessages: QaMessage[];
  qaQuestion: string;
  activeTab: ActiveTab;
  error: string;
  notice: string;
  partialErrors: string[];
  isRunning: boolean;
  isAsking: boolean;
  onReset: () => void;
  onCopy: (text: string, successMessage: string) => Promise<void>;
  onActiveTabChange: (value: ActiveTab) => void;
  onQuestionChange: (value: string) => void;
  onAsk: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!hasResultSurface) {
    return (
      <>
        <StatusMessages error={error} notice={notice} partialErrors={partialErrors} />
        <section className="summary-empty-state" aria-labelledby="summary-empty-title">
          <div className="summary-empty-icon">
            <Sparkles aria-hidden="true" size={26} />
          </div>
          <p className="eyebrow">没有可恢复的分析报告</p>
          <h1 id="summary-empty-title">请从首页重新开始总结</h1>
          <p>
            当前版本不保存历史记录，刷新或直接访问总结页时不会恢复上一次的结果。
          </p>
          <button type="button" className="primary-button" onClick={onReset}>
            <RefreshCw aria-hidden="true" size={16} />
            返回首页
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <StatusMessages error={error} notice={notice} partialErrors={partialErrors} />

      <section id="result" className="report-section report-section-page" aria-labelledby="report-title">
        <div className="report-heading">
          <div>
            <p className="eyebrow">视频智能分析报告</p>
            <h2 id="report-title">{video?.title || "正在生成分析报告"}</h2>
          </div>
          <div className="report-actions">
            <button
              type="button"
              className="soft-button"
              disabled={!summaryMarkdown || !video}
              onClick={() => video && onCopy(buildSummaryExport(video, transcript, summaryMarkdown), "Markdown 总结已复制。")}
            >
              <Copy aria-hidden="true" size={16} />
              复制总结
            </button>
            <button type="button" className="primary-button" onClick={onReset}>
              <RefreshCw aria-hidden="true" size={16} />
              重新分析
            </button>
          </div>
        </div>

        <ProgressTimeline stages={stages} currentStage={currentStage} />

        <div className="report-layout">
          <VideoPreviewPanel video={video} />

          <section className="analysis-panel" aria-label="内容分析">
            <div className="tabs" role="tablist" aria-label="分析内容">
              <TabButton activeTab={activeTab} value="summary" onChange={onActiveTabChange} icon={<Sparkles size={18} />}>
                智能总结
              </TabButton>
              <TabButton activeTab={activeTab} value="mindmap" onChange={onActiveTabChange} icon={<MapIcon size={18} />}>
                思维导图
              </TabButton>
              <TabButton activeTab={activeTab} value="transcript" onChange={onActiveTabChange} icon={<FileText size={18} />}>
                原文稿
              </TabButton>
              <TabButton activeTab={activeTab} value="qa" onChange={onActiveTabChange} icon={<MessageSquareText size={18} />}>
                问答
              </TabButton>
            </div>

            <div className="tab-body">
              {activeTab === "summary" ? (
                <SummaryPanel
                  markdown={summaryMarkdown}
                  summary={structuredSummary}
                  isRunning={isRunning && stages.summarizing.status === "running"}
                />
              ) : null}
              {activeTab === "mindmap" ? (
                <MindMapPanel mindmap={mindmap} videoTitle={video?.title || "视频"} />
              ) : null}
              {activeTab === "transcript" ? (
                <TranscriptPanel
                  transcript={transcript}
                  onCopy={(text) => onCopy(text, "原文稿已复制。")}
                />
              ) : null}
              {activeTab === "qa" ? (
                <QaPanel
                  sessionReady={Boolean(qaSessionId)}
                  messages={qaMessages}
                  question={qaQuestion}
                  isAsking={isAsking}
                  onQuestionChange={onQuestionChange}
                  onSubmit={onAsk}
                />
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

function StatusMessages({
  error,
  notice,
  partialErrors
}: {
  error: string;
  notice: string;
  partialErrors: string[];
}) {
  return (
    <div className="status-stack">
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
      {partialErrors.map((item) => (
        <div className="message message-warning" role="status" key={item}>
          <AlertCircle aria-hidden="true" size={18} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressTimeline({
  stages,
  currentStage
}: {
  stages: Record<SummaryStage, SummaryStageEvent>;
  currentStage: SummaryStage | null;
}) {
  return (
    <ol className="progress-timeline" aria-label="处理进度">
      {stageDefinitions.map((item) => {
        const stage = stages[item.id];
        return (
          <li className={`stage-item stage-${stage.status}`} key={item.id}>
            <span className="stage-dot">
              {stage.status === "running" ? <Loader2 aria-hidden="true" className="spin" size={14} /> : null}
            </span>
            <strong>{item.label}</strong>
            <small>{currentStage === item.id ? stage.message : statusLabel(stage.status)}</small>
          </li>
        );
      })}
    </ol>
  );
}

function VideoPreviewPanel({ video }: {
  video: VideoInfo | null;
}) {
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

function TabButton({
  activeTab,
  value,
  icon,
  children,
  onChange
}: {
  activeTab: ActiveTab;
  value: ActiveTab;
  icon: ReactElement;
  children: string;
  onChange: (value: ActiveTab) => void;
}) {
  const selected = activeTab === value;
  return (
    <button
      type="button"
      className={selected ? "tab-button tab-button-active" : "tab-button"}
      role="tab"
      aria-selected={selected}
      onClick={() => onChange(value)}
    >
      {icon}
      {children}
    </button>
  );
}

function SummaryPanel({
  markdown,
  summary,
  isRunning
}: {
  markdown: string;
  summary: StructuredSummary | null;
  isRunning: boolean;
}) {
  if (!markdown && isRunning) {
    return (
      <div className="loading-block">
        <Loader2 aria-hidden="true" className="spin" size={20} />
        <span>正在生成摘要，内容会以打字机效果出现。</span>
      </div>
    );
  }

  if (!markdown) {
    return <EmptyPanel icon={<Sparkles size={22} />} text="摘要生成后会显示在这里。" />;
  }

  return (
    <article className="summary-content">
      {summary?.oneSentence ? (
        <div className="one-sentence">
          <span>一句话总结</span>
          <strong>{summary.oneSentence}</strong>
        </div>
      ) : null}
      <div className="markdown-output">
        <Markdown
          components={{
            a({ children, ...props }) {
              return (
                <a {...props} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
          }}
        >
          {markdown}
        </Markdown>
      </div>
      {isRunning ? (
        <div className="typing-indicator">
          <Loader2 aria-hidden="true" className="spin" size={15} />
          正在继续生成
        </div>
      ) : null}
    </article>
  );
}

function MindMapPanel({
  mindmap,
  videoTitle
}: {
  mindmap: MindMapNode | null;
  videoTitle: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!mindmap) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(new Set(collectNodeIds(mindmap)));
  }, [mindmap]);

  if (!mindmap) {
    return <EmptyPanel icon={<MapIcon size={22} />} text="思维导图生成后会显示在这里。" />;
  }

  const rows = getMindMapRows(mindmap, expandedIds);
  const maxDepth = rows.reduce((max, row) => Math.max(max, row.depth), 0);
  const nodeWidth = 220;
  const rowHeight = 82;
  const depthGap = 250;
  const svgWidth = Math.max(760, maxDepth * depthGap + nodeWidth + 64);
  const svgHeight = Math.max(360, rows.length * rowHeight + 44);
  const positions = new Map(rows.map((row, index) => [
    row.node.id,
    {
      x: 24 + row.depth * depthGap,
      y: 24 + index * rowHeight
    }
  ]));

  function toggleNode(node: MindMapNode) {
    if (!node.children.length) {
      return;
    }
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }

  return (
    <div className="mindmap-panel">
      <div className="mindmap-actions">
        <button type="button" className="soft-button compact-button" onClick={() => exportMindMapSvg(svgRef.current, videoTitle)}>
          导出 SVG
        </button>
        <button type="button" className="soft-button compact-button" onClick={() => exportMindMapPng(svgRef.current, videoTitle)}>
          导出 PNG
        </button>
      </div>
      <div className="mindmap-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight} role="img" aria-label="视频思维导图">
          <rect width={svgWidth} height={svgHeight} rx="16" fill="#f8fbff" />
          {rows.map((row) => {
            const current = positions.get(row.node.id);
            const parent = row.parentId ? positions.get(row.parentId) : null;
            if (!current || !parent) {
              return null;
            }
            return (
              <path
                key={`${row.parentId}-${row.node.id}`}
                d={`M ${parent.x + nodeWidth} ${parent.y + 34} C ${parent.x + nodeWidth + 45} ${parent.y + 34}, ${current.x - 45} ${current.y + 34}, ${current.x} ${current.y + 34}`}
                fill="none"
                stroke="#b9c7dd"
                strokeWidth="2"
              />
            );
          })}
          {rows.map((row) => {
            const position = positions.get(row.node.id)!;
            const isExpanded = expandedIds.has(row.node.id);
            const lines = wrapText(row.node.title, 13).slice(0, 2);
            return (
              <g
                key={row.node.id}
                role={row.node.children.length ? "button" : "img"}
                tabIndex={row.node.children.length ? 0 : -1}
                transform={`translate(${position.x} ${position.y})`}
                onClick={() => toggleNode(row.node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleNode(row.node);
                  }
                }}
              >
                <rect
                  width={nodeWidth}
                  height="68"
                  rx="10"
                  fill={row.depth === 0 ? "#004aad" : "#ffffff"}
                  stroke={row.depth === 0 ? "#004aad" : "#d7deeb"}
                  strokeWidth="1.5"
                />
                {lines.map((line, index) => (
                  <text
                    key={line}
                    x="18"
                    y={lines.length === 1 ? 37 : 29 + index * 19}
                    fill={row.depth === 0 ? "#ffffff" : "#071b3a"}
                    fontSize="15"
                    fontWeight="700"
                  >
                    {line}
                  </text>
                ))}
                {row.node.children.length ? (
                  <g transform="translate(190 23)">
                    <circle r="11" cx="11" cy="11" fill={row.depth === 0 ? "#ffffff" : "#e8f0ff"} />
                    <text x="11" y="16" textAnchor="middle" fill="#004aad" fontSize="15" fontWeight="800">
                      {isExpanded ? "-" : "+"}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function TranscriptPanel({
  transcript,
  onCopy
}: {
  transcript: SummaryTranscript | null;
  onCopy: (text: string) => void;
}) {
  if (!transcript) {
    return <EmptyPanel icon={<FileText size={22} />} text="原文稿生成后会显示在这里。" />;
  }

  return (
    <article className="transcript-panel">
      <div className="panel-heading transcript-heading">
        <div>
          <strong>原文稿</strong>
          <span>{transcript.source === "subtitle" ? "公开字幕" : "StepAudio ASR"}</span>
        </div>
        <button type="button" className="soft-button compact-button" onClick={() => onCopy(transcript.text)}>
          <Copy aria-hidden="true" size={15} />
          复制原文
        </button>
      </div>
      {transcript.cues.length ? (
        <div className="cue-list">
          {transcript.cues.slice(0, 120).map((cue, index) => (
            <div className="cue-row" key={`${cue.start}-${index}`}>
              <time>{formatCueTime(cue.start)}</time>
              <span>{cue.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <pre className="transcript-text">{transcript.text}</pre>
      )}
    </article>
  );
}

function QaPanel({
  sessionReady,
  messages,
  question,
  isAsking,
  onQuestionChange,
  onSubmit
}: {
  sessionReady: boolean;
  messages: QaMessage[];
  question: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="qa-panel">
      {!sessionReady ? (
        <EmptyPanel icon={<HelpCircle size={22} />} text="摘要完成后会自动开启基于文稿的临时问答。" />
      ) : null}
      {messages.length ? (
        <div className="qa-messages">
          {messages.map((message) => (
            <div className={`qa-message qa-${message.role} qa-${message.status || "completed"}`} key={message.id}>
              <strong>{message.role === "user" ? "你" : "AI"}</strong>
              <p>{message.content || "正在生成回答..."}</p>
            </div>
          ))}
        </div>
      ) : sessionReady ? (
        <div className="qa-hint">问答会依据当前视频文稿回答，不会联网搜索。</div>
      ) : null}
      <form className="qa-form" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="围绕当前视频文稿继续提问"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          disabled={!sessionReady || isAsking}
        />
        <button type="submit" disabled={!sessionReady || isAsking || !question.trim()}>
          {isAsking ? <Loader2 aria-hidden="true" className="spin" size={17} /> : <Send aria-hidden="true" size={17} />}
          发送
        </button>
      </form>
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: ReactElement; text: string }) {
  return (
    <div className="empty-panel">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function createInitialStages(): Record<SummaryStage, SummaryStageEvent> {
  return stageDefinitions.reduce((acc, item) => {
    acc[item.id] = {
      stage: item.id,
      status: "pending",
      message: "等待开始。"
    };
    return acc;
  }, {} as Record<SummaryStage, SummaryStageEvent>);
}

function statusLabel(status: StageStatus): string {
  if (status === "running") {
    return "进行中";
  }
  if (status === "completed") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "等待中";
}

function getMindMapRows(root: MindMapNode, expandedIds: Set<string>) {
  const rows: Array<{ node: MindMapNode; depth: number; parentId: string | null }> = [];

  function visit(node: MindMapNode, depth: number, parentId: string | null) {
    rows.push({ node, depth, parentId });
    if (!expandedIds.has(node.id)) {
      return;
    }
    node.children.forEach((child) => visit(child, depth + 1, node.id));
  }

  visit(root, 0, null);
  return rows;
}

function collectNodeIds(root: MindMapNode): string[] {
  return [root.id, ...root.children.flatMap((child) => collectNodeIds(child))];
}

function exportMindMapSvg(svg: SVGSVGElement | null, title: string) {
  if (!svg) {
    return;
  }
  const serialized = serializeSvg(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(title)}-思维导图.svg`);
}

function exportMindMapPng(svg: SVGSVGElement | null, title: string) {
  if (!svg) {
    return;
  }
  const serialized = serializeSvg(svg);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  const width = svg.viewBox.baseVal.width || svg.width.baseVal.value;
  const height = svg.viewBox.baseVal.height || svg.height.baseVal.value;
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }
    context.fillStyle = "#f8fbff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${safeFilename(title)}-思维导图.png`);
      }
    }, "image/png");
  };
  image.src = url;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildSummaryExport(video: VideoInfo, transcript: SummaryTranscript | null, markdown: string): string {
  const source = transcript?.source === "subtitle" ? "公开字幕" : transcript?.source === "asr" ? "StepAudio ASR" : "未知";
  return [
    `# ${video.title}`,
    "",
    `- 来源：${video.webpageUrl}`,
    `- 作者：${video.uploader || "未知作者"}`,
    `- 时长：${formatDuration(video.duration)}`,
    `- 文稿来源：${source}`,
    "",
    markdown.trim()
  ].join("\n");
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

function formatCueTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${pad(rest)}`;
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

function safeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "视频";
}

function wrapText(value: string, size: number): string[] {
  const chars = Array.from(value.trim());
  if (chars.length <= size) {
    return [value.trim()];
  }
  return [
    chars.slice(0, size).join(""),
    `${chars.slice(size, size * 2 - 1).join("")}${chars.length > size * 2 - 1 ? "..." : ""}`
  ];
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function getPageFromPath(): AppPage {
  return window.location.pathname === "/summary" ? "summary" : "home";
}

export default App;
