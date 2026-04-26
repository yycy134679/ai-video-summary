export function isHttpUrl(value: string): boolean {
  const urlMatch = value.match(/https?:\/\/[^\s]+/i);
  const candidate = urlMatch?.[0] ?? value;
  try {
    const parsedUrl = new URL(candidate);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}


export function safeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "视频";
}
