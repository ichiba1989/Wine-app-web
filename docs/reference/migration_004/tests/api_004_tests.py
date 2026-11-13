#!/usr/bin/env python3
# STAGING ONLY. Migration 004 through the real local Supabase API (GoTrue sign-up, real tokens, PostgREST), on a database with the
# production hardening, 001 r5, 001a, 002 r1 and 003 r1 in place. Synthetic users (@staging.invalid), synthetic taxonomy codes ("TST..."), synthetic
# catalog rows (prereq files). Never targets a hosted project; never prints a key. Usage: CTR=... SB_ENV_FILE=... python3 -I api_004_tests.py
import json, os, subprocess, sys, urllib.error, urllib.request, uuid

ENV = {k: v.strip().strip('"') for k, v in (l.strip().split("=", 1) for l in open(os.environ["SB_ENV_FILE"]) if "=" in l)}
API = ENV["API_URL"].rstrip("/")
if not (API.startswith("http://127.0.0.1:") or API.startswith("http://localhost:")): sys.exit("REFUSING: not a local API URL")
ANON = ENV["ANON_KEY"]; CTR = os.environ["CTR"]
PASS = FAIL = 0
def check(cond, label, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"PASS  {label}", flush=True)
    else: FAIL += 1; print(f"FAIL  {label}  [{str(detail)[:400]}]", flush=True)
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
        with urllib.request.urlopen(req, timeout=60) as r: raw, st = r.read().decode(), r.status
    except urllib.error.HTTPError as e: raw, st = e.read().decode(), e.code
    try: js = json.loads(raw) if raw else None
    except ValueError: js = raw
    return st, js
msg = lambda js: (js or {}).get("message", "") if isinstance(js, dict) else str(js)
def tools(tok, action, data=None): return http("POST", "/rest/v1/rpc/ref_tools", tok, {"p_action": action, "p_data": data or {}})
def draft(tok, action, data=None): return http("POST", "/rest/v1/rpc/ref_draft", tok, {"p_action": action, "p_data": data or {}})
def review(tok, table, rid, decision, note=""): return http("POST", "/rest/v1/rpc/ref_review", tok, {"p_table": table, "p_id": rid, "p_decision": decision, "p_note": note})
RUN = uuid.uuid4().hex[:6]
def signup(name):
    st, js = http("POST", "/auth/v1/signup", body={"email": f"{name}-{RUN}@staging.invalid", "password": "Stg-" + uuid.uuid4().hex})
    assert st == 200, (st, js); return js["access_token"], js["user"]["id"]
OWNER_T, OWNER_U = signup("owner"); EDITOR_T, EDITOR_U = signup("editor"); PLAYER_T, PLAYER_U = signup("player")
sql(f"update public.profiles set staff_role = 'owner' where id = '{OWNER_U}'; update public.profiles set staff_role = 'editor' where id = '{EDITOR_U}';")
st, js = http("POST", "/auth/v1/signup", body={}); GUEST_T = js["access_token"]
CATALOG = "select md5(string_agg(t, '|' order by t)) from (select 'p'||p::text t from public.producers p union all select 'w'||w::text from public.wines w union all select 'v'||v::text from public.wine_vintages v union all select 'g'||g::text from public.grapes g union all select 'a'||a::text from public.geo_areas a) x"
CAT0 = sql(CATALOG)
ids = lambda q: [x for x in sql(q).split("\n") if x]
def work(tok, action, data=None): return http("POST", "/rest/v1/rpc/ref_work", tok, {"p_action": action, "p_data": data or {}})
AGR = "select md5(string_agg(to_jsonb(r)::text, '|' order by r.rule_ref)) || '/' || (select md5(string_agg(to_jsonb(w)::text, '|' order by w.wine_id, w.grape_id)) from public.wine_grapes w) from public.appellation_grape_rules r"
AGR0 = sql(AGR)

# ---------------------------------------------------------------- 1. who may use the new door (decision 5: Owner only)
for who, tok in [("a signed-out visitor", None), ("a guest", GUEST_T), ("a player", PLAYER_T), ("an Editor (no ref_* permission)", EDITOR_T)]:
    st, js = work(tok, "assignments"); check(st in (401, 403), f"ref_work refuses a read by {who} (HTTP {st})", (st, js))
    st, js = work(tok, "catalog_place_tree"); check(st in (401, 403), f"ref_work refuses a write by {who} (HTTP {st})", (st, js))
check(sql("select count(*) from wine_reference.claims") == "0", "nothing was written by the refused calls")
check(sql("select prosecdef and proconfig = (select proconfig from pg_proc where proname = 'ref_draft') and proacl::text not like '%anon%' and proacl::text like '%authenticated=X%' from pg_proc where proname = 'ref_work'") == "t",
      "ref_work is SECURITY DEFINER with an empty search_path, executable by signed-in users only (not anon)")
