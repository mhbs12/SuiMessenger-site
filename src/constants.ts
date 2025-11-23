export const NETWORK = import.meta.env.VITE_SUI_NETWORK as keyof typeof SUI_NETWORKS || 'testnet';
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;
export const CHAT_REGISTRY_ID = import.meta.env.VITE_CHAT_REGISTRY_ID;

export const SUI_NETWORKS = {
    testnet: { url: 'https://fullnode.testnet.sui.io:443' },
    mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
};

// ==================== SEAL CONFIGURATION ====================

/**
 * SEAL Key Server Configuration for Testnet
 * These are verified key servers from MystenLabs
 * Source: https://seal-docs.wal.app/Pricing/#verified-key-servers
 */
export const SEAL_KEY_SERVERS_TESTNET = [
    {
        objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
        weight: 1,
    },
    {
        objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
        weight: 1,
    },
];

/**
 * SEAL Threshold: Number of key servers required to decrypt
 * With 2 servers and threshold 2, both must approve
 */
export const SEAL_THRESHOLD = 2;

/**
 * Session Key TTL in minutes
 * Users sign once and can decrypt for this duration without re-signing
 */
export const SEAL_SESSION_TTL_MINUTES = 10;
