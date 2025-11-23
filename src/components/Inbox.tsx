import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, INBOX_REGISTRY_ID } from '../constants';
import { useState, useEffect } from 'react';
import { RefreshCw, MessageSquare, CheckCheck } from 'lucide-react';

export function Inbox() {
    const account = useCurrentAccount();
    const client = useSuiClient();
    const { mutate: signAndExecute } = useSignAndExecuteTransaction();
    const [isCreating, setIsCreating] = useState(false);
    const [isMarkingRead, setIsMarkingRead] = useState(false);
    const [inboxId, setInboxId] = useState<string | null>(null);
    const [inboxData, setInboxData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Função para buscar o ID da Inbox na tabela do Registry
    const fetchInboxId = async () => {
        if (!account || !INBOX_REGISTRY_ID) return;
        setIsLoading(true);
        try {
            const registryObj = await client.getObject({
                id: INBOX_REGISTRY_ID,
                options: { showContent: true }
            });

            if (!registryObj.data || !registryObj.data.content) {
                throw new Error("Registry not found");
            }

            const fields = (registryObj.data.content as any).fields;
            const tableId = fields.inboxes.fields.id.id;

            const dynamicField = await client.getDynamicFieldObject({
                parentId: tableId,
                name: {
                    type: 'address',
                    value: account.address
                }
            });

            if (dynamicField.data) {
                const fieldContent = dynamicField.data.content as any;
                setInboxId(fieldContent.fields.value);
            } else {
                setInboxId(null);
            }
        } catch (e: any) {
            if (e.message?.includes('not found') || e.code === 'dynamicFieldNotFound') {
                setInboxId(null);
            } else {
                console.error("Error fetching inbox ID:", e);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Função para buscar dados da Inbox
    const fetchInboxData = async () => {
        if (!inboxId) return;
        try {
            const res = await client.getObject({
                id: inboxId,
                options: { showContent: true }
            });
            setInboxData(res.data);
        } catch (err) {
            console.error("Error fetching inbox data:", err);
        }
    };

    // Busca os dados da Inbox se tivermos o ID
    useEffect(() => {
        if (inboxId) {
            fetchInboxData();
        } else {
            setInboxData(null);
        }
    }, [inboxId, client]);

    // Tenta buscar ao montar e periodicamente
    useEffect(() => {
        fetchInboxId();
        // Also refresh data periodically
        if (inboxId) {
            const interval = setInterval(fetchInboxData, 5000);
            return () => clearInterval(interval);
        }
        const interval = setInterval(fetchInboxId, 5000);
        return () => clearInterval(interval);
    }, [account, client, inboxId]);


    const createInbox = () => {
        setIsCreating(true);
        const tx = new Transaction();
        tx.moveCall({
            target: `${PACKAGE_ID}::inbox::create_inbox`,
            arguments: [tx.object(INBOX_REGISTRY_ID)],
        });

        signAndExecute({
            transaction: tx,
        }, {
            onSuccess: () => {
                console.log("Inbox created successfully! Waiting for indexer...");
                setTimeout(() => {
                    fetchInboxId();
                    setIsCreating(false);
                }, 3000);
            },
            onError: (err) => {
                console.error("Failed to create inbox:", err);
                setIsCreating(false);
                alert("Failed to create inbox. See console.");
            }
        });
    };

    const markAsRead = async () => {
        if (!inboxId || !account) return;
        setIsMarkingRead(true);

        try {
            // 1. Fetch all Message objects owned by user
            const messages = await client.getOwnedObjects({
                owner: account.address,
                filter: {
                    StructType: `${PACKAGE_ID}::message::Message`
                },
                options: {
                    showContent: true
                }
            });

            if (!messages.data || messages.data.length === 0) {
                console.log("No messages found to mark as read.");
                setIsMarkingRead(false);
                return;
            }

            // 2. Filter for unread messages
            const unreadMessages = messages.data.filter((msg: any) => {
                const fields = msg.data?.content?.fields;
                return fields && fields.is_read === false;
            });

            if (unreadMessages.length === 0) {
                console.log("No unread messages.");
                setIsMarkingRead(false);
                return;
            }

            console.log(`Found ${unreadMessages.length} unread messages. Marking as read...`);

            // 3. Batch transaction
            const tx = new Transaction();

            // Limit batch size to avoid gas limits (e.g., 50 messages)
            const batch = unreadMessages.slice(0, 50);

            batch.forEach((msg) => {
                tx.moveCall({
                    target: `${PACKAGE_ID}::messenger::mark_as_read`,
                    arguments: [
                        tx.object(msg.data!.objectId), // Message ID
                        tx.object(inboxId),            // Inbox ID (Shared)
                        tx.object('0x6')               // Clock
                    ],
                });
            });

            signAndExecute({
                transaction: tx,
            }, {
                onSuccess: () => {
                    console.log("Marked messages as read successfully!");
                    // Poll for updates
                    let attempts = 0;
                    const interval = setInterval(() => {
                        fetchInboxData();
                        attempts++;
                        if (attempts >= 5) { // Try for 5 seconds
                            clearInterval(interval);
                            setIsMarkingRead(false);
                        }
                    }, 1000);
                },
                onError: (err) => {
                    console.error("Failed to mark as read:", err);
                    setIsMarkingRead(false);
                    alert("Failed to mark messages as read. See console.");
                }
            });

        } catch (e) {
            console.error("Error in markAsRead:", e);
            setIsMarkingRead(false);
        }
    };

    if (!account) return null;

    if (isLoading && !inboxId) return <div className="text-center p-4 text-[var(--sui-text-secondary)] animate-pulse">Loading inbox...</div>;
    if (fetchError) return <div className="text-red-400 p-4 bg-red-500/10 rounded-lg border border-red-500/30">Error: {fetchError}</div>;

    // Se não tiver inbox, mostra botão para criar
    if (!inboxId) {
        return (
            <div className="text-center py-2">
                <div className="mb-3">
                    <div className="w-10 h-10 mx-auto bg-[var(--sui-bg-tertiary)] rounded-full flex items-center justify-center mb-2">
                        <MessageSquare size={20} className="text-[var(--sui-text-secondary)]" />
                    </div>
                    <h3 className="text-sm font-medium text-[var(--sui-text)]">No Inbox Found</h3>
                    <p className="text-xs text-[var(--sui-text-secondary)] mt-1">Create one to start messaging</p>
                </div>
                <button
                    onClick={createInbox}
                    disabled={isCreating}
                    className={`w-full py-2 px-4 bg-[var(--sui-blue)] hover:bg-[var(--sui-blue-dark)] text-white text-sm font-medium rounded-xl transition-all shadow-sm ${isCreating ? 'opacity-70 cursor-wait' : ''}`}
                >
                    {isCreating ? 'Creating...' : 'Create Inbox'}
                </button>
                <button
                    onClick={() => fetchInboxId()}
                    className="mt-3 text-xs text-[var(--sui-text-secondary)] hover:text-[var(--sui-blue)] flex items-center justify-center gap-1.5 w-full transition-colors"
                >
                    <RefreshCw size={10} /> Check Again
                </button>
            </div>
        );
    }

    const content = inboxData?.content as any;
    const fields = content?.fields;

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xs font-semibold text-[var(--sui-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                    Inbox Stats
                </h2>
                <div className="flex gap-1">
                    <button
                        onClick={markAsRead}
                        disabled={isMarkingRead || !fields?.unread_count || fields.unread_count == 0}
                        className={`p-1.5 rounded-full transition-all ${!fields?.unread_count || fields.unread_count == 0
                            ? 'text-[var(--sui-text-secondary)] opacity-50 cursor-not-allowed'
                            : 'text-[var(--sui-blue)] hover:bg-[var(--sui-blue)]/10'
                            }`}
                        title="Mark All as Read"
                    >
                        <CheckCheck size={14} className={isMarkingRead ? 'animate-pulse' : ''} />
                    </button>
                    <button
                        onClick={() => fetchInboxId()}
                        className="p-1.5 text-[var(--sui-text-secondary)] hover:text-[var(--sui-blue)] hover:bg-[var(--sui-bg-tertiary)] rounded-full transition-all"
                        title="Refresh Stats"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Total Messages */}
                <div className="p-3 bg-[var(--sui-bg-tertiary)] rounded-xl border border-[var(--sui-border)] flex flex-col items-center justify-center group hover:border-[var(--sui-blue)] transition-all cursor-default">
                    <span className="text-2xl font-bold text-[var(--sui-text)] group-hover:scale-110 transition-transform duration-200">
                        {fields?.message_count || 0}
                    </span>
                    <span className="text-[10px] text-[var(--sui-text-secondary)] font-medium mt-1 uppercase tracking-wide">Total</span>
                </div>

                {/* Unread Messages */}
                <div className="p-3 bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-purple)] rounded-xl shadow-lg shadow-blue-500/20 flex flex-col items-center justify-center transform hover:scale-105 transition-all cursor-default relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
                    <span className="text-2xl font-bold text-white relative z-10">
                        {fields?.unread_count || 0}
                    </span>
                    <span className="text-[10px] text-white/90 font-medium mt-1 uppercase tracking-wide relative z-10">Unread</span>
                </div>
            </div>
        </div>
    );
}
