# Digital Signage for the Shop — WordPress Plugin Edition
## Product & Technical Requirements Document

**Owner:** Brian Maggi
**Businesses served:** Word on the Street Books (2044 First Street, Livermore) and Showmentum
**Status:** Plugin Edition v1. Phases 1 and 2 built (plugin 0.2.0, October 1, 2026). Derived from the Next.js PRD v8 (September 20, 2026)
**Date:** October 1, 2026
**Working name:** `wots-signage` (WordPress plugin)

---

## 0. Why a Plugin, and How This Relates to the Next.js Build

The Next.js + Postgres + worker system described in PRD v8 works, but most of its architecture exists to **get WordPress data out of WordPress**: polling, caching, sync logs, a custom REST endpoint, and an n8n push path for real-time corrections. Building signage as a WordPress plugin removes that whole layer. Content is queried directly where it lives, edits are live immediately, the media library *is* the asset store, and the host Mac only needs to run a kiosk browser.

**Decisions carried into this edition:**
- **Pods stays a dependency.** The plugin reads Brian's existing Pods content types (`reader`, `recommendation`, `bulletin_board_item`) directly. It does **not** use Pods Templates for display; all on-screen rendering is done by the plugin's own Template Builder (§7), which replaces Pods' template language entirely.
- **The Next.js system keeps running in the shop** until the plugin reaches parity. The two must coexist on the same WordPress site without interfering (§15).
- **Hosting is Pressable** (managed WordPress). See §12 for the caching, cron, and media implications.

Everything not explicitly changed here (goals, content model, Featured Readers grouping behavior, display modes, scheduling rules) carries over from PRD v8.

---

## 1. Overview & Vision

A WordPress plugin that lets Brian build looping sequences ("shows") of 16:9 "blocks" — images, videos, and template-driven slides built from WordPress content — and play them full-screen on the shop TV. The player is a public-but-keyed page on the WordPress site, opened in a kiosk browser on the shop Mac and mirrored to the TV via AirPlay.

### Goals (unchanged from v8, restated briefly)
- Fast publishing and rotation of promotional content without touching code.
- WordPress/WooCommerce remains the single source of truth: book title, cover, and purchase link always trace back to the Square-synced WooCommerce product.
- Shelf-life scheduling lives where content is authored; general store content runs evergreen.
- Write-once, reuse-over-time content (readers, recommendations).
- Upcoming events and community content appear automatically.
- Professional, template-driven 16:9 output.
- Easy backup/restore of a show.

### New goals in this edition
- **Zero sync latency.** A saved edit in WordPress appears on the TV within the player's refresh window (target: under 30 seconds) with no webhook or n8n plumbing required.
- **Survive outages.** The player keeps looping the last good show if the shop's internet or the website goes down (§8.4).
- **Minimal shop hardware footprint.** The shop Mac runs only a browser — no Docker, Postgres, or Node.

### Non-goals (v1)
- Multi-display fleet management (architected for via per-display keys, not built).
- Touch interactivity on the display.
- A public self-serve CMS for outside contributors (Community Board stays curated, §6.2).
- Replacing Pods as the content-modeling layer.

---

## 2. Key Concepts & Vocabulary

Same as PRD v8 (Block, Category, Template, Schedule, Sequence/"Show", Featured Month and Year, Block Name, Player), with these changes:

| Term | Definition in this edition |
|---|---|
| **Data Source** | A server-side PHP provider class that returns items for a block. No longer an external feed to poll — providers query WordPress directly (`WP_Query`, Pods API, The Events Calendar functions). |
| **Player Key** | A secret token that authorizes a kiosk to fetch the playlist. Generated in Settings; rotatable. Future multi-display support gives each display its own key. |
| **Playlist Version** | A short hash representing the current resolved state of the live show. The player polls it cheaply and only re-downloads the full playlist when it changes. Replaces the n8n push path. |

---

## 3. Content Model — Blocks

Block types, common properties, duration defaults, and multi-item behavior are **unchanged from PRD v8 §3**, including:
- Three block types: Static Image, Video, Dynamic/Templated.
- Fit modes: `cover`, `contain`, `contain-with-blurred-background`.
- Carousel and List display modes.
- **Featured Readers grouping:** all of a reader's recommendations play consecutively (Carousel), or nest under one header per reader (List), preserving first-seen reader order. The logic in `groupEntriesByReader()` / `groupFormattedReaders()` is ported from TypeScript to PHP.

