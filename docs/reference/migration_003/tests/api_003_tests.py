#!/usr/bin/env python3
# STAGING ONLY. Migration 003 through the real local Supabase API (GoTrue sign-up, real tokens, PostgREST), on a database with the
# production hardening, 001 r5, 001a and 002 r1 in place. Synthetic users (@staging.invalid), synthetic taxonomy codes ("TST..."), synthetic
# catalog rows (prereq files). Never targets a hosted project; never prints a key. Usage: CTR=... SB_ENV_FILE=... python3 -I api_003_tests.py
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

# ---------------------------------------------------------------- 1. who may use the new door (decision 5: Owner only)
for who, tok in [("a signed-out visitor", None), ("a guest", GUEST_T), ("a player", PLAYER_T), ("an Editor (no ref_* permission)", EDITOR_T)]:
    st, js = tools(tok, "coverage"); check(st in (401, 403), f"ref_tools refuses a read by {who} (HTTP {st})", (st, js))
    st, js = tools(tok, "seed_from_catalog", {"table": "producers"}); check(st in (401, 403), f"ref_tools refuses a write by {who} (HTTP {st})", (st, js))
check(sql("select count(*) from wine_reference.entities") == "0" and sql("select count(*) from wine_reference.legacy_links") == "0", "nothing was written by the refused calls")
check(sql("select prosecdef and proconfig = (select proconfig from pg_proc where proname = 'ref_draft') and proacl::text not like '%anon%' and proacl::text like '%authenticated=X%' from pg_proc where proname = 'ref_tools'") == "t",
      "ref_tools is SECURITY DEFINER with the same empty search_path as ref_draft, executable by signed-in users only (not anon)")
check(sql("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wine_reference' and p.proname in ('catalog_identity','import_taxonomy','make_entity','suggest_link','catalog_rows') and p.proacl::text like '%authenticated%'") == "0",
      "the new internal functions are not executable by signed-in users")

# ---------------------------------------------------------------- 2. taxonomy: import from an approved document (dry run, apply, repeat, refusals)
st, js = draft(OWNER_T, "create_source", {"kind": "other", "title": "Approved taxonomy (synthetic test)", "version_label": "v1"})
SV = js["source_version_id"]
def nm(en, fr, ja):
    return [{"name": en, "language": "en"}, {"name": fr, "language": "fr"}, {"name": ja, "language": "ja", "script": "Jpan"}]
TAX = {"source_version_id": SV, "domains": [
    {"code": "TST01", "sort_order": 1, "names": nm("Test domain one", "Domaine d'essai un", "テスト領域一"), "nodes": [
        {"code": "TST01.01", "sort_order": 1, "names": nm("Test subdomain A", "Sous-domaine A", "サブ領域A")},
        {"code": "TST01.01.1", "parent": "TST01.01", "sort_order": 1, "names": nm("Test leaf A1", "Feuille A1", "葉A1")},
        {"code": "TST01.02", "sort_order": 2, "names": nm("Test subdomain B", "Sous-domaine B", "サブ領域B")}]},
    {"code": "TST02", "sort_order": 2, "names": [{"name": "Test domain two", "language": "en"}, {"name": "测试领域二", "language": "zh-Hans", "script": "Hans"}, {"name": "Dominio di prova due", "language": "it"}],
     "nodes": [{"code": "TST02.01", "names": [{"name": "Test subdomain C", "language": "en"}]}]}]}
st, js = tools(OWNER_T, "import_taxonomy", dict(TAX, dry_run=True))
check(st == 200 and js["dry_run"] and len(js["new_domains"]) == 2 and len(js["new_nodes"]) == 4 and js["conflicts"] == [], "a dry run lists 2 new domains and 4 new subdomains, no conflicts", (st, js))
check(sql("select count(*) from wine_reference.taxonomy_domains") == "0" and sql("select count(*) from wine_reference.entities") == "0", "the dry run wrote nothing")
st, js = tools(OWNER_T, "import_taxonomy", dict(TAX, dry_run=False))
check(st == 200 and not js["dry_run"] and js["names"] == 16, "the import applies: 6 entries with their 16 names", (st, js))
check(sql("select count(*) from wine_reference.taxonomy_domains where source_version_id = '" + SV + "'") == "2" and sql("select count(*) from wine_reference.taxonomy_nodes where source_version_id = '" + SV + "'") == "4",
      "every domain and subdomain keeps the approved document's source version (provenance)")
