// The Reference tab's pure rules for migration 006 (owner.js): which steps the evidence review offers (only those ref_review would
// accept, read from the database's own answer), how pages are joined, what the side-by-side comparison points out, and which ticked
// things can be put in a subject area. No browser, no database (owner.js and its imports are copied without their ?v= suffixes to a
// temporary folder). Usage: node docs/reference/migration_006/tests/owner_rules_006.mjs
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const repo = new URL("../../../../", import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), "owner6-"));
for (const f of readdirSync(repo).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), readFileSync(join(repo, f), "utf8").replace(/\?v=\d+/g, ""));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
const O = await import(join(dir, "owner.js"));
const { pageMerge, factActions, sourceActions, compareCandidates, assignable, EV_STAGES, WR_VIEWS, referenceTable } = O;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS  rules: " + m); } else { fail++; console.log("FAIL  rules: " + m); } };
const ALL = { edit: true, review: true, publish: true, owner: true };

// pages
let P = pageMerge(undefined, { rows: [1, 2], next: { k: "t", id: "b" }, total: 5 }, false);
P = pageMerge(P, { rows: [3, 4], next: { k: "t", id: "d" }, total: null }, true);
ok(P.rows.join() === "1,2,3,4" && P.total === 5 && P.next.id === "d" && P.status === "ok", "a next page is added to the list; the first page's total is kept");
P = pageMerge(P, { rows: [5], next: null }, true); ok(P.rows.length === 5 && P.next === null, "the last page ends the list (no cursor)");
ok(pageMerge(P, { rows: [9], next: null, total: 1 }, false).rows.join() === "9", "a new search starts the list again");

// the evidence review offers only what ref_review would accept
ok(factActions({ next: "submit" }, ALL).join() === "submit" && factActions({ next: "submit" }, { review: true }).length === 0, "a draft fact: Submit, only with ref_edit");
ok(factActions({ next: "approve", approve_blocker: null }, ALL).join() === "approve,reject", "a waiting fact: Approve or Send back");
ok(factActions({ next: "approve", approve_blocker: "The author cannot approve their own row" }, ALL).join() === "reject", "the author (not the Owner) is never offered Approve");
ok(factActions({ next: "publish", publish_blockers: [] }, ALL).join() === "publish" && factActions({ next: "publish", publish_blockers: [] }, { review: true }).length === 0, "an eligible fact: Publish, only with ref_publish");
ok(factActions({ next: "blocked", publish_blockers: ["no supporting evidence"] }, ALL).length === 0, "a blocked fact offers no step at all");
ok(factActions({ next: "publish", publish_blockers: ["x"] }, ALL).length === 0, "a fact with any blocker is never offered Publish");
ok(factActions({ next: "published" }, ALL).length === 0 && factActions({ next: "retired" }, ALL).length === 0, "published and retired facts offer nothing here");
const src = (s, v) => sourceActions({ source: s, version: v }, ALL);
ok(src({ status: "draft" }, { status: "draft", blockers: [] }).source.join() === "submit" && src({ status: "draft" }, { status: "draft", blockers: [] }).version.join() === "submit", "draft source and version: Submit");
ok(src({ status: "verified" }, { status: "pending_review", blockers: ["Approve the source before its versions"] }).version.join() === "reject", "a version blocked by its source is not offered Approve");
ok(src({ status: "verified" }, { status: "pending_review", blockers: ["The rights statement of this source version is not verified"] }).version.join() === "reject", "a version blocked by its licence is not offered Approve");
ok(src({ status: "pending_review", approve_blocker: "The author cannot approve their own row" }, { status: "draft", blockers: [] }).source.join() === "reject", "the author is not offered Approve on a source");
ok(src({ status: "verified" }, { status: "pending_review", blockers: [] }).version.join() === "approve,reject", "a clear version: Approve or Send back");
ok(EV_STAGES.map((s) => s[0]).join() === "blocked,draft,pending_review,publishable,published,all", "the fact groups follow the work, blocked first");
ok(WR_VIEWS.some((v) => v.id === "evidence") && WR_VIEWS.some((v) => v.id === "browse"), "the Reference tab has Evidence review and Browse all");

// side by side
const cat = { name: "Domaine Exemple" };
const cand = (name, extra = {}) => ({ link: { id: "l" + name, status: "suggested" }, entity: { id: "e" + name, status: "draft", published: false, names: [{ name, language: "en", status: "draft" }], other_links: [], ...extra } });
const N = compareCandidates(cat, [cand("Domaine Exemple"), cand("DOMAINE  exemple."), cand("Weingut Beispiel"),
  cand("Domaine Exemple", { other_links: [{ status: "confirmed", name: "Exemple Sarl", catalog_id: "x" }] }), cand("Domaine Exemple", { status: "retired" })]);
ok(N[0].match === "same" && N[1].match === "similar" && N[2].match === "different", "names: exactly the same, the same ignoring accents/capitals/punctuation, or different");
ok(N[0].notes.some(([k, t]) => k === "info" && /draft/.test(t)), "a draft candidate says so");
ok(N[3].notes.some(([k, t]) => k === "warn" && /Already confirmed for another catalog row: Exemple Sarl/.test(t)), "a candidate already confirmed elsewhere is flagged (a possible duplicate)");
ok(N[4].notes.some(([k]) => k === "bad"), "a retired candidate is flagged");
ok(N.every((n) => n.link_id && n.entity_id), "every comparison keeps its link, so only an explicit choice decides");

