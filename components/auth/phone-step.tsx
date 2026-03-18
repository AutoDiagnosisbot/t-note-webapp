import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TNoteFullLogo } from '@/components/branding/tnote-full-logo';
import { APP_COLORS } from '@/constants/app-config';
import { formatPhoneForInput } from '@/utils/phone';

type PhoneStepProps = {
  phone: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
};

function PhoneStepComponent({
  phone,
  isSubmitting,
  errorMessage,
  onPhoneChange,
  onSubmit,
  canSubmit,
}: PhoneStepProps) {
  const formattedPhone = formatPhoneForInput(phone);
  const localPhone = useMemo(() => {
    if (formattedPhone.startsWith('+7 ')) {
      return formattedPhone.slice(3);
    }

    if (formattedPhone.startsWith('+7')) {
      return formattedPhone.slice(2).trimStart();
    }

    return formattedPhone;
  }, [formattedPhone]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.contentStack}>
          <View style={styles.heroBlock}>
            <TNoteFullLogo width={204} height={78} />

            <Text style={styles.heroDescription}>
              Веди учёт спортсменов, оплат и посещаемости —
              без таблиц, бумажек и переписок в мессенджерах
            </Text>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.title}>Введите номер телефона</Text>

            <View style={styles.inputShell}>
              <View style={styles.flagGroup}>
                <Text style={styles.flagEmoji}>🇷🇺</Text>
                <Ionicons name="chevron-down" size={14} color={APP_COLORS.textPrimary} />
              </View>

              <View style={styles.prefixGroup}>
                <Text style={styles.countryCode}>+7</Text>
                <TextInput
                  value={localPhone}
                  onChangeText={(value) => onPhoneChange(`+7 ${value}`)}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  style={styles.input}
                  placeholder="000 000-00-00"
                  placeholderTextColor={APP_COLORS.textSecondary}
                  selectionColor={APP_COLORS.primary}
                />
              </View>
            </View>

            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

            <Pressable
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit || isSubmitting}>
              <Text style={styles.buttonText}>{isSubmitting ? 'Отправка...' : 'Получить код'}</Text>
            </Pressable>

            <Text style={styles.caption}>
              Я соглашаюсь с{' '}
              <Text style={styles.captionAccent}>политикой обработки персональных данных</Text>
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export const PhoneStep = memo(PhoneStepComponent);

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
  },
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 24,
  },
  contentStack: {
    flex: 1,
    alignItems: 'center',
    gap: 36,
  },
  heroBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
    paddingTop: 28,
  },
  heroDescription: {
    color: APP_COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  formBlock: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  title: {
    width: '100%',
    color: APP_COLORS.textPrimary,
    fontSize: 24,
    lineHeight: 36,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputShell: {
    width: '100%',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#FBFBFB',
    borderWidth: 2,
    borderColor: '#F6F6F6',
    borderRadius: 16,
  },
  flagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flagEmoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  prefixGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCode: {
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  errorText: {
    width: '100%',
    color: '#C94642',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: -4,
  },
  button: {
    width: '100%',
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonDisabled: {
    backgroundColor: '#F3A8A5',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    maxWidth: 305,
    color: APP_COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  captionAccent: {
    color: APP_COLORS.primary,
  },
});
