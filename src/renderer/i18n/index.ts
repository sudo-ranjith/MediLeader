import en from './en';
import ta from './ta';

export type Lang = 'en' | 'ta';

const translations: Record<Lang, typeof en> = { en, ta };

let currentLang: Lang = 'en';

export function setLanguage(lang: Lang) {
  currentLang = lang;
  localStorage.setItem('pharma-vault-lang', lang);
}

export function getLanguage(): Lang {
  const stored = localStorage.getItem('pharma-vault-lang') as Lang | null;
  if (stored && stored in translations) currentLang = stored;
  return currentLang;
}

export function t(path: string): string {
  const keys = path.split('.');
  let obj: any = translations[currentLang];
  for (const key of keys) {
    obj = obj?.[key];
    if (obj === undefined) {
      // Fallback to English
      let fallback: any = translations['en'];
      for (const k of keys) fallback = fallback?.[k];
      return typeof fallback === 'string' ? fallback : path;
    }
  }
  return typeof obj === 'string' ? obj : path;
}

// Initialize from localStorage
getLanguage();
