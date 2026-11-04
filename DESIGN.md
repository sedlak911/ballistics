# Ballistics Calculator design manual

This is the brief for every visual change in `ballistics/`: styles, components, layout and new pages. It wins over the defaults of any design skill (frontend-design, taste-skill, UI/UX Pro Max). The owner chose every part of this look, including the parts those skills call generic or ban:
- a near-black ground with one bright accent;
- tracked uppercase labels;
- monospace figures and tags;
- square corners;
- translucent blurred panels;
- the glow;
- the reticle, crosshairs and corner marks.

**Visual references.** The owner approved these mockups on 2026-10-30. Open them in a browser and switch the game in the top bar:
- [`2026-10-30-style-full.html`](../docs/superpowers/specs/assets/2026-10-30-style-full.html): the retired Full view; its type and surfaces still hold.
- [`2026-10-30-style-focus.html`](../docs/superpowers/specs/assets/2026-10-30-style-focus.html): the view the app keeps.
- [`2026-10-30-style-scope.html`](../docs/superpowers/specs/assets/2026-10-30-style-scope.html): the scope view, with the earlier draft beside the reviewed version ("Po v2").

Where the mockups and this manual disagree, the manual wins:
- **Views:** the app has one view, the Focus mockup's. Full, with its setup column, callouts, chart and panels, is gone.
- **Scope:** the scope in the Full and Focus mockups is the earlier draft. The scope mockup and the "Scope view" section below replace it.
- **Pages:** the mockups predate the one-page app, so their page links and the `Share setup` and `Cheat sheet` buttons are gone.
- **Content:** the mockups' data and copy are illustrative.

**Status (2026-10-31).** The app is restyled to this manual (plan `docs/superpowers/plans/2026-10-30-restyle.md`) and down to one view (plan `docs/superpowers/plans/2026-10-31-focus-only.md`). Where that work settled something the mockups left open, this manual records what was built.

## Character

The site is an **instrument**, a tool read mid-fight on a second monitor or a phone. The layout, typography and components come from gzwloadout.com:
- condensed uppercase headings and labels;
- monospace figures;
- square, hairline, translucent panels with accent corner marks;
- a single accent hue per game.

The WARDOGS colours come from the game's official website, so that section feels like its game. REAL and GZW palettes are ours: a cool signal cyan for REAL, a jungle night-vision green for GZW.

Every screen leads with **the answer** to its question and puts the **evidence** behind it. The workbench's question is "shoot or close in, and where do I aim?"

## The one view

The app is one page, the workbench, with one view: the answer and the inputs that change mid-fight. The owner's rule is "minimalist, yet everything truly needed": a piece of information earns a place on the screen only if the answer is wrong without it.

