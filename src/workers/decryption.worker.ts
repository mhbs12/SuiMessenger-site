import { decryptMessage, getSealCompatibleClient } from '../utils/crypto';
import { SessionKey } from '@mysten/seal';

self.onmessage = async (e: MessageEvent) => {
    const { msgId, encryptedContent, contentHash, chatId, exportedSession, isSender } = e.data;

    try {
        // Reconstruct SessionKey
        // We need a client to import the session key, even if we don't use it directly here
        // (SessionKey.import validates the key structure)
        const sealClient = getSealCompatibleClient();
        const sessionKey = SessionKey.import(exportedSession, sealClient);

        const decryptedText = await decryptMessage(
            encryptedContent,
            contentHash,
            chatId,
            sessionKey,
            isSender
        );

        self.postMessage({ msgId, content: decryptedText });
    } catch (error) {
        self.postMessage({
            msgId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
