'use client';

import React, { useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { apiClient } from '@/api/client';
import { Lock, Mail, Loader2, AlertCircle, CarFront } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-md relative">
                {/* Logo Section */}
                <div className="text-center mb-8 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-xl shadow-blue-900/40 mb-4 transform hover:scale-105 transition-transform duration-300">
                        <CarFront className="w-12 h-12 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Auto Inspection</h1>
                    <p className="text-slate-400 mt-2 font-medium">Brama Appraisera — Zaloguj się</p>
                </div>

                {/* Form Card */}
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 animate-shake">
                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-200">{error}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-300 ml-1">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="marek@firma.pl"
                                    className="w-full bg-slate-950/50 border border-slate-700/50 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-600 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-300 ml-1">Hasło</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-950/50 border border-slate-700/50 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-600 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={cn(
                                "w-full py-4 rounded-2xl font-bold transition-all transform active:scale-[0.98]",
                                "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/20",
                                "hover:from-blue-500 hover:to-blue-600 hover:shadow-blue-500/20",
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

                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-500">
                            Wymagane połączenie z internetem na start dnia.
                        </p>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="text-center mt-8 text-slate-600 text-xs font-medium tracking-widest uppercase">
                    v1.0 Anti-Oops Architecture
                </div>
            </div>
        </div>
    );
};
