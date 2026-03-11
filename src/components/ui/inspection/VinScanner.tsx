"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { createWorker } from 'tesseract.js';
import { X, Camera, RefreshCw } from 'lucide-react';

interface VinScannerProps {
    onScan: (vin: string) => void;
    onClose: () => void;
}

export function VinScanner({ onScan, onClose }: VinScannerProps) {
    const webcamRef = useRef<Webcam>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('Nakieruj na VIN');

    const processImage = useCallback(async () => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                setIsProcessing(true);
                setStatus('Przetwarzanie...');
                try {
                    const worker = await createWorker('eng');
                    const { data: { text } } = await worker.recognize(imageSrc);

                    // Basic VIN regex (17 alphanumeric characters, excluding I, O, Q)
                    const vinMatch = text.replace(/[\s\n]/g, '').match(/[A-HJ-NPR-Z0-9]{17}/);

                    if (vinMatch) {
                        onScan(vinMatch[0]);
                        onClose();
                    } else {
                        setStatus('Nie znaleziono VIN. Spróbuj ponownie.');
                    }
                    await worker.terminate();
                } catch (err) {
                    console.error('OCR Error:', err);
                    setError('Błąd OCR. Spróbuj ponownie.');
                } finally {
                    setIsProcessing(false);
                }
            }
        }
    }, [onScan, onClose]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!isProcessing) {
                processImage();
            }
        }, 3000); // Try every 3 seconds
        return () => clearInterval(interval);
    }, [isProcessing, processImage]);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
            <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden border-2 border-primary">
                <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: "environment" }}
                    className="w-full h-full object-cover"
                />

                {/* Overlay box for VIN area */}
                <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none">
                    <div className="w-full h-full border-2 border-dashed border-white/80 rounded-lg" />
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="mt-6 text-center">
                <p className="text-white font-medium mb-4">{status}</p>
                {isProcessing && <RefreshCw className="animate-spin text-primary mx-auto" size={32} />}

                <button
                    onClick={processImage}
                    disabled={isProcessing}
                    className="bg-primary text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                    <Camera size={20} />
                    Skanuj Teraz
                </button>
            </div>

            {error && <p className="text-danger mt-4 text-sm">{error}</p>}
        </div>
    );
}