**Changes:**
- **Video duration** comes from WordPress attachment metadata (`wp_get_attachment_metadata( $id )['length']`), which WordPress populates on upload. No ffprobe. If metadata is missing, the block editor asks for a manual duration.
- **Assets** are always media library attachments, referenced by attachment ID. No separate asset table or local cache on the server side.

---

## 4. Scheduling

Unchanged rules: eligible when `start_date <= today` and (`end_date` is empty or `end_date >= today`). No end date means evergreen.

**Change:** status (`active` / `expired`) is **computed at resolve time** rather than set by a background sweep, using the site's timezone (`wp_timezone()`). This removes the need for a cron job to expire content. A stored `archived` flag remains for manual removal.

---

## 5. Sequences ("Shows")

Unchanged from PRD v8 §5: named, ordered collections of blocks; one live at a time; drag-and-drop ordering; optional auto-insert and auto-fill pools (Phase 3); resolved at playback time into an ordered playlist with dynamic blocks expanded into items.

**Change:** "re-resolve every 5 minutes" is replaced by playlist-version polling (§8.3), so changes show up in seconds instead of minutes.

---

## 6. Content Sources (Direct Queries, No Sync)

Each data source is a PHP provider implementing one interface:

```php
interface Data_Source {
    public function key(): string;              // 'events' | 'community_board' | 'featured_readers'
    public function label(): string;
    public function elements(): array;          // palette for the Template Builder (§7)
    public function items( array $block_config ): array; // normalized items for the player
}
```

New sources register through a filter (`wots_signage_data_sources`), so §6.5-style additions (Staff Picks, Announcements, blog posts) are a new class, not a schema change.

### 6.1 Events (The Events Calendar)
- Query with `tribe_get_events()` (upcoming, published), not the REST API.
- Fields: featured image, title, start/end date and time, excerpt, description (HTML), event URL for the QR code.
- Past events drop out automatically because only upcoming events are queried.

### 6.2 Community Board (Pods)
- Query the `bulletin_board_item` Pods type (the name on the live site), filtered to published posts with `approved` checked. Its fields are `start_date` (date), `end_date` (datetime), `website` (QR target), and `approved`; an `organization` field is supported if added. Slugs can be changed with the `wots_signage_community_board_fields` filter.
- Start/end dates on the post drive eligibility.
- Intake workflow unchanged: WPForms → draft post → Brian approves.

### 6.3 Featured Readers (Pods + WooCommerce)
Same data model as PRD v8 §6.3:
- `reader` CPT with free-text `featured_month_year`; reader photo from the post's Featured Image.
- `recommendation` CPT with `reader` and `book` relationship fields, a `book_author` text field, and the blurb in post content (run through `the_content`). (The old mu-plugin read a field named `author`, so authors never reached the TV; the plugin reads `book_author`, falling back to `author`.)
- Book title, cover, and purchase link come live from the related WooCommerce product.

**Change:** the joining logic in `docs/featured-readers-endpoint.php` moves into the `Featured_Readers` provider class. The month normalization (`signage_parse_month_year()` → "Y-m") is ported as a **namespaced** method, not a global function, so it can't collide with the existing mu-plugin while both are active (§15).

A block's optional "Month & Year" setting still pins a period; blank means current month via `current_time( 'Y-m' )`.

### 6.4 The `signage/v1` endpoint
Stays in place, unchanged, for as long as the Next.js system is running. The plugin does not depend on it. It can be retired at cutover.

### 6.5 Future sources
Staff Picks / New Arrivals (WooCommerce product tag), Announcements, latest blog post — unchanged from v8, each now just a provider class.

### 6.6 Shelf-life scheduling
Unchanged from PRD v8 §6.6.

### 6.7 CSV
Deprioritized. With every content type already in WordPress, CSV import is a Phase 3 nice-to-have rather than a fallback requirement.

---

## 7. Templates & the Template Builder

The drag-and-drop Template Builder from the Next.js build is **ported into wp-admin** and fully replaces Pods Templates for anything shown on screen.

- **Layouts:** the same three CSS Grid layouts — `stack`, `split_left`, `split_right` — with named regions.
- **Palettes per data source:**
  - Events: featured image, title, date/time, excerpt, description (HTML), QR code, Block Name.
  - Community Board: featured image, title, organization, content (HTML), QR code, Block Name.
  - Featured Readers: book cover, book title, author, reader name, reader photo, blurb (HTML), QR code, Block Name.
