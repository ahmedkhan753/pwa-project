'use client';

import React, { useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { api } from '@/lib/api';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/theme-toggle';

export const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    
    // Auto-fill in demo mode
    React.useEffect(() => {
        if (DEMO_MODE) {
            setEmail("demo@zaufajrzeczoznawcy.pl");
            setPassword("demo2024");
        }
    }, [DEMO_MODE]);

    const loginStore = useInspectionStore((state) => state.login);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.login(email, password);
            loginStore(response.user.email, response.token, response.user);
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
                <div className="flex flex-col items-center space-y-4 mb-8">
                    <Logo variant="full" size="lg" />
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
                            <label className="text-sm font-semibold text-foreground ml-1 transition-colors">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted transition-colors group-focus-within:text-primary" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="marek@firma.pl"
                                    className="w-full bg-surface-raised border border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-foreground placeholder:text-muted/40 outline-none transition-all shadow-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-foreground ml-1 transition-colors">Hasło</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted transition-colors group-focus-within:text-primary" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-surface-raised border border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-foreground placeholder:text-muted/40 outline-none transition-all shadow-sm"
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

                        {DEMO_MODE && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEmail("demo@zaufajrzeczoznawcy.pl");
                                    setPassword("demo2024");
                                    // Submit after a small delay to show filling
                                    setTimeout(() => {
                                        const form = document.querySelector('form');
                                        form?.requestSubmit();
                                    }, 100);
                                }}
                                className="w-full py-3 bg-surface-raised border border-border rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-all text-center"
                            >
                                Zaloguj jako Demo
                            </button>
                        )}
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
