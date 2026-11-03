// After `vite build`: proves the built pages' references resolve to files under dist/, and the OCR engine is there.
// Each page is resolved as a browser would see it under a subpath (GitHub and GitLab Pages), so a root-absolute
// reference (/assets/…) counts as broken: it would leave the app's folder. A folder reference (cs/) counts when the
// folder holds an index.html. Exits 1 at the first broken reference.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PAGES = ['index.html', 'cs/index.html', 'en/index.html', 'cs/changelog/index.html', 'en/changelog/index.html']
const REQUIRED = ['ocr/worker.min.js', 'ocr/eng.traineddata.gz', 'manifest.webmanifest']
// Any host and subpath will do; only what stays under it counts.
const SITE = 'https://pages.invalid/app/'

const isFile = (path) => existsSync(path) && statSync(path).isFile()
// A folder link (cs/) is served as its index.html, as Pages does.
const isPage = (path) => isFile(path) || (existsSync(path) && statSync(path).isDirectory() && isFile(join(path, 'index.html')))

function fail(message) {
  console.error(`check-dist: ${message}`)
  process.exit(1)
}

let refs = 0
for (const page of PAGES) {
  const file = join(dist, page)
  if (!isFile(file)) fail(`dist/${page} is missing`)
  const html = readFileSync(file, 'utf8')
  for (const m of html.matchAll(/\s(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const ref = m[2] ?? m[3] ?? m[4]
    if (/^(?:https?:|data:|#)/i.test(ref)) continue
    refs++
    const url = new URL(ref, SITE + page)
    const inside = url.href.startsWith(SITE)
    const target = inside ? decodeURIComponent(url.pathname.slice(new URL(SITE).pathname.length)) : ''
    if (!inside || !isPage(join(dist, target))) fail(`dist/${page}: ${m[1]}="${ref}" does not resolve to a file under dist/`)
  }
}
// The manifest's references resolve against the manifest's own URL, and each must stay under the site.
if (isFile(join(dist, 'manifest.webmanifest'))) {
  let manifest
  try { manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) } catch { fail('dist/manifest.webmanifest is not valid JSON') }
  const base = SITE + 'manifest.webmanifest'
  const sitePath = new URL(SITE).pathname.length
  const inSite = (key, ref) => {
    refs++
    const url = new URL(ref, base)
    if (!url.href.startsWith(SITE)) fail(`dist/manifest.webmanifest: ${key}="${ref}" leaves the site`)
    return decodeURIComponent(url.pathname.slice(sitePath))
  }
  for (const key of ['start_url', 'scope']) {
    if (typeof manifest[key] !== 'string') fail(`dist/manifest.webmanifest: ${key} is missing`)
    if (!isPage(join(dist, inSite(key, manifest[key])))) fail(`dist/manifest.webmanifest: ${key}="${manifest[key]}" does not resolve under dist/`)
  }
  for (const icon of manifest.icons ?? []) {
    if (!isFile(join(dist, inSite('icons[].src', icon.src)))) fail(`dist/manifest.webmanifest: icons[].src="${icon.src}" is not a file under dist/`)
  }
}
for (const path of REQUIRED) if (!isFile(join(dist, path))) fail(`dist/${path} is missing`)
console.log(`check-dist: ${PAGES.length} pages, ${refs} references resolve under dist/; ${REQUIRED.join(' and ')} present`)
