import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import {
  type AppUpdateResult,
  checkForAppUpdate,
} from '@/services/app-update';
import {
  isAndroidOtpSupported,
  startOtpListener,
  stopOtpListener,
  subscribeToOtpEvents,
} from '@/services/android-otp';
import { reportError, reportEvent, reportScreen, setAnalyticsUserProfileId } from '@/services/analytics';
import { clearSession, loadSession, saveSession, type AppSession } from '@/services/session';
import { isPhoneComplete, normalizePhone } from '@/utils/phone';

type AuthStep = 'phone' | 'code' | 'register';

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
};

type UpdateCardProps = {
  title: string;
  message: string;
  details: string | null;
  isBlocking: boolean;
  canOpenStore: boolean;
  onUpdatePress: () => void;
  onDismiss?: () => void;
};

const RESEND_SECONDS = 60;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildUpdateMessage(updateResult: AppUpdateResult, isBlocking: boolean): string {
  if (updateResult.message) {
    return updateResult.message;
  }

  if (isBlocking) {
    return 'Чтобы продолжить работу, установите актуальную версию приложения.';
  }

  return 'Установите свежую версию приложения, чтобы получить последние исправления и улучшения.';
}

function buildUpdateDetails(updateResult: AppUpdateResult): string | null {
  if (updateResult.latestVersion) {
    return `Доступна версия ${updateResult.latestVersion}`;
  }

  if (updateResult.latestBuild !== null) {
    return `Доступна сборка ${updateResult.latestBuild}`;
  }

  return null;
}

function hasUsableStoreUrl(storeUrl: string | null): boolean {
  return typeof storeUrl === 'string' && /^https?:\/\//i.test(storeUrl);
}

async function bootstrapSessionState(): Promise<AppSession | null> {
  try {
    const savedSession = await loadSession();

    if (!savedSession) {
      return null;
    }

    await getAuthInfo(savedSession.accessToken);
    return savedSession;
  } catch {
    await clearSession();
    return null;
  }
}

