#!/usr/bin/env python3
# STAGING ONLY. Migration 002 through the real local Supabase API (GoTrue sign-up, real tokens, PostgREST), on a database with the
# production hardening, 001 r5 and 001a in place. Synthetic users (@staging.invalid) and synthetic reference rows ("Test place ..."),
# never wine facts. Never targets a hosted project; never prints a key. Usage: CTR=... SB_ENV_FILE=... python3 -I api_002_tests.py
import json, os, subprocess, sys, urllib.error, urllib.request, uuid

ENV = {k: v.strip().strip('"') for k, v in (l.strip().split("=", 1) for l in open(os.environ["SB_ENV_FILE"]) if "=" in l)}
API = ENV["API_URL"].rstrip("/")
if not (API.startswith("http://127.0.0.1:") or API.startswith("http://localhost:")): sys.exit("REFUSING: not a local API URL")
ANON = ENV["ANON_KEY"]; CTR = os.environ["CTR"]
PASS = FAIL = 0
def check(cond, label, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"PASS  {label}", flush=True)
    else: FAIL += 1; print(f"FAIL  {label}  [{str(detail)[:300]}]", flush=True)
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
        with urllib.request.urlopen(req, timeout=30) as r: raw, st = r.read().decode(), r.status
    except urllib.error.HTTPError as e: raw, st = e.read().decode(), e.code
    try: js = json.loads(raw) if raw else None
    except ValueError: js = raw
    return st, js
msg = lambda js: (js or {}).get("message", "") if isinstance(js, dict) else str(js)
def draft(tok, action, data=None): return http("POST", "/rest/v1/rpc/ref_draft", tok, {"p_action": action, "p_data": data or {}})
def staff(tok, what, args=None): return http("POST", "/rest/v1/rpc/ref_staff", tok, {"p_what": what, "p_args": args or {}})
def review(tok, table, rid, decision, note=""): return http("POST", "/rest/v1/rpc/ref_review", tok, {"p_table": table, "p_id": rid, "p_decision": decision, "p_note": note})
RUN = uuid.uuid4().hex[:6]
def signup(name):
    st, js = http("POST", "/auth/v1/signup", body={"email": f"{name}-{RUN}@staging.invalid", "password": "Stg-" + uuid.uuid4().hex})
    assert st == 200, (st, js); return js["access_token"], js["user"]["id"]
OWNER_T, OWNER_U = signup("owner"); EDITOR_T, EDITOR_U = signup("editor"); PLAYER_T, PLAYER_U = signup("player")
sql(f"update public.profiles set staff_role = 'owner' where id = '{OWNER_U}'; update public.profiles set staff_role = 'editor' where id = '{EDITOR_U}';")
st, js = http("POST", "/auth/v1/signup", body={}); GUEST_T = js["access_token"]

# ---------------------------------------------------------------- 1. who may use the doors (decision 5: Owner only)
for who, tok in [("a signed-out visitor", None), ("a guest", GUEST_T), ("a player", PLAYER_T), ("an Editor (no ref_* permission)", EDITOR_T)]:
    st, js = draft(tok, "create_entity", {"kind": "place", "name": "Nope", "language": "en"})
    check(st in (401, 403), f"ref_draft refuses {who} (HTTP {st}: {msg(js)[:50]})", (st, js))
    st, js = staff(tok, "overview")
    check(st in (401, 403), f"ref_staff refuses {who} (HTTP {st})", (st, js))
check(sql("select count(*) from wine_reference.entities") == "0", "nothing was written by the refused calls")
st, js = http("GET", "/rest/v1/legacy_links?select=*", OWNER_T, headers={"Accept-Profile": "wine_reference"})
check(st == 406, f"the Data API does not serve wine_reference.legacy_links, even to the Owner (HTTP {st})", (st, js))

# ---------------------------------------------------------------- 2. the Owner writes drafts as the author; multilingual names
st, js = draft(OWNER_T, "create_entity", {"kind": "place", "name": "Test Region", "language": "en", "name_kind": "official"})
check(st == 200 and js.get("entity_id"), "the Owner creates a draft place with its first name", (st, js)); REGION = js["entity_id"]
check(sql(f"select created_by = '{OWNER_U}' and status = 'draft' from wine_reference.entities where id = '{REGION}'") == "t", "it is a draft and the Owner is its recorded author")
st, js = draft(OWNER_T, "create_entity", {"kind": "place", "name": "Test Village", "language": "en"}); VILLAGE = js["entity_id"]
names = [("Région d'essai", "fr", None, "translation"), ("Regione di prova", "it", None, "translation"), ("テスト地方", "ja", "Jpan", "translation"),
         ("测试产区", "zh-Hans", "Hans", "translation"), ("Tesuto chihō", "ja-Latn", "Latn", "transliteration")]
