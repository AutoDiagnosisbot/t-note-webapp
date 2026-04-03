import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  copyFileToContentUri,
  createDocument as createNativeAndroidDocument,
  isAndroidDocumentWriterSupported,
  writeBase64ToContentUri,
} from './android-document-writer';

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

const DEFAULT_MIME_TYPE = 'application/octet-stream';
const ANDROID_CREATE_DOCUMENT_ACTION = 'android.intent.action.CREATE_DOCUMENT';
const ANDROID_OPENABLE_CATEGORY = 'android.intent.category.OPENABLE';
const ANDROID_EXTRA_TITLE = 'android.intent.extra.TITLE';
const ANDROID_EXTRA_INITIAL_URI = 'android.provider.extra.INITIAL_URI';
const ANDROID_DOWNLOAD_CANCELLED_ERROR = 'download_cancelled';
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

function normalizeAndroidDocumentUri(documentUri: string): string {
  if (!documentUri || documentUri.includes('/document/')) {
    return documentUri;
  }

  const treeUriMatch = /^(content:\/\/[^/]+\/tree\/([^/?#]+))$/.exec(documentUri);
  if (!treeUriMatch) {
    return documentUri;
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

function extractAndroidDocumentUri(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith('content://')) {
    return value;
  }

  const match = /(content:\/\/[^\s}]+)/.exec(value);
  return match?.[1] ?? null;
}

export function isDownloadCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === ANDROID_DOWNLOAD_CANCELLED_ERROR;
}

async function createAndroidDocument(filename: string, mimeType: string): Promise<string> {
  const initialDownloadsUri = normalizeAndroidDocumentUri(
    FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download')
  );

  if (isAndroidDocumentWriterSupported()) {
    const documentUri = await createNativeAndroidDocument(filename, mimeType, initialDownloadsUri);
    if (!documentUri) {
      throw new Error(ANDROID_DOWNLOAD_CANCELLED_ERROR);
    }

    return documentUri;
  }

  const result = await IntentLauncher.startActivityAsync(ANDROID_CREATE_DOCUMENT_ACTION, {
    type: mimeType,
    category: ANDROID_OPENABLE_CATEGORY,
    extra: {
      [ANDROID_EXTRA_TITLE]: filename,
      [ANDROID_EXTRA_INITIAL_URI]: initialDownloadsUri,
    },
  });

  if (result.resultCode === IntentLauncher.ResultCode.Canceled) {
    throw new Error(ANDROID_DOWNLOAD_CANCELLED_ERROR);
  }

  const documentUri = extractAndroidDocumentUri(result.data);
  if (!documentUri) {
    throw new Error('android_document_uri_missing');
  }

  return documentUri;
}

async function saveBase64ToAndroidDocument(
  base64: string,
  filename: string,
  mimeType: string
): Promise<DownloadResult> {
  const resolvedFilename = sanitizeFilename(filename);
  const documentUri = await createAndroidDocument(resolvedFilename, mimeType);

  if (isAndroidDocumentWriterSupported()) {
    await writeBase64ToContentUri(documentUri, base64);
  } else {
    await FileSystem.StorageAccessFramework.writeAsStringAsync(documentUri, base64, {
      encoding: EncodingType.Base64,
    });
  }

  return {
    fileUri: documentUri,
    filename: resolvedFilename,
    mimeType,
  };
}

async function copyFileToAndroidDocument(
  sourceFileUri: string,
  filename: string,
  mimeType: string
): Promise<DownloadResult> {
  const resolvedFilename = sanitizeFilename(filename);
  const documentUri = await createAndroidDocument(resolvedFilename, mimeType);

  if (isAndroidDocumentWriterSupported()) {
    await copyFileToContentUri(sourceFileUri, documentUri);
  } else {
    const base64 = await FileSystem.readAsStringAsync(sourceFileUri, {
      encoding: EncodingType.Base64,
    });

    await FileSystem.StorageAccessFramework.writeAsStringAsync(documentUri, base64, {
      encoding: EncodingType.Base64,
    });
  }

  return {
    fileUri: documentUri,
    filename: resolvedFilename,
    mimeType,
  };
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
    return await saveBase64ToAndroidDocument(input.base64, filename, mimeType);
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
    try {
      return await copyFileToAndroidDocument(finalUri, finalFilename, finalMimeType);
    } finally {
      await FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
    }
  }

  await shareFileAsync(finalUri, finalMimeType);

  return {
    fileUri: finalUri,
    filename: finalFilename,
    mimeType: finalMimeType,
  };
}
