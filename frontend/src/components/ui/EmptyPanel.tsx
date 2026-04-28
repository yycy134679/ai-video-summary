import { Loader2 } from "lucide-react";
import type { ReactElement } from "react";

export function EmptyPanel({
  icon,
  text,
  isLoading = false
}: {
  icon: ReactElement;
  text: string;
  isLoading?: boolean;
}) {
  return (
    <div className="empty-panel" role={isLoading ? "status" : undefined} aria-live={isLoading ? "polite" : undefined}>
      {isLoading ? <Loader2 aria-hidden="true" className="spin" size={22} /> : icon}
      <span>{text}</span>
    </div>
  );
}