ok = True
for n, lang, script, kind in names:
    st, js = draft(OWNER_T, "add_name", {"entity_id": REGION, "name": n, "language": lang, "script": script, "name_kind": kind})
    ok = ok and st == 200
check(ok, "names in French, Italian, Japanese, Chinese (Hans) and a romanised Japanese name are added", (st, js))
check(sql(f"select string_agg(language, ',' order by language) from wine_reference.entity_names where entity_id = '{REGION}'") == "en,fr,it,ja,ja-Latn,zh-Hans", "the six names are stored with their languages")
st, js = draft(OWNER_T, "add_name", {"entity_id": REGION, "name": "Bad", "language": "Japanese"})
check(st >= 400, "a language that is not a BCP 47 tag is refused", (st, js))
st, js = draft(OWNER_T, "create_source", {"kind": "regulation", "title": "Test specification", "licence_code": "test-open", "allows_quote": True, "version_label": "2026 edition", "url": "https://example.org/spec"})
check(st == 200 and js.get("source_version_id") and js.get("rights_id"), "the Owner records a source with its rights and first version in one step", (st, js))
SRC, RIGHTS, SV = js["source_id"], js["rights_id"], js["source_version_id"]

# ---------------------------------------------------------------- 3. the Owner reviews and publishes their own work (recorded override)
def chain(tok, steps):
    for table, rid, dec in steps:
        st, js = review(tok, table, rid, dec)
        if st != 200: return st, js, (table, dec)
    return 200, None, None
steps = [("sources", SRC, "submit"), ("sources", SRC, "approve"), ("rights_statements", RIGHTS, "submit"), ("rights_statements", RIGHTS, "approve"),
         ("source_versions", SV, "submit"), ("source_versions", SV, "approve")]
for eid in (REGION, VILLAGE):
    nids = sql(f"select string_agg(id::text, ',') from wine_reference.entity_names where entity_id = '{eid}'").split(",")
    steps += [("entity_names", n, "submit") for n in nids] + [("entity_names", n, "approve") for n in nids]
    steps += [("entities", eid, "submit"), ("entities", eid, "approve"), ("entities", eid, "publish")]
st, js, where = chain(OWNER_T, steps)
check(st == 200, f"the Owner submits, approves (own work) and publishes the source, names and places", (st, js, where))
check(sql(f"select count(*) from wine_reference.review_events where actor = '{OWNER_U}' and decision = 'approve' and owner_override") == str(sum(1 for s in steps if s[2] == 'approve')),
      "every self-approval is recorded with owner_override")

# ---------------------------------------------------------------- 4. claims: a proposed type cannot be used until the Owner activates it
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": VILLAGE, "relationship_type": "part_of", "object_entity_id": REGION,
                                          "evidence": [{"source_version_id": SV, "locator": "art. 1", "modality": "documentary"}]})
check(st >= 400 and "not active" in msg(js), "a claim with a proposed relationship type is refused", (st, js))
st, js = draft(PLAYER_T, "set_type_status", {"table": "relationship", "code": "part_of", "status": "active"})
check(st in (401, 403), "a player cannot activate a type", (st, js))
st, js = draft(OWNER_T, "set_type_status", {"table": "relationship", "code": "part_of", "status": "active"})
check(st == 200, "the Owner activates part_of (ref_publish)", (st, js))
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": VILLAGE, "relationship_type": "part_of", "object_entity_id": REGION, "change_note": "first",
                                          "evidence": [{"source_version_id": SV, "locator": "art. 1", "modality": "documentary", "quote": "a short quote", "quote_rights_id": RIGHTS}]})
