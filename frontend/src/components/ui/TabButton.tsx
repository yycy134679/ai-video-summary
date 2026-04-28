import type { ReactElement } from "react";

type ActiveTab = "summary" | "mindmap" | "transcript" | "qa";

const TAB_ORDER: ActiveTab[] = ["summary", "mindmap", "transcript", "qa"];

export function TabButton({
  activeTab,
  value,
  icon,
  children,
  onChange,
  onKeyNavigate
}: {
  activeTab: ActiveTab;
  value: ActiveTab;
  icon: ReactElement;
  children: string;
  onChange: (value: ActiveTab) => void;
  onKeyNavigate?: (event: React.KeyboardEvent) => void;
}) {
  const selected = activeTab === value;
  return (
    <button
      type="button"
      id={`tab-${value}`}
      className={selected ? "tab-button tab-button-active" : "tab-button"}
      role="tab"
      aria-selected={selected}
      aria-controls={`tabpanel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => onChange(value)}
      onKeyDown={onKeyNavigate}
    >
      {icon}
      {children}
    </button>
  );
}

export { TAB_ORDER };
