#!/usr/bin/env python3
# STAGING ONLY. Migration 005 through the real local Supabase API (GoTrue sign-up, real tokens, PostgREST), on a database with the
# production hardening, 001 r5, 001a, 002 r1, 003 r1 and 004 r1 in place. Synthetic users (@staging.invalid), synthetic taxonomy codes ("TST..."), synthetic
# catalog rows (prereq files). Never targets a hosted project; never prints a key. Usage: CTR=... SB_ENV_FILE=... python3 -I api_005_tests.py
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
def rules(tok, action, data=None): return http("POST", "/rest/v1/rpc/ref_rules", tok, {"p_action": action, "p_data": data or {}})
sql(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "prereq_catalog_005.sql")).read())   # the table-only stand-in row (this test's own)
AGR = "select md5(string_agg(to_jsonb(r)::text, '|' order by r.rule_ref)) from public.appellation_grape_rules r"
AGR0 = sql(AGR)
URL_A = "https://example.org/official-rules-a"
LINES = [
  {"appellation": "Morgon", "grape": "Gamay", "style": "red", "rule": "main", "checked": True, "source": URL_A, "read": "2026-10-17"},            # agree
  {"appellation": "Chablis", "grape": "Chardonnay", "style": "white", "rule": "only", "checked": True, "source": "https://example.org/b", "read": "2026-10-17"},  # unresolved
  {"appellation": "Stand-in Hill", "grape": "Stand-in Noir", "style": "red", "rule": "main", "checked": True, "source": URL_A, "read": "2026-10-17"},  # code only
  {"appellation": "Stand-in Hill", "grape": "Stand-in Blanc", "style": "white", "rule": "only", "checked": True, "source": "https://example.org/c", "read": "2026-10-17"},  # conflict
  {"appellation": "Morgon", "grape": "Stand-in Noir", "style": "red", "rule": "usual", "checked": True, "source": "https://example.org/d", "read": "2026-10-17"},  # not importable
  {"appellation": "Stand-in Hill", "grape": "Gamay", "style": "red", "rule": "main", "checked": False, "source": "", "read": "2026-10-17"}]  # needs source

# ---------------------------------------------------------------- 1. who may use the new door
for who, tok in [("a signed-out visitor", None), ("a guest", GUEST_T), ("a player", PLAYER_T), ("an Editor (no ref_* permission)", EDITOR_T)]:
    st, js = rules(tok, "batches"); check(st in (401, 403), f"ref_rules refuses a read by {who} (HTTP {st})", (st, js))
    st, js = rules(tok, "stage", {"lines": LINES}); check(st in (401, 403), f"ref_rules refuses staging by {who} (HTTP {st})", (st, js))
check(sql("select count(*) from wine_reference.rule_import_batches") == "0", "nothing was written by the refused calls")
check(sql("select prosecdef and proconfig = (select proconfig from pg_proc where proname = 'ref_draft') and proacl::text not like '%anon%' and proacl::text like '%authenticated=X%' from pg_proc where proname = 'ref_rules'") == "t",
      "ref_rules is SECURITY DEFINER with an empty search_path, executable by signed-in users only (not anon)")

# ---------------------------------------------------------------- 2. stage: every pair classified, with both sides kept
st, js = rules(OWNER_T, "stage", {"lines": LINES, "note": "test batch"})
B = js.get("batch_id") if st == 200 else None
check(st == 200 and js["counts"] == {"agree": 1, "unresolved": 1, "code_only": 1, "conflict": 1, "not_importable": 1, "needs_source": 1, "table_only": 1},
      "stage: agree, conflict, code only, table only, unresolved, needs source and not importable are told apart", (st, js))
st, js = rules(OWNER_T, "candidates", {"batch_id": B}); C = {(c["appellation"], c["grape"]): c for c in js["candidates"]} if st == 200 else {}
agree, conflict, code_only, table_only = C[("Morgon", "Gamay")], C[("Stand-in Hill", "Stand-in Blanc")], C[("Stand-in Hill", "Stand-in Noir")], C[("Stand-in Valley", "Stand-in Noir")]
check(agree["code_rule"] == "primary" and agree["table_rule"] == "primary" and agree["table_min_pct"] == 85 and agree["table_row"]["role"] == "primary",
      "a candidate keeps the code line and the table row exactly as stored, with the rule and percentage read from the row", agree)
