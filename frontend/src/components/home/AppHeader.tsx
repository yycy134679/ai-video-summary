import { Bot } from "lucide-react";
import type { MouseEvent } from "react";

import { Button } from "../ui/Button";
import "./AppHeader.css";

const navItems = [
  { label: "功能", target: "features" },
  { label: "使用场景", target: "use-cases" },
  { label: "定价", target: "pricing" },
  { label: "博客", target: "blog" },
  { label: "帮助中心", target: "help" }
];

export function AppHeader({ onHome }: { onHome: () => void }) {
  function handleAnchor(event: MouseEvent<HTMLAnchorElement>, target: string) {
    event.preventDefault();
    onHome();
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a
          className="site-brand"
          href="/"
          aria-label="VideoSummarize AI"
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          <span className="site-brand-mark" aria-hidden="true">
            <Bot size={18} />
          </span>
          <span>VideoSummarize AI</span>
        </a>

        <nav className="site-nav" aria-label="主导航">
          {navItems.map((item) => (
            <a key={item.target} href={`#${item.target}`} onClick={(event) => handleAnchor(event, item.target)}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-actions">
          <a className="login-link" href="#top" onClick={(event) => handleAnchor(event, "top")}>
            登录
          </a>
          <Button type="button" className="trial-button" onClick={onHome}>
            免费试用
          </Button>
        </div>
      </div>
    </header>
  );
}