- **Setup tags:** the weapon with its barrel length and a joined cog, the round, and the scope with its zero, in the header (on a phone, a strip under it). Each opens a small menu (see Components → Setup menus).
- **First visit:** until the owner picks a weapon, a `First, your weapon` panel leads the view: the weapon chips (a pick brings the weapon's best round), then, under a hairline, the screenshot import with a note on what the screenshot shows: the character with the inventory and the weapon detail open, not the stash. The tags and the import in the foot row wait for it. A pick or an applied import ends it.
- **Scope view:** large, with the aim mark and the figure's size in the reticle's unit beside it. The wheel or a trackpad's two-finger scroll over it sets the distance.
- **Answer:**
  - the `Verdict` key in its status colour, with `I aim for` and the `Head | Chest` aim zone on the right;
  - the display line;
  - one sentence giving the hit chance for that zone and the biggest error source.
- **Hold over and lead:** a pair of large figures.
- **Armor line:** armor by class alone, since nobody can tell which piece the enemy wears: `Usually penetrates up to` and the highest class the round usually gets through at this distance, the pen strip for the other classes, and the energy note when the round has lost enough energy to count armor tougher. The charted pen values hold to 150 m; beyond that the round's energy is measured against its energy at 150 m (a quarter lost: one class tougher; half: two).
- **Toolbar:** the range row with my stance, and the target row (see Layout).
- **Install note** (`InstallNote`): shown once, on a phone's first browser visit, never from the home screen (`gb.install` remembers it). It is the toast's box (glass, 1px `--border-strong`, 14px body font) at z-index 25, with a `✕` and no timeout, over the dock and below the open sheets. It waits while a page toast shows or a REAL dock panel is open, since above the panel it would sit on the answer the panel keeps in view. It carries the iPhone and Android steps, and a 44px `Install` button (`--accent` text) only when the browser has offered its prompt.
- **Foot row:** the `Import from clipboard (Ctrl+V)` button and the estimate note.

**Fit:** on desktop the view is one screen: header, scope, answer, toolbar and foot row, without scrolling, from 1366×768 up and at 1080×1920. The scope grows with the window rather than leaving empty space.

**Defaults:** a first visit has a 100 m zero and a standing target at 100 m.

## Colour

### How theming works

- `src/styles/tokens.css` holds the shared tokens: fonts, status colours, motion and spacing.
- Each game ships its palette in `src/games/<game>/theme.css`, scoped to `[data-game='<game>']`.
- The app shell sets `data-game` on `<html>` from the route.
- Components and pages read `var(--token)` only. Hex values live only in `tokens.css` and the theme files. This keeps `src/components/` and `src/engine/` game-agnostic, which `architecture.test.ts` enforces.

### Per-game palettes

The theme files are the source of truth for the values. This table records where each value came from.

| Token | Role | REAL | GZW | WARDOGS |
|---|---|---|---|---|
| `--bg` | page ground | `#0b0d0e` | `#0b0e0b` | `#000000` |
| `--panel` | solid surface (cards, inputs) | `#15191b` | `#151a15` | `#151513` (derived) |
| `--panel-2` | raised: empty pen segments, chip hover | `#262c2f` | `#252d25` | `#3e3d3b` |
| `--border` | hairline | `rgb(214 238 242 / .09)` | `rgb(220 242 220 / .09)` | `rgb(246 243 237 / .09)` |
| `--border-strong` | controls, tags | `rgb(214 238 242 / .18)` | `rgb(220 242 220 / .18)` | `rgb(246 243 237 / .18)` |
| `--fg` | body text | `#e4eaec` | `#e3eae3` | `#f6f3ed` |
| `--fg-strong` | titles and values | `#ffffff` | `#ffffff` | `#ffffff` |
| `--muted` | labels, units, sublines | `#9aa8ad` | `#99a99a` | `#b9b6b2` |
| `--faint` | marks and rules, no words | `#667276` | `#647264` | `#7b7a77` |
| `--accent` | the one hue | `#3cc8d8` | `#5fd35a` | `#e2ac2b` |
| `--accent-hi` | accent hover | `#7ce0ec` | `#8fe68a` | `#ffdc6d` |
| `--on-accent` | text on accent | `#000000` | `#000000` | `#000000` |
| `--scene-sky-1`, `--scene-sky-2`, `--scene-hill`, `--scene-ground` | scope scene greys (derived) | `#5b6264` `#889093` `#6e7679` `#62696c`, cool green cast | `#5b645b` `#889288` `#6e776e` `#626b62`, green cast | `#625e57` `#908b83` `#75726d` `#686560`, warm |

- **REAL:** ours ("ours" in the source column): one cyan accent, `#3cc8d8`, on a near-black ground with a faint blue-green cast, chosen so the switcher tells the three games apart at a glance (REAL cyan, GZW green, WARDOGS gold). The borders are cyan-tinted white. The scene greys keep the old GZW greys' lightness, so the target keeps its contrast.
- **GZW:** ours: jungle / night-vision green, the owner's pick on 2026-10-31; previously grayzonewarfare.com's yellow. One phosphor-green accent, `#5fd35a` (hue 118), on a near-black ground with a faint green cast, built like REAL's. Its hue sits well away from REAL's cyan (186) and from the shared status `--ok` (160). The borders are green-tinted white. The scene greys carry a faint green cast and sit a little lighter than the old ones, so the target keeps its contrast.
- **WARDOGS:** values from wardogs.com:
  - the gold of the logo's "ALL OUT WARFARE" badge;
  - the light gold of the Steam button;
  - the warm greys and off-white of the site theme.

  "Derived" means mixed by us from those values.
- **Updating:** when a game's site changes its palette, update the theme file and this table together.

REAL's contrast (WCAG relative luminance), computed for the theme file:

| Token | on `--bg` | on `--panel` |
|---|---|---|
| `--fg` | 16.0 | 14.6 |
| `--fg-strong` | 19.5 | 17.7 |
| `--muted` | 8.0 | 7.2 |
| `--accent` (as text) | 9.7 | 8.8 |
| `--accent-hi` | 12.7 | 11.6 |
| `--faint` (no words) | 3.9 | 3.6 |

`--on-accent` on `--accent` is 10.4, on `--accent-hi` 13.7. `--target` on the scene's hill is 3.9 and on the ground 3.3.

GZW's contrast, computed the same way:

| Token | on `--bg` | on `--panel` |
|---|---|---|
| `--fg` | 15.8 | 14.4 |
| `--fg-strong` | 19.4 | 17.6 |
| `--muted` | 7.9 | 7.1 |
| `--accent` (as text) | 10.1 | 9.2 |
| `--accent-hi` | 12.8 | 11.6 |
| `--faint` (no words) | 3.8 | 3.5 |

`--on-accent` on `--accent` is 11.0, on `--accent-hi` 13.9. `--target` on the scene's hill is 3.9 and on the ground 3.3.

### Shared tokens

- **Status colours** in `tokens.css`, from grayzonewarfare.com's state colours:
  - `--ok: #10b981`
  - `--bad: #ef4444`
- **Scope inks** in `tokens.css`:
  - `--reticle: #0a0a0a`
  - `--target: #141517`
- **Penetration:**
  - `--pen-2: var(--accent)` means usually penetrates.
  - `--pen-1: color-mix(in srgb, var(--accent) 38%, transparent)` means magdump only.
  - `--pen-0: var(--panel-2)` means pointless.
  - Unprotected is the panel colour with a `--border-strong` outline.

### Using colour

- **Accent:** it marks what is selected, what to act on, and the aim mark. Hold over and lead stay `--fg-strong`, and the accent goes on their label or marker.
- **Verdict:** the one answer that takes its colour whole. "Shoot" is the accent, key and line (the owner asked for a coloured Shoot, orange then). "Risky" and "close in" are a `--fg-strong` line under an accent key. "No good shot" is a `--muted` line under a `--bad` key.
- **Status:** `--bad` is a signal, at most one mark per object: the "no good shot" key and errors such as a failed OCR read. `--ok` is held in reserve; nothing uses it since the shoot verdict took the accent.
- **Contrast:** every token that carries words reaches 4.5:1 on `--bg` and `--panel`. `--fg`, `--muted`, `--accent`, `--ok` and `--bad` pass in both palettes. `--faint` is 4.0:1 on GZW and 3.9:1 on REAL, so it carries rules, ticks, separators and inactive marks, never a word.

## REAL

The default page (`#/real/workbench`, and the bare URL): the first-shot scope setting for a real rifle. The question is "what do I set on the scope, and what do I hold?", at 100–2000 m. It follows the same rules as the rest of this manual; what differs:

- **Switcher:** REAL, GZW, then WARDOGS (`soon`), in that order. On a phone the tabs use the short names: `REAL`, `GZW`, `WARDOGS`.
- **Answer:** two large figures, `Elevation` and `Windage`, each with its mode word after the key (`dial` or `hold`). Dial mode gives the turret figure with its clicks and what is left over in cm; hold mode adds the scope view, a disc target at true size and the hold marks, with the hold figures beside it. Under the windage figure, three columns (wind speed minus and plus its uncertainty). They keep their place when it is calm, hidden (`is-hidden`) in one grid cell with the sensitivity line, so wind never moves the page. Then the hit line (large screens), the estimate warnings and the `How it's calculated` button. Units are `MRAD` and `MOA`, never `MIL`.
- **Round target in the scope view:** in hold mode the scope draws a round plate on a post (`target: { kind: 'disc' }`) instead of the soldier, with no size bracket; the aim mark sits on its centre and the windage hold is the lead.
- **Tags:** rifle, round and scope, each an icon (14px line, `--muted`, `aria-hidden`) and a text, in the header slot (a strip under the header on a phone), as on GZW. There is no cog tag. Each opens the settings sheet with its own section expanded. The desktop text is the full name: the rifle's, the round's short name (`.338 LM Scenar 250`: calibre, bullet, weight, at most 22 characters), the scope's unit, click and zero (`MRAD · 0.1 · zero 100`, the zero in the distance unit). On a phone the text is short so the strip fits one row in both languages: the preset's `rifleShort` (`AXSR`, `BREN 2 14″`), the calibre (`.338 LM`), the unit and the zero (`MRAD 100`). The full name stays in the tag's `title` and accessible name.
- **Shared link:** the URL carries the current preset's overrides (`o=`), never the station. A view that shows a link's values says so in one mono 11px `--accent` line under the tags, `Values from the shared link`, until the first edit stores them.
- **Station line:** under the tags, one mono `--muted` line with the air (`15 °C · QNH 1013 hPa · 0 % · 0 m · standard`; the pressure kind is QNH unless set to station). It is a button that opens the station sheet: `By location`, then temperature, pressure, humidity, altitude, height above ground (whole metres, feet under imperial; where you shoot from, about 1 m lying prone, which converts the forecast wind from 10 m), latitude and powder temperature. The shooting direction and the wind live in the bottom bar, the wind unit in ⚙.
- **`By location`:** a ghost button at the top of the station sheet (`Refresh` once model weather is in; `Locating…` then `Loading weather…` while busy, and disabled). The first tap shows a note in place (`rm-msg`: the position is rounded to about 1 km and sent to Open-Meteo, which keeps logs for 90 days) with `Continue` (primary) and `Cancel` (ghost); it is shown once.
  - **Refresh switch:** under the button, a `Switch` (`Refresh by itself every 15 min`, on by default) controls the automatic refresh while the page is visible. A manual `Refresh` stays.
- **Model fields:** the temperature, pressure, humidity and altitude it fills are tagged `model`. The model time is not on each field: it appears once, at the end of the attribution line (`… · CC BY 4.0 · model 14:05`) and on the station line. The altitude is tagged `approximate position: check the altitude` when the position is less accurate than 1 km. Under the fields, `--muted` text: `A model for your area, not a measurement at the range.`, the elevation source and the attribution `Weather data by Open-Meteo.com` (a link, CC BY 4.0). The station line gains `model 14:05 · 2 h old`; after 3 hours, or when the model time is unusable, it ends `stale weather` and the main screen shows a stale warning in the estimate warnings. An altitude edit moves a model station pressure and temperature with it.
- **Status lines:** `rm-msg` lines under the button, at most three:
  - **A failure** shows its line: insecure (HTTPS only), denied (blocked, allow it or enter by hand), unavailable (also a timeout, the only one with `Try again`), offline, service. After a denial, a later tap checks the permission without asking: still blocked shows the text again, allowed tries again.
  - **Offline and service add a second line.** With no usable cache it is `Using the standard atmosphere for your altitude.`, and the model temperature, pressure and humidity go back to standard. With a cache under 3 hours old it is `Using the last weather instead ({age}).`
  - **A value the forecast lacked** adds `The forecast had no pressure: using the standard one.` (two values in one line), shown while that field is still standard.
- **Settings sheet:** a rifle, round or scope tag opens it: a right side sheet on desktop (600px), full screen on a phone, glass over the page dimmed to 25% black.
  - **Header** 52px: the title, then two icon buttons (see Components), share (`Share settings`) and `✕`. The body scrolls as one page with the safe-area inset in its bottom padding. Escape and `✕` return focus to the tag that opened it, also after the sheet was reopened from another tag.
  - **Sections** `Rifle`, `Round`, `Scope`: a header row at least 60px tall, one button with `aria-expanded`: icon, title, a `{n} yours` chip when above 0, a chevron, and a mono 11px `--muted` summary of two lines at most. Only an open header has `--accent` (icon, title) and the `--panel-2` ground. Several sections can be open; the tag's own is open and in view.
  - **Fields** put the label left and the source tag right on one row above the input. `True the muzzle velocity ›` is collapsed inside the Round section.
  - **Reset** ends an open section, after a 1px rule: a right-aligned 44px `--muted` text button (`↺ Reset the round to the preset`), shown while that section has any override key. It clears only that section's keys, so the other sections keep their values (on a shared-link view too: their tags turn from `from link` to `yours`). It raises a toast with `Undo`.
  - **Share** copies `location.href` and raises a toast `Link copied`. When the clipboard is missing or refuses, the toast instead holds the link in a read-only selected field under `Copy the link from the field`, with `✕`, and stays until closed.
- **Your own items** (`gb.real.library`):
  - **Pickers** list the custom items first, each with a muted `custom` tag; a `+ Add …` row (`.rs-pick-add`, `--accent`) ends each list and opens a form in place of the section's fields.
  - **The add form** (`.lib-form`) shows the required fields, then a hairline (`.lib-optional`), then the optional ones. `Save` is primary and `Cancel` is ghost (one row, each filling half on a phone). A new rifle's form also asks for its first round, under a subheading.
  - **The optional mark** is the word `optional` after the label word, mono 10px `--muted`. An optional field shows the `not set` placeholder and clears to not set.
  - **Delete** reuses `SectionReset` (the right-aligned 44px `--muted` text button) and raises the toast with `Undo`.
  - **The iPhone note:** on an iPhone in Safari, not yet on the home screen, a note (`.lib-note`, `role="group"`) stands in for the form at `+ Add …`, with its own text (the home-screen app keeps its own storage). `How` reveals the install steps under it. `Continue anyway` opens the form and is remembered (`addNoteSeen` in `gb.real.profile`), so the note shows until it is pressed once.
  - **The MV barrel hint:** a custom round whose barrel differs from the one its MV was measured on shows a `≈` line in `.est` (`.mv-hint`) with a button that accepts the new figure; never applied silently.
  - **A custom scope's unit** is its turrets' unit, and selecting or saving one sets the display angle to it.
- **Main-screen lines:** three kinds, at most two at once.
  - The incomplete line (`.real-ask.real-todo`) is an `.est` box button that replaces the answer, naming what is missing; it opens the sheet at that field.
  - The add line (`≈`, `.est`, `.real-ask`) leads the warnings: `For a more precise answer, add: …`.
  - The wind-unset note (`≈`, `.est`) says calm is assumed.

  The incomplete line is 13px in `--fg`, not `.est`'s 11px `--muted`, on purpose: it carries the whole answer area. The owner will judge that look.
- **Calculation sheet, switched-off effects:** `.calc-off` sentences say what is off and why, in `--accent` at 11px, like the `≈` note.
- **Big figure:** the ⚙ sheet has, on REAL only, `Big figure: Value | Clicks` (a segmented control with the hint `When dialling the turret.`), stored as `primary` in `gb.real.profile`. In dial mode `Value` leads with the turret figure, and the small dial line under it gives the clicks with their direction and what is left over (`36 clicks up · 2 cm left over`), as in 0.1.0 (0.1.2 to 0.1.4 had a large `--accent` clicks line instead; the owner wanted it back); `Clicks` leads with the click count (`↑36`, `clicks` in `--accent` 18px) and shows the value under it. The arrow always leads; zero clicks has no arrow. Hold mode and the windage block don't change.
- **Wind input:** the wind speed is a typed field between `−` and `+` (`WindSpeedTool`), in the owner's unit (⚙ `Wind in`), one decimal; a Czech decimal comma is accepted. `−` and `+` go to the next multiple of the unit's step. The `WindClock` takes a press or a drag anywhere on the dial outside its centre hub (the inner 30% of the radius) and picks the hour nearest the angle; each hour owns a 30° wedge. Once the shooting direction is set, the dial carries compass letters (`cardinals` prop: N, E, S, W and the points between, turned to the shot, the letters from `real.cardinals`); without a direction it shows none.
- **Wind uncertainty** (`WindSigmaTool`): a ±σ stepper of 0.5–3 m/s next to the wind speed, shown in the wind unit (1 m/s reads ±3.6 km/h).
- **Direction** (`DirectionField`): the bearing to the target in degrees, with the nearest compass point beside the unit. Empty means unknown. On a phone the shot panel puts `Aim` beside the field (see Aim). On the desktop bar the field's note is visually hidden.
- **Slope** (`SlopeTool`): a stepper of −45° to 45°. The hint `+ uphill, − downhill` is a line under it in the phone panel; on the desktop bar it is the control's `title` and accessible description.
- **Forecast line** (`ForecastLine`, `{ setup, update, now, onNeedDirection }`): after `By location`, an `.est` line offers the forecast wind at the shooter's height: `Forecast near the ground: ≈ 4 m/s from NW (10 o’clock)` (or `Forecast at 10 m: …` from a building). By default it is an offer: `Use` (ghost) sets the speed and the hour and marks the wind set. A calm forecast always has `Use`: it sets 0 m/s, marks the wind set and keeps the hour. Otherwise `Use` appears only when the direction is known; without it the line shows `Set the shooting direction to get the hour.` as a button that takes the focus to the direction field (on a phone, it opens the shot panel there).
  - **Following state:** while the wind follows the forecast (⚙ `Forecast wind: Automatically`, and the wind not set by hand), the line reads `Wind from the forecast near the ground: ≈ 4 m/s from NW (10 o’clock)` (`fc.following`; `fc.followingCalm` when calm) and has no `Use`. Setting the wind by hand ends it and the line is the offer again. In `Automaticky` the forecast applies by itself (`useForecastFollow`) whenever the weather, the direction, the height or the wind unit change and the wind isn't set by hand, but not while a shared link with items this device lacks is on screen; with the direction cleared the line is the normal offer.
- **Reading hint** (`ReadingHint`): `Read it out to half the distance: that part makes ≈ 70 % of the drift.`, a muted line with the wind.
- **Target:** fixed at 50 cm, with no control.
- **Pressure kind:** a model pressure converts with the Station/QNH toggle.
- **Bottom bar:** what changes at the range, in two groups, `The shot` (distance, slope, direction) and `Wind` (speed, hour, uncertainty), each a labelled group on one row. The distance tool takes the wheel, a tap to type and the arrow keys. In the wind group the label line holds the reading hint and the forecast line, and may wrap to two lines; the hour is a mini-clock button that opens the `WindClock` in a popover above it. A thin rule separates the groups.
- **Phone dock** (`Dock`): one row of two 44px buttons, `Distance` and `Wind`, each with its value (`300 m`, `4 m/s · 10 h`; with zones on and two or three shown, Wind reads `3 zones`, cs `3 zóny`) and a chevron. A button opens a panel above the row: `The shot` (the distance on the ruler, see Ruler; slope; direction with `Aim`) or `Wind` (the `WindClock` with the speed and the uncertainty beside it, then the forecast line and the reading hint; see Wind zones). In the camera style (see Aim) `Distance` opens the camera view instead, the shot screen with the same ruler. One panel at a time; the other button replaces it. It is a disclosure, not a dialog: the page isn't dimmed, nothing is trapped, Escape or `✕` closes it and returns the focus to its button, and a press outside closes it. Opening a panel scrolls the page just enough to keep the last large figure above it, and the panel's height goes into the page's bottom padding (`--real-panel-h`). The binding rule: both large figures stay visible with a panel open, so the panels may be as tall as that needs. `Set the shooting direction to get the hour.` opens the shot panel at the direction field.
- **Wind zones** (`WindZones`): from 1000 m the wind can be split into two stretches (halves), from 1500 m into three (thirds); each has its own speed and hour. Off by default.
  - **Panel head:** in the Wind panel `?` (`How to read the wind`) and the zones icon (`Wind zones`, `aria-pressed`) sit grouped before `✕`: `.real-panel-head` is `gap: 8px`, the title `flex: 1`. The zones icon shows only from 1000 m.
  - **Strip** (`.real-zones`): under the head, cells that share the panel's width, near to far, with borders overlapping by 1px. A cell holds the name (`Near`, `Middle`, `Far`; cs `Blízko`, `Střed`, `Daleko`, the `.label`) with its weight for the shot at the right (`48 %`, mono 11px `--muted`), the wind (`4.5 · 10 h`: the speed without a unit, 14px `--fg-strong`, ellipsised) or, for a zone that follows the near one, `same as near` (cs `jako blízko`, 12px `--muted`), and the zone's range in m or yd (mono 11px `--muted`). The selected cell has a `--accent` border, its name in `--accent` and a faint tint (accent at 6%). The clock and the speed edit the selected zone.
  - **Own wind:** under the ±σ stepper a `Same as near` text button (cs `Jako blízko`, 44px tall, `--accent`, no fill) returns a zone to following the near wind. The near zone has none.
  - **Desktop:** the Wind group gets the same two icons (the standard 36px `.icon-btn`), the strip under the group's word (at most 520px wide) and the same editor.
  - **Falling back:** if the distance drops under a zone's range with the panel open, the selection falls back to `Near`. The values are kept; under 1000 m, or with the zones off, the answer uses the near wind.
- **Wind in the columns:** with zones on, the three wind columns' speed line reads the speeds near to far (`13·9·5.4`, `.real-col-zones`): no unit, no wrapping, and the accessible name holds the full text.
- **How to read the wind** (`WindHelpSheet`, from `?`): a side sheet like the calculation sheet, titled `How to read the wind`. Sections `At the rifle`, `Middle: mirage` and `Far: flags, grass, trees`, then a table of speeds (`under 1.5 m/s` … `5.5–7 m/s`, with what you see) and a note that the speeds are at the bullet's height. Focus returns to the `?` that opened it, or to the `?` on screen if that one is gone (the dock became the bar under the sheet).
- **Aim** (`AimBar`, `useAiming`, `CameraAim`): in the shot panel a ghost `Aim` button stands beside the Direction field, in the old `Compass` button's place, with the one-line note `aim.note` (`Point the phone's top edge at the target, a step away from the rifle.`) under the row. It is not a full-width row: that pushed a large figure under the header at 375×553. The English note wraps to two lines there (accepted); the Czech fits one. It shows only where the phone has orientation sensors.
  - **While aiming:** Slope and Direction show the live reading in `--accent` and are disabled; a bar replaces the note with the status `Hold still` (`Drž v klidu`), a thin bar (`.real-aim-track`, 4px, `--accent` over `--border`) filling as the phone is held steady, and `Use` and `Cancel`. The camera view has a ring instead (see Camera view). `Use` writes both values; `Cancel` leaves them. No reading from the sensors ends the aiming and shows `No reading from the phone's sensors.`, with `Aim` back.
  - **The lock** (both styles): holding the phone steady for a moment locks the reading by itself; the status becomes `Measured` (cs `Změřeno`, `--accent`) and the reading stops following the phone. Before the lock `Use` is inert: `aria-disabled`, a 1px `--border-strong` hairline, the muted word, no fill (the look for any inert primary button). At the lock it fills with `--accent` and a soft glow (`.is-ready`, steady, so reduced motion changes nothing). Nothing is written without the tap on `Use`.
  - **Leaving:** Escape first ends the aiming, a second Escape closes the panel. Every leaving path stops the sensors: `Cancel`, `✕`, Escape, closing the panel, a tap outside, switching the panel and the page becoming hidden.
  - **Camera view** (the shot screen of the camera style, `CameraAim`, `camera.css`): a full-screen overlay in the dock, over the panel and the page (the ⓘ and ⚙ sheets still go over it). It is an open box of the app's glass (`--glass` with `--glass-blur`, as the dock's panels; plain `--panel` under reduced transparency): the page shows through it blurred and dimmed, and the rear camera shows only in the lens. Top to bottom:
    - **Title bar:** `Aim at the target`, the style icon and `✕`, all 44px.
    - **Compass tape:** 38px tall, sliding under a fixed `--accent` mark at 3 px per degree (90° each side): ticks every 5°, longer every 10°, a mono 12px `--muted` label every 30° and the cardinal letters in `--fg`; the ends fade by a mask.
    - **Lens:** the camera's picture, `min(92vw, 360px)` (and never taller than the room), cut round and filling the lens (`object-fit: cover`), with a soft dark vignette over its edge and a hairline rim. The picture shows nowhere else.
    - **Reticle:** a duplex: black posts with a faint light halo, a thin centre line and a dot in `--reticle-lit` (red, `#ff5a5a`, a token in `tokens.css`, lit so it reads on sky and trees), no mil marks.
    - **Steadiness ring:** round the rim, from 12 o'clock, 3px `--accent` over a `--border-strong` track; it fills as the phone is held steady. Locked it is full and glows softly.
    - **Status:** mono 13px, `Hold still` in `--muted`, then `Measured` in `--accent`.
    - **Direction and slope:** two 44px figures without boxes, a hairline between; each is a button that types the value instead (`Direction`, `Slope`).
    - **Distance:** the shot panel's ruler field (60px, the word in its corner), over a faint scrim.
    - **Use:** full width, 52px, inert until the lock, then filled with the glow (see The lock).
  - **Leaving:** `Use` writes the values and closes. A view opened from Distance (the home-screen app) closes to the page; one opened from the lens icon in the shot panel closes to the panel. A sensor failure closes it and shows `No reading from the phone's sensors.`; no camera API or a refused permission falls back to the simple way with `The camera isn't available, so the simple way is used.` The camera tracks stop on every exit. No frame is ever captured, drawn, saved or sent (`architecture.test.ts` bans canvas capture under `src/games/real/`).
  - **Style icons:** the aim views carry an icon that switches style: `Measure with the camera` (cs `Měřit kamerou`) in the shot panel's head before `✕` (only where the phone reads its orientation), `Measure the simple way` (cs `Měřit jednoduše`) in the camera view's title bar. Standard `.icon-btn`; ⚙ keeps the setting too.
  - **⚙ group:** `Measuring with the phone` (`.rs-group`, a `.label` in `--accent` like `.real-group-head`, 8px above, heading the rows; they sit in a `role="group"` named by it) holds `Aiming: Simple | Camera` (only on a phone width that has orientation sensors, where `Aim` exists) with the hint `The app on the home screen starts with the camera, the browser with the simple way.` and the forecast wind choice `When I tap Use | Automatically` (with its hint). The camera is the default only in the home-screen app; a choice made here or with a style icon is remembered (`aimChosen`) and wins.
