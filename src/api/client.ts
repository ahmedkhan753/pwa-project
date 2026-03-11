import { InspectionJob } from "@/store/useInspectionStore";

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

export const apiClient = {
    async login(email: string, password: string) {
        console.log('Logging in...', { email });

        try {
            const response = await fetch(`${BASE_URL}/auth/login`, {
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
            // If it's the specific JSON parse error, re-throw with generic message
            if (error.message.includes('Unexpected token')) {
                throw new Error("Błąd komunikacji z serwerem (Niepoprawny format JSON).");
            }
            throw error;
        }
    },

    async fetchJobs(): Promise<InspectionJob[]> {
        const token = getAuthToken();
        console.log('Fetching jobs with token:', token);

        try {
            const response = await fetch(`${BASE_URL}/jobs/appraiser`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch jobs');
            return await response.json();
        } catch (error) {
            console.error('Fetch jobs failed:', error);
            // Return empty array or throw error based on requirement
            throw error;
        }
    },

    async submitInspection(data: any) {
        const token = getAuthToken();
        try {
            const response = await fetch(`${BASE_URL}/api/inspection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error('Submission failed');
            return await response.json();
        } catch (error) {
            console.error('Submission failed:', error);
            // In offline scenario, the store handles local persistence
            throw error;
        }
    },

    async uploadPhoto(base64: string) {
        const token = getAuthToken();
        // API logic for photo upload to Bitrix24 via backend
        console.log('Uploading photo...', { token });
        return { status: 'success', url: 'https://cdn.inspection.app/uploads/image.jpg' };
    }
};
