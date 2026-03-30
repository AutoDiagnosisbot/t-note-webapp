export const WEBVIEW_BRIDGE_EVENT_NAME = 'tnote-native-bridge-message';
export const WEBVIEW_BRIDGE_VERSION = 1;

export type WebViewBridgeReadyMessage = {
  type: 'bridge.ready';
  version?: number;
  shell?: string;
  capabilities?: string[];
};

export type WebViewRouteChangedMessage = {
  type: 'route.changed';
  path: string;
  title?: string | null;
  version?: number;
};

export type WebViewAuthLogoutMessage = {
  type: 'auth.logout';
  version?: number;
};

export type WebViewDebugLogMessage = {
  type: 'debug.log';
  message: string;
  scope?: string;
  data?: unknown;
  version?: number;
};

export type WebToNativeBridgeMessage =
  | WebViewBridgeReadyMessage
  | WebViewRouteChangedMessage
  | WebViewAuthLogoutMessage
  | WebViewDebugLogMessage;

export type NativeNavigateMessage = {
  type: 'native.navigate';
  path: string;
  replace?: boolean;
};

export type NativeLogoutMessage = {
  type: 'native.logout';
};

export type NativeToWebBridgeMessage = NativeNavigateMessage | NativeLogoutMessage;

export function buildDispatchNativeBridgeMessageScript(message: NativeToWebBridgeMessage): string {
  const serializedMessage = JSON.stringify(message);
  const serializedEventName = JSON.stringify(WEBVIEW_BRIDGE_EVENT_NAME);

  return `
    (function () {
      try {
        var detail = ${serializedMessage};
        var event = null;

        if (typeof CustomEvent === 'function') {
          event = new CustomEvent(${serializedEventName}, { detail: detail });
        } else if (document.createEvent) {
          event = document.createEvent('CustomEvent');
          event.initCustomEvent(${serializedEventName}, false, false, detail);
        }

        if (event && window.dispatchEvent) {
          window.dispatchEvent(event);
        }
      } catch (e) {}
      true;
    })();
  `;
}
