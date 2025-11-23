import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { SessionKey } from '@mysten/seal';

interface UseSealSessionReturn {
    sessionKey: SessionKey | null;
    isReady: boolean;
    error: string | null;
    refresh: () => void;
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
    const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadSession = () => {
        if (!account) {
            setSessionKey(null);
            setIsReady(false);
            return;
        }

        try {
            setError(null);

            // Try to load from localStorage
            const stored = localStorage.getItem(SESSION_STORAGE_KEY);
            if (stored) {
                const exportedSession = JSON.parse(stored);

                // Note: SessionKey.import() requires a SuiClient, but we're skipping it
                // since we just want to check expiry. If needed for decryption, refresh.
                try {
                    const parsedSession = SessionKey.import(exportedSession, null as any);

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
                    console.warn('[SEAL Session] Failed to import, clearing');
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                    setSessionKey(null);
                    setIsReady(false);
                }
            } else {
                // No session found
                setSessionKey(null);
                setIsReady(false);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load SEAL session';
            setError(errorMessage);
            setIsReady(false);
            console.error('[SEAL Session] Load error:', err);
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
        error,
        refresh,
    };
}

/**
 * Helper function to manually set a session key (after wallet signature)
 */
export function setSealSession(sessionKey: SessionKey): void {
    try {
        const exported = sessionKey.export();
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(exported));
        console.log('[SEAL Session] Session saved to localStorage');
    } catch (error) {
        console.error('[SEAL Session] Failed to save session:', error);
    }
}

/**
 * Helper function to clear the session
 */
export function clearSealSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('[SEAL Session] Session cleared');
}