check(conflict["state"] == "conflict" and "the code list says sole, the table says permitted" in conflict["reason"], "the conflict says what each side says", conflict)
check(table_only["table_source"] == "https://example.org/standin-valley-rules" and table_only["table_rule"] == "sole", "a table-only rule keeps its source and rule", table_only)
check(C[("Morgon", "Stand-in Noir")]["state"] == "not_importable" and "practice" in C[("Morgon", "Stand-in Noir")]["reason"], "a 'usual' line is not importable (practice, not a rule)")
check(sql(AGR) == AGR0, "staging changed nothing in appellation_grape_rules")
st, js = rules(OWNER_T, "batches")
check(st == 200 and js["batches"][0]["id"] == B and js["batches"][0]["table_rows"] == 3 and "role" in js["batches"][0]["table_columns"], "the batch records the table's rows and columns", (st, js))

# ---------------------------------------------------------------- 3. decide: what may be accepted
def decide(ids, dec, note=""): return rules(OWNER_T, "decide", {"ids": ids, "decision": dec, "note": note})
st, js = decide([C[("Chablis", "Chardonnay")]["id"]], "accept_code")
check(st == 200 and js["done"] == 0 and "cannot be accepted" in js["failed"][0], "an unresolved candidate cannot be accepted", (st, js))
st, js = decide([C[("Morgon", "Stand-in Noir")]["id"]], "accept_code")
check(st == 200 and js["done"] == 0, "a not-importable ('usual') candidate cannot be accepted", (st, js))
st, js = decide([C[("Stand-in Hill", "Gamay")]["id"]], "accept_code")
check(st == 200 and js["done"] == 0 and "checked official source" in js["failed"][0], "a code line not checked against the official text cannot be accepted", (st, js))
st, js = decide([code_only["id"]], "accept_table")
check(st == 200 and js["done"] == 0, "a side that does not exist cannot be accepted (code only -> accept the table)", (st, js))
st, js = decide([conflict["id"]], "accept_table", "the table's 'permitted' matches the specification")
check(st == 200 and js["done"] == 1, "a conflict is settled only by picking a side explicitly (here: the table's version, with a note)", (st, js))
st, js = decide([agree["id"], table_only["id"]], "accept_code")
check(st == 200 and js["done"] == 1 and len(js["failed"]) == 1, "accepting in bulk still checks each candidate (the table-only one has no code side)", (st, js))
decide([table_only["id"]], "accept_table"); decide([code_only["id"]], "reject")
st, js = decide([code_only["id"]], "accept_code")
check(st == 200 and js["done"] == 0 and "pending first" in js["failed"][0], "a decision is changed only through pending (no silent flip)", (st, js))
decide([code_only["id"]], "pending"); st, js = decide([code_only["id"]], "accept_code")
check(st == 200 and js["done"] == 1, "back to pending, then accepted", (st, js))
check(sql("select count(*) from wine_reference.change_log where table_name = 'rule_import_candidates' and operation = 'UPDATE'") != "0", "every decision is in the change log")

# ---------------------------------------------------------------- 4. import: drafts with documentary evidence, nothing published
st, js = rules(OWNER_T, "import", {"batch_id": B})
check(st == 200 and js["made"] == 0 and "still proposed" in js.get("waiting", ""), "import waits while 'Its rules name the grape' is proposed (nothing made)", (st, js))
draft(OWNER_T, "set_type_status", {"table": "relationship", "code": "rules_name_grape", "status": "active"})
st, js = rules(OWNER_T, "import", {"batch_id": B})
check(st == 200 and js["made"] == 0 and len(js["results"]) == 4 and all("not linked" in r["result"] for r in js["results"]), "the four accepted rules wait for their places and grapes to be linked", (st, js))
for t in ("geo_areas", "grapes"): tools(OWNER_T, "seed_from_catalog", {"table": t}); tools(OWNER_T, "confirm_unambiguous", {"table": t})
st, js = rules(OWNER_T, "import", {"batch_id": B})
check(st == 200 and js["made"] == 4, "linked: four draft 'its rules name the grape' facts are made", (st, js))
check(sql("select count(*) from wine_reference.claims c join wine_reference.claim_versions v on v.claim_id = c.id where c.relationship_type = 'rules_name_grape' and v.status = 'draft' and v.published_at is null") == "4"
      and sql("select count(*) from wine_reference.claim_versions where published_at is not null") == "0", "all four are drafts; nothing is published")
