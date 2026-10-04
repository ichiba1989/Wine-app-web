// Loads the flavor tables from the database (flavor_varietals and flavor_regions, database update 27) over the built-in ones, so the Owner or an editor
// can tune a grape's flavors or a place's nudges without a new version of the app. If the tables are missing or the call fails, the built-in set is used.
import { setTables } from "./flavors.js?v=1";

export async function loadVisualTables(sb) {
  const [v, r] = await Promise.all([
    sb.from("flavor_varietals").select("key, label, type, shape, weights"),
    sb.from("flavor_regions").select("key, country, name, kind, lat, lon, nudges"),
  ]);
  if (v.error) throw v.error;
  if (r.error) throw r.error;
  return { varietals: v.data || [], regions: r.data || [] };
}
// true when the database's rows were applied.
export async function applyVisualTables(sb) {
  try { setTables(await loadVisualTables(sb)); return true; } catch (_) { return false; }
}
