// Everything that talks to Supabase. Each function takes the client and throws on an error.
import { cardFromRow, buildReview, outsideRow, referenceWrites } from "./logic.js?v=15";
import { BUCKET, newPhotoPath } from "./photos.js?v=5";
import { LEGACY_OF } from "./reactions.js?v=3";
import { overlayStates, overlayJournal, overlayCounts, overlayPerceptions, entryRowOf, isOffline } from "./overlay.js?v=1";

const must = ({ data, error }) => { if (error) throw error; return data; };
// Marks a write as one that may wait in the outbox when there is no connection (offline.js), with a description of what it did (overlay.js). Without the offline layer it changes nothing.
const tag = (q, effect) => (q && typeof q.queue === "function" ? q.queue(effect) : q);
// Deleting in the app only hides things from the player (docs/soft_delete.sql): a row gets deleted_at filled in and stays in the database.
// Reads of those tables skip hidden rows. Until that script has been run the column does not exist, so a read that fails for that reason is repeated without the filter.
const active = async (build) => {
  const r = await build(true);
  return r.error && /deleted_at|column/i.test(String(r.error.message || "")) ? build(false) : r;
};
const onlyActive = (q, on) => (on ? q.is("deleted_at", null) : q);
// Reads every row, 1000 at a time (Supabase returns at most 1000 rows per request).
async function allRows(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await makeQuery().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ---------------------------------------------------------------- sign-in and age gate
// saved: the signed-in person remembered on this phone (offline.js saveSession), used when there is no connection to check with. A brand-new visitor does need one.
export async function ensureUser(sb, saved = null) {
  let session = null;
  try { const r = await sb.auth.getSession(); session = r && r.data && r.data.session; } catch (e) { if (!saved) throw e; }
  if (!session && saved && isOffline()) return saved;
  if (!session) {
    let res;
    try { res = await sb.auth.signInAnonymously(); } catch (e) { if (saved) return saved; throw e; }
    if (res.error) { if (saved && /fetch|network|offline/i.test(String(res.error.message || ""))) return saved; throw res.error; }
    session = res.data.session;
  }
  return session.user;
}
export async function loadProfile(sb, userId) {
  const data = must(await sb.from("profiles").select("*").eq("id", userId).maybeSingle());
  if (!data) throw new Error("No profile row for this user. Check that the on_auth_user_created trigger from the schema exists.");
  return data;
}
// We store that the person attested they are 21 or older, not a birth date.
export async function attestAge(sb, userId) {
  return must(await sb.from("profiles").update({ age_attested_at: new Date().toISOString(), age_attested_rule: "US-21" }).eq("id", userId).select().single());
}

// ---------------------------------------------------------------- reading
export const PHOTO_BUCKET = "wine-images";   // real bottle photos, public to read, editors only to change
export const photoUrl = (sb, path) => (path ? sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl : null);
export async function loadCards(sb) {
  return must(await sb.from("v_catalog_cards").select("*")).map((r) => { const c = cardFromRow(r); c.photo = photoUrl(sb, c.image); c.imageKind = r.image_kind || null; c.imageNote = r.image_note || null; return { ...c, raw: r }; });   // raw: the full catalog row, used by the structure editor
}   // raw: the full catalog row, used by the structure rules
export async function loadStates(sb) {
  const r = await sb.from("v_user_wine_state").select("wine_vintage_id, familiarity, interest, reaction, skip_count, last_swiped_at");
  if (!r.error) return overlayStates(r.data);   // plus what this phone has done that the server has not heard yet (offline.js)
  if (!/reaction|skip_count|column/i.test(String(r.error.message || ""))) throw r.error;
  const r2 = await sb.from("v_user_wine_state").select("wine_vintage_id, familiarity, interest, reaction, last_swiped_at");   // before docs/skip_count.sql is run: the app counts skips itself
  if (!r2.error) return overlayStates(r2.data);
  if (!/reaction|column/i.test(String(r2.error.message || ""))) throw r2.error;
  return overlayStates(must(await sb.from("v_user_wine_state").select("wine_vintage_id, familiarity, interest, last_swiped_at")));   // before docs/reactions.sql is run
}
// The numbers behind likes, dislikes and "I don't know it" (reactions.js setSwipeConfig). Anything missing keeps its default.
export async function loadSwipeConfig(sb) {
  const r = await sb.from("app_config").select("key, value").in("key", ["swipe_like_weight", "swipe_dislike_weight", "unknown_demote_strength", "unknown_teach_every"]);
  return r.error ? [] : r.data;
}
export async function loadJournal(sb) {
  return overlayJournal(must(await sb.from("v_journal_entries").select("*").order("consumed_on", { ascending: false })));
}
export async function loadPerceptions(sb, consumptionId) {
  if (String(consumptionId).startsWith("tmp_")) return overlayPerceptions(consumptionId, []);   // an entry made offline and not uploaded yet
  return overlayPerceptions(consumptionId, must(await sb.from("perceptions").select("dimension_key, value, default_value, adjusted").eq("consumption_id", consumptionId)));
}
export async function countRows(sb) {
  const [s, j] = await Promise.all([
    active((on) => onlyActive(sb.from("encounters").select("id", { count: "exact", head: true }), on)),
    active((on) => onlyActive(sb.from("consumptions").select("id", { count: "exact", head: true }), on)),
  ]);
  return { swipes: s.count || 0, journal: j.count || 0 };
}

// ---------------------------------------------------------------- swiping
// One answer to a wine card: "like", "dislike", "dont_know" or "had" (docs/reactions.sql). "had" also adds the wine to the journal, done together on the server.
// context is a small note of what the deck knew when the wine was shown ({ tier, fam, pref, skip }); it is stored with the answer so the deck can be studied later.
// local (optional, for working offline): { card } the catalog card, and { userId }, used to show a "had it" entry in the Journal until the server has made the real one.
export async function recordReaction(sb, wineVintageId, reaction, context = null, local = {}) {
  const [familiarity, interest] = LEGACY_OF[reaction] || [null, null], at = new Date().toISOString();
  const effects = [{ t: "state", wvid: wineVintageId, row: { reaction, familiarity, interest, last_swiped_at: at } }];
  if (reaction === "had") effects.push({ t: "entry", row: entryRowOf({ id: "tmp_had_" + wineVintageId, userId: local.userId || null, wineVintageId, consumption: { consumed_on: at.slice(0, 10) }, origin: "swipe_up", now: at }) });
  const { error } = await tag(sb.rpc("record_reaction", { p_wine_vintage_id: wineVintageId, p_reaction: reaction, p_context: context }), effects);
  if (error) {
    if (error.code === "PGRST202" || /record_reaction/.test(String(error.message || ""))) throw new Error("The database needs one more update (docs/reactions.sql) before swipes can be saved.");
    throw error;
  }
}
// The old model's swipe, kept so the first version of the deck can still be restored. Not used by the current app.
export async function recordSwipe(sb, wineVintageId, familiarity, interest) {
  const { error } = await sb.rpc("record_swipe", { p_wine_vintage_id: wineVintageId, p_familiarity: familiarity, p_interest: interest });
  if (error) throw error;
}
export async function changeInterest(sb, userId, wineVintageId, interest) {
  must(await sb.from("encounters").insert({ user_id: userId, wine_vintage_id: wineVintageId, event: "interest_change", interest }));
}

// ---------------------------------------------------------------- the journal
// Saves a rating. A new entry is inserted; an existing one is updated. All five structure ratings
// are saved every time. A wine typed in by hand is created first (only now, when the review is saved).
// The journal-row fields of a wine the player typed in (what v_journal_entries would show), for the entry shown while it waits to upload.
const outsideFields = (r) => ({ producer: r.producer || null, wine_name: r.wine_name || null, vintage_year: r.vintage_year ?? null, is_non_vintage: !!r.is_non_vintage, style: r.style || null, country: null, region: r.region_text || null, grape: r.grape_text || null, catalog_style: r.style || null });
// What the rating changed on an existing entry (for the Journal while the change waits to upload).
const patchOf = (c) => ({ consumed_on: c.consumed_on, verdict: c.verdict, purchase_price_cents: c.purchase_price_cents, food: c.food, occasion: c.occasion, notes: c.notes, ...(c.style_override ? { style: c.style_override } : {}) });
export async function saveReview(sb, userId, sheet, today) {
  const { consumption, perceptions } = buildReview(sheet, today);
  let userWineId = sheet.target.userWineId, wineRow = null;
  if (sheet.target.kind === "outside" && !userWineId && !sheet.entryId) {
    wineRow = outsideRow({ ...sheet.target.form, style: sheet.style }, userId);
    userWineId = (await insertUserWine(sb, wineRow)).id;
  } else if (sheet.target.kind === "outside" && userWineId && sheet.style !== sheet.catalogStyle) {
    must(await tag(sb.from("user_wines").update({ style: sheet.style }).eq("id", userWineId)));   // the person owns this wine, so its type is theirs to change
  }
  let id = sheet.entryId;
  if (id) {
    must(await tag(sb.from("consumptions").update(consumption).eq("id", id), { t: "entryPatch", id, patch: patchOf(consumption), perceptions }));
  } else {
    const link = sheet.target.kind === "outside" ? { user_wine_id: userWineId } : { wine_vintage_id: sheet.target.wineVintageId };
    const origin = sheet.target.kind === "outside" ? "manual" : "review";
    const row = { ...consumption, ...link, user_id: userId, origin };
    const effect = { t: "entry", perceptions, row: entryRowOf({ id: "$new", userId, consumption, wineVintageId: link.wine_vintage_id || null, userWineId: link.user_wine_id || null, fields: wineRow ? outsideFields(wineRow) : null, origin }) };
    id = must(await tag(sb.from("consumptions").insert(row).select("id").single(), effect)).id;
  }
  must(await tag(sb.from("perceptions").upsert(perceptions.map((p) => ({ ...p, consumption_id: id })), { onConflict: "consumption_id,dimension_key" })));
  return id;
}
// A hand-typed wine added to the journal with no verdict yet.
// Saves a wine the player typed in. A wine with no producer (an incomplete one) needs docs/incomplete_wines.sql to have been run; say so plainly if it has not.
async function insertUserWine(sb, row) {
  const r = await tag(sb.from("user_wines").insert(row).select("id").single());
  if (r.error && !row.producer && /null value|not-null|producer/i.test(String(r.error.message || ""))) throw new Error("A wine without a producer needs one more database update (docs/incomplete_wines.sql). Add the producer for now.");
  return must(r);
}
export async function addWithoutRating(sb, userId, form, today) {
  const wineRow = outsideRow(form, userId), uw = await insertUserWine(sb, wineRow), consumption = { consumed_on: today };
  const effect = { t: "entry", row: entryRowOf({ id: "$new", userId, userWineId: uw.id, fields: outsideFields(wineRow), consumption, origin: "manual" }) };
  return must(await tag(sb.from("consumptions").insert({ user_id: userId, user_wine_id: uw.id, origin: "manual", consumed_on: today }).select("id").single(), effect)).id;
}

// A note with no complete wine behind it: a journal entry holding the player's words, on a wine with only a name (or nothing yet). It is incomplete until they finish it.
export async function addQuickNote(sb, userId, { wine, notes }, today) {
  const wineRow = outsideRow({ producer: "", wine_name: wine || "", vintage: "", style: "unknown", grape: "", region: "" }, userId), uw = await insertUserWine(sb, wineRow), consumption = { consumed_on: today, notes };
  const effect = { t: "entry", row: entryRowOf({ id: "$new", userId, userWineId: uw.id, fields: outsideFields(wineRow), consumption, origin: "manual" }) };
  return must(await tag(sb.from("consumptions").insert({ user_id: userId, user_wine_id: uw.id, origin: "manual", consumed_on: today, notes }).select("id").single(), effect)).id;
}

// ---------------------------------------------------------------- photos
// Photos sit in a private bucket, so each one is shown through a temporary signed link.
export async function signedUrls(sb, paths) {
  const unique = [...new Set((paths || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(unique, 3600);
  if (error) throw error;
  return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
export async function loadEntryPhotos(sb, consumptionId) {
  const rows = must(await active((on) => onlyActive(sb.from("journal_photos").select("id, storage_path, created_at, share_status").eq("consumption_id", consumptionId), on).order("created_at", { ascending: true })));
  const urls = await signedUrls(sb, rows.map((r) => r.storage_path));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) || null }));
}
// Uploads queued pictures one at a time and returns the ones that failed, so a retry only repeats those.
// With share, each new photo is also offered to the community (catalog wines only). A photo that uploads but cannot be shared stays private:
// that is reported in the list's shareErrors, not as a failed upload.
export async function uploadPhotos(sb, userId, consumptionId, queued, share = false) {
  const failed = []; failed.shareErrors = [];
  for (const p of queued) {
    const path = newPhotoPath(userId);
    try {
      const up = await sb.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const ins = await sb.from("journal_photos").insert({ consumption_id: consumptionId, user_id: userId, storage_path: path }).select("id").single();
      if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw ins.error; }
      if (share) { try { await shareMyPhoto(sb, ins.data.id); } catch (e) { failed.shareErrors.push(e.message || String(e)); } }
    } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  return failed;
}
export async function deletePhotos(sb, existing) {
  const failed = [];
  for (const p of existing) {
    try {
      if (p.status === "submitted" || p.status === "approved") await unshareMyPhoto(sb, p.id);   // taking a photo out of the journal also takes it back from the community
      must(await sb.rpc("delete_my_photo", { p_photo_id: p.id }));   // hides it from the player; the file and the record stay
    } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  return failed;
}

// ---------------------------------------------------------------- sharing journal photos with the community
// Offering a photo: it becomes "submitted" and only editors can see it, until one approves or rejects it. Catalog wines only.
export async function shareMyPhoto(sb, photoId) { return must(await sb.rpc("share_my_photo", { p_photo_id: photoId })); }
// Taking a photo back: the public copies (every vintage it was used for) are deleted first, then the database stops sharing it.
// If a file cannot be removed nothing changes, so the person can try again and a copy is never left public.
export async function unshareMyPhoto(sb, photoId) {
  const rows = must(await sb.from("wine_images").select("storage_path").eq("submission_id", photoId));
  if (rows.length) {
    const r = await sb.storage.from(PHOTO_BUCKET).remove(rows.map((x) => x.storage_path));
    if (r.error) throw r.error;
    if (!r.data || r.data.length < rows.length) throw new Error("The shared copy could not be removed. Nothing was changed, so try again.");
  }
  must(await sb.rpc("unshare_my_photo", { p_photo_id: photoId }));
}
// Before photos or entries are deleted: take back every one that is submitted or live.
export async function withdrawShared(sb, rows) {
  for (const r of rows) if (r.share_status === "submitted" || r.share_status === "approved") await unshareMyPhoto(sb, r.id);
}

// ---------------------------------------------------------------- reviewing shared photos (editors)
// Photos players offered, waiting for a decision. Each has a temporary link to look at it; there is no name, email or note.
export async function loadSubmissions(sb) {
  const rows = must(await sb.rpc("list_photo_submissions"));
  const urls = await signedUrls(sb, rows.map((r) => r.storage_path));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) || null }));
}
// Approving copies the picture into the public bottle photos as a Community photo. With replaceCurrent it becomes the vintage's main photo
// (the photo it replaces is kept as a fallback); without, it is approved but a licensed photo stays on the card.
export async function approveSubmission(sb, sub, replaceCurrent = true) {
  const v = must(await sb.from("wine_vintages").select("wine_id").eq("id", sub.wine_vintage_id).single());
  const dl = await sb.storage.from(BUCKET).download(sub.storage_path);
  if (dl.error) throw dl.error;
  const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const path = `community/${sub.share_token}/${key}.jpg`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, dl.data, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw up.error;
  let rowId = null, prev = [];
  try {
    prev = must(await sb.from("wine_images").select("id").eq("wine_vintage_id", sub.wine_vintage_id).eq("is_primary", true));
    rowId = must(await sb.from("wine_images").insert({ wine_id: v.wine_id, wine_vintage_id: sub.wine_vintage_id, kind: "verified_user", storage_path: path,
      license_note: "Shared by a player", is_primary: false, status: "verified", submission_id: sub.id }).select("id").single()).id;
    if (replaceCurrent) {
      if (prev.length) must(await sb.from("wine_images").update({ is_primary: false }).in("id", prev.map((p) => p.id)));
      must(await sb.from("wine_images").update({ is_primary: true }).eq("id", rowId));
    }
    must(await sb.rpc("decide_photo_submission", { p_id: sub.id, p_decision: "approved" }));
  } catch (e) {
    if (rowId) await sb.from("wine_images").delete().eq("id", rowId);
    if (replaceCurrent && prev.length) await sb.from("wine_images").update({ is_primary: true }).in("id", prev.map((p) => p.id));
    await sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw e;
  }
  return path;
}
export async function rejectSubmission(sb, id) { must(await sb.rpc("decide_photo_submission", { p_id: id, p_decision: "rejected" })); }
// An editor removed a photo that came from a player: take down every copy and mark it so the player sees it was taken down.
export async function takeDownSubmissions(sb, ids) {
  for (const id of [...new Set(ids.filter(Boolean))]) {
    try {
      const rows = must(await sb.from("wine_images").select("storage_path").eq("submission_id", id));
      if (rows.length) await sb.storage.from(PHOTO_BUCKET).remove(rows.map((r) => r.storage_path));
      must(await sb.rpc("decide_photo_submission", { p_id: id, p_decision: "removed" }));
    } catch (_) { /* the photo itself is already gone from this wine; the other copies can be removed from their own vintage */ }
  }
}

