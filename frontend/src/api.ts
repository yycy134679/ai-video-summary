import type { Quality, TranscriptTaskInfo, VideoInfo } from "./types";

interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
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
