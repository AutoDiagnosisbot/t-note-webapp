import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const formattedPhone = useMemo(() => formatPhoneForInput(phone), [phone]);
  const codeChars = useMemo(() => {
    const normalized = code.slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => normalized[index] ?? '');
  }, [code]);

  const canResend = resendInSeconds === 0 && !isResending;
  const canSubmit = code.length === 6 && !isSubmitting;
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

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

  return (
    <Pressable style={styles.container} onPress={focusInput}>
      {!!errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Text style={styles.title}>Введите код подтверждения</Text>
      <Text style={styles.subtitle}>Отправили код на {formattedPhone}</Text>

      <Pressable onPress={onBack}>
        <Text style={styles.changePhone}>Изменить телефон</Text>
      </Pressable>

      <View style={styles.codeRowWrap}>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={onCodeChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          autoFocus
          blurOnSubmit={false}
          onSubmitEditing={onSubmit}
          style={styles.hiddenInput}
        />

        <Pressable style={styles.codeRow} onPress={focusInput}>
          {codeChars.map((char, index) => {
            const isFocused = index === code.length && code.length < 6;

            return (
              <Pressable
                key={index}
                style={[styles.codeCell, isFocused && styles.codeCellFocused]}
                onPress={focusInput}>
                <Text style={styles.codeCellText}>{char}</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </View>

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit}>
        <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
          {isSubmitting ? 'Проверяем...' : 'Подтвердить код'}
        </Text>
      </Pressable>

      <Pressable onPress={onResend} disabled={!canResend}>
        <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
          {isResending
            ? 'Отправка...'
            : canResend
              ? 'Отправить код повторно'
              : `Отправить код повторно ${`00:${String(resendInSeconds).padStart(2, '0')}`}`}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export const CodeStep = memo(CodeStepComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
    justifyContent: 'center',
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
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 8,
  },
  changePhone: {
    color: APP_COLORS.primary,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 24,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  codeRowWrap: {
    position: 'relative',
    marginBottom: 24,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeCell: {
    width: 48,
    height: 60,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: APP_COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeCellFocused: {
    borderColor: APP_COLORS.primary,
  },
  codeCellText: {
    color: APP_COLORS.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '500',
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    borderColor: APP_COLORS.muted,
  },
  submitButtonText: {
    color: APP_COLORS.primary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: APP_COLORS.muted,
  },
  resendText: {
    color: APP_COLORS.primary,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  resendTextDisabled: {
    color: APP_COLORS.muted,
  },
});
