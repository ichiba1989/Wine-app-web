// Everything that talks to Supabase. Each function takes the client and throws on an error.
import { cardFromRow, buildReview, outsideRow, referenceWrites } from "./logic.js?v=8";
import { BUCKET, newPhotoPath } from "./photos.js?v=4";

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
export async function loadCards(sb) { return must(await sb.from("v_catalog_cards").select("*")).map((r) => ({ ...cardFromRow(r), raw: r })); }   // raw: the full catalog row, used by the structure rules
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
  const rows = must(await sb.from("journal_photos").select("id, storage_path, created_at").eq("consumption_id", consumptionId).order("created_at", { ascending: true }));
  const urls = await signedUrls(sb, rows.map((r) => r.storage_path));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) || null }));
}
// Uploads queued pictures one at a time and returns the ones that failed, so a retry only repeats those.
export async function uploadPhotos(sb, userId, consumptionId, queued) {
  const failed = [];
  for (const p of queued) {
    const path = newPhotoPath(userId);
    try {
      const up = await sb.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const ins = await sb.from("journal_photos").insert({ consumption_id: consumptionId, user_id: userId, storage_path: path });
      if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw ins.error; }
    } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  return failed;
}
export async function deletePhotos(sb, existing) {
  const failed = [];
  for (const p of existing) {
    try {
      must(await sb.from("journal_photos").delete().eq("id", p.id));
      await sb.storage.from(BUCKET).remove([p.path]);
    } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  return failed;
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
  const rows = must(await sb.from("journal_photos").select("storage_path").eq("consumption_id", consumptionId));
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
  const rows = await allRows(() => sb.from("journal_photos").select("storage_path"));
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
  const wine = must(await sb.from("wines").select("id, producer_id, name, vineyard, style, appellation_id").eq("id", vintage.wine_id).single());
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