check(st == 200 and js.get("claim_version_id"), "the Owner creates the claim, its first version and its evidence (with a quote under rights that allow it)", (st, js))
CLAIM, V1 = js["claim_id"], js["claim_version_id"]
st, js, where = chain(OWNER_T, [("claim_versions", V1, "submit"), ("claim_versions", V1, "approve"), ("claim_versions", V1, "publish")])
check(st == 200, "the claim version is submitted, approved and published", (st, js, where))
check(sql(f"select wine_reference.is_current('{V1}')::text") == "true", "it is current")
st, js = draft(OWNER_T, "new_claim_version", {"claim_id": CLAIM, "change_note": "second", "evidence": [{"source_version_id": SV, "locator": "art. 2", "modality": "documentary"}]})
check(st == 200, "the Owner writes version 2 (it supersedes the published version 1)", (st, js)); V2 = js["claim_version_id"]
check(sql(f"select version_no || ' ' || (supersedes_version_id = '{V1}')::text from wine_reference.claim_versions where id = '{V2}'") == "2 true", "version 2 is numbered 2 and records what it supersedes")
st, js, where = chain(OWNER_T, [("claim_versions", V2, "submit"), ("claim_versions", V2, "approve"), ("claim_versions", V2, "publish")])
check(st == 200, "version 2 is published; version 1 is retired automatically (with its review event)", (st, js, where))
check(sql(f"select count(*) from wine_reference.review_events where target_id = '{V1}' and decision = 'retire'") == "1", "the automatic retirement is in the review history")
st, js = review(OWNER_T, "claim_versions", V1, "publish")
check(st >= 400, "the retired version 1 is never published again (decision 14)", (st, js))

# ---------------------------------------------------------------- 5. the wine identity levels (proposed until activated)
st, js = draft(OWNER_T, "create_entity", {"kind": "producer", "name": "Test Estate", "language": "en"}); PROD = js["entity_id"]
st, js = draft(OWNER_T, "create_entity", {"kind": "wine_product", "name": "Test Estate Red", "language": "en"})
check(st == 200, "a wine product entity can be drafted (the kind exists)", (st, js)); WP = js["entity_id"]
st, js = draft(OWNER_T, "create_entity", {"kind": "wine_edition", "name": "Test Estate Red 2020", "language": "en"}); WE = js["entity_id"]
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": WE, "relationship_type": "edition_of", "object_entity_id": WP})
check(st >= 400 and "not active" in msg(js), "edition_of is proposed: refused until the Owner activates it", (st, js))
for code in ("product_of", "edition_of"):
    draft(OWNER_T, "set_type_status", {"table": "relationship", "code": code, "status": "active"})
draft(OWNER_T, "set_type_status", {"table": "attribute", "code": "harvest_year", "status": "active"})
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": WE, "relationship_type": "edition_of", "object_entity_id": WP, "evidence": [{"source_version_id": SV, "locator": "label", "modality": "label"}]})
check(st == 200, "after activation: the edition is linked to its product", (st, js))
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": WP, "relationship_type": "product_of", "object_entity_id": PROD})
check(st == 200, "the product is linked to its producer", (st, js))
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": WE, "attribute_type": "harvest_year", "value_number": 2020, "evidence": [{"source_version_id": SV, "locator": "label", "modality": "label"}]})
check(st == 200, "the edition's harvest year is an attribute claim (value 2020)", (st, js))
st, js = draft(OWNER_T, "create_claim", {"subject_entity_id": WP, "relationship_type": "edition_of", "object_entity_id": WE})
check(st >= 400, "edition_of the wrong way round (a product as the subject) is refused by the kinds check", (st, js))

# ---------------------------------------------------------------- 6. links to the old catalog (suggestions only; the catalog is never changed)
before = sql("select (select count(*) from public.producers)||'/'||(select count(*) from public.wines)||'/'||(select count(*) from public.wine_vintages)||'/'||(select count(*) from public.grapes)||'/'||(select count(*) from public.geo_areas)")
for tab in ("producers", "wines", "wine_vintages", "grapes", "geo_areas"):
    st, js = staff(OWNER_T, "suggestions", {"table": tab})
    check(st == 200 and js.get("basis") == "old catalog, not verified" and isinstance(js.get("rows"), list) and len(js["rows"]) >= 1,
          f"the link report lists unlinked {tab} rows, marked old catalog, not verified ({len(js.get('rows') or [])} rows)", (st, js))
