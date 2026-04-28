import { HelpCircle, Loader2, Send } from "lucide-react";
import type { FormEvent } from "react";
import type { QaMessage } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import "./QaPanel.css";

export function QaPanel({
  sessionReady,
  messages,
  question,
  isAsking,
  isRunning,
  onQuestionChange,
  onSubmit
}: {
  sessionReady: boolean;
  messages: QaMessage[];
  question: string;
  isAsking: boolean;
  isRunning: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="qa-panel">
      {!sessionReady ? (
        <EmptyPanel icon={<HelpCircle size={22} />} text={isRunning ? "AI 分析完成后将自动开启问答功能" : "摘要完成后会自动开启基于文稿的临时问答。"} isLoading={isRunning} />
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
        <label htmlFor="qa-question" className="sr-only">输入你的问题</label>
        <input
          id="qa-question"
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
