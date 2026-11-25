#!/usr/bin/env python3
# STAGING ONLY. Migration 006 (public.ref_browse, read-only) through the real local Supabase API (GoTrue sign-up, real tokens, PostgREST), on
# a database with the production hardening, 001 r5, 001a, 002 r1, 003 r1, 004 r1, 005 r1 and 006 r1. Synthetic users (@staging.invalid),
# synthetic things ("Tst ..."), synthetic taxonomy codes ("TST..."), the stand-in catalog rows of the prereq files. Some claim types are
# switched on and the Editor role is given ref_edit and ref_review IN THIS DISPOSABLE DATABASE ONLY, so that the two-person rule can be
# exercised; production keeps every type proposed and only the Owner holds ref_* permissions.
# Never targets a hosted project; never prints a key. Usage: CTR=... SB_ENV_FILE=... python3 -I api_006_tests.py
import json, os, subprocess, sys, urllib.error, urllib.request, uuid

ENV = {k: v.strip().strip('"') for k, v in (l.strip().split("=", 1) for l in open(os.environ["SB_ENV_FILE"]) if "=" in l)}
API = ENV["API_URL"].rstrip("/")
if not (API.startswith("http://127.0.0.1:") or API.startswith("http://localhost:")): sys.exit("REFUSING: not a local API URL")
ANON = ENV["ANON_KEY"]; CTR = os.environ["CTR"]
PASS = FAIL = 0
def check(cond, label, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"PASS  {label}", flush=True)
    else: FAIL += 1; print(f"FAIL  {label}  [{str(detail)[:500]}]", flush=True)
