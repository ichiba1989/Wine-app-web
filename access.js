// Who may do what: the one place that turns "who is this person" into yes/no answers. Pure: no browser, no network.
// The full definition (the four axes, the roles, the permissions and the plan) is written in docs/ROLES_AND_ACCESS.md; keep the two in step.
//   1. Account  Guest or Member (Supabase sign-in).                       Decides account features only.
//   2. Mode     Beginner / Enthusiast / Professional (this phone).         Changes words and extra tools only, never what is switched on.
//   3. Plan     Standard or Pro (profiles.tier in the database).           Switches on features (the tasting grid, the larger import, feedback).
//   4. Role     Player / Quiz reviewer / Editor / Owner (staff access).    A role is only a named bundle of permissions; code asks about PERMISSIONS, never labels.
// This file only decides what to SHOW. The database (row-level security) is the real enforcement.

// ---------------------------------------------------------------- permissions and roles
export const PERMISSIONS = [
  { id: "catalog_edit", what: "Edit the catalog: structure, wine details, photos, flags" },
  { id: "quiz_verify", what: "Review quiz questions, tag them, and review the note legend" },
  { id: "feedback_read", what: "Read players' feedback" },
  { id: "found_online_photos", what: "Use photos found online" },
  { id: "remove_content", what: "Delete a wine" },
  { id: "settings_edit", what: "Change app settings, plans and quiz tags" },
  { id: "owner_page", what: "Open the Owner page" },
  { id: "import_extended", what: "Import more wines at once (500 instead of 100)" },
];
export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);
// The four roles. Owner is last and is never handed out from the app (see ASSIGNABLE_ROLES).
export const ROLES = [
  { id: "player", label: "Player", permissions: [] },
  { id: "quiz_reviewer", label: "Quiz reviewer", permissions: ["quiz_verify"] },
  { id: "editor", label: "Editor", permissions: ["catalog_edit", "quiz_verify", "feedback_read", "import_extended"] },
  { id: "owner", label: "Owner", permissions: PERMISSION_IDS.slice() },
];
export const ROLE_IDS = ROLES.map((r) => r.id);
export const roleById = (id) => ROLES.find((r) => r.id === id) || null;
// The roles the Owner page may give to someone. Owner is deliberately not here, and the database refuses it too.
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r.id === "editor" || r.id === "quiz_reviewer");
export const isAssignable = (id) => ASSIGNABLE_ROLES.some((r) => r.id === id);
// Undecided (owner, 2026-10-14): should the Quiz reviewer's powers need the Pro plan? Flip this one value to tie them.
export const QUIZ_REVIEWER_NEEDS_PRO = false;

// ---------------------------------------------------------------- plans
export const PLANS = [{ id: "default", label: "Standard" }, { id: "pro", label: "Pro" }];
export const planLabel = (id) => (PLANS.find((p) => p.id === id) || PLANS[0]).label;
// "professional" was an older name for the same plan; the roles update (docs/roles_proposal.sql) renames it to "pro".
export const planIdOf = (profile) => (profile && (profile.tier === "pro" || profile.tier === "professional") ? "pro" : "default");

// ---------------------------------------------------------------- the role a staff record stands for
// staff is what the app loaded from the database: { role, label, permissions: [], legacy }. Before the roles update has been run, the database
// only knows "admin" (shown as Owner) and "editor", so those are read the old way and the new permissions are filled in from the old ones.
export function roleOf(staff) {
  if (!staff) return "player";
  const perms = Array.isArray(staff.permissions) ? staff.permissions : [];
  const word = String(staff.role || staff.label || "").toLowerCase().replace(/\s+/g, "_");
  if (word === "owner" || word === "admin" || perms.includes("settings_edit")) return "owner";
  if (word === "editor" || perms.includes("catalog_edit")) return "editor";
  if (word === "quiz_reviewer" || perms.includes("quiz_verify")) return "quiz_reviewer";
  return perms.length ? "quiz_reviewer" : "player";
}
// Every permission this person holds, including the two new ones when the database has not given them yet.
export function permissionsOf(staff, planId = "default") {
  const own = new Set(Array.isArray(staff && staff.permissions) ? staff.permissions : []);
  const role = roleOf(staff);
  if (role === "owner") own.add("owner_page");
  if (role === "owner" || role === "editor") own.add("import_extended");
  if (QUIZ_REVIEWER_NEEDS_PRO && role === "quiz_reviewer" && planId !== "pro") return new Set();
  return own;
}

