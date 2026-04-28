import { Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MindMapNode } from "../../types";
import { EmptyPanel } from "../ui/EmptyPanel";
import { exportMindMapPng, exportMindMapSvg } from "../../utils/mindmapExport";
import { collectNodeIds, getMindMapLayout, parseTitleParts, truncateText } from "../../utils/mindmap";
import "./MindMapPanel.css";

export function MindMapPanel({
  mindmap,
  videoTitle
}: {
  mindmap: MindMapNode | null;
  videoTitle: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!mindmap) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(new Set(collectNodeIds(mindmap)));
  }, [mindmap]);

  if (!mindmap) {
    return <EmptyPanel icon={<MapIcon size={22} />} text="思维导图生成后会显示在这里。" />;
  }

  const layout = getMindMapLayout(mindmap, expandedIds, {
    rootCircleX: 320,
    depthGap: 300,
    leafGap: 52,
    topPadding: 70,
    rightPadding: 96,
    bottomPadding: 90
  });
  const nodePositions = new Map(layout.nodes.map((item) => [item.node.id, item]));

  function toggleNode(node: MindMapNode) {
    if (!node.children.length) {
      return;
    }
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
    <div className="mindmap-panel">
      <div className="mindmap-actions">
        <button type="button" className="soft-button compact-button" onClick={() => exportMindMapSvg(svgRef.current, videoTitle)}>
          导出 SVG
        </button>
        <button type="button" className="soft-button compact-button" onClick={() => exportMindMapPng(svgRef.current, videoTitle)}>
          导出 PNG
        </button>
      </div>
      <div className="mindmap-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label="视频思维导图">
          <rect width={layout.width} height={layout.height} rx="18" fill="#fbfdff" />
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
            const titleLimit = isRoot ? 24 : item.hasVisibleChildren ? 18 : 24;
            const titleText = truncateText(titleParts.rest, titleLimit);
            const prefixText = titleParts.prefix ? truncateText(titleParts.prefix, 9) : null;
            const showSummary = !isRoot && !item.hasVisibleChildren && Boolean(item.node.summary);
            const summaryText = showSummary ? truncateText(item.node.summary!, 30) : "";
            const lineColor = isRoot ? "#4b8ee8" : (color?.main ?? "#8aa6c8");
            const textColor = isRoot ? "#6b7280" : "#6f7888";
            const circleFill = "#fbfdff";

            return (
              <g
                key={item.node.id}
                role={item.node.children.length ? "button" : "img"}
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
                    <tspan>{isRoot ? truncateText(item.node.title, 24) : titleText}</tspan>
                  )}
                  {summaryText ? (
                    <tspan fill="#8b94a3" fontWeight="400">
                      {titleParts.prefix ? "  " : "："}{summaryText}
                    </tspan>
                  ) : null}
                </text>
                {(item.node.children.length || isRoot) ? (
                  <g className="mindmap-toggle" transform={`translate(${item.lineEndX} ${item.y})`}>
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
        </svg>
      </div>
    </div>
  );
}
