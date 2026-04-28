import { safeFilename } from "./url";

export function exportMindMapSvg(svg: SVGSVGElement | null, title: string) {
  if (!svg) {
    return;
  }
  const serialized = serializeSvg(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(title)}-思维导图.svg`);
}

export function exportMindMapPng(svg: SVGSVGElement | null, title: string) {
  if (!svg) {
    return;
  }
  const serialized = serializeSvg(svg);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  const width = svg.viewBox.baseVal.width || svg.width.baseVal.value;
  const height = svg.viewBox.baseVal.height || svg.height.baseVal.value;
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }
    context.fillStyle = "#f8fbff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${safeFilename(title)}-思维导图.png`);
      }
    }, "image/png");
  };
  image.src = url;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
