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
import { heroMetrics, planRows } from "./constants/home";
import { stageDefinitions, summaryStyles } from "./constants/summary";
import type {
  MindMapNode,
  QaMessage,
  StructuredSummary,
  SummaryStage,
  SummaryStageEvent,
  SummaryStyle,
  SummaryTranscript,
  VideoInfo
} from "./types";
import { formatCueTime, formatDuration } from "./utils/format";
import { collectNodeIds, getMindMapRows, wrapText } from "./utils/mindmap";
import { buildSummaryExport } from "./utils/summaryExport";
import { isHttpUrl, safeFilename } from "./utils/url";

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
      <section className="w-full max-w-[1280px] mx-auto px-6 py-20 lg:py-28 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:items-center relative z-10">
          
          <div className="space-y-8 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f1f3ff] px-4 py-1.5 text-sm font-medium text-[#003d9b] tracking-wide ring-1 ring-inset ring-[#0052cc]/10">
              <Crown aria-hidden="true" size={16} />
              为重度学习者和内容团队打造
            </div>
            
            <h1 className="text-4xl font-bold leading-tight text-[#041b3c] tracking-tight lg:text-5xl">
              把一小时长视频变成<br />
              <span className="bg-gradient-to-r from-[#003d9b] to-[#0c56d0] bg-clip-text text-transparent">值得付费的知识资产</span>
            </h1>
            
            <p className="text-[17px] leading-relaxed text-[#434654]">
              粘贴公开视频链接，自动完成解析、字幕或 STT 文稿、DeepSeek 摘要、思维导图和临时问答。让课程、访谈和发布会从“看过”变成“可复用”。
            </p>
            
            <div className="flex flex-wrap gap-x-12 gap-y-6 pt-2">
              {heroMetrics.map((item) => (
                <div className="flex flex-col gap-1" key={item.label}>
                  <strong className="text-3xl font-extrabold tracking-tight text-[#041b3c]">{item.value}</strong>
                  <span className="text-[13px] font-medium text-[#737685]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 blur-2xl opacity-20 bg-gradient-to-br from-[#0c56d0]/40 to-[#d7e2ff]/40 rounded-3xl -z-10"></div>
            <form 
              className="rounded-2xl border border-white/40 bg-white/70 p-6 shadow-[0_24px_56px_rgba(14,37,70,0.06)] backdrop-blur-xl lg:p-8 space-y-6 relative overflow-hidden" 
              onSubmit={onSubmit}
            >
              <div className="space-y-3">
                <label htmlFor="video-url" className="flex items-center gap-2 text-[15px] font-semibold text-[#041b3c]">
                  <Link aria-hidden="true" size={16} className="text-[#0052cc]" />
                  视频链接
                </label>
                <div className="relative flex flex-col sm:flex-row gap-3">
                  <input
                    id="video-url"
                    type="text"
                    inputMode="url"
                    placeholder="粘贴 YouTube、Bilibili、抖音或其他公开视频链接"
                    className="flex-1 w-full min-h-[48px] rounded-lg border-2 border-transparent bg-white shadow-sm ring-1 ring-[#c3c6d6]/60 px-4 text-[15px] text-[#041b3c] outline-none transition-all placeholder:text-[#737685] focus:border-[#0052cc] focus:bg-white focus:ring-[3px] focus:ring-[#0052cc]/15 disabled:cursor-not-allowed disabled:opacity-60"
                    value={url}
                    onChange={(event) => onUrlChange(event.target.value)}
                    disabled={isRunning}
                  />
                  <button 
                    type="submit" 
                    disabled={isRunning}
                    className="inline-flex min-h-[48px] sm:w-[140px] items-center justify-center gap-2 rounded-lg bg-[#0052cc] px-5 font-bold text-white shadow-[0_8px_16px_rgba(0,82,204,0.2)] transition-all hover:bg-[#003d9b] hover:shadow-[0_12px_24px_rgba(0,82,204,0.3)] hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {isRunning ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
                    {isRunning ? "生成中" : "立即生成"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {premiumSignals.map((item) => (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-[#f9f9ff] p-3 border border-[#edf0ff]" key={item.title}>
                    <div className="text-[#0052cc] bg-[#e8edff] w-fit p-1.5 rounded-md">{item.icon}</div>
                    <strong className="text-[13px] pr-2 font-semibold text-[#041b3c] mt-1">{item.title}</strong>
                    <span className="text-[12px] text-[#434654] leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-[#c3c6d6]/40 to-transparent"></div>

              <fieldset className="space-y-3" disabled={isRunning}>
                <legend className="text-[14px] font-semibold text-[#041b3c] mb-3">报告输出风格</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {summaryStyles.map((item) => (
                    <label 
                      className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-3.5 transition-all ${
                        style === item.value 
                          ? "border-[#0052cc] bg-[#f9f9ff] shadow-[0_2px_8px_rgba(0,82,204,0.06)]" 
                          : "border-[#e0e8ff] bg-white hover:border-[#c3c6d6]"
                      } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
                      key={item.value}
                    >
                      <input
                        type="radio"
                        name="summary-style"
                        value={item.value}
                        className="sr-only"
                        checked={style === item.value}
                        onChange={() => onStyleChange(item.value)}
                      />
                      <div className="flex items-center justify-between">
                        <span className={`text-[14px] font-semibold ${style === item.value ? 'text-[#0052cc]' : 'text-[#041b3c]'}`}>
                          {item.label}
                        </span>
                        {style === item.value && <CheckCircle2 size={16} className="text-[#0052cc]" />}
                      </div>
                      <small className="text-[12px] text-[#737685] mt-1 leading-relaxed">{item.description}</small>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-2 relative mt-4" htmlFor="custom-prompt">
                <span className="text-[13px] font-medium text-[#434654]">补充定制指令（可选）</span>
                <textarea
                  id="custom-prompt"
                  rows={2}
                  maxLength={2000}
                  placeholder="例如：请重点提炼产品策略、风险和可执行建议..."
                  className="w-full rounded-md border border-[#c3c6d6] bg-[#f9f9ff]/50 px-3 py-2 text-[14px] text-[#041b3c] outline-none transition-all placeholder:text-[#737685]/70 focus:border-[#0052cc] focus:bg-white resize-none"
                  value={customPrompt}
                  onChange={(event) => onCustomPromptChange(event.target.value)}
                  disabled={isRunning}
                />
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-[#ffdad6]/60 border border-[#ffdad6] p-3 text-[13px] text-[#93000a] mt-4">
                  <AlertCircle className="shrink-0 mt-0.5" size={16} />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}
              {notice && (
                <div className="flex items-start gap-2 rounded-lg bg-[#e8edff] border border-[#d7e2ff] p-3 text-[13px] text-[#0040a2] mt-4">
                  <CheckCircle2 className="shrink-0 mt-0.5" size={16} />
                  <p className="leading-relaxed">{notice}</p>
                </div>
              )}
              {partialErrors.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg bg-[#ffddb3]/40 border border-[#ffddb3] p-3 text-[13px] text-[#624000] mt-4">
                  {partialErrors.map((msg, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertCircle className="shrink-0 mt-0.5" size={16} />
                      <p className="leading-relaxed">{msg}</p>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      <section className="w-full bg-white border-y border-[#e8edff] py-20">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <h2 className="text-3xl font-bold text-[#041b3c] tracking-tight">不仅是摘要，更是认知整理框架</h2>
            <p className="text-lg text-[#434654] leading-relaxed">为深度研究和重度内容消费者提供结构化知识管理，减少低效重复阅读。</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {valueCards.map((item) => (
              <article className="group relative rounded-2xl bg-[#f9f9ff] p-8 transition-all hover:bg-white hover:shadow-[0_24px_48px_rgba(14,37,70,0.06)] border border-transparent hover:border-[#d7e2ff]" key={item.title}>
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#e8edff] text-[#0052cc] transition-transform group-hover:scale-110 group-hover:bg-[#0052cc] group-hover:text-white">
                  {item.icon}
                </div>
                <h3 className="mb-3 text-[19px] font-bold text-[#041b3c]">{item.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#434654]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full max-w-[800px] mx-auto px-6 py-20">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <HelpCircle aria-hidden="true" size={28} className="text-[#0052cc]" />
          <h2 className="text-3xl font-bold text-[#041b3c] tracking-tight">常见问题</h2>
        </div>
        <div className="space-y-6">
          {[
            {
              q: "支持哪些平台的视频？",
              a: "本地工具默认使用 yt-dlp 支持大部分公开视频（如 YouTube）。已针对 Bilibili（部分公开画质）、抖音提供专用解析线路；无字幕视频将自动静默使用 StepAudio 转写。"
            },
            {
              q: "字幕或转写不准怎么办？",
              a: "受限于公开网络抓取策略。我们会首选原视频自带的无障碍字幕；若无字幕，转而使用音轨通过 STT 生成，请确保音频清晰，生成可能耗时数十秒。"
            },
            {
              q: "生成结果需要会员吗？",
              a: "当前为本地 MVP 方案，依靠你配置在环境变量的 API Key 进行请求，只要余额足够即可不受次数限制。"
            },
            {
              q: "隐私和历史记录？",
              a: "本地不设计数据库，任务运行在内存并在后台到期销毁。每次刷新页面等于全部归零，请通过“一键复制”保存你的报告和文稿。"
            }
          ].map((faq, index) => (
            <div key={index} className="rounded-2xl border border-[#e8edff] bg-white p-6 md:p-8">
              <h3 className="text-[17px] font-bold text-[#041b3c] mb-2">{faq.q}</h3>
              <p className="text-[15px] leading-relaxed text-[#434654]">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}function SummaryPage({
  hasResultSurface,
  video,
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
                  isRunning={isRunning}
                  currentStage={currentStage}
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
  isRunning,
  currentStage
}: {
  markdown: string;
  summary: StructuredSummary | null;
  isRunning: boolean;
  currentStage: SummaryStage | null;
}) {
  if (!markdown && isRunning) {
    return <SummaryProgressState currentStage={currentStage} />;
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

function SummaryProgressState({ currentStage }: { currentStage: SummaryStage | null }) {
  const label = getCompactStageLabel(currentStage);

  return (
    <div className="summary-progress-state" role="status" aria-live="polite">
      <div className="summary-progress-icon">
        <Loader2 aria-hidden="true" className="spin" size={20} />
      </div>
      <p className="eyebrow">智能总结处理中</p>
      <strong>{label}</strong>
      <div className="summary-progress-track" aria-hidden="true">
        <span className="summary-progress-bar" />
      </div>
      <span className="summary-progress-hint">完成后摘要会自动显示在这里。</span>
    </div>
  );
}

function getCompactStageLabel(stage: SummaryStage | null): string {
  if (stage === "loading_transcript" || stage === "transcribing") {
    return "视频转写";
  }
  if (stage === "summarizing" || stage === "building_mindmap" || stage === "preparing_qa" || stage === "completed") {
    return "生成总结";
  }
  return "解析视频";
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

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function getPageFromPath(): AppPage {
  return window.location.pathname === "/summary" ? "summary" : "home";
}

export default App;
