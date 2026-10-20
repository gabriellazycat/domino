import { EN } from './i18n.en';

// Idiomas do jogo. O texto-fonte é o português: `t('texto em pt')` devolve a tradução no idioma ativo
// (sem tradução, devolve o próprio texto). `{nome}` marca valores que entram depois.
export type Lang = 'pt' | 'en';
const KEY = 'dominotion.lang';

function detect(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'pt' || s === 'en') return s;
  } catch { /* sem storage */ }
  if (typeof window === 'undefined') return 'pt';
  return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let lang: Lang = detect();
const listeners: (() => void)[] = [];

export const getLang = (): Lang => lang;
export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ok */ }
  applyDocLang();
  for (const f of listeners) f();
}
export const onLangChange = (f: () => void) => { listeners.push(f); };

export function t(pt: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? (EN[pt] ?? pt) : pt;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Faz os campos de texto de um objeto de dados (escrito em português) seguirem o idioma ativo. */
export function localize<T extends object>(o: T, keys: (keyof T)[]): T {
  for (const k of keys) {
    const pt = o[k] as unknown as string;
    Object.defineProperty(o, k, { get: () => t(pt), enumerable: true, configurable: true });
  }
  return o;
}

export function applyDocLang() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  document.title = t('DOMINOTION — Dominó Roguelike');
  const sub = document.querySelector('.boot-sub');
  if (sub) sub.textContent = t('carregando a física…');
  const d = document.querySelector('meta[name=description]');
  if (d) d.setAttribute('content', t('Monte a corrente de dominós, aperte DISPARAR e derrube o exército inteiro.'));
}