// ---------------------------------------------------------------- feedback on a wine card
export async function loadFeature(sb, feature) {
  return must(await sb.from("feature_access").select("feature, all_tiers, tiers").eq("feature", feature).maybeSingle());
}
export async function flagWine(sb, userId, wineVintageId, reason, note) {
  must(await sb.from("content_flags").insert({ user_id: userId, target_type: "wine", wine_vintage_id: wineVintageId, reason, note: note || null }));
}

// ---------------------------------------------------------------- reference structure profiles
export async function loadVintageWines(sb) {
  const rows = await allRows(() => sb.from("wine_vintages").select("id, wine_id"));
  return new Map(rows.map((r) => [r.id, r.wine_id]));
}
// Non-editors only receive published (verified) rows; editors receive everything.
export async function loadReferenceRows(sb) {
  return allRows(() => sb.from("wine_reference_values").select("id, wine_id, wine_vintage_id, dimension_key, value, status"));
}
export async function saveReferences(sb, userId, wineId, values, existingRows) {
  const { inserts, updates } = referenceWrites(values, existingRows, wineId, userId, new Date().toISOString());
  for (const u of updates) must(await sb.from("wine_reference_values").update(u.patch).eq("id", u.id));
  if (inserts.length) must(await sb.from("wine_reference_values").insert(inserts));
}

