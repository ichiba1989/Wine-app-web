#!/usr/bin/env python3
# STAGING ONLY (Phase 2.0B.6). Anonymous-access tests on the disposable LOCAL Supabase stack, through the real gateway, PostgREST and
# GoTrue (sign-up, anonymous sign-in, real tokens). Run by run_anon_tests.sh in three phases on the same database:
#   before  = the documented live state (Supabase defaults; profiles as docs/import_limit.sql describes them)
#   after   = after anon_hardening_up.sql
#   rolled  = after anon_hardening_rollback.sql (must behave exactly like "before")
# Prints PASS / FAIL lines. Never targets a hosted project (the URL must be local); never prints a key or token. Synthetic users only.
# Usage: CTR=<db container> SB_ENV_FILE=<local keys> python3 -I anon_api_tests.py <phase>
import json, os, subprocess, sys, time, urllib.error, urllib.request, uuid

PHASE = sys.argv[1]; assert PHASE in ("before", "after", "rolled")
HARD = PHASE == "after"   # the hardening is in place
ENV = {k: v.strip().strip('"') for k, v in (l.strip().split("=", 1) for l in open(os.environ["SB_ENV_FILE"]) if "=" in l)}
API = ENV["API_URL"].rstrip("/")
if not (API.startswith("http://127.0.0.1:") or API.startswith("http://localhost:")): sys.exit("REFUSING: not a local API URL")
ANON = ENV["ANON_KEY"]; CTR = os.environ["CTR"]
PASS = FAIL = 0
def check(cond, label, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"PASS  [{PHASE}] {label}", flush=True)
    else: FAIL += 1; print(f"FAIL  [{PHASE}] {label}  [{str(detail)[:300]}]", flush=True)
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
def rpc(fn, args, token=None): return http("POST", "/rest/v1/rpc/" + fn, token, args)
msg = lambda js: (js or {}).get("message", "") if isinstance(js, dict) else str(js)
code = lambda js: (js or {}).get("code") if isinstance(js, dict) else None
denied = lambda st, js, what: st in (401, 403) and code(js) == "42501" and ("permission denied for " + what) in msg(js)

RUN = PHASE + "-" + uuid.uuid4().hex[:6]
def signup(name):
    st, js = http("POST", "/auth/v1/signup", body={"email": f"{name}-{RUN}@staging.invalid", "password": "Stg-" + uuid.uuid4().hex})
    assert st == 200 and js.get("access_token"), (st, js)
    return js["access_token"], js["user"]["id"], f"{name}-{RUN}@staging.invalid"
def prof(uid, col): return sql(f"select coalesce({col}::text, '<null>') from public.profiles where id = '{uid}'")

# ---------------------------------------------------------------- 1. public browsing by a signed-out visitor (the first visit's early reads)
for path, label in [("/rest/v1/v_catalog_cards?select=*", "v_catalog_cards"), ("/rest/v1/wine_vintages?select=id,wine_id", "wine_vintages"),
                    ("/rest/v1/wine_reference_values?select=id", "wine_reference_values"), ("/rest/v1/flavor_varietals?select=key,label,type,shape,weights", "flavor_varietals"),
                    ("/rest/v1/flavor_regions?select=key,country,name,kind,lat,lon,nudges", "flavor_regions"), ("/rest/v1/grape_aliases?select=*&order=id", "grape_aliases"),
                    ("/rest/v1/producer_aliases?select=*,producers(name)&order=id", "producer_aliases (with producers)"), ("/rest/v1/place_designation_rules?select=*&order=id", "place_designation_rules"),
                    ("/rest/v1/broad_places?select=*&order=id", "broad_places")]:
    st, js = http("GET", path)
    check(st == 200 and isinstance(js, list), f"signed-out visitor can read {label} (HTTP {st}, {len(js) if isinstance(js, list) else '-'} rows)", (st, js))
st, js = http("GET", "/rest/v1/v_catalog_cards?select=wine_name")
check(st == 200 and len(js) >= 1 and all(r["wine_name"] != "Stand-in draft wine" for r in js), "the visitor sees published wines only (row security unchanged)", js)
st, js = rpc("has_permission", {"p_perm": "settings_edit"})
check(st == 200 and js is False, "has_permission() stays callable by anon (the reference lists' policies call it on every read)", (st, js))

