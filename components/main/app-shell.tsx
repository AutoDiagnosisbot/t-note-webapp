import { Ionicons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  FileDownloadEvent,
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigation,
  WebViewProgressEvent,
  WebViewRenderProcessGoneEvent,
} from 'react-native-webview/lib/WebViewTypes';

import {
  APP_BASE_URL,
  APP_COLORS,
  APP_VARIANT,
  DEFAULT_LK_PATH,
  NATIVE_MENU_ITEMS,
  OFFLINE_SUPPORTED_PATHS,
  WEBVIEW_DEBUG_ENABLED,
} from '@/constants/app-config';
import type { AuthInfo } from '@/services/auth';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { reportEvent, reportScreen } from '@/services/analytics';
import {
  downloadFromBase64,
  downloadFromUrl,
  isDownloadCancelledError,
  type DownloadSource,
} from '@/services/downloads';
import { buildWebViewAuthInjection } from '@/services/session';
import {
  buildDispatchNativeBridgeMessageScript,
  type NativeToWebBridgeMessage,
  type WebToNativeBridgeMessage,
} from '@/services/webview-bridge';
import { getMenuKeyForPath, isAppHost, normalizePath, toAbsoluteUrl } from '@/utils/web-routes';
import { OfflineScreen } from './offline-screen';

type AppShellProps = {
  accessToken: string;
  authInfo: AuthInfo | null;
  initialPath?: string;
  onLogout: () => void;
};

type DownloadBridgeBlobMessage = {
  type: 'tnote-download-blob';
  filename?: string;
  mimeType?: string;
  base64: string;
};

type DownloadBridgeUrlMessage = {
  type: 'tnote-download-url';
  url: string;
  filename?: string;
};

type LegacyLogoutBridgeMessage = {
  type: 'tnote-logout';
};

type BridgeDebugLogMessage = {
  type: 'debug.log';
  scope?: string;
  message: string;
  data?: unknown;
};

type DebugLogEntry = {
  id: number;
  source: 'native' | 'web';
  event: string;
  details: string;
  time: string;
};

type OfflineBridgeState = {
  isOffline: boolean;
  supportedPaths: string[];
  availablePaths: string[] | null;
  isWarmupReady: boolean;
};

type IncomingWebViewMessage =
  | WebToNativeBridgeMessage
  | BridgeDebugLogMessage
  | DownloadBridgeBlobMessage
  | DownloadBridgeUrlMessage
  | LegacyLogoutBridgeMessage;

const OFFLINE_ERROR_PATTERNS = [
  'err_internet_disconnected',
  'err_name_not_resolved',
  'err_address_unreachable',
  'err_connection_timed_out',
  'err_connection_closed',
  'err_connection_refused',
  'err_network_changed',
  'err_network_access_denied',
  'err_connection_aborted',
  'internet connection appears to be offline',
  'network connection was lost',
  'could not connect to the server',
  'hostname could not be found',
] as const;
const OFFLINE_FALLBACK_DELAY_MS = 1_500;
const WEBVIEW_APP_USER_AGENT = 'Mozilla/5.0 (Mobile; TNoteAppWebView/1.0)';
const WEBVIEW_APP_USER_AGENT_TOKEN = 'TNoteAppWebView';
const OFFLINE_BANNER_TEXT_READY =
  'Оффлайн-режим: доступны посещения, оплаты и уже сохраненные спортсмены. Остальной функционал требует сеть.';
const OFFLINE_BANNER_TEXT_WARMING =
  'Оффлайн-режим: подготовка еще не завершена. Сейчас доступен только уже открытый раздел и ранее сохраненные данные.';
const OFFLINE_BANNER_TEXT_CHECKING =
  'Оффлайн-режим: проверяем сохраненные данные. Доступность разделов уточняется.';

function isLikelyOfflineWebViewError(error: {
  code?: number;
  description?: string;
  domain?: string;
}): boolean {
  const normalizedDescription = `${error.description ?? ''} ${error.domain ?? ''}`.toLowerCase();

  if (typeof error.code === 'number') {
    const offlineCodes = new Set([-2, -6, -1001, -1003, -1004, -1005, -1006, -1009]);
    if (offlineCodes.has(error.code)) {
      return true;
    }
  }

  if (normalizedDescription.includes('net::err_')) {
    return true;
  }

  return OFFLINE_ERROR_PATTERNS.some((pattern) => normalizedDescription.includes(pattern));
}

function isInternetReachable(
  networkState: Network.NetworkState | null | undefined
): boolean {
  if (!networkState) {
    return false;
  }

  if (typeof networkState.isInternetReachable === 'boolean') {
    return networkState.isInternetReachable;
  }

  if (typeof networkState.isConnected === 'boolean') {
    return networkState.isConnected;
  }

  return (
    networkState.type != null &&
    networkState.type !== Network.NetworkStateType.NONE &&
    networkState.type !== Network.NetworkStateType.UNKNOWN
  );
}

