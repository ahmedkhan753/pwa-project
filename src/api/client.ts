export const apiClient = {
    async submitInspection(data: any) {
        try {
            const response = await fetch('/api/inspection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            return await response.json();
        } catch (error) {
            console.error('Submission failed:', error);
            throw error;
        }
    },

    async uploadPhoto(base64: string) {
        // API logic for photo upload to Bitrix24
        return { status: 'success', url: '...' };
    }
};