# ---------------------------------------------------------------- 2. profiles and a signed-out visitor
OWNER_T, OWNER_U, OWNER_E = signup("owner"); sql(f"update public.profiles set staff_role = 'owner' where id = '{OWNER_U}'")
st, js = http("GET", "/rest/v1/profiles?select=*")
if HARD: check(denied(st, js, "table profiles"), f"anon cannot read profiles (HTTP {st}: {msg(js)[:60]})", (st, js))
else: check(st == 200 and js == [], f"BASELINE: anon may query profiles (grant present; row security returns 0 rows) (HTTP {st})", (st, js))
st, js = http("PATCH", f"/rest/v1/profiles?id=eq.{OWNER_U}", None, {"staff_role": None, "display_name": "x"}, {"Prefer": "return=representation"})
check(prof(OWNER_U, "staff_role") == "owner", f"anon update of a profile changes nothing (HTTP {st})", (st, js))
if HARD: check(denied(st, js, "table profiles"), "anon update of profiles is refused by privilege, not only by row security", (st, js))
st, js = http("POST", "/rest/v1/profiles", None, {"id": str(uuid.uuid4()), "staff_role": "owner"})
check(st in (401, 403) and code(js) == "42501", f"anon insert into profiles refused (HTTP {st}: {msg(js)[:60]})", (st, js))
if HARD: check("permission denied for table profiles" in msg(js), "... by privilege", js)
st, js = http("DELETE", f"/rest/v1/profiles?id=eq.{OWNER_U}", None, None, {"Prefer": "return=representation"})
check(prof(OWNER_U, "id") == OWNER_U, f"anon delete of a profile changes nothing (HTTP {st})", (st, js))
if HARD: check(denied(st, js, "table profiles"), "... refused by privilege", (st, js))
# direct SQL as the browser roles, each in a transaction that is rolled back (so nothing is lost even where it would succeed)
def as_role(role, stmt, sub=None):
    c = json.dumps({"role": role, **({"sub": sub} if sub else {})})
    return sql(f"begin; set local role {role}; select set_config('request.jwt.claims', '{c}', true); {stmt}; rollback;", strict=False)
for role, sub in [("anon", None), ("authenticated", OWNER_U)]:
    r = as_role(role, "truncate public.profiles", sub)
    if HARD: check("permission denied" in r, f"direct SQL: {role} cannot TRUNCATE profiles", r[:120])
    else: check(not r.startswith("ERROR"), f"BASELINE FINDING: {role} CAN truncate profiles in direct SQL (row security does not apply to TRUNCATE; rolled back, no API route)", r[:120])
r = as_role("anon", "truncate public.consumptions")
if HARD: check("permission denied" in r, "direct SQL: anon cannot TRUNCATE another player table (consumptions)", r[:120])
else: check(not r.startswith("ERROR"), "BASELINE FINDING: anon CAN truncate a player table (consumptions) in direct SQL (rolled back)", r[:120])
r = as_role("anon", "lock table public.staff_roles in access exclusive mode")
if HARD: check(not r.startswith("ERROR"), "REMAINING RISK (recorded): anon can still LOCK a table in direct SQL, through its default UPDATE/DELETE grants (closed only by the anon-writes proposal, ANON_ACCESS_AUDIT.md section 6)", r[:120])
else: check(not r.startswith("ERROR"), "BASELINE FINDING: anon CAN lock any public table in direct SQL (MAINTAIN, PostgreSQL 17; rolled back)", r[:120])
check(sql("select count(*) from public.profiles") != "0", "every rolled-back TRUNCATE left the profiles in place")
for priv in ["REFERENCES", "TRIGGER", "MAINTAIN"]:   # MAINTAIN exists from PostgreSQL 17 (the local stack is 17.11)
    v = sql(f"select has_table_privilege('anon', 'public.profiles', '{priv}')::text || has_table_privilege('anon', 'public.consumptions', '{priv}')::text")
    check(v == ("falsefalse" if HARD else "truetrue"), f"anon {priv} on profiles and consumptions: {'none' if HARD else 'present (Supabase default)'}", v)
# release 2: signed-in users lose the same table privileges; sequences; default privileges for future objects
r = as_role("authenticated", "truncate public.consumptions", OWNER_U)
if HARD: check("permission denied" in r, "direct SQL: authenticated cannot TRUNCATE a player table (consumptions)", r[:120])
else: check(not r.startswith("ERROR"), "BASELINE FINDING: authenticated CAN truncate a player table in direct SQL (rolled back)", r[:120])
for priv in ["REFERENCES", "TRIGGER", "MAINTAIN"]:
    v = sql(f"select has_table_privilege('authenticated', 'public.consumptions', '{priv}')::text || has_table_privilege('authenticated', 'public.wines', '{priv}')::text")
    check(v == ("falsefalse" if HARD else "truetrue"), f"authenticated {priv} on consumptions and wines: {'none' if HARD else 'present (Supabase default)'}", v)
