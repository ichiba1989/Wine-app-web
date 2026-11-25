#!/usr/bin/env python3
# STAGING ONLY (Phase 2.0B.4). Real-API tests of migration 001 (r4 in Phase 2.0B.4, r5 in 2.0B.5) on the disposable LOCAL Supabase stack: genuine Supabase Auth users
# (GoTrue sign-up and anonymous sign-in), their real access tokens, the Data API (PostgREST through the local gateway) and GraphQL.
# Draft content is written the way it is in production, by the database owner (here docker exec psql as postgres, the SQL editor's
# role), with the author recorded through request.jwt.claim.sub; every DECISION goes through the Data API with a real token.
# Never targets a hosted project: the URL must be 127.0.0.1 / localhost, and no key, token or password is ever printed.
# Usage (from run_api.sh): python3 -I api_tests.py   with SB_ENV_FILE (the local stack's keys, chmod 600) and CTR (db container)
import base64, hashlib, hmac, json, os, subprocess, sys, time, urllib.error, urllib.request, uuid

ENV = dict(l.strip().split("=", 1) for l in open(os.environ["SB_ENV_FILE"]) if "=" in l)
ENV = {k: v.strip().strip('"') for k, v in ENV.items()}
API = ENV["API_URL"].rstrip("/")
if not (API.startswith("http://127.0.0.1:") or API.startswith("http://localhost:")):
    sys.exit("REFUSING: the API URL is not a local address")
ANON = ENV["ANON_KEY"]; PUB = ENV.get("PUBLISHABLE_KEY", "")
CTR = os.environ["CTR"]
PASS = FAIL = 0
def ok(m):
    global PASS; PASS += 1; print("PASS  " + m, flush=True)
def bad(m):
    global FAIL; FAIL += 1; print("FAIL  " + m, flush=True)
def check(cond, label, detail=""):
    (ok if cond else bad)(label + ("" if cond or not detail else "  [" + str(detail)[:300] + "]"))

