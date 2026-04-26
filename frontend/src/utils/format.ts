export function formatDuration(duration: number | null): string {
  if (!duration || duration <= 0) {
    return "未知时长";
  }
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}


export function formatCueTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${pad(rest)}`;
}


function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
