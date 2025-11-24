import { blake2b } from '@noble/hashes/blake2.js';
import { SealClient, SessionKey } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX, toHEX, normalizeSuiAddress } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
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

                                // 4. Map response structure for SEAL compatibility
                                // SEAL expects: { object: { bcs: { dataType, bcsBytes: Uint8Array, ... }, content: Uint8Array } }
                                // New SDK returns: { data: { bcs: { dataType, bcsBytes: base64_string, ... }, content: <parsed_json> } }
                                if (result && result.data && !result.object) {
                                    const data = { ...result.data };

                                    // Convert bcsBytes from base64 string to Uint8Array (only for moveObjects)
                                    if (data.bcs?.dataType === 'moveObject' && typeof data.bcs.bcsBytes === 'string') {
                                        const base64 = data.bcs.bcsBytes;
                                        const binaryString = atob(base64);
                                        const bytes = new Uint8Array(binaryString.length);
                                        for (let i = 0; i < binaryString.length; i++) {
                                            bytes[i] = binaryString.charCodeAt(i);
                                        }
                                        data.bcs = {
                                            ...data.bcs,
                                            bcsBytes: bytes
                                        };

                                        // CRITICAL FIX: SEAL expects 'content' to be the BCS bytes for parsing
                                        // The new SDK returns parsed JSON in 'content', so we overwrite it with the bytes
                                        data.content = bytes;
                                    }

                                    return {
                                        ...result,
                                        object: data
                                    };
                                }
                                return result;
                            };
                        }

                        // Intercept multiGetObjects for Key Server retrieval
                        if (coreProp === 'multiGetObjects') {
                            return async (args: any) => {
                                // 1. Force showBcs: true
                                args = {
                                    ...args,
                                    options: {
                                        ...args.options,
                                        showBcs: true,
                                    }
                                };

                                // 2. Call original method
                                const results = await (coreTarget as any).multiGetObjects(args);

                                // 3. Map response structure
                                return results.map((result: any) => {
                                    if (result && result.data && !result.object) {
                                        const data = { ...result.data };

                                        // Convert bcsBytes from base64 string to Uint8Array
                                        if (data.bcs?.dataType === 'moveObject' && typeof data.bcs.bcsBytes === 'string') {
                                            const base64 = data.bcs.bcsBytes;
                                            const binaryString = atob(base64);
                                            const bytes = new Uint8Array(binaryString.length);
                                            for (let i = 0; i < binaryString.length; i++) {
                                                bytes[i] = binaryString.charCodeAt(i);
                                            }
                                            data.bcs = {
                                                ...data.bcs,
                                                bcsBytes: bytes
                                            };
                                        }

                                        return {
                                            ...result,
                                            object: data
                                        };
                                    }
                                    return result;
                                });
                            };
                        }

                        // Intercept getDynamicField (missing in new SDK) -> map to getDynamicFieldObject
                        if (coreProp === 'getDynamicField') {
                            return async (args: any) => {
                                // FIX: SEAL passes 'bcs' bytes in 'name', but getDynamicFieldObject expects 'value'
                                if (args && args.name && args.name.bcs && !args.name.value) {
                                    // Decode u64 BCS bytes to string value
                                    if (args.name.type === 'u64') {
                                        const bytes = args.name.bcs;
                                        // u64 is 8 bytes, little endian
                                        if (bytes.length === 8) {
                                            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                                            const val = view.getBigUint64(0, true);
                                            args.name = {
                                                type: 'u64',
                                                value: val.toString()
                                            };
                                        }
                                    }
                                }

                                // 1. Call getDynamicFieldObject instead
                                // Note: getDynamicFieldObject takes { parentId, name } just like getDynamicField used to (mostly)
                                const result = await (coreTarget as any).getDynamicFieldObject(args);

                                // 2. Map response structure for SEAL compatibility
                                // SEAL expects: { dynamicField: { value: { bcs: Uint8Array } } }
                                // New SDK returns: { data: { bcs: { dataType: 'moveObject', bcsBytes: 'base64' } } }

                                if (result && result.data) {
                                    const data = result.data;
                                    let bcsBytes: Uint8Array | null = null;

                                    // Case 1: We got BCS bytes (base64)
                                    if (data.bcs?.dataType === 'moveObject' && typeof data.bcs.bcsBytes === 'string') {
                                        const base64 = data.bcs.bcsBytes;
                                        const binaryString = atob(base64);
                                        bcsBytes = new Uint8Array(binaryString.length);
                                        for (let i = 0; i < binaryString.length; i++) {
                                            bcsBytes[i] = binaryString.charCodeAt(i);
                                        }
                                    }
                                    // Case 2: We only got parsed content (JSON) -> Serialize it back to BCS
                                    else if (data.content && data.content.dataType === 'moveObject' && data.content.fields) {
                                        try {
                                            // KeyServerV1 struct definition
                                            const KeyServerV1 = bcs.struct('KeyServerV1', {
                                                name: bcs.string(),
                                                url: bcs.string(),
                                                keyType: bcs.u8(),
                                                pk: bcs.vector(bcs.u8())
                                            });

                                            const fieldObj = data.content.fields as any;
                                            // The content is a Field<Name, Value> struct.
                                            // We need the fields of the 'value' struct (KeyServerV1).
                                            const keyServerFields = fieldObj.value.fields;

                                            // Serialize fields to BCS bytes
                                            // Note: pk is vector<u8>, but in JSON it might be array of numbers
                                            bcsBytes = KeyServerV1.serialize({
                                                name: keyServerFields.name,
                                                url: keyServerFields.url,
                                                keyType: Number(keyServerFields.key_type), // snake_case in JSON
                                                pk: keyServerFields.pk
                                            }).toBytes();
                                        } catch (e) {
                                            console.error('[SEAL Debug] Failed to serialize KeyServerV1:', e);
                                        }
                                    }

                                    if (bcsBytes) {
                                        return {
                                            dynamicField: {
                                                value: {
                                                    bcs: bcsBytes
                                                }
                                            }
                                        };
                                    }
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

/**
 * Gets the wrapped SuiClient for use with SessionKey.import()
 * This ensures the client is SEAL-compatible and signatures are properly restored
 */
export function getSealCompatibleClient(): any {
    const suiClient = getSuiClient();

    // Return the same wrapped client used by SealClient
    return new Proxy(suiClient, {
        get(target, prop) {
            if (prop === 'core') {
                return new Proxy(target, {
                    get(coreTarget, coreProp) {
                        if (coreProp === 'getObject') {
                            return async (args: any) => {
                                if (args && args.objectId && !args.id) {
                                    args = { ...args, id: args.objectId };
                                }
                                args = {
                                    ...args,
                                    options: {
                                        ...args.options,
                                        showBcs: true,
                                    }
                                };
                                const result = await (coreTarget as any).getObject(args);
                                if (result && result.data && !result.object) {
                                    const data = { ...result.data };
                                    if (data.bcs?.dataType === 'moveObject' && typeof data.bcs.bcsBytes === 'string') {
                                        data.bcs.bcsBytes = fromHEX(data.bcs.bcsBytes);
                                    }
                                    data.content = data.bcs?.bcsBytes;
                                    return {
                                        ...result,
                                        object: data
                                    };
                                }
                                return result;
                            };
                        }
                        return (coreTarget as any)[coreProp];
                    }
                });
            }
            return (target as any)[prop];
        }
    });
}

// ==================== ENCRYPTION ====================

/**
 * Encrypts a message using SEAL for the specified recipient.
 * 
 * @param content The plaintext message content
 * @param scopeId The scope ID (Chat ID) used for access control verification
 * @param plaintextHash The BLAKE2b hash of the plaintext (used as SEAL ID for encryption)
 * @returns Encrypted bytes as hex string and backup key as hex string
 */
export async function encryptMessage(
    content: string,
    scopeId: string,
    plaintextHash: Uint8Array
): Promise<{ encryptedContent: string; backupKey: string }> {
    try {
        const client = initializeSealClient();
        const encoder = new TextEncoder();
        const data = encoder.encode(content);

        const normalizedPackageId = normalizeSuiAddress(PACKAGE_ID);
        const normalizedScopeId = normalizeSuiAddress(scopeId);

        console.log(`[SEAL] Encrypting message...`);
        console.log(`[SEAL] Package ID: ${normalizedPackageId}`);
        console.log(`[SEAL] Scope ID (Chat ID): ${normalizedScopeId}`);
        console.log(`[SEAL] Plaintext hash (SEAL ID): ${toHEX(plaintextHash).substring(0, 16)}...`);

        const { encryptedObject, key } = await client.encrypt({
            threshold: SEAL_THRESHOLD,
            packageId: normalizedPackageId,
            id: toHEX(plaintextHash), // Use plaintext hash as SEAL ID
            data,
        } as any); // Type assertion needed - SDK expects proper encoding

        console.log(`[SEAL] Encryption successful for scope ${scopeId}`);

        return {
            encryptedContent: toHEX(encryptedObject),
            backupKey: toHEX(key),
        };
    } catch (error) {
        console.error(`[SEAL] Encryption failed for scope ${scopeId}:`, error);
        throw new Error(`Failed to encrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ==================== DECRYPTION ====================

/**
 * Decrypts a SEAL-encrypted message.
 * 
 * @param encryptedContent The encrypted message bytes
 * @param contentHash The BLAKE2b content hash (used for SEAL access control)
 * @param chatId The chat object ID (used for access control verification)
 * @param sessionKey The initialized session key
 * @param isSender Whether the current user is the sender (true) or receiver (false)
 * @returns Decrypted plaintext message
 */
export async function decryptMessage(
    encryptedContent: string,
    contentHash: Uint8Array | string,
    chatId: string,
    sessionKey: SessionKey,
    isSender: boolean
): Promise<string> {
    // Convert contentHash to Uint8Array if it's a hex string (do this first for error logging)
    const hashBytes = typeof contentHash === 'string' ? fromHEX(contentHash) : contentHash;

    try {
        const client = initializeSealClient();

        console.log(`[SEAL] Decrypting message with hash ${toHEX(hashBytes).substring(0, 16)}... (${isSender ? 'sender' : 'receiver'})...`);

        // Build the transaction for SEAL approval
        // This transaction is NOT executed - it's used for simulation only
        const tx = new Transaction();
        const approvalFunction = isSender ? 'seal_approve_sender' : 'seal_approve_receiver';

        tx.moveCall({
            target: `${PACKAGE_ID}::messenger::${approvalFunction}`,
            arguments: [
                tx.pure.vector('u8', Array.from(hashBytes)),
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
        console.log('[SEAL Debug] Decrypting with:', {
            dataLength: fromHEX(encryptedContent).length,
            sessionKeyExists: !!sessionKey,
            txBytesLength: txBytes.length
        });

        let decryptedBytes;
        try {
            decryptedBytes = await client.decrypt({
                data: fromHEX(encryptedContent),
                sessionKey,
                txBytes,
            });
        } catch (decryptError: any) {
            console.error('[SEAL] client.decrypt() threw error:', decryptError);

            if (decryptError) {
                console.error('[SEAL] Error details:', {
                    name: decryptError?.name,
                    message: decryptError?.message,
                    stack: decryptError?.stack,
                    type: typeof decryptError,
                    fullError: decryptError ? JSON.stringify(decryptError, Object.getOwnPropertyNames(decryptError)) : 'null/undefined'
                });
            } else {
                console.error('[SEAL] Error is null or undefined - decryption failed silently');
            }

            throw decryptError || new Error('Decryption failed with undefined error');
        }

        console.log('[SEAL Debug] Decrypted bytes length:', decryptedBytes?.length);

        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decryptedBytes);

        console.log(`[SEAL] Decryption successful for hash ${toHEX(hashBytes).substring(0, 16)}...`);

        return decryptedText;
    } catch (error) {
        console.error(`[SEAL] Decryption failed for hash ${toHEX(hashBytes).substring(0, 16)}...:`, error);
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

        // Complete initialization - MUST await as this is async
        await sessionKey.setPersonalMessageSignature(signature);

        // Verify signature was set
        const exported = sessionKey.export();
        console.log('[SEAL] Session export check:', {
            hasAddress: !!exported.address,
            hasSignature: !!exported.personalMessageSignature,
            signatureLength: exported.personalMessageSignature?.length,
            signaturePreview: exported.personalMessageSignature?.substring(0, 20) + '...'
        });

        console.log(`[SEAL] Session key created successfully`);

        return sessionKey;
    } catch (error) {
        console.error(`[SEAL] Failed to create session key:`, error);
        throw new Error(`Failed to create SEAL session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