- **The wind turns with the direction:** the wind is remembered as where it blows from by the compass (`gb.real.wind`), so a new direction turns the hour. The new hour flashes: the Wind dock button's hour and the desktop clock button's text take `--accent` (`real-hour-flash`), fading back over 1.2 s (`FLASH_MS` in `windFlash.ts`). One visually hidden live region (`WindTurnedStatus`, `role="status"`) says it to a screen reader.
- **ⓘ sheet:** REAL's credits, and in place of the game notes its own: "Estimates from physics and published data. Check them on paper before relying on them." No fan-project line: there is no game to disclaim. It leads with `How to read the answer`: each term as the page shows it (`Elevation, Windage`, `dial`, `hold`, `left over`, the three wind columns, the hit chance, the warnings, `How it's calculated`) with what it means.
- **Calculation sheet:** a side sheet (glass over the page dimmed to 25% black, full width on a phone) with the steps in order: air, muzzle velocity, flight, elevation, wind, spin drift and the rest. Each step shows its inputs with a tag for where each came from (`preset`, `estimate`, `standard`), its formula with the numbers, and its effect on the hit in cm and MRAD. An effect that can be left out carries a switch.
  - **With wind zones** the wind step opens with the near zone (`Near: wind 4 m/s from 10 o'clock`), drops the lag-rule check, and adds one line per zone, `Near: crosswind 3 m/s from the left, makes →20 cm of the drift` (cs `Blízko: boční vítr 3 m/s zleva, dělá →20 cm snosu`; signed, → right and ← left), which sum to the drift. The aerodynamic jump uses the near zone's crosswind.

