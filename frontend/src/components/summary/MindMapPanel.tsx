import { Maximize2, Minimize2, Map as MapIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MindMapNode } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import { Button } from "../ui/Button";
import { exportMindMapPng, exportMindMapSvg } from "../../utils/mindmapExport";
import { collectNodeIds, getMindMapLayout, parseTitleParts, truncateText, type MindMapTextLimits } from "../../utils/mindmap";
import "./MindMapPanel.css";

const COMPACT_TEXT_LIMITS: MindMapTextLimits = {
  rootTitle: 24,
  branchTitle: 18,
  leafTitle: 24,
  prefix: 9,
  summary: 30
};

const MAXIMIZED_TEXT_LIMITS: MindMapTextLimits = {
  rootTitle: 80,
  branchTitle: 64,
  leafTitle: 72,
  prefix: 24,
  summary: 120
};

export function MindMapPanel({
  mindmap,
  videoTitle,
  isRunning
}: {
  mindmap: MindMapNode | null;
  videoTitle: string;
  isRunning: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentRef = useRef<SVGGElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!mindmap) {
      setExpandedIds(new Set());
      setIsMaximized(false);
      return;
    }
    setExpandedIds(new Set(collectNodeIds(mindmap)));
    setMeasuredSize(null);
  }, [mindmap]);

  useEffect(() => {
    setMeasuredSize(null);
    if (!isMaximized) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMaximized(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMaximized]);

  const textLimits = useMemo(() => isMaximized ? MAXIMIZED_TEXT_LIMITS : COMPACT_TEXT_LIMITS, [isMaximized]);
  const layout = useMemo(() => {
    if (!mindmap) {
      return null;
    }

    return getMindMapLayout(mindmap, expandedIds, {
      rootCircleX: isMaximized ? 360 : 320,
      depthGap: isMaximized ? 520 : 300,
      leafGap: isMaximized ? 66 : 52,
      topPadding: 70,
      rightPadding: isMaximized ? 160 : 96,
      bottomPadding: 90,
      textLimits
    });
  }, [mindmap, expandedIds, isMaximized, textLimits]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !layout) {
      return;
    }

    const bbox = content.getBBox();
    const width = Math.ceil(Math.max(layout.width, bbox.x + bbox.width + 32));
    const height = Math.ceil(Math.max(layout.height, bbox.y + bbox.height + 32));

    setMeasuredSize((current) => {
      if (current?.width === width && current.height === height) {
        return current;
      }
      return { width, height };
    });
  }, [layout]);

  if (!mindmap || !layout) {
    return <EmptyPanel icon={<MapIcon size={22} />} text={isRunning ? "正在生成思维导图..." : "思维导图生成后会显示在这里。"} isLoading={isRunning} />;
  }

  const svgSize = measuredSize ?? { width: layout.width, height: layout.height };
  const nodePositions = new Map(layout.nodes.map((item) => [item.node.id, item]));

  function toggleNode(node: MindMapNode) {
    if (!node.children.length) {
      return;
    }
    setMeasuredSize(null);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }

  return (
    <div className={isMaximized ? "mindmap-panel mindmap-panel-maximized" : "mindmap-panel"}>
      <div className="mindmap-toolbar">
        <div className="mindmap-toolbar-copy">
          {isMaximized ? (
            <>
              <strong>最大化查看</strong>
              <span>按 Esc 退出，支持横向和纵向滚动。</span>
            </>
          ) : null}
        </div>
        <div className="mindmap-actions">
          <Button
            variant="soft"
            size="compact"
            onClick={() => setIsMaximized((current) => !current)}
            aria-pressed={isMaximized}
          >
            {isMaximized ? <Minimize2 aria-hidden="true" size={15} /> : <Maximize2 aria-hidden="true" size={15} />}
            {isMaximized ? "退出最大化" : "最大化查看"}
          </Button>
          <Button variant="soft" size="compact" onClick={() => exportMindMapSvg(svgRef.current, videoTitle)}>
            导出 SVG
          </Button>
          <Button variant="soft" size="compact" onClick={() => exportMindMapPng(svgRef.current, videoTitle)}>
            导出 PNG
          </Button>
        </div>
      </div>
      <div className="mindmap-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${svgSize.width} ${svgSize.height}`} width={svgSize.width} height={svgSize.height} role="img" aria-label="视频思维导图">
          <rect width={svgSize.width} height={svgSize.height} rx="18" fill="#fbfdff" />
          <g ref={contentRef}>
          {layout.nodes.map((item) => {
            const parent = item.parentId ? nodePositions.get(item.parentId) : null;
            if (!parent) {
              return null;
            }
            const strokeColor = item.branchColor?.main ?? "#6aa3ff";
            const sourceX = parent.lineEndX;
            const targetX = item.hasVisibleChildren ? item.lineEndX : item.lineStartX;
            const curve = Math.min(92, Math.max(46, (targetX - sourceX) * 0.42));
            return (
              <path
                key={`${item.parentId}-${item.node.id}`}
                d={`M ${sourceX} ${parent.y} C ${sourceX + curve} ${parent.y}, ${targetX - curve} ${item.y}, ${targetX} ${item.y}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={item.depth === 1 ? 2.4 : 1.9}
                strokeLinecap="round"
                opacity="0.82"
              />
            );
          })}
          {layout.nodes.map((item) => {
            const isExpanded = expandedIds.has(item.node.id);
            const isRoot = item.depth === 0;
            const color = item.branchColor;
            const titleParts = parseTitleParts(item.node.title);
            const titleLimit = isRoot ? textLimits.rootTitle : item.hasVisibleChildren ? textLimits.branchTitle : textLimits.leafTitle;
            const titleText = truncateText(titleParts.rest, titleLimit);
            const prefixText = titleParts.prefix ? truncateText(titleParts.prefix, textLimits.prefix) : null;
            const showSummary = !isRoot && !item.hasVisibleChildren && Boolean(item.node.summary);
            const summaryText = showSummary ? truncateText(item.node.summary!, textLimits.summary) : "";
            const lineColor = isRoot ? "#4b8ee8" : (color?.main ?? "#8aa6c8");
            const textColor = isRoot ? "#6b7280" : "#6f7888";
            const circleFill = "#fbfdff";

            const a11yLabel = item.node.children.length
              ? `${isExpanded ? "折叠" : "展开"}分支：${item.node.title}${item.node.summary ? `，${item.node.summary}` : ""}`
              : `思维导图节点：${item.node.title}${item.node.summary ? `，${item.node.summary}` : ""}`;

            return (
              <g
                key={item.node.id}
                role={item.node.children.length ? "button" : "img"}
                aria-label={a11yLabel}
                aria-expanded={item.node.children.length ? isExpanded : undefined}
                tabIndex={item.node.children.length ? 0 : -1}
                className="mindmap-branch-node"
                onClick={() => toggleNode(item.node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleNode(item.node);
                  }
                }}
              >
                <line
                  x1={item.lineStartX}
                  y1={item.y}
                  x2={item.lineEndX}
                  y2={item.y}
                  stroke={lineColor}
                  strokeWidth={isRoot ? 2.2 : 1.6}
                  strokeLinecap="round"
                  opacity={isRoot ? 0.95 : 0.78}
                />
                <text
                  x={item.textX}
                  y={item.y - 9}
                  fill={textColor}
                  fontSize={isRoot ? "16" : item.depth === 1 ? "15" : "14"}
                  fontWeight={isRoot ? "500" : item.hasVisibleChildren ? "500" : "450"}
                  className="mindmap-label"
                >
                  {prefixText ? (
                    <>
                      <tspan fill={item.hasVisibleChildren ? textColor : "#3d4655"} fontWeight={item.hasVisibleChildren ? "500" : "750"}>
                        {prefixText}：
                      </tspan>
                      <tspan>{titleText}</tspan>
                    </>
                  ) : (
                    <tspan>{isRoot ? truncateText(item.node.title, textLimits.rootTitle) : titleText}</tspan>
                  )}
                  {summaryText ? (
                    <tspan fill="#8b94a3" fontWeight="400">
                      {titleParts.prefix ? "  " : "："}{summaryText}
                    </tspan>
                  ) : null}
                </text>
                {(item.node.children.length || isRoot) ? (
                  <g className="mindmap-toggle" transform={`translate(${item.lineEndX} ${item.y})`}>
                    {item.node.children.length ? (
                      <circle r={22} fill="transparent" stroke="none" />
                    ) : null}
                    <circle r={isRoot ? 7.5 : 6.5} fill={circleFill} stroke={lineColor} strokeWidth="1.8" />
                    {item.node.children.length ? (
                      <text x="0" y="4.5" textAnchor="middle" fill={lineColor} fontSize="13" fontWeight="800">
                        {isExpanded ? "−" : "+"}
                      </text>
                    ) : null}
                  </g>
                ) : null}
              </g>
            );
          })}
          </g>
        </svg>
      </div>
    </div>
  );
}
