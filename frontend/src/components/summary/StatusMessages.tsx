import { AlertCircle, CheckCircle2 } from "lucide-react";

export function StatusMessages({
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