// ---------------------------------------------------------------- deleting entries and swipes
// Deleting only hides the entry from the player: the database functions mark it deleted and keep everything, photos and their files included
// (docs/soft_delete.sql). Photos the player had shared for the catalog are taken back first; if that fails nothing else changes.
export async function deleteJournalEntry(sb, consumptionId) {
  if (!isOffline()) {   // shared photos are taken back first; with no connection the entry is only hidden (the database hides its photos too)
    const rows = must(await active((on) => onlyActive(sb.from("journal_photos").select("id, storage_path, share_status").eq("consumption_id", consumptionId), on)));
    await withdrawShared(sb, rows);
  }
  must(await tag(sb.rpc("delete_my_journal_entry", { p_consumption_id: consumptionId }), { t: "entryDelete", id: consumptionId }));
}
export async function deleteSwipe(sb, wineVintageId) {
  must(await tag(sb.rpc("delete_my_swipe", { p_wine_vintage_id: wineVintageId }), { t: "stateDelete", wvid: wineVintageId }));
}

// ---------------------------------------------------------------- carrying a guest's progress into an account
// While still a guest, ask the database for a one-time code. After signing in to an account, hand it back.
export async function prepareGuestMerge(sb) {
  return must(await sb.rpc("prepare_guest_merge"));
}
export async function claimGuestMerge(sb, token) {
  return must(await sb.rpc("claim_guest_merge", { p_token: token }));
}

