export type Quality = "source" | "4k" | "1080p" | "720p" | "audio";
export type SubtitleStatus = "available" | "unavailable";
export type TranscriptStatus = "queued" | "extracting_audio" | "transcribing" | "completed" | "failed";
export type SummaryStyle = "study_notes" | "quick_read" | "deep_analysis" | "business_insight" | "custom";
export type SummaryStage =
  | "validating_url"
  | "parsing"
  | "loading_transcript"
  | "transcribing"
  | "summarizing"
  | "building_mindmap"
  | "preparing_qa"
  | "completed";
export type StageStatus = "pending" | "running" | "completed" | "failed";

export interface QualityOption {
  quality: Quality;
  label: string;
  available: boolean;
  estimatedSize: number | null;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleInfo {
  language: string;
  languageLabel: string;
  text: string;
  cues: SubtitleCue[];
}

export interface TranscriptTaskInfo {
  taskId: string;
  status: TranscriptStatus;
  source: "asr";
  message: string | null;
  text: string | null;
}

export interface VideoInfo {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  options: QualityOption[];
  subtitles: SubtitleInfo[];
  subtitleStatus: SubtitleStatus;
  subtitleMessage: string | null;
  transcriptTask: TranscriptTaskInfo | null;
}

export interface SummaryStageEvent {
  stage: SummaryStage;
  status: StageStatus;
  message: string;
}

export interface SummaryTranscript {
  source: "subtitle" | "asr";
  text: string;
  language: string | null;
  cues: SubtitleCue[];
}

export interface SummaryChapter {
  title: string;
  start: number | null;
  end: number | null;
  bullets: string[];
}

export interface StructuredSummary {
  oneSentence: string;
  keyPoints: string[];
  chapters: SummaryChapter[];
  keywords: string[];
  actions: string[];
  cautions: string[];
}

export interface MindMapNode {
  id: string;
  title: string;
  summary: string | null;
  children: MindMapNode[];
}

export interface QaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "completed" | "failed";
}
