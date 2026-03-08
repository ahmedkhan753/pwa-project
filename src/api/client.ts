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
        // In a real app, this would be a fetch to BASE_URL + '/auth/login'
        // For now, we simulate a successful login handshake
        console.log('Logging in...', { email });

        // Simulate network delay
        await new Promise(r => setTimeout(r, 1000));

        // Mock response
        if (email.includes('error')) throw new Error('Invalid credentials');

        return {
            token: 'mock-jwt-token-' + Date.now(),
            user: {
                id: '1',
                email: email,
                name: 'Appraiser Marek',
            }
        };
    },

    async fetchJobs(): Promise<InspectionJob[]> {
        const token = getAuthToken();
        console.log('Fetching jobs with token:', token);

        await new Promise(r => setTimeout(r, 800));

        // Mock data from Bitrix24
        return [
            {
                id: 'job_1',
                clientName: 'Jan Kowalski',
                vin: 'WVGZZZ5NZLW123456',
                plates: 'WA 12345',
                phone: '+48600100200',
                appointmentTime: '2024-03-20 10:00',
                status: 'pending'
            },
            {
                id: 'job_2',
                clientName: 'Anna Nowak',
                vin: 'TMKDA7NE1L098765',
                plates: 'PO 98765',
                phone: '+48700800900',
                appointmentTime: '2024-03-20 14:30',
                status: 'pending'
            },
            {
                id: 'job_3',
                clientName: 'Firma ABC Sp. z o.o.',
                vin: 'SJNFAA1U0B333221',
                plates: 'KR 55555',
                phone: '+123456789',
                appointmentTime: '2024-03-21 09:00',
                status: 'pending'
            }
        ];
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
