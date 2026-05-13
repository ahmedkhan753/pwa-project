"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { ChevronLeft, ChevronRight, Send, LogOut, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/Logo";
import { startUploadWorker, stopUploadWorker, MAX_UPLOAD_ATTEMPTS } from "@/lib/uploadWorker";
import { photoQueue } from "@/lib/photoUploadQueue";
import { isStep9Valid, STEP9_REQUIRED_KEYS, STEP9_FIELD_ID_PREFIX } from "./steps/MechanicalStep";

// Mechanika step index in the wizard (verify against StepDispatcher.tsx).
const MECHANICAL_STEP = 9;

const STEPS = [
    { num: 1, short: "Dane", label: "Dane Pojazdu" },
    { num: 2, short: "Kompl.", label: "Kompletność" },
    { num: 3, short: "Wypos.", label: "Wyposażenie" },
    { num: 4, short: "Lakier", label: "Pomiar Lakieru" },
    { num: 5, short: "Opony", label: "Opony" },
    { num: 6, short: "Zdjęcia", label: "Zdjęcia" },
    { num: 7, short: "Zewn.", label: "Uszkodz. Zewn." },
    { num: 8, short: "Wewn.", label: "Uszkodz. Wewn." },
    { num: 9, short: "Mech.", label: "Mechanika" },
    { num: 10, short: "Uwagi", label: "Uwagi i Wycena" },
    { num: 11, short: "Sprawdź", label: "Weryfikacja" },
    { num: 12, short: "Podpis", label: "Podsumowanie" },
];