- **Element types:** image, text, html, qr — each with fallback behavior for missing data (e.g., no image → solid brand-color background).
- **Built-in fallback layout** per data source when a block has no template assigned.
- **Storage:** each template is a `signage_template` post whose post meta holds the data source key, layout, and element placements as JSON.
- **Preview:** the builder renders a live preview using a real item from the selected data source.
- **HTML fields** are sanitized with `wp_kses_post()` before output.
- **Image size:** the plugin registers `add_image_size( 'signage_169', 1920, 1080, true )` and uses it for template images, falling back to the full-size original.

The player and the builder preview share one renderer (`TemplateSlide` / `ElementRenderer`, ported from `app/player/page.tsx`), so what Brian sees in the builder is what plays on the TV.

---

## 8. Player

### 8.1 Hardware & hosting
Unchanged: the shop Mac runs Chromium in kiosk mode, mirrored to the TV via AirPlay, auto-launched by a `launchd` agent. **The Mac no longer runs Docker or any server.**

### 8.2 Player page
- URL: `https://www.wordonthestreetbooks.com/signage/player/?key=<player-key>` via a plugin rewrite rule.
- Rendered as a minimal standalone HTML page (no theme header/footer, no admin bar), loading only the player bundle.
- The key is checked with `hash_equals()`. A bad or missing key shows a neutral "Display not authorized" screen.
- The page and all player REST responses send `Cache-Control: no-store` so Pressable's page cache never serves a stale playlist (§12).

### 8.3 Playlist & refresh
- `GET /wp-json/wots-signage/v1/player/version?key=…` returns a small hash of the live show's resolved state. Polled every 15–30 seconds (configurable).
- `GET /wp-json/wots-signage/v1/player/playlist?key=…` returns the fully resolved playlist (blocks, expanded dynamic items, rendered template data, media URLs). Fetched only when the version changes.
- The version hash invalidates automatically on `save_post` for any signage-relevant post type (blocks, sequences, templates, events, community board, readers, recommendations, products referenced by a recommendation) and on settings changes.
- **Refresh Now** in the admin bumps the version immediately.
- This replaces PRD v8's n8n webhook path entirely. Edits made in WordPress reach the TV within one version-poll interval.

### 8.4 Offline resilience (required before cutover)
- A service worker, served from `/signage/sw.js` through a rewrite so its scope covers the player page, caches:
  - the last good playlist, and
  - every image and video it references (Cache API).
- If the version or playlist request fails, the player keeps looping the cached playlist and retries in the background with backoff.
- Media for upcoming items is pre-cached so the next slide never waits on the network.
- The service worker evicts media that's no longer in the current playlist, to keep cache size bounded.

### 8.5 Health
- The player posts a heartbeat (`POST /wots-signage/v1/player/heartbeat`) with current item, playlist version, and last error.
- The admin shows "Player last seen N minutes ago."
- **n8n alerting (optional, Phase 3):** an n8n workflow on a schedule checks a status endpoint and notifies Brian if the player hasn't checked in during store hours. This is where n8n fits in the plugin model: monitoring, not sync.

---

## 9. Admin UI (wp-admin)

A top-level **Signage** menu, with screens:
1. **Blocks** — library filterable by category, status, type, and source.
2. **Block Editor** — per type; dynamic blocks pick a data source, template, display mode, and (Featured Readers) "current month" or a pinned period.
3. **Shows** — sequence builder with drag-and-drop ordering and a "Go Live" action.
4. **Templates** — the Template Builder (§7).
5. **Preview** — live player preview in an iframe, with **Refresh Now** and player status.
6. **Import / Export** (§14).
7. **Settings** — player key (generate/rotate), poll interval, default durations per category, brand color, resolution.

The Blocks, Shows, and Templates editors are React apps built with `@wordpress/scripts` and `@wordpress/components`; dnd-kit is reused for drag and drop.

**Permissions:** a custom `manage_signage` capability, granted to Administrators by default and optionally to the Shop Manager role so staff can manage signage without full admin rights.

---

## 10. Data Model (WordPress-native)