check(sql("select p.code from wine_reference.taxonomy_nodes n join wine_reference.taxonomy_nodes p on p.entity_id = n.parent_id where n.code = 'TST01.01.1'") == "TST01.01", "the hierarchy is kept (TST01.01.1 under TST01.01)")
check(sql("select string_agg(n.language || ':' || n.is_preferred, ',' order by n.language) from wine_reference.entity_names n join wine_reference.taxonomy_domains d on d.entity_id = n.entity_id where d.code = 'TST02'") == "en:true,it:true,zh-Hans:true",
      "names in English, Italian and Chinese, each preferred in its own language")
check(sql("select count(*) from wine_reference.entities where kind in ('taxonomy_domain','taxonomy_node') and status = 'draft' and created_by = '" + OWNER_U + "'") == "6", "everything imported is a draft by the Owner (approved later through review)")
st, js = tools(OWNER_T, "import_taxonomy", dict(TAX, dry_run=False))
check(st == 200 and js["new_domains"] == [] and js["new_nodes"] == [] and js["names"] == 0, "importing the same file again changes nothing (stable codes)", (st, js))
T2 = json.loads(json.dumps(TAX)); T2["domains"][0]["nodes"][2]["sort_order"] = 9; T2["domains"][0]["nodes"][0]["names"].append({"name": "Sottodominio A", "language": "it"})
T2["domains"][0]["nodes"] = T2["domains"][0]["nodes"][:3]; T2["domains"] = T2["domains"][:1]
st, js = tools(OWNER_T, "import_taxonomy", dict(T2, dry_run=False))
check(st == 200 and js["sort_changes"] == ["TST01.02"] and js["names"] == 1 and set(js["not_in_file"]) == {"TST02", "TST02.01"},
      "a revised file: a new sort order and a new Italian name are applied; codes missing from the file are only reported, never retired", (st, js))
T3 = json.loads(json.dumps(TAX)); T3["domains"][0]["nodes"][1]["parent"] = "TST01.02"; T3["domains"][0]["nodes"] = [T3["domains"][0]["nodes"][i] for i in (0, 2, 1)]
st, js = tools(OWNER_T, "import_taxonomy", dict(T3, dry_run=True))
check(st == 200 and any("TST01.01.1 is already under" in c for c in js["conflicts"]), "moving an existing code to another parent is a conflict", (st, js))
st, js = tools(OWNER_T, "import_taxonomy", dict(T3, dry_run=False))
check(st >= 400 and "nothing was changed" in msg(js), "an import with a conflict is refused and changes nothing", (st, js))
bad = {"source_version_id": SV, "domains": [{"code": "TST03", "names": [{"name": "x", "language": "en"}], "nodes": [
    {"code": "TST03.01.1", "parent": "TST03.01", "names": [{"name": "y", "language": "en"}]}, {"code": "TST03.01", "names": [{"name": "z", "language": "en"}]},
    {"code": "bad code", "names": [{"name": "w", "language": "en"}]}, {"code": "TST03.02", "names": []}]}]}