v = sql("select string_agg(has_sequence_privilege('anon', c.oid, p)::text, ',' order by p) from pg_class c, unnest(array['SELECT','UPDATE','USAGE']) p where c.oid = 'public.grape_aliases_id_seq'::regclass")
check(v == ("false,false,false" if HARD else "true,true,true"), f"anon on sequences (SELECT, UPDATE, USAGE): {'none' if HARD else 'all (Supabase default)'}", v)
v = sql("select has_sequence_privilege('authenticated', 'public.grape_aliases_id_seq', 'UPDATE')::text || ',' || has_sequence_privilege('authenticated', 'public.grape_aliases_id_seq', 'USAGE')::text")
check(v == ("false,true" if HARD else "true,true"), f"authenticated on sequences: UPDATE {'removed' if HARD else 'present'}, USAGE kept", v)
# setval is never undone by a rollback, so the probe only moves the counter forward (to its own next value)
r = as_role("anon", "select setval('public.grape_aliases_id_seq', nextval('public.grape_aliases_id_seq'))")
if HARD: check("permission denied" in r, "direct SQL: anon cannot move a sequence (setval)", r[:120])
else: check(not r.startswith("ERROR"), "BASELINE FINDING: anon CAN move a sequence with setval in direct SQL, and a rollback does not undo it (the probe only moved it forward)", r[:120])
sql("create table public._probe_future (id bigserial primary key, x text); alter table public._probe_future enable row level security;")
v = sql("""select string_agg(g || ':' || p || '=' || has_table_privilege(g, 'public._probe_future', p)::text, ',' order by g, p)
             from unnest(array['anon','authenticated']) g, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p""")
want_anon = {"SELECT": "true", "INSERT": "false" if HARD else "true", "UPDATE": "false" if HARD else "true", "DELETE": "false" if HARD else "true",
             "TRUNCATE": "false" if HARD else "true", "REFERENCES": "false" if HARD else "true", "TRIGGER": "false" if HARD else "true", "MAINTAIN": "false" if HARD else "true"}
want_auth = {"SELECT": "true", "INSERT": "true", "UPDATE": "true", "DELETE": "true", "TRUNCATE": "false" if HARD else "true", "REFERENCES": "false" if HARD else "true",
             "TRIGGER": "false" if HARD else "true", "MAINTAIN": "false" if HARD else "true"}
got = dict(x.split("=") for x in v.split(","))
ok_ = all(got[f"anon:{p}"] == want_anon[p] for p in want_anon) and all(got[f"authenticated:{p}"] == want_auth[p] for p in want_auth)
check(ok_, f"a table created later by postgres gets {'anon SELECT only; authenticated without TRUNCATE/REFERENCES/TRIGGER/MAINTAIN' if HARD else 'all privileges for both (Supabase default)'}", v)
v = sql("select has_sequence_privilege('anon', 'public._probe_future_id_seq', 'USAGE')::text || ',' || has_sequence_privilege('authenticated', 'public._probe_future_id_seq', 'USAGE')::text || ',' || has_sequence_privilege('authenticated', 'public._probe_future_id_seq', 'UPDATE')::text")
check(v == ("false,true,false" if HARD else "true,true,true"), f"a sequence created later: anon {'none' if HARD else 'all'}, authenticated USAGE kept, UPDATE {'removed' if HARD else 'present'}", v)
sql("drop table public._probe_future;")

