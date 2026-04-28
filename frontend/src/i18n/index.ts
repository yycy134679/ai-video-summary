import zhCN from "./zh-CN";

export type Locale = typeof zhCN;

let currentLocale: Locale = zhCN;

export function t(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export { zhCN };
