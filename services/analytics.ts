import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { APP_VARIANT } from '@/constants/app-config';

const APPMETRICA_API_KEY = 'bae93da2-b5e4-4bb1-ba47-8ca8d03c2ffd';

type EventParams = Record<string, string | number | boolean | null | undefined>;
type AppMetricaModule = typeof import('@appmetrica/react-native-analytics').default;

let isInitialized = false;
let isInitializationAttempted = false;
let cachedModule: AppMetricaModule | null = null;

function isAnalyticsEnabled(): boolean {
  return Platform.OS === 'android' && APP_VARIANT === 'prod';
}

function sanitizeParams(params?: EventParams): Record<string, string | number | boolean | null> | undefined {
  if (!params) {
    return undefined;
  }

  const filteredEntries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (filteredEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filteredEntries) as Record<string, string | number | boolean | null>;
}

function getAppMetrica(): AppMetricaModule | null {
  if (!isAnalyticsEnabled()) {
    return null;
  }

  if (cachedModule) {
    return cachedModule;
  }

  try {
    cachedModule = require('@appmetrica/react-native-analytics').default as AppMetricaModule;
    return cachedModule;
  } catch {
    return null;
  }
}

export function initializeAnalytics(): void {
  if (!isAnalyticsEnabled() || isInitialized || isInitializationAttempted) {
    return;
  }

  isInitializationAttempted = true;

  const appMetrica = getAppMetrica();
  if (!appMetrica) {
    return;
  }

  try {
    appMetrica.activate({
      apiKey: APPMETRICA_API_KEY,
      appVersion: Constants.expoConfig?.version,
      logs: __DEV__,
      crashReporting: true,
      nativeCrashReporting: true,
      appOpenTrackingEnabled: true,
      sessionsAutoTracking: true,
      statisticsSending: true,
      firstActivationAsUpdate: false,
      sessionTimeout: 120,
    });

    appMetrica.putAppEnvironmentValue('app_variant', APP_VARIANT);
    if (Constants.expoConfig?.version) {
      appMetrica.putAppEnvironmentValue('app_version', Constants.expoConfig.version);
    }

    isInitialized = true;
  } catch {
    isInitialized = false;
  }
}

export function reportScreen(screen: string, params?: EventParams): void {
  const appMetrica = getAppMetrica();
  if (!appMetrica || !isInitialized) {
    return;
  }

  appMetrica.reportEvent(
    'screen_view',
    sanitizeParams({
      screen,
      ...params,
    })
  );
}

export function reportEvent(name: string, params?: EventParams): void {
  const appMetrica = getAppMetrica();
  if (!appMetrica || !isInitialized) {
    return;
  }

  appMetrica.reportEvent(name, sanitizeParams(params));
}

export function reportError(name: string, error: unknown, params?: EventParams): void {
  const appMetrica = getAppMetrica();
  if (!appMetrica || !isInitialized) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  appMetrica.reportError(name, message, error instanceof Error ? error : undefined);
  appMetrica.reportEvent(
    name,
    sanitizeParams({
      error_message: message,
      ...params,
    })
  );
}

export function setAnalyticsUserProfileId(userProfileId?: string): void {
  const appMetrica = getAppMetrica();
  if (!appMetrica || !isInitialized) {
    return;
  }

  appMetrica.setUserProfileID(userProfileId);
}

export function reportRevenuePlaceholder(): void {
  // Reserved for future revenue reporting integration.
}

export function reportUserProfilePlaceholder(): void {
  // Reserved for future user profile reporting integration.
}
