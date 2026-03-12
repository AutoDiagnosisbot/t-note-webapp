import { memo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { APP_COLORS } from '@/constants/app-config';

type RegisterValues = {
  firstName: string;
  lastName: string;
  email: string;
};

type RegisterStepProps = {
  values: RegisterValues;
  isSubmitting: boolean;
  errorMessage: string | null;
  onValuesChange: (nextValues: RegisterValues) => void;
  onSubmit: () => void;
  onBack: () => void;
  canSubmit: boolean;
};

function RegisterStepComponent({
  values,
  isSubmitting,
  errorMessage,
  onValuesChange,
  onSubmit,
  onBack,
  canSubmit,
}: RegisterStepProps) {
  return (
    <View style={styles.container}>
      {!!errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Text style={styles.title}>Авторизация</Text>
      <Text style={styles.subtitle}>
        Пожалуйста, заполните дополнительные данные для завершения регистрации
      </Text>

      <TextInput
        value={values.firstName}
        onChangeText={(firstName) => onValuesChange({ ...values, firstName })}
        style={styles.input}
        placeholder="Имя *"
        placeholderTextColor={APP_COLORS.textSecondary}
      />
      <TextInput
        value={values.lastName}
        onChangeText={(lastName) => onValuesChange({ ...values, lastName })}
        style={styles.input}
        placeholder="Фамилия *"
        placeholderTextColor={APP_COLORS.textSecondary}
      />
      <TextInput
        value={values.email}
        onChangeText={(email) => onValuesChange({ ...values, email })}
        style={styles.input}
        placeholder="Email *"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={APP_COLORS.textSecondary}
      />

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit || isSubmitting}>
        <Text style={styles.buttonText}>
          {isSubmitting ? 'Сохранение...' : 'Завершить регистрацию'}
        </Text>
      </Pressable>

      <Pressable onPress={onBack}>
        <Text style={styles.backText}>Назад к вводу кода</Text>
      </Pressable>
    </View>
  );
}

export const RegisterStep = memo(RegisterStepComponent);

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
    marginBottom: 12,
  },
  subtitle: {
    color: APP_COLORS.textSecondary,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: 20,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: APP_COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 24,
    lineHeight: 30,
    color: APP_COLORS.textPrimary,
    marginBottom: 12,
  },
  button: {
    height: 56,
    borderRadius: 16,
    backgroundColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    backgroundColor: APP_COLORS.muted,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  backText: {
    marginTop: 16,
    color: APP_COLORS.textSecondary,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
});