**New components** (game-agnostic, in `src/components/`):
- **`WindClock`:** a 12-position dial for where the wind blows from, the target at the top; one `role="slider"` control, arrow keys step the hour and wrap. An optional `cardinals` prop puts compass letters on the ring.
- **`NumberField`:** a labelled number input with a unit (or a segmented unit switch) that validates a range, steps with the arrows and shows `invalidText` on a bad entry; used by the setup menus and the station sheet.
- **`Switch`:** a labelled on/off switch (`.switch`, `role="switch"`), shared by the calculation sheet's effect switches and the station sheet's refresh switch.

## Type

The fonts are already installed through `@fontsource`:
- Barlow Condensed (`--font-display`);
- Geist (`--font-body`);
- Geist Mono (`--font-mono`).

Case comes from CSS `text-transform`. i18n strings stay in sentence case in `en.ts` and `cs.ts`.

| Role | Face | Size / weight | Tracking | Case, colour |
|---|---|---|---|---|
| Verdict | display | 64px / 800, line-height .88 (40px on phone) | 0 | upper, the verdict's colour |
| Section heading | display | 22px / 700 | .08em | upper, `--fg-strong` |
| Button | display | 15px / 700 | .12em | upper |
| Panel heading | display | 12px / 700 | .22em | upper, `--muted` |
| Eyebrow (category above a title) | display | 12px / 600 | .30em | upper, `--muted` |
| Label (field, stat, toolbar) | display | 11–12px / 600 | .14–.16em | upper, `--muted` |
| Key (`Verdict`, hold, lead) | display | 10–11px / 700 | .24em | upper, `--accent` (the verdict key in its colour), with a 6px diamond |
| Body | body | 14px / 400, line-height 1.45 | 0 | sentence, `--fg` |
| Subline | body | 12–13px / 400 | 0 | sentence, `--muted` |
| Hero figure (hold, lead) | mono | 64px (40px on phone) / 500 | −.05em | `--fg-strong` |
| Armor class | display | 36px / 800 in the armor line; a word (`none`) at 24px | 0 | `--accent` the class it usually penetrates, `--muted` none or unknown |
| Figure in rows and lists | mono | 13px / 400 | 0 | `--fg-strong` |
| Unit after a figure | mono | 11–13px / 400 | 0 | `--muted`, 4px gap |
| Tag, hint, axis label | mono | 10–11px / 400 | .04em | `--muted` or `--fg` at 75% |
| Input on a phone | mono | 16px / 400 | 0 | `--fg-strong`; under 16px iOS Safari zooms the page on focus, so never smaller (13px, 15px on desktop) |

