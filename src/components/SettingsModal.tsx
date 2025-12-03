import { useState } from 'react';
import { Clock, X, Power, AlertTriangle } from 'lucide-react';
import { TTL_OPTIONS, saveSessionTTL, getCurrentTTLOption } from '../utils/session-preferences';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEndSession: () => void;
}

export function SettingsModal({ isOpen, onClose, onEndSession }: SettingsModalProps) {
    const currentOption = getCurrentTTLOption();
    const [selectedTTL, setSelectedTTL] = useState<number>(currentOption?.minutes || 30);
    const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);

    if (!isOpen) return null;

    const hasChanged = selectedTTL !== currentOption?.minutes;

    const handleSave = () => {
        if (hasChanged) {
            saveSessionTTL(selectedTTL);
        }
        onClose();
    };

    const handleEndSession = () => {
        setShowEndSessionConfirm(false);
        onEndSession();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card p-6 max-w-2xl w-full mx-4 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--sui-blue)]/10 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-[var(--sui-blue)]" />
                        </div>
                        <h2 className="text-2xl font-bold text-[var(--sui-text)]">
                            Session Settings
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-[var(--sui-bg-secondary)] transition-colors"
                    >
                        <X className="w-5 h-5 text-[var(--sui-text-secondary)]" />
                    </button>
                </div>

                {/* Current Session Info */}
                <div className="mb-6 p-4 rounded-lg bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)]">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-[var(--sui-text-secondary)] mb-1">Current Session Timeout</p>
                            <p className="text-lg font-semibold text-[var(--sui-text)]">
                                {currentOption?.label || 'Not set'}
                            </p>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-[var(--sui-blue)]/10 text-[var(--sui-blue)] text-sm font-medium">
                            Active
                        </div>
                    </div>
                </div>

                {/* Session Explanation */}
                <div className="mb-6 p-4 rounded-lg bg-[var(--sui-blue)]/5 border border-[var(--sui-blue)]/20">
                    <p className="text-sm text-[var(--sui-text)] leading-relaxed">
                        <span className="font-semibold text-[var(--sui-blue)]">💡 About Sessions</span>
                        <br />
                        Sessions allow you to decrypt encrypted messages without signing every time.
                        Longer sessions are more convenient, but require re-authentication less frequently for security.
                    </p>
                </div>

                {/* TTL Options */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-[var(--sui-text)] mb-3">
                        Choose New Timeout Duration
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {TTL_OPTIONS.map((option) => {
                            const isSelected = selectedTTL === option.minutes;
                            const isCurrent = currentOption?.minutes === option.minutes;

                            return (
                                <button
                                    key={option.value}
                                    onClick={() => setSelectedTTL(option.minutes)}
                                    className={`
                                        relative p-3 rounded-lg border-2 transition-all duration-200
                                        ${isSelected
                                            ? 'border-[var(--sui-blue)] bg-[var(--sui-blue)]/10'
                                            : isCurrent
                                                ? 'border-[var(--sui-blue)]/30 bg-[var(--sui-blue)]/5'
                                                : 'border-[var(--sui-border)] hover:border-[var(--sui-blue)]/50'
                                        }
                                        hover:scale-105
                                    `}
                                >
                                    {/* Current indicator */}
                                    {isCurrent && !isSelected && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--sui-blue)]" />
                                    )}

                                    <div className="text-center">
                                        <div className={`font-bold ${isSelected ? 'text-[var(--sui-blue)]' : 'text-[var(--sui-text)]'}`}>
                                            {option.value}
                                        </div>
                                        <div className="text-xs text-[var(--sui-text-secondary)] mt-0.5">
                                            {option.description}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Info Banner */}
                {hasChanged && (
                    <div className="mb-6 p-3 rounded-lg bg-[var(--sui-cyan)]/10 border border-[var(--sui-cyan)]/30">
                        <p className="text-sm text-[var(--sui-text-secondary)] text-center">
                            ℹ️ Changes will apply to your next session. End your current session to use the new timeout immediately.
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleSave}
                        className="flex-1 sui-button px-4 py-2.5 rounded-lg font-semibold"
                    >
                        {hasChanged ? 'Save Changes' : 'Close'}
                    </button>
                    <button
                        onClick={() => setShowEndSessionConfirm(true)}
                        className="px-4 py-2.5 rounded-lg font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors flex items-center gap-2"
                    >
                        <Power className="w-4 h-4" />
                        End Session
                    </button>
                </div>

                {/* End Session Confirmation */}
                {showEndSessionConfirm && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl">
                        <div className="glass-card p-6 max-w-sm mx-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--sui-text)]">
                                    End Current Session?
                                </h3>
                            </div>
                            <p className="text-sm text-[var(--sui-text-secondary)] mb-6">
                                You'll need to sign a new message to create a new session.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowEndSessionConfirm(false)}
                                    className="flex-1 px-4 py-2 rounded-lg border border-[var(--sui-border)] hover:bg-[var(--sui-bg-secondary)] text-[var(--sui-text)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEndSession}
                                    className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors"
                                >
                                    End Session
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
