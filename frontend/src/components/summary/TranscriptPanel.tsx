import { Copy, FileText } from "lucide-react";
import type { SummaryTranscript } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import { formatCueTime } from "../../utils/format";
import "./TranscriptPanel.css";

export function TranscriptPanel({
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