export function WizardLayout({ children }: { children: React.ReactNode }) {
    const { currentStep, maxVisitedStep, setStep, logout, selectJob, syncStepWithBitrix } = useInspectionStore();
    const setStep9AttemptedNext = useInspectionStore((s) => s.setStep9AttemptedNext);
    const totalSteps = STEPS.length;
    const mainRef = useRef<HTMLElement>(null);
    const didMountRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string>('');
    // Photo upload queue health for the current deal.
    //   active : worker is still actively trying to upload (block submit)
    //   dead   : permanently failed after MAX_UPLOAD_ATTEMPTS retries
    //            (allow submit-anyway with confirmation, since grinding
    //             forever doesn't help and locks the inspector out)
    const [photoQueueState, setPhotoQueueState] = useState({ active: 0, dead: 0 });

    // ── Start the IndexedDB-backed upload worker ──────────────────
    // Survives iOS crashes: on reload, the worker picks up any queued
    // photos from IndexedDB and resumes uploading automatically.
    useEffect(() => {
        const store = useInspectionStore.getState();
        const tok = store.auth?.token;
        const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        if (tok) {
            startUploadWorker(tok, url);
        }
        return () => { stopUploadWorker(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Submit gate: track photo upload health for the current deal ──
    // Submit body has photos:{} so the wizard relies on the worker having
    // already drained every photo to backend storage. If we let submit fire
    // while uploads are mid-flight, the backend generates a PDF with missing
    // pictures.
    //
    // Two-tier accounting:
    //   active = pending + uploading + (failed but attempts < MAX, still
    //            being retried by the worker). Block submit while > 0.
    //   dead   = failed AND attempts >= MAX (permanently given up).
    //            Don't block — instead require an explicit confirmation
    //            so a single bad photo can't lock the inspector out.
    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            const dealId = useInspectionStore.getState().jobs?.currentJobId;
            if (!dealId) {
                if (!cancelled) setPhotoQueueState({ active: 0, dead: 0 });
                return;
            }
            // Meta-only walk — never loads base64 into memory. Critical for
            // stress-test scenarios with 80-150 photos where the previous
            // getByDeal() call was rehydrating ~18 MB into memory every 2 s.
            const metas = await photoQueue.getMetaByDeal(String(dealId));
            if (cancelled) return;
            let active = 0;
            let dead = 0;
            for (const it of metas) {
                // Videos never gate submit — they upload in the background
                // with their own retry loop and surface status inside the
                // VideoRecordSlot. Photo gating is unchanged.
                if (it.kind === 'video') continue;
                if (it.status === 'uploaded') continue;
                if ((it.attempts || 0) >= MAX_UPLOAD_ATTEMPTS && it.status === 'failed') {
                    dead++;
                } else {
                    active++;
                }
            }
            setPhotoQueueState({ active, dead });
        };
        refresh();
        const unsub = photoQueue.subscribe(refresh);
        // Safety poll — covers cases where notify() is missed (e.g. during a
        // tab restore where the worker fires before subscribers re-attach).
        const poll = setInterval(refresh, 2_000);
        return () => { cancelled = true; unsub(); clearInterval(poll); };
    }, []);

    // Scroll to top on step change — covers both the inner scroll container
    // and window/document for browsers where the page itself scrolls.
    useEffect(() => {
        if (mainRef.current) mainRef.current.scrollTop = 0;
        try {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        } catch { /* ignore */ }
    }, [currentStep]);

    // Bitrix Auto-Sync (Anti-Oops) — fires on step CHANGE, syncs the PREVIOUS step.
    // When the user leaves step 4 (paint) for step 5, we sync step 4 with the
    // paint data they just filled in. Skipped on initial mount to avoid iOS loops.
    const prevStepRef = useRef(currentStep);
    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return; // Skip sync on first render (mount / rehydration)
        }
        if (isSubmitting) return;

        const prevStep = prevStepRef.current;
        prevStepRef.current = currentStep;

        // Sync the step the user just LEFT (has filled data), not the one they entered
        if (prevStep !== currentStep && prevStep >= 1) {
            const timer = setTimeout(async () => {
                await syncStepWithBitrix(prevStep);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [currentStep, syncStepWithBitrix, isSubmitting]);


    // Level-2 gate: inspector must fill 5 critical mechanical fields before
    // leaving Step 9. Going BACKWARD is always allowed. Going forward without
    // satisfying validation flips the "attempted" flag (paints the form red)
    // and scrolls to the first empty required field.
    const enforceStep9Gate = (): boolean => {
        if (currentStep !== MECHANICAL_STEP) return true;
        const mech = useInspectionStore.getState().data.mechanical as unknown as Record<string, unknown>;
        if (isStep9Valid(mech)) return true;
        setStep9AttemptedNext(true);
        const firstMissing = STEP9_REQUIRED_KEYS.find((k) => {
            const v = mech?.[k];
            return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
        });
        if (firstMissing) {
            // requestAnimationFrame so the red-border ring renders before we scroll.
            requestAnimationFrame(() => {
                const el = document.getElementById(`${STEP9_FIELD_ID_PREFIX}${firstMissing}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
        return false;
    };

    const next = () => {
        if (currentStep < totalSteps) {
            if (!enforceStep9Gate()) return;
            setStep(currentStep + 1);
        }
    };

    const prev = () => {
        if (currentStep > 1) setStep(currentStep - 1);
    };

    const goToStep = (step: number) => {
        // Backward jumps always allowed — only block forward jumps past Step 9.
        if (step > currentStep && !enforceStep9Gate()) return;
        if (step <= maxVisitedStep || step === currentStep + 1) {
            setStep(step);
        }
    };

// Compress a base64 image — tries progressively harder until under MAX_B64_BYTES
const MAX_B64_BYTES = 150 * 1024; // 150KB base64 ≈ ~110KB binary

async function compressImage(base64: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            // Try progressively smaller/lower quality until under limit
            const attempts = [
                { max: 800, quality: 0.60 },
                { max: 600, quality: 0.50 },
                { max: 400, quality: 0.40 },
            ];
            for (const { max, quality } of attempts) {
                const ratio = Math.min(max / img.width, max / img.height, 1)
                const canvas = document.createElement('canvas')
                canvas.width = Math.round(img.width * ratio)
                canvas.height = Math.round(img.height * ratio)
                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                const result = canvas.toDataURL('image/jpeg', quality)
                if (result.length <= MAX_B64_BYTES || quality === 0.40) {
                    resolve(result)
                    return
                }
            }
            resolve('') // give up — skip this photo
        }
        img.onerror = () => resolve('') // can't load — skip, don't send original
        img.src = base64
    })
}


    const handleSubmit = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();

        if (isSubmitting) return;

        const store = useInspectionStore.getState();
        const dealId = store.jobs?.currentJobId;

        if (!dealId) {
            setSubmitError('Brak ID zlecenia — odśwież stronę');
            setSubmitStatus('error');
            return;
        }

        // Belt-and-braces gate (button is also disabled in render): re-read
        // the queue at click-time so a race between subscriber update and
        // click handler can't slip a submit through with photos in flight.
        // Meta-only — base64 is never needed for the gate decision.
        const queueAtClick = await photoQueue.getMetaByDeal(String(dealId));
        let activeNow = 0;
        const deadSlots: string[] = [];
        for (const it of queueAtClick) {
            // Videos never gate submit — same rationale as the live poll above.
            if (it.kind === 'video') continue;
            if (it.status === 'uploaded') continue;
            if ((it.attempts || 0) >= MAX_UPLOAD_ATTEMPTS && it.status === 'failed') {
                deadSlots.push(it.slotId);
            } else {
                activeNow++;
            }
        }
        if (activeNow > 0) {
            setSubmitError(`${activeNow} zdjęć wciąż się wysyła — poczekaj chwilę.`);
            setSubmitStatus('error');
            return;
        }
        if (deadSlots.length > 0) {
            // Surface exactly which photos couldn't be uploaded so the inspector
            // makes an informed call: either go back to step 6 and re-take
            // them (re-enqueue resets attempts), or submit knowing the report
            // will be missing those pictures. Native confirm() works on iOS.
            const slotList = deadSlots.slice(0, 5).join(', ') + (deadSlots.length > 5 ? '…' : '');
            const ok = window.confirm(
                `${deadSlots.length} zdjęć nie udało się wysłać po wielu próbach:\n\n${slotList}\n\n` +
                `Czy chcesz mimo to wysłać raport?\n\n` +
                `OK → wyślij raport bez tych zdjęć\n` +
                `Anuluj → wróć do kroku Zdjęcia i zrób je ponownie`
            );
            if (!ok) {
                setSubmitError('Wróć do kroku 6 (Zdjęcia) i zrób ponownie nieudane zdjęcia.');
                setSubmitStatus('error');
                return;
            }
            // User accepted — drop the dead items so the queue stops advertising
            // them as unsent. Backend already has whatever did make it through.
            for (const slot of deadSlots) {
                await photoQueue.markUploaded(`${dealId}__${slot}`).catch(() => {});
            }
        }

        const token = store.auth?.token;
        if (!token) {
            window.location.replace('/');
            return;
        }

        setIsSubmitting(true);

        // Tell ErrorBoundary "the next ~second of DOM churn is expected".
        // clearInspection() unmounts the entire wizard subtree. iOS WebKit
        // and React's strict mode can both throw `removeChild`/`insertBefore`
        // mid-unmount when portals (modals, popovers, signature canvases)
        // race the parent unmount. The ErrorBoundary recognises this flag
        // and short-circuits its soft-retry/reload cycle, showing the
        // success screen instead of "Odśwież stronę".
        if (typeof window !== 'undefined') {
            (window as any).__submitInProgress = true;
        }

        // Snapshot data before clearing
        const storeData = { ...store.data };
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const finalSummary = storeData?.finalSummary || {};

        // Build the submit body up front so JSON.stringify runs synchronously
        // against a stable snapshot — no risk of store mutation mid-serialize.
        const submitBody = JSON.stringify({
            deal_id: dealId,
            photos: {},
            finalSummary: {
                signatureAppraiser: finalSummary.signatureAppraiser || '',
                signatureClient: finalSummary.signatureClient || '',
                signatureYard: finalSummary.signatureYard || '',
                vinConfirmed: (finalSummary as any).vinConfirmed || false,
            },
            vehicleData: storeData?.vehicleData || {},
            equipmentCompleteness: storeData?.equipmentCompleteness || {},
            fullEquipment: storeData?.fullEquipment || {},
            paintMeasurement: storeData?.paintMeasurement || {},
            tires: storeData?.tires || {},
            exteriorDamage: storeData?.exteriorDamage || [],
            interiorDamage: storeData?.interiorDamage || [],
            mechanical: storeData?.mechanical || {},
            notesValuation: storeData?.notesValuation || {},
        });

        // keepalive has a hard 64KB body cap. Real-world inspection bodies
        // come in around 100-200KB once signatures + damage descriptions +
        // paint measurements + notes are populated, which used to silently
        // fail the submit with "Failed to fetch" because the browser
        // refused to dispatch the request at all. Decide per-submit:
        //   - small body (< 60KB) → keepalive for ironclad delivery on
        //                            unmount/navigation
        //   - large body (≥ 60KB) → omit keepalive; rely on the fact that
        //                            fetch() is initiated BEFORE
        //                            clearInspection() unmounts the wizard,
        //                            so the request is already in the
        //                            browser's network queue when React
        //                            tears the component down. The browser
        //                            keeps in-flight requests alive across
        //                            React unmounts as long as the document
        //                            itself doesn't unload.
        const bodySizeKB = Math.round(new Blob([submitBody]).size / 1024);
        const useKeepalive = bodySizeKB < 60;
        if (!useKeepalive) {
            console.warn(`[submit] body=${bodySizeKB}KB — too large for keepalive, falling back to standard fetch (deal ${dealId})`);
        }

        // Persist recovery draft BEFORE the in-flight request goes out.
        // If the submit eventually fails (network / 5xx / iOS abort), the user
        // re-opens the deal from the dashboard and selectJob() rehydrates from
        // drafts[dealId] — nothing is lost. Without this, an earlier version
        // of clearInspection() wiped state on submit failure (Żuraw case).
        useInspectionStore.setState((s) => ({
            drafts: { ...s.drafts, [dealId]: storeData },
        }));
        useInspectionStore.getState().setSubmissionStatus(dealId, 'uploading');
        photoQueue.clearDeal(dealId).catch(() => {});

        // ── ORDER IS LOAD-BEARING — DO NOT REORDER ─────────────────────
        // 1) Initiate fetch FIRST, while WizardLayout is still mounted.
        //    Browsers keep in-flight fetches alive across React unmounts
        //    as long as the document itself doesn't unload, so getting the
        //    request into the network queue before clearInspection() runs
        //    is the key invariant.
        // 2) keepalive:true (when body fits the 64KB cap) tells the browser
        //    "this request must complete even if the page navigates away
        //    or the document is destroyed." Designed exactly for
        //    fire-and-forget submit-then-leave patterns; bullet-proof on
        //    iOS Safari 15+. For larger bodies we omit it (browser would
        //    reject the fetch outright with "Failed to fetch") and lean
        //    on the fetch-before-unmount ordering instead.
        //
        // Mateusz incident 2026-04-22 (deal 1642): 31 photos uploaded fine,
        // 11 step PATCHes succeeded, but POST /inspection/submit never
        // appeared in backend logs at all — fetch was killed by unmount.
        // Deal 1652 incident 2026-04-26: body=163KB, keepalive rejected
        // the request before dispatch. Conditional keepalive resolves both.
        const fetchInit: RequestInit = {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: submitBody,
        };
        if (useKeepalive) {
            fetchInit.keepalive = true;
        }
        const submitPromise = fetch(`${apiUrl}/inspection/submit`, fetchInit);

        // Now safe to unmount — fetch is already in-flight with keepalive.
        useInspectionStore.getState().clearInspection();

        submitPromise
            .then((res) => {
                if (res.ok) {
                    // Submit confirmed — safe to discard the recovery draft.
                    useInspectionStore.setState((s) => {
                        const { [dealId]: _discard, ...remaining } = s.drafts;
                        return { drafts: remaining };
                    });
                    useInspectionStore.getState().setSubmissionStatus(dealId, 'pending');
                } else {
                    console.error(`[submit] deal ${dealId} server returned ${res.status}`);
                    useInspectionStore.getState().setSubmissionStatus(dealId, 'error');
                }
            })
            .catch((err) => {
                // Network failure / CORS / keepalive size limit / browser abort.
                // drafts[dealId] is intact — user retries from dashboard.
                console.error(`[submit] deal ${dealId} fetch failed:`, err?.message || err);
                useInspectionStore.getState().setSubmissionStatus(dealId, 'error');
            })
            .finally(() => {
                // Clear the "expected DOM churn" flag once the request settles.
                // After this point any DOM error is a real bug, not a submit
                // race, so ErrorBoundary should resume normal recovery flow.
                if (typeof window !== 'undefined') {
                    (window as any).__submitInProgress = false;
                }
            });
    };

    // NOTE: deliberately NOT returning null on isSubmitting here. The previous
    // version unmounted the whole wizard subtree the instant setIsSubmitting
    // fired, then clearInspection() triggered a SECOND unmount when DashboardPage
    // swapped WizardLayout for Dashboard. Two unmount cascades in close succession
    // racing portal/modal teardowns produced `removeChild`/`insertBefore` errors
    // that the ErrorBoundary surfaced as the "Odśwież stronę" recovery screen.
    // We let DashboardPage handle the swap once currentJobId becomes null —
    // that's a single clean unmount React's reconciler handles cleanly.

    return (
        <div className="flex flex-col min-h-[100dvh] max-w-lg mx-auto bg-background overflow-x-hidden transition-colors duration-300">
            {/* ── Header ─────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-surface dark:bg-background/80 backdrop-blur-lg text-foreground px-4 pt-3 pb-2 shadow-lg transition-colors border-b border-border/50">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3 overflow-visible">
                        <Logo variant="icon" size="sm" />
                        <div>
                            <h2 className="text-sm font-bold tracking-tight text-foreground leading-tight">
                                {STEPS[currentStep - 1]?.label || 'Podsumowanie'}
                            </h2>
                            <p className="text-[10px] text-primary font-black uppercase tracking-widest">
                                Krok {currentStep} / {totalSteps}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="scale-90 origin-right">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => selectJob(null)}
                            className="p-1.5 hover:bg-surface-raised rounded-lg transition-colors text-muted hover:text-foreground"
                            title="Dashboard"
                        >
                            <Home size={18} />
                        </button>
                        <button
                            onClick={logout}
                            className="p-1.5 hover:bg-danger-light rounded-lg transition-colors text-danger/70 hover:text-danger"
                            title="Wyloguj"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>

                {/* Step Dots */}
                <div className="flex items-center gap-1 justify-between mb-2 overflow-x-auto py-1 no-scrollbar">
                    {STEPS.map((step) => (
                        <button
                            key={step.num}
                            onClick={() => goToStep(step.num)}
                            aria-label={`Go to step ${step.num}: ${step.label}`}
                            className={cn(
                                "step-dot",
                                step.num === currentStep && "active",
                                step.num < currentStep && "completed",
                                step.num > currentStep && "upcoming",
                                step.num > maxVisitedStep && step.num !== currentStep + 1 && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            {step.num}
                        </button>
                    ))}
                </div>

                <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
            </header>

            {/* ── Main Content ───────────────────────────────── */}
            <main ref={mainRef} className="flex-1 p-4 overflow-y-auto pb-28">
                {children}
            </main>

            {/* ── Bottom Navigation ──────────────────────────── */}
            <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto glass-card border-t border-border z-30 p-4 safe-area-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                <div className="flex gap-4">
                <button
                    onClick={prev}
                    disabled={currentStep === 1}
                    aria-label="Previous step"
                    className={cn(
                        "flex-1 py-5 px-6 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.95]",
                        currentStep === 1
                            ? "bg-muted/10 text-muted/30 cursor-not-allowed"
                            : "bg-surface border-2 border-border text-foreground hover:border-primary/50 shadow-sm"
                    )}
                >
                    <ChevronLeft size={20} className="stroke-[3]" />
                    Wstecz
                </button>

                {currentStep === totalSteps ? (
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || submitStatus === 'success' || photoQueueState.active > 0}
                        aria-label="Submit inspection"
                        className={`flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest text-white flex items-center justify-center gap-2 shadow-xl active:scale-[0.95] uppercase ${
                            isSubmitting ? 'bg-gray-400 cursor-wait' :
                            submitStatus === 'success' ? 'bg-green-500 cursor-default' :
                            photoQueueState.active > 0 ? 'bg-gray-400 cursor-not-allowed' :
                            photoQueueState.dead > 0 ? 'bg-amber-500' :
                            submitStatus === 'error' ? 'bg-red-500' :
                            'bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500'
                        }`}
                    >
                        {/* Stable DOM: both spans always mounted, CSS-toggled.
                            Conditional rendering swaps SVG↔div causing React insertBefore crash. */}
                        <span style={{display: isSubmitting ? 'none' : 'flex', alignItems: 'center', gap: '8px'}}>
                            <Send size={20} className="stroke-[3]" />
                            {submitStatus === 'success' ? '✅ Raport wysłany pomyślnie!' :
                             photoQueueState.active > 0 ? `⏳ Wysyłanie zdjęć (${photoQueueState.active})...` :
                             photoQueueState.dead > 0 ? `⚠️ WYŚLIJ (bez ${photoQueueState.dead} zdjęć)` :
                             submitStatus === 'error' ? '❌ Błąd — spróbuj ponownie' :
                             'WYŚLIJ RAPORT'}
                        </span>
                        <span style={{display: isSubmitting ? 'flex' : 'none', alignItems: 'center', gap: '8px'}}>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            WYSYŁANIE...
                        </span>
                    </button>
                ) : (
                    <button
                        onClick={next}
                        aria-label="Next step"
                        className="flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest bg-primary text-white flex items-center justify-center gap-2 shadow-xl shadow-primary/20 hover:bg-primary-hover active:scale-[0.95] uppercase ring-4 ring-primary/10"
                    >
                        Dalej
                        <ChevronRight size={20} className="stroke-[3]" />
                    </button>
                )}
                </div>

                {/* Validation error feedback (no dealId / no token / pending photos) */}
                {submitStatus === 'error' && submitError && (
                    <p className="mt-2 text-center text-xs text-red-600 font-medium">{submitError}</p>
                )}

                {/* Live photo upload progress (only on summary step, when relevant) */}
                {currentStep === totalSteps && (photoQueueState.active > 0 || photoQueueState.dead > 0) && (
                    <p className="mt-2 text-center text-xs font-medium">
                        {photoQueueState.active > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                                ⏳ {photoQueueState.active} {photoQueueState.active === 1 ? 'zdjęcie czeka' : 'zdjęć czeka'} na wysłanie
                            </span>
                        )}
                        {photoQueueState.dead > 0 && (
                            <span className="text-red-600 dark:text-red-400 ml-2">
                                ⚠️ {photoQueueState.dead} {photoQueueState.dead === 1 ? 'zdjęcie' : 'zdjęć'} nie wysłano — wróć do kroku 6 lub wyślij raport bez nich
                            </span>
                        )}
                    </p>
                )}
            </footer>
        </div>
    );
}
