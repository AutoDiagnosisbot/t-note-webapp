import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TNoteFullLogo } from '@/components/branding/tnote-full-logo';
import { APP_COLORS } from '@/constants/app-config';

type OfflineScreenProps = {
  onRetry?: () => void;
};

const OFFLINE_MESSAGE =
  '\u041a \u0441\u043e\u0436\u0430\u043b\u0435\u043d\u0438\u044e \u0441\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0442 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f \u0441 \u0441\u0435\u0442\u044c\u044e, \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u043f\u043e\u043f\u044b\u0442\u043a\u0443 \u043f\u043e\u0437\u0436\u0435';
const RETRY_LABEL = '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c';

function OfflineScreenComponent({ onRetry }: OfflineScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <TNoteFullLogo width={192} height={74} />
        </View>
        <Text style={styles.message}>{OFFLINE_MESSAGE}</Text>

        {onRetry ? (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>{RETRY_LABEL}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const OfflineScreen = memo(OfflineScreenComponent);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: APP_COLORS.surface,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: APP_COLORS.background,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: APP_COLORS.border,
  },
  logoWrap: {
    marginBottom: 28,
  },
  message: {
    color: APP_COLORS.textPrimary,
    fontSize: 19,
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: '600',
  },
  retryButton: {
    minWidth: 172,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    backgroundColor: APP_COLORS.primary,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
});
