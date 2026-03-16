import { InspectionJob, StepData } from "@/store/useInspectionStore";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

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

        if (IS_DEMO) {
            console.log("DEMO MODE: Simulating login success");
            await new Promise(res => setTimeout(res, 800));
            return {
                access_token: "demo-token-123456",
                token_type: "bearer",
                user: {
                    id: "demo-user",
                    email,
                    name: "Demo Inspector"
                }
            };
        }

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

        if (IS_DEMO) {
            console.log("DEMO MODE: Returning mock jobs data");
            await new Promise(res => setTimeout(res, 600));
            const targetDate = date || new Date().toISOString().split('T')[0];
            return [
                {
                    id: 'demo-job-1',
                    status: 'ready',
                    plates: 'WA 78912',
                    make: 'BMW',
                    model: 'M3 Competition',
                    vin: 'WUW343434DK39219',
                    clientName: 'Jan Kowalski',
                    phone: '+48 500 600 700',
                    city: 'Warszawa',
                    appointmentTime: '08:30',
                    deadline: targetDate
                },
                {
                    id: 'demo-job-2',
                    status: 'in_progress',
                    plates: 'KR 30345',
                    make: 'Audi',
                    model: 'A6 Avant',
                    vin: 'WAUZZZ4G8EN0571',
                    clientName: 'Anna Nowak',
                    phone: '+48 600 700 800',
                    city: 'Kraków',
                    appointmentTime: '11:15',
                    deadline: targetDate
                },
                {
                    id: 'demo-job-3',
                    status: 'completed',
                    plates: 'GD 501BB',
                    make: 'Mercedes-Benz',
                    model: 'S 500',
                    vin: 'WDD2221821A1598',
                    clientName: 'Firma TransBud Sp. z o.o.',
                    phone: '+48 700 800 900',
                    city: 'Gdańsk',
                    appointmentTime: '14:00',
                    deadline: targetDate
                }
            ];
        }

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

        if (IS_DEMO) {
            console.log("DEMO MODE: Simulating form submission with payload:", data);
            await new Promise(res => setTimeout(res, 1200));
            return {
                status: 'submitted',
                message: 'Demo inspection submitted successfully',
                filesUploaded: data.images?.length || 0
            };
        }

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
        if (IS_DEMO) return {};
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
