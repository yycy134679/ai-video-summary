import { Copy, RefreshCw, Sparkles } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import type {
  MindMapNode,
  QaMessage,
  StructuredSummary,
  SummaryStage,
  SummaryTranscript,
  VideoInfo
} from "../../types";
import { StatusMessages } from "./StatusMessages";
import { VideoPreviewPanel } from "./VideoPreviewPanel";
import { SummaryPanel } from "./SummaryPanel";
import { MindMapPanel } from "./MindMapPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { QaPanel } from "./QaPanel";
import { TabButton, TAB_ORDER } from "../ui/TabButton";
import { Button } from "../ui/Button";
import { buildSummaryExport } from "../../utils/summaryExport";
import { FileText, Map as MapIcon, MessageSquareText } from "lucide-react";
import "./SummaryPage.css";
import "./AnalysisPanel.css";

type ActiveTab = "summary" | "mindmap" | "transcript" | "qa";

export function SummaryPage({
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
  retryableError,
  isRunning,
  isAsking,
  onReset,
  onCopy,
  onActiveTabChange,
  onQuestionChange,
  onAsk,
  onRetry
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
  retryableError: { type: "asr" | "deepseek"; message: string } | null;
  isRunning: boolean;
  isAsking: boolean;
  onReset: () => void;
  onCopy: (text: string, successMessage: string) => Promise<void>;
  onActiveTabChange: (value: ActiveTab) => void;
  onQuestionChange: (value: string) => void;
  onAsk: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
}) {
  function handleTabKeyDown(event: KeyboardEvent) {
    const currentIdx = TAB_ORDER.indexOf(activeTab);
    let nextIdx: number;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextIdx = (currentIdx + 1) % TAB_ORDER.length;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextIdx = (currentIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIdx = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIdx = TAB_ORDER.length - 1;
    } else {
      return;
    }
    onActiveTabChange(TAB_ORDER[nextIdx]);
    const nextTab = document.getElementById(`tab-${TAB_ORDER[nextIdx]}`);
    nextTab?.focus();
  }

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
          <Button onClick={onReset}>
            <RefreshCw aria-hidden="true" size={16} />
            返回首页
          </Button>
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
            <h2 id="report-title" tabIndex={-1}>{video?.title || "正在生成分析报告"}</h2>
          </div>
          <div className="report-actions">
            <Button
              variant="soft"
              disabled={!summaryMarkdown || !video}
              onClick={() => video && onCopy(buildSummaryExport(video, transcript, summaryMarkdown), "Markdown 总结已复制。")}
            >
              <Copy aria-hidden="true" size={16} />
              复制总结
            </Button>
            <Button onClick={onReset}>
              <RefreshCw aria-hidden="true" size={16} />
              重新分析
            </Button>
          </div>
        </div>

        {retryableError ? (
          <div className="retry-banner" role="alert">
            <div>
              <strong>{retryableError.type === "asr" ? "视频转写失败" : "AI 分析服务暂时不可用"}</strong>
              <span>{retryableError.message}</span>
            </div>
            <Button size="compact" onClick={onRetry} disabled={isRunning}>
              <RefreshCw aria-hidden="true" size={16} />
              重新分析
            </Button>
          </div>
        ) : null}

        <div className="report-layout">
          <VideoPreviewPanel video={video} />

          <section className="analysis-panel" aria-label="内容分析">
            <div className="tabs" role="tablist" aria-label="分析内容" onKeyDown={handleTabKeyDown}>
              <TabButton activeTab={activeTab} value="summary" onChange={onActiveTabChange} icon={<Sparkles size={18} />} onKeyNavigate={handleTabKeyDown}>
                智能总结
              </TabButton>
              <TabButton activeTab={activeTab} value="mindmap" onChange={onActiveTabChange} icon={<MapIcon size={18} />} onKeyNavigate={handleTabKeyDown}>
                思维导图
              </TabButton>
              <TabButton activeTab={activeTab} value="transcript" onChange={onActiveTabChange} icon={<FileText size={18} />} onKeyNavigate={handleTabKeyDown}>
                原文稿
              </TabButton>
              <TabButton activeTab={activeTab} value="qa" onChange={onActiveTabChange} icon={<MessageSquareText size={18} />} onKeyNavigate={handleTabKeyDown}>
                问答
              </TabButton>
            </div>

            <div className="tab-body" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0}>
              {activeTab === "summary" ? (
                <SummaryPanel
                  markdown={summaryMarkdown}
                  summary={structuredSummary}
                  isRunning={isRunning}
                  currentStage={currentStage}
                />
              ) : null}
              {activeTab === "mindmap" ? (
                <MindMapPanel mindmap={mindmap} videoTitle={video?.title || "视频"} isRunning={isRunning} />
              ) : null}
              {activeTab === "transcript" ? (
                <TranscriptPanel
                  transcript={transcript}
                  isRunning={isRunning}
                  onCopy={(text) => onCopy(text, "原文稿已复制。")}
                />
              ) : null}
              {activeTab === "qa" ? (
                <QaPanel
                  sessionReady={Boolean(qaSessionId)}
                  messages={qaMessages}
                  question={qaQuestion}
                  isAsking={isAsking}
                  isRunning={isRunning}
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
