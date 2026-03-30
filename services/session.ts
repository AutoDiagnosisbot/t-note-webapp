import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_VARIANT } from '@/constants/app-config';

const SESSION_STORAGE_KEY = `tnote-mobile-session-${APP_VARIANT}-v2`;
const LEGACY_SESSION_STORAGE_KEY = 'tnote-mobile-session-v1';
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
  await AsyncStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_STORAGE_KEY, LEGACY_SESSION_STORAGE_KEY]);
}

export function buildWebViewAuthInjection(accessToken: string): string {
  return `
    (function () {
      try {
        var LOGOUT_EVENT_TYPE = 'tnote-logout';
        var DOWNLOAD_BLOB_EVENT_TYPE = 'tnote-download-blob';
        var DOWNLOAD_URL_EVENT_TYPE = 'tnote-download-url';
        var AUTH_STORAGE_KEY = ${JSON.stringify(WEBVIEW_AUTH_STORAGE_KEY)};
        var TRACKED_BLOB_URL_TTL_MS = 30000;
        var trackedBlobUrls = new Map();
        var trackedFetchBlobMetadata = typeof WeakMap === 'function' ? new WeakMap() : null;

        function canPostMessage() {
          return !!(
            window.ReactNativeWebView &&
            typeof window.ReactNativeWebView.postMessage === 'function'
          );
        }

        function notifyLogout() {
          if (canPostMessage()) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: LOGOUT_EVENT_TYPE
              })
            );
          }
        }

        function postDownloadMessage(payload) {
          if (!canPostMessage()) {
            return false;
          }

          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          return true;
        }

        function postDebugLog(message, data) {
          if (!message) {
            return false;
          }

          return postDownloadMessage({
            type: 'debug.log',
            scope: 'download.bridge',
            message: message,
            data: data
          });
        }

        async function blobToBase64(blob) {
          return await new Promise(function (resolve, reject) {
            var reader = new FileReader();

            reader.onloadend = function () {
              var result = typeof reader.result === 'string' ? reader.result : '';
              var markerIndex = result.indexOf(',');
              resolve(markerIndex === -1 ? result : result.slice(markerIndex + 1));
            };

            reader.onerror = function () {
              reject(reader.error || new Error('blob_read_failed'));
            };

            reader.readAsDataURL(blob);
          });
        }

        async function postBlobDownload(blob, filename, mimeType) {
          var base64 = await blobToBase64(blob);

          return postDownloadMessage({
            type: DOWNLOAD_BLOB_EVENT_TYPE,
            filename: filename || '',
            mimeType: mimeType || blob.type || '',
            base64: base64
          });
        }

        async function postUrlDownload(url, filename) {
          return postDownloadMessage({
            type: DOWNLOAD_URL_EVENT_TYPE,
            url: url,
            filename: filename || ''
          });
        }

        function normalizeAbsoluteUrl(url) {
          if (!url || typeof url !== 'string') {
            return '';
          }

          try {
            return new URL(url, window.location.href).href;
          } catch {
            return url;
          }
        }

        function getRequestUrl(input) {
          if (typeof input === 'string') {
            return normalizeAbsoluteUrl(input);
          }

          if (input && typeof input.url === 'string') {
            return normalizeAbsoluteUrl(input.url);
          }

          return '';
        }

        function getRequestMethod(input, init) {
          if (init && typeof init.method === 'string' && init.method) {
            return init.method.toUpperCase();
          }

          if (input && typeof input.method === 'string' && input.method) {
            return input.method.toUpperCase();
          }

          return 'GET';
        }

        function getHeaderValue(headers, headerName) {
          if (!headers || typeof headers.get !== 'function' || !headerName) {
            return '';
          }

          return headers.get(headerName) || '';
        }

        function rememberFetchBlobMetadata(blob, metadata) {
          if (!trackedFetchBlobMetadata || !isBlobLike(blob) || !metadata) {
            return;
          }

          trackedFetchBlobMetadata.set(blob, metadata);
        }

        function getFetchBlobMetadata(blob) {
          if (!trackedFetchBlobMetadata || !isBlobLike(blob)) {
            return null;
          }

          return trackedFetchBlobMetadata.get(blob) || null;
        }

        function isBlobLike(value) {
          return typeof Blob !== 'undefined' && value instanceof Blob;
        }

        function clearTrackedBlobCleanup(entry) {
          if (entry && entry.cleanupTimer) {
            clearTimeout(entry.cleanupTimer);
            entry.cleanupTimer = null;
          }
        }

        function deleteTrackedBlobUrl(url) {
          var entry = trackedBlobUrls.get(url);
          if (!entry) {
            return;
          }

          clearTrackedBlobCleanup(entry);
          trackedBlobUrls.delete(url);
        }

        function scheduleTrackedBlobUrlCleanup(url, delayMs) {
          var entry = trackedBlobUrls.get(url);
          if (!entry) {
            return;
          }

          clearTrackedBlobCleanup(entry);
          entry.cleanupTimer = setTimeout(function () {
            deleteTrackedBlobUrl(url);
          }, delayMs);
        }

        function trackBlobUrl(url, blob) {
          if (!url || !isBlobLike(blob)) {
            return;
          }

          var blobMetadata = getFetchBlobMetadata(blob);
          var sourceUrl =
            blobMetadata &&
            blobMetadata.method === 'GET' &&
            /^https?:/i.test(blobMetadata.responseUrl || blobMetadata.requestUrl || '')
              ? blobMetadata.responseUrl || blobMetadata.requestUrl || ''
              : '';

          trackedBlobUrls.set(url, {
            blob: blob,
            revoked: false,
            cleanupTimer: null,
            sourceUrl: sourceUrl,
            sourceMethod: blobMetadata && blobMetadata.method ? blobMetadata.method : '',
            contentDisposition:
              blobMetadata && blobMetadata.contentDisposition ? blobMetadata.contentDisposition : ''
          });
          scheduleTrackedBlobUrlCleanup(url, TRACKED_BLOB_URL_TTL_MS);
          postDebugLog('blob_tracked', {
            url: url,
            mimeType: blob.type || '',
            size: typeof blob.size === 'number' ? blob.size : null,
            sourceUrl: sourceUrl,
            sourceMethod: blobMetadata && blobMetadata.method ? blobMetadata.method : ''
          });
        }

        async function forwardBlobUrlDownload(url, filename) {
          if (!url || url.indexOf('blob:') !== 0 || !canPostMessage()) {
            return false;
          }

          var trackedEntry = trackedBlobUrls.get(url);
          if (trackedEntry && trackedEntry.blob) {
            if (trackedEntry.sourceUrl) {
              await postUrlDownload(trackedEntry.sourceUrl, filename);
              postDebugLog('blob_bridge_sent', {
                mode: 'tracked_url',
                url: url,
                sourceUrl: trackedEntry.sourceUrl,
                filename: filename || '',
                mimeType: trackedEntry.blob.type || '',
                size: typeof trackedEntry.blob.size === 'number' ? trackedEntry.blob.size : null,
                revoked: Boolean(trackedEntry.revoked)
              });
              deleteTrackedBlobUrl(url);
              return true;
            }

            await postBlobDownload(trackedEntry.blob, filename, trackedEntry.blob.type);
            postDebugLog('blob_bridge_sent', {
              mode: 'tracked_blob',
              url: url,
              filename: filename || '',
              mimeType: trackedEntry.blob.type || '',
              size: typeof trackedEntry.blob.size === 'number' ? trackedEntry.blob.size : null,
              revoked: Boolean(trackedEntry.revoked)
            });
            deleteTrackedBlobUrl(url);
            return true;
          }

          postDebugLog('blob_bridge_miss', {
            url: url,
            filename: filename || ''
          });
          postDebugLog('blob_bridge_fallback_fetch', {
            url: url,
            filename: filename || ''
          });

          try {
            var response = await fetch(url);
            var blob = await response.blob();
            await postBlobDownload(blob, filename, blob.type);
            postDebugLog('blob_bridge_sent', {
              mode: 'fetch',
              url: url,
              filename: filename || '',
              mimeType: blob.type || '',
              size: typeof blob.size === 'number' ? blob.size : null
            });
            return true;
          } catch (error) {
            postDebugLog('blob_bridge_miss', {
              url: url,
              filename: filename || '',
              error: error && error.message ? error.message : String(error || 'blob_forward_failed')
            });
            return false;
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

        if (!window.__tnoteDownloadBridge) {
          window.__tnoteDownloadBridge = {
            async downloadBlob(blob, filename, mimeType) {
              if (!blob) {
                return false;
              }

              if (!canPostMessage()) {
                return false;
              }

              await postBlobDownload(blob, filename, mimeType);
              return true;
            },
            async downloadUrl(url, filename) {
              if (!url || !canPostMessage()) {
                return false;
              }

              await postUrlDownload(url, filename);
              return true;
            },
            async download(urlOrBlob, filename, mimeType) {
              if (!urlOrBlob) {
                return false;
              }

              if (typeof urlOrBlob === 'string') {
                if (urlOrBlob.indexOf('blob:') === 0) {
                  return await forwardBlobUrlDownload(urlOrBlob, filename);
                }

                return await this.downloadUrl(urlOrBlob, filename);
              }

              return await this.downloadBlob(urlOrBlob, filename, mimeType);
            }
          };
        }

        if (!window.__tnoteShellBridgeInitialized) {
          window.__tnoteShellBridgeInitialized = true;

          var originalFetch =
            typeof window.fetch === 'function'
              ? window.fetch.bind(window)
              : null;
          var originalCreateObjectURL =
            window.URL && typeof window.URL.createObjectURL === 'function'
              ? window.URL.createObjectURL.bind(window.URL)
              : null;
          var originalRevokeObjectURL =
            window.URL && typeof window.URL.revokeObjectURL === 'function'
              ? window.URL.revokeObjectURL.bind(window.URL)
              : null;

          if (originalCreateObjectURL) {
            window.URL.createObjectURL = function (object) {
              var objectUrl = originalCreateObjectURL(object);
              if (isBlobLike(object)) {
                trackBlobUrl(objectUrl, object);
              }

              return objectUrl;
            };
          }

          if (originalRevokeObjectURL) {
            window.URL.revokeObjectURL = function (url) {
              var trackedEntry = trackedBlobUrls.get(url);
              if (trackedEntry) {
                trackedEntry.revoked = true;
                scheduleTrackedBlobUrlCleanup(url, TRACKED_BLOB_URL_TTL_MS);
              }

              return originalRevokeObjectURL(url);
            };
          }

          if (originalFetch) {
            window.fetch = function (input, init) {
              var requestUrl = getRequestUrl(input);
              var requestMethod = getRequestMethod(input, init);

              return originalFetch(input, init).then(function (response) {
                if (!response || typeof response.blob !== 'function' || response.__tnoteBlobWrapped) {
                  return response;
                }

                var originalResponseBlob = response.blob.bind(response);
                response.blob = function () {
                  return originalResponseBlob().then(function (blob) {
                    rememberFetchBlobMetadata(blob, {
                      requestUrl: requestUrl,
                      responseUrl: normalizeAbsoluteUrl(response.url || requestUrl),
                      method: requestMethod,
                      mimeType:
                        getHeaderValue(response.headers, 'content-type') || blob.type || '',
                      contentDisposition:
                        getHeaderValue(response.headers, 'content-disposition') || ''
                    });
                    return blob;
                  });
                };

                try {
                  Object.defineProperty(response, '__tnoteBlobWrapped', {
                    value: true,
                    configurable: true
                  });
                } catch {}

                return response;
              });
            };
          }

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

          var originalAnchorClick = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function () {
            var href = this.href || this.getAttribute('href') || '';
            var downloadName = this.getAttribute('download') || '';

            if (href.indexOf('blob:') === 0 && canPostMessage()) {
              forwardBlobUrlDownload(href, downloadName).catch(function () {});
              return;
            }

            if (downloadName && /^https?:/i.test(href) && canPostMessage()) {
              postUrlDownload(href, downloadName).catch(function () {});
              return;
            }

            return originalAnchorClick.apply(this, arguments);
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
              var actionName =
                (actionElement.getAttribute('name') || '').trim().toLowerCase() ||
                (actionElement.getAttribute('data-testid') || '').trim().toLowerCase();
              // Do not infer logout from visible button text like "выйти":
              // regular UI actions may legitimately use that wording without ending the session.
              var shouldLogout =
                href.indexOf('/traineronline/auth') !== -1 ||
                actionName.indexOf('logout') !== -1;

              if (!shouldLogout) {
                var hrefLower = href.toLowerCase();
                var downloadAttr = actionElement.getAttribute('download');
                var shouldInterceptDownload =
                  !!downloadAttr || hrefLower.indexOf('blob:') === 0;

                if (shouldInterceptDownload && canPostMessage()) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                  }

                  if (hrefLower.indexOf('blob:') === 0) {
                    forwardBlobUrlDownload(href, downloadAttr || '').catch(function () {});
                    return;
                  }

                  if (/^https?:/i.test(hrefLower)) {
                    postUrlDownload(href, downloadAttr || '').catch(function () {});
                    return;
                  }
                }

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