// ---------------------------------------------------------------- deleting the whole account
// Deleting the account keeps what the player gave us, anonymously (docs/retain_after_delete.sql): the photo files stay in private storage and the database
// function cuts the link to the person. Only the photos the player SHARED for the catalog are taken back first. If that fails nothing else is deleted and the
// person can try again.
export async function deleteMyAccount(sb) {
  const rows = await allRows(() => sb.from("journal_photos").select("id, storage_path, share_status"));
  await withdrawShared(sb, rows);   // shared copies go first; if that fails nothing else is deleted
  must(await sb.rpc("delete_my_account"));
}

// ---------------------------------------------------------------- editing wine info (editors)
// Everything an editor may pick from: producers, grapes and places (with their parents, so "Barolo, Piedmont, Italy" can be shown).
export async function loadEditorLists(sb) {
  const [producers, grapes, areas] = await Promise.all([
    allRows(() => sb.from("producers").select("id, name")),
    allRows(() => sb.from("grapes").select("id, name")),
    allRows(() => sb.from("geo_areas").select("id, name, level, parent_id, classification")),
  ]);
  return { producers, grapes, areas };
}
// The place list checks on the Owner page (geo.js placeChecks): which places wines point at, and applying one fix the owner chose.
export async function loadPlaceUse(sb) {
  const rows = await allRows(() => sb.from("wines").select("appellation_id"));
  return new Set(rows.map((r) => r.appellation_id).filter(Boolean));
}
// fix: { name?, level? }. Goes through apply_place_fix (docs/place_fixes.sql, run by hand): owner only, logged, refuses a name already there.
export async function applyPlaceFix(sb, areaId, fix) {
  const { error } = await sb.rpc("apply_place_fix", { p_area: areaId, p_name: fix.name || null, p_level: fix.level || null });
  if (error) throw new Error(/apply_place_fix|PGRST202|42883/.test(`${error.code} ${error.message}`) ? "This needs a database update first (docs/place_fixes.sql)." : (error.message || String(error)));
}
// Fills in a place's designation (DOC, DOCG, AOC ...; geo.js designationPlan) when it has none. A place that already has one is never changed here.
// Goes through fill_place_designation (docs/geo_classification.sql, run by hand): editors only, empty designations only. Until it is run, the message says so.
export async function savePlaceDesignation(sb, areaId, value) {
  const { data, error } = await sb.rpc("fill_place_designation", { p_area: areaId, p_value: value });
  if (error) throw new Error(/fill_place_designation|function|42883|PGRST202/.test(`${error.code} ${error.message}`) ? "The designation was not saved: it needs a database update (docs/geo_classification.sql)." : `The designation was not saved: ${error.message || error}`);
  if (data === false) throw new Error("The designation was not saved: the place already has one, or your access does not allow it.");
}
// One wine as the database stores it, for the editor's form.
export async function loadWineInfo(sb, wineVintageId) {
  const vintage = must(await sb.from("wine_vintages").select("id, wine_id, vintage_year, is_non_vintage").eq("id", wineVintageId).single());
  let wine;
  try { wine = must(await sb.from("wines").select("id, producer_id, name, vineyard, style, appellation_id, reach, status").eq("id", vintage.wine_id).single()); }
  catch (_) { wine = must(await sb.from("wines").select("id, producer_id, name, vineyard, style, appellation_id").eq("id", vintage.wine_id).single()); }   // before update 15
  const grapes = must(await sb.from("wine_grapes").select("grape_id, basis, position").eq("wine_id", wine.id).order("position", { ascending: true }));
  return { vintage, wine, grapes };
}
// Saves the form. Steps run in order; if one fails the message says which, and what was saved before it stays saved.
// values: { producerName, wineName, vineyard, year, nonVintage, style, areaId, labelGrapes: [id], otherGrapes: [id], newGrapes: [name] }
export async function saveWineInfo(sb, userId, info, values, lists) {
  const step = async (label, fn) => { try { return await fn(); } catch (e) { throw new Error(`${label}: ${e.message || e}`); } };
  let producerId = info.wine.producer_id;
  const name = values.producerName.trim();
  const known = lists.producers.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (known) producerId = known.id;
  else producerId = await step("Producer", async () => must(await sb.from("producers").insert({ name }).select("id").single()).id);
  const grapeIds = { label: [...values.labelGrapes], other: [...values.otherGrapes] };
  for (const g of values.newGrapes || []) {
    const id = await step("New grape " + g.name, async () => must(await sb.from("grapes").insert({ name: g.name }).select("id").single()).id);
    grapeIds[g.where].push(id);
  }
  await step("Wine", async () => must(await sb.from("wines").update({
    producer_id: producerId, name: values.wineName.trim() || null, vineyard: values.vineyard.trim() || null,
    style: values.style, style_basis: "editor", appellation_id: values.areaId || null,
    ...(values.reach && info.wine.reach !== undefined ? { reach: Number(values.reach) } : {}),   // "how easy to find" exists after update 15
  }).eq("id", info.wine.id)));
  await step("Vintage", async () => must(await sb.from("wine_vintages").update({
    vintage_year: values.nonVintage ? null : Number(values.year), is_non_vintage: !!values.nonVintage,
  }).eq("id", info.vintage.id)));
  await step("Grapes", async () => {
    must(await sb.from("wine_grapes").delete().eq("wine_id", info.wine.id).eq("basis", "label"));
    must(await sb.from("wine_grapes").delete().eq("wine_id", info.wine.id).eq("basis", "editor"));
    const rows = [];
    grapeIds.label.forEach((id, i) => rows.push({ wine_id: info.wine.id, grape_id: id, basis: "label", position: i + 1 }));
    grapeIds.other.filter((id) => !grapeIds.label.includes(id)).forEach((id, i) => rows.push({ wine_id: info.wine.id, grape_id: id, basis: "editor", position: i + 1 }));
    if (rows.length) must(await sb.from("wine_grapes").upsert(rows, { onConflict: "wine_id,grape_id" }));
  });
}

