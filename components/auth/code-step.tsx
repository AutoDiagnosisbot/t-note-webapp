import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthFormLayout, useAuthKeyboardScroll } from '@/components/auth/auth-form-layout';
import { TNoteFullLogo } from '@/components/branding/tnote-full-logo';
import { APP_COLORS } from '@/constants/app-config';
import { formatPhoneForInput } from '@/utils/phone';

type CodeStepProps = {
  phone: string;
  code: string;
  isSubmitting: boolean;
  isResending: boolean;
  resendInSeconds: number;
  errorMessage: string | null;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
};

function CodeStepComponent({
  phone,
  code,
  isSubmitting,
  isResending,
  resendInSeconds,
  errorMessage,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: CodeStepProps) {
  const inputRef = useRef<TextInput>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { scrollViewRef, scrollToInput } = useAuthKeyboardScroll();
  const formattedPhone = useMemo(() => formatPhoneForInput(phone), [phone]);
  const codeChars = useMemo(() => {
    const normalized = code.slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => normalized[index] ?? '');
  }, [code]);

  const hasError = Boolean(errorMessage);
  const canSubmit = code.length === 6 && !isSubmitting;
  const canResend = resendInSeconds === 0 && !isResending;

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.focus();
      scrollToInput(inputRef);
    });
  }, [scrollToInput]);

  useEffect(() => {
    focusTimerRef.current = setTimeout(() => {
      focusInput();
    }, 150);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, [focusInput]);

  const showSubmitButton = canSubmit && !hasError;
  const showResendButton = canResend && (!showSubmitButton || hasError);
  const showResendCountdown = !showSubmitButton && !showResendButton;

  return (
    <AuthFormLayout scrollViewRef={scrollViewRef} contentContainerStyle={styles.container}>
      <Pressable style={styles.contentPressable} onPress={focusInput}>
        <View style={styles.contentStack}>
          <View style={styles.heroBlock}>
            <TNoteFullLogo width={204} height={78} />
          </View>

          <View style={styles.formBlock}>
            <View style={styles.headingBlock}>
              <Text style={styles.title}>Введите код из СМС</Text>

              <View style={styles.phoneBlock}>
                <Text style={styles.subtitle}>Отправили код на {formattedPhone}</Text>

                <Pressable onPress={onBack}>
                  <Text style={styles.changePhone}>Изменить телефон</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.codeSection}>
              <View style={styles.codeRowWrap}>
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={onCodeChange}
                  onFocus={() => scrollToInput(inputRef)}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  importantForAutofill="yes"
                  maxLength={6}
                  autoFocus
                  blurOnSubmit={false}
                  showSoftInputOnFocus
                  caretHidden
                  selectionColor="transparent"
                  underlineColorAndroid="transparent"
                  onSubmitEditing={onSubmit}
                  style={styles.overlayInput}
                />

                <Pressable style={styles.codeRow} onPress={focusInput}>
                  {codeChars.map((char, index) => {
                    const isFocused = index === code.length && code.length < 6 && !hasError;

                    return (
                      <Pressable
                        key={index}
                        style={[
                          styles.codeCell,
                          hasError && styles.codeCellError,
                          isFocused && styles.codeCellFocused,
                        ]}
                        onPress={focusInput}>
                        <Text style={styles.codeCellText}>{char}</Text>
                      </Pressable>
                    );
                  })}
                </Pressable>
              </View>

              {hasError ? (
                <View style={styles.errorHint}>
                  <Ionicons name="alert-circle" size={20} color="#C62828" />
                  <Text style={styles.errorHintText}>{errorMessage}</Text>
                </View>
              ) : null}

              {showSubmitButton ? (
                <Pressable style={styles.submitButton} onPress={onSubmit} disabled={!canSubmit}>
                  <Text style={styles.submitButtonText}>
                    {isSubmitting ? 'Подтверждаем...' : 'Подтвердить'}
                  </Text>
                </Pressable>
              ) : null}

              {showResendButton ? (
                <Pressable
                  style={[styles.resendButton, isResending && styles.resendButtonDisabled]}
                  onPress={onResend}
                  disabled={!canResend}>
                  <Text
                    style={[styles.resendButtonText, isResending && styles.resendButtonTextDisabled]}>
                    {isResending ? 'Отправка...' : 'Отправить код повторно'}
                  </Text>
                </Pressable>
              ) : null}

              {showResendCountdown ? (
                <View style={styles.countdownBlock}>
                  <Text style={styles.countdownLabel}>Отправить код повторно</Text>
                  <Text style={styles.countdownTimer}>
                    00:{String(resendInSeconds).padStart(2, '0')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </AuthFormLayout>
  );
}

export const CodeStep = memo(CodeStepComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 28,
  },
  contentPressable: {
    flexGrow: 1,
    width: '100%',
  },
  contentStack: {
    flexGrow: 1,
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
    gap: 24,
    alignItems: 'center',
  },
  headingBlock: {
    width: '100%',
    gap: 24,
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
  phoneBlock: {
    width: '100%',
    gap: 2,
  },
  subtitle: {
    color: APP_COLORS.textSecondary,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500',
  },
  changePhone: {
    color: APP_COLORS.primary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  codeSection: {
    width: '100%',
    gap: 24,
    alignItems: 'center',
  },
  overlayInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.02,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
  codeRowWrap: {
    position: 'relative',
    width: '100%',
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeCell: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.surface,
  },
  codeCellFocused: {
    borderColor: APP_COLORS.primary,
  },
  codeCellError: {
    borderWidth: 2,
    borderColor: '#B8322E',
  },
  codeCellText: {
    color: APP_COLORS.textPrimary,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '500',
  },
  errorHint: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorHintText: {
    flex: 1,
    color: '#C62828',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  submitButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  resendButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FDB4B2',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  resendButtonDisabled: {
    borderColor: '#F3D5D4',
  },
  resendButtonText: {
    color: APP_COLORS.primary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  resendButtonTextDisabled: {
    color: '#F3A8A5',
  },
  countdownBlock: {
    alignItems: 'center',
    gap: 2,
  },
  countdownLabel: {
    color: APP_COLORS.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
  countdownTimer: {
    color: APP_COLORS.primary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
