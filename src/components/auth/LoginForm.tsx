'use client';

import React, { useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { apiClient } from '@/api/client';
import { Lock, Mail, Loader2, AlertCircle, CarFront } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

export const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loginStore = useInspectionStore((state) => state.login);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await apiClient.login(email, password);
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
                <div className="text-center mb-8 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary-hover shadow-xl shadow-primary/20 dark:shadow-primary/40 mb-4 transform hover:scale-105 transition-all duration-300">
                        <CarFront className="w-12 h-12 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight transition-colors">Auto Inspection</h1>
                    <p className="text-muted mt-2 font-medium transition-colors">Brama Appraisera — Zaloguj się</p>
                </div>

                {/* Form Card */}
                <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-3xl p-8 shadow-xl dark:shadow-2xl transition-colors">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-start gap-3 animate-shake">
                                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                                <p className="text-sm text-danger">{error}</p>
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
                    </form>

                    <div className="mt-8 text-center text-muted">
                        <p className="text-sm">
                            Wymagane połączenie z internetem na start dnia.
                        </p>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="text-center mt-8 text-muted/60 text-xs font-medium tracking-widest uppercase">
                    v1.0 Anti-Oops Architecture
                </div>
            </div>
        </div>
    );
};
