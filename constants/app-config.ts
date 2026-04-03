import Constants from 'expo-constants';

type ExtraConfig = {
  appBaseUrl?: string;
  appVariant?: 'dev' | 'prod';
  webviewDebugEnabled?: boolean;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export const APP_VARIANT = extra.appVariant === 'prod' ? 'prod' : 'dev';
export const APP_BASE_URL = extra.appBaseUrl ?? 'https://tro.posle.school';
export const WEBVIEW_DEBUG_ENABLED =
  typeof extra.webviewDebugEnabled === 'boolean'
    ? extra.webviewDebugEnabled
    : APP_VARIANT === 'dev';

export const APP_COLORS = {
  primary: '#ED534F',
  textPrimary: '#333058',
  textSecondary: '#85839B',
  background: '#F5F7FF',
  surface: '#FFFFFF',
  border: '#ECECF2',
  muted: '#D7D7DE',
  errorBg: '#FDEEEE',
} as const;

export const AUTH_ENDPOINTS = {
  requestCode: '/server/tro-auth/request-code',
  verifyCode: '/server/tro-auth/verify-code',
  login: '/server/tro-auth/login',
  register: '/server/tro-auth/register',
  authInfo: '/server/tro-auth/authInfo',
} as const;

export const APP_UPDATE_ENDPOINT = '/server/tro/app-version';
export const APP_UPDATE_CHANNEL = 'rustore';
export const APP_UPDATE_PLATFORM = 'android';

export type MenuItemKey = 'sportsmens' | 'visits' | 'payments' | 'documents' | 'more';

export type NativeMenuItem = {
  key: MenuItemKey;
  label: string;
  path: string;
  icon: 'people' | 'calendar' | 'card' | 'document-text' | 'menu';
};

export const DEFAULT_LK_PATH = '/traineronline/lk/sportsmens';

export const OFFLINE_SUPPORTED_PATHS = [
  '/traineronline/lk/sportsmens',
  '/traineronline/lk/visits',
  '/traineronline/lk/payments',
] as const;

export const NATIVE_MENU_ITEMS: NativeMenuItem[] = [
  {
    key: 'sportsmens',
    label: 'Спортсмены',
    path: '/traineronline/lk/sportsmens',
    icon: 'people',
  },
  {
    key: 'visits',
    label: 'Посещения',
    path: '/traineronline/lk/visits',
    icon: 'calendar',
  },
  {
    key: 'payments',
    label: 'Оплаты',
    path: '/traineronline/lk/payments',
    icon: 'card',
  },
  {
    key: 'documents',
    label: 'Документы',
    path: '/traineronline/lk/documents',
    icon: 'document-text',
  },
  {
    key: 'more',
    label: 'Еще',
    path: '/traineronline/lk/more',
    icon: 'menu',
  },
];
