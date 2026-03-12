import { APP_BASE_URL, AUTH_ENDPOINTS } from '@/constants/app-config';

export type AuthInfo = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  [key: string]: unknown;
};

export type RegisterPayload = {
  phone: string;
  verification_code: string;
  first_name: string;
  last_name: string;
  surname?: string;
  email: string;
  username?: string;
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
};

function buildUrl(path: string): string {
  return `${APP_BASE_URL}${path}`;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), init);

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const errorPayload = await parseJson<ApiErrorResponse>(response);
      message = errorPayload?.message || errorPayload?.error || message;
    } catch {
      // Ignore JSON parsing errors for non-JSON payloads.
    }

    throw new Error(message);
  }

  const data = await parseJson<T>(response);
  if (data === null) {
    throw new Error('Пустой ответ сервера');
  }

  return data;
}

export async function requestVerificationCode(phone: string): Promise<void> {
  await request(AUTH_ENDPOINTS.requestCode, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone }),
  });
}

export async function verifyCode(phone: string, verificationCode: string): Promise<void> {
  await request(AUTH_ENDPOINTS.verifyCode, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      verification_code: verificationCode,
    }),
  });
}

export async function loginWithCode(phone: string, verificationCode: string): Promise<AuthResponse> {
  return request<AuthResponse>(AUTH_ENDPOINTS.login, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      verification_code: verificationCode,
    }),
  });
}

export async function registerUser(payload: RegisterPayload): Promise<Partial<AuthResponse>> {
  return request<Partial<AuthResponse>>(AUTH_ENDPOINTS.register, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function getAuthInfo(accessToken: string): Promise<AuthInfo> {
  return request<AuthInfo>(AUTH_ENDPOINTS.authInfo, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function requiresRegistration(authInfo: AuthInfo | null): boolean {
  if (!authInfo) {
    return false;
  }

  return !authInfo.first_name || !authInfo.last_name || !authInfo.email;
}

