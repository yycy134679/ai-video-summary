import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileText } from "lucide-react";
import { EmptyPanel } from "../components/ui/EmptyPanel";

describe("EmptyPanel", () => {
  it("renders the text prop", () => {
    render(<EmptyPanel icon={<FileText data-testid="icon" />} text="没有数据" />);
    expect(screen.getByText("没有数据")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    render(<EmptyPanel icon={<FileText />} text="加载中..." isLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("does not use status role when not loading", () => {
    const { container } = render(<EmptyPanel icon={<FileText />} text="闲置" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
