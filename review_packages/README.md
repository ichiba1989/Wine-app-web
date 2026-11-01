# Review packages (download only; not part of the app)

This branch (`claude/wine-app-setup-35g1ne`) holds review packages so the owner can download them from GitHub. It is **not** published
on the website (the publishing workflow only copies `main` and `vwm`), and nothing here is used by the app.

- `Wine_Reference_Phase_2_0B_3_Security_Review.zip` (rebuilt 2026-11-01): Migration 001 **release r3** security review package, built from
  `main` at `9fd508193d551ef08c239c1acfe476f4a8c59a61` (28 files; local suite re-run at packaging: 270 passed, 0 failed). Open
  `REVIEW_MANIFEST.md` inside first. ZIP SHA-256: `ac56cb414ae51f47b00801ab3cd23d059a9f06115db905d945ecf601dbebdc19`.
  It replaces the 2026-10-26 package (built from `e59ed94`, the 160-test version), which is still in this branch's history.
