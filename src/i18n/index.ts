import type { Lang } from '../settings/url'
import { cs } from './cs'
import { en } from './en'

export type TKey = keyof typeof en
export type T = (key: TKey, vars?: Record<string, string | number>) => string

const DICTS: Record<Lang, Record<TKey, string>> = { en, cs }

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  const text = DICTS[lang][key] ?? en[key]
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text
}