function UpdateCard({
  title,
  message,
  details,
  isBlocking,
  canOpenStore,
  onUpdatePress,
  onDismiss,
}: UpdateCardProps) {
  return (
    <View style={[styles.updateCard, isBlocking && styles.forceUpdateCard]}>
      <Text style={styles.updateTitle}>{title}</Text>
      <Text style={styles.updateMessage}>{message}</Text>
      {!!details && <Text style={styles.updateDetails}>{details}</Text>}

      <Pressable
        style={[styles.updateButton, !canOpenStore && styles.updateButtonDisabled]}
        disabled={!canOpenStore}
        onPress={onUpdatePress}>
        <Text style={styles.updateButtonText}>Обновить приложение</Text>
      </Pressable>

      {!isBlocking && onDismiss ? (
        <Pressable style={styles.updateDismissButton} onPress={onDismiss}>
          <Text style={styles.updateDismissText}>Позже</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function IndexScreen() {
  const [isBooting, setIsBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [updateResult, setUpdateResult] = useState<AppUpdateResult | null>(null);
  const [hasDismissedSoftUpdateForLaunch, setHasDismissedSoftUpdateForLaunch] = useState(false);

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

  const isMountedRef = useRef(true);
  const updateCheckInFlightRef = useRef(false);
  const updateResultRef = useRef<AppUpdateResult | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const applyUpdateResult = useCallback((nextResult: AppUpdateResult) => {
    if (!isMountedRef.current) {
      return;
    }

    updateResultRef.current = nextResult;
    setUpdateResult(nextResult);
  }, []);

  const performUpdateCheck = useCallback(async (): Promise<AppUpdateResult> => {
    if (updateCheckInFlightRef.current) {
      return (
        updateResultRef.current ?? {
          status: 'unavailable',
          platform: Platform.OS,
          channel: null,
          currentVersion: null,
          currentBuild: null,
          latestVersion: null,
          latestBuild: null,
          minSupportedVersion: null,
          minSupportedBuild: null,
          forceUpdate: false,
          storeUrl: null,
          message: null,
        }
      );
    }

    updateCheckInFlightRef.current = true;

    try {
      const result = await checkForAppUpdate();
      applyUpdateResult(result);
      return result;
    } finally {
      updateCheckInFlightRef.current = false;
    }
  }, [applyUpdateResult]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [nextUpdateResult, savedSession] = await Promise.all([
          performUpdateCheck(),
          bootstrapSessionState(),
        ]);

        if (cancelled || !isMountedRef.current) {
          return;
        }

        applyUpdateResult(nextUpdateResult);
        setSession(savedSession);
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsBooting(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyUpdateResult, performUpdateCheck]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (isBooting) {
        return;
      }

      const wasBackgrounded = previousAppState === 'background' || previousAppState === 'inactive';
      if (wasBackgrounded && nextAppState === 'active') {
        void performUpdateCheck();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isBooting, performUpdateCheck]);

  const isForceUpdateActive = updateResult?.status === 'forceUpdate';
  const isSoftUpdateVisible =
    updateResult?.status === 'softUpdate' && !hasDismissedSoftUpdateForLaunch;

  useEffect(() => {
    if (isBooting) {
      reportScreen('boot', { has_session: Boolean(session) });
      return;
    }

    if (isForceUpdateActive) {
      reportScreen('update_required', {
        has_session: Boolean(session),
        current_build: updateResult?.currentBuild ?? undefined,
        latest_build: updateResult?.latestBuild ?? undefined,
      });
      return;
    }

    if (session) {
      setAnalyticsUserProfileId(session.phone);
      return;
    }

    if (step === 'phone') {
      reportScreen('auth_phone');
      return;
    }

    if (step === 'code') {
      reportScreen('auth_code');
      return;
    }

    reportScreen('auth_register');
  }, [isBooting, isForceUpdateActive, session, step, updateResult?.currentBuild, updateResult?.latestBuild]);

  useEffect(() => {
    if (resendInSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendInSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendInSeconds]);

  useEffect(() => {
    const unsubscribe = subscribeToOtpEvents((event) => {
      if (step !== 'code' || isForceUpdateActive || event.status !== 'received' || !event.code) {
        return;
      }

      const detectedCode = event.code;
      setCode((currentCode) => {
        if (currentCode === detectedCode || currentCode.length === 6) {
          return currentCode;
        }

        return detectedCode;
      });
    });

    return unsubscribe;
  }, [isForceUpdateActive, step]);

  useEffect(() => {
    if (step !== 'code' || isForceUpdateActive) {
      void stopOtpListener();
      return;
    }

    if (!isAndroidOtpSupported()) {
      return;
    }

    void startOtpListener().catch(() => {
      // Manual code entry remains the fallback if SMS Retriever is unavailable.
    });

    return () => {
      void stopOtpListener();
    };
  }, [isForceUpdateActive, step]);

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
    setAnalyticsUserProfileId(nextSession.phone);
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
      reportEvent('auth_code_requested', { step: 'phone' });
      setActivePhone(normalizedPhone);
      setCode('');
      setResendInSeconds(RESEND_SECONDS);
      setStep('code');
    } catch (error) {
      reportError('auth_code_request_failed', error, { step: 'phone' });
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
      reportEvent('auth_code_resent', { step: 'code' });
      setResendInSeconds(RESEND_SECONDS);
      if (Platform.OS === 'android') {
        void stopOtpListener()
          .catch(() => {
            // Ignore listener restart failures after a successful resend.
          })
          .then(() => startOtpListener())
          .catch(() => {
            // Manual code entry remains available if SMS Retriever restart fails.
          });
      }
    } catch (error) {
      reportError('auth_code_resend_failed', error, { step: 'code' });
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

      reportEvent('auth_login_succeeded', { step: 'code' });
      await finishAuth({
        accessToken: loginResponse.accessToken,
        phone: activePhone,
      });
    } catch (error) {
      reportError('auth_login_failed', error, { step: 'code' });
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

      reportEvent('auth_registration_succeeded', { step: 'register' });
      await finishAuth({
        accessToken,
        phone: activePhone,
      });
    } catch (error) {
      reportError('auth_registration_failed', error, { step: 'register' });
      const message = error instanceof Error ? error.message : 'Ошибка регистрации';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [activePhone, code, finishAuth, registerValues, temporaryAccessToken]);

  const handleLogout = useCallback(() => {
    void clearSession();
    reportEvent('logout');
    setAnalyticsUserProfileId(undefined);
    setSession(null);
    resetAuthFlow();
  }, [resetAuthFlow]);

  const handleDismissSoftUpdate = useCallback(() => {
    setHasDismissedSoftUpdateForLaunch(true);
  }, []);

  const canOpenStore = hasUsableStoreUrl(updateResult?.storeUrl ?? null);

  const handleOpenStore = useCallback(() => {
    if (!canOpenStore || !updateResult?.storeUrl) {
      return;
    }

    void Linking.openURL(updateResult.storeUrl).catch(() => {
      // Keep the current UI state unchanged if the store cannot be opened.
    });
  }, [canOpenStore, updateResult?.storeUrl]);

  const canSubmitPhone = useMemo(() => isPhoneComplete(normalizePhone(phoneInput)), [phoneInput]);
  const canSubmitRegister = useMemo(() => {
    return (
      registerValues.firstName.trim().length > 0 &&
      registerValues.lastName.trim().length > 0 &&
      isValidEmail(registerValues.email)
    );
  }, [registerValues.email, registerValues.firstName, registerValues.lastName]);

  let content: ReactNode = null;

  if (isBooting) {
    content = (
      <View style={styles.loaderScreen}>
        <ActivityIndicator size="large" color={APP_COLORS.primary} />
        <Text style={styles.loaderText}>Проверяем приложение и сессию...</Text>
      </View>
    );
  } else if (isForceUpdateActive && updateResult) {
    content = (
      <View style={styles.forceUpdateScreen}>
        <UpdateCard
          title="Нужно обновить приложение"
          message={buildUpdateMessage(updateResult, true)}
          details={buildUpdateDetails(updateResult)}
          isBlocking
          canOpenStore={canOpenStore}
          onUpdatePress={handleOpenStore}
        />
      </View>
    );
  } else if (session) {
    content = (
      <AppShell
        accessToken={session.accessToken}
        initialPath={DEFAULT_LK_PATH}
        onLogout={handleLogout}
      />
    );
  } else if (step === 'phone') {
    content = (
      <PhoneStep
        phone={phoneInput}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onPhoneChange={setPhoneInput}
        onSubmit={handleRequestCode}
        canSubmit={canSubmitPhone}
      />
    );
  } else if (step === 'code') {
    content = (
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
  } else {
    content = (
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

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      {content}

      {updateResult ? (
        <Modal
          animationType="fade"
          transparent
          visible={isSoftUpdateVisible}
          onRequestClose={handleDismissSoftUpdate}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.updateModalRoot}>
            <View style={styles.updateModalBackdrop}>
              <UpdateCard
                title="Доступно обновление"
                message={buildUpdateMessage(updateResult, false)}
                details={buildUpdateDetails(updateResult)}
                isBlocking={false}
                canOpenStore={canOpenStore}
                onUpdatePress={handleOpenStore}
                onDismiss={handleDismissSoftUpdate}
              />
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_COLORS.surface,
  },
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
  forceUpdateScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: APP_COLORS.surface,
  },
  updateModalRoot: {
    flex: 1,
  },
  updateModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(51, 48, 88, 0.28)',
  },
  updateCard: {
    borderRadius: 24,
    backgroundColor: APP_COLORS.surface,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: '#121212',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  forceUpdateCard: {
    borderWidth: 1,
    borderColor: APP_COLORS.border,
  },
  updateTitle: {
    color: APP_COLORS.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    marginBottom: 12,
  },
  updateMessage: {
    color: APP_COLORS.textSecondary,
    fontSize: 18,
    lineHeight: 26,
  },
  updateDetails: {
    color: APP_COLORS.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 14,
  },
  updateButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: APP_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  updateButtonDisabled: {
    backgroundColor: APP_COLORS.muted,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  updateDismissButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  updateDismissText: {
    color: APP_COLORS.textSecondary,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
});
