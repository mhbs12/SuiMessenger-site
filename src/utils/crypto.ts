import { blake2b } from '@noble/hashes/blake2.js';
import { SealClient, SessionKey } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX, toHEX, normalizeSuiAddress } from '@mysten/sui/utils';
import { PACKAGE_ID, SEAL_KEY_SERVERS_TESTNET, SEAL_THRESHOLD, SEAL_SESSION_TTL_MINUTES } from '../constants';

// ==================== BLAKE2b HASHING ====================

/**
 * Calculates the BLAKE2b-256 hash of the content.
 * This is used for the `content_hash` field in the contract.
 */
export function calculateContentHash(content: string): Uint8Array {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    return blake2b(data, { dkLen: 32 });
}

//==================== SHARED SUI CLIENT ====================

let suiClientInstance: SuiClient | null = null;

function getSuiClient(): SuiClient {
    if (!suiClientInstance) {
        console.log('[SEAL Debug] Initializing new SuiClient...');
        try {
            const url = getFullnodeUrl('testnet');
            console.log('[SEAL Debug] Fullnode URL:', url);
            suiClientInstance = new SuiClient({ url });
        } catch (e) {
            console.error('[SEAL Debug] Failed to initialize SuiClient:', e);
            // Fallback to direct URL if getFullnodeUrl fails
            suiClientInstance = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
        }
    }

    if (!suiClientInstance) {
        throw new Error('Failed to initialize SuiClient');
    }

    return suiClientInstance;
}

// ==================== SEAL CLIENT ====================

let sealClientInstance: SealClient | null = null;

/**
 * Initializes or returns the existing SEAL client instance
 */
export function initializeSealClient(): SealClient {
    if (sealClientInstance) {
        return sealClientInstance;
    }

    const suiClient = getSuiClient();

    if (!suiClient) {
        throw new Error('SuiClient is undefined before SealClient init');
    }

    console.log('[SEAL Debug] Passing SuiClient to SealClient:', !!suiClient, 'Has getObject:', typeof suiClient.getObject);

    // WRAPPER FIX: SealClient expects client.core.getObject({ objectId: ... })
    // But @mysten/sui SDK expects client.getObject({ id: ... })
    // We must intercept the call and map the arguments.
    const wrappedClient = new Proxy(suiClient, {
        get(target, prop) {
            // SealClient accesses client.core
            if (prop === 'core') {
                return new Proxy(target, {
                    get(coreTarget, coreProp) {
                        // Intercept getObject to fix argument mismatch AND response structure
                        if (coreProp === 'getObject') {
                            return async (args: any) => {
                                // 1. Map arguments (objectId -> id)
                                if (args && args.objectId && !args.id) {
                                    console.log('[SEAL Debug] Patching getObject args: objectId -> id');
                                    args = { ...args, id: args.objectId };
                                }
                                
                                // 2. Force showBcs: true to get the raw bytes SealClient needs
                                args = {
                                    ...args,
                                    options: {
                                        ...args.options,
                                        showBcs: true,
                                    }
                                };

                                // 3. Call original method
                                const result = await (coreTarget as any).getObject(args);

                                // 4. Map response (data -> object) and inject content
                                // SealClient expects response.object.content to be the BCS bytes (Uint8Array)
                                if (result && result.data && !result.object) {
                                    console.log('[SEAL Debug] Patching getObject result: data -> object (with BCS)');
                                    
                                    const patchedObject = { ...result.data };
                                    
                                    // Map bcsBytes to content if available
                                    if (result.data.bcs && result.data.bcs.bcsBytes) {
                                        // We need to convert base64 to Uint8Array
                                        // Using built-in Buffer or a helper if available. 
                                        // Since we are in browser/node env, we can use fromBase64 from @mysten/sui/utils if imported, 
                                        // or just use atob/Uint8Array for browser compatibility.
                                        // Let's use fromBase64 from @mysten/sui/utils which is already imported? 
                                        // No, only fromHEX is imported. Let's add fromBase64 import or use a simple conversion.
                                        // Actually, let's use the fromBase64 from @mysten/bcs which is standard in Sui projects, 
                                        // but I don't want to add a new import if I can avoid it.
                                        // Let's check imports.
                                        
                                        try {
                                            const binaryString = atob(result.data.bcs.bcsBytes);
                                            const bytes = new Uint8Array(binaryString.length);
                                            for (let i = 0; i < binaryString.length; i++) {
                                                bytes[i] = binaryString.charCodeAt(i);
                                            }
                                            patchedObject.content = bytes;
                                        } catch (e) {
                                            console.error('[SEAL Debug] Failed to decode BCS bytes:', e);
                                        }
                                    }

                                    return { ...result, object: patchedObject };
                                }
                                return result;
                            };
                        }
                        // Pass through other properties
                        return (coreTarget as any)[coreProp];
                    }
                });
            }
            return (target as any)[prop];
        }
    });

    try {
        sealClientInstance = new SealClient({
            suiClient: wrappedClient as any,
            serverConfigs: SEAL_KEY_SERVERS_TESTNET.map(server => ({
                objectId: server.objectId,
                weight: server.weight,
            })),
            verifyKeyServers: false,
        });

        console.log('[SEAL Debug] SealClient initialized successfully');
    } catch (e) {
        console.error('[SEAL Debug] Failed to initialize SealClient:', e);
        throw e;
    }

    return sealClientInstance;
}

