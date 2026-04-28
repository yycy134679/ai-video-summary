import type { ReactElement } from "react";

export function EmptyPanel({ icon, text }: { icon: ReactElement; text: string }) {
  return (
    <div className="empty-panel">
      {icon}
      <span>{text}</span>
    </div>
  );
}
