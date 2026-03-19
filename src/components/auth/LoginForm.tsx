'use client';

import React, { useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { useRouter } from 'next/navigation';
import { Phone, Lock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const LoginForm: React.FC = () => {
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const loginStore = useInspectionStore((state) => state.login);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!phone || !pin) {
            setError('Wprowadź numer telefonu i PIN');
            return;
        }

        if (pin.length < 4) {
            setError('PIN musi mieć 4 cyfry');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, pin }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || 'Błąd logowania');
            }

            // Store in Zustand exactly like before
            const user = {
                id: String(data.inspector.id),
                email: data.inspector.email || '',
                name: data.inspector.name,
                phone: data.inspector.phone,
            };

            loginStore(user.email, data.access_token, user);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Błąd logowania. Spróbuj ponownie.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden transition-colors duration-300">
            {/* Global Theme Toggle */}
            <div className="absolute top-4 right-4 z-50">
                <ThemeToggle />
            </div>

            {/* Background Glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 dark:bg-primary/20 rounded-full blur-[120px] pointer-events-none transition-colors" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-warning/5 dark:bg-warning/10 rounded-full blur-[120px] pointer-events-none transition-colors" />

            <div className="w-full max-w-md relative">
                {/* Logo Section */}
                <div className="flex flex-col items-center space-y-4 mb-8 overflow-visible">
                    <div style={{
                        width: '220px',
                        height: 'auto',
                        overflow: 'visible',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <img
                            src="/images/logo.png"
                            alt="RZeczoznawcy"
                            style={{
                                width: '100%',
                                height: 'auto',
                                objectFit: 'contain',
                                display: 'block'
                            }}
                        />
                    </div>
                    <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] text-center opacity-80">
                        Vehicle Inspection System
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-3xl p-8 shadow-xl dark:shadow-2xl transition-colors">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-start gap-3 animate-shake">
                                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                                <p className="text-sm text-danger font-medium leading-relaxed">{error}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-foreground ml-1 transition-colors">
                                Numer telefonu
                            </label>
                            <div className="relative group">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted transition-colors group-focus-within:text-primary" />
                                <input
                                    type="tel"
                                    required
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="790469341"
                                    className="w-full bg-surface-raised border border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-foreground placeholder:text-muted/40 outline-none transition-all shadow-sm text-lg font-bold tracking-wide"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-foreground ml-1 transition-colors">
                                PIN
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted transition-colors group-focus-within:text-primary" />
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    required
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    placeholder="••••"
                                    maxLength={4}
                                    className="w-full bg-surface-raised border border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-foreground placeholder:text-muted/40 outline-none transition-all shadow-sm text-2xl font-bold tracking-[0.5em] text-center"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={cn(
                                "w-full py-4 rounded-2xl font-bold transition-all transform active:scale-[0.98]",
                                "bg-primary text-white shadow-lg shadow-primary/20",
                                "hover:bg-primary-hover hover:shadow-primary/40",
                                "disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                            )}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Logowanie...</span>
                                </>
                            ) : (
                                <span>Zaloguj się</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-muted">
                        <p className="text-sm">
                            Wymagane połączenie z internetem na start dnia.
                        </p>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="text-center mt-8 text-muted/60 text-xs font-medium tracking-widest uppercase">
                </div>
            </div>
        </div>
    );
};
