# Review packages (download only; not part of the app)

This branch (`claude/wine-app-setup-35g1ne`) holds review packages so the owner can download them from GitHub. It is **not** published
on the website (the publishing workflow only copies `main` and `vwm`), and nothing here is used by the app.

- `Wine_Reference_Phase_2_0B_3_Security_Review.zip` (rebuilt 2026-11-01, final corrections): Migration 001 **release r4**, built from
  `main` at `1f259ca3f1e5c29ab150c6220a14e01efd4da202` (32 files; suite re-run at packaging: 294 passed, 0 failed, including 13
  concurrency checks). Open `REVIEW_MANIFEST.md` first. ZIP SHA-256: `a797220d7e247038cb50f5bd515e6147e1e67e25bbe7826f03c92c8e5852f30b`.
  Earlier packages (r3 from `9fd5081`, and the 160-test version from `e59ed94`) are in this branch's history.
- `Wine_Reference_Phase_2_0B_4_Staging_Review.zip` (2026-11-01): **local Supabase staging validation** of release r4 (unchanged,
  `1f259ca`), staging work committed on `main` at `ee2c8c2`. 262 files; open `MANIFEST.md` (SHA-256 of every file) and
  `reports/STAGING_TEST_REPORT.md` first. 423 checks passed, 0 failed on local Supabase; a proposed, unapproved patch is in
  `staging/proposed/`. ZIP SHA-256: `21143772a133d948253960d01a792e45186e93a2bf341e4b8550ab646c547a04`.
