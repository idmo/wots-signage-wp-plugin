# Changelog

## 0.7.0 (2026-10-08)

- Community Board postings behave like events on the public site: lists, search, feeds, the sitemap, and Query Loop blocks only show approved postings inside their dates. An ended posting's own page still works with a "This posting has ended" note; unapproved postings return "not found" to visitors. On by default; turn it off in Signage → Settings.

## 0.6.1 (2026-10-05)

- Fixed: "Could not determine if updates are available … GitHub API error 403" on the Plugins screen. Update checks now read a small file attached to each release instead of calling the GitHub API, which shared hosts like Pressable can run out of.

## 0.6.0 (2026-10-05)

- Template builder: custom grids of up to 4 rows × 4 zones (e.g. a banner over three columns), with draggable dividers. Save a grid by name to reuse it in other templates.
- Template spacing: panel padding and space between zones can go to zero, and a template can make the panel fill the whole screen.

## 0.5.0 (2026-10-05)

- Leave out: every dynamic block can skip specific items (by title or ID) and anything in chosen categories or tags, so blocks can share a feed and look different without repeating items.
- Image blocks can hold several images: pick many at once, reorder them, and optionally shuffle daily. Each image plays as its own slide.

## 0.4.0 (2026-10-04)

- Instagram Posts block: your latest photos, reels, and albums in a 9:16 frame with the caption beside it (centered when there's no caption), or a grid in List mode. Reels play muted.
- Instagram Followers block: "Follow us on Instagram" with a live follower count that counts up while it's on screen, plus a QR code to your profile.
- Connect Instagram in Signage → Settings with an access token; it renews itself automatically. See "Instagram" in the README.
- Posts block: regular WordPress posts, filterable by category and tag.
- Hand-pick specific items by title or ID on Posts, Events, Community Board, and Featured Readers blocks.
- Fixed: slide titles showed in the admin's heading color in previews.

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