def sql(q, strict=True):   # as the database owner (postgres), like the SQL editor
    r = subprocess.run(["docker", "exec", "-i", CTR, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                       input=q, capture_output=True, text=True)
    if strict and r.returncode != 0: raise RuntimeError("SQL failed: " + r.stderr.strip()[:400])
    return r.stdout.strip() if r.returncode == 0 else "ERROR: " + r.stderr.strip()

def http(method, path, token=None, body=None, headers=None, apikey=None):
    h = {"apikey": apikey or ANON, "Content-Type": "application/json"}
    if token is not None: h["Authorization"] = "Bearer " + token
    h.update(headers or {})
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r: raw = r.read().decode(); st = r.status
    except urllib.error.HTTPError as e: raw = e.read().decode(); st = e.code
    try: js = json.loads(raw) if raw else None
    except ValueError: js = raw
    return st, js, time.time() - t0

def rpc(fn, args, token=None, **kw): return http("POST", "/rest/v1/rpc/" + fn, token, args, **kw)
def review(token, table, rid, decision, note=""):
    return rpc("ref_review", {"p_table": table, "p_id": rid, "p_decision": decision, "p_note": note}, token)
def code(js): return (js or {}).get("code") if isinstance(js, dict) else None
def msg(js): return (js or {}).get("message", "") if isinstance(js, dict) else str(js)

# ------------------------------------------------ real Supabase Auth users (synthetic addresses, never real people)
RUN = uuid.uuid4().hex[:8]
def signup(name):
    st, js, _ = http("POST", "/auth/v1/signup", body={"email": f"{name}-{RUN}@staging.invalid", "password": "Stg-" + uuid.uuid4().hex})
    if st != 200 or not js.get("access_token"): raise RuntimeError(f"sign-up of {name} failed: {st} {msg(js) or js.get('msg')}")
    return js["access_token"], js["user"]["id"]
users = {n: signup(n) for n in ["player", "editor_app", "ref_editor", "ref_reviewer", "ref_publisher", "owner", "owner2", "legacy_admin"]}
st, js, _ = http("POST", "/auth/v1/signup", body={})
check(st == 200 and js.get("user", {}).get("is_anonymous") is True, "a guest signs in anonymously through real Supabase Auth", (st, js if st != 200 else ""))
users["guest"] = (js["access_token"], js["user"]["id"]) if st == 200 else (None, None)
T = {n: v[0] for n, v in users.items()}; U = {n: v[1] for n, v in users.items()}
n_prof = sql("select count(*) from public.profiles where id in (%s)" % ",".join("'%s'" % u for u in U.values() if u))
check(n_prof == str(sum(1 for u in U.values() if u)), "every new Auth user got a player profile from the (recreated) sign-up trigger", n_prof)
# staff roles, set by the owner in SQL (the Roles tab writes the same column); production role codes plus staging-only ones
sql(f"""update public.profiles set staff_role = 'editor' where id = '{U['editor_app']}';
update public.profiles set staff_role = 'staging_ref_editor' where id = '{U['ref_editor']}';
update public.profiles set staff_role = 'staging_ref_reviewer' where id = '{U['ref_reviewer']}';
update public.profiles set staff_role = 'staging_ref_publisher' where id = '{U['ref_publisher']}';
update public.profiles set staff_role = 'owner' where id in ('{U['owner']}', '{U['owner2']}');
update public.profiles set role = 'admin' where id = '{U['legacy_admin']}';""")
st, js, _ = rpc("my_staff_role_code", {}, T["owner"]); check(st == 200 and js == "owner", "the Owner's real token resolves to staff role owner server-side", (st, js))
st, js, _ = rpc("my_staff_role_code", {}, T["legacy_admin"]); check(st == 200 and js == "owner", "an older account with role 'admin' also resolves to owner (documented rule)", (st, js))
st, js, _ = rpc("my_staff_role_code", {}, T["player"]); check(st == 200 and js is None, "a player's token resolves to no staff role", (st, js))

# ------------------------------------------------ the private schema is not served by the Data API or GraphQL
for who, tok in [("anon", None), ("player", T["player"]), ("owner", T["owner"])]:
    st, js, _ = http("GET", "/rest/v1/entities?select=*", tok, headers={"Accept-Profile": "wine_reference"})
    check(st == 406 and code(js) == "PGRST106", f"Data API refuses the wine_reference schema for reads ({who}: {st} {code(js)})", (st, js))
    st, js, _ = http("POST", "/rest/v1/rpc/editorial_lock", tok, {}, headers={"Content-Profile": "wine_reference"})
    check(st == 406 and code(js) == "PGRST106", f"Data API refuses calls into wine_reference functions ({who})", (st, js))
    st, js, _ = http("GET", "/rest/v1/claim_versions?select=*", tok)
    check(st == 404, f"no reference table appears in the public schema ({who}: {st} {code(js)})", (st, js))
st, js, _ = http("GET", "/rest/v1/", None)
txt = json.dumps(js) if js is not None else ""
check("wine_reference" not in txt and "claim_versions" not in txt, f"the Data API description does not mention the reference tables (HTTP {st})", st)
gql = '{ __schema { types { name } queryType { fields { name } } } }'
st, js, _ = http("POST", "/graphql/v1", None, {"query": gql})
names = json.dumps(js).lower()
check(st == 200 and not any(w in names for w in ["claimversion", "claim_versions", "entitynames", "wine_reference", "reviewevent"]),
      f"GraphQL (pg_graphql) exposes no reference type to visitors (HTTP {st})", st)
st, js, _ = http("POST", "/graphql/v1", T["owner"], {"query": gql})
names = json.dumps(js).lower()
check(st == 200 and not any(w in names for w in ["claimversion", "claim_versions", "entitynames", "wine_reference", "reviewevent"]),
      "GraphQL exposes no reference type to the Owner's token either", st)

# ------------------------------------------------ the two doors: who may call them
st, js, _ = rpc("ref_published_names", {"p_query": None}, None)
check(st == 200 and js == [], "a signed-out visitor may call ref_published_names (empty while reference_enabled is 0)", (st, js))
if PUB:
    st, js, _ = rpc("ref_published_names", {}, None, apikey=PUB)
    check(st == 200 and js == [], "the same works with the publishable key (sb_publishable_...)", (st, js))
st, js, _ = review(None, "entities", str(uuid.uuid4()), "submit")
check(st in (401, 403) and code(js) == "42501", f"a signed-out visitor cannot call ref_review (HTTP {st}, {code(js)})", (st, js))
for who in ["guest", "player", "editor_app"]:
    st, js, _ = review(T[who], "entities", str(uuid.uuid4()), "submit")
    check(st == 403 and "needs ref_edit" in msg(js), f"{who} (no ref_* permission) is refused by ref_review: {msg(js)}", (st, js))
for fn in ["has_permission", "cfg_number"]:
    pass
st, js, _ = rpc("has_permission", {"p_perm": "ref_publish"}, T["player"]); check(st == 200 and js is False, "has_permission('ref_publish') is false for a player", (st, js))

# ------------------------------------------------ privilege escalation attempts through the API
def prof(uid, col): return sql(f"select coalesce({col}::text, '<null>') from public.profiles where id = '{uid}'")
for body, label in [({"staff_role": "owner"}, "staff_role to owner"), ({"role": "admin"}, "role to admin"), ({"tier": "pro"}, "tier to pro"),
                    ({"display_name": "x", "staff_role": "owner"}, "display_name together with staff_role")]:
    st, js, _ = http("PATCH", f"/rest/v1/profiles?id=eq.{U['player']}", T["player"], body)
    check(st in (401, 403) and code(js) == "42501", f"a player cannot set their own {label} (HTTP {st} {code(js)})", (st, js))
check(prof(U["player"], "staff_role") == "<null>" and prof(U["player"], "role") == "player", "the player's role columns are unchanged after the attempts")
st, js, _ = http("PATCH", f"/rest/v1/profiles?id=eq.{U['player']}", T["player"], {"display_name": "Staging tester"}, headers={"Prefer": "return=minimal"})
check(st == 204 and prof(U["player"], "display_name") == "Staging tester", "a player may still change their own display name", (st, js))
st, js, _ = http("PATCH", f"/rest/v1/profiles?id=eq.{U['owner']}", T["player"], {"display_name": "hijack"}, headers={"Prefer": "return=representation"})
check(st == 200 and js == [] and prof(U["owner"], "display_name") != "hijack", "a player cannot change another person's profile (row security: 0 rows)", (st, js))
st, js, _ = http("PATCH", f"/rest/v1/profiles?id=eq.{U['player']}", None, {"staff_role": "owner"}, headers={"Prefer": "return=representation"})
check(prof(U["player"], "staff_role") == "<null>", f"the anon key (table-level UPDATE on profiles, as on production) changes no profile (HTTP {st}, rows {js})", (st, js))
st, js, _ = http("POST", "/rest/v1/profiles", T["player"], {"id": str(uuid.uuid4()), "staff_role": "owner"})
check(st in (401, 403) and code(js) == "42501", f"a player cannot insert a profile with a staff role (HTTP {st} {code(js)})", (st, js))
st, js, _ = http("PATCH", "/rest/v1/staff_roles?code=eq.editor", T["player"], {"permissions": ["ref_edit", "ref_review", "ref_publish", "ref_rights"]}, headers={"Prefer": "return=representation"})
perms = sql("select array_to_string(permissions, ',') from public.staff_roles where code = 'editor'")
check("ref_" not in perms, f"a player cannot add ref_* permissions to a role definition (HTTP {st})", (st, js))
st, js, _ = http("PATCH", "/rest/v1/staff_roles?code=eq.editor", T["owner"], {"permissions": ["ref_edit"]}, headers={"Prefer": "return=representation"})
perms = sql("select array_to_string(permissions, ',') from public.staff_roles where code = 'editor'")
check("ref_" not in perms, f"even the Owner's token cannot rewrite role definitions through the Data API (HTTP {st}; done in SQL only)", (st, js))
st, js, _ = rpc("set_config", {"setting_name": "request.jwt.claim.sub", "new_value": U["owner"], "is_local": True}, T["player"])
check(st == 404, f"set_config is not callable through the Data API (HTTP {st})", (st, js))
# forged tokens
def b64(x): return base64.urlsafe_b64encode(json.dumps(x).encode() if not isinstance(x, bytes) else x).rstrip(b"=").decode()
now = int(time.time()); claims = {"sub": U["player"], "role": "authenticated", "aud": "authenticated", "iat": now, "exp": now + 600, "iss": API + "/auth/v1"}
def hs256(c, key): h = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64(c); return h + "." + base64.urlsafe_b64encode(hmac.new(key, h.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
forged = {
  "signed with a wrong secret, sub = the Owner": hs256(dict(claims, sub=U["owner"]), os.urandom(32)),
  "signed with a wrong secret, role = service_role": hs256(dict(claims, role="service_role"), os.urandom(32)),
  "alg none, sub = the Owner": b64({"alg": "none", "typ": "JWT"}) + "." + b64(dict(claims, sub=U["owner"])) + ".",
  "a real token with its payload changed to the Owner": (lambda p: p[0] + "." + b64(dict(json.loads(base64.urlsafe_b64decode(p[1] + "==")), sub=U["owner"])) + "." + p[2])(T["player"].split(".")),
}
for label, tok in forged.items():
    st, js, _ = review(tok, "entities", str(uuid.uuid4()), "submit")
    check(st == 401, f"forged token refused by the Data API ({label}): HTTP {st}", (st, js))

# ------------------------------------------------ drafts written by the owner in SQL (as each author), decisions through the API
ID = {k: str(uuid.uuid4()) for k in ["S", "Rq", "Rnq", "V", "Vb", "X", "Y", "Z", "W", "Q", "nX", "nY", "nZ", "nW", "nQ", "nXold", "nXfut", "nXu", "nO2",
                                       "K", "F", "K2", "H", "KG", "G", "KG2", "G2", "KG3", "G3", "KG4", "G4", "Vd"]}
def as_author(who, body): return sql(f"select set_config('request.jwt.claim.sub', '{U[who]}', false);\n" + body)
sql("update wine_reference.relationship_types set status = 'active' where code = 'part_of';")
as_author("ref_editor", f"""
insert into wine_reference.sources (id, kind, title) values ('{ID['S']}', 'publication', 'Staging source');
insert into wine_reference.rights_statements (id, licence_code, allows_quote) values ('{ID['Rq']}', 'staging-quote', true), ('{ID['Rnq']}', 'staging-no-quote', false);
insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values ('{ID['V']}', '{ID['S']}', 'v1', '{ID['Rq']}'), ('{ID['Vb']}', '{ID['S']}', 'v2', '{ID['Rq']}');
insert into wine_reference.entities (id, kind) values ('{ID['X']}', 'place'), ('{ID['Y']}', 'place'), ('{ID['W']}', 'place'), ('{ID['Q']}', 'place');
insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred, valid_from, valid_to) values
  ('{ID['nX']}', '{ID['X']}', 'Staging Place X', 'en', 'common', true, null, null),
  ('{ID['nXold']}', '{ID['X']}', 'Old Name X', 'en', 'historical', false, '1990-01-01', current_date - 1),
  ('{ID['nXfut']}', '{ID['X']}', 'Future Name X', 'en', 'official', false, current_date + 1, null),
  ('{ID['nY']}', '{ID['Y']}', 'Staging Place Y', 'en', 'common', true, null, null),
  ('{ID['nW']}', '{ID['W']}', 'Ended Place W', 'en', 'common', true, '1990-01-01', current_date - 1),
  ('{ID['nQ']}', '{ID['Q']}', 'Staging Place Q', 'en', 'common', true, null, null);
insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
  ('{ID['K']}', '{ID['X']}', 'part_of', '{ID['Y']}'), ('{ID['K2']}', '{ID['Q']}', 'part_of', '{ID['Y']}');
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('{ID['F']}', '{ID['K']}', 1, 2), ('{ID['H']}', '{ID['K2']}', 1, 2);
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('{ID['F']}', '{ID['V']}', 'documentary', 'p. 1'), ('{ID['H']}', '{ID['Vb']}', 'documentary', 'p. 2');
insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('{ID['H']}', '{ID['F']}');
""")
E, R, P, O = T["ref_editor"], T["ref_reviewer"], T["ref_publisher"], T["owner"]
def all_ok(results): return all(st == 200 for st, js, _ in results), [(st, msg(js)) for st, js, _ in results if st != 200]
subs = [review(E, "sources", ID["S"], "submit")] + [review(E, "rights_statements", ID[k], "submit") for k in ["Rq", "Rnq"]] + \
       [review(E, "source_versions", ID[k], "submit") for k in ["V", "Vb"]] + [review(E, "entity_names", ID[k], "submit") for k in ["nX", "nXold", "nXfut", "nY", "nW", "nQ"]] + \
       [review(E, "entities", ID[k], "submit") for k in ["X", "Y", "W", "Q"]] + [review(E, "claim_versions", ID[k], "submit") for k in ["F", "H"]]
good, errs = all_ok(subs); check(good, f"Editor (ref_edit) submits {len(subs)} drafts through the Data API", errs)
st, js, _ = review(E, "sources", ID["S"], "approve"); check(st == 403 and "needs ref_review" in msg(js), "Editor without ref_review cannot approve", (st, js))
st, js, _ = review(R, "rights_statements", ID["Rq"], "approve"); check(st == 403 and "needs ref_rights" in msg(js), "Reviewer without ref_rights cannot approve a rights statement", (st, js))
st, js, _ = review(R, "source_versions", ID["V"], "approve"); check(st == 400 and "Approve the source before" in msg(js), "a source version is not approved before its source", (st, js))
dec = [review(R, "sources", ID["S"], "approve")] + [review(P, "rights_statements", ID[k], "approve") for k in ["Rq", "Rnq"]] + \
      [review(R, "source_versions", ID[k], "approve") for k in ["V", "Vb"]] + [review(R, "entity_names", ID[k], "approve") for k in ["nX", "nXold", "nXfut", "nY", "nW", "nQ"]] + \
      [review(R, "entities", ID[k], "approve") for k in ["X", "Y", "W", "Q"]] + [review(R, "claim_versions", ID[k], "approve") for k in ["F", "H"]]
good, errs = all_ok(dec); check(good, f"Reviewer (ref_review) and Publisher (ref_rights) approve {len(dec)} rows written by someone else", errs)
st, js, _ = review(R, "entities", ID["X"], "publish"); check(st == 403 and "needs ref_publish" in msg(js), "Reviewer without ref_publish cannot publish", (st, js))
st, js, _ = review(P, "claim_versions", ID["F"], "publish"); check(st == 400 and "Cannot publish this claim version" in msg(js), f"a claim version is not published before its subject and object: {msg(js)[:90]}", (st, js))
pub = [review(P, "entities", ID[k], "publish") for k in ["X", "Y", "Q"]]
good, errs = all_ok(pub); check(good, "Publisher publishes the entities", errs)
st, js, _ = review(P, "entities", ID["W"], "publish")
check(st == 400 and "current display name" in msg(js), "an entity whose only display name has ended cannot be published (no current display name)", (st, js))
st, js, _ = review(P, "claim_versions", ID["H"], "publish"); check(st == 400 and "depends on" in msg(js), "a dependent version is not published before the version it depends on", (st, js))
pub = [review(P, "claim_versions", ID["F"], "publish"), review(P, "claim_versions", ID["H"], "publish")]
good, errs = all_ok(pub); check(good, "Publisher publishes F, then H (which depends on F)", errs)
ev = sql("select count(*) || ' ' || count(*) filter (where owner_override) from wine_reference.review_events")
check(ev.split()[1] == "0", f"none of these decisions is marked owner_override ({ev.split()[0]} review events)", ev)

# read door: names valid today only; nothing while the switch is off
sql("insert into public.app_config (key, value) values ('reference_enabled', '1') on conflict (key) do update set value = '1';")
st, js, _ = rpc("ref_published_names", {"p_query": "Name X"}, None)
st2, js2, _ = rpc("ref_published_names", {"p_query": "Staging Place"}, None)
got = sorted(r["name"] for r in (js or []) + (js2 or []))
check(st == 200 and js == [], "read door (LOCAL switch on): the ended name 'Old Name X' and the future name 'Future Name X' are not returned", (st, js))
check(st2 == 200 and got == ["Staging Place Q", "Staging Place X", "Staging Place Y"], "read door returns the published entities' current names to a signed-out visitor", got)
st, js, _ = rpc("ref_published_names", {"p_query": "Ended Place"}, None)
check(st == 200 and js == [], "read door: the unpublished entity whose only name has ended is not returned", (st, js))
sql("update public.app_config set value = '0' where key = 'reference_enabled';")
st, js, _ = rpc("ref_published_names", {"p_query": "Staging"}, T["owner"])
check(st == 200 and js == [], "read door returns nothing once the switch is back at 0 (even to the Owner)", (st, js))

# ------------------------------------------------ the Owner override, its limits, and its revocation
as_author("owner", f"""
insert into wine_reference.entities (id, kind) values ('{ID['Z']}', 'place');
insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred) values ('{ID['nZ']}', '{ID['Z']}', 'Owner Place Z', 'en', 'common', true);
insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values ('{ID['Vd']}', '{ID['S']}', 'v-draft', '{ID['Rq']}');
insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
  ('{ID['KG']}', '{ID['Z']}', 'part_of', '{ID['Y']}'), ('{ID['KG2']}', '{ID['Z']}', 'part_of', '{ID['X']}'),
  ('{ID['KG3']}', '{ID['Q']}', 'part_of', '{ID['X']}'), ('{ID['KG4']}', '{ID['Z']}', 'part_of', '{ID['Q']}');
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values
  ('{ID['G']}', '{ID['KG']}', 1, 2), ('{ID['G2']}', '{ID['KG2']}', 1, 2), ('{ID['G3']}', '{ID['KG3']}', 1, 2), ('{ID['G4']}', '{ID['KG4']}', 1, 2);
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('{ID['G4']}', '{ID['V']}', 'documentary', 'p. 4');
""")
# evidence that should never let a version be published: each written separately, since a trigger may already refuse it on insert
ins_g2 = sql(f"select set_config('request.jwt.claim.sub', '{U['owner']}', false); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('{ID['G2']}', '{ID['Vd']}', 'documentary', 'p. 9');", strict=False)
ins_g3 = sql(f"select set_config('request.jwt.claim.sub', '{U['owner']}', false); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote, quote_rights_id) values ('{ID['G3']}', '{ID['V']}', 'documentary', 'p. 3', 'a quote', '{ID['Rnq']}');", strict=False)
print("      evidence from a draft source version on insert: " + ("refused: " + ins_g2[:90] if ins_g2.startswith("ERROR") else "accepted (checked at publication)"))
print("      a quote under rights that forbid quoting, on insert: " + ("refused: " + ins_g3.split("ERROR:")[-1].strip()[:90] if ins_g3.startswith("ERROR") else "accepted (checked at publication)"))
steps = [review(O, "entity_names", ID["nZ"], "submit"), review(O, "entities", ID["Z"], "submit")]
good, errs = all_ok(steps); check(good, "the Owner submits their own drafts", errs)
st, js, _ = review(O, "entity_names", ID["nZ"], "approve", "owner checked"); st2, js2, _ = review(O, "entities", ID["Z"], "approve")
check(st == 200 and st2 == 200, "the Owner approves their own work through the Data API (override)", (st, js, st2, js2))
ov = sql(f"select count(*) from wine_reference.review_events where target_id in ('{ID['nZ']}', '{ID['Z']}') and decision = 'approve' and owner_override and actor = '{U['owner']}'")
check(ov == "2", "each self-approval is recorded in review_events with owner_override = true and the Owner as actor", ov)
st, js, _ = review(O, "entities", ID["Z"], "publish"); check(st == 200, "the Owner publishes Z (publishing is not a self-approval)", (st, js))
for k in ["G", "G2", "G3", "G4"]: review(O, "claim_versions", ID[k], "submit"); review(O, "claim_versions", ID[k], "approve")
st, js, _ = review(O, "claim_versions", ID["G"], "publish"); check(st == 400 and "evidence" in msg(js).lower(), f"override does not bypass evidence: a self-approved version with no evidence is not published ({msg(js)[:80]})", (st, js))
st, js, _ = review(O, "claim_versions", ID["G2"], "publish"); check(st == 400, f"override does not bypass source verification: evidence from an unapproved source version blocks publication ({msg(js)[:80]})", (st, js))
st, js, _ = review(O, "claim_versions", ID["G3"], "publish")
check(st == 400 or ins_g3.startswith("ERROR"), f"override does not bypass rights: a quote under rights that forbid quoting never reaches publication ({msg(js)[:80]})", (st, js))
st, js, _ = review(O, "claim_versions", ID["G4"], "publish"); check(st == 200, "a sound self-approved version is published normally (the checks are not over-strict)", (st, js))
# evidence lifecycle and transitive suspension through the API
st, js, _ = review(P, "source_versions", ID["V"], "retire"); check(st == 200, "Publisher retires source version V (the evidence of F and G4)", (st, js))
sus = sql(f"select string_agg((suspended_at is not null)::text, ',' order by id) from wine_reference.claim_versions where id in ('{ID['F']}', '{ID['H']}', '{ID['G4']}')")
check(sus == "true,true,true", "retiring V suspended F and G4 (evidence) and, transitively, H (depends on F)", sus)
cur = sql(f"select count(*) from wine_reference.current_claim_versions where id in ('{ID['F']}', '{ID['H']}', '{ID['G4']}')")
check(cur == "0", "none of the suspended versions is current any more", cur)
ev = sql(f"select count(*) from wine_reference.review_events where decision = 'suspend' and target_id in ('{ID['F']}', '{ID['H']}', '{ID['G4']}')")
check(ev == "3", "each automatic suspension is recorded in review_events", ev)
st, js, _ = review(P, "claim_versions", ID["F"], "publish"); check(st == 400, f"a suspended version cannot be published again ({msg(js)[:70]})", (st, js))
r = sql(f"update wine_reference.claim_versions set suspended_at = null, suspended_reason = null where id = '{ID['F']}';", strict=False)
check(r.startswith("ERROR"), "a suspension cannot be lifted, even by the database owner in SQL", r[:120])
st, js, _ = review(P, "claim_versions", ID["F"], "retire"); check(st == 200, "a suspended version may still be retired (taken out for good)", (st, js))
st, js, _ = review(P, "claim_versions", ID["F"], "publish"); check(st == 400, f"a suspended, retired version is never published again ({msg(js)[:60]})", (st, js))
st, js, _ = review(O, "source_versions", ID["Vd"], "submit"); review(P, "rights_statements", ID["Rq"], "retire")
st, js, _ = review(O, "source_versions", ID["Vd"], "approve"); check(st == 400 and "rights statement" in msg(js), f"override does not bypass rights: a source version under retired rights is not approved ({msg(js)[:80]})", (st, js))
# a non-owner cannot self-approve; revocation ends the override at once (same token)
as_author("ref_publisher", f"insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values ('{ID['nXu']}', '{ID['X']}', 'Publisher label X', 'en', 'label');")
review(P, "entity_names", ID["nXu"], "submit"); st, js, _ = review(P, "entity_names", ID["nXu"], "approve")
check(st == 403 and "author cannot approve" in msg(js), "a Publisher (all ref_* permissions, not Owner) cannot approve their own row", (st, js))
as_author("owner2", f"insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values ('{ID['nO2']}', '{ID['Y']}', 'Owner2 label Y', 'en', 'label');")
st, js, _ = review(T["owner2"], "entity_names", ID["nO2"], "submit"); check(st == 200, "second Owner submits a draft", (st, js))
sql(f"update public.profiles set staff_role = 'staging_ref_publisher' where id = '{U['owner2']}';")
st, js, _ = review(T["owner2"], "entity_names", ID["nO2"], "approve")
check(st == 403 and "author cannot approve" in msg(js), "revoked Owner (now a Publisher), SAME unexpired token: self-approval refused at once", (st, js))
sql(f"update public.profiles set staff_role = null where id = '{U['owner2']}';")
st, js, _ = review(T["owner2"], "entity_names", ID["nO2"], "approve")
check(st == 403 and "needs ref_review" in msg(js), "revoked Owner with no staff role: every decision refused at once", (st, js))
ov = sql(f"select count(*) from wine_reference.review_events where actor = '{U['owner2']}' and decision = 'approve'")
check(ov == "0", "no approval was recorded for the revoked Owner", ov)
st, js, _ = review(T["legacy_admin"], "entity_names", ID["nO2"], "approve")
check(st == 200, "an older account with role 'admin' (owner by the documented rule) may approve another's row", (st, js))

# ------------------------------------------------ audit history cannot be changed, even by the database owner
r = sql("update wine_reference.review_events set note = 'changed' where true;", strict=False)
check(r.startswith("ERROR"), "review_events cannot be updated, even by the database owner", r[:120])
r = sql("delete from wine_reference.change_log where true;", strict=False)
check(r.startswith("ERROR"), "change_log cannot be deleted, even by the database owner", r[:120])
r = sql(f"update wine_reference.entity_names set name = 'Edited' where id = '{ID['nX']}';", strict=False)
check(r.startswith("ERROR"), "an approved name cannot be edited in place (frozen), even by the database owner", r[:120])
r = sql(f"update wine_reference.entities set status = 'draft' where id = '{ID['X']}';", strict=False)
check(r.startswith("ERROR"), "a status cannot be changed outside ref_review, even by the database owner", r[:120])

# ------------------------------------------------ direct SQL with the claims PostgREST sets (request.jwt.claims), browser roles
def as_role(role, uid, stmt):
    claims = json.dumps({"sub": uid, "role": role}) if uid else json.dumps({"role": role})
    return sql(f"begin; set local role {role}; select set_config('request.jwt.claims', '{claims}', true); {stmt}; rollback;", strict=False)
for role, uid in [("anon", None), ("authenticated", U["player"]), ("authenticated", U["owner"])]:
    for stmt in [f"select count(*) from wine_reference.entities", f"insert into wine_reference.entities (kind) values ('place')", "select wine_reference.editorial_lock()",
                 "select * from wine_reference.current_claim_versions"]:
        r = as_role(role, uid, stmt)
        check("permission denied" in r, f"direct SQL as {role}{' (Owner)' if uid == U['owner'] else ''}: '{stmt[:48]}' refused", r[:120])
r = as_role("authenticated", U["owner"], f"select public.ref_review('entity_names', '{ID['nXu']}', 'reject')")
check("draft" in r and "ERROR" not in r, "direct SQL with request.jwt.claims (no claim.sub) still identifies the Owner in ref_review", r[:160])

# ------------------------------------------------ a waiting decision is bounded by the API roles' timeouts
# the draft is written BEFORE the lock is held (with patch P1 a direct write itself waits for the editorial lock)
nT = str(uuid.uuid4())
as_author("ref_editor", f"insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values ('{nT}', '{ID['Q']}', 'Timeout label Q', 'en', 'label');")
holder = subprocess.Popen(["docker", "exec", "-i", CTR, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres"], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
holder.stdin.write("begin; select wine_reference.editorial_lock(); select pg_sleep(14); commit;\n"); holder.stdin.flush(); time.sleep(1.0)
st, js, dt = review(E, "entity_names", nT, "submit")
check(st >= 400 and code(js) in ("55P03", "57014") and dt < 10.5, f"a decision waiting for the editorial lock is cut off by the API timeouts ({code(js)} after {dt:.1f}s; authenticator lock_timeout 8s)", (st, js, dt))
holder.stdin.close(); holder.wait(timeout=30)
st, js, dt = review(E, "entity_names", nT, "submit")
check(st == 200, f"after the lock is released the same decision goes through ({dt:.2f}s)", (st, js))

print(f"\nSUPABASE API TOTAL: {PASS} passed, {FAIL} failed  (real local Auth users: {len([u for u in U.values() if u])}, Data API {API.split(':')[0]}://local)")
sys.exit(0 if FAIL == 0 else 1)
