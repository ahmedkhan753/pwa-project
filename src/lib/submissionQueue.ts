import { useInspectionStore, StepData } from "@/store/useInspectionStore";
import { inspectionApi } from "@/api/inspectionApi";
import { SubmissionResult } from "@/api/client";

const RETRY_INTERVAL = 60000; // 60 seconds
const MAX_RETRIES = 10;

/**
 * Background submission service to handle retries for failed reports.
 * Leverages the Zustand store's localStorage persistence for offline resilience.
 */
class SubmissionQueue {
    private isProcessing = false;
    private retryCount = 0;

    /**
     * Submit a full inspection report to the backend (→ Bitrix24).
     * The backend handles image upload + CRM deal creation.
     */
    async submitReport(data: StepData, jobId: string): Promise<SubmissionResult> {
        try {
            console.log("Submitting inspection to Bitrix24 via backend...", { jobId });

            const result = await inspectionApi.submitFullInspection({
                ...data,
                deal_id: jobId, // in this PWA, jobId is the dealId
                job_id: jobId,
            });

            return {
                status: result.status === 'success' ? 'submitted' : 'retry',
                dealId: result.deal_id,
                message: result.message || 'Success',
            };
        } catch (error: any) {
            console.error("Submission failed:", error);
            return {
                status: 'retry',
                error: error.message || 'Unknown error',
                message: 'Submission failed. Data preserved for retry.',
            };
        }
    }

    /**
     * Start a background retry loop.
     * Checks the store for pending/error submissions and retries them.
     */
    startBackgroundRetry() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.retryCount = 0;

        const checkAndRetry = async () => {
            const state = useInspectionStore.getState();
            const status = state.data.finalSummary.submissionStatus;

            // Only retry if status is 'error' or 'pending'
            if (status !== 'error' && status !== 'pending') {
                this.isProcessing = false;
                console.log("Submission queue: No pending submissions, stopping retry loop.");
                return;
            }

            // Check max retries
            if (this.retryCount >= MAX_RETRIES) {
                console.error(`Submission queue: Max retries (${MAX_RETRIES}) reached. Giving up.`);
                this.isProcessing = false;
                return;
            }

            this.retryCount++;
            console.log(`Submission queue: Retry attempt ${this.retryCount}/${MAX_RETRIES}`);

            const jobId = state.jobs.currentJobId || 'unknown';
            const result = await this.submitReport(state.data, jobId);

            if (result.status === 'submitted') {
                // Success — update the store
                state.updateField('finalSummary', 'submissionStatus', 'submitted');
                state.updateField('finalSummary', 'submittedAt', new Date().toISOString());
                console.log("Submission queue: Report submitted successfully!");
                this.isProcessing = false;
                return;
            }

            // Failed — schedule another retry
            console.warn(`Submission queue: Retry failed. Next attempt in ${RETRY_INTERVAL / 1000}s`);
            setTimeout(checkAndRetry, RETRY_INTERVAL);
        };

        // Start the first retry
        checkAndRetry();
    }

    /**
     * Stop the background retry loop.
     */
    stopRetry() {
        this.isProcessing = false;
        this.retryCount = 0;
        console.log("Submission queue: Retry loop stopped.");
    }
}

export const submissionQueue = new SubmissionQueue();
