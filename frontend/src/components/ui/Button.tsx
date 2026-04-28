import type { ButtonHTMLAttributes } from "react";

import { cn } from "./className";

type ButtonVariant = "primary" | "secondary" | "ghost" | "soft";
type ButtonSize = "md" | "sm" | "compact";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const variantClass = variant === "soft" ? "secondary" : variant;
  const sizeClass = size === "compact" ? "sm" : size;
  return (
    <button
      className={cn("ui-button", `ui-button-${variantClass}`, `ui-button-${sizeClass}`, className)}
      {...props}
    />
  );
}