st, js = tools(OWNER_T, "import_taxonomy", dict(bad, dry_run=True))
cf = " | ".join(js.get("conflicts", [])) if isinstance(js, dict) else ""
check("parent TST03.01 is not listed before it" in cf and "is not valid" in cf and "TST03.02 has no name" in cf, "a dry run reports a child before its parent, an invalid code and a nameless entry", (st, js))
st, js = tools(OWNER_T, "import_taxonomy", {"domains": TAX["domains"], "dry_run": True})
check(st >= 400 and "source_version_id" in msg(js), "an import without the approved document's source version is refused", (st, js))
st, js = tools(OWNER_T, "create_node", {"domain": "TST02", "parent": "TST01.01", "code": "TST02.09", "names": [{"name": "Cross", "language": "en"}]})
check(st >= 400 and "same domain" in msg(js), "a subdomain whose parent is in another domain is refused (001's rule holds)", (st, js))
st, js = tools(OWNER_T, "create_node", {"domain": "TST02", "parent": "TST02.01", "code": "TST02.01.1", "names": [{"name": "Hand-made leaf", "language": "en"}, {"name": "手作り", "language": "ja"}]})
check(st == 200, "one subdomain can also be added by hand, with its names", (st, js))
st, js = tools(OWNER_T, "taxonomy")
doms = js["domains"] if st == 200 else []
check(len(doms) == 2 and [n["code"] for n in doms[0]["nodes"]] == ["TST01.01", "TST01.01.1", "TST01.02"] and len(doms[1]["nodes"]) == 2 and any(n["language"] == "ja" for n in doms[0]["names"]),
      "the taxonomy read returns both domains, their subdomains in order, with names in every language", (st, js))
# review many at once: names, then the entities (an entity is published only with an approved display name)
names = ids("select n.id from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id where e.kind in ('taxonomy_domain','taxonomy_node')")
ents = ids("select id from wine_reference.entities where kind in ('taxonomy_domain','taxonomy_node')")
okall = True
for table, rows in (("entity_names", names), ("entities", ents)):
    for dec in ("submit", "approve"):
        st, js = tools(OWNER_T, "review_many", {"table": table, "ids": rows, "decision": dec})
        okall = okall and st == 200 and js["done"] == len(rows) and js["failed"] == []
st, js = tools(OWNER_T, "review_many", {"table": "entities", "ids": ents, "decision": "publish"})
check(okall and st == 200 and js["done"] == len(ents), f"review many: {len(names)} names and {len(ents)} entries submitted, approved and published in a few calls", (st, js))
check(sql("select count(*) from wine_reference.review_events where decision = 'approve' and owner_override and actor = '" + OWNER_U + "'") == str(len(names) + len(ents)),
      "every one of the Owner's own approvals is recorded as an owner override")
st, js = tools(OWNER_T, "review_many", {"table": "entities", "ids": [ents[0], str(uuid.uuid4())], "decision": "publish"})
check(st == 200 and js["done"] == 0 and len(js["failed"]) == 2, "review many reports each refusal on its own (already published; no such row)", (st, js))
r = sql("update wine_reference.taxonomy_nodes set parent_id = null where code = 'TST01.01.1'", strict=False)
check(r.startswith("ERROR") and "frozen" in r, "an approved subdomain's place in the hierarchy is frozen (001's rule)", r)

# ---------------------------------------------------------------- 3. catalog matching: drafts, suggestions, decisions, the rules on every path
st, js = tools(OWNER_T, "coverage")
cov = {t["catalog_table"]: t for t in js["tables"]} if st == 200 else {}
check(st == 200 and cov["producers"]["rows"] == 3 and cov["producers"]["unlinked"] == 3 and cov["wine_vintages"]["kind"] == "wine_edition", "coverage: every old catalog table with its rows, kind and nothing linked yet", (st, js))
P_STAND = sql("select id from public.producers where name = 'Stand-in Cellars'")
st, js = tools(OWNER_T, "seed_from_catalog", {"table": "producers", "ids": [P_STAND]})
check(st == 200 and js["drafts"] == 1, "make drafts: one draft producer from one catalog row", (st, js))
check(sql(f"select l.match_method || ' ' || l.status || ' ' || e.kind || ' ' || e.status from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id where l.catalog_id = '{P_STAND}'") == "created_from_catalog suggested producer draft",
      "it is linked as a suggestion (made from that very row), never confirmed by itself")
