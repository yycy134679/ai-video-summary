import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./Button";
import "../summary/SummaryPage.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <main id="top">
            <section className="summary-empty-state" aria-labelledby="error-title">
              <h1 id="error-title">出错了</h1>
              <p className="eyebrow">应用遇到了意外错误，请尝试刷新页面。</p>
              <Button
                onClick={() => window.location.reload()}
              >
                <RefreshCw aria-hidden="true" size={16} />
                刷新页面
              </Button>
            </section>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
