import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CodeStep } from '@/components/auth/code-step';
import { PhoneStep } from '@/components/auth/phone-step';
import { RegisterStep } from '@/components/auth/register-step';
import { AppShell } from '@/components/main/app-shell';
import { APP_COLORS, DEFAULT_LK_PATH } from '@/constants/app-config';
import {
  getAuthInfo,
  loginWithCode,
  registerUser,
  requestVerificationCode,
  requiresRegistration,
  verifyCode,
} from '@/services/auth';
import { clearSession, loadSession, saveSession, type AppSession } from '@/services/session';
import { isPhoneComplete, normalizePhone } from '@/utils/phone';

type AuthStep = 'phone' | 'code' | 'register';

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
};

const RESEND_SECONDS = 60;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function IndexScreen() {
  const [isBooting, setIsBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);

  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [activePhone, setActivePhone] = useState('');
  const [code, setCode] = useState('');
  const [temporaryAccessToken, setTemporaryAccessToken] = useState<string | null>(null);
  const [registerValues, setRegisterValues] = useState<RegisterFormValues>({
    firstName: '',
    lastName: '',
    email: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const savedSession = await loadSession();

        if (!savedSession) {
          return;
        }

        await getAuthInfo(savedSession.accessToken);
        if (mounted) {
          setSession(savedSession);
        }
      } catch {
        await clearSession();
      } finally {
        if (mounted) {
          setIsBooting(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (resendInSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendInSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendInSeconds]);

  const resetAuthFlow = useCallback(() => {
    setStep('phone');
    setCode('');
    setActivePhone('');
    setTemporaryAccessToken(null);
    setRegisterValues({
      firstName: '',
      lastName: '',
      email: '',
    });
    setResendInSeconds(0);
    setErrorMessage(null);
  }, []);

  const finishAuth = useCallback(async (nextSession: AppSession) => {
    await saveSession(nextSession);
    setSession(nextSession);
    setErrorMessage(null);
  }, []);

  const handleRequestCode = useCallback(async () => {
    const normalizedPhone = normalizePhone(phoneInput);
    if (!isPhoneComplete(normalizedPhone)) {
      setErrorMessage('Введите корректный номер телефона');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await requestVerificationCode(normalizedPhone);
      setActivePhone(normalizedPhone);
      setCode('');
      setResendInSeconds(RESEND_SECONDS);
      setStep('code');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить код';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [phoneInput]);

  const handleResendCode = useCallback(async () => {
    if (!activePhone || resendInSeconds > 0) {
      return;
    }

    setIsResending(true);
    setErrorMessage(null);

    try {
      await requestVerificationCode(activePhone);
      setResendInSeconds(RESEND_SECONDS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить код повторно';
      setErrorMessage(message);
    } finally {
      setIsResending(false);
    }
  }, [activePhone, resendInSeconds]);

  const handleVerifyAndLogin = useCallback(async () => {
    if (code.length !== 6 || !activePhone) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await verifyCode(activePhone, code);
      const loginResponse = await loginWithCode(activePhone, code);

      if (!loginResponse.accessToken) {
        throw new Error('Сервер не вернул токен доступа');
      }

      setTemporaryAccessToken(loginResponse.accessToken);

      let authInfo = null;
      try {
        authInfo = await getAuthInfo(loginResponse.accessToken);
      } catch {
        authInfo = null;
      }

      if (requiresRegistration(authInfo)) {
        setStep('register');
        return;
      }

      await finishAuth({
        accessToken: loginResponse.accessToken,
        phone: activePhone,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неверный код подтверждения';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [activePhone, code, finishAuth]);

  const handleRegister = useCallback(async () => {
    if (!activePhone || code.length !== 6) {
      setErrorMessage('Сессия подтверждения истекла. Запросите код заново.');
      setStep('phone');
      return;
    }

    const firstName = registerValues.firstName.trim();
    const lastName = registerValues.lastName.trim();
    const email = registerValues.email.trim();

    if (!firstName || !lastName || !isValidEmail(email)) {
      setErrorMessage('Проверьте имя, фамилию и email');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const registerResponse = await registerUser({
        phone: activePhone,
        username: activePhone,
        verification_code: code,
        first_name: firstName,
        last_name: lastName,
        surname: '',
        email,
      });

      let accessToken =
        typeof registerResponse.accessToken === 'string' ? registerResponse.accessToken : null;

      if (!accessToken && temporaryAccessToken) {
        accessToken = temporaryAccessToken;
      }

      if (!accessToken) {
        const loginResponse = await loginWithCode(activePhone, code);
        accessToken = loginResponse.accessToken;
      }

      if (!accessToken) {
        throw new Error('Не удалось завершить регистрацию');
      }

      await finishAuth({
        accessToken,
        phone: activePhone,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка регистрации';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [activePhone, code, finishAuth, registerValues, temporaryAccessToken]);

  const handleLogout = useCallback(() => {
    void clearSession();
    setSession(null);
    resetAuthFlow();
  }, [resetAuthFlow]);

  const canSubmitPhone = useMemo(() => isPhoneComplete(normalizePhone(phoneInput)), [phoneInput]);
  const canSubmitRegister = useMemo(() => {
    return (
      registerValues.firstName.trim().length > 0 &&
      registerValues.lastName.trim().length > 0 &&
      isValidEmail(registerValues.email)
    );
  }, [registerValues.email, registerValues.firstName, registerValues.lastName]);

  if (isBooting) {
    return (
      <View style={styles.loaderScreen}>
        <ActivityIndicator size="large" color={APP_COLORS.primary} />
        <Text style={styles.loaderText}>Проверяем сессию...</Text>
      </View>
    );
  }

  if (session) {
    return <AppShell accessToken={session.accessToken} initialPath={DEFAULT_LK_PATH} onLogout={handleLogout} />;
  }

  if (step === 'phone') {
    return (
      <PhoneStep
        phone={phoneInput}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onPhoneChange={setPhoneInput}
        onSubmit={handleRequestCode}
        canSubmit={canSubmitPhone}
      />
    );
  }

  if (step === 'code') {
    return (
      <CodeStep
        phone={activePhone}
        code={code}
        isSubmitting={isSubmitting}
        isResending={isResending}
        resendInSeconds={resendInSeconds}
        errorMessage={errorMessage}
        onCodeChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        onSubmit={handleVerifyAndLogin}
        onResend={handleResendCode}
        onBack={() => {
          setStep('phone');
          setErrorMessage(null);
          setCode('');
        }}
      />
    );
  }

  return (
    <RegisterStep
      values={registerValues}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onValuesChange={setRegisterValues}
      onSubmit={handleRegister}
      onBack={() => {
        setStep('code');
        setErrorMessage(null);
      }}
      canSubmit={canSubmitRegister}
    />
  );
}

const styles = StyleSheet.create({
  loaderScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: APP_COLORS.surface,
  },
  loaderText: {
    color: APP_COLORS.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
});

