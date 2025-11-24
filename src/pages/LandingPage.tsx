import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Zap, Lock, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function LandingPage() {
    const account = useCurrentAccount();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        if (account) {
            navigate('/chat');
        }
    }, [account, navigate]);

    return (
        <div className="min-h-screen relative overflow-hidden bg-[var(--sui-bg)] transition-colors duration-300">
            {/* Theme Toggle */}
            <div className="absolute top-6 right-6 z-50">
                <button
                    onClick={toggleTheme}
                    className="p-3 rounded-full bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)] text-[var(--sui-text)] hover:border-[var(--sui-blue)] transition-all shadow-lg"
                    title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                >
                    {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
                </button>
            </div>

            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--sui-bg)] via-[var(--sui-bg-secondary)] to-[var(--sui-bg)] opacity-50">
                <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--sui-blue)] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
                <div className="absolute top-40 right-10 w-72 h-72 bg-[var(--sui-purple)] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse delay-1000"></div>
                <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-[var(--sui-cyan)] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse delay-2000"></div>
            </div>

            {/* Content */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
                <div className="max-w-2xl w-full text-center space-y-8">
                    {/* Logo & Title */}
                    <div className="space-y-4">
                        <div className="inline-flex items-center justify-center w-32 h-32 mx-auto">
                            <img src="/logo.png" alt="Sui Messenger Logo" className="w-full h-full object-contain drop-shadow-2xl" />
                        </div>

                        <h1 className="text-6xl font-bold">
                            <span className="sui-gradient-text">Sui Messenger</span>
                        </h1>

                        <p className="text-xl text-[var(--sui-text-secondary)] max-w-lg mx-auto">
                            Secure, decentralized messaging powered by Sui blockchain and Walrus storage
                        </p>
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
                        <div className="glass-card p-6 hover:scale-105 transition-transform duration-200">
                            <Shield className="w-8 h-8 text-[var(--sui-blue)] mx-auto mb-3" />
                            <h3 className="text-[var(--sui-text)] font-semibold mb-2">End-to-End Encrypted</h3>
                            <p className="text-sm text-[var(--sui-text-secondary)]">Messages secured with SEAL encryption</p>
                        </div>

                        <div className="glass-card p-6 hover:scale-105 transition-transform duration-200">
                            <Zap className="w-8 h-8 text-[var(--sui-cyan)] mx-auto mb-3" />
                            <h3 className="text-[var(--sui-text)] font-semibold mb-2">Lightning Fast</h3>
                            <p className="text-sm text-[var(--sui-text-secondary)]">Built on Sui's high-performance network</p>
                        </div>

                        <div className="glass-card p-6 hover:scale-105 transition-transform duration-200">
                            <Lock className="w-8 h-8 text-[var(--sui-purple)] mx-auto mb-3" />
                            <h3 className="text-[var(--sui-text)] font-semibold mb-2">Decentralized Storage</h3>
                            <p className="text-sm text-[var(--sui-text-secondary)]">Messages stored on Walrus network</p>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-12 space-y-4">
                        <ConnectButton className="sui-button !px-8 !py-4 !text-lg !font-bold !rounded-2xl shadow-2xl" />
                        <p className="text-sm text-[var(--sui-text-secondary)]">
                            Connect your Sui wallet to start messaging
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-8 text-center">
                    <p className="text-xs text-[var(--sui-text-secondary)]">
                        Powered by <span className="text-[var(--sui-blue)]">Sui</span> • <span className="text-[var(--sui-blue)]">Walrus</span> • <span className="text-[var(--sui-blue)]">SEAL</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