// ---------------------------------------------------------------- staff access and deleting wines
// What the signed-in person may do in the Editor tab. Before database update 13 is run the function does not exist,
// so the old rule applies: admins and editors can edit and verify, but nobody can delete.
export const LEGACY_PERMISSIONS = ["catalog_edit", "quiz_verify", "feedback_read"];
export function accessFrom(profileRole, rpcData) {
  if (rpcData && typeof rpcData === "object" && Array.isArray(rpcData.permissions)) {
    return { role: rpcData.role || null, label: rpcData.label || null, permissions: rpcData.permissions, legacy: false };
  }
  const old = profileRole === "admin" || profileRole === "editor";
  return { role: old ? profileRole : null, label: old ? (profileRole === "admin" ? "Owner" : "Editor") : null, permissions: old ? [...LEGACY_PERMISSIONS] : [], legacy: true };
}
export async function loadAccess(sb, profileRole) {
  try {
    const { data, error } = await sb.rpc("my_staff_access");
    return accessFrom(profileRole, error ? null : data);
  } catch (_) { return accessFrom(profileRole, null); }
}
// What deleting this wine would do (and whether it is allowed). Owner only.
export async function wineDeleteCheck(sb, wineVintageId) {
  return must(await sb.rpc("wine_delete_check", { p_vintage_id: wineVintageId }));
}
// Deletes the vintage; the wine goes too when it was the last one. Owner only. The database refuses wines people have swiped or journaled.
export async function deleteWineVintage(sb, wineVintageId) {
  return must(await sb.rpc("delete_wine_vintage", { p_vintage_id: wineVintageId }));
}

// ---------------------------------------------------------------- changing the wine on a journal entry
// The wine a person typed in, as stored (to fill the form).
export async function loadUserWine(sb, userWineId) {
  return must(await sb.from("user_wines").select("id, producer, wine_name, vintage_year, is_non_vintage, grape_text, region_text, style").eq("id", userWineId).single());
}
// Carries out a plan from planWineEdit. The catalog is never changed: a correction either points the entry at a catalog wine
// or lives on a wine that belongs to this person. Returns what the entry now points at.
export async function changeJournalWine(sb, userId, entry, plan) {
  if (plan.action === "none") return {};
  if (plan.action === "update_outside") {
    must(await sb.from("user_wines").update(plan.row).eq("id", plan.userWineId));
    return { userWineId: plan.userWineId };
  }
  let patch, created = null;
  if (plan.action === "link_catalog") {
    patch = { wine_vintage_id: plan.wineVintageId, user_wine_id: null, style_override: plan.styleOverride || null };
  } else {
    created = must(await sb.from("user_wines").insert({ ...plan.row, user_id: userId }).select("id").single()).id;
    patch = { wine_vintage_id: null, user_wine_id: created, style_override: null };
  }
  try { must(await sb.from("consumptions").update(patch).eq("id", entry.id)); }
  catch (e) { if (created) await sb.from("user_wines").delete().eq("id", created); throw e; }   // do not leave a stray wine behind
  // The old hand-typed wine is kept (nothing the player typed is ever removed); it simply has no entry pointing at it any more.
  return created ? { userWineId: created } : { wineVintageId: plan.wineVintageId };
}

// ---------------------------------------------------------------- the deck: what the person knows, and what other players know
// How the person did on the quiz, by topic: { Grapes: { correct, answered }, ... }. Skipped questions do not count as answered.
export async function loadQuizKnowledge(sb) {
  const [qs, latest] = await Promise.all([sb.from("quiz_questions").select("id, topic"), sb.from("v_quiz_latest").select("question_id, result")]);
  const topic = new Map(must(qs).map((q) => [q.id, q.topic]));
  const out = {};
  must(latest).forEach((r) => {
    const t = topic.get(r.question_id); if (!t || r.result === "unknown") return;
    out[t] = out[t] || { correct: 0, answered: 0 };
    out[t].answered += 1; if (r.result === "correct") out[t].correct += 1;
  });
  return out;
}
// Share of players who recognized each wine, once at least 3 have swiped it (update 15). Empty before that.
export async function loadCrowd(sb) {
  const { data, error } = await sb.from("v_wine_crowd").select("wine_vintage_id, people_seen, people_recognized");
  if (error) return new Map();
  return new Map(data.map((r) => [r.wine_vintage_id, { seen: r.people_seen, recognized: r.people_recognized }]));
}

