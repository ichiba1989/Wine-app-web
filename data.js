// Everything that talks to Supabase. Each function takes the client and throws on an error.
import { cardFromRow, buildReview, outsideRow } from "./logic.js";

const must = ({ data, error }) => { if (error) throw error; return data; };

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
  must(await sb.from("consumptions").insert({ user_id: userId, user_wine_id: uw.id, origin: "manual", consumed_on: today }));
}