check(sql("select status from wine_reference.relationship_types where code = 'rules_name_grape'") == "proposed", "the appellation grape-rule type is added as proposed (unusable until switched on)")

# ---------------------------------------------------------------- 2. part_of drafts from the catalog's place tree
st, js = work(OWNER_T, "catalog_place_tree")
check(st == 200 and js["made"] == 0 and js["waiting_for_links"] == 3, "with no confirmed place links, every parent-child pair waits for its links (nothing made)", (st, js))
tools(OWNER_T, "seed_from_catalog", {"table": "geo_areas"}); tools(OWNER_T, "confirm_unambiguous", {"table": "geo_areas"})
st, js = work(OWNER_T, "catalog_place_tree")
check(st == 200 and js["type_proposed"] == 3 and js["made"] == 0, "places linked, but part_of is still proposed: nothing made, each pair says so", (st, js))
draft(OWNER_T, "set_type_status", {"table": "relationship", "code": "part_of", "status": "active"})
st, js = work(OWNER_T, "catalog_place_tree")
check(st == 200 and js["made"] == 3, "once part_of is switched on: three draft 'part of' facts (Valley in Standinland; Hill and Morgon in the Valley)", (st, js))
check(sql("select count(*) from wine_reference.claims c join wine_reference.claim_versions v on v.claim_id = c.id where c.relationship_type = 'part_of' and v.status = 'draft' and v.change_note like 'from the old catalog, not verified%'") == "3",
      "each is a draft marked 'from the old catalog, not verified'")
check(sql("""select string_agg(cn.name || '>' || pn.name, ',' order by cn.name) from wine_reference.claims c
  join wine_reference.entity_names cn on cn.entity_id = c.subject_entity_id join wine_reference.entity_names pn on pn.entity_id = c.object_entity_id where c.relationship_type = 'part_of'""")
      == "Morgon>Stand-in Valley,Stand-in Hill>Stand-in Valley,Stand-in Valley>Standinland", "the facts follow the catalog's own tree, child to parent")
st, js = work(OWNER_T, "catalog_place_tree")
check(st == 200 and js["made"] == 0 and js["already_there"] == 3, "running it again makes nothing twice", (st, js))

# ---------------------------------------------------------------- 3. made_from drafts from the label grapes
V2020 = sql("select v.id from public.wine_vintages v join public.wines w on w.id = v.wine_id where w.name = 'Stand-in draft wine' and not v.is_non_vintage")
st, js = work(OWNER_T, "catalog_grapes", {"wine_vintage_ids": [V2020]})
check(st == 200 and "no edition yet" in js["results"][0].get("error", ""), "a vintage without an edition is reported (build product + edition first)", (st, js))
tools(OWNER_T, "catalog_identity", {"wine_vintage_ids": [V2020]})
st, js = work(OWNER_T, "catalog_grapes", {"wine_vintage_ids": [V2020]})
res = js["results"][0] if st == 200 else {}
check(st == 200 and res["facts"] == [] and {s["why"] for s in res["skipped"]} == {"grape not linked (confirmed) yet", "not from the label (rule)"},
      "grapes not linked yet are skipped, and a grape from a rule is never used (only the label counts)", (st, js))
tools(OWNER_T, "seed_from_catalog", {"table": "grapes"}); tools(OWNER_T, "confirm_unambiguous", {"table": "grapes"})
st, js = work(OWNER_T, "catalog_grapes", {"wine_vintage_ids": [V2020]})
check(st == 200 and js["results"][0]["facts"] == [{"grape": "Stand-in Noir", "made_from": "type proposed"}], "grapes linked, but made_from is still proposed: nothing made", (st, js))
draft(OWNER_T, "set_type_status", {"table": "relationship", "code": "made_from", "status": "active"})
st, js = work(OWNER_T, "catalog_grapes", {})
r = next((x for x in js["results"] if x["wine_vintage_id"] == V2020), {}) if st == 200 else {}
check(st == 200 and r.get("facts") == [{"grape": "Stand-in Noir", "made_from": "made"}] and any(s["grape"] == "Stand-in Blanc" for s in r.get("skipped", [])),
      "made_from switched on: the 2020 edition is made from Stand-in Noir (the label grape); the rule grape is still skipped", (st, js))
check(sql("select count(*) from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id where c.relationship_type = 'made_from' and v.qualifiers = '{}'::jsonb and v.status = 'draft'") == "1",
      "the draft states no share (none is invented)")
st, js = work(OWNER_T, "catalog_grapes", {"wine_vintage_ids": [V2020]})
check(st == 200 and js["results"][0]["facts"] == [{"grape": "Stand-in Noir", "made_from": "already there"}], "running it again makes nothing twice", (st, js))

