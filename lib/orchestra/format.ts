// Display formatting for dates/timestamps across the orchestra UI.
// House format: MMM-DD-YYYY (e.g. Feb-08-2026); times as local h:mm AM/PM.
// Storage stays ISO everywhere — these are render-time helpers only.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Accepts "YYYY-MM-DD" or a full ISO timestamp. Date-only strings are parsed
// as calendar dates (no timezone shift).
export function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]}-${m[3]}-${m[1]}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDateTime(iso: string): string {
  const t = fmtTime(iso);
  return t ? `${fmtDate(iso)} · ${t}` : fmtDate(iso);
}
