import { memo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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

  return (
    <View style={styles.container}>
      {!!errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Text style={styles.title}>Введите номер телефона</Text>

      <TextInput
        value={formattedPhone}
        onChangeText={onPhoneChange}
        keyboardType="phone-pad"
        autoComplete="tel"
        style={styles.input}
        placeholder="+7 000 000-00-00"
        placeholderTextColor={APP_COLORS.textSecondary}
      />

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit || isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Отправка...' : 'Получить код'}</Text>
      </Pressable>

      <Text style={styles.caption}>
        Продолжая, вы соглашаетесь с условиями Оферты и даете Согласие на обработку персональных
        данных и на получение рассылок
      </Text>
    </View>
  );
}

export const PhoneStep = memo(PhoneStepComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: APP_COLORS.surface,
    paddingHorizontal: 24,
  },
  errorBanner: {
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: APP_COLORS.errorBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: '#7B3130',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  title: {
    color: APP_COLORS.textPrimary,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '700',
    marginBottom: 24,
  },
  input: {
    height: 60,
    borderWidth: 1.5,
    borderColor: APP_COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    fontSize: 32,
    lineHeight: 38,
    color: APP_COLORS.textPrimary,
    marginBottom: 16,
  },
  button: {
    height: 60,
    borderRadius: 18,
    backgroundColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: APP_COLORS.muted,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  caption: {
    color: APP_COLORS.textSecondary,
    fontSize: 22,
    lineHeight: 30,
  },
});