// ---------------------------------------------------------------- how the catalog grows (editors)
// The wines players typed in, the rule, and what editors decided before. Needs database update 15.
export async function loadCatalogInputs(sb) {
  const rows = await sb.rpc("submitted_wine_rows");
  if (rows.error) throw new Error(rows.error.message && /submitted_wine_rows/.test(rows.error.message) ? "Database update 15 has not been run yet." : rows.error.message);
  const [cfg, dec] = await Promise.all([
    sb.from("app_config").select("key, value").in("key", ["catalog_candidate_min_entries", "catalog_candidate_min_people"]),
    sb.from("catalog_candidates").select("key, decision, entries_at_decision"),
  ]);
  return { rows: rows.data || [], config: must(cfg), decisions: must(dec) };
}
// Adds a candidate to the catalog as a wine that is PENDING REVIEW: editors see it, players do not, until it is published.
// Returns the new wine's vintage id.
export async function addCatalogWine(sb, userId, plan) {
  const step = async (label, fn) => { try { return await fn(); } catch (e) { throw new Error(`${label}: ${e.message || e}`); } };
  const producerId = plan.existingProducerId || await step("Producer", async () => must(await sb.from("producers").insert({ name: plan.producerName }).select("id").single()).id);
  const wineId = await step("Wine", async () => must(await sb.from("wines").insert({ producer_id: producerId, name: plan.wineName, style: plan.style, status: "pending_review" }).select("id").single()).id);
  const vintageId = await step("Vintage", async () => must(await sb.from("wine_vintages").insert({ wine_id: wineId, vintage_year: plan.vintageYear, is_non_vintage: plan.nonVintage }).select("id").single()).id);
  await step("Grapes", async () => {
    const rows = [];
    for (const [i, g] of plan.grapes.entries()) {
      const id = g.id || must(await sb.from("grapes").insert({ name: g.name }).select("id").single()).id;
      rows.push({ wine_id: wineId, grape_id: id, basis: "label", position: i + 1 });
    }
    if (rows.length) must(await sb.from("wine_grapes").insert(rows));
  });
  await step("Source", async () => {
    let src = must(await sb.from("sources").select("id").eq("name", "Player submissions (needs review)").limit(1));
    const sourceId = src.length ? src[0].id : must(await sb.from("sources").insert({ kind: "other", name: "Player submissions (needs review)", license_note: "Wines players added to their journals. Details are as players typed them and need an editor's check." }).select("id").single()).id;
    must(await sb.from("wine_source_records").insert({ wine_vintage_id: vintageId, source_id: sourceId, source_ref: plan.key.slice(0, 120), listed_as: plan.listedAs }));
  });
  await step("Decision", async () => must(await sb.from("catalog_candidates").upsert({ key: plan.key, decision: "added", entries_at_decision: plan.entries, wine_id: wineId, decided_by: userId, decided_at: new Date().toISOString() }, { onConflict: "key" })));
  return vintageId;
}
export async function dismissCandidate(sb, userId, key, entries) {
  must(await sb.from("catalog_candidates").upsert({ key, decision: "dismissed", entries_at_decision: entries, wine_id: null, decided_by: userId, decided_at: new Date().toISOString() }, { onConflict: "key" }));
}
// Puts a wine in the deck: it becomes verified.
export async function publishWine(sb, wineVintageId) {
  const v = must(await sb.from("wine_vintages").select("wine_id").eq("id", wineVintageId).single());
  must(await sb.from("wines").update({ status: "verified" }).eq("id", v.wine_id));
}
// Archives older vintages of a wine that a newer vintage replaced: they stay (swipes and journals keep pointing at them) but leave the deck.
export async function archiveVintages(sb, ids, keepId) {
  if (!ids.length) return;
  must(await sb.from("wine_vintages").update({ archived_at: new Date().toISOString(), superseded_by: keepId }).in("id", ids));
}

// ---------------------------------------------------------------- bottle photos (editors)
// Adds or replaces the bottle photo of a vintage. The new picture goes in first; the old one is only removed once the new one is in place.
// kind: 'own_photography' | 'producer' | 'official' (where the picture came from). Returns the new storage path.
export async function saveWinePhoto(sb, wineVintageId, blob, kind, note) {
  const v = must(await sb.from("wine_vintages").select("wine_id").eq("id", wineVintageId).single());
  const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const path = `${v.wine_id}/${wineVintageId}-${key}.jpg`;   // a new path every time, so phones never show an old copy
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw up.error;
  let rowId = null, old = [];
  try {
    old = must(await sb.from("wine_images").select("id, storage_path, submission_id").eq("wine_vintage_id", wineVintageId));
    rowId = must(await sb.from("wine_images").insert({ wine_id: v.wine_id, wine_vintage_id: wineVintageId, kind, storage_path: path, license_note: note || null, is_primary: false, status: "verified" }).select("id").single()).id;
    if (old.length) must(await sb.from("wine_images").update({ is_primary: false }).in("id", old.map((o) => o.id)));
    must(await sb.from("wine_images").update({ is_primary: true }).eq("id", rowId));
  } catch (e) {
    if (rowId) await sb.from("wine_images").delete().eq("id", rowId);
    if (old.length) await sb.from("wine_images").update({ is_primary: true }).in("id", old.map((o) => o.id));
    await sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw e;
  }
  if (old.length) {   // the replaced pictures go; if this fails the new photo is still in place
    await sb.from("wine_images").delete().in("id", old.map((o) => o.id));
    await sb.storage.from(PHOTO_BUCKET).remove(old.map((o) => o.storage_path));
    await takeDownSubmissions(sb, old.map((o) => o.submission_id));
  }
  return path;
}
export async function winePhotoPaths(sb, wineVintageId) {
  const { data } = await sb.from("wine_images").select("storage_path").eq("wine_vintage_id", wineVintageId);
  return (data || []).map((r) => r.storage_path);
}
export async function removeWinePhoto(sb, wineVintageId) {
  const rows = must(await sb.from("wine_images").select("id, storage_path, submission_id").eq("wine_vintage_id", wineVintageId));
  if (!rows.length) return;
  must(await sb.from("wine_images").delete().in("id", rows.map((r) => r.id)));
  await sb.storage.from(PHOTO_BUCKET).remove(rows.map((r) => r.storage_path));
  await takeDownSubmissions(sb, rows.map((r) => r.submission_id));
}
// Files left behind when a wine was deleted (the database removes the records; the files are removed here).
export async function removePhotoFiles(sb, paths) { if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths); }

