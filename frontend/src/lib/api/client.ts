import { appPath } from '../routes';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8009/api/v1';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null;
};

let unauthorizedHandler: () => void = () => {
  if (!window.location.pathname.endsWith('/login')) {
    window.location.assign(appPath('/login'));
  }
};

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const { body, ...requestOptions } = options;
  const init: RequestInit = {
    ...requestOptions,
    credentials: 'include',
    headers,
  };

  if (body && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  } else if (body) {
    init.body = body;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const code = payload?.code ?? 'REQUEST_FAILED';
    const detail = payload?.detail ?? 'Request failed';
    if (response.status === 401) {
      unauthorizedHandler();
    }
    throw new ApiError(detail, code, response.status);
  }

  return payload as T;
}

export function downloadUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}
