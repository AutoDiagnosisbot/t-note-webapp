import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

type NotificationPathData = {
  path?: string;
};

type UsePushNotificationsParams = {
  onOpenPath?: (path: string) => void;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const permissionState = await Notifications.getPermissionsAsync();
  let status = permissionState.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return null;
  }

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function usePushNotifications({ onOpenPath }: UsePushNotificationsParams = {}): string | null {
  const [token, setToken] = useState<string | null>(null);
  const onOpenPathRef = useRef(onOpenPath);

  onOpenPathRef.current = onOpenPath;

  useEffect(() => {
    let mounted = true;

    registerPushToken()
      .then((value) => {
        if (mounted) {
          setToken(value);
        }
      })
      .catch(() => {
        if (mounted) {
          setToken(null);
        }
      });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationPathData;
      if (data.path && onOpenPathRef.current) {
        onOpenPathRef.current(data.path);
      }
    });

    return () => {
      mounted = false;
      responseListener.remove();
    };
  }, []);

  return token;
}

