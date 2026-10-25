export function validateUpload(bytes: Uint8Array, declaredType: string) {
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024)
    throw new Error("upload_invalid");
  const hex = Array.from(bytes.subarray(0, 8))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const detected = hex.startsWith("255044462d")
    ? "application/pdf"
    : hex.startsWith("89504e470d0a1a0a")
      ? "image/png"
      : hex.startsWith("ffd8ff")
        ? "image/jpeg"
        : null;
  if (detected !== declaredType || !detected) throw new Error("upload_invalid");
  return detected;
}
