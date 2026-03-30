import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type DownloadSource = 'blob_bridge' | 'native_download' | 'url_bridge';

export type DownloadFromBase64Input = {
  base64: string;
  filename?: string;
  mimeType?: string;
};

export type DownloadFromUrlInput = {
  url: string;
  filename?: string;
  mimeType?: string;
  headers?: Record<string, string>;
};

export type DownloadResult = {
  fileUri: string;
  filename: string;
  mimeType: string;
};

const DOWNLOADS_DIRECTORY_URI_KEY = 'tnote-downloads-directory-uri-v1';
const DEFAULT_MIME_TYPE = 'application/octet-stream';
const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/json': 'json',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'application/rtf': 'rtf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

function normalizeAndroidSafDirectoryUri(directoryUri: string): string {
  if (!directoryUri || directoryUri.includes('/document/')) {
    return directoryUri;
  }

  const treeUriMatch = /^(content:\/\/[^/]+\/tree\/([^/?#]+))$/.exec(directoryUri);
  if (!treeUriMatch) {
    return directoryUri;
  }

  const [, baseUri, documentId] = treeUriMatch;
  return `${baseUri}/document/${documentId}`;
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().replace(/^["']+|["']+$/g, '');
  const sanitized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim();
  return sanitized || `download-${Date.now()}`;
}

function getFilenameExtension(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match?.[1]?.toLowerCase() ?? null;
}

function getExtensionFromMimeType(mimeType?: string): string | null {
  if (!mimeType) {
    return null;
  }

  const normalized = mimeType.split(';', 1)[0]?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return MIME_EXTENSION_MAP[normalized] ?? null;
}

function decodeContentDispositionFilename(headerValue?: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return plainMatch?.[1] ?? null;
}

function getFilenameFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  } catch {
    return null;
  }
}

function resolveMimeType(mimeType?: string): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || DEFAULT_MIME_TYPE;
}

function resolveFilename(filename?: string, mimeType?: string, fallbackUrl?: string): string {
  const baseName = sanitizeFilename(filename || getFilenameFromUrl(fallbackUrl ?? '') || `download-${Date.now()}`);

  if (getFilenameExtension(baseName)) {
    return baseName;
  }

  const extension = getExtensionFromMimeType(mimeType);
  return extension ? `${baseName}.${extension}` : baseName;
}

function getTargetFileUri(filename: string): string {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error('File system directory is unavailable');
  }

  return `${baseDirectory}${Date.now()}-${sanitizeFilename(filename)}`;
}

async function getPersistedDownloadsDirectoryUri(): Promise<string | null> {
  try {
    const persistedUri = await AsyncStorage.getItem(DOWNLOADS_DIRECTORY_URI_KEY);
    return persistedUri ? normalizeAndroidSafDirectoryUri(persistedUri) : null;
  } catch {
    return null;
  }
}

async function setPersistedDownloadsDirectoryUri(directoryUri: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DOWNLOADS_DIRECTORY_URI_KEY,
      normalizeAndroidSafDirectoryUri(directoryUri)
    );
  } catch {
    // Ignore persistence errors and continue with the current session permission.
  }
}

async function clearPersistedDownloadsDirectoryUri(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DOWNLOADS_DIRECTORY_URI_KEY);
  } catch {
    // Ignore persistence errors and continue with a fresh permission request.
  }
}

function splitFilename(filename: string): { name: string; extension: string | null } {
  const match = /^(.*?)(?:\.([^.]+))?$/.exec(filename);
  const name = match?.[1]?.trim() || filename;
  const extension = match?.[2]?.trim() || null;
  return {
    name,
    extension,
  };
}

async function ensureAndroidDownloadsDirectoryUri(): Promise<string> {
  const persistedUri = await getPersistedDownloadsDirectoryUri();
  if (persistedUri) {
    return persistedUri;
  }

  const initialDownloadsUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialDownloadsUri);

  if (!permission.granted || !permission.directoryUri) {
    throw new Error('downloads_directory_access_denied');
  }

  const normalizedDirectoryUri = normalizeAndroidSafDirectoryUri(permission.directoryUri);
  await setPersistedDownloadsDirectoryUri(normalizedDirectoryUri);
  return normalizedDirectoryUri;
}

function buildIndexedFilename(filename: string, index: number): string {
  if (index <= 0) {
    return filename;
  }

  const { name, extension } = splitFilename(filename);
  const suffix = ` (${index + 1})`;
  return extension ? `${name}${suffix}.${extension}` : `${name}${suffix}`;
}

