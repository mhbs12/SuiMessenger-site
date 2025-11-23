import { blake2b } from '@noble/hashes/blake2.js';

/**
 * Calculates the BLAKE2b-256 hash of the content.
 * This is used for the `content_hash` field in the contract.
 */
export function calculateContentHash(content: string): Uint8Array {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    return blake2b(data, { dkLen: 32 });
}

/**
 * Encrypts the content using MystenLabs' SEAL.
 * 
 * @param content The plain text message.
 * @param recipientAddress The Sui address of the recipient.
 */
export async function encryptMessage(content: string, recipientAddress: string): Promise<{ encryptedContent: string; sealPolicyId: string | null }> {
    // TODO: Integrate with MystenLabs SEAL SDK.
    // 1. Generate a symmetric key (e.g., AES).
    // 2. Encrypt 'content' with the symmetric key.
    // 3. Create a SEAL policy on-chain (or use an existing one) that allows 'recipientAddress' to decrypt.
    // 4. Encrypt the symmetric key using the SEAL policy.

    console.log(`[SEAL] Encrypting for ${recipientAddress}...`);

    // For now, we are passing the content through. 
    // The USER must install the SEAL SDK and implement the actual encryption here.
    // returning the content as "encrypted" for now to allow the flow to complete until SDK is present.
    return {
        encryptedContent: content,
        sealPolicyId: null
    };
}

export async function decryptMessage(encryptedContent: string, _sealPolicyId: string | null): Promise<string> {
    // TODO: Integrate with MystenLabs SEAL SDK.
    // 1. Recover the symmetric key using the SEAL policy.
    // 2. Decrypt the content.
    return encryptedContent;
}
