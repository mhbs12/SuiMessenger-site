import { blake2b } from '@noble/hashes/blake2.js';
import { SealClient, SessionKey } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHEX, toHEX } from '@mysten/sui/utils';
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
        suiClientInstance = new SuiClient({ url: getFullnodeUrl('testnet') });
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

    sealClientInstance = new SealClient({
        suiClient: getSuiClient() as any, // Type assertion needed due to SDK version mismatch
        serverConfigs: SEAL_KEY_SERVERS_TESTNET.map(server => ({
            objectId: server.objectId,
            weight: server.weight,
        })),
        verifyKeyServers: false, // Skip verification for faster initialization
    });

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

        console.log(`[SEAL] Encrypting message ${messageId}...`);

        const { encryptedObject, key } = await client.encrypt({
            threshold: SEAL_THRESHOLD,
            packageId: PACKAGE_ID,
            id: messageId,
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