```
signage_block (CPT, non-public, show_in_rest)
  post_title            -> block name (internal; also the "Block Name" template element)
  meta:
    _block_type         static_image | video | dynamic_template
    _start_date         Y-m-d (empty = immediately)
    _end_date           Y-m-d (empty = evergreen)
    _duration_seconds   int (manual for image/dynamic; auto for video)
    _fit_mode           cover | contain | contain-blur
    _archived           bool
    static_image:       _image_id, _text_heavy
    video:              _video_id
    dynamic_template:   _data_source, _template_id, _display_mode (carousel|list),
                        _per_item_duration, _max_items, _list_label,
                        _featured_month_year (Featured Readers only; empty = current month)
  taxonomy: signage_category

signage_category (taxonomy)
  term meta: _default_duration, _default_template_id, _color

signage_sequence (CPT, non-public)
  post_title            -> show name
  meta:
    _items              JSON [{ block_id, pinned }] in play order
    _autofill           JSON config (Phase 3)
  option: wots_signage_live_sequence -> live sequence ID

signage_template (CPT, non-public)
  post_title            -> template name
  meta:
    _data_source        events | community_board | featured_readers
    _layout             stack | split_left | split_right
    _placements         JSON { region: [ { element, options } ] }

options:
  wots_signage_settings      poll interval, default durations, brand color
  wots_signage_player_key    player key (stored as-is so Settings can show the kiosk URL)
  wots_signage_version       current playlist version hash
  wots_signage_heartbeat     last heartbeat payload
```

Custom post types are chosen over custom tables because they come with revisions, trash, capabilities, REST support, and WordPress export without extra code. Data volume (dozens to low hundreds of blocks) is far below the point where custom tables would matter.

---

## 11. Technical Architecture

### 11.1 Plugin structure

```
wots-signage/
  wots-signage.php              bootstrap, constants, autoloader
  composer.json                 dev tools (coding standards); autoloading is built into wots-signage.php
  includes/
    Plugin.php                  wires everything together
    PostTypes.php               signage_block, signage_sequence, signage_template, signage_category
    Rest/                       Admin_Controller, Player_Controller (namespace wots-signage/v1)
    DataSources/                Data_Source interface, Events, Community_Board, Featured_Readers
    Resolver.php                sequence -> eligible blocks -> expanded playlist
    Grouping.php                Featured Readers grouping (ported from lib/resolve.ts)
    Version.php                 playlist version hashing + invalidation hooks
    Player_Route.php            rewrite rules for /signage/player and /signage/sw.js
    Import_Export.php
  src/
    admin/                      React: Blocks, Shows, Templates, Preview, Settings
    player/                     player app + shared TemplateSlide/ElementRenderer
    sw/                         service worker
  build/                        compiled assets (@wordpress/scripts)
```

### 11.2 Stack
- **PHP 8.3+** (Pressable no longer offers older versions), namespaced (`WOTS\Signage`), PSR-4 via Composer. Vendor dependencies are committed or built into the release zip so nothing runs Composer on the server.
- **React + TypeScript** for admin and player, built with `@wordpress/scripts`.
- **Styling:** plain CSS (or CSS modules) in wp-admin to avoid clashing with core admin styles. Tailwind is fine in the player bundle, since the player page is standalone.
- **QR codes:** generated in the browser as SVG (`qrcode-generator`), so they work offline and in the builder preview with no Composer dependency. (Changed from `chillerlan/php-qrcode`.)
- **Rendering split:** PHP resolves and normalizes data; React renders. The playlist endpoint returns data, not HTML, so the player and builder preview share one renderer.

### 11.3 REST API (`wots-signage/v1`)
Admin (requires `manage_signage`, nonce-authenticated):
- `GET/POST/PUT/DELETE /blocks`, `/sequences`, `/templates` (or the core CPT REST routes where sufficient)
- `PUT /sequences/{id}/items`, `POST /sequences/{id}/activate`
- `GET /data-sources`, `GET /data-sources/{key}/preview`
- `POST /player/refresh-now`
- `GET /export/sequence/{id}`, `GET /export/full`, `POST /import`

Player (requires player key):
- `GET /player/version`, `GET /player/playlist`, `POST /player/heartbeat`

Monitoring (requires a separate read-only status key, for n8n):
- `GET /status`

### 11.4 Development workflow
- Local WordPress for development (e.g., Local or `wp-env`) with Pods, The Events Calendar, and WooCommerce installed, plus a copy of production content for realistic testing.
- Source in a private GitHub repo.
- Deploy by uploading a built release zip, or via Pressable's Git/SFTP deployment.

---

## 12. Hosting on Pressable

- **Page cache:** The player page and every `wots-signage/v1` response must send `Cache-Control: no-store` / `nocache_headers()`. Verify early in Phase 1 that Pressable's edge and page caches respect this for the `/signage/player/` path and the REST routes; if not, ask Pressable support to exclude them.
- **Cron:** the design avoids depending on WP-Cron. Expiration is computed at resolve time, and there's no polling. If a scheduled task is added later (e.g., cache warming), confirm how Pressable runs WP-Cron for the site.
- **Media & video:** images and videos are served from the media library through Pressable's CDN. The player's service worker cache means each video is downloaded once per change, not on every loop.
- **Upload limits:** confirm Pressable's maximum upload size for video files, and keep signage videos compressed (H.264 MP4, 1080p).
- **Staging:** use a Pressable staging site to test plugin releases before production, especially while the Next.js system is reading the same production content.

