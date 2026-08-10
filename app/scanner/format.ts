export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, unit);
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function defaultDocumentName() {
  return `Scan ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function cleanPdfName(name: string) {
  return name.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || defaultDocumentName();
}
