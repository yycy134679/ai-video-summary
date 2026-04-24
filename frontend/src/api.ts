import type { Quality, VideoInfo } from "./types";

interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
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

export async function downloadVideoFile(
  url: string,
  quality: Quality,
  onProgress: (progress: DownloadProgress) => void
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(buildDownloadUrl(url, quality));

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const filename = parseFilename(response.headers.get("Content-Disposition")) || `video-${quality}`;
  const totalBytes = parseContentLength(response.headers.get("Content-Length"));

  if (!response.body) {
    const blob = await response.blob();
    onProgress({ receivedBytes: blob.size, totalBytes: blob.size });
    return { blob, filename };
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    receivedBytes += value.byteLength;
    onProgress({ receivedBytes, totalBytes });
  }

  return {
    blob: new Blob(chunks, {
      type: response.headers.get("Content-Type") || "application/octet-stream"
    }),
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