st, js = staff(OWNER_T, "suggestions", {"table": "producers"})
row = next(r for r in js["rows"] if r["name"] == "Stand-in Cellars")
check(row["kind"] == "producer" and row["matches"] is None, "a producer row maps to kind producer; no same-name reference entity yet", row)
st, js = draft(OWNER_T, "create_entity", {"kind": "producer", "name": "Stand-in Cellars", "language": "en"}); SC = js["entity_id"]
st, js = staff(OWNER_T, "suggestions", {"table": "producers"})
row = next(r for r in js["rows"] if r["name"] == "Stand-in Cellars")
check(row["matches"] == [SC], "once a same-name producer entity exists, the report suggests it", row)
st, js = staff(OWNER_T, "suggestions", {"table": "wine_vintages"})
check(any(r.get("note", "") and "unidentified non-vintage" in r["note"] for r in js["rows"]), "a non-vintage catalog row is suggested as an unidentified non-vintage edition", js["rows"][:3])
st, js = draft(OWNER_T, "link_catalog", {"catalog_table": "producers", "catalog_id": row["catalog_id"], "entity_id": SC, "note": "same name"})
check(st == 200, "the Owner records a suggested link", (st, js)); LINK = js["link_id"]
st, js = draft(OWNER_T, "decide_link", {"id": LINK, "status": "confirmed"})
check(st == 200, "the Owner confirms it", (st, js))
check(sql(f"select status || '|' || basis || '|' || (decided_by = '{OWNER_U}')::text from wine_reference.legacy_links where id = '{LINK}'") == "confirmed|old catalog, not verified|true", "confirmed, still marked old catalog, not verified, with who decided")
st, js = draft(OWNER_T, "create_entity", {"kind": "producer", "name": "Stand-in Cellars", "language": "fr"}); SC2 = js["entity_id"]
st, js = draft(OWNER_T, "link_catalog", {"catalog_table": "producers", "catalog_id": row["catalog_id"], "entity_id": SC2})
LINK2 = js["link_id"]; st, js = draft(OWNER_T, "decide_link", {"id": LINK2, "status": "confirmed"})
check(st >= 400, "a second confirmed entity for the same catalog row is refused", (st, js))
st, js = staff(OWNER_T, "suggestions", {"table": "producers"})
check(all(r["name"] != "Stand-in Cellars" for r in js["rows"]), "a confirmed catalog row leaves the report", js["rows"][:3])
check(sql("select (select count(*) from public.producers)||'/'||(select count(*) from public.wines)||'/'||(select count(*) from public.wine_vintages)||'/'||(select count(*) from public.grapes)||'/'||(select count(*) from public.geo_areas)") == before,
      "the old catalog is unchanged (row counts)")
check(sql("select count(*) from wine_reference.change_log where table_name = 'legacy_links'") != "0", "every link change is in the change log")

# ---------------------------------------------------------------- 7. the overview the Owner page reads; the read door; locks and audit
st, js = staff(OWNER_T, "overview")
check(st == 200 and len(js["entities"]) >= 6 and len(js["claims"]) >= 4 and js["permissions"] == {"edit": True, "review": True, "publish": True, "rights": True},
      "ref_staff overview returns entities, claims, sources, types and the Owner's four permissions", {k: (len(v) if isinstance(v, list) else v) for k, v in (js or {}).items()})
ent = next(e for e in js["entities"] if e["id"] == REGION)
check(len(ent["names"]) == 6 and ent["status"] == "verified" and ent["mine"], "the overview shows the region with its six names, its status and that it is mine", ent)
st, js = http("POST", "/rest/v1/rpc/ref_published_names", None, {"p_query": "Test"})
check(st == 200 and js == [], "the public read door still returns nothing (reference_enabled is 0)", (st, js))
sql("insert into public.app_config (key, value) values ('reference_enabled', '1') on conflict (key) do update set value = '1';")
st, js = http("POST", "/rest/v1/rpc/ref_published_names", None, {"p_query": "テスト"})
check(st == 200 and any(r["name"] == "テスト地方" and r["language"] == "ja" for r in js), "LOCALLY with the switch on: a Japanese name is found through the read door", js)
st, js = http("POST", "/rest/v1/rpc/ref_published_names", None, {"p_language": "zh-Hans"})
check(st == 200 and [r["name"] for r in js] == ["测试产区"], "... and the Chinese name by language", js)
sql("update public.app_config set value = '0' where key = 'reference_enabled';")
r = sql("truncate wine_reference.legacy_links", strict=False)
check(r.startswith("ERROR") and "TRUNCATE is not allowed" in r, "TRUNCATE of legacy_links is refused (as for every reference table)", r[:120])
st, js = draft(OWNER_T, "unknown_action", {})
check(st >= 400 and "Unknown action" in msg(js), "an unknown action is refused", (st, js))
print(f"\nAPI 002 TOTAL: {PASS} passed, {FAIL} failed")
sys.exit(0 if FAIL == 0 else 1)
