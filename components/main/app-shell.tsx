import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';

import { APP_BASE_URL, APP_COLORS, DEFAULT_LK_PATH, NATIVE_MENU_ITEMS } from '@/constants/app-config';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { buildWebViewAuthInjection } from '@/services/session';
import { getMenuKeyForPath, isAppHost, normalizePath, toAbsoluteUrl } from '@/utils/web-routes';

type AppShellProps = {
  accessToken: string;
  initialPath?: string;
  onLogout: () => void;
};

function AppShellComponent({ accessToken, initialPath = DEFAULT_LK_PATH, onLogout }: AppShellProps) {
  const webViewRef = useRef<WebView>(null);
  const isLoggingOutRef = useRef(false);
  const authRedirectCountRef = useRef(0);
  const authRedirectWindowStartRef = useRef(0);
  const [path, setPath] = useState<string>(normalizePath(initialPath));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);

  const injectedAuthScript = useMemo(() => buildWebViewAuthInjection(accessToken), [accessToken]);
  const selectedMenuKey = getMenuKeyForPath(path);
  const currentUrl = toAbsoluteUrl(path);

  const extractStableRoutePath = (url: string): string | null => {
    try {
      const parsedUrl = new URL(url, APP_BASE_URL);
      const { pathname, searchParams } = parsedUrl;

      if (!pathname.startsWith('/traineronline/lk/')) {
        return null;
      }

      if (pathname === '/traineronline/lk/report') {
        const type = searchParams.get('type');
        if (type) {
          return `${pathname}?type=${type}`;
        }
      }

      return pathname;
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
    webViewRef.current?.injectJavaScript(injectedAuthScript);
    const referrerPath = extractReferrerPath(authUrl);
    if (referrerPath && referrerPath !== path) {
      setPath(referrerPath);
    }
  };

  usePushNotifications({
    onOpenPath: (nextPath) => {
      if (nextPath.startsWith('/traineronline/lk/')) {
        setPath(nextPath);
      }
    },
  });

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

  const handleShouldStartLoad = (request: ShouldStartLoadRequest): boolean => {
    const nextUrl = request.url;

    if (!nextUrl) {
      return false;
    }

    if (nextUrl.startsWith('about:blank')) {
      return true;
    }

    if (nextUrl.startsWith('tel:') || nextUrl.startsWith('mailto:') || nextUrl.startsWith('tg:')) {
      void Linking.openURL(nextUrl);
      return false;
    }

    if (nextUrl.includes('t.me/')) {
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

  const handleNavigationStateChange = (state: WebViewNavigation): void => {
    const nextUrl = state.url;
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

    isLoggingOutRef.current = false;
    authRedirectCountRef.current = 0;
    authRedirectWindowStartRef.current = 0;

    const stablePath = extractStableRoutePath(nextUrl);
    if (stablePath && stablePath !== path) {
      setPath(stablePath);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.webViewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            injectedJavaScriptBeforeContentLoaded={injectedAuthScript}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            style={styles.webView}
          />
          {isLoading && (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color={APP_COLORS.primary} />
            </View>
          )}
        </View>

        <View style={styles.menuContainer}>
          {NATIVE_MENU_ITEMS.map((item) => {
            const isActive = item.key === selectedMenuKey;
            const color = isActive ? APP_COLORS.primary : APP_COLORS.textSecondary;

            return (
              <Pressable
                key={item.key}
                onPress={() => setPath(item.path)}
                style={styles.menuItem}
                hitSlop={10}>
                <Ionicons
                  name={`${item.icon}-outline`}
                  color={color}
                  size={22}
                  style={styles.menuIcon}
                />
                <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

export const AppShell = memo(AppShellComponent);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_COLORS.background,
  },
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
});