# ---------------------------------------------------------------- 3. sign-up, guests, and the signed-in person's own profile
PLAYER_T, PLAYER_U, _ = signup("player")
check(prof(PLAYER_U, "role") == "player" and prof(PLAYER_U, "staff_role") == "<null>", "a new sign-up gets a player profile from the sign-up trigger (handle_new_user)")
st, js = http("POST", "/auth/v1/signup", body={})
check(st == 200 and js["user"].get("is_anonymous") is True, "a guest signs in anonymously (the app's first step)", (st, js))
GUEST_T, GUEST_U = js["access_token"], js["user"]["id"]
check(prof(GUEST_U, "role") == "player", "the guest got a profile too")
for who, tok, uid in [("player", PLAYER_T, PLAYER_U), ("guest", GUEST_T, GUEST_U)]:
    st, js = http("GET", f"/rest/v1/profiles?select=*&id=eq.{uid}", tok)
    check(st == 200 and len(js) == 1 and js[0]["id"] == uid, f"{who} reads their own profile (data.js loadProfile)", (st, js))
    st, js = http("GET", "/rest/v1/profiles?select=id", tok)
    check(st == 200 and [r["id"] for r in js] == [uid], f"{who} sees only their own profile row", js)
    now = "2026-11-01T12:00:00Z"
    st, js = http("PATCH", f"/rest/v1/profiles?id=eq.{uid}&select=*", tok, {"age_attested_at": now, "age_attested_rule": "US-21", "consent_version": "test-1", "consent_at": now},
                  {"Prefer": "return=representation", "Accept": "application/vnd.pgrst.object+json"})
    check(st == 200 and js.get("consent_version") == "test-1", f"{who} records age and consent (consent.js acceptConsents)", (st, js))
    st, js = http("PATCH", f"/rest/v1/profiles?id=eq.{uid}", tok, {"display_name": f"{who} name"}, {"Prefer": "return=minimal"})
    check(st == 204 and prof(uid, "display_name") == f"{who} name", f"{who} changes their display name", (st, js))
    for col, val in [("role", "admin"), ("staff_role", "owner"), ("tier", "pro"), ("id", str(uuid.uuid4())), ("created_at", "2000-01-01T00:00:00Z")]:
        st, js = http("PATCH", f"/rest/v1/profiles?id=eq.{uid}", tok, {col: val})
        check(st in (401, 403) and code(js) == "42501", f"{who} cannot change their own {col} (HTTP {st})", (st, js))
    check(prof(uid, "role") == "player" and prof(uid, "staff_role") == "<null>" and prof(uid, "tier") == "default", f"{who}'s role, staff role and tier are unchanged")
    st, js = http("POST", "/rest/v1/profiles", tok, {"id": str(uuid.uuid4())})
    check(st in (401, 403) and code(js) == "42501", f"{who} cannot insert a profile (HTTP {st})", (st, js))
    st, js = http("DELETE", f"/rest/v1/profiles?id=eq.{uid}", tok, None, {"Prefer": "return=representation"})
    check(prof(uid, "id") == uid, f"{who} cannot delete their profile through the API (HTTP {st})", (st, js))
st, js = http("PATCH", f"/rest/v1/profiles?id=eq.{OWNER_U}", PLAYER_T, {"display_name": "hijack"}, {"Prefer": "return=representation"})
check(prof(OWNER_U, "display_name") != "hijack", "a player cannot change someone else's profile", (st, js))
# the player's own data (journal stand-in) still works for a guest
st, js = http("POST", "/rest/v1/consumptions", GUEST_T, {"wine_vintage_id": None}, {"Prefer": "return=representation"})
check(st == 201 and js[0]["user_id"] == GUEST_U, "a guest can still save a journal entry (player tables unchanged)", (st, js))
st, js = http("POST", "/rest/v1/consumptions", None, {"user_id": GUEST_U})
check(st in (401, 403), f"a signed-out visitor cannot save a journal entry (HTTP {st}: {msg(js)[:50]})", (st, js))

# the repository's own player tables (restaurant_visits.sql, this_or_that.sql, note_legend.sql), written by a guest
st, js = http("POST", "/rest/v1/restaurant_visits", GUEST_T, {"occasion": "casual"}, {"Prefer": "return=representation"})
check(st == 201 and js[0]["user_id"] == GUEST_U, "a guest saves a restaurant visit (restaurant_visits.sql)", (st, js))
st, js = http("POST", "/rest/v1/this_or_that_answers", GUEST_T, {"pair_id": "p1", "pair_kind": "food", "choice": "a"}, {"Prefer": "return=representation"})
check(st == 201, "a guest saves a This or That answer (this_or_that.sql, its key trigger runs)", (st, js))
st, js = http("POST", "/rest/v1/note_legend_mine", GUEST_T, {"user_id": GUEST_U, "phrase": "zippy", "field": "acidity", "value": "high"}, {"Prefer": "return=representation"})
check(st == 201, "a guest saves a legend word (note_legend.sql)", (st, js))
st, js = http("POST", "/rest/v1/restaurant_visits", None, {"occasion": "casual"})
check(st in (401, 403), f"a signed-out visitor cannot save a restaurant visit (HTTP {st})", (st, js))

