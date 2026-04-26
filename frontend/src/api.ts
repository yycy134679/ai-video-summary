import type {
  MindMapNode,
  Quality,
  StructuredSummary,
  SummaryStageEvent,
  SummaryStyle,
  SummaryTranscript,
  TranscriptTaskInfo,
  VideoInfo
} from "./types";

interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

type SummaryStreamEvent =
  | { type: "stage"; data: SummaryStageEvent }
  | { type: "video"; data: VideoInfo }
  | { type: "transcript"; data: SummaryTranscript }
  | { type: "summary_delta"; data: { text: string } }
  | { type: "summary_done"; data: { markdown: string; summary: StructuredSummary } }
  | { type: "mindmap_done"; data: { mindmap: MindMapNode } }
  | { type: "qa_ready"; data: { sessionId: string; expiresInSeconds: number } }
  | { type: "partial_error"; data: { scope: string; message: string } }
  | { type: "fatal_error"; data: { message: string } }
  | { type: "done"; data: { ok: boolean } };

type QaStreamEvent =
  | { type: "answer_delta"; data: { text: string } }
  | { type: "answer_done"; data: { messageId: string } }
  | { type: "fatal_error"; data: { message: string } };

export interface SummaryStreamHandlers {
  onStage?: (event: SummaryStageEvent) => void;
  onVideo?: (video: VideoInfo) => void;
  onTranscript?: (transcript: SummaryTranscript) => void;
  onSummaryDelta?: (text: string) => void;
  onSummaryDone?: (payload: { markdown: string; summary: StructuredSummary }) => void;
  onMindMapDone?: (mindmap: MindMapNode) => void;
  onQaReady?: (payload: { sessionId: string; expiresInSeconds: number }) => void;
  onPartialError?: (payload: { scope: string; message: string }) => void;
  onFatalError?: (message: string) => void;
  onDone?: () => void;
}

export interface QaStreamHandlers {
  onAnswerDelta?: (text: string) => void;
  onAnswerDone?: (messageId: string) => void;
  onFatalError?: (message: string) => void;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

export class DownloadCanceledError extends Error {
  constructor() {
    super("已取消下载。");
    this.name = "DownloadCanceledError";
  }
}

export async function parseVideo(url: string): Promise<VideoInfo> {
  const response = await fetch("/api/videos/parse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<VideoInfo>;
}

export async function streamVideoSummary(
  payload: { url: string; style: SummaryStyle; customPrompt?: string | null },
  handlers: SummaryStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/summaries/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  await readSseStream<SummaryStreamEvent>(response, (event) => {
    if (event.type === "stage") {
      handlers.onStage?.(event.data);
    } else if (event.type === "video") {
      handlers.onVideo?.(event.data);
    } else if (event.type === "transcript") {
      handlers.onTranscript?.(event.data);
    } else if (event.type === "summary_delta") {
      handlers.onSummaryDelta?.(event.data.text);
    } else if (event.type === "summary_done") {
      handlers.onSummaryDone?.(event.data);
    } else if (event.type === "mindmap_done") {
      handlers.onMindMapDone?.(event.data.mindmap);
    } else if (event.type === "qa_ready") {
      handlers.onQaReady?.(event.data);
    } else if (event.type === "partial_error") {
      handlers.onPartialError?.(event.data);
    } else if (event.type === "fatal_error") {
      handlers.onFatalError?.(event.data.message);
    } else if (event.type === "done") {
      handlers.onDone?.();
    }
  });
}

export async function streamQaAnswer(
  sessionId: string,
  question: string,
  handlers: QaStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/summaries/${encodeURIComponent(sessionId)}/questions/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ question }),
    signal
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  await readSseStream<QaStreamEvent>(response, (event) => {
    if (event.type === "answer_delta") {
      handlers.onAnswerDelta?.(event.data.text);
    } else if (event.type === "answer_done") {
      handlers.onAnswerDone?.(event.data.messageId);
    } else if (event.type === "fatal_error") {
      handlers.onFatalError?.(event.data.message);
    }
  });
}

