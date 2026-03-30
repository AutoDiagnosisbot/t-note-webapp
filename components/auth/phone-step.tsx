import { memo, useMemo, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthFormLayout, useAuthKeyboardScroll } from '@/components/auth/auth-form-layout';
import { TNoteFullLogo } from '@/components/branding/tnote-full-logo';
import { APP_BASE_URL, APP_COLORS } from '@/constants/app-config';
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
  const phoneInputRef = useRef<TextInput>(null);
  const { scrollViewRef, scrollToInput } = useAuthKeyboardScroll();
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

  const openLegalDocument = (documentPath: string): void => {
    void Linking.openURL(new URL(documentPath, APP_BASE_URL).toString());
  };

  return (
    <AuthFormLayout scrollViewRef={scrollViewRef} contentContainerStyle={styles.container}>
      <View style={styles.contentStack}>
        <View style={styles.heroBlock}>
          <TNoteFullLogo width={204} height={78} />

          <Text style={styles.heroDescription}>
            Веди учет спортсменов, оплат и посещаемости без таблиц, бумажек и переписок в
            мессенджерах
          </Text>
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.title}>Введите номер телефона</Text>

          <View style={styles.inputShell}>
            <View style={styles.flagGroup}>
              <Text style={styles.flagEmoji}>🇷🇺</Text>
            </View>

            <View style={styles.prefixGroup}>
              <Text style={styles.countryCode}>+7</Text>
              <TextInput
                ref={phoneInputRef}
                value={localPhone}
                onChangeText={(value) => onPhoneChange(`+7 ${value}`)}
                onFocus={() => scrollToInput(phoneInputRef)}
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
            Продолжая, вы соглашаетесь с условиями{' '}
            <Text
              style={styles.captionAccent}
              onPress={() => openLegalDocument('/doc/OfertaTNote.pdf')}>
              Оферты
            </Text>{' '}
            и даете Согласие{' '}
            <Text
              style={styles.captionAccent}
              onPress={() => openLegalDocument('/doc/SoglasiePDTNote.pdf')}>
              на обработку персональных данных
            </Text>{' '}
            и{' '}
            <Text
              style={styles.captionAccent}
              onPress={() => openLegalDocument('/doc/SoglasieReklamaTNote.pdf')}>
              на получение рассылок
            </Text>
          </Text>
        </View>
      </View>
    </AuthFormLayout>
  );
}

export const PhoneStep = memo(PhoneStepComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 28,
  },
  contentStack: {
    flexGrow: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
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