function formatDebugDetails(data?: unknown): string {
  if (typeof data === 'undefined') {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function AppShellComponent({
  accessToken,
  authInfo,
  initialPath = DEFAULT_LK_PATH,
  onLogout,
}: AppShellProps) {
  const webViewRef = useRef<WebView>(null);
  const isLoggingOutRef = useRef(false);
  const isBridgeReadyRef = useRef(false);
  const authRedirectCountRef = useRef(0);
  const authRedirectWindowStartRef = useRef(0);
  const loaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugLogIdRef = useRef(0);
  const nativeNetworkReachableRef = useRef<boolean | null>(null);
  const nativeNetworkStateRef = useRef<Network.NetworkState | null>(null);
  const [path, setPath] = useState<string>(normalizePath(initialPath));
  const [sourcePath, setSourcePath] = useState<string>(normalizePath(initialPath));
  const [webViewInstanceKey, setWebViewInstanceKey] = useState(0);
  const [isLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [isOfflineScreenVisible, setIsOfflineScreenVisible] = useState<boolean>(false);
  const [isDebugPanelVisible, setIsDebugPanelVisible] = useState<boolean>(WEBVIEW_DEBUG_ENABLED);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [offlineBridgeState, setOfflineBridgeState] = useState<OfflineBridgeState>({
    isOffline: false,
    supportedPaths: [],
    availablePaths: null,
    isWarmupReady: false,
  });

  const injectedAuthScript = useMemo(
    () => buildWebViewAuthInjection(accessToken, authInfo),
    [accessToken, authInfo]
  );
  const selectedMenuKey = getMenuKeyForPath(path);
  const currentUrl = toAbsoluteUrl(sourcePath);
  const debugEnabled = WEBVIEW_DEBUG_ENABLED;
  const isOfflineModeActive =
    offlineBridgeState.isOffline || nativeNetworkReachableRef.current === false;
  const hasKnownOfflineAvailability =
    offlineBridgeState.supportedPaths.length > 0 ||
    (offlineBridgeState.availablePaths?.length ?? 0) > 0;
  const offlineAvailablePathSet = useMemo(
    () => {
      const effectiveOfflineAvailablePaths = hasKnownOfflineAvailability
        ? offlineBridgeState.availablePaths !== null
          ? offlineBridgeState.availablePaths
          : offlineBridgeState.supportedPaths
        : [...OFFLINE_SUPPORTED_PATHS];

      return new Set(
        effectiveOfflineAvailablePaths.map((supportedPath) => normalizePath(supportedPath))
      );
    },
    [
      hasKnownOfflineAvailability,
      offlineBridgeState.availablePaths,
      offlineBridgeState.supportedPaths,
    ]
  );
  const offlineBannerText = offlineBridgeState.isOffline
    ? offlineBridgeState.isWarmupReady
      ? 'Оффлайн-режим: доступны посещения, оплаты и уже сохраненные спортсмены. Остальной функционал требует сеть.'
      : 'Оффлайн-режим: подготовка еще не завершена. Сейчас доступен только уже открытый раздел и ранее сохраненные данные.'
    : null;

  const resolvedOfflineBannerText =
    isOfflineModeActive && !offlineBannerText
      ? hasKnownOfflineAvailability
        ? 'Оффлайн-режим: подготовка еще не завершена. Сейчас доступен только уже открытый раздел и ранее сохраненные данные.'
        : 'Оффлайн-режим: проверяем сохраненные данные. Доступность разделов уточняется.'
      : offlineBannerText;

  const normalizedOfflineBannerText = offlineBridgeState.isOffline
    ? offlineBridgeState.isWarmupReady
      ? OFFLINE_BANNER_TEXT_READY
      : OFFLINE_BANNER_TEXT_WARMING
    : isOfflineModeActive
      ? hasKnownOfflineAvailability
        ? OFFLINE_BANNER_TEXT_WARMING
        : OFFLINE_BANNER_TEXT_CHECKING
      : null;

  const resolveDownloadUrl = (url: string): string => toAbsoluteUrl(url);

  const getDownloadHeaders = (url: string): Record<string, string> | undefined => {
    if (!accessToken) {
      return undefined;
    }

    const absoluteUrl = resolveDownloadUrl(url);
    if (!isAppHost(absoluteUrl)) {
      return undefined;
    }

    return {
      Authorization: `Bearer ${accessToken}`,
    };
  };

  const appendDebugLog = useCallback((source: 'native' | 'web', event: string, data?: unknown): void => {
    if (!debugEnabled) {
      return;
    }

    const details = formatDebugDetails(data);
    const timestamp = new Date().toLocaleTimeString('ru-RU', {
      hour12: false,
    });

    console.log(`[TNoteWebView][${source}] ${event}`, data ?? '');

    setDebugLogs((currentLogs) => {
      const nextLog: DebugLogEntry = {
        id: debugLogIdRef.current + 1,
        source,
        event,
        details,
        time: timestamp,
      };
      debugLogIdRef.current = nextLog.id;
      return [nextLog, ...currentLogs].slice(0, 80);
    });
  }, [debugEnabled]);

  useEffect(() => {
    appendDebugLog('native', 'webview.user_agent.configured', {
      userAgent: WEBVIEW_APP_USER_AGENT,
      userAgentToken: WEBVIEW_APP_USER_AGENT_TOKEN,
      platform: Platform.OS,
      variant: APP_VARIANT,
    });
  }, [appendDebugLog]);

  const dispatchNativeBridgeMessage = useCallback((message: NativeToWebBridgeMessage): void => {
    appendDebugLog('native', 'bridge.dispatch', message);
    const script = buildDispatchNativeBridgeMessageScript(message);
    webViewRef.current?.injectJavaScript(script);
  }, [appendDebugLog]);

  const syncNativeNetworkStateToWeb = useCallback(
    (networkState: Network.NetworkState, source: 'initial' | 'listener' | 'bridge_ready'): void => {
      const reachable = isInternetReachable(networkState);

      dispatchNativeBridgeMessage({
        type: 'native.network_status',
        isOffline: !reachable,
        reachable,
        source,
      });
    },
    [dispatchNativeBridgeMessage]
  );

  const clearTimersOnUnmount = useCallback((): void => {
    if (loaderTimerRef.current) {
      clearTimeout(loaderTimerRef.current);
      loaderTimerRef.current = null;
    }

    if (offlineFallbackTimerRef.current) {
      clearTimeout(offlineFallbackTimerRef.current);
      offlineFallbackTimerRef.current = null;
    }
  }, []);

  const clearPendingOfflineFallback = useCallback((reason: string, data?: unknown): void => {
    if (!offlineFallbackTimerRef.current) {
      return;
    }

    clearTimeout(offlineFallbackTimerRef.current);
    offlineFallbackTimerRef.current = null;
    appendDebugLog('native', 'offline.fallback_cleared', {
      reason,
      ...((data as Record<string, unknown> | undefined) ?? {}),
    });
  }, [appendDebugLog]);

  const scheduleOfflineFallback = (event: WebViewErrorEvent['nativeEvent']): void => {
    clearPendingOfflineFallback('rescheduled', {
      url: event.url,
    });
    appendDebugLog('native', 'offline.fallback_scheduled', {
      delayMs: OFFLINE_FALLBACK_DELAY_MS,
      path,
      sourcePath,
      url: event.url,
      code: event.code,
      description: event.description,
    });
    offlineFallbackTimerRef.current = setTimeout(() => {
      offlineFallbackTimerRef.current = null;
      appendDebugLog('native', 'offline.fallback_shown', {
        path,
        sourcePath,
        url: event.url,
        code: event.code,
        description: event.description,
      });
      reportEvent('webview_offline_shown', {
        path,
        source_path: sourcePath,
        url: event.url,
        code: event.code,
        description: event.description,
      });
      reportEvent('webview_error_screen_shown', {
        path,
        source_path: sourcePath,
        url: event.url,
        code: event.code,
        description: event.description,
        is_offline_like: true,
      });
      setIsOfflineScreenVisible(true);
    }, OFFLINE_FALLBACK_DELAY_MS);
  };

  const retryCurrentPageLoad = (): void => {
    clearPendingOfflineFallback('retry_requested', {
      path,
      sourcePath,
    });
    appendDebugLog('native', 'offline.retry_requested', {
      path,
      sourcePath,
    });
    reportEvent('webview_offline_retry', {
      path,
      source_path: sourcePath,
    });
    isBridgeReadyRef.current = false;
    setIsOfflineScreenVisible(false);
    setSourcePath(path);
    setWebViewInstanceKey((currentValue) => currentValue + 1);
  };

  const recoverOnlineMode = useCallback(
    (reason: string, networkState?: Network.NetworkState | null): void => {
      clearPendingOfflineFallback('network_recovered', {
        reason,
        path,
        sourcePath,
      });
      appendDebugLog('native', 'network.recovered', {
        reason,
        path,
        sourcePath,
        networkState,
      });
      reportEvent('webview_network_recovered', {
        path,
        source_path: sourcePath,
        reason,
      });
      isBridgeReadyRef.current = false;
      setIsOfflineScreenVisible(false);
      setOfflineBridgeState({
        isOffline: false,
        supportedPaths: [],
        availablePaths: null,
        isWarmupReady: false,
      });
      setSourcePath(path);
      setWebViewInstanceKey((currentValue) => currentValue + 1);
    },
    [appendDebugLog, clearPendingOfflineFallback, path, sourcePath]
  );

  const navigateToPath = (
    nextPath: string,
    options?: {
      useBridge?: boolean;
      replace?: boolean;
    }
  ): void => {
    const normalizedNextPath = normalizePath(nextPath);
    if (!normalizedNextPath.startsWith('/traineronline/')) {
      appendDebugLog('native', 'navigate.rejected', {
        nextPath,
        normalizedNextPath,
      });
      return;
    }

    if (normalizedNextPath === path && options?.useBridge && isBridgeReadyRef.current) {
      appendDebugLog('native', 'navigate.skipped_same_path', {
        path: normalizedNextPath,
      });
      return;
    }

    clearPendingOfflineFallback('navigate.requested', {
      currentPath: path,
      nextPath: normalizedNextPath,
    });
    appendDebugLog('native', 'navigate.requested', {
      currentPath: path,
      nextPath: normalizedNextPath,
      useBridge: Boolean(options?.useBridge),
      replace: Boolean(options?.replace),
      isBridgeReady: isBridgeReadyRef.current,
    });

    setPath(normalizedNextPath);

    if (options?.useBridge && isBridgeReadyRef.current) {
      dispatchNativeBridgeMessage({
        type: 'native.navigate',
        path: normalizedNextPath,
        replace: options.replace,
      });
      return;
    }

    isBridgeReadyRef.current = false;
    appendDebugLog('native', 'navigate.reload_source', {
      nextPath: normalizedNextPath,
    });
    setSourcePath(normalizedNextPath);
  };

  const extractNavigablePath = (url: string): string | null => {
    try {
      const parsedUrl = new URL(url, APP_BASE_URL);
      const { pathname, searchParams } = parsedUrl;

      if (!pathname.startsWith('/traineronline/lk/')) {
        return null;
      }

      const sanitizedSearchParams = new URLSearchParams(searchParams);
      sanitizedSearchParams.delete('_rsc');

      const queryString = sanitizedSearchParams.toString();
      return queryString ? `${pathname}?${queryString}` : pathname;
    } catch {
      // Ignore URL parsing errors.
    }

    return null;
  };

  const extractReferrerPath = (url: string): string | null => {
    try {
      const parsedUrl = new URL(url, APP_BASE_URL);
      const referrer = parsedUrl.searchParams.get('referrer');
      if (referrer?.startsWith('/traineronline/lk/')) {
        return referrer;
      }
    } catch {
      // Ignore URL parsing errors.
    }

    return null;
  };

  const markAuthRedirectAndCheckLogout = (): boolean => {
    const now = Date.now();
    const windowMs = 10_000;
    const maxRedirectsPerWindow = 5;

    if (now - authRedirectWindowStartRef.current > windowMs) {
      authRedirectWindowStartRef.current = now;
      authRedirectCountRef.current = 0;
    }

    authRedirectCountRef.current += 1;
    if (authRedirectCountRef.current >= maxRedirectsPerWindow) {
      if (!isLoggingOutRef.current) {
        isLoggingOutRef.current = true;
        onLogout();
      }
      return true;
    }

    return false;
  };

  const recoverFromAuthRedirect = (authUrl: string): void => {
    const referrerPath = extractReferrerPath(authUrl);
    const recoveryPath = referrerPath || path;

    appendDebugLog('native', 'auth_redirect.recover', {
      authUrl,
      currentPath: path,
      recoveryPath,
      hasReferrerPath: Boolean(referrerPath),
    });
    webViewRef.current?.injectJavaScript(injectedAuthScript);

    if (recoveryPath.startsWith('/traineronline/lk/')) {
      navigateToPath(recoveryPath);
    }
  };

  usePushNotifications({
    onOpenPath: (nextPath) => {
      if (nextPath.startsWith('/traineronline/lk/')) {
        appendDebugLog('native', 'push.open_path', {
          path: nextPath,
        });
        reportEvent('push_open_path', { path: nextPath });
        navigateToPath(nextPath, { useBridge: true });
      }
    },
  });

  useEffect(() => {
    if (!debugEnabled) {
      return;
    }

    const details = {
      initialPath: normalizePath(initialPath),
      currentUrl,
    };
    let detailsText = '';
    try {
      detailsText = JSON.stringify(details);
    } catch {
      detailsText = String(details);
    }
    console.log('[TNoteWebView][native] app_shell.init', details);
    setDebugLogs((currentLogs) => {
      const nextLog: DebugLogEntry = {
        id: debugLogIdRef.current + 1,
        source: 'native',
        event: 'app_shell.init',
        details: detailsText,
        time: new Date().toLocaleTimeString('ru-RU', {
          hour12: false,
        }),
      };
      debugLogIdRef.current = nextLog.id;
      return [nextLog, ...currentLogs].slice(0, 80);
    });
  }, [currentUrl, debugEnabled, initialPath]);

  useEffect(() => {
    reportScreen('webview_route', {
      path,
      menu_key: selectedMenuKey,
    });
    reportEvent('webview_route_view', {
      path,
      menu_key: selectedMenuKey,
    });
  }, [path, selectedMenuKey]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) {
        return false;
      }

      webViewRef.current?.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  useEffect(() => {
    return () => {
      clearTimersOnUnmount();
    };
  }, [clearTimersOnUnmount]);

  useEffect(() => {
    let isMounted = true;

    const handleNativeNetworkState = (
      networkState: Network.NetworkState,
      source: 'initial' | 'listener'
    ): void => {
      if (!isMounted) {
        return;
      }

      const reachable = isInternetReachable(networkState);
      const previousReachable = nativeNetworkReachableRef.current;
      nativeNetworkReachableRef.current = reachable;
      nativeNetworkStateRef.current = networkState;

      appendDebugLog('native', 'network.state', {
        source,
        type: networkState.type,
        isConnected: networkState.isConnected,
        isInternetReachable: networkState.isInternetReachable,
        reachable,
      });

      if (isBridgeReadyRef.current) {
        syncNativeNetworkStateToWeb(networkState, source);
      }

      if (
        previousReachable === false &&
        reachable &&
        (isOfflineScreenVisible || isOfflineModeActive)
      ) {
        recoverOnlineMode(`native_${source}`, networkState);
      }
    };

    void Network.getNetworkStateAsync()
      .then((networkState) => {
        handleNativeNetworkState(networkState, 'initial');
      })
      .catch((error) => {
        appendDebugLog('native', 'network.state_error', {
          source: 'initial',
          error: error instanceof Error ? error.message : String(error),
        });
      });

    const subscription = Network.addNetworkStateListener((networkState) => {
      handleNativeNetworkState(networkState, 'listener');
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [appendDebugLog, isOfflineModeActive, isOfflineScreenVisible, recoverOnlineMode, syncNativeNetworkStateToWeb]);

  const handleShouldStartLoad = (request: ShouldStartLoadRequest): boolean => {
    const nextUrl = request.url;
    appendDebugLog('native', 'webview.should_start', {
      url: nextUrl,
      navigationType: request.navigationType,
      isTopFrame: request.isTopFrame,
      mainDocumentURL: request.mainDocumentURL,
    });

    if (!nextUrl) {
      return false;
    }

    if (nextUrl.startsWith('about:blank')) {
      return true;
    }

    if (nextUrl.startsWith('blob:')) {
      return false;
    }

    if (nextUrl.startsWith('tel:') || nextUrl.startsWith('mailto:') || nextUrl.startsWith('tg:')) {
      void Linking.openURL(nextUrl);
      return false;
    }

    if (nextUrl.includes('t.me/')) {
      void Linking.openURL(nextUrl);
      return false;
    }

    if (request.isTopFrame && (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) && !isAppHost(nextUrl)) {
      appendDebugLog('native', 'webview.external_link_opened', {
        url: nextUrl,
      });
      void Linking.openURL(nextUrl);
      return false;
    }

    let pathname = '';
    try {
      pathname = new URL(nextUrl, APP_BASE_URL).pathname;
    } catch {
      pathname = '';
    }

    if (pathname === '/traineronline/auth') {
      const shouldLogout = markAuthRedirectAndCheckLogout();
      if (!shouldLogout) {
        recoverFromAuthRedirect(nextUrl);
      }
      return false;
    }

    return true;
  };

  const handleDownloadError = (source: DownloadSource, error: unknown): void => {
    if (isDownloadCancelledError(error)) {
      appendDebugLog('native', 'download.cancelled', {
        source,
        path,
      });
      reportEvent('webview_download_cancelled', {
        source,
        path,
      });
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error ?? 'download_failed');
    appendDebugLog('native', 'download.failed', {
      source,
      path,
      errorMessage,
    });
    reportEvent('webview_download_failed', {
      source,
      path,
      error_message: errorMessage,
    });

    Alert.alert('Не удалось загрузить файл', 'Попробуйте ещё раз или откройте файл в браузере.');
  };

  const runDownload = async (
    source: DownloadSource,
    action: () => Promise<{ filename: string; mimeType: string }>
  ): Promise<void> => {
    if (isDownloading) {
      Alert.alert('Загрузка уже идёт', 'Дождитесь завершения текущей загрузки.');
      return;
    }

    setIsDownloading(true);
    appendDebugLog('native', 'download.started', {
      source,
      path,
    });
    reportEvent('webview_download_started', {
      source,
      path,
    });

    try {
      Alert.alert(
        'Загрузка файла',
        Platform.OS === 'android'
          ? 'Откроется системное окно сохранения файла.'
          : 'Подготавливаем файл для открытия.'
      );
      const result = await action();
      appendDebugLog('native', 'download.succeeded', {
        source,
        path,
        filename: result.filename,
        mimeType: result.mimeType,
      });
      reportEvent('webview_download_succeeded', {
        source,
        path,
        filename: result.filename,
        mime_type: result.mimeType,
      });
      Alert.alert(
        'Готово',
        Platform.OS === 'android'
          ? `Файл "${result.filename}" сохранен.`
          : `Файл "${result.filename}" готов к открытию.`
      );
    } catch (error) {
      handleDownloadError(source, error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBlobDownloadMessage = async (payload: DownloadBridgeBlobMessage): Promise<void> => {
    await runDownload('blob_bridge', async () => {
      return await downloadFromBase64({
        base64: payload.base64,
        filename: payload.filename,
        mimeType: payload.mimeType,
      });
    });
  };

  const handleUrlDownloadMessage = async (payload: DownloadBridgeUrlMessage): Promise<void> => {
    await runDownload('url_bridge', async () => {
      const absoluteUrl = resolveDownloadUrl(payload.url);
      return await downloadFromUrl({
        url: absoluteUrl,
        filename: payload.filename,
        headers: getDownloadHeaders(absoluteUrl),
      });
    });
  };

  const handleNativeFileDownload = async (event: FileDownloadEvent): Promise<void> => {
    const downloadUrl = event.nativeEvent.downloadUrl;
    if (!downloadUrl) {
      return;
    }

    await runDownload('native_download', async () => {
      const absoluteUrl = resolveDownloadUrl(downloadUrl);
      return await downloadFromUrl({
        url: absoluteUrl,
        headers: getDownloadHeaders(absoluteUrl),
      });
    });
  };

  const handleNavigationStateChange = (state: WebViewNavigation): void => {
    const nextUrl = state.url;
    appendDebugLog('native', 'webview.navigation_state_change', {
      url: state.url,
      title: state.title,
      loading: state.loading,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
    });
    setCanGoBack(state.canGoBack);

    let pathname = '';
    try {
      pathname = new URL(nextUrl, APP_BASE_URL).pathname;
    } catch {
      pathname = '';
    }

    if (pathname === '/traineronline/auth') {
      const shouldLogout = markAuthRedirectAndCheckLogout();
      if (!shouldLogout) {
        recoverFromAuthRedirect(nextUrl);
      }
      return;
    }

    if (!isAppHost(nextUrl)) {
      return;
    }

    if (!state.loading) {
      clearPendingOfflineFallback('navigation_state_change', {
        url: nextUrl,
      });
    }

    isLoggingOutRef.current = false;
    authRedirectCountRef.current = 0;
    authRedirectWindowStartRef.current = 0;

    const navigablePath = extractNavigablePath(nextUrl);
    if (navigablePath && navigablePath !== path) {
      setPath(navigablePath);
    }
  };

  const handleLoadStart = (): void => {
    clearPendingOfflineFallback('load_start', {
      sourcePath,
      currentUrl,
    });
    appendDebugLog('native', 'webview.load_start', {
      sourcePath,
      currentUrl,
    });
    //if (loaderTimerRef.current) {
    //  clearTimeout(loaderTimerRef.current);
    //}

    //loaderTimerRef.current = setTimeout(() => {
      //setIsLoading(true);
      //loaderTimerRef.current = null;
    //}, 300);
  };

  const handleLoadEnd = (): void => {
    clearPendingOfflineFallback('load_end', {
      sourcePath,
      currentUrl,
    });
    appendDebugLog('native', 'webview.load_end', {
      sourcePath,
      currentUrl,
    });
    //if (loaderTimerRef.current) {
    //  clearTimeout(loaderTimerRef.current);
    //  loaderTimerRef.current = null;
    //}

    //setIsLoading(false);
  };

  const handleLoadProgress = (event: WebViewProgressEvent): void => {
    if (event.nativeEvent.progress >= 0.95) {
      clearPendingOfflineFallback('load_progress', {
        progress: event.nativeEvent.progress,
        url: event.nativeEvent.url,
      });
      appendDebugLog('native', 'webview.load_progress', {
        progress: event.nativeEvent.progress,
        title: event.nativeEvent.title,
        url: event.nativeEvent.url,
      });
      handleLoadEnd();
    }
  };

  const handleWebViewError = (event: WebViewErrorEvent): void => {
    appendDebugLog('native', 'webview.error', event.nativeEvent);

    const isOfflineLikeError = isLikelyOfflineWebViewError(event.nativeEvent);
    reportEvent('webview_error_detected', {
      path,
      source_path: sourcePath,
      code: event.nativeEvent.code,
      description: event.nativeEvent.description,
      is_offline_like: isOfflineLikeError,
    });

    if (isOfflineLikeError) {
      const failedUrl = event.nativeEvent.url || currentUrl;
      if (isAppHost(failedUrl) || isAppHost(currentUrl)) {
        scheduleOfflineFallback(event.nativeEvent);
        return;
      }

      appendDebugLog('native', 'webview.offline_error_non_app_host', {
        url: failedUrl,
        code: event.nativeEvent.code,
        description: event.nativeEvent.description,
      });
    } else {
      appendDebugLog('native', 'webview.error_ignored', {
        code: event.nativeEvent.code,
        description: event.nativeEvent.description,
      });
    }
  };

  const handleWebViewHttpError = (event: WebViewHttpErrorEvent): void => {
    appendDebugLog('native', 'webview.http_error', event.nativeEvent);
  };

  const handleRenderProcessGone = (event: WebViewRenderProcessGoneEvent): void => {
    appendDebugLog('native', 'webview.render_process_gone', event.nativeEvent);
  };

  const handleMessage = (event: WebViewMessageEvent): void => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as IncomingWebViewMessage;
      appendDebugLog('native', 'webview.message', payload);

      if (payload.type === 'bridge.ready') {
        isBridgeReadyRef.current = true;
        clearPendingOfflineFallback('bridge_ready', payload);
        setIsOfflineScreenVisible(false);
        appendDebugLog('native', 'bridge.ready', payload);
        if (nativeNetworkStateRef.current) {
          syncNativeNetworkStateToWeb(nativeNetworkStateRef.current, 'bridge_ready');
        }
        return;
      }

      if (payload.type === 'route.changed' && 'path' in payload && typeof payload.path === 'string') {
        const nextPath = normalizePath(payload.path);
        isBridgeReadyRef.current = true;
        clearPendingOfflineFallback('route_changed', {
          currentPath: path,
          nextPath,
        });
        appendDebugLog('native', 'bridge.route_changed', {
          currentPath: path,
          nextPath,
        });
        if (nextPath.startsWith('/traineronline/') && nextPath !== path) {
          setPath(nextPath);
        }
        return;
      }

      if (payload.type === 'offline.status') {
        const nextOfflineState: OfflineBridgeState = {
          isOffline: payload.isOffline === true,
          supportedPaths: Array.isArray(payload.supportedPaths)
            ? payload.supportedPaths
                .filter((supportedPath): supportedPath is string => typeof supportedPath === 'string')
                 .map((supportedPath) => normalizePath(supportedPath))
                 .filter((supportedPath) => supportedPath.startsWith('/traineronline/'))
            : [],
          availablePaths: Array.isArray(payload.availablePaths)
            ? payload.availablePaths
                .filter((availablePath): availablePath is string => typeof availablePath === 'string')
                .map((availablePath) => normalizePath(availablePath))
                .filter((availablePath) => availablePath.startsWith('/traineronline/'))
            : null,
          isWarmupReady: payload.isWarmupReady === true,
        };
        setOfflineBridgeState(nextOfflineState);
        appendDebugLog('native', 'bridge.offline_status', nextOfflineState);
        return;
      }

      if (payload.type === 'debug.log') {
        appendDebugLog('web', payload.scope ?? 'debug.log', {
          message: payload.message,
          data: payload.data,
        });

        if (
          payload.scope === 'bridge' &&
          payload.message === 'app_shell.detected' &&
          payload.data &&
          typeof payload.data === 'object' &&
          !Array.isArray(payload.data)
        ) {
          const diagnostics = payload.data as Record<string, unknown>;
          const serverUserAgent =
            typeof diagnostics.serverUserAgent === 'string' ? diagnostics.serverUserAgent : null;
          const clientUserAgent =
            typeof diagnostics.clientUserAgent === 'string' ? diagnostics.clientUserAgent : null;
          const serverHasExpectedToken =
            serverUserAgent?.includes(WEBVIEW_APP_USER_AGENT_TOKEN) ?? false;
          const clientHasExpectedToken =
            clientUserAgent?.includes(WEBVIEW_APP_USER_AGENT_TOKEN) ?? false;

          appendDebugLog('native', 'webview.user_agent.observed', {
            configuredUserAgent: WEBVIEW_APP_USER_AGENT,
            expectedToken: WEBVIEW_APP_USER_AGENT_TOKEN,
            serverIsAppShell: diagnostics.serverIsAppShell,
            detectedIsAppShell: diagnostics.detectedIsAppShell,
            clientHasReactNativeWebView: diagnostics.clientHasReactNativeWebView,
            clientMatchesAppShellUserAgent: diagnostics.clientMatchesAppShellUserAgent,
            serverUserAgent,
            clientUserAgent,
            serverHasExpectedToken,
            clientHasExpectedToken,
          });

          if (!serverHasExpectedToken || !clientHasExpectedToken) {
            appendDebugLog('native', 'webview.user_agent.token_mismatch', {
              configuredUserAgent: WEBVIEW_APP_USER_AGENT,
              expectedToken: WEBVIEW_APP_USER_AGENT_TOKEN,
              serverUserAgent,
              clientUserAgent,
              serverHasExpectedToken,
              clientHasExpectedToken,
            });
          }
        }
        return;
      }

      if ((payload.type === 'auth.logout' || payload.type === 'tnote-logout') && !isLoggingOutRef.current) {
        appendDebugLog('native', 'bridge.logout', payload);
        isLoggingOutRef.current = true;
        onLogout();
        return;
      }

      if (payload.type === 'tnote-download-blob' && 'base64' in payload) {
        void handleBlobDownloadMessage(payload);
        return;
      }

      if (payload.type === 'tnote-download-url' && 'url' in payload) {
        void handleUrlDownloadMessage(payload);
      }
    } catch (error) {
      appendDebugLog('native', 'webview.message_parse_error', {
        raw: event.nativeEvent.data,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (isOfflineScreenVisible) {
    return (
      <View style={styles.container}>
        <OfflineScreen onRetry={retryCurrentPageLoad} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.webViewContainer}>
        <WebView
          key={webViewInstanceKey}
          ref={webViewRef}
          source={{ uri: currentUrl }}
          userAgent={WEBVIEW_APP_USER_AGENT}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onLoadProgress={handleLoadProgress}
          onError={handleWebViewError}
          onHttpError={handleWebViewHttpError}
          onRenderProcessGone={handleRenderProcessGone}
          onMessage={handleMessage}
          onFileDownload={handleNativeFileDownload}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          injectedJavaScriptBeforeContentLoaded={injectedAuthScript}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          limitsNavigationsToAppBoundDomains={Platform.OS === 'ios'}
          style={styles.webView}
        />
        {isLoading && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color={APP_COLORS.primary} />
          </View>
        )}
        {isDownloading && (
          <View style={styles.downloadOverlay}>
            <ActivityIndicator size="large" color={APP_COLORS.primary} />
            <Text style={styles.downloadText}>Подготавливаем файл...</Text>
          </View>
        )}
        {debugEnabled && isDebugPanelVisible && (
          <View style={styles.debugPanel} pointerEvents="box-none">
            <View style={styles.debugHeader}>
              <View>
                <Text style={styles.debugTitle}>WebView Debug</Text>
                <Text style={styles.debugHeaderText}>path: {path}</Text>
                <Text style={styles.debugHeaderText}>source: {sourcePath}</Text>
              </View>
              <View style={styles.debugActions}>
                <Pressable onPress={() => setDebugLogs([])} hitSlop={8}>
                  <Text style={styles.debugActionText}>Clear</Text>
                </Pressable>
                <Pressable onPress={() => setIsDebugPanelVisible(false)} hitSlop={8}>
                  <Text style={styles.debugActionText}>Hide</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={styles.debugLogList}
              contentContainerStyle={styles.debugLogListContent}
              showsVerticalScrollIndicator={false}>
              {debugLogs.map((entry) => (
                <Text key={entry.id} style={styles.debugLogText}>
                  [{entry.time}] {entry.source}:{entry.event}
                  {entry.details ? ` ${entry.details}` : ''}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
        {debugEnabled && !isDebugPanelVisible && (
          <Pressable style={styles.debugToggle} onPress={() => setIsDebugPanelVisible(true)}>
            <Text style={styles.debugToggleText}>DBG</Text>
          </Pressable>
        )}
      </View>

      {isOfflineModeActive && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineBannerIconWrap}>
            <Ionicons name="cloud-offline-outline" size={22} color={APP_COLORS.textPrimary} />
          </View>
          <Text style={styles.offlineBannerText}>
            {normalizedOfflineBannerText ?? resolvedOfflineBannerText}
          </Text>
        </View>
      )}

      <View style={styles.menuContainer}>
        {NATIVE_MENU_ITEMS.map((item) => {
          const isDisabledOffline =
            isOfflineModeActive && !offlineAvailablePathSet.has(normalizePath(item.path));
          const isActive = !isDisabledOffline && item.key === selectedMenuKey;
          const color = isDisabledOffline
            ? APP_COLORS.muted
            : isActive
              ? APP_COLORS.primary
              : APP_COLORS.textSecondary;

          return (
            <Pressable
              key={item.key}
              onPress={() => navigateToPath(item.path, { useBridge: true })}
              onLongPress={() => {
                if (debugEnabled) {
                  setIsDebugPanelVisible((currentValue) => !currentValue);
                }
              }}
              disabled={isDisabledOffline}
              style={[styles.menuItem, isDisabledOffline && styles.menuItemDisabled]}
              hitSlop={10}>
              <Ionicons
                name={`${item.icon}-outline`}
                color={color}
                size={22}
                style={styles.menuIcon}
              />
              <Text
                style={[
                  styles.menuLabel,
                  isActive && styles.menuLabelActive,
                  isDisabledOffline && styles.menuLabelDisabled,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

    </View>
  );
}

export const AppShell = memo(AppShellComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.background,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: APP_COLORS.background,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    paddingHorizontal: 24,
  },
  downloadText: {
    color: APP_COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  debugPanel: {
    position: 'absolute',
    top: 16,
    right: 12,
    left: 12,
    maxHeight: '52%',
    borderRadius: 14,
    backgroundColor: 'rgba(17, 19, 29, 0.88)',
    padding: 12,
    gap: 10,
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  debugTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  debugHeaderText: {
    color: 'rgba(255, 255, 255, 0.84)',
    fontSize: 11,
    lineHeight: 15,
  },
  debugActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  debugActionText: {
    color: '#7ED7C1',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  debugLogList: {
    maxHeight: 280,
  },
  debugLogListContent: {
    gap: 6,
  },
  debugLogText: {
    color: '#E7ECFF',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  debugToggle: {
    position: 'absolute',
    right: 12,
    top: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 19, 29, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  debugToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: APP_COLORS.border,
    backgroundColor: '#FFF4E8',
  },
  offlineBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(51, 48, 88, 0.08)',
    flexShrink: 0,
  },
  offlineBannerText: {
    flex: 1,
    color: APP_COLORS.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  menuContainer: {
    height: 72,
    borderTopWidth: 1,
    borderTopColor: APP_COLORS.border,
    backgroundColor: APP_COLORS.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  menuItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuItemDisabled: {
    opacity: 0.55,
  },
  menuIcon: {
    marginBottom: 1,
  },
  menuLabel: {
    color: APP_COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  menuLabelActive: {
    color: APP_COLORS.primary,
  },
  menuLabelDisabled: {
    color: APP_COLORS.muted,
  },
});
