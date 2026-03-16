import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_STORAGE_KEY = 'tnote-mobile-session-v1';
const WEBVIEW_AUTH_STORAGE_KEY = 'auth-traineronline-storage';

export type AppSession = {
  accessToken: string;
  phone: string;
};

export async function loadSession(): Promise<AppSession | null> {
  const rawValue = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as AppSession;
    if (!parsed.accessToken || !parsed.phone) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: AppSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
}

export function buildWebViewAuthInjection(accessToken: string): string {
  return `
    (function () {
      try {
        var LOGOUT_EVENT_TYPE = 'tnote-logout';
        var LOGOUT_TEXT_RU = '\\u0432\\u044b\\u0439\\u0442\\u0438';
        var AUTH_STORAGE_KEY = ${JSON.stringify(WEBVIEW_AUTH_STORAGE_KEY)};

        function notifyLogout() {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: LOGOUT_EVENT_TYPE
              })
            );
          }
        }

        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            state: {
              accessToken: ${JSON.stringify(accessToken)},
              authInfo: null
            },
            version: 0
          })
        );

        document.documentElement.setAttribute('data-shell', 'app');
        if (document.body) {
          document.body.setAttribute('data-shell', 'app');
        } else {
          document.addEventListener(
            'DOMContentLoaded',
            function () {
              if (document.body) {
                document.body.setAttribute('data-shell', 'app');
              }
            },
            { once: true }
          );
        }

        if (!document.getElementById('tn-app-shell-style')) {
          var style = document.createElement('style');
          style.id = 'tn-app-shell-style';
          style.textContent = [
            '.hide-in-app { display: none !important; }',
            '[data-shell="app"] .hide-in-app { display: none !important; }'
          ].join('\\n');
          document.head.appendChild(style);
        }

        if (!window.__tnoteLogoutBridgeInitialized) {
          window.__tnoteLogoutBridgeInitialized = true;

          var originalRemoveItem = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (key) {
            if (this === localStorage && key === AUTH_STORAGE_KEY) {
              notifyLogout();
            }

            return originalRemoveItem.apply(this, arguments);
          };

          var originalClear = Storage.prototype.clear;
          Storage.prototype.clear = function () {
            if (this === localStorage && this.getItem(AUTH_STORAGE_KEY) !== null) {
              notifyLogout();
            }

            return originalClear.apply(this, arguments);
          };

          document.addEventListener(
            'click',
            function (event) {
              var target = event.target;
              if (!target || !target.closest) {
                return;
              }

              var actionElement = target.closest('a, button');
              if (!actionElement) {
                return;
              }

              var href =
                actionElement.getAttribute('href') ||
                actionElement.getAttribute('data-href') ||
                '';
              var text = (actionElement.textContent || '').trim().toLowerCase();
              var ariaLabel = (actionElement.getAttribute('aria-label') || '').trim().toLowerCase();
              var actionName =
                (actionElement.getAttribute('name') || '').trim().toLowerCase() ||
                (actionElement.getAttribute('data-testid') || '').trim().toLowerCase();
              var shouldLogout =
                href.indexOf('/traineronline/auth') !== -1 ||
                text.indexOf(LOGOUT_TEXT_RU) !== -1 ||
                text.indexOf('logout') !== -1 ||
                ariaLabel.indexOf(LOGOUT_TEXT_RU) !== -1 ||
                ariaLabel.indexOf('logout') !== -1 ||
                actionName.indexOf('logout') !== -1;

              if (!shouldLogout) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
              }

              notifyLogout();
            },
            true
          );
        }
      } catch (e) {}
      true;
    })();
  `;
}
