export type Quality = "source" | "4k" | "1080p" | "720p" | "audio";
export type SubtitleStatus = "available" | "unavailable";
export type TranscriptStatus = "queued" | "extracting_audio" | "transcribing" | "completed" | "failed";

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
