import { Aftermath } from 'aftermath-ts-sdk';
import { Transaction } from '@mysten/sui/transactions';
import { WAL_COIN_TYPE, NETWORK } from '../constants';

// Initialize Aftermath SDK
// Note: Aftermath SDK usually requires a provider or network config. 
// We'll initialize it lazily or with default settings for the network.
const af = new Aftermath(NETWORK === 'mainnet' ? 'MAINNET' : 'TESTNET');

export async function getSwapQuote(amountWalNeeded: bigint, senderAddress: string) {
    try {
        const router = af.Router();

        // We want to buy 'amountWalNeeded' of WAL
        // So we ask for a quote with exact output
        const quote = await router.getCompleteTradeRouteGivenAmountOut({
            coinInType: '0x2::sui::SUI',
            coinOutType: WAL_COIN_TYPE[NETWORK as keyof typeof WAL_COIN_TYPE],
            coinOutAmount: amountWalNeeded,
            referrer: senderAddress, // Optional
            slippage: 0.01 // 1% slippage
        });

        return quote;
    } catch (error) {
        console.error('Failed to get swap quote:', error);
        throw error;
    }
}

export async function buildSwapTransaction(
    tx: Transaction,
    quote: any,
    senderAddress: string
) {
    try {
        const router = af.Router();

        // Add the swap commands to the existing transaction block
        // The SDK handles the complex routing logic
        await router.addTransactionForCompleteTradeRoute({
            tx,
            walletAddress: senderAddress,
            completeRoute: quote,
            slippage: 0.01 // 1% slippage
        });

        return tx;
    } catch (error) {
        console.error('Failed to build swap transaction:', error);
        throw error;
    }
}
