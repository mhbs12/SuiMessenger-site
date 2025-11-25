/**
 * Session TTL Preference Management
 * 
 * Manages user preferences for SEAL session timeout duration.
 * Preferences are stored in localStorage and must be set before creating a session.
 */

const STORAGE_KEY = 'seal_session_ttl_preference';

export interface TTLOption {
    label: string;
    minutes: number;
    value: string;
    description?: string;
}

/**
 * Available TTL options for session timeout
 */
export const TTL_OPTIONS: TTLOption[] = [
    {
        label: '1 minute',
        minutes: 1,
        value: '1m',
        description: 'For testing only'
    },
    {
        label: '10 minutes',
        minutes: 10,
        value: '10m',
        description: 'Quick sessions'
    },
    {
        label: '30 minutes',
        minutes: 30,
        value: '30m',
        description: 'Short sessions'
    },
    {
        label: '1 hour',
        minutes: 60,
        value: '1h',
        description: 'Recommended'
    },
    {
        label: '3 hours',
        minutes: 180,
        value: '3h',
        description: 'Extended sessions'
    },
    {
        label: '6 hours',
        minutes: 360,
        value: '6h',
        description: 'Long sessions'
    },
    {
        label: '12 hours',
        minutes: 720,
        value: '12h',
        description: 'Half day'
    },
    {
        label: '24 hours',
        minutes: 1440,
        value: '24h',
        description: 'Full day'
    }
];

/**
 * Checks if user has set a TTL preference
 */
export function hasSessionTTLPreference(): boolean {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored !== null && stored !== undefined && stored !== '';
    } catch (error) {
        console.error('[Session Preferences] Failed to check preference:', error);
        return false;
    }
}

/**
 * Gets the user's preferred session TTL in minutes
 * @throws Error if no preference is set (forces user selection)
 */
export function getSessionTTL(): number {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            throw new Error('No session TTL preference set. User must select a timeout duration.');
        }

        const minutes = parseInt(stored, 10);

        if (isNaN(minutes) || minutes <= 0) {
            throw new Error('Invalid session TTL preference stored.');
        }

        console.log(`[Session Preferences] Using TTL: ${minutes} minutes`);
        return minutes;
    } catch (error) {
        console.error('[Session Preferences] Failed to get preference:', error);
        throw error;
    }
}

/**
 * Saves the user's TTL preference
 * @param minutes - Session timeout duration in minutes
 */
export function saveSessionTTL(minutes: number): void {
    try {
        if (minutes <= 0) {
            throw new Error('TTL must be greater than 0');
        }

        // Validate that the minutes match one of our options
        const isValidOption = TTL_OPTIONS.some(option => option.minutes === minutes);
        if (!isValidOption) {
            console.warn('[Session Preferences] Saving non-standard TTL value:', minutes);
        }

        localStorage.setItem(STORAGE_KEY, minutes.toString());
        console.log(`[Session Preferences] Saved TTL: ${minutes} minutes`);
    } catch (error) {
        console.error('[Session Preferences] Failed to save preference:', error);
        throw error;
    }
}

/**
 * Clears the user's TTL preference
 */
export function clearSessionTTLPreference(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[Session Preferences] Cleared TTL preference');
    } catch (error) {
        console.error('[Session Preferences] Failed to clear preference:', error);
    }
}

/**
 * Gets the TTL option object for a given number of minutes
 */
export function getTTLOption(minutes: number): TTLOption | undefined {
    return TTL_OPTIONS.find(option => option.minutes === minutes);
}

/**
 * Gets the currently selected TTL option
 * @returns The TTL option object or undefined if not set
 */
export function getCurrentTTLOption(): TTLOption | undefined {
    try {
        if (!hasSessionTTLPreference()) {
            return undefined;
        }
        const minutes = getSessionTTL();
        return getTTLOption(minutes);
    } catch {
        return undefined;
    }
}
