import { Loader2, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import type { StructuredSummary, SummaryStage } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import "./SummaryPanel.css";

export function SummaryPanel({
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

  const displayMarkdown = summary?.oneSentence ? removeOneSentenceSection(markdown) : markdown;

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
          {displayMarkdown}
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

function removeOneSentenceSection(markdown: string): string {
  return markdown.replace(/^##\s+一句话总结\s*\n[\s\S]*?(?=^##\s+)/m, "").trimStart();
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
  if (stage === "summarizing" || stage === "building_mindmap") {
    return "AI 分析中";
  }
  if (stage === "preparing_qa") {
    return "准备问答";
  }
  if (stage === "completed") {
    return "完成";
  }
  return "解析视频";
}
