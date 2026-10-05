# WOTS Signage (WordPress plugin)

Digital signage for Word on the Street Books. See `docs/signage-plugin-prd.md` for the full spec.

## Status: Phase 2 (parity with the Next.js build)

**Blocks:** image, video, and dynamic blocks. An image block can hold several images (pick many at once, reorder with the arrows, optional daily shuffle); each plays as its own slide for the block's seconds-per-image. Blocks have start/end dates, fit modes, durations, categories, and archiving. Status (active / scheduled / expired) is computed live in the site's timezone, so no cron job is needed.

**Dynamic blocks** read WordPress directly:
- **Upcoming Events** (The Events Calendar): the next few events, every event in the next N days, everything left this month, or everything between two dates (with an optional cap).
- **Posts**: regular WordPress posts, newest first, with featured image, title, date, categories, excerpt, and a QR code to the post. Narrow by category or tag, or hand-pick posts.
- **Hand-picked posts:** Events, Posts, Community Board, and Featured Readers blocks can show specific items (search by title or type an ID). Picked events show soonest first and still drop off once they end; picked postings still need approval and their dates; picked readers show whatever their featured month. Picks aren't carried by Import/Export, since post IDs differ between sites.
- **Leave out:** every source can skip specific items by ID and anything in chosen categories or tags, so two blocks can draw from the same posts and look different (each with its own template) without repeating items.
- **Category filters:** any source can be narrowed to the categories/tags of its own items (event categories, bulletin board taxonomies, book categories). The editor shows how many items match right now.
- **Community Board**: Pods `bulletin_board_item` posts that are published, `approved`, and inside their `start_date`/`end_date` window. A posting drops off the moment its end time passes.
- **Instagram Posts**: the shop account's latest photos, reels, and albums (first slide). Built-in layout: the post in a 9:16 frame on the left with its caption on the right, or centered when there's no caption. List mode shows a grid. Reels play muted.
- **Instagram Followers**: "Follow us on Instagram" with the live follower count and a QR code. While it's on screen the count is re-checked every 15 seconds and counts up, so someone who follows from the shop sees it change (usually within a minute, depending on how quickly Instagram updates its count).
- **Featured Readers**: readers whose `featured_month_year` matches this month (or a pinned month), each with their published recommendations. Book title, cover, and link come live from WooCommerce, and the author comes from `book_author`. A reader's books play back to back.
- **Carousel** shows one item per slide; **List** puts every item on one slide (Featured Readers lists each reader once, with their books under them).
- Each block has its own background image, panel color and opacity, and title/body/meta colors. The built-in layouts match the Next.js player.

**Templates tab:** drag a data source's elements into one of four layouts, resize the regions (drag the handles or use the sliders), set size, alignment, and image fit, add your own **Text** (e.g. "Scan for details"), and see a live preview built from a real event, posting, or book. A template can show **each item's own image full-screen** behind the panel (an event's featured image, a book's cover), darkened to keep text readable; **Starter: image background** makes one in a click. A block uses its own template, otherwise its category's default template, otherwise the built-in layout.

**Shows:** several shows; New, Rename, Duplicate, Delete. **On the TV** lists every show: tick the ones to play and drag them into order. The TV plays them back to back, then repeats. Changes apply at its next check.

**Block preview:** the eye button on a block (or **Preview** in the block editor, which includes unsaved changes) plays just that block with the real player, ignoring its dates, so you can check the layout without waiting for the whole show.

**Player** at `/signage/player/?key=…`:
- **Screen shape** (Settings): landscape 16:9 or 4:3, portrait 9:16 or 3:4. Everything is laid out for that shape and scaled to fit.
- **Keys:** ← / → previous and next slide, Space pause (resumes on its own after 5 minutes), F full screen, Esc leaves full screen (or, logged in, goes back to the Signage screen).
- Transitions between blocks (cut, crossfade, slide, zoom). Within a carousel the background stays put and only the content animates (fade, slide up, zoom). Both are set in Settings and can be changed per block.
- Checks a tiny version endpoint every poll interval (20 s by default) and downloads the playlist only when something changed. Changes apply at the next slide.
- **Offline mode:** a service worker at `/signage/sw.js` keeps the player page, the last playlist, and every image and video in the show. The player keeps looping through Wi-Fi or site outages, and starts up offline after a power cut. A small amber dot appears bottom-right while it can't reach the site. Media no longer in the show is evicted.
- Reloads itself after a plugin update.

