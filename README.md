# Ballistics Calculator

A static web app for long-range shooting: REAL (real rifles, the default page) and GZW (Gray Zone Warfare). WARDOGS is planned once it has a data source.

## REAL

The first-shot scope setting for a real rifle at 100–2000 m, from presets of the most-used Czech army and police long rifles and their ammunition (the presets and their sources come from `docs/superpowers/research/2026-10-31-czech-rifles-ammo.md`).

- **Dial or hold:** the elevation and windage to set on the turret in clicks, or to hold in the reticle, in MRAD or MOA.
- **Atmosphere:** standard air, or set it by hand (temperature, pressure, humidity, altitude, height above ground, latitude, powder temperature) on the station line. The shooting direction and the wind are in the bottom bar: a phone's dock opens them as two panels, Distance and Wind. After `By location` the wind line offers the forecast wind at your height, applied only on `Use`.
- **Calculation view:** how the answer was reached, step by step, with each effect's share of the hit and a switch to take it out.
- **Settings sheet:** the rifle, round and scope tags open one sheet with a section each (twist, accuracy, BC, muzzle velocity, truing, zero, sight height, travel). A section resets to the preset on its own, with an undo. On a phone the tags show an icon and a short name.
- **Sharing:** the share button in the sheet copies the link (the setup, the preset's changes and the language path, never the station), or shows it in a field to copy by hand when the browser refuses the clipboard.
- **Big figure:** value or clicks when dialling, in the ⚙ sheet.
- **Wind:** type the speed (a decimal comma works) or press or drag anywhere on the wind clock.
- **Your own rifles, rounds and scopes:** each picker in the settings sheet lists them first with a `custom` tag and ends with `+ Add …`, which opens a form in place. Required fields come first, the optional ones after a hairline, each marked `optional`. An optional field left empty switches its effect off, and the calculation sheet and the main screen say so (`For a more precise answer, add: …`, `wind not set`). Delete has an undo. On a round, a hint offers a muzzle velocity for a barrel of another length (7.5 m/s per inch, a rough rule you accept or not). A custom scope's unit sets the display angle.
- **Where they are kept:** `gb.real.library` in the browser (`{ v: 1, rifles, rounds, scopes }`), across releases, never sent anywhere. Clearing the site's data deletes them. The same key holds `migratedCustomEntry`, the text of the old Custom entry the migrated items came from.
- **The old `Custom` preset:** on the first load of 0.1.4, the overrides stored for `Custom` in `gb.real.profiles` move into the library as a rifle and a round named `Custom`, and a scope `Custom` when scope values were stored. Only the values you had overridden move, never the old preset's placeholders, so the items can be incomplete: the page then asks for what is missing (`To compute, add: …`). The `custom` entry leaves `gb.real.profiles` once the library holds them, and a stored setup or a link with `p=custom` opens them.
- State is kept in `gb.real.setup`, `gb.real.profiles`, `gb.real.profile` (with `addNoteSeen`), `gb.real.station`, `gb.real.library` and, per tab in sessionStorage, `gb.real.written`.

## GZW

One page, the **workbench**, with one view that fits a screen: the setup as tags in the header, a scope view with hold over and lead, the verdict, one armor line, and the toolbar.

- **Shoot or close in?** The chance to hit the head (or the chest) from the weapon's group, your stance (standing, kneeling, prone), how sure you are of the distance and the lead, with the distance where it becomes worth the shot.
- **Setup menus**: the weapon tag picks the weapon (it comes with its best round), its cog the barrel and the real accuracy, the round tag the round, the scope tag the scope and its zero (in the game's 50 m steps).
- **Distance**: a slider, the wheel or a trackpad over the scope, or mil ranging: set what the whole target spans in the reticle (standing, kneeling, or prone across) and the distance follows. The figure in the scope carries its size in MIL or MOA.
- **Armor by class**: the highest class the round usually penetrates at that distance, with the pen strip for the rest and the energy it has lost past 150 m.
- **Screenshot import**: paste (Ctrl+V), drop or pick a screenshot of your character with the inventory and the weapon detail open. OCR runs in the browser and offers the weapons it found (the fastest preselected), the round that fits, the barrel, scope and real accuracy, after you confirm them.
- Fits a screen from 1366×768 up, in landscape and portrait, and works on a phone. ⓘ holds how to read the answer (REAL), the data sources, the fan-project note, privacy and the version. The version (`package.json`) also shows faintly in the bottom-right corner on a desktop.

English with a Czech switch, metric or imperial, MIL or MOA. The language is the first part of the address, `/cs/` or `/en/`. Every setting lives in the URL, so a link reproduces the setup. The browser also keeps the last setup (`gb.gzw.setup`) and the profile (`gb.gzw.profile`) in localStorage; nothing leaves the browser.

**What's new:** `/cs/changelog/` and `/en/changelog/`, linked from ⓘ next to the version (`changelog/#gzw`: the page takes that game's palette and leads back to its workbench), list what each version brought, newest first, from `src/changelog/entries.ts`. Each release adds its entry in Czech and English and the deploy fills in its date (`null` until then); a test fails while the newest entry isn't the `package.json` version.

The numbers are estimates from real-world ballistics (point-mass G7/G1 solver, published BCs). The game tunes its own.

## Commands

```bash
npm install
npm run dev        # dev server
npm test           # vitest
npm run build      # typecheck + production build into dist/
npm run data:gzw   # refresh src/games/gzw/data/gzw-data.json (needs network)
npm run icons      # regenerate the four app icon PNGs (scripts/make-icons.mjs); favicon.svg is hand-written
python3 -m unittest scripts/test_build_gzw_data.py -v   # data build tests
```

The app makes no network requests on its own. The one exception is REAL's `By location` button, described under Weather. Game data is baked at build time and committed. The OCR engine (tesseract.js worker, LSTM wasm cores and English data) is copied from `node_modules` into `public/ocr/` by `scripts/copy-ocr-assets.mjs` before `dev` and `build`, served with the app and loaded only on the first import. `public/ocr/` is gitignored. Review `git diff src/games/gzw/data/` after `npm run data:gzw`; the script prints counts, source disagreements and suspicious values.

## Layout

- `src/engine/`: units, drag tables, atmosphere, trajectory solver, aim (holdover, lead, group size). Game-agnostic.
- `src/components/`: scope view, header, popover menus, pickers, the wheel hook. Game-agnostic; `architecture.test.ts` enforces that neither folder imports from `games/`.
- `src/games/real/`: REAL presets, solver, station, setup menus and the calculation sheet.
- `src/games/gzw/`: GZW data, penetration and armor rules, pages and GZW-only components. `ocr/` holds the screenshot import: preprocessing, the text parser (tested on text from real screenshots) and a Node test that runs real OCR on `ocr/fixtures/`.
- `src/i18n/`: English and Czech strings.
- `scripts/build_gzw_data.py`: builds the GZW data from gzw-data.dev and the GZW Fandom wiki through the `gzw-skill` CLI.

## Data sources

- [gzw-data.dev](https://gzw-data.dev): weapons, parts and ammo.
- [GZW Fandom wiki](https://gray-zone-warfare.fandom.com/wiki/Ballistics) (CC BY-SA 3.0): the penetration chart, which also gives each round's muzzle velocity and accuracy modifier (these win over gzw-data, whose accuracy signs are flipped for about 20 rounds), and the barrel pages' muzzle-velocity modifiers that gzw-data lacks.
- Ballistic coefficients: published real-world values, listed with sources in `src/games/gzw/data/ballistics-constants.json`.

## Installing

The app can be added to a phone's home screen: `public/manifest.webmanifest` (name `Ballistics`, `standalone`, one app for both languages) and the icons from `npm run icons`. A phone's first browser visit shows a one-time note (`gb.install`), and ⓘ keeps the steps. There is no service worker and no offline mode yet; an installed app loads the current site when it starts fresh. GitHub Pages lets browsers cache the page for up to 10 minutes, and iOS may resume a suspended app without reloading it, so a new release can take a little while to show. `--safe-top` and `--safe-bottom` keep the header, docks and sheets clear of the notch and home bar.

## Weather (REAL, `By location`)

The button asks the browser for a position, then calls [Open-Meteo](https://open-meteo.com/) (weather, CC BY 4.0) for the forecast and the Elevation API (Copernicus DEM GLO-90) for the altitude. `fetch` lives only in `src/games/real/weather.ts`; `architecture.test.ts` checks that. Privacy: the first tap shows a note (`Continue` / `Cancel`, remembered as `locationNoteSeen` in `gb.real.profile`). Coordinates are rounded to two decimals (about 1 km) before they leave the phone, and the app requests a 10x10 elevation grid over that cell and interpolates locally, so the exact position is never sent or stored. Open-Meteo keeps its logs for 90 days. The last weather is cached in `gb.real.weather` with the cell and the altitude asked for: reused without a request when under 30 minutes old in the same cell, used as a fallback when under 3 hours old (with a typed altitude, only a cache for that altitude). Requests time out after 10 s. The fields it fills are tagged `model`; the model time appears once, in the attribution line and on the station line. After 3 hours, or when the model time is unusable, the main screen warns that the weather is old.

Model weather belongs to an altitude: Open-Meteo's surface pressure and 2 m temperature are the values at the `elevation=` sent. A typed altitude is sent as that elevation, and the grid request is skipped. Editing the altitude afterwards moves a model station pressure (by the ISA ratio, as the QNH path does) and a model temperature (6.5 °C per km) with it, so the tap order doesn't change the air. A value the forecast lacked or had out of range goes back to standard, and the sheet names it. After a denial, a later tap reads the Permissions API, which asks nothing, and tries again only if location is now `granted` or `prompt`.

## Deploy

`.gitlab-ci.yml` at the repo root builds this app into `public/ballistics/` on the default branch, next to the root `site/index.html`. The app is deployed to GitHub Pages: the repo `sedlak911/ballistics` holds only the contents of this folder, and its `.github/workflows/pages.yml` runs `npm ci`, `npm test` and `npm run build` on push to main and serves https://sedlak911.github.io/ballistics/. Vite's `base: './'` makes the build work under a subpath, as long as the deploy folder itself isn't named `cs` or `en`: `src/lang.ts` (`appRoot`) takes a trailing `cs/` or `en/` for the language. The language is in the path: the app's pages are `cs/` and `en/`, and the root `index.html` only redirects to one of them (an old link's `l=`, then the stored language, then the browser's), keeping the rest of the hash, without `l=`. Without JavaScript it links to both. `npm run build` ends with `scripts/check-dist.mjs`, which fails unless every reference in the five built pages (the root, `cs/`, `en/` and both `changelog/` pages) resolves under `dist/` (a folder counts when it holds an `index.html`) and the OCR assets are there.
