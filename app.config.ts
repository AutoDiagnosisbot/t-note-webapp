import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'dev' | 'prod';

const APP_VARIANT = (process.env.APP_VARIANT === 'prod' ? 'prod' : 'dev') as AppVariant;
const IS_PROD = APP_VARIANT === 'prod';

const APP_NAME = IS_PROD ? 'T-Note' : 'T-Note Dev';
const APP_SLUG = IS_PROD ? 't-note-webapp' : 't-note-webapp-dev';
const APP_SCHEME = IS_PROD ? 'tnotewebapp' : 'tnotewebapp-dev';
const APP_BASE_URL = IS_PROD ? 'https://t-note.ru' : 'https://tro.posle.school';
const APP_BASE_HOST = new URL(APP_BASE_URL).hostname;
const ANDROID_PACKAGE = IS_PROD ? 'ru.xamloru.tnotewebapp' : 'ru.xamloru.tnotewebapp.dev';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: APP_SCHEME,
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_PROD ? 'ru.xamloru.tnotewebapp' : 'ru.xamloru.tnotewebapp.dev',
    infoPlist: {
      WKAppBoundDomains: [APP_BASE_HOST],
    },
    icon: {
      light: './assets/images/icon-color-1024.png',
      dark: './assets/images/icon-color-1024.png',
      tinted: './assets/images/icon-monochrome-1024.png',
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: 2,
    icon: './assets/images/icon.png',
    adaptiveIcon: {
      backgroundImage: './assets/images/android-icon-background.png',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/icon-monochrome-512.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#ED534F',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    appVariant: APP_VARIANT,
    appBaseUrl: APP_BASE_URL,
    eas: {
      projectId: 'e938f8b0-3eb1-4772-9e2c-707d479d8ab6',
    },
  },
  owner: 'xamloru',
});
