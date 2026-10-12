/** 83 -> "1:23". Unknown or invalid durations render as "–:––". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–:––';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "2026-10-12" -> "12 OCT 2026". Falls back to the raw string. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (!iso || Number.isNaN(date.getTime())) return iso;
  return date
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}