# an exact-name match with one candidate, and one with several
st, js = draft(OWNER_T, "create_entity", {"kind": "grape_variety", "name": "stand-in  noir", "language": "en"})
st, js = draft(OWNER_T, "create_entity", {"kind": "grape_variety", "name": "Stand-in Blanc", "language": "en"}); B1 = js["entity_id"]
st, js = draft(OWNER_T, "create_entity", {"kind": "grape_variety", "name": "Stand-in Blanc", "language": "fr"}); B2 = js["entity_id"]
st, js = draft(OWNER_T, "create_entity", {"kind": "place", "name": "Stand-in Blanc", "language": "en"})
st, js = tools(OWNER_T, "suggest_links", {"table": "grapes"})
check(st == 200 and js["rows_matched"] == 2 and js["suggestions"] == 3, "suggest matches by exact name (capitals and spaces ignored), only things of the right kind (grapes -> grape varieties)", (st, js))
st, js = tools(OWNER_T, "link_queue", {"table": "grapes", "filter": "several"})
check(st == 200 and len(js["rows"]) == 1 and js["rows"][0]["name"] == "Stand-in Blanc" and {l["score"] for l in js["rows"][0]["links"]} == {50}, "the queue shows the row with several candidates, each scored 50", (st, js))
st, js = tools(OWNER_T, "confirm_unambiguous", {"table": "grapes"})
check(st == 200 and js["confirmed"] == 1 and sql("select count(*) from wine_reference.legacy_links where catalog_table = 'grapes' and status = 'confirmed'") == "1",
      "confirm the unambiguous ones: only the single exact match is confirmed, never the row with several candidates", (st, js))
blanc_links = ids("select l.id from wine_reference.legacy_links l where l.catalog_table = 'grapes' and l.status = 'suggested' order by l.created_at")
st, js = tools(OWNER_T, "decide_links", {"ids": blanc_links[:1], "status": "confirmed"})
check(st == 200 and js["done"] == 1 and sql("select string_agg(status, ',' order by status) from wine_reference.legacy_links where id in ('" + "','".join(blanc_links) + "')") == "confirmed,rejected",
      "confirming one candidate rejects the row's other suggestion automatically", (st, js))
