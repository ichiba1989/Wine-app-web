// The Reference tab's pure rules for migration 003 (owner.js): reading a pasted approved list (tabs or CSV), the tree depth, and the review
// steps for a whole domain. No browser, no database: owner.js and its imports are copied without their ?v= suffixes to a temporary folder.
// Usage: node docs/reference/migration_003/tests/owner_rules_003.mjs
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const repo = new URL("../../../../", import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), "owner3-"));
for (const f of readdirSync(repo).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), readFileSync(join(repo, f), "utf8").replace(/\?v=\d+/g, ""));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const { parseTaxonomyTable, nodeDepth, taxonomySteps, WR_TYPE_ADVICE } = await import(join(dir, "owner.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS  rules: " + m); } else { fail++; console.log("FAIL  rules: " + m); } };
const tsv = "domain\tcode\tparent\tsort\tname:en\tname:fr\tname:zh-hans\nD1\tD1\t\t1\tOne\tUn\t一\nD1\tD1.1.1\tD1.1\t1\tLeaf\t\t\nD1\tD1.1\t\t1\tSub\tSous\t\nD2\tD2.1\t\t\tOrphan\t\t";
const r = parseTaxonomyTable(tsv);
ok(r.domains.length === 2 && r.entries === 4, "a pasted table: two domains, four rows read");
ok(r.domains[0].nodes.map((n) => n.code).join(",") === "D1.1,D1.1.1", "parents are put before their children");
ok(r.domains[0].names.length === 3 && r.domains[0].names[2].language === "zh-Hans" && r.domains[0].names[2].script === "Hans", "one name per language column; zh-Hans gets the script Hans");
ok(r.domains[0].nodes[1].names.length === 1, "an empty cell is not a name (nothing invented)");
ok(r.errors.some((e) => /D2 has subdomains but no row/.test(e)), "a domain without its own row is reported, not made up");
ok(parseTaxonomyTable('domain,code,name:en\nD9,D9,"Wine, law and history"\n').domains[0].names[0].name === "Wine, law and history", "CSV with a quoted comma");
ok(parseTaxonomyTable("code\nX").errors.length === 1, "a header without a name column is refused");
ok(nodeDepth([{ code: "a" }, { code: "b", parent: "a" }, { code: "c", parent: "b" }], "c") === 2, "the depth used to indent the tree");
const dom = { entity_id: "d", status: "draft", names: [{ id: "n1", status: "draft" }], nodes: [{ entity_id: "x", status: "draft", names: [{ id: "n2", status: "draft" }] }] };
const st = taxonomySteps(dom, "submit");
ok(st.names.join() === "n1,n2" && st.entities.join() === "d,x", "review steps for a domain: its names first, then the domain and its subdomains");
ok(WR_TYPE_ADVICE.bottle_format_ml[0] === "decide" && WR_TYPE_ADVICE.edition_of[0] === "now", "bottle format is left to the owner; edition_of is recommended now");
console.log(`\nOWNER RULES TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