export function buildDownloadUrl(url: string, quality: Quality): string {
  const params = new URLSearchParams({ url, quality });
  return `/api/videos/download?${params.toString()}`;
}

export async function getTranscriptTask(taskId: string): Promise<TranscriptTaskInfo> {
  const response = await fetch(`/api/transcripts/${encodeURIComponent(taskId)}`);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<TranscriptTaskInfo>;
}

export async function downloadVideoFile(
  url: string,
  quality: Quality,
  suggestedName: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<{ bytesWritten: number; filename: string }> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (!pickerWindow.showSaveFilePicker) {
    throw new Error("当前浏览器不支持带进度的流式保存。请使用 Chrome 或 Edge 打开本地页面后重试。");
  }

  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName: ensureFilenameExtension(suggestedName, quality),
      types: filePickerTypes(quality),
      excludeAcceptAllOption: false
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new DownloadCanceledError();
    }
    throw err;
  }

  const response = await fetch(buildDownloadUrl(url, quality));

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const filename = fileHandle.name || parseFilename(response.headers.get("Content-Disposition")) || suggestedName;
  const totalBytes = parseContentLength(response.headers.get("Content-Length"));

  if (!response.body) {
    throw new Error("当前浏览器不支持流式读取下载响应，无法保留下载进度。");
  }

  const reader = response.body.getReader();
  const writable = await fileHandle.createWritable();
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      await writable.write(value);
      receivedBytes += value.byteLength;
      onProgress({ receivedBytes, totalBytes });
    }
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => undefined);
    throw err;
  }

  return {
    bytesWritten: receivedBytes,
    filename
  };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail || "请求失败，请稍后重试。";
  } catch {
    return "请求失败，请稍后重试。";
  }
}

async function readSseStream<T extends { type: string; data: unknown }>(
  response: Response,
  onEvent: (event: T) => void
): Promise<void> {
  if (!response.body) {
    throw new Error("当前浏览器不支持流式读取响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const nextBuffer = consumeSseBuffer(buffer, onEvent);
    buffer = nextBuffer;
  }

  buffer += decoder.decode();
  consumeSseBuffer(buffer, onEvent, true);
}

function consumeSseBuffer<T extends { type: string; data: unknown }>(
  buffer: string,
  onEvent: (event: T) => void,
  flush = false
): string {
  let cursor = 0;
  while (true) {
    const separatorIndex = buffer.indexOf("\n\n", cursor);
    if (separatorIndex < 0) {
      break;
    }
    const chunk = buffer.slice(cursor, separatorIndex);
    cursor = separatorIndex + 2;
    emitSseChunk(chunk, onEvent);
  }

  const remaining = buffer.slice(cursor);
  if (flush && remaining.trim()) {
    emitSseChunk(remaining, onEvent);
    return "";
  }
  return remaining;
}

function emitSseChunk<T extends { type: string; data: unknown }>(
  chunk: string,
  onEvent: (event: T) => void
) {
  const lines = chunk.split(/\r?\n/);
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return;
  }

  const data = dataLines.join("\n");
  if (!data || data === "[DONE]") {
    return;
  }

  try {
    onEvent({ type: eventType, data: JSON.parse(data) } as T);
  } catch {
    // 忽略单个异常 SSE 包，后端会继续发送 fatal_error 或 done。
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = value.match(/filename="?([^"]+)"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return null;
}

function ensureFilenameExtension(filename: string, quality: Quality): string {
  const extension = quality === "audio" ? ".mp3" : ".mp4";
  const normalized = filename.trim() || `video-${quality}${extension}`;
  if (/\.[a-z0-9]{2,5}$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}${extension}`;
}

function filePickerTypes(quality: Quality): FilePickerAcceptType[] {
  if (quality === "audio") {
    return [
      {
        description: "音频文件",
        accept: {
          "audio/mpeg": [".mp3"]
        }
      }
    ];
  }

  return [
    {
      description: "视频文件",
      accept: {
        "video/mp4": [".mp4"]
      }
    }
  ];
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
