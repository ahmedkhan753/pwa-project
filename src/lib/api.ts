import { mockApi } from './mockApiService'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
console.log('[API] DEMO_MODE isActive:', DEMO_MODE)

// Real API client (unchanged functionality, just wrapped)
const realApi = {
  async login(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({ email, password })
    })
    return res.json()
  },
  async getMe() {
    const res = await fetch('/api/auth/me')
    return res.json()
  },
  async getDeals(dateFrom?: string, dateTo?: string){
    const res = await fetch(
      `/deals?date_from=${dateFrom}&date_to=${dateTo}`
    )
    return res.json()
  },
  async getDeal(dealId: string) {
    const res = await fetch(`/deals/${dealId}`)
    return res.json()
  },
  async saveStep(dealId: string, step: number, data: any) {
    const res = await fetch(
      `/inspection/${dealId}/step/${step}`,
      {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      }
    )
    return res.json()
  },
  async scheduleDeal(dealId: string, date: string, time: string) {
    const res = await fetch(
      `/inspection/${dealId}/schedule`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ date, time })
      }
    )
    return res.json()
  },
  async uploadFile(dealId: string, fieldKey: string, file: File) {
    const form = new FormData()
    form.append('deal_id', dealId)
    form.append('field_key', fieldKey)
    form.append('file', file)
    const res = await fetch('/files/upload', {
      method: 'POST',
      body: form
    })
    return res.json()
  },
  async getMetadataOptions() {
    const res = await fetch('/api/metadata/options')
    return res.json()
  },
  async submitInspection(dealId: string, data: any) {
    const res = await fetch(`/inspection/${dealId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }
}

// Export whichever API is appropriate
export const api = DEMO_MODE ? mockApi : realApi