// ==================== ENCRYPTION ====================

/**
 * Encrypts a message using SEAL for the specified recipient.
 * 
 * @param content The plaintext message content
 * @param messageId The unique message ID (used for policy binding)
 * @returns Encrypted bytes as hex string and backup key as hex string
 */
export async function encryptMessage(
    content: string,
    messageId: string
): Promise<{ encryptedContent: string; backupKey: string }> {
    try {
        const client = initializeSealClient();
        const encoder = new TextEncoder();
        const data = encoder.encode(content);

        const normalizedPackageId = normalizeSuiAddress(PACKAGE_ID);
        const normalizedMessageId = normalizeSuiAddress(messageId);

        console.log(`[SEAL] Encrypting message...`);
        console.log(`[SEAL] Package ID: ${normalizedPackageId}`);
        console.log(`[SEAL] Message ID: ${normalizedMessageId}`);

        const { encryptedObject, key } = await client.encrypt({
            threshold: SEAL_THRESHOLD,
            packageId: normalizedPackageId,
            id: normalizedMessageId,
            data,
        } as any); // Type assertion needed - SDK expects proper encoding

        console.log(`[SEAL] Encryption successful for ${messageId}`);

        return {
            encryptedContent: toHEX(encryptedObject),
            backupKey: toHEX(key),
        };
    } catch (error) {
        console.error(`[SEAL] Encryption failed for ${messageId}:`, error);
        throw new Error(`Failed to encrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ==================== DECRYPTION ====================

/**
 * Decrypts a SEAL-encrypted message.
 * 
 * @param encryptedContent The encrypted message bytes
 * @param messageId The unique message ID
 * @param chatId The chat object ID (used for access control verification)
 * @param sessionKey The initialized session key
 * @param isSender Whether the current user is the sender (true) or receiver (false)
 * @returns Decrypted plaintext message
 */
export async function decryptMessage(
    encryptedContent: string,
    messageId: string,
    chatId: string,
    sessionKey: SessionKey,
    isSender: boolean
): Promise<string> {
    try {
        const client = initializeSealClient();

        console.log(`[SEAL] Decrypting message ${messageId} (${isSender ? 'sender' : 'receiver'})...`);

        // Build the transaction for SEAL approval
        // This transaction is NOT executed - it's used for simulation only
        const tx = new Transaction();
        const approvalFunction = isSender ? 'seal_approve_sender' : 'seal_approve_receiver';

        tx.moveCall({
            target: `${PACKAGE_ID}::messenger::${approvalFunction}`,
            arguments: [
                tx.pure.vector('u8', fromHEX(messageId)),
                tx.object(chatId),
            ],
        });

        // Get transaction bytes for simulation
        const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
        const txBytes = await tx.build({
            client: suiClient,
            onlyTransactionKind: true,
        });

        // Decrypt using SEAL
        const decryptedBytes = await client.decrypt({
            data: fromHEX(encryptedContent),
            sessionKey,
            txBytes,
        });

        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decryptedBytes);

        console.log(`[SEAL] Decryption successful for ${messageId}`);

        return decryptedText;
    } catch (error) {
        console.error(`[SEAL] Decryption failed for ${messageId}:`, error);
        throw new Error(`Failed to decrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ==================== SESSION KEY MANAGEMENT ====================

/**
 * Creates a new SEAL session key for the current user.
 * This allows decryption without repeated wallet signatures.
 * 
 * @param userAddress The current user's Sui address
 * @param signPersonalMessage Function to sign a message with the user's wallet
 * @returns Initialized session key
 */
export async function createSealSession(
    userAddress: string,
    signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>
): Promise<SessionKey> {
    try {
        console.log(`[SEAL] Creating session key for ${userAddress}...`);

        const sessionKey = await SessionKey.create({
            address: userAddress,
            packageId: PACKAGE_ID,
            ttlMin: SEAL_SESSION_TTL_MINUTES,
            suiClient: getSuiClient() as any,
        } as any); // Type assertion needed due to SDK version mismatch

        // Get the message to sign
        const message = sessionKey.getPersonalMessage();

        // Request signature from wallet
        const { signature } = await signPersonalMessage(message);

        // Complete initialization
        sessionKey.setPersonalMessageSignature(signature);

        console.log(`[SEAL] Session key created successfully`);

        return sessionKey;
    } catch (error) {
        console.error(`[SEAL] Failed to create session key:`, error);
        throw new Error(`Failed to create SEAL session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