check(sql("select count(*) from wine_reference.change_log where table_name = 'legacy_links' and operation = 'UPDATE'") != "0", "each link decision is in the change log (audit)")
st, js = tools(OWNER_T, "decide_links", {"ids": blanc_links[1:], "status": "confirmed"})
check(st == 200 and js["done"] == 0 and len(js["failed"]) == 1, "a link already decided cannot be decided again", (st, js))
G_BLANC = sql("select id from public.grapes where name = 'Stand-in Blanc'")
st, js = draft(OWNER_T, "link_catalog", {"catalog_table": "grapes", "catalog_id": G_BLANC, "entity_id": B2})
check(st >= 400, "a catalog row with a confirmed link takes no new suggestion (no conflicting links)", (st, js))
PLACE_ID = sql("select id from wine_reference.entities where kind = 'place' limit 1")
st, js = draft(OWNER_T, "link_catalog", {"catalog_table": "producers", "catalog_id": P_STAND, "entity_id": PLACE_ID})
check(st >= 400 and "can only be linked to a producer" in msg(js), "a producer row can only be linked to a producer (the kind rule holds for 002's door too)", (st, js))
st, js = draft(OWNER_T, "link_catalog", {"catalog_table": "producers", "catalog_id": str(uuid.uuid4()), "entity_id": sql(f"select entity_id from wine_reference.legacy_links where catalog_id = '{P_STAND}'")})
check(st >= 400 and "No producers row" in msg(js), "a link to a catalog row that does not exist is refused", (st, js))
r = sql("update wine_reference.legacy_links set status = 'confirmed', decided_at = now() where status = 'rejected'", strict=False)
check(r.startswith("ERROR") and "cannot go from rejected" in r, "a rejected link cannot be revived, even in the SQL editor (make a new one)", r)
r = sql(f"update wine_reference.legacy_links set entity_id = '{B1}' where catalog_table = 'grapes' and status = 'confirmed'", strict=False)
check(r.startswith("ERROR") and "never change" in r, "what a link points at never changes, even in the SQL editor", r)
confirmed_blanc = sql(f"select id from wine_reference.legacy_links where catalog_id = '{G_BLANC}' and status = 'confirmed'")
st, js = tools(OWNER_T, "undo_link", {"id": confirmed_blanc, "note": "test undo"})
check(st == 200 and sql(f"select status from wine_reference.legacy_links where id = '{confirmed_blanc}'") == "rejected", "undo a confirmed link: it becomes rejected, history kept", (st, js))
st, js = tools(OWNER_T, "reopen_link", {"id": confirmed_blanc})
check(st == 200 and sql(f"select status from wine_reference.legacy_links where id = '{confirmed_blanc}'") == "suggested", "after the undo the link can be reopened as a suggestion and decided again", (st, js))
st, js = tools(OWNER_T, "decide_links", {"ids": [confirmed_blanc], "status": "confirmed"})
check(st == 200 and js["done"] == 1, "and confirmed again", (st, js))
# a retired thing cannot be confirmed
st, js = draft(OWNER_T, "create_entity", {"kind": "producer", "name": "Domaine Exemple", "language": "fr"}); DX = js["entity_id"]
st, js = tools(OWNER_T, "suggest_links", {"table": "producers"})
check(st == 200 and js["rows_matched"] == 2 and js["suggestions"] == 2, "two catalog producers that differ only by capitals and spaces both match the same thing", (st, js))
st, js = tools(OWNER_T, "duplicates")
check(st == 200 and any(g["entity_id"] == DX and len(g["rows"]) == 2 for g in js["groups"]), "the duplicates report shows the two old catalog rows pointing at one thing (to confirm both, never merging the old rows)", (st, js))
st, js = review(OWNER_T, "entities", DX, "retire")
dx_links = ids(f"select id from wine_reference.legacy_links where entity_id = '{DX}'")
st, js = tools(OWNER_T, "decide_links", {"ids": dx_links, "status": "confirmed"})
check(st == 200 and js["done"] == 0 and all("retired" in f for f in js["failed"]), "a link to a retired thing cannot be confirmed", (st, js))
st, js = tools(OWNER_T, "link_queue", {"table": "producers", "filter": "waiting", "q": "exemple"})
check(st == 200 and len(js["rows"]) == 2 and js["basis"] == "old catalog, not verified", "the review queue can be searched and says every link is old catalog, not verified", (st, js))

# ---------------------------------------------------------------- 4. wine identity from the old catalog
V2020 = sql("select v.id from public.wine_vintages v join public.wines w on w.id = v.wine_id where w.name = 'Stand-in draft wine' and not v.is_non_vintage")
VNV = sql("select v.id from public.wine_vintages v join public.wines w on w.id = v.wine_id where w.name = 'Stand-in draft wine' and v.is_non_vintage")
st, js = tools(OWNER_T, "catalog_identity", {"wine_vintage_ids": [V2020]})
res = js["results"][0] if st == 200 else {}
check(st == 200 and sorted(res.get("made", [])) == ["edition", "product"] and res["facts"]["edition_of"] == "type proposed" and res["facts"]["harvest_year"] == "type proposed",
      "build product + edition: both drafted from the catalog; no facts while their types are proposed", (st, js))
check(sql(f"select string_agg(e.kind || '/' || l.match_method || '/' || l.status, ',' order by e.kind) from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id where l.catalog_id in ((select wine_id::text from public.wine_vintages where id = '{V2020}'), '{V2020}')")
      == "wine_edition/created_from_catalog/suggested,wine_product/created_from_catalog/suggested", "the product links to the wines row and the edition to the wine_vintages row, both suggested")
