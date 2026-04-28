import type { ReactElement } from "react";

type ActiveTab = "summary" | "mindmap" | "transcript" | "qa";

export function TabButton({
  activeTab,
  value,
  icon,
  children,
  onChange
}: {
  activeTab: ActiveTab;
  value: ActiveTab;
  icon: ReactElement;
  children: string;
  onChange: (value: ActiveTab) => void;
}) {
  const selected = activeTab === value;
  return (
    <button
      type="button"
      className={selected ? "tab-button tab-button-active" : "tab-button"}
      role="tab"
      aria-selected={selected}
      onClick={() => onChange(value)}
    >
      {icon}
      {children}
    </button>
  );
}
