// The Reference tab's pure rules for migration 004 (owner.js): the code list sent to the grape-rules check, its summary, and how a table
// row is shown. No browser, no database (owner.js and its imports are copied without their ?v= suffixes to a temporary folder).
// Usage: node docs/reference/migration_004/tests/owner_rules_004.mjs
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const repo = new URL("../../../../", import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), "owner4-"));
for (const f of readdirSync(repo).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), readFileSync(join(repo, f), "utf8").replace(/\?v=\d+/g, ""));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const { ruleLines, ruleSummary, rowText } = await import(join(dir, "owner.js"));
const { APPELLATION_GRAPES } = await import(join(dir, "aocgrapes.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS  rules: " + m); } else { fail++; console.log("FAIL  rules: " + m); } };
const L = ruleLines();
ok(L.length === APPELLATION_GRAPES.length && L.length > 50, `every line of aocgrapes.js is sent to the check (${L.length})`);
ok(L.every((l) => l.appellation && l.grape && ["only", "main", "usual"].includes(l.rule) && typeof l.checked === "boolean"), "each line carries its appellation, grape, rule and whether it was checked");
ok(L.filter((l) => l.checked && !l.source).length === 0, "no checked line goes without its source");
ok(L.some((l) => l.appellation === "Morgon" && l.grape === "Gamay" && l.rule === "main" && l.checked), "Morgon / Gamay / main (checked) is in the list");
const rep = { lines: [{ state: "in both" }, { state: "in both" }, { state: "not in appellation_grape_rules" }, { state: "grape not in the catalog (exact name)" }], extra_rows: [{}] };
const s = ruleSummary(rep);
ok(s.both === 2 && s.missing === 1 && s.notFound === 1 && s.extra === 1, "the summary counts in both, missing, not found and table-only rows");
ok(rowText({ id: "71000000-0000-0000-0000-000000000004", role: "primary", min_pct: 85, note: "", x: null }) === "role: primary · min_pct: 85", "a table row is shown by its own fields, without ids or empty values");
console.log(`\nOWNER RULES TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
