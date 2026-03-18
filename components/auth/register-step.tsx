import { memo } from 'react';
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
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.contentStack}>
          <View style={styles.heroBlock}>
            <TNoteFullLogo width={204} height={78} />
          </View>

          <View style={styles.formBlock}>
            <View style={styles.headingBlock}>
              <Text style={styles.title}>Завершите регистрацию</Text>
              <Text style={styles.subtitle}>
                Пожалуйста, заполните несколько полей, чтобы завершить вход в аккаунт.
              </Text>
            </View>

            <View style={styles.fieldsBlock}>
              <TextInput
                value={values.firstName}
                onChangeText={(firstName) => onValuesChange({ ...values, firstName })}
                style={styles.input}
                placeholder="Имя *"
                placeholderTextColor={APP_COLORS.textSecondary}
                autoComplete="name-given"
                selectionColor={APP_COLORS.primary}
              />

              <TextInput
                value={values.lastName}
                onChangeText={(lastName) => onValuesChange({ ...values, lastName })}
                style={styles.input}
                placeholder="Фамилия *"
                placeholderTextColor={APP_COLORS.textSecondary}
                autoComplete="name-family"
                selectionColor={APP_COLORS.primary}
              />

              <TextInput
                value={values.email}
                onChangeText={(email) => onValuesChange({ ...values, email })}
                style={styles.input}
                placeholder="Email *"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholderTextColor={APP_COLORS.textSecondary}
                selectionColor={APP_COLORS.primary}
              />
            </View>

            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

            <Pressable
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit || isSubmitting}>
              <Text style={styles.buttonText}>
                {isSubmitting ? 'Сохраняем...' : 'Завершить регистрацию'}
              </Text>
            </Pressable>

            <Pressable onPress={onBack}>
              <Text style={styles.backText}>Вернуться к коду</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export const RegisterStep = memo(RegisterStepComponent);

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
    gap: 32,
  },
  heroBlock: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 28,
  },
  formBlock: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  headingBlock: {
    width: '100%',
    gap: 12,
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
  subtitle: {
    color: APP_COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
  fieldsBlock: {
    width: '100%',
    gap: 12,
  },
  input: {
    width: '100%',
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F6F6F6',
    backgroundColor: '#FBFBFB',
    paddingHorizontal: 18,
    paddingVertical: 10,
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
  backText: {
    color: APP_COLORS.primary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
});
