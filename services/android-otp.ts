import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type OtpEventStatus = 'received' | 'timeout' | 'error';

export type AndroidOtpEvent = {
  status: OtpEventStatus;
  message?: string;
  code?: string;
  error?: string;
};

type NativeOtpModule = {
  startOtpListener(): Promise<void>;
  stopOtpListener(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const EVENT_NAME = 'tnoteOtpReceived';
const nativeOtpModule =
  Platform.OS === 'android' ? (NativeModules.TNoteOtpRetriever as NativeOtpModule | undefined) : undefined;
const otpEventEmitter = nativeOtpModule ? new NativeEventEmitter(nativeOtpModule) : null;

export function isAndroidOtpSupported(): boolean {
  return Platform.OS === 'android' && nativeOtpModule != null;
}

export async function startOtpListener(): Promise<void> {
  if (!nativeOtpModule) {
    return;
  }

  await nativeOtpModule.startOtpListener();
}

export async function stopOtpListener(): Promise<void> {
  if (!nativeOtpModule) {
    return;
  }

  await nativeOtpModule.stopOtpListener();
}

export function subscribeToOtpEvents(listener: (event: AndroidOtpEvent) => void): () => void {
  if (!otpEventEmitter) {
    return () => {};
  }

  const subscription = otpEventEmitter.addListener(EVENT_NAME, listener);
  return () => subscription.remove();
}
