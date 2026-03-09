import { useInspectionStore, StepData } from "@/store/useInspectionStore";
import { mapToBitrix24 } from "./bitrixMapper";
import { apiClient } from "@/api/client";

const RETRY_INTERVAL = 60000; // 60 seconds

/**
 * Background submission service to handle retries for failed reports.
 */
class SubmissionQueue {
    private isProcessing = false;

    async submitReport(data: StepData): Promise<boolean> {
        const payload = mapToBitrix24(data);

        try {
            // In a real app, this would be an API call to Bitrix24 or a proxy backend
            // For now, we simulate the handshake
            console.log("Attempting to submit report to Bitrix24...", payload);

            // Simulating API call
            // await apiClient.submitInspection(payload);

            return true;
        } catch (error) {
            console.error("Submission failed, will retry in background:", error);
            return false;
        }
    }

    startBackgroundRetry() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const checkAndRetry = async () => {
            const state = useInspectionStore.getState();
            if (state.data.finalSummary.submissionStatus === 'error' ||
                state.data.finalSummary.submissionStatus === 'pending') {

                const success = await this.submitReport(state.data);

                if (success) {
                    state.updateField('finalSummary', 'submissionStatus', 'submitted');
                    state.updateField('finalSummary', 'submittedAt', new Date().toISOString());
                    this.isProcessing = false;
                    return; // Stop retrying if successful
                }
            } else {
                this.isProcessing = false;
                return; // Stop if status changed
            }

            setTimeout(checkAndRetry, RETRY_INTERVAL);
        };

        checkAndRetry();
    }
}

export const submissionQueue = new SubmissionQueue();