// many into one subject area
const rows = [{ id: "a", assign: "" }, { id: "b", assign: "already in this subject area" }, { id: "c", assign: "" }, { id: "d", assign: "retired or replaced" }];
ok(assignable(rows, ["a", "b", "c", "d"]).join() === "a,c", "only ticked things the database says can be added are assigned");
ok(assignable(rows, []).length === 0, "nothing ticked, nothing assigned");

// the screens: loading, empty, error, more, end; and before migration 006
const R = { counts: { entities: 0, claims: 0, sources: 0, links: 0 }, switch: 0, entities: [], entity_kinds: [], relationship_types: [], attribute_types: [] };
const html = (Ov, d) => referenceTable(Ov, { wref: R, ...d });
ok(/needs migration 006/.test(html({ wrView: "evidence" }, { wr6Missing: true, wr6Error: "This part needs migration 006 (docs/reference/migration_006/DEPLOY_006.md)." })), "Evidence review before 006: says it needs migration 006");
ok(/needs migration 006/.test(html({ wrView: "browse" }, { wr6Missing: true, wr6Error: "This part needs migration 006 (x)." })), "Browse all before 006: says it needs migration 006");
ok(/Loading…/.test(html({ wrView: "browse" }, { wrBrowse: { status: "loading", rows: [] } })), "a list that is loading says so");
ok(/Nothing matches/.test(html({ wrView: "browse" }, { wrBrowse: { status: "ok", rows: [], next: null, total: 0 } })), "an empty list says so");
ok(/role="alert"[^>]*>Could not load: boom/.test(html({ wrView: "browse" }, { wrBrowse: { status: "error", rows: [], error: "Could not load: boom" } })) , "an error is shown with Try again");
const er = { id: "e1", kind: "place", status: "draft", published: false, name: "<b>X</b>", names: [], name_count: 1, areas: [], links: 0, claims: 0 };
const more = html({ wrView: "browse" }, { wrBrowse: { status: "ok", rows: [er], next: { k: "t", id: "e1" }, total: 400 } });
ok(/1 of 400 shown/.test(more) && /owner:wrbpage:more/.test(more) && !/<b>X<\/b>/.test(more), "more to come: 'Show more', and names are escaped");
ok(/End of the list: 1 of 1/.test(html({ wrView: "browse" }, { wrBrowse: { status: "ok", rows: [er], next: null, total: 1 } })), "the end of the list says so");
const asg = html({ wrView: "browse", wrAsg: { area: "TST1.01", ticks: ["e1"] } }, { wrBrowse: { status: "ok", rows: [{ ...er, assign: "" }, { ...er, id: "e2", assign: "already in this subject area" }], next: null, total: 2 } });
ok(/owner:wrbtick:e1/.test(asg) && !/owner:wrbtick:e2/.test(asg) && /already in this subject area/.test(asg) && /Assign 1 ticked/.test(asg), "assigning: tick boxes only where it can be added; the others say why");
const conf = html({ wrView: "browse", wrAsg: { area: "TST1.01", ticks: ["e1"], confirm: true } }, { wrBrowse: { status: "ok", rows: [{ ...er, assign: "" }], next: null, total: 1 } });
ok(/Confirm: assign 1/.test(conf), "assigning asks for a confirmation first");
const run = html({ wrView: "browse", wrAsg: { area: "TST1.01", ticks: [], run: { running: false, done: 2, of: 3, ok: 1, stopped: true, results: [{ name: "A", ok: true }, { name: "B", ok: false, msg: "duplicate" }] } } }, { wrBrowse: { status: "ok", rows: [], next: null, total: 0 } });
ok(/Stopped: 1 put in TST1.01, 1 refused, 1 not tried/.test(run) && /B: duplicate/.test(run), "after a run: how many were done, refused and not tried, and each refusal");
const fact = { claim_id: "c", version_id: "v", version_no: 1, status: "verified", published_at: null, next: "blocked", predicate: "rules_name_grape", subject: { name: "P", status: "draft" }, object: { name: "G", published: true }, qualifiers: {}, evidence: [], publish_blockers: ["its subject is not a published entity"], approve_blocker: null };
const ev = html({ wrView: "evidence" }, { wrEv: { perms: ALL, sources: { status: "ok", rows: [], next: null, total: 0 }, facts: { status: "ok", rows: [fact], next: null, total: 1 } } });
ok(/Cannot be published:/.test(ev) && /its subject is not a published entity/.test(ev) && !/wrpub:v/.test(ev) && !/wrevrev:claim_versions:v/.test(ev), "a blocked fact shows its reasons and no step");
const ev2 = html({ wrView: "evidence" }, { wrEv: { perms: ALL, sources: { status: "ok", rows: [], next: null, total: 0 }, facts: { status: "ok", rows: [{ ...fact, next: "publish", publish_blockers: [] }], next: null, total: 1 } } });
ok(/owner:wrpub:v/.test(ev2) && !/wrpubok/.test(ev2), "an eligible fact: Publish first asks for a confirmation");
ok(/wrpubok:claim_versions:v/.test(html({ wrView: "evidence", wrPubConfirm: "v" }, { wrEv: { perms: ALL, sources: { status: "ok", rows: [] }, facts: { status: "ok", rows: [{ ...fact, next: "publish", publish_blockers: [] }], next: null, total: 1 } } })), "then 'Confirm: publish' (the existing one-by-one confirmation)");

console.log(`\nRULES 006 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
