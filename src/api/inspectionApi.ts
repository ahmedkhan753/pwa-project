/**
 * Specialized API Client for Phase 6
 * ==================================
 * Interacts with the new Bitrix24 Integration Gateway endpoints.
 * Handles deal listing, full submission, step-by-step saving, and file uploads.
 */

import { InspectionPayload, StepData } from "@/store/useInspectionStore";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

const getAuthToken = () => {
    try {
        const storage = localStorage.getItem('inspection-storage');
        if (storage) {
            const parsed = JSON.parse(storage);
            return parsed.state.auth.token;
        }
    } catch (e) {
        return null;
    }
    return null;
};

export interface ApiError {
    detail?: string;
    message?: string;
}

export const inspectionApi = {
    /**
     * GET /deals
     * Fetch deals from Bitrix24 filtered by date range and/or appraiser.
     */
    async fetchDeals(dateFrom?: string, dateTo?: string, userId?: string) {
        const token = getAuthToken();
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (userId) params.append('user_id', userId);

        const response = await fetch(`${BASE_URL}/deals?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to fetch deals');
        }

        return await response.json();
    },

    /**
     * GET /deals/{deal_id}
     * Fetch a single deal translated to PWA keys.
     */
    async getDeal(dealId: string) {
        const token = getAuthToken();
        const response = await fetch(`${BASE_URL}/deals/${dealId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Failed to fetch deal');
        }

        return await response.json();
    },

    /**
     * POST /inspection/submit
     * Submit the full 11-step inspection payload.
     */
    async submitFullInspection(payload: any) {
        const token = getAuthToken();
        const response = await fetch(`${BASE_URL}/inspection/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Failed to submit inspection');
        }

        return result;
    },

    /**
     * PATCH /inspection/{deal_id}/step/{step_number}
     * Save progress of a single wizard step (Anti-Oops).
     */
    async saveInspectionStep(dealId: string, stepNumber: number, data: any) {
        const token = getAuthToken();
        const response = await fetch(`${BASE_URL}/inspection/${dealId}/step/${stepNumber}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                step_number: stepNumber,
                data: data
            }),
        });

        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Failed to save step ${stepNumber}`);
        }

        return await response.json();
    },

    /**
     * POST /files/upload
     * Upload a single file to Bitrix CRM field.
     */
    async uploadInspectionFile(dealId: string, fieldKey: string, file: File | Blob, filename?: string) {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('deal_id', dealId);
        formData.append('field_key', fieldKey);
        formData.append('file', file, filename || (file as File).name);

        const response = await fetch(`${BASE_URL}/files/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'File upload failed');
        }

        return await response.json();
    },

    /**
     * POST /files/upload-batch
     * Upload multiple files concurrently.
     */
    async uploadBatchFiles(dealId: string, files: (File | Blob)[], fieldKeys: string[]) {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('deal_id', dealId);
        formData.append('field_keys', fieldKeys.join(','));
        files.forEach((file, i) => {
            formData.append('files', file, (file as File).name || `file_${i}`);
        });

        const response = await fetch(`${BASE_URL}/files/upload-batch`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) {
            const error: ApiError = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Batch file upload failed');
        }

        return await response.json();
    }
};
