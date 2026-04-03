import { NativeModules, Platform } from 'react-native';

type NativeDocumentWriterModule = {
  createDocument(filename: string, mimeType: string, initialUri?: string | null): Promise<string | null>;
  writeBase64ToContentUri(contentUri: string, base64: string): Promise<void>;
  copyFileToContentUri(sourceFileUri: string, contentUri: string): Promise<void>;
};

const nativeDocumentWriter =
  Platform.OS === 'android'
    ? (NativeModules.TNoteDocumentWriter as NativeDocumentWriterModule | undefined)
    : undefined;

function requireAndroidDocumentWriter(): NativeDocumentWriterModule {
  if (!nativeDocumentWriter) {
    throw new Error('android_document_writer_unavailable');
  }

  return nativeDocumentWriter;
}

export function isAndroidDocumentWriterSupported(): boolean {
  return Platform.OS === 'android' && nativeDocumentWriter != null;
}

export async function createDocument(
  filename: string,
  mimeType: string,
  initialUri?: string | null
): Promise<string | null> {
  return await requireAndroidDocumentWriter().createDocument(filename, mimeType, initialUri);
}

export async function writeBase64ToContentUri(contentUri: string, base64: string): Promise<void> {
  await requireAndroidDocumentWriter().writeBase64ToContentUri(contentUri, base64);
}

export async function copyFileToContentUri(sourceFileUri: string, contentUri: string): Promise<void> {
  await requireAndroidDocumentWriter().copyFileToContentUri(sourceFileUri, contentUri);
}
