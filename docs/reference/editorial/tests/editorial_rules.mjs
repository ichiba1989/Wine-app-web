// The Reference tab's editorial work queue (owner.js): the To do list built from the tab's reads, and which grape-rule candidates may be
// ticked for a bulk decision (never a conflict). No browser, no database (owner.js and its imports are copied without their ?v= suffixes to a temporary folder).
// Usage: node docs/reference/editorial/tests/editorial_rules.mjs
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const repo = new URL("../../../../", import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), "editorial-"));
for (const f of readdirSync(repo).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), readFileSync(join(repo, f), "utf8").replace(/\?v=\d+/g, ""));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const { workQueue, ruleTickable } = await import(join(dir, "owner.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS  rules: " + m); } else { fail++; console.log("FAIL  rules: " + m); } };
const overview = {
  entities: [
    { id: "e1", kind: "place", status: "draft", names: [{ id: "n1", status: "draft" }] },
    { id: "e2", kind: "place", status: "pending_review", names: [{ id: "n2", status: "pending_review" }] },
    { id: "e3", kind: "producer", status: "verified", published_at: null, names: [{ id: "n3", status: "verified" }] },
    { id: "t1", kind: "taxonomy_node", status: "draft", names: [{ id: "n4", status: "draft" }] }],
  sources: [{ id: "s1", status: "draft", versions: [{ status: "draft" }] }],
  claims: [{ relationship_type: "rules_name_grape", versions: [{ id: "v1", status: "draft" }] }, { relationship_type: "part_of", versions: [{ id: "v2", status: "verified", published_at: null }] },
           { attribute_type: "harvest_year", versions: [{ id: "v3", status: "verified", published_at: null, problems: ["no evidence"] }] }],
  relationship_types: [{ code: "edition_of", status: "proposed" }, { code: "release_of", status: "proposed" }], attribute_types: [{ code: "bottle_format_ml", status: "proposed" }] };
const Q = workQueue({ overview, coverage: { tables: [{ catalog_table: "grapes", waiting: 2, several: 1 }, { catalog_table: "producers", waiting: 0 }] },
  taxonomy: { domains: [{ status: "draft", nodes: [{ status: "pending_review" }] }] }, batches: [{ counts: { agree: 3, conflict: 2, unresolved: 4, not_importable: 1 }, decided: 1 }] });
const find = (t) => Q.items.find((i) => i.text.startsWith(t));
ok(find("names written").n === 1 && find("names written").bulk.ids.join() === "n1" && find("names written").bulk.decision === "submit", "draft names: one, with a Submit step for exactly that name (subject-area names left out)");
ok(find("things still drafts").bulk.ids.join() === "e1" && find("things waiting").bulk.decision === "approve", "draft and waiting things, each with its own step");
ok(find("approved things not yet published").n === 1 && !find("approved things not yet published").bulk, "publishing is never offered in bulk");
ok(find("imported grape-rule facts").bulk.ids.join() === "v1" && find("approved facts ready to publish").n === 1 && find("approved facts that cannot be published").n === 1, "grape-rule drafts apart; facts that cannot be published are told apart from those that can");
ok(find("grapes waiting").n === 2 && /1 with several/.test(find("grapes waiting").text) && !Q.items.some((i) => /producers waiting/.test(i.text)), "catalog links per table, only where something waits");
ok(find("subject areas still drafts").n === 1 && find("subject areas waiting").n === 1, "subject areas counted from the taxonomy read");
ok(find("candidates in the latest batch").n === 4 && /2 conflicts/.test(find("candidates in the latest batch").text), "grape-rule candidates still to decide (not counting unresolved and not importable), conflicts named");
ok(find("types recommended").n === 1 && /edition_of/.test(find("types recommended").text) && !/bottle_format/.test(find("types recommended").text), "only the types recommended now; bottle format is left out");
const M = workQueue({ overview, missing: ["migration 003", "migration 005"] });
ok(M.missing.length === 2 && !M.items.some((i) => i.area === "Catalog links" || /candidates/.test(i.text)), "parts not deployed are named as missing, never guessed");
ok(workQueue({}).items.length === 0, "an empty reference has nothing to do");
const pubE = find("approved things not yet published").publish, pubF = find("approved facts ready to publish").publish;
ok(pubE.table === "entities" && pubE.rows.length === 1 && pubE.rows[0].id === "e3" && pubF.table === "claim_versions" && pubF.rows.map((r) => r.id).join() === "v2",
  "publish lists: the approved thing and the publishable fact (never the blocked one), each published one by one");
ok(!find("approved facts that cannot be published").publish && !find("approved facts ready to publish").bulk, "no bulk step on publishing, and nothing to publish for blocked facts");
const cand = { state: "agree", decision: "pending", code_line: { checked: true, source: "x" }, code_rule: "primary", table_row: { a: 1 }, table_source: "s", table_rule: "primary" };
ok(ruleTickable(cand) && !ruleTickable({ ...cand, state: "conflict" }) && !ruleTickable({ ...cand, decision: "accept_code" }) && !ruleTickable({ ...cand, state: "unresolved" }), "grape-rule ticks: agree yes; a conflict, a decided or an unresolved candidate no");
console.log(`\nEDITORIAL RULES TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
