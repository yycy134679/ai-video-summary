import type { MindMapNode } from "../types";

export function getMindMapRows(root: MindMapNode, expandedIds: Set<string>) {
  const rows: Array<{ node: MindMapNode; depth: number; parentId: string | null }> = [];

  function visit(node: MindMapNode, depth: number, parentId: string | null) {
    rows.push({ node, depth, parentId });
    if (!expandedIds.has(node.id)) {
      return;
    }
    node.children.forEach((child) => visit(child, depth + 1, node.id));
  }

  visit(root, 0, null);
  return rows;
}


export function collectNodeIds(root: MindMapNode): string[] {
  return [root.id, ...root.children.flatMap((child) => collectNodeIds(child))];
}


export function wrapText(value: string, size: number): string[] {
  const chars = Array.from(value.trim());
  if (chars.length <= size) {
    return [value.trim()];
  }
  return [
    chars.slice(0, size).join(""),
    `${chars.slice(size, size * 2 - 1).join("")}${chars.length > size * 2 - 1 ? "..." : ""}`
  ];
}