# ---------------------------------------------------------------- 4. staff management, plan switch and the Owner (docs/roles_proposal.sql, unchanged)
st, js = rpc("staff_list", {}, OWNER_T)
check(st == 200 and any(r["user_id"] == OWNER_U and r["role"] == "owner" for r in js), "the Owner lists staff (staff_list)", (st, js))
st, js = rpc("staff_set_role", {"p_email": f"player-{RUN}@staging.invalid", "p_role": "editor"}, OWNER_T)
check(st == 200 and prof(PLAYER_U, "staff_role") == "editor", "the Owner makes the player an Editor (staff_set_role)", (st, js))
st, js = rpc("my_staff_access", {}, PLAYER_T)
check(st == 200 and js.get("role") == "editor", "the new Editor's access reads back as editor", (st, js))
st, js = http("POST", "/rest/v1/grape_aliases", PLAYER_T, {"alias": f"zz-{RUN}", "grape": "Pinot Noir", "kind": "shortcut"}, {"Prefer": "return=representation"})
check(st == 201 and js[0]["id"] >= 1, "the Editor adds a reference-list row (serial id: sequence USAGE kept)", (st, js))
st, js = http("POST", "/rest/v1/grape_aliases", GUEST_T, {"alias": f"yy-{RUN}", "grape": "Pinot Noir", "kind": "shortcut"})
check(st in (401, 403), f"a guest cannot add a reference-list row (HTTP {st})", (st, js))
st, js = rpc("staff_set_role", {"p_email": OWNER_E, "p_role": "editor"}, OWNER_T)
check(st >= 400 and prof(OWNER_U, "staff_role") == "owner", "the Owner role cannot be changed from the app", (st, js))
st, js = rpc("staff_remove", {"p_user_id": PLAYER_U}, OWNER_T)
check(st in (200, 204) and prof(PLAYER_U, "staff_role") == "<null>", "the Owner removes the Editor role (staff_remove)", (st, js))
check(sql("select count(*) from public.staff_audit where target_user_id = '" + PLAYER_U + "'") == "2", "both role changes are in staff_audit")
st, js = rpc("staff_list", {}, PLAYER_T)
check(st >= 400 and "Only the owner" in msg(js), "a player cannot list staff", (st, js))
st, js = rpc("staff_set_role", {"p_email": f"player-{RUN}@staging.invalid", "p_role": "editor"}, GUEST_T)
check(st >= 400 and prof(PLAYER_U, "staff_role") == "<null>", "a guest cannot give roles", (st, js))
st, js = rpc("set_my_plan", {"p_plan": "pro"}, PLAYER_T)
check(st == 200 and prof(PLAYER_U, "tier") == "pro", "a signed-in player switches plan through set_my_plan (the only way to change tier)", (st, js))
sql(f"update public.profiles set tier = 'default' where id = '{PLAYER_U}'")
for fn, args, inner in [("staff_list", {}, "Only the owner"), ("staff_set_role", {"p_email": OWNER_E, "p_role": "editor"}, "Only the owner"),
                        ("staff_remove", {"p_user_id": OWNER_U}, "Only the owner"), ("set_my_plan", {"p_plan": "pro"}, "Sign in first"),
                        ("delete_my_swipe", {"p_wine_vintage_id": str(uuid.uuid4())}, "Not signed in"), ("delete_my_restaurant_visit", {"p_id": 1}, ""),
                        ("legend_candidates", {}, ""), ("my_staff_access", {}, "")]:
    st, js = rpc(fn, args, None)
    if HARD: check(denied(st, js, "function " + fn), f"anon cannot call {fn} (privilege)", (st, js))
    else:
        refused = st >= 400 or js in (None, []) or (isinstance(js, dict) and js.get("role") is None)
        check(refused and (not inner or inner in msg(js) or st >= 400), f"BASELINE: anon CAN call {fn}; the function itself refuses or returns nothing (HTTP {st}: {msg(js)[:40]})", (st, js))
check(prof(OWNER_U, "staff_role") == "owner", "after all the attempts the Owner is still the Owner")

print(f"\nANON API TOTAL [{PHASE}]: {PASS} passed, {FAIL} failed")
sys.exit(0 if FAIL == 0 else 1)