// TECHSHEET: who sees the Tech sheet at each level of the kill switch.
export const techsheetShown = (level, perms) => Number(level) >= 2 || (Number(level) === 1 && !!perms && (perms.has("catalog_edit") || perms.has("settings_edit")));

// ---------------------------------------------------------------- the one answer sheet
// input: { user, profile, staff, features: { proTasting, importLarge, contentFeedback } (already worked out as true/false), settings }
export function accessOf({ user = null, profile = null, staff = null, features = {}, settings = null } = {}) {
  const plan = planIdOf(profile);
  const perms = permissionsOf(staff, plan);
  const can = (p) => perms.has(p);
  const role = roleOf(staff);
  const mode = (settings && settings.mode) || "beginner";
  return {
    // 1. account
    isGuest: !!user && user.is_anonymous === true,
    // 2. mode (words and extra tools only)
    mode,
    proTools: mode === "enthusiast" || mode === "professional",
    // 3. plan
    plan, planLabel: planLabel(plan),
    grid: !!features.proTasting,
    feedback: !!features.contentFeedback,
    importLimit: can("import_extended") || !!features.importLarge ? 500 : 100,
    // 4. role
    role, roleLabel: (roleById(role) || ROLES[0]).label,
    can,
    isOwner: can("owner_page"),
    isEditor: can("catalog_edit") || can("quiz_verify"),
    isStaff: perms.size > 0,
    // TECHSHEET: 0 off for everyone, 1 staff only, 2 everyone (app_config techsheet_enabled). The one flag every Tech sheet screen asks.
    techsheet: techsheetShown(features.techsheetLevel, perms),
    techsheetStaff: techsheetShown(features.techsheetLevel, perms) && perms.has("catalog_edit"),
    techsheetOwner: techsheetShown(features.techsheetLevel, perms) && perms.has("settings_edit"),
    permissions: [...perms],
  };
}

// ---------------------------------------------------------------- the Owner page's Roles tab (pure helpers)
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());
// A row from staff_list() as the tab shows it. Owner rows are locked: no buttons, whatever the database says.
export function staffRow(r) {
  const role = roleOf({ role: r.role, label: r.label, permissions: r.permissions });
  return {
    userId: r.user_id, name: r.display_name || "", email: r.email || "", role, roleLabel: (roleById(role) || ROLES[0]).label,
    permissions: Array.isArray(r.permissions) ? r.permissions : (roleById(role) || ROLES[0]).permissions,
    since: r.since || r.created_at || null, locked: role === "owner",
  };
}
export const staffRows = (list) => (list || []).map(staffRow).filter((r) => r.role !== "player");
// Search (name, email, role) and a role filter; Owner first, then by role, then by name.
export function filterStaff(rows, q = "", role = "all") {
  const t = String(q || "").trim().toLowerCase();
  const order = { owner: 0, editor: 1, quiz_reviewer: 2 };
  return rows
    .filter((r) => (role === "all" || r.role === role) && (!t || `${r.name} ${r.email} ${r.roleLabel}`.toLowerCase().includes(t)))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.name || a.email).localeCompare(b.name || b.email));
}
// What the tab may do for a row: nothing at all for a locked (Owner) row.
export const rowActions = (row) => (row.locked ? [] : ASSIGNABLE_ROLES.filter((r) => r.id !== row.role).map((r) => ({ kind: "set", role: r.id, label: `Make ${r.label}` })).concat([{ kind: "remove", label: "Remove role" }]));
// Checks the form before anything is sent. Returns { ok, why, email, role }.
export function checkAssignment(email, role) {
  const e = String(email || "").trim().toLowerCase();
  if (!validEmail(e)) return { ok: false, why: "Write the player's full email address." };
  if (!isAssignable(role)) return { ok: false, why: role === "owner" ? "The Owner role cannot be given from this page." : "Choose Editor or Quiz reviewer." };
  return { ok: true, email: e, role };
}