**Import / Export tab:** export one show or everything as a zip with a manifest and media (never the player key). On import, nothing changes until you confirm. Images and videos already in the library are matched by file hash and reused. For each name that already exists you choose **Keep mine**, **Replace mine**, or **Import as a copy**. Imported shows aren't added to the TV lineup.

**Settings:** player key (copy / rotate), screen shape, poll interval, default durations, brand color, default transition and content animation. Categories can set a default duration and a default template.

Not yet (Phase 3): heartbeat alerting through n8n, auto-fill ordering pools, scheduled show switching, more data sources, multiple displays, the Next.js importer.

### Instagram

Instagram only shares this through its official API, so it needs a one-time setup. The account must be a **Business or Creator** account. Switching is free: in the Instagram app go to Settings → Account type and tools → Switch to professional account.

1. Go to [developers.facebook.com](https://developers.facebook.com/apps), log in, and **Create app**. Choose the use case for managing messaging and content on Instagram.
2. In the app, open **Instagram → API setup with Instagram login**. Under **Generate access tokens**, add the shop's Instagram account, log in to it, and **Generate token**. If Meta says the account needs a role, add it under App roles → Roles as an Instagram tester, then accept the invite in the Instagram app.
3. Copy the token and paste it into **Signage → Settings → Instagram → Connect Instagram**.

The app can stay in development mode; it only reads your own account, so it doesn't need App Review. Menu names on Meta's site shift from time to time. The token lasts 60 days, and the plugin renews it automatically. If renewal ever fails (say the Instagram password changed), Settings shows the error and the blocks keep showing the last posts they had until you paste a new token. Only the connected account can be shown; other accounts' posts would need the older Facebook-Page-linked API.

### Field names

The data sources use the slugs on the live site. If a Pods field is ever renamed, change it with a filter rather than editing the plugin:

```php
add_filter( 'wots_signage_featured_readers_fields', function ( $f ) {
	$f['rec_author'] = array( 'book_author' );
	return $f;
} );
// Also: wots_signage_community_board_fields, wots_signage_data_sources (add a source).
```

## One-time setup (Mac)

You need three things installed (the plugin targets **PHP 8.3+** to match Pressable; wp-env runs PHP 8.3 in Docker, so there's no PHP to install):

1. **Docker Desktop** (already on your machine from the Next.js build) — must be running.
2. **Node.js 20+** — `brew install node` if you don't have it.
3. **Composer** — `brew install composer`.

Then, in Terminal:

```bash
cd ~/path/to/wots-signage
npm install
composer install
npm run env:start
```

The first `env:start` takes a few minutes: it downloads WordPress, The Events Calendar, Pods, and WooCommerce into Docker containers.

**Pods and The Events Calendar:** The Events Calendar is listed before Pods in `.wp-env.json` on purpose. Switching The Events Calendar on while Pods is already active crashes, because Pods defines a stand-in `tribe()` function. If you ever see that crash locally, run `npm run wp -- plugin activate the-events-calendar.latest-stable --skip-plugins=pods.latest-stable` once.

When it finishes:

| What | Where |
|---|---|
| Local site | http://localhost:8888 |
| wp-admin | http://localhost:8888/wp-admin — user `admin`, password `password` |
| Signage admin | wp-admin → **Signage** |
| Player | wp-admin → Signage → **Settings** → copy the Player URL |

Locally, The Events Calendar has no events yet. Add a couple under **Events** (with featured images) to see event slides.

WooCommerce shows its setup wizard on first login; you can skip it.

## Daily workflow in VS Code

1. Open the `wots-signage` folder in VS Code (File → Open Folder). Accept the prompt to install the recommended extensions.
2. **Terminal → Run Build Task** (⇧⌘B) starts `npm start`, which rebuilds the admin and player bundles on every save.
3. Start WordPress with **Terminal → Run Task → WordPress: start (with Xdebug)**, or `npm run env:start` if you don't need the debugger.
4. Edit PHP in `includes/` and React/TypeScript in `src/` — refresh the browser to see changes. The plugin folder is mounted live into WordPress, so there's no copy step.
5. When you're done: `npm run env:stop`. Your local WordPress data is kept between sessions.

### Debugging PHP

Start WordPress with Xdebug (step 3 above), set a breakpoint in any PHP file, then press **F5** in VS Code ("Listen for Xdebug (wp-env)") and load the page.

PHP errors are logged inside the container. To read them:

```bash
npm run wp -- eval 'echo file_get_contents(WP_CONTENT_DIR."/debug.log");'
```

## Useful commands

| Command | What it does |
|---|---|
| `npm start` | Watch-build admin + player bundles |
| `npm run build` | Production build |
| `npm run env:start` / `env:stop` | Start/stop local WordPress |
| `npm run env:reset` | Wipe the local database and start fresh |
| `npm run wp -- <command>` | Run WP-CLI, e.g. `npm run wp -- plugin list` |
| `composer lint` | WordPress PHP coding standards check |
| `npm run lint:js` | JS/TS lint |
| `npm run plugin-zip` | Build an installable `wots-signage.zip` for Pressable |

## Getting realistic content locally

The plugin reads your Pods types (`reader`, `recommendation`, `bulletin_board_item`), so local WordPress needs the same Pods setup:

1. **Pods structure:** on the live site, Pods Admin → Migrate: Packages → export. Locally, import the package.
2. **Content:** on the live site, Tools → Export (Readers, Recommendations, Community Board, Events, Products). Locally, Tools → Import → WordPress. Or ask Pressable for a database backup and restore it into wp-env if you want an exact copy.

## Project layout

```
wots-signage.php        Plugin bootstrap + autoloader
includes/               PHP (namespace WOTS\Signage, one class per file)
  Plugin.php            Wires hooks together
  PostTypes.php         Blocks, shows, templates, categories + their meta
  Schedule.php          Active / scheduled / expired, in the site timezone
  Resolver.php          TV lineup -> eligible blocks -> playlist items
  Version.php           Playlist version token + what invalidates it
  Sequences.php         Shows, their ordered items, and the TV lineup
  Block_Preview.php     Plays one block (with unsaved edits) for the admin
  Blocks.php            Block summaries for the admin library
  Media.php             Attachment helpers, signage_169 image size
  Settings.php          Poll interval, default durations, brand color
  DataSources/          Data_Source, Filterable and Pickable interfaces, Registry, Events, Posts,
                        Community_Board, Featured_Readers, Instagram_Posts, Instagram_Followers
  Instagram.php         Instagram API client: token, renewal, caching
  Templates.php         Template Builder storage and resolution
  Import_Export.php     Zip export/import with media hash matching
  Rest/                 Player_Controller (key auth), Admin_Controller
  Player_Route.php      /signage/player page and /signage/sw.js
  Admin_Menu.php        Signage menu, Settings page, category fields
  Updater.php           Checks GitHub releases for plugin updates
src/admin/              React admin (Shows, Blocks, Templates, Preview, Import/Export)
src/player/             Standalone kiosk player
src/shared/             Renderer shared by the player and the Template Builder preview
src/sw/                 Service worker for offline playback
bin/check-cache.sh      Pressable cache-bypass check
bin/kiosk/              Shop Mac setup: Chrome kiosk at login (install/start/uninstall)
bin/release.sh          Bump the version, update the changelog, tag a release
lib/                    Bundled Plugin Update Checker (updates from GitHub releases)
.github/workflows/      Builds and publishes the plugin zip when a version tag is pushed
build/                  Compiled JS/CSS (generated — not committed)
.wp-env.json            Local WordPress definition
.vscode/                Editor settings, debugger, tasks
```

QR codes are drawn in the browser (`qrcode-generator`), not in PHP as the PRD's `Qr.php` describes. They work offline and in the admin preview, and there's no Composer dependency to ship.

## Checking Pressable's cache (Phase 1 spike)

After installing the plugin on the Pressable **staging** site, run:

```bash
bin/check-cache.sh https://<staging-site> <player-key>
```

It requests the player page and the version/playlist endpoints twice each and fails if any response lacks `Cache-Control: no-store` or comes back as a cache hit. The plugin also calls Pressable's `batcache_cancel()` on those requests, and the player adds a unique query string to each poll, so a pass is expected. If it fails, ask Pressable support to exclude `/signage/` and `/wp-json/wots-signage/` from caching.

## Setting up the shop Mac (kiosk)

`bin/kiosk/` turns a Mac into a signage screen: Google Chrome in kiosk mode (no address bar, tabs, or toolbar), started at every login, and kept awake.

1. Install **Google Chrome** (not Chromium, which can't play MP4 video).
2. Copy the Player URL from wp-admin → Signage → **Settings**.
3. In Terminal, from this folder:

   ```bash
   bin/kiosk/install.sh "https://www.wordonthestreetbooks.com/signage/player/?key=YOUR-KEY"
   ```

The player opens full screen right away, and again at every login.

| To… | Do this |
|---|---|
| Quit the player | **⌘Q**. It stays closed until the next login (a crash relaunches it by itself). |
| Open it again | `bin/kiosk/start.sh` |
| Change the URL (e.g. after rotating the key) | Run `install.sh` again with the new URL |
| Remove it | `bin/kiosk/uninstall.sh` (add `--purge` to also delete its Chrome profile and offline cache) |

Details:
- It uses its own Chrome profile in `~/Library/Application Support/SignageKiosk/`, separate from your everyday Chrome. The log is `kiosk.log` in the same folder.
- After a power cut it waits up to two minutes for the network before loading, and never shows Chrome's "Restore pages?" bar.
- The Mac and display stay awake while the player runs.
- For hands-off recovery after a power cut, turn on automatic login for this account (System Settings → Users & Groups), and in System Settings → Energy, turn on "Start up automatically after a power failure" if your Mac offers it.
- To mirror to the TV, pick the TV in Control Center → Screen Mirroring once. macOS reconnects to the same AirPlay display on its own.

## Kiosk video note

Signage videos are H.264 MP4 (PRD §12). Google Chrome plays those; the open-source Chromium build does not include the H.264 codec. If the shop Mac runs Chromium and a video block gets skipped (the Preview tab shows a "Video failed to load" error from the player), switch the kiosk to Chrome in kiosk mode or upload WebM (VP9) instead.

## Releases and updates

The plugin updates itself from this repo's GitHub releases, like a plugin from WordPress.org. When a new release is out, **Plugins** shows "There is a new version of WOTS Signage available" with an **Update now** link. WordPress checks about twice a day; the **Check for updates** link under the plugin's row checks immediately.

To publish a new version:

```bash
bin/release.sh patch     # 0.2.1 -> 0.2.2 for fixes (or: minor, major, or an exact 1.0.0)
git push && git push --tags
```

`release.sh` sets the version in `wots-signage.php` and `package.json`, adds a `CHANGELOG.md` entry from your commit messages (edit it before confirming if you like; it becomes the release notes), commits, and tags. Pushing the tag runs `.github/workflows/release.yml`, which builds `wots-signage.zip` and attaches it to a GitHub release. Watch it under the repo's **Actions** tab; it takes a couple of minutes.

Then update **staging** first, check the TV preview, and update the live site. The shop player reloads itself after the update.

Versions follow `major.minor.patch`: patch for fixes, minor for new features, major for big or breaking changes. The workflow refuses to publish if the tag and the version in `wots-signage.php` disagree.

Update checks use [Plugin Update Checker](https://github.com/YahnisElsts/plugin-update-checker) (MIT), bundled in `lib/`. To turn them off on a local copy: `add_filter( 'wots_signage_check_for_updates', '__return_false' );`

## Deploying to Pressable

The first install is a manual upload: download `wots-signage.zip` from the latest [GitHub release](https://github.com/idmo/wots-signage-wp-plugin/releases), then Plugins → Add New Plugin → Upload Plugin on the **staging** site first. After that, updates arrive on their own (see above). To build a zip locally instead, run `npm run plugin-zip`.
