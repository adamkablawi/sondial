/**
 * Convert a File or Blob to a base64 data URL string.
 */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extract the raw base64 content from a data URL (strips the prefix).
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

/**
 * Get the MIME type from a data URL.
 */
export function getMimeType(dataUrl: string): string {
  const match = dataUrl.match(/data:([^;]+);/);
  return match?.[1] ?? "application/octet-stream";
}
