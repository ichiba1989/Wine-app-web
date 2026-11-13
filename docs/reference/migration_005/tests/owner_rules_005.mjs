// The Reference tab's pure rules for migration 005 (owner.js): which decisions a grape-rule candidate allows (the buttons; the database
// checks them again). No browser, no database (owner.js and its imports are copied without their ?v= suffixes to a temporary folder).
// Usage: node docs/reference/migration_005/tests/owner_rules_005.mjs
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const repo = new URL("../../../../", import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), "owner5-"));
for (const f of readdirSync(repo).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), readFileSync(join(repo, f), "utf8").replace(/\?v=\d+/g, ""));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const { ruleDecisions, RULE_STATES } = await import(join(dir, "owner.js"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS  rules: " + m); } else { fail++; console.log("FAIL  rules: " + m); } };
const code = { checked: true, source: "https://x" }, row = { role: "primary" };
ok(ruleDecisions({ state: "agree", decision: "pending", code_line: code, code_rule: "primary", table_row: row, table_source: "s", table_rule: "primary" }).join() === "accept_code,accept_table,reject", "agree: either side, or reject");
ok(ruleDecisions({ state: "conflict", decision: "pending", code_line: code, code_rule: "sole", table_row: row, table_source: "s", table_rule: "permitted" }).join() === "accept_code,accept_table,reject", "conflict: the owner must pick a side (or reject); no bulk accept");
ok(ruleDecisions({ state: "code_only", decision: "pending", code_line: code, code_rule: "primary" }).join() === "accept_code,reject", "code only: the code list's version or reject");
ok(ruleDecisions({ state: "needs_source", decision: "pending", code_line: { checked: false, source: "" }, code_rule: "primary" }).join() === "reject", "an unchecked code line cannot be accepted");
ok(ruleDecisions({ state: "unresolved", decision: "pending" }).length === 0 && ruleDecisions({ state: "not_importable", decision: "pending", code_line: code, code_rule: "usual" }).length === 0, "unresolved and not importable: no decision offered");
ok(ruleDecisions({ state: "agree", decision: "accept_code" }).join() === "pending", "a decided candidate can only go back to pending");
ok(ruleDecisions({ state: "agree", decision: "accept_code", claim_id: "x" }).length === 0, "an imported candidate offers nothing");
ok(RULE_STATES.length === 7, "the seven states have a filter each");
console.log(`\nOWNER RULES TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
