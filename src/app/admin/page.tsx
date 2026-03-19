'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, KeyRound, Shield, Users, ArrowLeft, Eye, EyeOff } from 'lucide-react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Inspector {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    is_active: boolean;
}

export default function AdminPage() {
    const [adminToken, setAdminToken] = useState<string | null>(null);
    const [adminPassword, setAdminPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    const [inspectors, setInspectors] = useState<Inspector[]>([]);
    const [loading, setLoading] = useState(false);

    // Form state
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newPin, setNewPin] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // PIN reset state
    const [resetId, setResetId] = useState<number | null>(null);
    const [resetPin, setResetPin] = useState('');

    const [showPassword, setShowPassword] = useState(false);

    const router = useRouter();

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
    });

    // Admin login
    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError('');

        try {
            const res = await fetch(`${BASE_URL}/auth/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Invalid password');
            setAdminToken(data.access_token);
        } catch (err: any) {
            setLoginError(err.message);
        } finally {
            setLoginLoading(false);
        }
    };

    // Fetch inspectors
    const fetchInspectors = async () => {
        if (!adminToken) return;
        setLoading(true);
        try {
            const res = await fetch(`${BASE_URL}/admin/inspectors`, {
                headers: authHeaders(),
            });
            const data = await res.json();
            setInspectors(data);
        } catch (err) {
            console.error('Failed to fetch inspectors:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (adminToken) fetchInspectors();
    }, [adminToken]);

    // Create inspector
    const handleCreateInspector = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        if (!newName || !newPhone || !newPin) {
            setFormError('Name, phone, and PIN are required');
            return;
        }
        if (newPin.length !== 4) {
            setFormError('PIN must be 4 digits');
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/admin/inspectors`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    name: newName,
                    phone: newPhone,
                    pin: newPin,
                    email: newEmail || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail);

            setFormSuccess(`Inspector "${newName}" created successfully`);
            setNewName('');
            setNewPhone('');
            setNewPin('');
            setNewEmail('');
            fetchInspectors();
        } catch (err: any) {
            setFormError(err.message);
        }
    };

    // Reset PIN
    const handleResetPin = async (inspectorId: number) => {
        if (!resetPin || resetPin.length !== 4) {
            alert('PIN must be 4 digits');
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/admin/inspectors/${inspectorId}/pin`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ pin: resetPin }),
            });
            if (!res.ok) throw new Error('Failed to reset PIN');
            setResetId(null);
            setResetPin('');
            alert('PIN reset successfully');
        } catch (err: any) {
            alert(err.message);
        }
    };

    // Deactivate inspector
    const handleDeactivate = async (inspectorId: number, name: string) => {
        if (!confirm(`Deactivate inspector "${name}"?`)) return;

        try {
            const res = await fetch(`${BASE_URL}/admin/inspectors/${inspectorId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error('Failed to deactivate');
            fetchInspectors();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // Admin Login Screen
    if (!adminToken) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="w-full max-w-sm">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
                        <p className="text-muted text-sm mt-1">Enter admin password to manage inspectors</p>
                    </div>

                    <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-3xl p-8 shadow-xl">
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            {loginError && (
                                <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-sm text-danger font-medium text-center">
                                    {loginError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground ml-1">
                                    Admin Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={adminPassword}
                                        onChange={(e) => setAdminPassword(e.target.value)}
                                        placeholder="Enter admin password"
                                        className="w-full bg-surface-raised border border-border rounded-2xl py-3 px-4 pr-12 text-foreground outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="w-full py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
                            >
                                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                                {loginLoading ? 'Verifying...' : 'Login as Admin'}
                            </button>
                        </form>

                        <button
                            onClick={() => router.push('/')}
                            className="w-full mt-4 py-2 text-muted text-sm hover:text-foreground flex items-center justify-center gap-2 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Admin Dashboard
    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">Inspector Management</h1>
                            <p className="text-xs text-muted">{inspectors.length} inspectors registered</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setAdminToken(null);
                            router.push('/');
                        }}
                        className="text-sm text-muted hover:text-danger flex items-center gap-1 transition-colors"
                    >
                        Logout
                    </button>
                </div>

                {/* Add Inspector Form */}
                <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl p-6 mb-6 shadow-lg">
                    <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        Add New Inspector
                    </h2>

                    {formError && (
                        <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-sm text-danger mb-4">
                            {formError}
                        </div>
                    )}
                    {formSuccess && (
                        <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-sm text-success mb-4">
                            {formSuccess}
                        </div>
                    )}

                    <form onSubmit={handleCreateInspector} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                                Full Name *
                            </label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Jan Kowalski"
                                className="w-full bg-surface-raised border border-border rounded-xl py-2.5 px-3 text-foreground outline-none focus:border-primary/50 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                                Phone Number *
                            </label>
                            <input
                                type="tel"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                                placeholder="790469341"
                                className="w-full bg-surface-raised border border-border rounded-xl py-2.5 px-3 text-foreground outline-none focus:border-primary/50 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                                PIN (4 digits) *
                            </label>
                            <input
                                type="password"
                                inputMode="numeric"
                                value={newPin}
                                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                placeholder="••••"
                                maxLength={4}
                                className="w-full bg-surface-raised border border-border rounded-xl py-2.5 px-3 text-foreground outline-none focus:border-primary/50 text-sm tracking-widest"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                                Email (optional)
                            </label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="jan@firma.pl"
                                className="w-full bg-surface-raised border border-border rounded-xl py-2.5 px-3 text-foreground outline-none focus:border-primary/50 text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <button
                                type="submit"
                                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Inspector
                            </button>
                        </div>
                    </form>
                </div>

                {/* Inspector List */}
                <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-border">
                        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            All Inspectors
                        </h2>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : inspectors.length === 0 ? (
                        <div className="text-center py-12 text-muted">
                            No inspectors found
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {inspectors.map((inspector) => (
                                <div
                                    key={inspector.id}
                                    className={`p-4 flex items-center justify-between ${
                                        !inspector.is_active ? 'opacity-40' : ''
                                    }`}
                                >
                                    <div>
                                        <p className="font-bold text-foreground">{inspector.name}</p>
                                        <p className="text-sm text-muted">
                                            📞 {inspector.phone}
                                            {inspector.email && ` · ✉️ ${inspector.email}`}
                                        </p>
                                        {!inspector.is_active && (
                                            <span className="text-xs text-danger font-bold">DEACTIVATED</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {/* PIN Reset */}
                                        {resetId === inspector.id ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="password"
                                                    inputMode="numeric"
                                                    value={resetPin}
                                                    onChange={(e) => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                    placeholder="New PIN"
                                                    maxLength={4}
                                                    className="w-20 bg-surface-raised border border-border rounded-lg py-1.5 px-2 text-sm text-center tracking-widest outline-none focus:border-primary/50"
                                                />
                                                <button
                                                    onClick={() => handleResetPin(inspector.id)}
                                                    className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-bold hover:bg-primary-hover"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => { setResetId(null); setResetPin(''); }}
                                                    className="text-xs text-muted hover:text-foreground"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setResetId(inspector.id)}
                                                className="text-xs text-muted hover:text-primary flex items-center gap-1 transition-colors"
                                                title="Reset PIN"
                                            >
                                                <KeyRound className="w-4 h-4" />
                                            </button>
                                        )}

                                        {inspector.is_active && (
                                            <button
                                                onClick={() => handleDeactivate(inspector.id, inspector.name)}
                                                className="text-xs text-muted hover:text-danger flex items-center gap-1 transition-colors"
                                                title="Deactivate"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
