import type { SummaryTranscript, VideoInfo } from "../types";
import { formatDuration } from "./format";

export function buildSummaryExport(video: VideoInfo, transcript: SummaryTranscript | null, markdown: string): string {
  const source = transcript?.source === "subtitle" ? "公开字幕" : transcript?.source === "asr" ? "StepAudio ASR" : "未知";
  return [
    `# ${video.title}`,
    "",
    `- 来源：${video.webpageUrl}`,
    `- 作者：${video.uploader || "未知作者"}`,
    `- 时长：${formatDuration(video.duration)}`,
    `- 文稿来源：${source}`,
    "",
    markdown.trim()
  ].join("\n");
}