check(sql(f"select n.name from wine_reference.entity_names n where n.entity_id = '{res['edition_id']}'") == "Stand-in Cellars Stand-in draft wine 2020", "the edition is named from the catalog with its year")
for code in ("edition_of", "product_of", "defined_by_place"): draft(OWNER_T, "set_type_status", {"table": "relationship", "code": code, "status": "active"})
draft(OWNER_T, "set_type_status", {"table": "attribute", "code": "harvest_year", "status": "active"})
tools(OWNER_T, "confirm_unambiguous", {"table": "producers"})
st, js = tools(OWNER_T, "catalog_identity", {"wine_vintage_ids": [VNV, V2020]})
r1, r2 = (js["results"] if st == 200 else [{}, {}])
check(st == 200 and r1["made"] == ["edition"] and r1["product_id"] == res["product_id"] and r1["facts"]["harvest_year"] == "non-vintage: nothing stated" and r1["facts"]["edition_of"] == "made",
      "the non-vintage row: the same product is reused, an 'unidentified non-vintage' edition is drafted, and no harvest year is invented", (st, js))
check(r1["facts"]["product_of"] == "made" and r2.get("made") == [] and r2["facts"]["edition_of"] == "made" and r2["facts"]["harvest_year"] == "made"
      and r2["facts"]["product_of"] == "already there" and r2["facts"]["defined_by_place"] == "place not linked (confirmed) yet",
      "after the types are switched on: product_of once for the shared product; the 2020 edition gets edition_of and harvest_year; the place waits for its link", (st, js))
check(sql(f"select n.name from wine_reference.entity_names n where n.entity_id = '{r1['edition_id']}'") == "Stand-in Cellars Stand-in draft wine NV (unidentified non-vintage)", "the non-vintage edition says it is unidentified")
st, js = tools(OWNER_T, "catalog_identity", {"wine_vintage_ids": [V2020]})
check(st == 200 and js["results"][0]["made"] == [] and all(v in ("already there", "place not linked (confirmed) yet") for v in js["results"][0]["facts"].values()), "running it again makes nothing twice", (st, js))
check(sql("select count(*) from wine_reference.claim_versions where status = 'draft' and change_note like 'from the old catalog, not verified%'") == "4"
      and sql("select value_number from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id where c.attribute_type = 'harvest_year'") == "2020",
      "every fact made this way is a draft marked 'from the old catalog, not verified'; the harvest year is the catalog's own 2020")
hv = sql("select v.id from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id where c.attribute_type = 'harvest_year'")
st, js = review(OWNER_T, "claim_versions", hv, "submit"); st, js = review(OWNER_T, "claim_versions", hv, "approve"); st, js = review(OWNER_T, "claim_versions", hv, "publish")
check(st >= 400, "such a fact cannot be published without evidence from a real source (001's rule)", (st, js))
st, js = tools(OWNER_T, "catalog_identity", {"wine_vintage_ids": [str(uuid.uuid4())]})
check(st == 200 and "No wine_vintages row" in js["results"][0].get("error", ""), "an unknown catalog vintage is reported, nothing made", (st, js))
check(sql("select status from wine_reference.attribute_types where code = 'bottle_format_ml'") == "proposed", "bottle format stays proposed (owner decision)")

# ---------------------------------------------------------------- 5. what stays the same
check(sql(CATALOG) == CAT0, "the old catalog (producers, wines, wine_vintages, grapes, geo_areas) is exactly as before")
check(sql("select public.cfg_number('reference_enabled', 0) < 1") == "t", "reference_enabled is still off")
st, js = http("POST", "/rest/v1/rpc/ref_published_names", None, {})
check(st == 200 and js == [], "the read door still returns nothing to visitors (switch off), although taxonomy entries are published", (st, js))
r = sql("truncate wine_reference.legacy_links", strict=False)
check(r.startswith("ERROR"), "TRUNCATE is still refused on legacy_links", r)
print(f"\nAPI 003 TOTAL: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
