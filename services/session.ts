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
        localStorage.setItem(
          ${JSON.stringify(WEBVIEW_AUTH_STORAGE_KEY)},
          JSON.stringify({
            state: {
              accessToken: ${JSON.stringify(accessToken)},
              authInfo: null
            },
            version: 0
          })
        );
      } catch (e) {}
      true;
    })();
  `;
}
