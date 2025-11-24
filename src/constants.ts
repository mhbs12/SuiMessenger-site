// All configuration is now loaded from environment variables (.env file)

// Contract Package ID
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;

// ChatRegistry Shared Object ID
export const CHAT_REGISTRY_ID = import.meta.env.VITE_CHAT_REGISTRY_ID;

// Network Configuration
export const NETWORK = import.meta.env.VITE_SUI_NETWORK;

export const SUI_NETWORKS = {
    testnet: { url: 'https://fullnode.testnet.sui.io:443' },
    mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
};

// ==================== SEAL CONFIGURATION ====================

/**
 * SEAL Key Server Configuration

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
export const SEAL_THRESHOLD = parseInt(import.meta.env.VITE_SEAL_THRESHOLD);

/**
 * Session Key TTL in minutes
 * Users sign once and can decrypt for this duration without re-signing
 */
export const SEAL_SESSION_TTL_MINUTES = parseInt(import.meta.env.VITE_SEAL_SESSION_TTL_MINUTES);

// ==================== TOKEN CONFIGURATION ====================

export const WAL_COIN_TYPE = {
    testnet: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    mainnet: '0x55c9c4ebef40d9a3ca3ec1579e5cdc41c30e6817d25584a08a25aabfb6b5e3bd::wal::WAL'
};
