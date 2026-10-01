// Everything that talks to Supabase. Each function takes the client and throws on an error.
import { cardFromRow, buildReview, outsideRow, referenceWrites } from "./logic.js?v=5";
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
export async function loadCards(sb) { return must(await sb.from("v_catalog_cards").select("*")).map(cardFromRow); }
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
    userWineId = must(await sb.from("user_wines").insert(outsideRow(sheet.target.form, userId)).select("id").single()).id;
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
