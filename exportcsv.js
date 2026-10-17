// Export of the player's own journal as a spreadsheet file (CSV). Pure: no page, no network (app.js turns the text into a download).
// Only what the player has in their journal goes into it: their wines, verdicts, prices and notes, in their own words.
import { entryName, verdictShort, entryIncomplete } from "./logic.js?v=23";

export const EXPORT_COLUMNS = [
  { id: "date", label: "Date", get: (e) => e.consumed_on || "" },
  { id: "wine", label: "Wine", get: (e) => (entryName(e) === "Untitled wine" ? "" : entryName(e)) },
  { id: "producer", label: "Producer", get: (e) => e.producer || "" },
  { id: "wine_name", label: "Wine or cuvee", get: (e) => e.wine_name || "" },
  { id: "vintage", label: "Vintage", get: (e) => (e.is_non_vintage ? "NV" : e.vintage_year || "") },
  { id: "type", label: "Type", get: (e) => e.style || "" },
  { id: "country", label: "Country", get: (e) => e.country || "" },
  { id: "region", label: "Region", get: (e) => e.region || "" },
  { id: "verdict", label: "Verdict", get: (e) => verdictShort(e.verdict) || "" },
  { id: "price", label: "Price paid", get: (e) => (e.purchase_price_cents == null ? "" : (e.purchase_price_cents / 100).toFixed(2)) },
  { id: "food", label: "Food", get: (e) => e.food || "" },
  { id: "occasion", label: "Occasion", get: (e) => e.occasion || "" },
  { id: "notes", label: "Notes", get: (e) => e.notes || "" },
  { id: "incomplete", label: "Incomplete", get: (e) => (entryIncomplete(e) ? "yes" : "") },
];
// One cell: quoted when it holds a comma, quote or line break; a cell that starts like a formula gets a leading apostrophe so a spreadsheet shows it as text.
export function csvCell(v) {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
// The whole file, oldest entry first, with a header row. Lines end with CRLF as spreadsheets expect.
export function journalCsv(entries) {
  const rows = [...(entries || [])].sort((a, b) => String(a.consumed_on || "").localeCompare(String(b.consumed_on || "")));
  const lines = [EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(",")];
  rows.forEach((e) => lines.push(EXPORT_COLUMNS.map((c) => csvCell(c.get(e))).join(",")));
  return lines.join("\r\n") + "\r\n";
}
export const exportName = (d = new Date()) => `my-wine-notes-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.csv`;
