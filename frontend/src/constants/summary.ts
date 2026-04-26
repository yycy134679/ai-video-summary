import type { SummaryStage, SummaryStyle } from "../types";

export const summaryStyles: Array<{ value: SummaryStyle; label: string; description: string }> = [
  { value: "study_notes", label: "学习笔记", description: "结构完整，适合复习沉淀" },
  { value: "quick_read", label: "简洁速读", description: "高密度提炼，快速掌握重点" },
  { value: "deep_analysis", label: "深度分析", description: "强调因果、风险和反例" },
  { value: "business_insight", label: "商业洞察", description: "聚焦策略、机会和行动" },
  { value: "custom", label: "自定义", description: "按你的关注点调整摘要正文" }
];

export const stageDefinitions: Array<{ id: SummaryStage; label: string }> = [
  { id: "validating_url", label: "校验链接" },
  { id: "parsing", label: "解析视频" },
  { id: "loading_transcript", label: "获取字幕" },
  { id: "transcribing", label: "自动转写" },
  { id: "summarizing", label: "生成摘要" },
  { id: "building_mindmap", label: "生成脑图" },
  { id: "preparing_qa", label: "准备问答" },
  { id: "completed", label: "完成" }
];
