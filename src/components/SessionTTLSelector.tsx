import { useState } from 'react';
import { Clock, Shield } from 'lucide-react';
import { TTL_OPTIONS, saveSessionTTL } from '../utils/session-preferences';

interface SessionTTLSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function SessionTTLSelector({ isOpen, onClose, onConfirm }: SessionTTLSelectorProps) {
    const [selectedTTL, setSelectedTTL] = useState<number | null>(null);

    const handleSelect = (minutes: number) => {
        setSelectedTTL(minutes);
    };

    const handleConfirm = () => {
        if (selectedTTL !== null) {
            saveSessionTTL(selectedTTL);
            onConfirm();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card p-8 max-w-3xl w-full mx-4 animate-fade-in">
                <div className="relative text-center mb-8">
                    {/* Close button removed for mandatory selection */}
                    <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--sui-blue)]/10">
                        <Shield className="w-8 h-8 text-[var(--sui-blue)]" />
                    </div>
                    <h2 className="text-3xl font-bold text-[var(--sui-text)] mb-2">
                        Choose Your Session Duration
                    </h2>
                    <p className="text-[var(--sui-text-secondary)] max-w-md mx-auto mb-4">
                        Select how long you want to stay signed in before requiring a new signature
                    </p>

                    {/* Session Explanation */}
                    <div className="max-w-lg mx-auto p-4 rounded-lg bg-[var(--sui-blue)]/5 border border-[var(--sui-blue)]/20">
                        <p className="text-sm text-[var(--sui-text)] leading-relaxed">
                            <span className="font-semibold text-[var(--sui-blue)]">What is a session?</span>
                            <br />
                            Sessions allow you to decrypt encrypted messages without signing every time.
                            Once your session expires, you'll need to sign again for security.
                        </p>
                    </div>
                </div>

                {/* TTL Options Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {TTL_OPTIONS.map((option) => {
                        const isRecommended = option.minutes === 60; // 1 hour
                        const isSelected = selectedTTL === option.minutes;

                        return (
                            <button
                                key={option.value}
                                onClick={() => handleSelect(option.minutes)}
                                className={`
                                    relative p-4 rounded-xl border-2 transition-all duration-200
                                    ${isSelected
                                        ? 'border-[var(--sui-blue)] bg-[var(--sui-blue)]/10 scale-105'
                                        : isRecommended
                                            ? 'border-[var(--sui-blue)]/50 bg-[var(--sui-blue)]/5 hover:border-[var(--sui-blue)] hover:scale-105'
                                            : 'border-[var(--sui-border)] hover:border-[var(--sui-blue)]/50 hover:scale-105'
                                    }
                                    ${isRecommended && !isSelected ? 'shadow-lg shadow-[var(--sui-blue)]/20' : ''}
                                `}
                            >
                                {/* Recommended Badge */}
                                {isRecommended && (
                                    <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[var(--sui-blue)] text-white text-xs font-semibold">
                                        ⭐
                                    </div>
                                )}

                                {/* Icon */}
                                <div className="flex justify-center mb-2">
                                    <Clock className={`w-6 h-6 ${isSelected || isRecommended ? 'text-[var(--sui-blue)]' : 'text-[var(--sui-text-secondary)]'}`} />
                                </div>

                                {/* Label */}
                                <div className="text-center">
                                    <div className={`font-bold text-lg ${isSelected || isRecommended ? 'text-[var(--sui-blue)]' : 'text-[var(--sui-text)]'}`}>
                                        {option.value}
                                    </div>
                                    <div className="text-xs text-[var(--sui-text-secondary)] mt-1">
                                        {option.description}
                                    </div>
                                </div>

                                {/* Selection indicator */}
                                {isSelected && (
                                    <div className="absolute inset-0 rounded-xl border-2 border-[var(--sui-blue)] animate-pulse pointer-events-none" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Info Banner */}
                <div className="p-4 rounded-lg bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)] mb-6">
                    <p className="text-sm text-[var(--sui-text-secondary)] text-center">
                        💡 <strong>Mandatory for security:</strong> You must choose a session duration to proceed. You can change this preference later in Settings.
                    </p>
                </div>

                {/* Confirm Button */}
                <button
                    onClick={handleConfirm}
                    disabled={selectedTTL === null}
                    className={`
                        w-full py-3 rounded-xl font-semibold text-lg transition-all duration-200
                        ${selectedTTL !== null
                            ? 'bg-[var(--sui-blue)] text-white shadow-lg shadow-[var(--sui-blue)]/25 hover:opacity-90 hover:scale-[1.02]'
                            : 'bg-[var(--sui-bg-tertiary)] text-[var(--sui-text-secondary)] cursor-not-allowed opacity-50'
                        }
                    `}
                >
                    Confirm Selection
                </button>
            </div>
        </div>
    );
}
