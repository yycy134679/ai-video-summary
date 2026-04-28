import { Copy, FileText } from "lucide-react";
import type { SummaryTranscript } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import { Button } from "../ui/Button";
import { formatCueTime } from "../../utils/format";
import "./TranscriptPanel.css";

export function TranscriptPanel({
  transcript,
  isRunning,
  onCopy
}: {
  transcript: SummaryTranscript | null;
  isRunning: boolean;
  onCopy: (text: string) => void;
}) {
  if (!transcript) {
    return <EmptyPanel icon={<FileText size={22} />} text={isRunning ? "正在获取视频文稿..." : "原文稿生成后会显示在这里。"} isLoading={isRunning} />;
  }

  return (
    <article className="transcript-panel">
      <div className="panel-heading transcript-heading">
        <div>
          <strong>原文稿</strong>
          <span>{transcript.source === "subtitle" ? "公开字幕" : "StepAudio ASR"}</span>
        </div>
        <Button variant="soft" size="compact" onClick={() => onCopy(transcript.text)}>
          <Copy aria-hidden="true" size={15} />
          复制原文
        </Button>
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