// Gives a vintage the photo of another vintage of the same wine. The picture FILE is copied, so replacing or removing one vintage's photo
// never changes the other's. With replace, the vintage's current photo is swapped for the copy (used to refresh carried-over copies).
// Returns the new storage path.
export async function reuseWinePhoto(sb, fromVintageId, toVintageId, note, { replace = false } = {}) {
  const src = must(await sb.from("wine_images").select("storage_path, kind, submission_id").eq("wine_vintage_id", fromVintageId).eq("is_primary", true).limit(1));
  if (!src.length) throw new Error("That vintage has no photo to reuse.");
  const have = must(await sb.from("wine_images").select("id, storage_path").eq("wine_vintage_id", toVintageId));
  if (have.length && !replace) throw new Error("This wine already has a photo.");
  const to = must(await sb.from("wine_vintages").select("wine_id").eq("id", toVintageId).single());
  const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  // A player's photo keeps its own folder (named by a random token, never the person's id) so taking it back removes every copy.
  const folder = src[0].submission_id ? String(src[0].storage_path).split("/")[1] : null;
  const path = folder ? `community/${folder}/${key}.jpg` : `${to.wine_id}/${toVintageId}-${key}.jpg`;
  const cp = await sb.storage.from(PHOTO_BUCKET).copy(src[0].storage_path, path);
  if (cp.error) throw cp.error;
  let rowId = null;
  try {
    rowId = must(await sb.from("wine_images").insert({ wine_id: to.wine_id, wine_vintage_id: toVintageId, kind: src[0].kind, storage_path: path, license_note: note || null, is_primary: false, status: "verified", ...(src[0].submission_id ? { submission_id: src[0].submission_id } : {}) }).select("id").single()).id;
    if (have.length) must(await sb.from("wine_images").update({ is_primary: false }).in("id", have.map((h) => h.id)));
    must(await sb.from("wine_images").update({ is_primary: true }).eq("id", rowId));
  } catch (e) {
    if (rowId) await sb.from("wine_images").delete().eq("id", rowId);
    if (have.length) await sb.from("wine_images").update({ is_primary: true }).in("id", have.map((h) => h.id));
    await sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw e;
  }
  if (have.length) {   // the replaced copy goes; if this fails the new photo is still in place
    await sb.from("wine_images").delete().in("id", have.map((h) => h.id));
    await sb.storage.from(PHOTO_BUCKET).remove(have.map((h) => h.storage_path));
  }
  return path;
}

// ---------------------------------------------------------------- the Owner page
// The numbers the app reads from the database (app_config: key, value, note). value is a number, or an object with a "value" number.
export async function loadAppConfig(sb) {
  return must(await sb.from("app_config").select("key, value, note").order("key"));
}
// Changes one setting. The database decides who may; if no row was changed this throws, so a refused save is never shown as done.
export async function saveAppConfig(sb, key, value) {
  const rows = must(await sb.from("app_config").update({ value }).eq("key", key).select("key"));
  if (!rows || !rows.length) throw new Error("The setting was not saved. Your access may not allow changing it.");
}
// ---------------------------------------------------------------- plans and staff roles (docs/ROLES_AND_ACCESS.md; the functions are in docs/roles_proposal.sql, run by hand)
// Whether the Plan switch is shown in Settings: the app_config number plan_switch_open (1 = shown). Missing or unreadable means hidden.
export async function loadPlanSwitchOpen(sb) {
  try {
    const { data, error } = await sb.from("app_config").select("value").eq("key", "plan_switch_open").maybeSingle();
    if (error || !data) return false;
    const v = data.value !== null && typeof data.value === "object" ? data.value.value : data.value;
    return v === true || Number(v) === 1;
  } catch (_) { return false; }
}
// Changes the signed-in player's own plan ("default" or "pro"). The database refuses while the switch is closed.
export async function setMyPlan(sb, plan) {
  if (plan !== "default" && plan !== "pro") throw new Error("Choose Standard or Pro.");
  const { error } = await sb.rpc("set_my_plan", { p_plan: plan });
  if (error) throw (error.code === "PGRST202" ? new Error("The plan switch needs a database update (docs/roles_proposal.sql).") : error);
  return plan;
}
const staffMissing = (error) => (error && (error.code === "PGRST202" || /staff_(list|set_role|remove)/.test(String(error.message || ""))) ? new Error("The roles list needs a database update (docs/roles_proposal.sql).") : error);
// Everyone who has a staff role (Owner included, locked in the page), with their email. Owner only.
export async function loadStaff(sb) {
  const { data, error } = await sb.rpc("staff_list");
  if (error) throw staffMissing(error);
  return data || [];
}
// Gives an existing player (found by email) the role "editor" or "quiz_reviewer", or changes it. The database refuses "owner" and refuses changing an Owner.
export async function setStaffRole(sb, email, role) {
  const { data, error } = await sb.rpc("staff_set_role", { p_email: email, p_role: role });
  if (error) throw staffMissing(error);
  return data;
}
// Takes a staff role away (the person is a player again). The database refuses to remove an Owner.
export async function removeStaff(sb, userId) {
  const { error } = await sb.rpc("staff_remove", { p_user_id: userId });
  if (error) throw staffMissing(error);
}
// The latest changes to staff roles (who changed whom). An empty list until the script has been run.
export async function loadStaffAudit(sb) {
  try {
    const { data, error } = await sb.from("staff_audit").select("*").order("created_at", { ascending: false }).limit(30);
    return error ? [] : (data || []);
  } catch (_) { return []; }
}
// "How easy to find" for a wine (1 to 5), the same field the full editor sets. Needs database update 15.
export async function saveWineReach(sb, wineId, reach) {
  const rows = must(await sb.from("wines").update({ reach: reach === null ? null : Number(reach) }).eq("id", wineId).select("id"));
  if (!rows || !rows.length) throw new Error("The change was not saved. Your access may not allow it, or database update 15 has not been run.");
}

// The Discover counts: swipes (not later changes of interest) and journal entries, leaving out the ones the player deleted (hidden, see soft_delete.sql).
export async function countSwipesAndJournal(sb) {
  const [s, j] = await Promise.all([
    active((on) => onlyActive(sb.from("encounters").select("id", { count: "exact", head: true }).eq("event", "swipe"), on)),
    active((on) => onlyActive(sb.from("consumptions").select("id", { count: "exact", head: true }), on)),
  ]);
  if (s.error) throw s.error;
  if (j.error) throw j.error;
  return overlayCounts({ swipes: s.count || 0, journal: j.count || 0 });
}

