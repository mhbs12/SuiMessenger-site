export const NETWORK = import.meta.env.VITE_SUI_NETWORK as keyof typeof SUI_NETWORKS || 'testnet';
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;
export const CHAT_REGISTRY_ID = import.meta.env.VITE_CHAT_REGISTRY_ID || '';

export const SUI_NETWORKS = {
    testnet: { url: 'https://fullnode.testnet.sui.io:443' },
    mainnet: { url: 'https://fullnode.mainnet.sui.io:443' },
};
