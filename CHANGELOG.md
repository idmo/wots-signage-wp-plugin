# Changelog

## 0.3.0 (2026-10-04)

- Block preview: the eye button (or Preview in the block editor, including unsaved changes) plays one block with the real player, ignoring its dates.
- TV lineup: tick the shows to play and drag them into order; they play back to back, then repeat. Replaces "Go live".
- Player keys: ← / → previous and next, Space pause (resumes after 5 minutes), F full screen, Esc leaves full screen or returns to the Signage screen.
- Screen shape setting: 16:9, 9:16, 4:3, or 3:4.
- Events: show the next few, the next N days, the rest of this month, or a date range, with an optional cap.
- Category filters for every data source (event, bulletin board, and book categories), with a live match count.
- Templates: resizable regions, a one-region layout, a free-text element, and a full-screen background from each item's own image (with a one-click starter template).
- Fixed: the Settings page never saved.

## 0.2.1 (2026-10-02)

- Updates now come from GitHub: WordPress shows "update available" for WOTS Signage when a new release is published.
- Release tooling: `bin/release.sh` and the GitHub release workflow.
- Shop Mac kiosk scripts in `bin/kiosk/`.

## 0.2.0 (2026-10-01)

- Community Board and Featured Readers data sources, with List mode.
- Template Builder with live preview.
- Several shows with Go live.
- Next.js look: background image, tinted panel, colors, transitions, content animations.
- Offline mode (service worker).
- Import / Export.

## 0.1.0 (2026-10-01)

- First version: image, video, and event blocks; one show; keyed kiosk player with version polling; Settings.
