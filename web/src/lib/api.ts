export type RollStatus = 'open' | 'closed' | 'expired' | 'full';

export interface PublicRoll {
  code: string;
  name: string;
  status: RollStatus;
  acceptingPhotos: boolean;
  photoCount: number;
  remaining: number;
  expiresAt: string | null;
}

export interface AdminRoll extends PublicRoll {
  id: string;
  createdAt: string;
  photoCap: number;
  closed: boolean;
  driveFolderUrl: string;
  shareUrl: string;
}

export interface AdminStatus {
  authenticated: boolean;
  googleConfigured: boolean;
  publicBaseUrl?: string;
  defaultPhotoCap?: number;
  host?: { email: string; connectedAt: string } | null;
  rolls?: AdminRoll[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new ApiError(
      typeof body.message === 'string' ? body.message : `Request failed (${response.status})`,
      response.status,
      typeof body.error === 'string' ? body.error : undefined,
    );
  }
  return body as T;
}

export const api = {
  getRoll: (code: string) => request<PublicRoll>(`/api/rolls/${encodeURIComponent(code)}`),

  adminStatus: () => request<AdminStatus>('/api/admin/status'),

  login: (password: string) =>
    request<{ ok: true }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST' }),

  createRoll: (input: { name: string; expiresInHours?: number | null; photoCap?: number | null }) =>
    request<AdminRoll>('/api/admin/rolls', { method: 'POST', body: JSON.stringify(input) }),

  updateRoll: (id: string, patch: { closed?: boolean; name?: string; photoCap?: number }) =>
    request<AdminRoll>(`/api/admin/rolls/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteRoll: (id: string) =>
    request<{ ok: true }>(`/api/admin/rolls/${id}`, { method: 'DELETE' }),

  disconnectDrive: () => request<{ ok: true }>('/api/admin/disconnect', { method: 'POST' }),
};
