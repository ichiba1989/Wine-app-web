// Everything that talks to Supabase. Each function takes the client and throws on an error.
import { cardFromRow, buildReview, outsideRow, referenceWrites } from "./logic.js?v=10";
import { BUCKET, newPhotoPath } from "./photos.js?v=5";

const must = ({ data, error }) => { if (error) throw error; return data; };
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
export async function ensureUser(sb) {
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const res = await sb.auth.signInAnonymously();
    if (res.error) throw res.error;
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
  return must(await sb.from("v_user_wine_state").select("wine_vintage_id, familiarity, interest, last_swiped_at"));
}
export async function loadJournal(sb) {
  return must(await sb.from("v_journal_entries").select("*").order("consumed_on", { ascending: false }));
}
export async function loadPerceptions(sb, consumptionId) {
  return must(await sb.from("perceptions").select("dimension_key, value, default_value, adjusted").eq("consumption_id", consumptionId));
}
export async function countRows(sb) {
  const [s, j] = await Promise.all([
    sb.from("encounters").select("id", { count: "exact", head: true }),
    sb.from("consumptions").select("id", { count: "exact", head: true }),
  ]);
  return { swipes: s.count || 0, journal: j.count || 0 };
}

// ---------------------------------------------------------------- swiping
// Swiping up ("had this bottle") also adds the wine to the journal, done together on the server.
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
export async function saveReview(sb, userId, sheet, today) {
  const { consumption, perceptions } = buildReview(sheet, today);
  let userWineId = sheet.target.userWineId;
  if (sheet.target.kind === "outside" && !userWineId && !sheet.entryId) {
    userWineId = must(await sb.from("user_wines").insert(outsideRow({ ...sheet.target.form, style: sheet.style }, userId)).select("id").single()).id;
  } else if (sheet.target.kind === "outside" && userWineId && sheet.style !== sheet.catalogStyle) {
    must(await sb.from("user_wines").update({ style: sheet.style }).eq("id", userWineId));   // the person owns this wine, so its type is theirs to change
  }
  let id = sheet.entryId;
  if (id) {
    must(await sb.from("consumptions").update(consumption).eq("id", id));
  } else {
    const link = sheet.target.kind === "outside" ? { user_wine_id: userWineId } : { wine_vintage_id: sheet.target.wineVintageId };
    const row = { ...consumption, ...link, user_id: userId, origin: sheet.target.kind === "outside" ? "manual" : "review" };
    id = must(await sb.from("consumptions").insert(row).select("id").single()).id;
  }
  must(await sb.from("perceptions").upsert(perceptions.map((p) => ({ ...p, consumption_id: id })), { onConflict: "consumption_id,dimension_key" }));
  return id;
}
// A hand-typed wine added to the journal with no verdict yet.
export async function addWithoutRating(sb, userId, form, today) {
  const uw = must(await sb.from("user_wines").insert(outsideRow(form, userId)).select("id").single());
  return must(await sb.from("consumptions").insert({ user_id: userId, user_wine_id: uw.id, origin: "manual", consumed_on: today }).select("id").single()).id;
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
  const rows = must(await sb.from("journal_photos").select("id, storage_path, created_at, share_status").eq("consumption_id", consumptionId).order("created_at", { ascending: true }));
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
      must(await sb.from("journal_photos").delete().eq("id", p.id));
      await sb.storage.from(BUCKET).remove([p.path]);
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
// The database functions remove the link to the account and keep only an anonymous rating (see the update script).
// Photos are private files, so they are erased first; if that fails nothing else is deleted and the person can try again.
export async function deleteJournalEntry(sb, consumptionId) {
  const rows = must(await sb.from("journal_photos").select("id, storage_path, share_status").eq("consumption_id", consumptionId));
  await withdrawShared(sb, rows);   // shared copies go first; if that fails nothing else is deleted
  if (rows.length) {
    const r = await sb.storage.from(BUCKET).remove(rows.map((x) => x.storage_path));
    if (r.error) throw r.error;
  }
  must(await sb.rpc("delete_my_journal_entry", { p_consumption_id: consumptionId }));
}
export async function deleteSwipe(sb, wineVintageId) {
  must(await sb.rpc("delete_my_swipe", { p_wine_vintage_id: wineVintageId }));
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
// Photos are private files, so they are erased first. If that fails nothing else is deleted and the person can try again.
// The database function then keeps only anonymous ratings, erases everything else, and removes the account.
export async function deleteMyAccount(sb) {
  const rows = await allRows(() => sb.from("journal_photos").select("id, storage_path, share_status"));
  await withdrawShared(sb, rows);   // shared copies go first; if that fails nothing else is deleted
  for (let i = 0; i < rows.length; i += 100) {
    const r = await sb.storage.from(BUCKET).remove(rows.slice(i, i + 100).map((x) => x.storage_path));
    if (r.error) throw r.error;
  }
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
  const oldUserWine = entry.user_wine_id || null;
  let patch, created = null;
  if (plan.action === "link_catalog") {
    patch = { wine_vintage_id: plan.wineVintageId, user_wine_id: null, style_override: plan.styleOverride || null };
  } else {
    created = must(await sb.from("user_wines").insert({ ...plan.row, user_id: userId }).select("id").single()).id;
    patch = { wine_vintage_id: null, user_wine_id: created, style_override: null };
  }
  try { must(await sb.from("consumptions").update(patch).eq("id", entry.id)); }
  catch (e) { if (created) await sb.from("user_wines").delete().eq("id", created); throw e; }   // do not leave a stray wine behind
  if (oldUserWine && oldUserWine !== created) {
    // the old hand-typed wine goes if no other entry uses it
    const rest = must(await sb.from("consumptions").select("id").eq("user_wine_id", oldUserWine).limit(1));
    if (!rest.length) await sb.from("user_wines").delete().eq("id", oldUserWine);
  }
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
// "How easy to find" for a wine (1 to 5), the same field the full editor sets. Needs database update 15.
export async function saveWineReach(sb, wineId, reach) {
  const rows = must(await sb.from("wines").update({ reach: reach === null ? null : Number(reach) }).eq("id", wineId).select("id"));
  if (!rows || !rows.length) throw new Error("The change was not saved. Your access may not allow it, or database update 15 has not been run.");
}

// This or That (thisorthat.js): one row per player and pair. Needs the table from docs/this_or_that.sql; until it exists the save fails and the game still works.
export async function saveThisOrThat(sb, row) {
  must(await sb.from("this_or_that_answers").upsert(row, { onConflict: "user_id,pair_id" }));
}