- **Smallest text:** 10px, and only for mono tags and tracked uppercase labels. Sentence text is at least 12px.
- **Czech:** check the uppercase display roles in Czech too. The strings are longer, and the diacritics need the line height.

## Surfaces and background

- **Corners:** square (radius 0) on every panel, control, tag, card and button.
- **Panel:**
  - a 1px `--border`, with the background `--bg` at 55% plus `backdrop-filter: blur(12px)`;
  - **corner marks:** 12px L-shapes, 1px, in `--accent` at 75%, top-left and bottom-right, drawn with `::before` and `::after` at −1px;
  - header padding 14px 16px 10px, body padding 0 16px 16px, 16px between stacked panels.

  Corner marks belong to panels. Items inside a panel (cards, rows) use the selection states below.
- **Glass:** every surface that opens over the page (the ⓘ and ⚙ sheets, the settings and calculation sheets, setup menus, dialogs, toasts, the install note, the phone dock's panels and the camera view) is frosted glass: `--glass`, `--panel` at 50%, with `--glass-blur`, `blur(10px) saturate(1.5)`, both in `tokens.css`. The page shows through as soft shapes and the text on top stays legible. Under `prefers-reduced-transparency: reduce` the glass is plain `--panel`. A side sheet or dialog dims the page under it to 25% black, not more, so the glass still shows. An element with a backdrop blur is a backdrop root, so nothing that holds a glass surface may carry a blur of its own (the header puts its ground on `::before`). `glass.test.ts` checks every open surface.
- **Depth:** comes from borders and translucency. Surfaces carry no box shadows.
- **Background:** two layers behind the content, both `aria-hidden`.
  - **Contour lines:** concentric, wobbly topographic lines, in white at 4–5% opacity, generated as SVG, across the page.
  - **Glow:** one radial glow per screen, behind the hero object (the scope view), with `--accent` at 10–12% in the middle fading to transparent.

## Components

**Selection states.** Each control family has its own selected look, so that a selected item never reads as focus or hover:

| Control | Selected | Hover |
|---|---|---|
| Preset chips (e.g. range certainty, zero presets, weapons) | filled `--accent`, text `--on-accent` | border `--accent` at 60% |
| Segmented / toolbar options (aim zone, my stance, target, units) | text `--accent` + `inset 0 -2px 0 var(--accent)` | text `--fg-strong` |
| List row | 2px `--accent` bar on the left edge | background `--fg` at 3% |

Segmented options that are words (`Head | Chest`, my stance, the target) use the label role. Options that are units (`m | MIL`, `m | yd`, `MIL | MOA`, `EN | CS`) use mono 11px.

**Choosing without dropdowns.** The app has no `<select>`, and `architecture.test.ts` fails if one appears (the owner's preference: as few dropdown menus as possible). A new control picks one of these forms:
- **Preset chips** for short options: up to about eight, or a wrapped block of short names such as the weapons;
- **list rows** (`ListPicker`) for longer names: barrels, scopes and rounds;
- **list rows with a filter field** from eleven items up;
- **a stepper** (`Stepper`) for numbers in fixed steps;
- **a segmented control** for two to five exclusive modes, and **radios** inside a dialog.

A setup choice sits in a **popover menu** under the tag that names it (see Setup menus); a choice that changes mid-fight stays on the screen.

- **Focus:** 2px `--accent` outline, offset 2px, on `:focus-visible`. This is already in `base.css`.
- **Unavailable** (a game marked "soon"): text in `--muted` plus a tag that says why, e.g. `soon`. The text stays legible, so don't fade it with opacity.
- **Buttons, 44px tall:**
  - **Primary:** `--accent` with `--on-accent` text, `--accent-hi` on hover. One per screen.
  - **Ghost:** 1px `--border-strong`, background black at 40%, `--fg-strong` text.
- **Icon buttons** (`.icon-btn`): ⓘ and ⚙ in the header, and a sheet's share and `✕`, all alike. A 36px square (44px on a phone) with a 1px `--border-strong` and no fill, round a 20px line glyph (stroke 1.3) in `--muted`; hover or an open sheet turns the glyph `--accent` and the border `--accent` at 60%. The `✕` is a drawn glyph, not the text character. Each has an accessible name and a matching `title`.
- **Chips:** 28px tall on desktop and 44px on a phone, padding 0 10px, 1px `--border-strong`, background black at 30%, display 12px/600 at .12em, uppercase.
- **List rows (`ListPicker`):**
  - 32px rows (44px on a phone) between `--border` hairlines: the name in body 14px, an optional tag, a mono figure right-aligned (after the tag, so figures share one right edge whether a row has a tag or not), an optional element after it (the round's pen strip);
  - the list scrolls inside a few rows (4 for barrels and scopes, 8 for rounds) and opens scrolled to the chosen row, without moving the page;
  - from eleven items a filter field sits above it, named after its list (`Filter: Scope`).
- **Stepper:** `−`, the mono value, `+`, 36px tall (44px on a phone), the buttons disabled at the bounds. A value not set shows `—`, and either button gives its starting value (a custom scope's zero: 100 m). A value that is missing or outside the bounds is flagged as a field is: a `--bad` border and the message under it.
- **Ruler** (`Ruler`, the phone's shot panel and the camera view): the distance field with a 24px scale under the figure (frame A), `−` and `+` gone. Ticks every 10 m 6px apart, longer every 50 m, longest with a mono 9px `--muted` label every 100 m; a 2px `--accent` mark at the centre; the edges fade (a mask). The scale is `aria-hidden`; the field stays the accessible control and takes `ArrowLeft`/`ArrowRight` as one step. The whole box, the figure and the scale, is the drag surface, and it takes the whole touch (`touch-action: none`), so a slanted thumb swipe is never handed to a scroll; a vertical swipe on the box does nothing, elsewhere it still scrolls the panel. The drag starts at 6px sideways unless the swipe runs more than twice as far up or down (an arcing thumb swipe still drags). A tap on the figure types (the keyboard, for an exact 437 m); a swipe never leaves the field focused, wherever it starts (the figure, or the camera view's word), and a tap that stops a coasting flick counts as part of the flick: no keyboard. The word and the unit aren't selectable and the box shows no tap flash; the input stays selectable. Drag left goes farther, a step per 6px; a flick coasts (0.95 per frame, stops under 0.05 px/ms; the release speed is capped at 1 px/ms, so one flick carries about 55 steps at most) except under `prefers-reduced-motion`, and it always ends on a step. The desktop bar keeps `−`, `+` and the wheel.
- **Zero:** the game's own steps: a stepper in 50 m steps from 50 m (100 m on a long rifle, type `Rifle`) to the scope's maximum zero, plus the 100 / 200 / 300 m preset chips that fall inside. Shared links and the "or zero at" suggestion keep to the same steps.
- **Tags:** mono 10–11px, padding 2px 6px, 1px `--border-strong`.
- **Pen strip:** a display, not a control.
  - 8 segments, one per armor class from I to III++, 3px tall with 2px gaps;
  - in the armor line, mono 10px class labels sit below it and the highest class the round usually penetrates gets a 1px `--fg-strong` outline at offset 2px;
  - in the round menu, one beside each round, without labels.
- **Setup tags:** one row of tag buttons with the key word bold in `--fg-strong`: the weapon with its barrel length (`M700 · 22"`) joined to a cog, the round, and the scope with its zero. Each opens its own menu, so no two tags do the same thing. (REAL's tags differ: they open the settings sheet, see REAL.) Hover or an open menu turns the border `--accent` at 60%. On desktop they sit in the header's slot, between the game switcher and the ⓘ and ⚙ buttons, and truncate before they wrap; on a phone they are a strip under the header that scrolls sideways, each tag 44px tall.
- **Setup menus** (`Popover`): a glass panel, 16px padding, 260–440px wide, hung 8px under the tag that opens it and placed on `<body>` so nothing clips it; on a phone it spans the width inside the 16px gutters. It ends at least 16px from the screen's edge, however low it hangs, and scrolls inside. It takes the focus on opening (on the chosen option) and gives it back to the tag on closing; Escape, a press outside it or its tag close it.
  - **Weapon:** the weapon chips; a pick closes the menu and brings the weapon's best round.
  - **Round:** list rows, each with its pen strip; a pick closes the menu.
  - **Cog:** the barrel list rows and the real-accuracy field (only the field on a weapon without barrels). A barrel whose muzzle-velocity change no source gives carries a `--muted` `MV unknown` tag; the app then uses the round's own speed.
  - **Scope tag:** the scope list rows (each with an `FFP`/`SFP` tag) and the zero.
  - These two stay open while you set them.
- **Toast** (`Toast`, `useToast`): one status at a time, `role="status"`, a glass box with a 1px `--border-strong`, 14px in the body font (the action button is mono 13px). It has an optional body (a field to copy from), an optional action button (`Undo`, 44px, `--accent` text) and a duration: 6 s by default, or `null`, which adds a `✕` and keeps it until closed. A new toast replaces the old one. It renders into the open sheet's slot (`toastSlot`), its own row at the foot of the sheet's column so it covers none of its controls, else on `<body>` at the bottom, above the dock on a phone. It closes on its action or its `✕`.
- **Foot row:** the import ghost button, then the estimate note filling the rest of the row.
- **Import:** one ghost button, `Import from clipboard (Ctrl+V)`. Its title carries the help; Ctrl+V works anywhere on the page and a screenshot can be dropped on the button. Without the Clipboard API the button opens a file picker. A status line shows only while reading or after a failure.
- **Dialog (import):** a glass panel over the page dimmed to 25% black; ticks and radios in hairline rows; ghost and primary buttons at 44px.
  - Several weapons the app can show are radios, the fastest muzzle velocity preselected; the round is radios over the rounds found that fit the chosen weapon, the best preselected, `keep the current one` last.
  - The barrel, scope and read accuracy are ticks, shown only for the weapon they belong to.
- **Info sheet:** the ⓘ `About this site` button opens a glass sheet like the settings one. In order:
  - the fan-project line;
  - `How to read the answer`, on a page that gives one (REAL);
  - the data version with its sources;
  - the estimates note;
  - `Add Ballistics to your home screen`: why, the iPhone and Android steps, and an `Install` button only when the browser offers one; hidden when the page runs from the home screen;
  - `Privacy`: what stays in the browser and what leaves it (By location to Open-Meteo, the screenshot read in the browser, the IP address GitHub Pages sees), and "No cookies, no analytics, no tracking.";
  - `Version {v} · What's new`: the app's version and a link to the what's-new page (`changelog/#<game>`, relative, with the game the sheet is open on; same tab; 32px tall, 44px on a phone).

  Help, install and privacy are `<details>`, closed until asked for: a label-role summary in `--fg` (`--accent` on hover) with a `›` that turns down when open, so the sheet stays short. Its text is mono 12px `--muted`, a term `--fg`. The sheet scrolls inside itself (at most the screen's height less 88px). While a sheet is open the header sits over a phone's dock, so the sheet's end is never hidden under it.
- **Version mark:** the app's version (`v` and the `package.json` version), mono 10px `--muted` at 60%, fixed 8px from the right and 4px from the bottom of the screen. It moves nothing, takes no clicks and is `aria-hidden` (ⓘ gives it). On a phone the dock fills that corner, so it shows only in ⓘ.
- **Estimate note:** a 1px dashed `--border-strong` box, mono 11px `--muted`, led by an accent `≈`.

## Figures and units

- Figures use Geist Mono with `font-variant-numeric: tabular-nums`, so values that update don't jitter.
- Figures in rows and lists are right-aligned, and every figure in a row ends on the same right edge.
- A unit follows its figure as a smaller `--muted` suffix: `2.6 MIL`, `565 m/s`. A figure and its `%` never split across lines (a narrow no-break space in mono, a no-break space in sentences).
- Direction glyphs lead the hero figures: `↑` for hold over, `→`/`←` for lead.
- A missing or non-applicable value is a `--muted` em dash at the row's normal size. A real zero prints as `0`.
- Every computed ballistic value reads as an estimate: `≈` on secondary values, and an estimate note on the screen.

## Scope view

The scope view is the hero. It shows which point of the reticle goes on the target, and why the shot is hard. Draw it from bottom to top in this order. Sizes are for a 440×440 viewBox with a 196px lens radius, except text in the lens: its sizes are rendered px, held there as the scope grows or shrinks (the scope measures its own width).

1. **Scene**, all greys from the `--scene-*` tokens:
   - a sky gradient;
   - a far ridge at 38% opacity;
   - a jungle tree line on the horizon;
   - a white haze band at up to 14%;
   - the ground as a gradient, with three or four ground rows at 6% black.
   - The hill and ground greys are light enough that `--target` on them reaches 3:1 before the vignette (3.2:1 on the ground, 3.8:1 on the hill, in both palettes).
2. **Spread**, centred on the aim point, and left out while the aim point is beyond the view:
   - the 68% ellipse is filled with `--accent` at 12% and has a dashed stroke at 60%;
   - the 95% ellipse is a dashed outline at 38%;
   - the radii come from the hit-chance model's σx and σy. For a 2D normal, 68% of shots fall within 1.51σ and 95% within 2.45σ, so those are the multipliers. The 1σ ellipse holds only 39%.
3. **Target:** a soldier silhouette (helmet, pack, rifle) in `--target`, in one of four poses:
   - running, leaning into the direction of movement, for a jogging or sprinting target;
   - standing, rifle at low ready, for a standing or walking target;
   - kneeling (1.2 m from boot to helmet), rifle shouldered, for a kneeling target, which never moves;
   - prone, lying along the horizontal facing the way it would move, for a prone target, which never moves either: 1.8 m from boot to head, the trunk about 0.19 m tall and the helmet 0.45 m off the ground, so the hit model's prone zones (chest 0.40 × 0.18 m, head 0.16 × 0.15 m) sit on the trunk and the head.
   - It is drawn at true angular size: px per metre = px per MIL × 1000 / distance.
   - It sits above the spread, so the spread never hides it.
   - **Rim:** a 1 rendered px outline in `--fg` at 40% under the ink, outside its edge, so the silhouette stays apart from the reticle lines and the ground.
   - **Size bracket:** a 1px `--fg-strong` bracket along what the height reading measures, with its span and the reticle's unit on a plate (`4.5 MIL`): a standing or kneeling figure's height from helmet top to boot sole, on the side toward the vertical axis with the plate at the feet end, or a prone figure's length, under it. The figure is what the reading counts (1.8 m, kneeling 1.2 m), so it matches the height slider. When the figure overflows the lens, the plate slides along the bracket into it, so the number always shows. It goes while the aim point is beyond the view.
4. **Optics:** a vignette (transparent to 82% black from 70% of the radius out), then a faint glass highlight at the top left.
5. **Reticle** in `--reticle`:
   - 1.1px lines, with 5px posts from 125px out;
   - hashes every MIL (every 4 MOA), longer on even MILs (every 8 MOA);
   - mono numbers at 10–11 rendered px at 2, 4 and 6 MIL (8, 16 and 24 MOA), above the horizontal axis and to the right of the vertical one, left out wherever a plate or a part of the figure covers them.
6. **Aim marks:** these are the only colour in the lens, all `--accent`.
   - 2px ticks on the axes at the lead and the hold values;
   - dotted guides from those ticks to the aim point;
   - labels in mono at 10–13 rendered px on 78% black plates: `LEAD 8.0` above the horizontal tick, `HOLD OVER ↑2.6` (`↓` when holding under) on the far side of the vertical axis from the mark;
   - the aim mark: an 8.5px ring with four short ticks and an open centre, so the head inside stays visible.
   - **Beyond the view:** when the aim point falls outside the lens, the mark is pulled in to the edge with a dashed ring, the hold and lead plates go, and a plate on an 85% black ground says so. The plate is as wide as its label and sits as high as the lens lets a plate that wide, so no word is clipped in either language.
7. **Lens:** a 12px black rim and a 1px `--border-strong` outer ring.
8. **Caption** below the lens, in HTML rather than the SVG so it keeps its size, mono 11px `--muted`: the aim-mark and spread legend with small swatches, then the scope's zoom, focal plane and unit. It takes its line (22px) from the scope's square, so the view still fits.

**Changes with input:** the scene, target and spread move with hold and lead, so the crosshair centre visibly sits above and ahead of the target.

**Wheel:** the wheel or a trackpad's two-finger scroll over the scope steps the distance, 1 m per 10px of travel (a mouse notch is about 10 m), wheel up farther and down nearer, within 50–1000 m. Ctrl or ⌘ with the wheel stays the browser's zoom, and outside the scope the page scrolls as usual, so a small window still reaches the toolbar.

## Motion

- **Entrance:** when a page first mounts, its blocks fade up 10px over .6s on `cubic-bezier(.2, .7, .1, 1)`, staggered 40–80ms apart. Store the easing as `--ease` in `tokens.css`.
- **Input:** figures update instantly, so the answer is readable at once.
- **Hover and press:** colour, background and border transitions of 150ms.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, the entrance is off and transitions are instant. `base.css` already does this globally.

## Layout and the phone

- **Spacing:** a 4px base, with steps of 4, 8, 12, 16, 24, 32 and 48. The page gutter is 32px on desktop and 20px on a phone. Columns are 24px apart.
- **Edges:** `--safe-top`/`--safe-bottom`/`--safe-left`/`--safe-right` (the device's safe-area insets, 0 in a browser tab) pad the header and anything fixed to the screen's edges; the side ones matter in landscape (the header, the docks and `.app-main` take `max(<usual padding>, var(--safe-left/right))`).
- **Header:** 64px tall, transparent with no bottom line: the page's own background, contour lines included, shows through. Only while the page scrolls under it does it take a ground of `--bg` at 88% with blur, so its tags and buttons never sit on the page's text.
  - **Left:** the logo and the game switcher.
  - **Middle:** a slot that the view fills through a portal (`HeaderSlot`) with its setup tags.
  - **Language:** it is in the path, `…/cs/#/…` or `…/en/#/…`. The ⚙ language switch goes to the other path with the same hash, and a new link doesn't write `l=`. The root `index.html` only redirects (an old link's `l=`, then the stored language, then the browser's), keeping the hash.
  - **Right:** an ⓘ `About this site` button, then a ⚙ `Settings` button. Each opens a glass sheet, the info sheet or the language, unit and angle controls; Escape, an outside click or the button close it.
  - **Out of the way:** it slides up while the page scrolls down and comes back on the way up; it stays while the sheet is open. `scroll-padding-top` is 64px, so in-page jumps land under it.
- **The view:** one screen tall from 700px wide (`max(100dvh − 64px, 660px)`), at most 1640px wide:
  - a grid of scope and answer that takes the height left after the toolbar and the foot row; it is a size container, and the scope is `min(100cqh − 22px, 55cqw, 880px)` square with its caption line under it;
  - in portrait (aspect ratio 1:1 or taller) the scope stacks above the answer;
  - the first-visit panel keeps a 470px scope and lets the page scroll.
- **Toolbar:** rows of `.tool` segments that fill their column edge to edge; every segment grows, the slider and the target most. Every segment carries its word on the left in the label role, so no control is a bare glyph or figure. From 1200px wide the two rows never wrap: when a row runs short, the longer words wrap to two lines instead; below that the segments wrap.
  - **Range row**, the shooter's side:
    - the distance tool: `Range by` and a `m | MIL` (`yd | MOA`) switch, then either the distance slider or the figure's height slider ("Standing figure (1.8 m) spans (MIL)", which sets the distance and leaves the certainty as chosen), and the distance readout. The reading measures the whole figure: 1.8 m standing, 1.2 m kneeling, 1.8 m long lying prone, and its label names the figure;
    - the height slider runs on a log scale over the readings from 1000 m to 50 m, so each step of the thumb is the same share of the reading; the arrow keys step the reading by 0.05 MIL (0.25 MOA), and a set reading holds while the distance it gives does not change;
    - `Range accurate to` and the range-certainty chips (`±3 %`, `±10 %`, `±20 %`);
    - `Me`: my stance, the game's three (standing, kneeling, prone; the game has no rest or bipod). It sets how far the hold wanders, 1σ: 0.5, 0.25 and 0.15 MIL, our estimates. It moved here from the target row once every segment had its word, because the target row no longer fit at 1366px.
  - **Target row:**
    - `Target`: one exclusive choice (standing, kneeling, prone, walking, jogging, sprinting), so a kneeling or prone target never moves. `Me` and `Target` each carry their word, so neither reads as the other;
    - `Direction` (← →);
    - `Crossing angle` (90°, 45°), then `Speed`, the assumed speed, as the segment's trailing figure; its title says the speeds are real-world ones, not measured in game.
    - A still target (standing, kneeling, prone) keeps direction and crossing angle on screen but unavailable: disabled, `--muted` words without an opacity fade, the choice kept as a `--border-strong` underline, and a title that says why.

  The switch between distance and height is remembered in the profile.
- **Phone (390px):** one column.
  - **Header:** one row: the logo's mark only, the game switcher, ⓘ and ⚙; the sheets and menus span the width.
  - **Scrolling rows:** the setup strip and chip rows scroll sideways inside their own row; tables scroll inside their own box.
  - **Order:** scope, verdict, hold and lead, armor line, then my stance, range certainty and crossing angle.
  - **Bottom bar:** GZW's is a sticky bar of two 44px rows:
    - the distance tool without its label;
    - the target as icons, with the word only on the chosen one and no `Target` word, plus a single direction toggle (unavailable for a still target).

    REAL's is the phone dock: one row of two buttons, `Distance` and `Wind`, each opening a panel (see REAL).
  - **Touch targets:** at least 44px tall.
  - **When something has to go:** drop the item least relevant to the answer, not the last one in source order.

## What's new page

`/cs/changelog/` and `/en/changelog/`: a page of its own (`src/changelog/`), reached from ⓘ, listing what each version brought. Its text lives in `src/changelog/entries.ts`, written for the user; only the title and the way back are i18n strings.

- **Ground:** the contour lines (`Backdrop`), no glow (it has no hero).
- **Game:** the hash ⓘ's link gives (`#gzw`), accepted only when it is an id in `GAMES`. It sets `data-game`, so the page wears that game's palette, and both ways back lead to `../#/<game>/workbench`. Without one, or with an unknown one, the page is REAL's (the HTML's `data-game`) and leads back to `../`.
- **Header:** the app's header (`.app-header`), with the logo linking back and, at the right end, the ghost button `← Back to the app` (the app in the same language, see Game). It never slides away, since a home-screen app has no browser back, and takes its ground once the page scrolls under it.
- **Column:** at most 680px, centred, 32px gutters (16px on a phone). The title is an `h1` at the verdict's size (64px / 800, 40px on a phone), line height 1 for the Czech diacritics.
- **Version blocks**, newest first, each under a `--border` hairline with 24px on either side of it: an `h2` of the version as a figure (mono 13px `--fg-strong`), then ` · 3. 11. 2026` (`3 Nov 2026` in English) in `--muted`, left out until the version is released, then the title in the section-heading role; under it the items in body text, at most 64ch, each with a 4px `--faint` square.
- **Styles:** `changelog.css` `@import`s the fonts, the three theme files and `base`, `shell` and `ui` CSS, so they are inlined into the page's own stylesheet. Imported from its script one by one, they would become a chunk shared with the app, loaded before the app's own CSS, and reorder the app's cascade.

## Brand and attribution

- **Name and logo:** the name is "Ballistics Calculator", and the logo is our square reticle mark in `--accent`.
- **Third-party material:** game logos, key art, the gzwloadout.com cobra mark and the official sites' licensed fonts (Bebas Neue Pro) stay with their owners. Link to those sites instead.
- **About this site** (the ⓘ sheet; the page has no footer): "Unofficial fan project, not affiliated with MADFINGER Games or BULKHEAD", the data version and credits (gzw-data.dev, GZW Fandom wiki, CC BY-SA 3.0), the estimates note, privacy and the version.

## Before you finish UI work

The work is done when all of these hold:

1. **Screenshots:** you have a screenshot of every changed screen in the running app (`npm run dev`) at 1440×900 and 390×844, in both themes. WARDOGS isn't playable yet, so set `data-game="wardogs"` on `<html>` in devtools to check its palette.
2. **Fit:** the view fits without scrolling at 1366×768, 1440×900, 1920×1080 and 1080×1920.
3. **Phone:** at 390×844 nothing overflows sideways, and every touch target is at least 44px tall.
4. **Hex values and dropdowns:** `grep -rnE '#[0-9a-fA-F]{3,8}\b' src --include=*.css --include=*.tsx` matches only `tokens.css` and the theme files, and `architecture.test.ts` (hex colours, no `<select>`) passes.
5. **i18n:** every new string is in `en.ts` and `cs.ts`, and the Czech version still fits.
6. **Reduced motion:** with reduced motion emulated, nothing animates.
