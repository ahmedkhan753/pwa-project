import { InspectionJob, StepData } from "@/store/useInspectionStore";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const IS_DEMO = false;

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

const getAuthEmail = () => {
    try {
        const storage = localStorage.getItem('inspection-storage');
        if (storage) {
            const parsed = JSON.parse(storage);
            return parsed.state.auth.user?.email || '';
        }
    } catch (e) {
        return '';
    }
    return '';
};

export interface SubmissionResult {
    status: 'submitted' | 'retry';
    dealId?: string;
    filesUploaded?: number;
    error?: string;
    message: string;
}

export const apiClient = {
    async login(email: string, password: string) {
        console.log('Logging in...', { email });

        try {
            const response = await fetch(`${BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Non-JSON response received:", text.substring(0, 100));
                throw new Error("Serwer API jest niedostępny (Błąd 404/500). Skonfiguruj NEXT_PUBLIC_API_URL.");
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Błędne dane logowania');
            }

            return data;
        } catch (error: any) {
            console.error('Login failed:', error);
            if (error.message.includes('Unexpected token')) {
                throw new Error("Błąd komunikacji z serwerem (Niepoprawny format JSON).");
            }
            throw error;
        }
    },

    async fetchJobs(date?: string): Promise<InspectionJob[]> {
        const token = getAuthToken();
        const email = getAuthEmail();
        console.log('Fetching tasks...', { email, date });

        try {
            const params = new URLSearchParams();
            if (email) params.append('email', email);
            if (date) params.append('date', date);

            const response = await fetch(`${BASE_URL}/api/tasks?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch tasks');
            return await response.json();
        } catch (error) {
            console.error('Fetch tasks failed:', error);
            throw error;
        }
    },

    async submitInspection(data: StepData & { jobId: string; images?: string[] }): Promise<SubmissionResult> {
        const token = getAuthToken();
        console.log('Submitting inspection...', { jobId: data.jobId });

        try {
            const response = await fetch(`${BASE_URL}/api/submit-inspection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (result.status === 'submitted') {
                console.log('Inspection submitted successfully:', result);
                return result;
            }

            if (result.status === 'retry') {
                console.warn('Submission requires retry:', result.error);
                return result;
            }

            throw new Error(result.error || 'Unknown submission error');
        } catch (error: any) {
            console.error('Submission failed:', error);
            // Return retry status so the PWA keeps data in localStorage
            return {
                status: 'retry',
                error: error.message || 'Network error',
                message: 'Submission failed. Data preserved for retry.',
            };
        }
    },

    async getMetadata() {
        try {
            const response = await fetch(`${BASE_URL}/api/metadata/options`);
            if (!response.ok) return {};
            return await response.json();
        } catch (e) {
            console.error("Failed to fetch metadata", e);
            return {};
        }
    },
    async uploadPhoto(base64: string) {
        const token = getAuthToken();
        console.log('Uploading photo...', { token });
        // Photos are now handled as part of submit-inspection
        return { status: 'success', url: '' };
    }
};
