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
    version: '0.1.8',
    date: '2026-11-04',
    title: { cs: 'Zóny větru a míření kamerou', en: 'Wind zones and the camera aim' },
    items: {
      cs: [
        'Zóny větru: od 300 m můžeš vítr rozdělit na dvě, od 600 m na tři části trati. Každá má svou rychlost a směr a výpočet je počítá přesně, ne průměrem.',
        'Nápověda, jak číst vítr: měřák, mirage, vlajky, tráva a stromy.',
        'Zaměření kamerou vypadá jako puškohled, samo se zamkne, když telefon držíš v klidu, a v aplikaci na ploše ho otevře rovnou klepnutí na Vzdálenost.',
        'Vzdálenost nastavíš tažením po stupnici do strany.',
      ],
      en: [
        'Wind zones: from 300 m you can split the wind into two stretches, from 600 m into three. Each has its own speed and direction, and the solver uses them exactly, not as an average.',
        'Help on reading the wind: the meter, mirage, flags, grass and trees.',
        'Aiming with the camera looks like a scope, locks by itself when you hold the phone still, and in the home-screen app a tap on Distance opens it straight away.',
        'Set the distance by dragging the scale sideways.',
      ],
    },
  },
  {
    version: '0.1.7',
    date: '2026-11-04',
    title: { cs: 'Telefon změří, vítr se otočí', en: 'The phone measures, the wind turns' },
    items: {
      cs: [
        'Zaměřit v panelu Střelba změří telefonem směr i sklon najednou: míříš horní hranou telefonu na terč. V nastavení si můžeš vyzkoušet míření kamerou.',
        'Když změníš směr, vítr se otočí s tebou: fouká dál od stejné světové strany a jeho hodina se přepočítá sama.',
        'V nastavení si můžeš zapnout vítr z předpovědi automaticky. Dokud vítr nezadáš sám, drží se předpovědi.',
        'Počasí podle polohy se obnovuje samo každých 15 minut, dokud je stránka otevřená. Vypneš to v Atmosféře.',
      ],
      en: [
        "Aim in the shot panel measures the direction and the slope at once: point the phone's top edge at the target. In the settings you can try aiming with the camera.",
        'When you change the direction, the wind turns with you: it keeps blowing from the same compass point and its hour is recomputed.',
        'In the settings you can have the forecast wind applied automatically. Until you set the wind yourself, it follows the forecast.',
        'The weather by location refreshes by itself every 15 minutes while the page is open. You can turn it off in Atmosphere.',
      ],
    },
  },
  {
    version: '0.1.6',
    date: '2026-11-03',
    title: { cs: 'Vzdálenost a vítr dole', en: 'Distance and wind at the bottom' },
    items: {
      cs: [
        'Na telefonu jsou dole dvě tlačítka, Vzdálenost a Vítr. Každé otevře, co k němu patří: vzdálenost se sklonem a směrem střelby, vítr s nejistotou a ciferníkem.',
        'Na počítači je všechno rovnou na spodním řádku.',
        'Když načteš počasí podle polohy, aplikace nabídne vítr z předpovědi, přepočtený na výšku, ze které střílíš. Použije se, jen když klepneš na Použít.',
        'Ciferník větru ukazuje světové strany, když zadáš směr střelby.',
        'Terč je pevně 50 cm. Jednotka větru je v nastavení.',
      ],
      en: [
        'On a phone there are two buttons at the bottom, Distance and Wind. Each opens what belongs to it: the distance with the slope and the shooting direction, the wind with its uncertainty and the clock.',
        'On a computer it is all on the bottom row.',
        'When you load the weather by location, the app offers the forecast wind, converted to the height you shoot from. It applies only when you tap Use.',
        'The wind clock shows the compass points once you set the shooting direction.',
        'The target is fixed at 50 cm. The wind unit is in the settings.',
      ],
    },
  },
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
