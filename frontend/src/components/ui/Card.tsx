import type { HTMLAttributes } from "react";

import { cn } from "./className";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-card", className)} {...props} />;
}
