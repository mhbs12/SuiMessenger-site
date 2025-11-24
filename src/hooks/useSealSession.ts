import { useState, useEffect } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { SessionKey } from '@mysten/seal';
import { getSealCompatibleClient } from '../utils/crypto';

interface UseSealSessionReturn {
    sessionKey: SessionKey | null;
    isReady: boolean;
    isLoading: boolean;
    error: string | null;
    refresh: () => void;
    saveSession: (key: SessionKey) => void;
}

const SESSION_STORAGE_KEY = 'seal_session_data';

/**
 * Custom hook for managing SEAL session keys.
 * Handles initialization, persistence, and automatic refresh.
 * 
 * Note: This hook only loads persisted sessions. To create a new session,
 * use createSealSession() and then manually set it via setSealSession().
 */
export function useSealSession(): UseSealSessionReturn {
    const account = useCurrentAccount();
    const suiClient = useSuiClient(); // Get client from context
    const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadSession = () => {
        console.log('[SEAL Hook] loadSession called');
        setIsLoading(true);
        if (!account) {
            console.log('[SEAL Hook] No account, clearing session');
            setSessionKey(null);
            setIsReady(false);
            setIsLoading(false);
            return;
        }

        try {
            setError(null);

            // Try to load from localStorage
            const stored = localStorage.getItem(SESSION_STORAGE_KEY);
            if (stored) {
                console.log('[SEAL Hook] Found stored session');
                // We serialized BigInts as strings, but SessionKey.import might expect BigInts?
                // Let's try parsing normally first. If it fails, we might need a reviver.
                // Actually, let's just parse it.
                const exportedSession = JSON.parse(stored);
                console.log('[SEAL Hook] Parsed session from storage:', {
                    hasAddress: !!exportedSession.address,
                    hasSignature: !!exportedSession.personalMessageSignature,
                    signatureLength: exportedSession.personalMessageSignature?.length
                });

                // Note: SessionKey.import() requires a SEAL-compatible client
                try {
                    const sealClient = getSealCompatibleClient();
                    const parsedSession = SessionKey.import(exportedSession, sealClient);

                    // Check if expired
                    if (parsedSession.isExpired()) {
                        console.warn('[SEAL Session] Session expired, clearing');
                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setSessionKey(null);
                        setIsReady(false);
                        setError('Session expired. Please create a new session.');
                    } else {
                        setSessionKey(parsedSession);
                        setIsReady(true);
                        console.log('[SEAL Session] Loaded from localStorage');
                    }
                } catch (importError) {
                    console.warn('[SEAL Session] Failed to import, clearing', importError);
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                    setSessionKey(null);
                    setIsReady(false);
                }
            } else {
                // No session found
                console.log('[SEAL Hook] No stored session found');
                setSessionKey(null);
                setIsReady(false);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load SEAL session';
            setError(errorMessage);
            setIsReady(false);
            console.error('[SEAL Session] Load error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const saveSession = (key: SessionKey) => {
        console.log('[SEAL Hook] saveSession called');
        try {
            const exported = key.export();

            // SEAL explicitly adds a throwing toJSON property to prevent accidental serialization.
            // We need to clone the object to remove this property so we can save it to localStorage.
            const serializable = {
                address: exported.address,
                packageId: exported.packageId,
                mvrName: exported.mvrName,
                creationTimeMs: exported.creationTimeMs,
                ttlMin: exported.ttlMin,
                personalMessageSignature: exported.personalMessageSignature,
                sessionKey: exported.sessionKey
            };

            const serialized = JSON.stringify(serializable, (_, v) =>
                typeof v === 'bigint' ? v.toString() : v
            );
            localStorage.setItem(SESSION_STORAGE_KEY, serialized);
            console.log('[SEAL Session] Session saved to localStorage');

            // Update state immediately
            setSessionKey(key);
            setIsReady(true);
            console.log('[SEAL Hook] State updated with new key');
        } catch (error) {
            console.error('[SEAL Session] Failed to save session:', error);
        }
    };

    const refresh = () => {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setSessionKey(null);
        setIsReady(false);
        setError(null);
        loadSession();
    };

    useEffect(() => {
        loadSession();
    }, [account?.address]);

    return {
        sessionKey,
        isReady,
        isLoading,
        error,
        refresh,
        saveSession, // Expose this
    };
}

/**
 * Helper function to clear the session
 */
export function clearSealSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('[SEAL Session] Session cleared');
}