def sql(q, strict=True):
    r = subprocess.run(["docker", "exec", "-i", CTR, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=q, capture_output=True, text=True)
    if strict and r.returncode: raise RuntimeError(r.stderr[:400])
    return r.stdout.strip() if r.returncode == 0 else "ERROR: " + r.stderr.strip()
def http(method, path, token=None, body=None, headers=None):
    h = {"apikey": ANON, "Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode(), method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r: raw, st = r.read().decode(), r.status
    except urllib.error.HTTPError as e: raw, st = e.read().decode(), e.code
    try: js = json.loads(raw) if raw else None
    except ValueError: js = raw
    return st, js
msg = lambda js: (js or {}).get("message", "") if isinstance(js, dict) else str(js)
def rpc(fn, tok, body): return http("POST", "/rest/v1/rpc/" + fn, tok, body)
def browse(tok, action, data=None): return rpc("ref_browse", tok, {"p_action": action, "p_data": data or {}})
def tools(tok, action, data=None): return rpc("ref_tools", tok, {"p_action": action, "p_data": data or {}})
def draft(tok, action, data=None): return rpc("ref_draft", tok, {"p_action": action, "p_data": data or {}})
def review(tok, table, rid, decision, note=""): return rpc("ref_review", tok, {"p_table": table, "p_id": rid, "p_decision": decision, "p_note": note})
def ok_draft(tok, action, data):
    st, js = draft(tok, action, data)
    if st != 200: raise RuntimeError(f"{action}: {st} {js}")
    return js
def ok_review(tok, table, rid, decision):
    st, js = review(tok, table, rid, decision)
    if st != 200: raise RuntimeError(f"{decision} {table}: {st} {js}")
RUN = uuid.uuid4().hex[:6]
def signup(name):
    st, js = http("POST", "/auth/v1/signup", body={"email": f"{name}-{RUN}@staging.invalid", "password": "Stg-" + uuid.uuid4().hex})
    assert st == 200, (st, js); return js["access_token"], js["user"]["id"]
OWNER_T, OWNER_U = signup("owner"); EDITOR_T, EDITOR_U = signup("editor"); PLAYER_T, PLAYER_U = signup("player")
sql(f"update public.profiles set staff_role = 'owner' where id = '{OWNER_U}'; update public.profiles set staff_role = 'editor' where id = '{EDITOR_U}';")
st, js = http("POST", "/auth/v1/signup", body={}); GUEST_T = js["access_token"]
CATALOG = "select md5(string_agg(t, '|' order by t)) from (select 'p'||p::text t from public.producers p union all select 'w'||w::text from public.wines w union all select 'v'||v::text from public.wine_vintages v union all select 'g'||g::text from public.grapes g union all select 'a'||a::text from public.geo_areas a) x"
CAT0 = sql(CATALOG)
WRITES = "select (select count(*) from wine_reference.change_log) || '/' || (select count(*) from wine_reference.review_events)"

# ---------------------------------------------------------------- 1. who may read, and the private schema stays closed
ACTIONS = [("evidence", {}), ("evidence_sources", {}), ("entities", {}), ("claims", {}), ("link_compare", {"table": "producers", "catalog_id": "x"})]
for who, tok in [("a signed-out visitor", None), ("a guest", GUEST_T), ("a player", PLAYER_T), ("an Editor without a reference permission", EDITOR_T)]:
    codes = [browse(tok, a, d)[0] for a, d in ACTIONS]
    check(all(c in (401, 403) for c in codes), f"ref_browse refuses every action for {who} (HTTP {sorted(set(codes))})", codes)
st, js = http("GET", "/rest/v1/entities?select=id", OWNER_T, headers={"Accept-Profile": "wine_reference"})
check(st in (400, 404, 406), f"the private schema is not reachable through the Data API, even for the Owner (HTTP {st})", (st, js))
st, js = rpc("fact_review_json", OWNER_T, {"p_version": str(uuid.uuid4())})
check(st in (400, 404), f"the internal helpers are not callable through the API (HTTP {st})", (st, js))
check(sql("select prosecdef and provolatile = 's' and proconfig = array['search_path=\"\"'] and proacl::text not like '%anon%' and proacl::text like '%authenticated=X%' from pg_proc where proname = 'ref_browse'") == "t",
      "ref_browse is SECURITY DEFINER, STABLE (read-only), with an empty search_path, executable by signed-in users only")
st, js = browse(OWNER_T, "nonsense"); check(st == 400 and "Unknown action" in msg(js), "an unknown action is refused", (st, js))
st, js = browse(OWNER_T, "entities", {"after": {"k": "not a time", "id": str(uuid.uuid4())}}); check(st >= 400, f"a malformed cursor is refused (HTTP {st})", (st, js))
st, js = browse(OWNER_T, "entities", {"q": "x" * 101}); check(st == 400 and "at most 100" in msg(js), "a search longer than 100 characters is refused", (st, js))

# ---------------------------------------------------------------- test-only set-up (disposable database)
sql("update public.staff_roles set permissions = permissions || array['ref_edit', 'ref_review'] where code = 'editor'")
for code in ("rules_name_grape", "part_of"):
    st, js = draft(OWNER_T, "set_type_status", {"table": "relationship", "code": code, "status": "active"}); assert st == 200, (st, js)
W0 = sql(WRITES)

# ---------------------------------------------------------------- 2. the evidence review: sources, versions, facts and what blocks each
def entity(tok, kind, name):
    e = ok_draft(tok, "create_entity", {"kind": kind, "name": name, "language": "en"})
    return e["entity_id"], e["name_id"]
def publish_entity(eid, nid):   # the Editor wrote it, the Owner reviews it (no override needed)
    for t, i in (("entity_names", nid), ("entities", eid)): ok_review(EDITOR_T, t, i, "submit"); ok_review(OWNER_T, t, i, "approve")
    ok_review(OWNER_T, "entities", eid, "publish")
PLACE, PLACE_N = entity(EDITOR_T, "place", f"Tst Appellation {RUN}")
PLACE2, PLACE2_N = entity(EDITOR_T, "place", f"Tst Other Appellation {RUN}")
GRAPE, GRAPE_N = entity(EDITOR_T, "grape_variety", f"Tst Grape {RUN}")
for e, n in ((PLACE, PLACE_N), (GRAPE, GRAPE_N)): publish_entity(e, n)
S1 = ok_draft(EDITOR_T, "create_source", {"kind": "regulation", "title": f"Tst official rules {RUN}", "url": "https://example.org/tst-rules"})
S2 = ok_draft(EDITOR_T, "create_source", {"kind": "regulation", "title": f"Tst licensed rules {RUN}", "licence_code": "CC-BY-4.0", "allows_quote": True})
EV = lambda sv, role="supports": [{"source_version_id": sv, "modality": "documentary", "role": role, "locator": "article 2"}]
C1 = ok_draft(EDITOR_T, "create_claim", {"subject_entity_id": PLACE, "relationship_type": "rules_name_grape", "object_entity_id": GRAPE, "qualifiers": {"rule": "sole"}, "evidence": EV(S1["source_version_id"])})
C2 = ok_draft(EDITOR_T, "create_claim", {"subject_entity_id": PLACE2, "relationship_type": "rules_name_grape", "object_entity_id": GRAPE, "evidence": EV(S2["source_version_id"])})
C3 = ok_draft(EDITOR_T, "create_claim", {"subject_entity_id": PLACE, "relationship_type": "rules_name_grape", "object_entity_id": PLACE2 if False else GRAPE, "qualifiers": {"style": "white"},
                                          "evidence": EV(S1["source_version_id"], "context")})

def facts(tok, **d):
    st, js = browse(tok, "evidence", d); assert st == 200, (st, js); return js
def fact(tok, claim):
    rows = [r for r in facts(tok, limit=100)["rows"] if r["claim_id"] == claim]; return rows[0] if rows else None
js = facts(OWNER_T)
check(js["total"] == 3 and len(js["rows"]) == 3 and js["next"] is None and js["predicate"] == "rules_name_grape", "evidence lists the three grape-rule facts on one page (total, no next page)", js)
f1 = fact(OWNER_T, C1["claim_id"])
check(f1["status"] == "draft" and f1["next"] == "submit" and f1["subject"]["name"] == f"Tst Appellation {RUN}" and f1["object"]["published"] is True and f1["qualifiers"] == {"rule": "sole"},
      "a fact shows its subject, object, qualifiers, status and next step (draft: submit)", f1)
e1 = f1["evidence"][0]
check(e1["locator"] == "article 2" and e1["modality"] == "documentary" and e1["role"] == "supports" and e1["source"]["id"] == S1["source_id"] and e1["version"]["id"] == S1["source_version_id"]
      and e1["source"]["status"] == "draft" and e1["version"]["status"] == "draft" and e1["counts"] is False,
      "each piece of evidence shows its source and source version, their status, locator and modality (and that it does not count yet)", e1)
# the authoritative problems are version_problems() verbatim, for every fact
same = all(json.loads(sql(f"select to_jsonb(wine_reference.version_problems('{r['version_id']}'))")) == r["problems"] for r in facts(OWNER_T)["rows"])
check(same, "every fact's problems are exactly wine_reference.version_problems() (no competing rule)")
check("no supporting evidence from a verified, current source version of a verified source" in f1["problems"] and f1["current"] is False, "a fact whose source is not approved names that as a problem", f1["problems"])
f3 = fact(OWNER_T, C3["claim_id"])
check(f3["evidence"][0]["role"] == "context" and "no supporting evidence from a verified, current source version of a verified source" in f3["problems"], "context-only evidence does not count, and the fact says so", f3)

# sources step: what blocks each source version, compared with ref_review's real answer
def srcs(tok, **d):
    st, js = browse(tok, "evidence_sources", d); assert st == 200, (st, js); return {r["version"]["id"]: r for r in js["rows"]}, js
S, js = srcs(OWNER_T)
check(js["total"] == 2 and set(S) == {S1["source_version_id"], S2["source_version_id"]}, "evidence_sources lists the two source versions the facts rely on", js)
check(S[S1["source_version_id"]]["facts"] == {"draft": 2} and S[S2["source_version_id"]]["facts"] == {"draft": 1}, "each source version says how many facts wait on it, by status", [S[k]["facts"] for k in S])
check(S[S1["source_version_id"]]["version"]["blockers"] == ["Approve the source before its versions"], "a version of an unapproved source is blocked: 'Approve the source before its versions'", S[S1["source_version_id"]])
check(S[S2["source_version_id"]]["version"]["blockers"] == ["Approve the source before its versions", "The rights statement of this source version is not verified"],
      "a version with an unverified licence names that too", S[S2["source_version_id"]]["version"])
sv1 = S1["source_version_id"]; ok_review(EDITOR_T, "source_versions", sv1, "submit")
st, js = review(OWNER_T, "source_versions", sv1, "approve")
check(st == 400 and "Approve the source before its versions" in msg(js), "MIRROR: ref_review refuses the version for the reason the screen showed", (st, js))
ok_review(EDITOR_T, "sources", S1["source_id"], "submit")
S, _ = srcs(EDITOR_T)
check(S[sv1]["source"]["approve_blocker"].startswith("The author cannot approve their own row"), "the Editor sees that they cannot approve the source they wrote (two-person rule)", S[sv1]["source"])
st, js = review(EDITOR_T, "sources", S1["source_id"], "approve")
check(st == 403 and "The author cannot approve their own row" in msg(js), "MIRROR: ref_review refuses the author's own approval with the same words", (st, js))
S, _ = srcs(OWNER_T)
check(S[sv1]["source"]["approve_blocker"] is None, "the Owner sees no author objection (the Owner exemption)", S[sv1]["source"])
ok_review(OWNER_T, "sources", S1["source_id"], "approve")
S, _ = srcs(OWNER_T)
check(S[sv1]["version"]["blockers"] == [] and S[sv1]["version"]["approve_blocker"] is None, "once the source is approved, its version shows nothing in the way", S[sv1]["version"])
st, js = review(OWNER_T, "source_versions", sv1, "approve"); check(st == 200, "MIRROR: and ref_review approves it", (st, js))
S, js = srcs(OWNER_T)
check(sv1 not in S and js["total"] == 1, "a fully approved source version leaves the 'waiting' list", js)
S, js = srcs(OWNER_T, stage="all"); check(sv1 in S and S[sv1]["version"]["status"] == "verified", "and stays in the 'all' list", js)
# rights: the S2 source approved, the version still blocked by its licence
ok_review(EDITOR_T, "sources", S2["source_id"], "submit"); ok_review(OWNER_T, "sources", S2["source_id"], "approve")
sv2 = S2["source_version_id"]; ok_review(EDITOR_T, "source_versions", sv2, "submit")
S, _ = srcs(OWNER_T)
check(S[sv2]["version"]["blockers"] == ["The rights statement of this source version is not verified"], "the licence is now the only blocker", S[sv2]["version"])
st, js = review(OWNER_T, "source_versions", sv2, "approve")
check(st == 400 and "The rights statement of this source version is not verified" in msg(js), "MIRROR: ref_review refuses it for that reason", (st, js))

# facts step: approve, then publish only what is eligible
for c in (C1, C3): ok_review(EDITOR_T, "claim_versions", c["claim_version_id"], "submit")
f1 = fact(EDITOR_T, C1["claim_id"])
check(f1["next"] == "approve" and f1["approve_blocker"].startswith("The author cannot approve"), "the Editor is told they cannot approve their own fact", f1)
f1 = fact(OWNER_T, C1["claim_id"])
check(f1["next"] == "approve" and f1["approve_blocker"] is None and f1["problems"] == [] and f1["evidence"][0]["counts"] is True,
      "the Owner may approve it, and it already has no publication problem (its source counts now)", f1)
for c in (C1, C3): ok_review(OWNER_T, "claim_versions", c["claim_version_id"], "approve")
js = facts(OWNER_T, stage="publishable")
check([r["claim_id"] for r in js["rows"]] == [C1["claim_id"]] and js["rows"][0]["next"] == "publish" and js["rows"][0]["publish_blockers"] == [], "stage 'publishable' lists exactly the eligible fact", js)
js = facts(OWNER_T, stage="blocked"); B = {r["claim_id"]: r for r in js["rows"]}
check(set(B) == {C2["claim_id"], C3["claim_id"]} and B[C3["claim_id"]]["next"] == "blocked", "stage 'blocked' lists the facts that cannot be published, with their reasons", js)
check("its subject is not a published entity" in B[C2["claim_id"]]["problems"], "an unpublished subject is named as a reason", B[C2["claim_id"]]["problems"])
st, js = review(OWNER_T, "claim_versions", C3["claim_version_id"], "publish")
check(st == 400 and "no supporting evidence" in msg(js), "MIRROR: ref_review refuses to publish the blocked fact for the reason shown", (st, js))
st, js = review(OWNER_T, "claim_versions", C1["claim_version_id"], "publish"); check(st == 200, "MIRROR: ref_review publishes the eligible fact", (st, js))
f1 = fact(OWNER_T, C1["claim_id"]); check(f1["next"] == "published" and f1["current"] is True, "the published fact is current", f1)
check(facts(OWNER_T, stage="published")["total"] == 1 and facts(OWNER_T, stage="approved")["total"] == 1, "stages 'published' and 'approved' count correctly")
# forward-only publication (owner decision 14)
C4 = ok_draft(EDITOR_T, "create_claim", {"subject_entity_id": PLACE, "relationship_type": "rules_name_grape", "object_entity_id": GRAPE, "qualifiers": {"style": "rose"}, "evidence": EV(sv1)})
V2 = ok_draft(EDITOR_T, "new_claim_version", {"claim_id": C4["claim_id"], "qualifiers": {"style": "rose", "rule": "sole"}, "evidence": EV(sv1)})["claim_version_id"]
for v in (C4["claim_version_id"], V2): ok_review(EDITOR_T, "claim_versions", v, "submit"); ok_review(OWNER_T, "claim_versions", v, "approve")
ok_review(OWNER_T, "claim_versions", V2, "publish")
blk = json.loads(sql(f"select wine_reference.fact_review_json('{C4['claim_version_id']}')"))   # the older version (the page shows the latest)
check(blk["newer_published"] == 2 and blk["next"] == "blocked" and any("Version 2 of this claim has been published" in b for b in blk["publish_blockers"]), "an older version is blocked once a newer one was published", blk)
st, js = review(OWNER_T, "claim_versions", C4["claim_version_id"], "publish")
check(st == 400 and "Version 2 of this claim has been published" in msg(js), "MIRROR: ref_review refuses it with the same words", (st, js))
check(fact(OWNER_T, C4["claim_id"])["version_no"] == 2, "the evidence list shows each fact's latest version")
st, js = browse(OWNER_T, "evidence", {"predicate": "part_of"}); check(st == 200 and js["total"] == 0, "another claim type can be reviewed the same way (none yet)", js)
st, js = browse(OWNER_T, "evidence", {"stage": "everything"}); check(st == 400, "an unknown stage is refused", (st, js))

# ---------------------------------------------------------------- 3. pages beyond 300: entities, sorted two ways; claims
sql(f"""insert into wine_reference.entities (kind, note) select 'place', 'tst page {RUN}' from generate_series(1, 340);
insert into wine_reference.entity_names (entity_id, name, language, name_kind, is_preferred)
  select e.id, 'Tst Page ' || lpad((row_number() over (order by e.id))::text, 3, '0') || ' {RUN}', 'en', 'common', true
    from wine_reference.entities e where e.note = 'tst page {RUN}';""")
SQL_NEWEST = sql("select string_agg(id::text, ',' order by created_at desc, id desc) from wine_reference.entities where status <> 'retired'").split(",")
def walk(tok, action, d, lim):
    out, after, pages, total = [], None, 0, None
    while True:
        st, js = browse(tok, action, dict(d, limit=lim, **({"after": after} if after else {})))
        if st != 200: return None, pages, (st, js)
        if total is None: total = js["total"]
        out += [r["id"] if "id" in r else r["claim_id"] for r in js["rows"]]; pages += 1; after = js["next"]
        if not after or pages > 100: return out, pages, total
ids, pages, total = walk(OWNER_T, "entities", {}, 100)
check(ids is not None and len(ids) == len(SQL_NEWEST) == total and len(ids) > 300, f"entities: {len(ids or [])} things over {pages} pages of 100 (more than the overview's 300)", total)
check(ids == SQL_NEWEST, "newest first: the same rows in the same order as the database (created_at, then id), no duplicates or omissions")
check(len(set(ids)) == len(ids), "no thing appears twice")
SQL_NAME = sql("select string_agg(id::text, ',' order by coalesce(lower(wine_reference.display_name(id)), ''), id) from wine_reference.entities where status <> 'retired'").split(",")
ids_n, pages, total = walk(OWNER_T, "entities", {"sort": "name"}, 37)
check(ids_n == SQL_NAME, f"by name: {len(ids_n or [])} things over {pages} pages of 37, in name order with no duplicates or omissions", (len(ids_n or []), len(SQL_NAME)))
ids_q, _, total = walk(OWNER_T, "entities", {"q": f"page 1"}, 25)
check(total == 100 and len(ids_q) == 100, "search by name finds 'Tst Page 1xx' (100 things) across pages", total)
st, js = browse(OWNER_T, "entities", {"q": "%"}); check(st == 200 and js["total"] == 0, "a '%' in the search is taken literally", js.get("total"))
st, js = browse(OWNER_T, "entities", {"q": PLACE}); check(st == 200 and [r["id"] for r in js["rows"]] == [PLACE], "a thing can be found by its id", js)
st, js = browse(OWNER_T, "entities", {"kind": "grape_variety"}); check(js["total"] == 1 and js["rows"][0]["name"] == f"Tst Grape {RUN}" and js["rows"][0]["claims"] == 4, "the kind filter, with each thing's fact count", js)
st, js = browse(OWNER_T, "entities", {"status": "published"}); check(js["total"] == 2, "the status filter: published", js.get("total"))
st, js = browse(OWNER_T, "entities", {"status": "draft"}); check(js["total"] == 341, "the status filter: draft", js.get("total"))
st, js = browse(OWNER_T, "entities", {"limit": 1000}); check(len(js["rows"]) == 100, "a page never holds more than 100 rows", len(js["rows"]))
# a row added between two pages does not shift the next page
st, p1 = browse(OWNER_T, "entities", {"limit": 50})
entity(EDITOR_T, "place", f"Tst Late {RUN}")
st, p2 = browse(OWNER_T, "entities", {"limit": 50, "after": p1["next"]})
check([r["id"] for r in p1["rows"] + p2["rows"]] == SQL_NEWEST[:100], "a thing added while paging does not repeat or skip rows on the next page")
# claims: 320 drafts between the page things
sql(f"""insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id)
  select a.id, 'part_of', b.id from (select id, row_number() over (order by id) n from wine_reference.entities where note = 'tst page {RUN}') a
  join (select id, row_number() over (order by id) n from wine_reference.entities where note = 'tst page {RUN}') b on b.n = a.n + 1 where a.n <= 320;
insert into wine_reference.claim_versions (claim_id, version_no, risk_tier) select c.id, 1, 2 from wine_reference.claims c where c.relationship_type = 'part_of';""")
SQL_CLAIMS = sql("select string_agg(id::text, ',' order by created_at desc, id desc) from wine_reference.claims").split(",")
cids, pages, total = walk(OWNER_T, "claims", {}, 100)
check(cids == SQL_CLAIMS and total == 324 == len(cids), f"claims: {len(cids or [])} facts over {pages} pages, newest first, no duplicates or omissions", total)
st, js = browse(OWNER_T, "claims", {"predicate": "rules_name_grape"}); check(js["total"] == 4, "claims filtered by claim type", js.get("total"))
st, js = browse(OWNER_T, "claims", {"status": "published"}); check(js["total"] == 2, "claims filtered by status (published)", js.get("total"))
st, js = browse(OWNER_T, "claims", {"q": f"Tst Grape {RUN}"}); check(js["total"] == 4, "claims found by the object's name", js.get("total"))
st, js = browse(OWNER_T, "claims", {"entity_id": PLACE2}); check(js["total"] == 1 and js["rows"][0]["latest"]["problems"], "claims about one thing, with the problems of an unpublished version", js)
st, js = browse(OWNER_T, "claims", {"kind": "grape_variety"}); check(js["total"] == 0, "claims filtered by the subject's kind", js.get("total"))
fids, pages, total = walk(OWNER_T, "evidence", {}, 1)
check(len(fids) == 4 == total and len(set(fids)) == 4, f"the evidence list pages one fact at a time without repeats ({pages} pages)", fids)

# ---------------------------------------------------------------- 4. subject areas: who can be assigned, many at once, partial failure
st, js = tools(OWNER_T, "create_domain", {"code": "TST1", "sort_order": 1, "names": [{"name": "Test domain", "language": "en"}]}); assert st == 200, js
st, js = tools(OWNER_T, "create_node", {"domain": "TST1", "code": "TST1.01", "names": [{"name": "Test area", "language": "en"}]}); assert st == 200, js
pick = [x for x in SQL_NAME if x not in (PLACE, PLACE2, GRAPE)][:3]
st, js = tools(OWNER_T, "assign_taxonomy", {"entity_id": pick[0], "node": "TST1.01"}); assert st == 200, js
st, js = browse(OWNER_T, "entities", {"assign_area": "TST1.01", "kind": "taxonomy_node"})
check(js["rows"][0]["assign"] == "a subject area itself", "a subject area itself is never offered for assignment", js["rows"])
st, js = browse(OWNER_T, "entities", {"assign_area": "TST1.01", "q": "Tst Page", "sort": "name", "limit": 3})
A = {r["id"]: r["assign"] for r in js["rows"]}
check(A[pick[0]] == "already in this subject area" and A[pick[1]] == "" and A[pick[2]] == "", "each thing says whether it can be assigned to the chosen area", A)
st, js = browse(OWNER_T, "entities", {"assign_area": "NOPE"}); check(st >= 400 and "No subject area with code NOPE" in msg(js), f"an unknown subject area is refused (HTTP {st})", (st, js))
res = [tools(OWNER_T, "assign_taxonomy", {"entity_id": e, "node": "TST1.01"})[0] for e in pick]
check(res[0] != 200 and res[1] == 200 and res[2] == 200, f"assigning three, one already assigned: two done, one refused on its own (HTTP {res})", res)
st, js = browse(OWNER_T, "entities", {"area": "TST1.01"}); check(js["total"] == 3 and all(r["areas"][0]["code"] == "TST1.01" for r in js["rows"]), "the subject-area filter finds the three", js.get("total"))
st, js = browse(OWNER_T, "entities", {"area": "none", "kind": "grape_variety"}); check(js["total"] == 1, "'none' finds things in no subject area", js.get("total"))

# ---------------------------------------------------------------- 5. several candidate links, side by side; an explicit choice
P_ROW = sql("select id from public.producers where name = 'Domaine Exemple'")
PR1, _ = entity(EDITOR_T, "producer", "Domaine Exemple"); PR2, n2 = entity(EDITOR_T, "producer", "Exemple (Domaine)")
ok_draft(EDITOR_T, "add_name", {"entity_id": PR2, "name": "Weingut Beispiel", "language": "de"})
L1 = ok_draft(EDITOR_T, "link_catalog", {"catalog_table": "producers", "catalog_id": P_ROW, "entity_id": PR1})
L2 = ok_draft(EDITOR_T, "link_catalog", {"catalog_table": "producers", "catalog_id": P_ROW, "entity_id": PR2})
P_OTHER = sql("select id from public.producers where name = 'DOMAINE  Exemple'")
ok_draft(EDITOR_T, "link_catalog", {"catalog_table": "producers", "catalog_id": P_OTHER, "entity_id": PR2})
st, js = browse(OWNER_T, "link_compare", {"table": "producers", "catalog_id": P_ROW})
check(st == 200 and js["catalog"]["name"] == "Domaine Exemple" and js["catalog"]["kind"] == "producer" and len(js["candidates"]) == 2, "link_compare shows the catalog row and both candidates", (st, js))
C = {c["entity"]["id"]: c for c in js["candidates"]}
check({n["language"] for n in C[PR2]["entity"]["names"]} == {"en", "de"} and C[PR2]["entity"]["other_links"][0]["name"] == "DOMAINE  Exemple",
      "each candidate shows its names in every language and the other catalog rows linked to it", C[PR2]["entity"])
check(all(c["link"]["status"] == "suggested" for c in js["candidates"]), "nothing is decided by comparing")
st, js = tools(OWNER_T, "decide_links", {"ids": [C[PR1]["link"]["id"]], "status": "confirmed"}); check(st == 200 and js["done"] == 1, "the owner's explicit choice confirms one", (st, js))
st, js = browse(OWNER_T, "link_compare", {"table": "producers", "catalog_id": P_ROW})
check(len(js["candidates"]) == 1 and js["candidates"][0]["link"]["status"] == "confirmed" and js["rejected"] == 1, "the other candidate is rejected by 003's rule, and the compare view shows it", js)
st, js = browse(OWNER_T, "link_compare", {"table": "wines", "catalog_id": str(uuid.uuid4())}); check(st >= 400 and "No wines row with id" in msg(js), f"an unknown catalog row is refused (HTTP {st})", (st, js))
st, js = browse(OWNER_T, "link_compare", {"table": "profiles", "catalog_id": "x"}); check(st == 400, "only the five catalog tables can be compared", (st, js))

# ---------------------------------------------------------------- 6. the reads wrote nothing; switch; catalog
W1 = sql(WRITES)
for a, d in [("evidence", {}), ("evidence_sources", {"stage": "all"}), ("entities", {"sort": "name"}), ("claims", {}), ("link_compare", {"table": "producers", "catalog_id": P_ROW})]: browse(OWNER_T, a, d)
check(sql(WRITES) == W1, "ref_browse writes nothing (change log and review events unchanged by its reads)")
r0 = browse(OWNER_T, "entities", {"limit": 5})[1]["rows"]
sql("insert into public.app_config (key, value) values ('reference_enabled', '1') on conflict (key) do update set value = excluded.value")
r1 = browse(OWNER_T, "entities", {"limit": 5})[1]["rows"]
st, pub = rpc("ref_published_names", None, {"p_query": "Tst Appellation"})
sql("update public.app_config set value = '0' where key = 'reference_enabled'")
st0, pub0 = rpc("ref_published_names", None, {"p_query": "Tst Appellation"})
check(r0 == r1, "the staff reads are the same with the reference switch on or off")
check(len(pub) == 1 and pub0 == [], "the public read still follows the switch (a published name shows only while it is on)", (pub, pub0))
check(sql(CATALOG) == CAT0, "the old catalog is unchanged")
sql("update public.staff_roles set permissions = array(select p from unnest(permissions) p where p not in ('ref_edit', 'ref_review')) where code = 'editor'")
st, js = browse(EDITOR_T, "entities"); check(st == 403, "with its test permissions taken back, the Editor is refused again", (st, js))
print(f"\nAPI 006 TOTAL: {PASS} passed, {FAIL} failed")
