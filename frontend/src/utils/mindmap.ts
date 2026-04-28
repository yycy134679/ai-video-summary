import type { MindMapNode } from "../types";

export interface BranchColor {
  main: string;
  muted: string;
}

export const BRANCH_COLORS: BranchColor[] = [
  { main: "#f2994a", muted: "#f6b36f" },
  { main: "#57b365", muted: "#86c98b" },
  { main: "#5aa4cf", muted: "#83bddb" },
  { main: "#a77cc8", muted: "#b99ad3" },
  { main: "#d85c4a", muted: "#e17c6d" },
  { main: "#b6bf48", muted: "#c7ce73" },
  { main: "#52c4c8", muted: "#7ed5d8" },
  { main: "#d987b8", muted: "#e2a5ca" },
];

export interface MindMapTextLimits {
  rootTitle: number;
  branchTitle: number;
  leafTitle: number;
  prefix: number;
  summary: number;
}

export interface MindMapLayoutOptions {
  rootCircleX: number;
  depthGap: number;
  leafGap: number;
  topPadding: number;
  rightPadding: number;
  bottomPadding: number;
  textLimits: MindMapTextLimits;
}

export interface MindMapLayoutNode {
  node: MindMapNode;
  depth: number;
  parentId: string | null;
  branchColor: BranchColor | null;
  x: number;
  y: number;
  textX: number;
  lineStartX: number;
  lineEndX: number;
  hasVisibleChildren: boolean;
}

export interface MindMapLayout {
  nodes: MindMapLayoutNode[];
  width: number;
  height: number;
}

interface LayoutDraft {
  node: MindMapNode;
  depth: number;
  parentId: string | null;
  branchColor: BranchColor | null;
  children: LayoutDraft[];
  y: number;
}

export function getMindMapLayout(
  root: MindMapNode,
  expandedIds: Set<string>,
  options: MindMapLayoutOptions
): MindMapLayout {
  const colorMap = getBranchColorMap(root);
  const draft = buildDraft(root, expandedIds, colorMap, 0, null);
  let leafIndex = 0;

  function assignY(item: LayoutDraft): number {
    if (!item.children.length) {
      item.y = options.topPadding + leafIndex * options.leafGap;
      leafIndex += 1;
      return item.y;
    }
    const childYs = item.children.map(assignY);
    item.y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    return item.y;
  }

  assignY(draft);

  const nodes: MindMapLayoutNode[] = [];
  let maxX = 0;

  function flatten(item: LayoutDraft) {
    const labelWidth = estimateLabelWidth(item.node, item.children.length > 0, item.depth, options.textLimits);
    const x = item.depth === 0
      ? options.rootCircleX
      : options.rootCircleX + item.depth * options.depthGap;
    const hasVisibleChildren = item.children.length > 0;
    const lineStartX = item.depth === 0
      ? 32
      : hasVisibleChildren
        ? Math.max(32, x - labelWidth - 10)
        : x;
    const lineEndX = hasVisibleChildren || item.depth === 0
      ? x
      : x + labelWidth;
    const textX = item.depth === 0
      ? lineStartX
      : hasVisibleChildren
        ? lineStartX + 4
        : lineStartX + 8;

    nodes.push({
      node: item.node,
      depth: item.depth,
      parentId: item.parentId,
      branchColor: item.branchColor,
      x,
      y: item.y,
      textX,
      lineStartX,
      lineEndX,
      hasVisibleChildren,
    });
    maxX = Math.max(maxX, lineEndX);
    item.children.forEach(flatten);
  }

  flatten(draft);

  const height = Math.max(360, options.topPadding + Math.max(leafIndex - 1, 0) * options.leafGap + options.bottomPadding);
  return {
    nodes,
    width: Math.max(760, maxX + options.rightPadding),
    height,
  };
}

function buildDraft(
  node: MindMapNode,
  expandedIds: Set<string>,
  colorMap: Map<string, BranchColor>,
  depth: number,
  parentId: string | null
): LayoutDraft {
  const children = expandedIds.has(node.id)
    ? node.children.map((child) => buildDraft(child, expandedIds, colorMap, depth + 1, node.id))
    : [];
  return {
    node,
    depth,
    parentId,
    branchColor: depth === 0 ? null : (colorMap.get(node.id) ?? null),
    children,
    y: 0,
  };
}

function getBranchColorMap(root: MindMapNode): Map<string, BranchColor> {
  const map = new Map<string, BranchColor>();
  root.children.forEach((child, index) => {
    assignColorToSubtree(child, BRANCH_COLORS[index % BRANCH_COLORS.length], map);
  });
  return map;
}

function assignColorToSubtree(
  node: MindMapNode,
  color: BranchColor,
  map: Map<string, BranchColor>
) {
  map.set(node.id, color);
  node.children.forEach((child) => assignColorToSubtree(child, color, map));
}

function estimateLabelWidth(
  node: MindMapNode,
  hasVisibleChildren: boolean,
  depth: number,
  textLimits: MindMapTextLimits
): number {
  if (depth === 0) {
    return Math.max(160, estimateTextWidth(truncateText(node.title, textLimits.rootTitle), 16) + 24);
  }

  const titleParts = parseTitleParts(node.title);
  const titleText = truncateText(titleParts.rest, hasVisibleChildren ? textLimits.branchTitle : textLimits.leafTitle);
  const prefixText = titleParts.prefix ? truncateText(titleParts.prefix, textLimits.prefix) : null;
  const summaryText = !hasVisibleChildren && node.summary ? truncateText(node.summary, textLimits.summary) : "";
  const labelText = prefixText
    ? `${prefixText}：${titleText}${summaryText ? `  ${summaryText}` : ""}`
    : `${titleText}${summaryText ? `：${summaryText}` : ""}`;
  return Math.max(92, estimateTextWidth(labelText, depth === 1 ? 15 : 14) + 36);
}

function estimateTextWidth(value: string, fontSize: number): number {
  return Array.from(value).reduce((width, char) => {
    if (/[^\x00-\xff]/.test(char)) {
      return width + fontSize;
    }
    if (/[A-Z0-9]/.test(char)) {
      return width + fontSize * 0.62;
    }
    if (/\s/.test(char)) {
      return width + fontSize * 0.35;
    }
    return width + fontSize * 0.5;
  }, 0);
}

export function collectNodeIds(root: MindMapNode): string[] {
  return [root.id, ...root.children.flatMap((child) => collectNodeIds(child))];
}

export function truncateText(value: string, maxChars: number): string {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) {
    return value.trim();
  }
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

export function parseTitleParts(title: string): {
  prefix: string | null;
  rest: string;
} {
  const match = title.match(/^([^：:]+)[：:]\s*(.+)$/);
  if (match) {
    return { prefix: match[1], rest: match[2] };
  }
  return { prefix: null, rest: title };
}
