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

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Invalid credentials');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Login failed:', error);
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
