import {
  APP_BASE_URL,
  DEFAULT_LK_PATH,
  type MenuItemKey,
  NATIVE_MENU_ITEMS,
} from '@/constants/app-config';

export function toAbsoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return `${APP_BASE_URL}${path}`;
}

export function normalizePath(path: string): string {
  if (!path) {
    return DEFAULT_LK_PATH;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    const url = new URL(path);
    return `${url.pathname}${url.search}`;
  }

  return path;
}

export function getMenuKeyForPath(path: string): MenuItemKey {
  const normalized = normalizePath(path);

  const matching = NATIVE_MENU_ITEMS.find((item) => normalized.startsWith(item.path));
  if (matching) {
    return matching.key;
  }

  return 'more';
}

export function isAppHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(APP_BASE_URL);
    return parsed.host === base.host;
  } catch {
    return false;
  }
}