# ---------------------------------------------------------------- 4. subject-area assignments
st, js = draft(OWNER_T, "create_source", {"kind": "other", "title": "Approved taxonomy (synthetic)"}); SV = js["source_version_id"]
tools(OWNER_T, "import_taxonomy", {"source_version_id": SV, "dry_run": False, "domains": [{"code": "TSTA", "names": [{"name": "Test area", "language": "en"}],
      "nodes": [{"code": "TSTA.1", "names": [{"name": "Test places", "language": "en"}]}, {"code": "TSTA.2", "names": [{"name": "Test grapes", "language": "en"}]}]}]})
PLACE = sql("select l.entity_id from wine_reference.legacy_links l join public.geo_areas g on g.id::text = l.catalog_id where l.catalog_table = 'geo_areas' and l.status = 'confirmed' and g.name = 'Morgon'")
st, js = tools(OWNER_T, "assign_taxonomy", {"entity_id": PLACE, "node": "TSTA.1", "is_primary": True}); A1 = js.get("assignment_id")
st, js = tools(OWNER_T, "assign_taxonomy", {"entity_id": PLACE, "node": "TSTA.2"})
st, js = work(OWNER_T, "assignments", {"entity_id": PLACE})
check(st == 200 and [(a["node"], a["is_primary"], a["status"], a["entity_name"]) for a in js["assignments"]] == [("TSTA.1", True, "draft", "Morgon"), ("TSTA.2", False, "draft", "Morgon")],
      "assignments read: the place is in two subject areas, one primary, both drafts", (st, js))
st, js = tools(OWNER_T, "assign_taxonomy", {"entity_id": PLACE, "node": "TSTA.2", "is_primary": True})
check(st >= 400, "a thing cannot be assigned twice to one subject area (001's rule)", (st, js))
for dec in ("submit", "approve"): st, js = review(OWNER_T, "taxonomy_assignments", A1, dec)
check(st == 200 and sql(f"select status from wine_reference.taxonomy_assignments where id = '{A1}'") == "verified", "an assignment is submitted and approved through ref_review", (st, js))
st, js = review(OWNER_T, "taxonomy_assignments", A1, "retire")
st, js = work(OWNER_T, "assignments", {"node": "TSTA.1"})
check(st == 200 and js["assignments"] == [], "a retired assignment no longer shows (its history stays)", (st, js))

# ---------------------------------------------------------------- 5. the grape-rules check (read-only)
LINES = [{"country": "France", "appellation": "Morgon", "style": "red", "grape": "Gamay", "rule": "main", "checked": True, "source": "https://example.org/a"},
         {"country": "France", "appellation": "Chablis", "style": "white", "grape": "Chardonnay", "rule": "only", "checked": True, "source": "https://example.org/b"},
         {"country": "France", "appellation": "Stand-in Hill", "style": "red", "grape": "Stand-in Noir", "rule": "main", "checked": False, "source": ""}]
st, js = work(OWNER_T, "rule_grape_report", {"lines": LINES})
st_by = {l["appellation"]: l["state"] for l in js.get("lines", [])} if st == 200 else {}
check(st == 200 and js["table_found"] and js["table_rows"] == 2 and "role" in js["columns"], "the check reads appellation_grape_rules whatever its column names (columns listed)", (st, js))
check(st_by == {"Morgon": "in both", "Chablis": "appellation not in the catalog (exact name)", "Stand-in Hill": "not in appellation_grape_rules"},
      "each code line: in both / not in the table / its appellation not in the catalog", st_by)
check(st == 200 and next(l for l in js["lines"] if l["appellation"] == "Morgon")["table_rows"][0]["role"] == "primary", "a matched line shows the table's own row (its role and percentage as stored)", js.get("lines"))
check(st == 200 and len(js["extra_rows"]) == 1 and js["extra_rows"][0]["places"] == ["Stand-in Hill"] and js["extra_rows"][0]["grapes"] == ["Stand-in Blanc"],
      "the table's row that no code line matches is listed, with its place and grape named", js.get("extra_rows"))
check(sql(AGR) == AGR0, "the check changed nothing (appellation_grape_rules and wine_grapes exactly as before)")
st, js = work(OWNER_T, "rule_grape_report", {"lines": "x"})
check(st >= 400, "a malformed list is refused", (st, js))
st, js = work(PLAYER_T, "rule_grape_report", {"lines": LINES})
check(st in (401, 403), "a player cannot read the check", (st, js))

# ---------------------------------------------------------------- 6. what stays the same
check(sql(CATALOG) == CAT0, "the old catalog (producers, wines, wine_vintages, grapes, geo_areas) is exactly as before")
check(sql("select public.cfg_number('reference_enabled', 0) < 1") == "t", "reference_enabled is still off")
check(sql("select status from wine_reference.relationship_types where code = 'rules_name_grape'") == "proposed" and sql("select status from wine_reference.attribute_types where code = 'bottle_format_ml'") == "proposed",
      "rules_name_grape and bottle format stay proposed")
print(f"\nAPI 004 TOTAL: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
