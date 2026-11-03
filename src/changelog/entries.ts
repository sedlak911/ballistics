// What each version brought, for the what's-new page (/cs/changelog/, /en/changelog/). Written for the user, not the
// developer. Each release adds its entry on top, in Czech and English; the deploy fills in its date, null until then.
// entries.test.ts fails while the newest entry isn't APP_VERSION.
import type { Lang } from '../settings/url'

export interface Entry {
  version: string
  /** The release day as YYYY-MM-DD; null until the version is released. */
  date: string | null
  title: Record<Lang, string>
  /** The same things said in each language, in the same order. */
  items: Record<Lang, string[]>
}

/** Newest first. */
export const ENTRIES: Entry[] = [
  {
    version: '0.1.5',
    date: '2026-11-03',
    title: { cs: 'Přehled verzí a kliky jako dřív', en: 'Version history, and the clicks as before' },
    items: {
      cs: [
        'Tahle stránka: co přinesla která verze. Odkaz na ni je v ⓘ vedle čísla verze.',
        'Kliky jsou zase v malém řádku pod výškou, jako ve verzi 0.1.0. Chceš je jako hlavní číslo? V nastavení zvol u „Hlavní číslo“ možnost Kliky.',
      ],
      en: [
        'This page: what each version brought. Its link is in ⓘ, next to the version number.',
        'The clicks are back in the small line under the elevation, as in 0.1.0. To make them the big figure, pick Clicks under “Big figure” in the settings.',
      ],
    },
  },
  {
    version: '0.1.4',
    date: '2026-11-03',
    title: { cs: 'Vlastní pušky, náboje a optiky', en: 'Your own rifles, rounds and scopes' },
    items: {
      cs: [
        'Vlastní pušky, náboje a optiky přidáš, upravíš i smažeš v nastavení. Zůstávají jen v tomto prohlížeči.',
        'Povinné je jen to, co výpočet potřebuje. Co volitelného vynecháš, se vypne a „Jak se to počítá“ řekne co a proč.',
        'Hlavní obrazovka řekne, co doplnit pro výpočet, co pro přesnější výsledek a kdy není zadaný vítr.',
        'Dřívější předvolba Custom se změní na tvou vlastní pušku, náboj a optiku.',
        'Návrh úsťové rychlosti pro hlaveň jiné délky.',
      ],
      en: [
        'Add, edit and delete your own rifles, rounds and scopes in the settings. They stay in this browser only.',
        'Only what the calculation needs is required. Anything optional you leave out is switched off, and “How it’s calculated” says what and why.',
        'The main screen says what to add to compute, what would make the answer more precise, and when the wind isn’t set.',
        'The old Custom preset becomes your own rifle, round and scope.',
        'A muzzle-velocity hint for a barrel of another length.',
      ],
    },
  },
  {
    version: '0.1.3',
    date: '2026-11-03',
    title: { cs: 'Instalace na plochu', en: 'Install to the home screen' },
    items: {
      cs: [
        'Aplikaci přidáš na plochu telefonu a otevře se přes celou obrazovku.',
        'ⓘ ukáže, jak ji nainstalovat.',
        'Průhledná hlavička a otevřené panely z matného skla.',
      ],
      en: [
        'Add the app to a phone’s home screen, and it opens full screen.',
        'ⓘ shows how to install it.',
        'A transparent header, and open panels in frosted glass.',
      ],
    },
  },
  {
    version: '0.1.2',
    date: '2026-11-03',
    title: { cs: 'Panel nastavení', en: 'The settings sheet' },
    items: {
      cs: [
        'Jeden panel nastavení pro pušku, náboj a optiku. U každé hodnoty vidíš, odkud je, a každou část vrátíš s možností Zpět.',
        'Rychlost větru se dá napsat a hodiny větru reagují na klepnutí i tažení.',
        'Nastavení můžeš sdílet jako odkaz.',
        'Česká a anglická verze mají vlastní adresu, /cs/ a /en/.',
      ],
      en: [
        'One settings sheet for the rifle, round and scope. Each value shows where it comes from, and each section resets, with Undo.',
        'Type the wind speed, and the wind clock takes a press or a drag.',
        'Share your settings as a link.',
        'Czech and English have their own addresses, /cs/ and /en/.',
      ],
    },
  },
  {
    version: '0.1.1',
    date: '2026-11-03',
    title: { cs: 'Verze a ⓘ', en: 'The version and ⓘ' },
    items: {
      cs: ['Číslo verze v rohu a v ⓘ.', 'ⓘ vysvětlí, jak číst výsledek, a co opouští prohlížeč.'],
      en: ['The version number in the corner and in ⓘ.', 'ⓘ explains how to read the answer, and what leaves the browser.'],
    },
  },
  {
    version: '0.1.0',
    date: '2026-10-31',
    title: { cs: 'REAL, Gray Zone Warfare a WARDOGS', en: 'REAL, Gray Zone Warfare and WARDOGS' },
    items: {
      cs: [
        'REAL: nastavení zaměřovače pro první ránu skutečnou puškou na 100–2000 m, s předvolbami pušek české armády a policie.',
        'Počasí zadáš ručně, nebo ho aplikace načte podle polohy.',
        '„Jak se to počítá“ v deseti krocích.',
        'Kalkulačka pro Gray Zone Warfare. WARDOGS brzy.',
      ],
      en: [
        'REAL: the scope setting for the first shot with a real rifle at 100–2000 m, with presets for Czech army and police rifles.',
        'Weather by hand, or by location.',
        '“How it’s calculated” in ten steps.',
        'A calculator for Gray Zone Warfare. WARDOGS soon.',
      ],
    },
  },
]
