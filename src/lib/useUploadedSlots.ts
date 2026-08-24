"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInspectionStore } from "@/store/useInspectionStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Which photo/video slots the backend already holds bytes for.
 *
 * WHY THIS IS SHARED: the persist layer strips `photo.base64` on write
 * (iOS memory fix), so after a reload a slot that is safely in the DB looks
 * empty in Zustand. `/files/list/{dealId}` is the only signal that it is
 * actually filled, and more than one step needs that answer — PhotosStep for
 * its counters/thumbnails, ValidationStep for the "brak wymaganych zdjęć"
 * list. Only one step is mounted at a time (see StepDispatcher), so this
 * cannot live as local state in PhotosStep and be read elsewhere.
 *
 * `loaded` is false until the fetch settles (ok, failed, or skipped for a
 * missing deal/token) — callers gate their counters on it so a reload never
 * flashes already-uploaded slots as missing.
 *
 * `enabled` lets a component that is mounted but not visible (a closed modal)
 * skip the request until it actually needs the answer; flipping it to true
 * fetches then, so the list is fresh at the moment it's read rather than
 * whenever the parent happened to mount.
 */
export function useUploadedSlots(enabled: boolean = true) {
    const dealId = useInspectionStore((s) => s.jobs.currentJobId);
    const token = useInspectionStore((s) => s.auth.token);

    const [uploadedSlots, setUploadedSlots] = useState<Set<string>>(new Set());
    const [loaded, setLoaded] = useState(false);

    // Sequence guard: a response that arrives after the deal/token changed
    // (or after a newer refresh started) must not overwrite fresher state.
    const seqRef = useRef(0);

    const refresh = useCallback(async () => {
        // Disabled → nothing has been checked, so `loaded` stays false and the
        // caller keeps showing its "checking" state instead of a verdict.
        if (!enabled) return;
        const seq = ++seqRef.current;
        // No deal/token → nothing to fetch; local base64 is the only truth,
        // so treat the "server list" as resolved immediately (empty).
        if (!dealId || !token) { setLoaded(true); return; }
        try {
            const res = await fetch(`${API_URL}/files/list/${dealId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (seq !== seqRef.current) return;
            if (res.ok) {
                const json = await res.json();
                setUploadedSlots(new Set<string>(json.uploaded_slots || []));
            }
        } catch {
            // network error — non-fatal, slots will just show as empty
        } finally {
            // Whether it succeeded, failed, or errored, the fetch has settled.
            if (seq === seqRef.current) setLoaded(true);
        }
    }, [enabled, dealId, token]);

    // `refresh` only changes identity when enabled/dealId/token change, so this
    // is a mount + open + deal-switch effect — not a per-render fetch.
    useEffect(() => {
        setLoaded(false);
        setUploadedSlots(new Set());
        void refresh();
    }, [refresh]);

    return { uploadedSlots, setUploadedSlots, loaded, refresh };
}
