import { ApiError } from "./api";

/** Decodes any image the browser can read (including iPhone HEIC in Safari), respecting EXIF rotation. */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Shrinks a photo to fit within `max` pixels and re-encodes it as JPEG (~100–300 KB). */
export async function resizeImage(file: File, max = 1200): Promise<Blob> {
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error("Couldn't read that image. Try a JPEG or PNG photo.");
  }
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.85),
  );
}

export async function uploadFamilyPhoto(familyId: number, file: File) {
  const blob = await resizeImage(file);
  const res = await fetch(`/api/v1/families/${familyId}/photo`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "image/jpeg" },
    body: blob,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? "Upload failed.");
  return data;
}
