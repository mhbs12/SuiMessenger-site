const NETWORK = import.meta.env.VITE_SUI_NETWORK || 'testnet';

// Lista de aggregators para redundância
const AGGREGATORS = {
    testnet: [
        'https://aggregator.walrus-testnet.walrus.space',
        'https://walrus-testnet-aggregator.nodes.guru',
        'https://walrus-testnet-aggregator.everstake.one',
        'https://walrus-testnet-aggregator.stakin-nodes.com'
    ],
    mainnet: [
        'https://aggregator.walrus-mainnet.walrus.space',
        'https://walrus-mainnet-aggregator.everstake.one',
        'https://walrus-aggregator.stakin-nodes.com',
        'https://wal-aggregator-mainnet.staketab.org'
    ]
};

const PUBLISHERS = {
    testnet: 'https://publisher.walrus-testnet.walrus.space',
    mainnet: 'https://publisher.walrus-mainnet.walrus.space'
};

const config = {
    publisher: PUBLISHERS[NETWORK as keyof typeof PUBLISHERS] || PUBLISHERS.testnet,
    aggregators: AGGREGATORS[NETWORK as keyof typeof AGGREGATORS] || AGGREGATORS.testnet
};

/**
 * Uploads content to Walrus and returns the Blob ID.
 */
export async function uploadToWalrus(content: string, epochs: number = 1): Promise<{ blobId: string; info: any }> {
    try {
        console.log(`Uploading to Walrus (${NETWORK})...`);

        // Convert content to Blob
        const blob = new Blob([content], { type: 'text/plain' });

        // Add timeout to prevent hanging uploads
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for upload

        // Upload to Walrus (store for 5 epochs)
        const response = await fetch(`${config.publisher}/v1/blobs?epochs=${epochs}`, {
            method: 'PUT',
            body: blob,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Walrus upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Walrus upload response:', result);

        // Extract blob ID from response
        const info = result.newlyCreated || result.alreadyCertified;
        if (!info || !info.blobObject || !info.blobObject.blobId) {
            throw new Error('Invalid response from Walrus: ' + JSON.stringify(result));
        }

        const blobId = info.blobObject.blobId;

        // Cache local para o remetente
        try {
            localStorage.setItem(`walrus_cache_${blobId}`, content);
        } catch (e) {
            console.warn('Failed to cache to localStorage:', e);
        }

        return { blobId, info };
    } catch (error: any) {
        console.error('Error uploading to Walrus:', error);

        // Mensagem mais clara para timeout
        if (error.name === 'AbortError') {
            throw new Error('Walrus upload timeout - network might be slow. Please try again.');
        }

        throw error;
    }
}

/**
 * Downloads content from Walrus using the Blob ID.
 * Tries multiple aggregators and local cache.
 */
export async function downloadFromWalrus(blobId: string): Promise<string> {
    // 1. Try Local Cache first
    const cached = localStorage.getItem(`walrus_cache_${blobId}`);
    if (cached) {
        console.log(`Retrieved from local cache: ${blobId}`);
        return cached;
    }

    let lastError;

    // 2. Try each aggregator in the list
    for (const aggregatorUrl of config.aggregators) {
        try {
            console.log(`Trying aggregator: ${aggregatorUrl} for ${blobId}`);

            // Timeout curto para não travar muito tempo em um nó ruim
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

            const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const content = await response.text();
                console.log(`Download successful from ${aggregatorUrl}`);

                // Cache it
                localStorage.setItem(`walrus_cache_${blobId}`, content);
                return content;
            } else {
                console.warn(`Aggregator ${aggregatorUrl} returned ${response.status}`);
            }
        } catch (error) {
            console.warn(`Failed to fetch from ${aggregatorUrl}:`, error);
            lastError = error;
        }
    }

    throw lastError || new Error("All aggregators failed");
}