// Import (importer.js): adds many journal entries at once. Items are { kind: "catalog" | "outside", wine_vintage_id | wine (a user_wines row), consumed_on, verdict, purchase_price_cents, notes }.
// Hand-typed wines are saved first, 50 at a time, then the entries that point at them. If a batch is refused, its rows are tried one by one so one bad row cannot sink the rest.
// Returns { added, failed: [{ label, message }] }.
export async function importAllowance(sb) {   // { limit, used, remaining, hours }; needs docs/import_limit.sql
  const r = await sb.rpc("my_import_allowance");
  if (r.error) throw r.error;
  if (!r.data) throw new Error("no allowance");
  return r.data;
}
const isLimitError = (e) => !!e && (e.hint === "import_limit" || /^Limit reached/.test(String(e.message || "")));
export async function importJournal(sb, userId, items, today) {
  const result = { added: 0, failed: [], stopped: null };
  const entry = (x) => ({ user_id: userId, origin: "manual", consumed_on: x.consumed_on || today, verdict: x.verdict || null, purchase_price_cents: x.purchase_price_cents ?? null, notes: x.notes || null });
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50), ready = [];
    const outside = chunk.filter((x) => x.kind === "outside");
    let ids = [];
    if (outside.length) {
      const r = await sb.from("user_wines").insert(outside.map((x) => x.wine)).select("id");
      if (r.error) {
        outside.forEach((x) => result.failed.push({ label: x.label, message: r.error.message }));
        if (isLimitError(r.error)) { result.stopped = r.error.message; chunk.forEach((x) => { if (x.kind === "catalog") result.failed.push({ label: x.label, message: r.error.message }); }); items.slice(i + 50).forEach((x) => result.failed.push({ label: x.label, message: r.error.message })); break; }
      } else ids = r.data.map((d) => d.id);
    }
    let o = 0;
    for (const x of chunk) {
      if (x.kind === "catalog") ready.push({ x, row: { ...entry(x), wine_vintage_id: x.wine_vintage_id } });
      else if (ids[o] !== undefined) { ready.push({ x, row: { ...entry(x), user_wine_id: ids[o] }, wineId: ids[o] }); o += 1; }
      else o += 1;
    }
    if (!ready.length) continue;
    const bulk = await sb.from("consumptions").insert(ready.map((r) => r.row));
    if (!bulk.error) { result.added += ready.length; continue; }
    if (isLimitError(bulk.error)) {   // the database says this player is over their allowance: stop asking, tidy up the wines just saved, and report it once
      result.stopped = bulk.error.message;
      for (const r of ready) { result.failed.push({ label: r.x.label, message: bulk.error.message }); if (r.wineId) await sb.from("user_wines").delete().eq("id", r.wineId); }
      items.slice(i + 50).forEach((x) => result.failed.push({ label: x.label, message: bulk.error.message }));
      break;
    }
    for (const r of ready) {
      const one = await sb.from("consumptions").insert(r.row);
      if (one.error) {
        result.failed.push({ label: r.x.label, message: one.error.message });
        if (r.wineId) await sb.from("user_wines").delete().eq("id", r.wineId);   // do not leave a wine behind with no entry
      } else result.added += 1;
    }
  }
  return result;
}

// This or That (thisorthat.js): one row per player and pair. Needs the table from docs/this_or_that.sql; until it exists the save fails and the game still works.
export async function saveThisOrThat(sb, row) {
  must(await tag(sb.from("this_or_that_answers").upsert(row, { onConflict: "user_id,pair_id" })));
}

// ---------------------------------------------------------------- quiz tags (docs/quiz_tags.sql)
// All tags and which questions have which. Before the script is run these tables do not exist: the caller treats a failure as "no tags yet".
export async function loadQuizTags(sb) {
  const [tags, links] = await Promise.all([
    allRows(() => sb.from("quiz_tags").select("id, kind, name").order("name")),
    allRows(() => sb.from("quiz_question_tags").select("question_id, tag_id")),
  ]);
  return { tags, links };
}
// Changes the tags of one question: ids to add and ids to remove. The database lets only editors with quiz_verify do this.
export async function saveQuestionTags(sb, userId, questionId, add, remove) {
  if (remove.length) must(await sb.from("quiz_question_tags").delete().eq("question_id", questionId).in("tag_id", remove));
  if (add.length) must(await sb.from("quiz_question_tags").insert(add.map((tagId) => ({ question_id: questionId, tag_id: tagId, tagged_by: userId }))));
}
// A new tag. Only the owner (settings_edit) may; a refusal is shown as a failure.
export async function addQuizTag(sb, userId, kind, name) {
  const rows = must(await sb.from("quiz_tags").insert({ kind, name: String(name).trim(), created_by: userId }).select("id, kind, name"));
  if (!rows || !rows.length) throw new Error("The tag was not saved. Your access may not allow it.");
  return rows[0];
}

// ---------------------------------------------------------------- the note legend (docs/note_legend.sql)
// What players say in tasting notes and which grid answer it means (notegrid.js). Every reader returns null when the tables are not there yet (the app then uses its starting list and the
// player's own words kept on the phone).
export async function loadSharedLegend(sb) {
  const r = await sb.from("note_legend").select("id, phrase, field, value, source").order("phrase");
  return r.error ? null : r.data;
}
export async function loadMyLegend(sb) {
  const r = await sb.from("note_legend_mine").select("phrase, field, value, rejected, share");
  return r.error ? null : r.data;
}
// One line of the player's own legend: a word they taught (rejected false) or an answer they pushed back on (rejected true). share offers the word to editors, never a note.
export async function saveMyLegend(sb, userId, e) {
  const r = await tag(sb.from("note_legend_mine").upsert({ user_id: userId, phrase: e.phrase, field: e.field, value: e.value, rejected: !!e.rejected, share: !!e.share && !e.rejected }, { onConflict: "user_id,phrase,field,value" }));
  if (r.error) throw r.error;
}
// Editors and the owner: suggestions (how many different players shared each word and answer), and the decisions.
export async function loadLegendCandidates(sb) {
  const r = await sb.rpc("legend_candidates");
  if (r.error) throw r.error;
  return r.data || [];
}
export async function approveLegend(sb, userId, c) {
  const ins = await sb.from("note_legend").insert({ phrase: c.phrase, field: c.field, value: c.value, source: c.source || "learned", approved_by: userId });
  if (ins.error && ins.error.code !== "23505") throw ins.error;   // 23505: already there, which is fine
  if (c.review !== false) must(await sb.from("note_legend_review").upsert({ phrase: c.phrase, field: c.field, value: c.value, decision: "approved", decided_by: userId }, { onConflict: "phrase,field,value" }));
}
export async function rejectLegend(sb, userId, c) {
  must(await sb.from("note_legend_review").upsert({ phrase: c.phrase, field: c.field, value: c.value, decision: "rejected", decided_by: userId }, { onConflict: "phrase,field,value" }));
}
export async function removeSharedLegend(sb, id) {
  must(await sb.from("note_legend").delete().eq("id", id));
}

