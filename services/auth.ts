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

export type RequestVerificationCodeResponse = {
  status: string;
  isNewUser?: boolean;
};

export type VerifyCodeResponse = {
  requiresRegistration: boolean;
  userId?: number;
};

export type RegisterPayload = {
  phone: string;
  verificationCode: string;
  firstName: string;
  lastName: string;
  email: string;
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
};

export type ApiRequestError = Error & {
  status?: number;
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

    const error = new Error(message) as ApiRequestError;
    error.status = response.status;
    throw error;
  }

  const data = await parseJson<T>(response);
  if (data === null) {
    throw new Error('Пустой ответ сервера');
  }

  return data;
}

export async function requestVerificationCode(phone: string): Promise<RequestVerificationCodeResponse> {
  return request<RequestVerificationCodeResponse>(AUTH_ENDPOINTS.requestCode, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone }),
  });
}

export async function verifyCode(
  phone: string,
  verificationCode: string
): Promise<VerifyCodeResponse> {
  return request<VerifyCodeResponse>(AUTH_ENDPOINTS.verifyCode, {
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
