const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
console.log(
  `[API] Mode: REAL | BASE_URL: ${BASE_URL} |`,
  `NEXT_PUBLIC_DEMO_MODE: ${process.env.NEXT_PUBLIC_DEMO_MODE}`
)

// Helper to get auth token from Zustand persisted storage
const getAuthToken = (): string | null => {
  try {
    const storage = localStorage.getItem('inspection-storage');
    if (storage) {
      const parsed = JSON.parse(storage);
      return parsed.state?.auth?.token || null;
    }
  } catch (e) {
    return null;
  }
  return null;
};

// Helper to build auth headers
const authHeaders = (extra: Record<string, string> = {}) => {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Real API client — all paths prefixed with BASE_URL
const realApi = {
  async login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    return res.json()
  },
  async getMe() {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: authHeaders()
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch user');
    }
    return res.json()
  },
  async getDeals(dateFrom?: string, dateTo?: string) {
    const res = await fetch(
      `${BASE_URL}/deals?date_from=${dateFrom}&date_to=${dateTo}`,
      { headers: authHeaders() }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch deals');
    }
    return res.json()
  },
  async getDeal(dealId: string) {
    const res = await fetch(`${BASE_URL}/deals/${dealId}`, {
      headers: authHeaders()
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch deal');
    }
    return res.json()
  },
  async saveStep(dealId: string, step: number, data: any) {
    const res = await fetch(
      `${BASE_URL}/inspection/${dealId}/step/${step}`,
      {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          step_number: step,
          data: data
        })
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to save step ${step}`);
    }
    return res.json()
  },
  async scheduleDeal(dealId: string, date: string, time: string) {
    const scheduled_date = time ? `${date}T${time}` : date;
    const res = await fetch(
      `${BASE_URL}/inspection/${dealId}/schedule`,
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scheduled_date })
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to schedule');
    }
    return res.json()
  },
  async uploadFile(dealId: string, fieldKey: string, file: File) {
    const form = new FormData()
    form.append('deal_id', dealId)
    form.append('field_key', fieldKey)
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'File upload failed');
    }
    return res.json()
  },
  async getMetadataOptions() {
    const res = await fetch(`${BASE_URL}/api/metadata/options`, {
      headers: authHeaders()
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch metadata');
    }
    return res.json()
  },
  async submitInspection(dealId: string, data: any) {
    const res = await fetch(`${BASE_URL}/inspection/submit`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Submission failed');
    }
    return res.json();
  }
}

export const api = realApi
