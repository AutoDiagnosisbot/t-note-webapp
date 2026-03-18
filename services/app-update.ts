import * as Application from 'expo-application';
import { Platform } from 'react-native';

import {
  APP_BASE_URL,
  APP_UPDATE_CHANNEL,
  APP_UPDATE_ENDPOINT,
  APP_UPDATE_PLATFORM,
} from '@/constants/app-config';

type AppUpdateApiResponse = {
  platform?: unknown;
  channel?: unknown;
  latestVersion?: unknown;
  latestBuild?: unknown;
  minSupportedVersion?: unknown;
  minSupportedBuild?: unknown;
  forceUpdate?: unknown;
  storeUrl?: unknown;
  message?: unknown;
};

export type AppUpdateStatus =
  | 'upToDate'
  | 'softUpdate'
  | 'forceUpdate'
  | 'unsupported'
  | 'unavailable';

export type AppUpdateResult = {
  status: AppUpdateStatus;
  platform: string | null;
  channel: string | null;
  currentVersion: string | null;
  currentBuild: number | null;
  latestVersion: string | null;
  latestBuild: number | null;
  minSupportedVersion: string | null;
  minSupportedBuild: number | null;
  forceUpdate: boolean;
  storeUrl: string | null;
  message: string | null;
};

function createBaseResult(
  status: AppUpdateStatus,
  overrides: Partial<AppUpdateResult> = {}
): AppUpdateResult {
  return {
    status,
    platform: APP_UPDATE_PLATFORM,
    channel: APP_UPDATE_CHANNEL,
    currentVersion: normalizeString(Application.nativeApplicationVersion),
    currentBuild: parseBuildNumber(Application.nativeBuildVersion),
    latestVersion: null,
    latestBuild: null,
    minSupportedVersion: null,
    minSupportedBuild: null,
    forceUpdate: false,
    storeUrl: null,
    message: null,
    ...overrides,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseBuildNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

function buildUpdateUrl(): string {
  const platform = encodeURIComponent(APP_UPDATE_PLATFORM);
  const channel = encodeURIComponent(APP_UPDATE_CHANNEL);
  return `${APP_BASE_URL}${APP_UPDATE_ENDPOINT}?platform=${platform}&channel=${channel}`;
}

export async function checkForAppUpdate(): Promise<AppUpdateResult> {
  if (Platform.OS !== 'android') {
    return createBaseResult('unsupported', {
      platform: Platform.OS,
      channel: null,
    });
  }

  const currentVersion = normalizeString(Application.nativeApplicationVersion);
  const currentBuild = parseBuildNumber(Application.nativeBuildVersion);

  if (currentBuild === null) {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  let response: Response;
  try {
    response = await fetch(buildUpdateUrl(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  if (response.status === 404) {
    return createBaseResult('unsupported', { currentVersion, currentBuild });
  }

  if (!response.ok) {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  let payload: AppUpdateApiResponse | null;
  try {
    payload = await parseJson<AppUpdateApiResponse>(response);
  } catch {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  if (!payload) {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  const latestBuild = parseBuildNumber(payload.latestBuild);
  const minSupportedBuild = parseBuildNumber(payload.minSupportedBuild);
  const latestVersion = normalizeString(payload.latestVersion);
  const minSupportedVersion = normalizeString(payload.minSupportedVersion);
  const storeUrl = normalizeString(payload.storeUrl);
  const message = normalizeString(payload.message);
  const responsePlatform = normalizeString(payload.platform) ?? APP_UPDATE_PLATFORM;
  const responseChannel = normalizeString(payload.channel) ?? APP_UPDATE_CHANNEL;
  const shouldForceByFlag = payload.forceUpdate === true;

  if (latestBuild === null || minSupportedBuild === null) {
    return createBaseResult('unavailable', { currentVersion, currentBuild });
  }

  const resultOverrides = {
    platform: responsePlatform,
    channel: responseChannel,
    currentVersion,
    currentBuild,
    latestVersion,
    latestBuild,
    minSupportedVersion,
    minSupportedBuild,
    forceUpdate: shouldForceByFlag,
    storeUrl,
    message,
  } satisfies Partial<AppUpdateResult>;

  if (currentBuild < minSupportedBuild || (shouldForceByFlag && currentBuild < latestBuild)) {
    return createBaseResult('forceUpdate', resultOverrides);
  }

  if (currentBuild < latestBuild) {
    return createBaseResult('softUpdate', resultOverrides);
  }

  return createBaseResult('upToDate', resultOverrides);
}