check(sql("select count(*) from wine_reference.claim_evidence e join wine_reference.claim_versions v on v.id = e.claim_version_id join wine_reference.claims c on c.id = v.claim_id where c.relationship_type = 'rules_name_grape' and e.modality = 'documentary'") == "4",
      "each has documentary evidence")
check(sql("select count(*) from wine_reference.sources where kind = 'regulation' and status = 'draft'") == "3" and sql(f"select count(*) from wine_reference.source_versions where url = '{URL_A}'") == "1",
      "sources are created as drafts, one per address (two rules citing the same address share it)")
q = json.loads(sql("select v.qualifiers::text from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id join wine_reference.entity_names n on n.entity_id = c.subject_entity_id join wine_reference.entity_names g on g.entity_id = c.object_entity_id where c.relationship_type = 'rules_name_grape' and n.name = 'Stand-in Hill' and g.name = 'Stand-in Blanc'"))
check(q == {"rule": "permitted", "style": "white", "origin": "appellation_grape_rules"}, "the conflict imported the side the owner chose (the table's 'permitted'), and says where it came from", q)
q = json.loads(sql("select v.qualifiers::text from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id join wine_reference.entity_names n on n.entity_id = c.subject_entity_id where c.relationship_type = 'rules_name_grape' and n.name = 'Stand-in Valley'"))
check(q == {"rule": "sole", "origin": "appellation_grape_rules"}, "a table-only rule keeps its rule (no style is invented)", q)
check(sql("select count(*) from wine_reference.rule_import_candidates where batch_id = '" + B + "' and claim_id is not null") == "4", "each imported candidate points at its fact")
st, js = rules(OWNER_T, "import", {"batch_id": B})
check(st == 200 and js["made"] == 0 and js["results"] == [], "importing again makes nothing twice", (st, js))
st, js = decide([agree["id"]], "pending")
check(st == 200 and js["done"] == 0 and "imported" in js["failed"][0], "an imported candidate's decision is frozen", (st, js))
st, js = rules(OWNER_T, "stage", {"lines": LINES}); B2 = js["batch_id"]
st, js = rules(OWNER_T, "candidates", {"batch_id": B2, "state": "agree"}); decide([js["candidates"][0]["id"]], "accept_code")
st, js = rules(OWNER_T, "import", {"batch_id": B2})
check(st == 200 and js["made"] == 0 and js["results"][0]["result"] == "already there", "a later batch does not import a rule already there", (st, js))
fact = sql("select v.id from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id join wine_reference.entity_names n on n.entity_id = c.subject_entity_id where c.relationship_type = 'rules_name_grape' and n.name = 'Morgon'")
for dec in ("submit", "approve", "publish"): st, js = review(OWNER_T, "claim_versions", fact, dec)
check(st >= 400, "an imported fact cannot be published before its source is approved (001's rules)", (st, js))

# ---------------------------------------------------------------- 5. what stays the same
check(sql(AGR) == AGR0 and sql(CATALOG) == CAT0, "appellation_grape_rules and the old catalog are exactly as before")
check(sql("select public.cfg_number('reference_enabled', 0) < 1") == "t", "reference_enabled is still off")
r = sql("truncate wine_reference.rule_import_candidates", strict=False)
check(r.startswith("ERROR"), "TRUNCATE is refused on the candidates", r)
r = sql(f"update wine_reference.rule_import_candidates set state = 'agree' where id = '{conflict['id']}'", strict=False)
check(r.startswith("ERROR") and "never changes" in r, "a candidate's content never changes, even in the SQL editor", r)
print(f"\nAPI 005 TOTAL: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