async function createAndroidDownloadFile(directoryUri: string, filename: string, mimeType: string): Promise<string> {
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex < 10; attemptIndex += 1) {
    const candidateFilename = buildIndexedFilename(filename, attemptIndex);

    try {
      return await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, candidateFilename, mimeType);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('android_download_file_create_failed');
}

async function saveBase64ToAndroidDownloads(
  base64: string,
  filename: string,
  mimeType: string
): Promise<DownloadResult> {
  const resolvedFilename = sanitizeFilename(filename);
  const persistedDirectoryUri = await getPersistedDownloadsDirectoryUri();
  const directoryCandidates = persistedDirectoryUri
    ? [persistedDirectoryUri]
    : [await ensureAndroidDownloadsDirectoryUri()];
  let lastError: unknown;
  let requestedFreshDirectory = false;

  for (let candidateIndex = 0; candidateIndex < directoryCandidates.length; candidateIndex += 1) {
    const directoryUri = directoryCandidates[candidateIndex];

    try {
      const createdFileUri = await createAndroidDownloadFile(directoryUri, resolvedFilename, mimeType);

      await FileSystem.StorageAccessFramework.writeAsStringAsync(createdFileUri, base64, {
        encoding: EncodingType.Base64,
      });

      return {
        fileUri: createdFileUri,
        filename: resolvedFilename,
        mimeType,
      };
    } catch (error) {
      lastError = error;

      if (
        persistedDirectoryUri &&
        directoryUri === persistedDirectoryUri &&
        !requestedFreshDirectory
      ) {
        requestedFreshDirectory = true;
        await clearPersistedDownloadsDirectoryUri();
        directoryCandidates.push(await ensureAndroidDownloadsDirectoryUri());
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('android_download_write_failed');
}

async function shareFileAsync(fileUri: string, mimeType: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is unavailable on this device');
  }

  await Sharing.shareAsync(fileUri, {
    dialogTitle: 'Открыть или отправить файл',
    mimeType,
    UTI: mimeType,
  });
}

export async function downloadFromBase64(input: DownloadFromBase64Input): Promise<DownloadResult> {
  const mimeType = resolveMimeType(input.mimeType);
  const filename = resolveFilename(input.filename, mimeType);
  if (Platform.OS === 'android') {
    return await saveBase64ToAndroidDownloads(input.base64, filename, mimeType);
  }

  const fileUri = getTargetFileUri(filename);

  await FileSystem.writeAsStringAsync(fileUri, input.base64, {
    encoding: EncodingType.Base64,
  });

  await shareFileAsync(fileUri, mimeType);

  return {
    fileUri,
    filename,
    mimeType,
  };
}

export async function downloadFromUrl(input: DownloadFromUrlInput): Promise<DownloadResult> {
  const provisionalFilename = resolveFilename(input.filename, input.mimeType, input.url);
  const targetUri = getTargetFileUri(provisionalFilename);
  const response = await FileSystem.downloadAsync(input.url, targetUri, {
    headers: input.headers,
  });

  const info = await FileSystem.getInfoAsync(response.uri);
  if (!info.exists) {
    throw new Error('Downloaded file was not found');
  }

  const contentDispositionHeader =
    response.headers?.['Content-Disposition'] ?? response.headers?.['content-disposition'] ?? null;
  const responseContentType = response.headers?.['Content-Type'] ?? response.headers?.['content-type'] ?? input.mimeType;
  const finalMimeType = resolveMimeType(responseContentType);
  const finalFilename = resolveFilename(
    decodeContentDispositionFilename(contentDispositionHeader) || input.filename || provisionalFilename,
    finalMimeType,
    input.url
  );

  const finalUri = finalFilename === provisionalFilename ? response.uri : getTargetFileUri(finalFilename);
  if (finalUri !== response.uri) {
    await FileSystem.moveAsync({
      from: response.uri,
      to: finalUri,
    });
  }

  if (Platform.OS === 'android') {
    const base64 = await FileSystem.readAsStringAsync(finalUri, {
      encoding: EncodingType.Base64,
    });

    return await saveBase64ToAndroidDownloads(base64, finalFilename, finalMimeType);
  }

  await shareFileAsync(finalUri, finalMimeType);

  return {
    fileUri: finalUri,
    filename: finalFilename,
    mimeType: finalMimeType,
  };
}
