export type Quality = "source" | "4k" | "1080p" | "720p" | "audio";

export interface QualityOption {
  quality: Quality;
  label: string;
  available: boolean;
  estimatedSize: number | null;
}

export interface VideoInfo {
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  options: QualityOption[];
}