---

## 13. Non-Functional Requirements

- **Display:** 16:9; 1080p primary, 4K supported.
- **Freshness:** saved edits visible on the TV within one version-poll interval (≤30s target).
- **Resilience:** the player keeps playing through internet or site outages using cached content (§8.4) and recovers automatically.
- **Performance:** the playlist endpoint resolves in under 500 ms for a typical show; the version endpoint is near-free (an option read).
- **Security:** admin uses WordPress authentication and the `manage_signage` capability. Player access uses a rotatable key compared in constant time. No player endpoint exposes unpublished or unapproved content beyond what's in the live show.
- **Isolation:** the plugin must not fatally conflict with the existing `featured-readers-endpoint.php` mu-plugin (namespaced code, distinct REST namespace).

---

## 14. Import / Export

Same intent as PRD v8 §13, adapted to WordPress:
- **Show export:** a JSON manifest of one sequence, its blocks, templates, and categories, plus referenced media files, in a zip.
- **Full export:** all signage CPTs, categories, and settings (excluding the player key), plus media.
- **Import:** validates the manifest, matches media by file hash against the existing media library, and prompts per conflict (skip, overwrite, import as copy). Merges by default.
- **Next.js importer (optional):** read the Next.js system's existing export bundle and convert blocks, sequences, and templates into plugin records, so the current curated show doesn't have to be rebuilt by hand.

---

## 15. Coexistence & Cutover

While the Next.js system keeps running in the shop:
- The `signage/v1` mu-plugin endpoint stays active and untouched.
- The plugin uses its own REST namespace (`wots-signage/v1`) and its own namespaced PHP code, so nothing collides.
- The plugin reads the same Pods and WooCommerce content, so both systems show the same source data.
- The plugin's player can be tested on any browser (or a second screen) using its own key, without touching the shop kiosk.

**Cutover checklist:**
1. Plugin reaches parity: all three data sources, Template Builder, Carousel/List, multiple shows, offline mode.
2. Import the current show (Next.js importer, or rebuild).
3. Run the plugin player in parallel for a few days on a test screen.
4. Point the shop kiosk's `launchd` agent at the plugin player URL.
5. Stop the Docker containers on the shop Mac and remove their auto-start entry.
6. Retire the `featured-readers-endpoint.php` mu-plugin once nothing calls it.

---

## 16. Open Questions

1. **Community Board approval:** dedicated `approved` Pods field, or WordPress Draft → Publish status? (Carried over from v8.)
2. **WPForms → Pods hand-off:** Post Submissions add-on, or manual creation for v1? (Carried over.)
3. **Next.js importer:** worth building, or is rebuilding the current show by hand acceptable?
4. **Staff access:** should the Shop Manager role get `manage_signage` by default?
5. **Pressable caching:** confirm the player path and REST routes bypass the page and edge cache (Phase 1 spike).
6. **Video size budget:** what's the largest signage video expected, given Pressable upload limits and service worker cache size?
7. **§6.5 sources:** any of Staff Picks, Announcements, or blog slides wanted before cutover?

---

## 17. Phasing

**Phase 1 — Foundation**
- Plugin skeleton, Composer autoload, `@wordpress/scripts` build.
- CPTs, category taxonomy, `manage_signage` capability.
- Block CRUD for static image and video; scheduling (computed status).
- Single sequence with drag-and-drop ordering.
- Player page with key auth, playlist + version endpoints, Refresh Now.
- Events data source with a built-in fallback layout.
- Pressable cache-bypass verification.

**Phase 2 — Parity with the Next.js build**
- Template Builder ported to wp-admin (all three palettes, Block Name, three layouts).
- Community Board and Featured Readers data sources, including reader grouping and month pinning.
- Carousel and List modes.
- Multiple shows with live switching.
- Service worker offline mode (required before cutover).
- Show and full import/export.

**Phase 3 — Cutover and beyond**
- Optional Next.js importer; cutover per §15; retire Docker setup and mu-plugin.
- Player heartbeat, status endpoint, and n8n alerting workflow.
- Auto-fill/auto-insert ordering pools.
- §6.5 content sources.
- Scheduled show auto-switching.
- Multi-display support (per-display keys and live shows).
- CSV import, if still wanted.
