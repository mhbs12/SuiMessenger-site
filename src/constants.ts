// All configuration is now loaded from environment variables (.env file)

// Contract Package ID
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;

// ChatRegistry Shared Object ID
export const CHAT_REGISTRY_ID = import.meta.env.VITE_CHAT_REGISTRY_ID;

// Network Configuration
export const NETWORK = import.meta.env.VITE_SUI_NETWORK || 'testnet';

export const SUI_NETWORKS = {
    testnet: { url: 'https://fullnode.testnet.sui.io:443' },
    mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
};

// ==================== SEAL CONFIGURATION ====================

/**
 * SEAL Key Server Configuration
 * These are verified key servers from MystenLabs
 * Source: https://seal-docs.wal.app/Pricing/#verified-key-servers
 */
export const SEAL_KEY_SERVERS_TESTNET = [
    {
        objectId: import.meta.env.VITE_SEAL_KEY_SERVER_1,
        weight: 1,
    },
    {
        objectId: import.meta.env.VITE_SEAL_KEY_SERVER_2,
        weight: 1,
    },
];

/**
 * SEAL Threshold: Number of key servers required to decrypt
 * With 2 servers and threshold 2, both must approve
 */
export const SEAL_THRESHOLD = parseInt(import.meta.env.VITE_SEAL_THRESHOLD || '2');

/**
 * Session Key TTL in minutes
 * Users sign once and can decrypt for this duration without re-signing
 */
export const SEAL_SESSION_TTL_MINUTES = parseInt(import.meta.env.VITE_SEAL_SESSION_TTL_MINUTES || '10');
