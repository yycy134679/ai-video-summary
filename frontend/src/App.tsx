import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  streamQaAnswer,
  streamVideoSummary,
  isAbortError
} from "./api";
import { AppHeader } from "./components/home/AppHeader";
import { HomePage } from "./components/home/HomePage";
import { SummaryPage } from "./components/summary/SummaryPage";
import { stageDefinitions } from "./constants/summary";
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
import { isHttpUrl } from "./utils/url";

type ActiveTab = "summary" | "mindmap" | "transcript" | "qa";
type AppPage = "home" | "summary";

const ASR_ERROR_KEYWORDS = ["转写", "ASR", "字幕", "文稿", "转录", "音频", "ffmpeg"];

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
  const [retryableError, setRetryableError] = useState<{ type: "asr" | "deepseek"; message: string } | null>(null);
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

  async function startSummary(
    targetUrl: string,
    targetStyle: SummaryStyle,
    targetCustomPrompt: string
  ) {
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    resetResultState();
    setError("");
    setNotice("");
    setRetryableError(null);
    setIsRunning(true);
    setActiveTab("summary");
    navigateTo("summary");

    try {
      await streamVideoSummary(
        {
          url: targetUrl,
          style: targetStyle,
          customPrompt: targetCustomPrompt.trim() || null
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
            setRetryableError({
              type: classifyErrorType(message),
              message
            });
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
        const message = err instanceof Error ? err.message : "视频总结失败，请检查链接后重试。";
        setError(message);
        setRetryableError({
          type: classifyErrorType(message),
          message
        });
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
    await startSummary(normalizedUrl, style, customPrompt);
  }

  function handleRetry() {
    if (!retryableError) return;
    startSummary(url, style, customPrompt);
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
    setRetryableError(null);
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
    requestAnimationFrame(() => {
      const targetId = nextPage === "summary" ? "report-title" : "home-title";
      document.getElementById(targetId)?.focus();
    });
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

  return (
    <div className="app-shell">
      <AppHeader onHome={handleReset} />

      <main id="top">
        {page === "summary" ? (
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
            retryableError={retryableError}
            isRunning={isRunning}
            isAsking={isAsking}
            onReset={handleReset}
            onCopy={handleCopy}
            onActiveTabChange={setActiveTab}
            onQuestionChange={setQaQuestion}
            onAsk={handleAsk}
            onRetry={handleRetry}
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

function classifyErrorType(message: string): "asr" | "deepseek" {
  return ASR_ERROR_KEYWORDS.some((kw) => message.includes(kw)) ? "asr" : "deepseek";
}

function getPageFromPath(): AppPage {
  return window.location.pathname === "/summary" ? "summary" : "home";
}

export default App;
