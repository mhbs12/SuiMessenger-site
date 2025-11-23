import { useState, useMemo, useEffect, useRef } from 'react';
import { useCurrentAccount, useSuiClientQuery, useSignAndExecuteTransaction, ConnectButton, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, CHAT_REGISTRY_ID } from '../constants';
import { MessageSquare, Send, Search, MoreVertical, PlusCircle, RefreshCw, Clock, Sun, Moon, CheckCheck, Copy } from 'lucide-react';
import { uploadToWalrus, downloadFromWalrus } from '../utils/walrus';
import { calculateContentHash, encryptMessage, decryptMessage } from '../utils/crypto';
import { useSealSession } from '../hooks/useSealSession';
import { useTheme } from '../context/ThemeContext';
import { ReadReceipt } from './ReadReceipt';
import { bcs } from '@mysten/sui/bcs';
import { fromHex, toHex, normalizeSuiAddress } from '@mysten/sui/utils';

// Define BCS types explicitly to ensure control
const Address = bcs.bytes(32).transform({
  input: (val: string) => fromHex(val),
  output: (val) => toHex(val),
});
const ParticipantsKey = bcs.vector(Address);

export function Chat() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { theme, toggleTheme } = useTheme();

  // SEAL Session Management
  const { sessionKey, isReady: isSessionReady } = useSealSession();

  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState<string>('');
  const [showNewChatInput, setShowNewChatInput] = useState(false);
  const [newChatAddress, setNewChatAddress] = useState('');
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [epochs, setEpochs] = useState(1);

  // Map of Contact Address -> Chat ID
  const [chatIds, setChatIds] = useState<Record<string, string>>({});
  // Map of Contact Address -> Unread Count
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
    }
  }, [messageText]);

  // 1. Query ChatCreated Events to find user's chats
  const { data: chatEvents } = useSuiClientQuery('queryEvents', {
    query: {
      MoveEventType: `${PACKAGE_ID}::chat::ChatCreated`,
    },
    limit: 100,
    order: 'descending',
  }, {
    enabled: !!account,
    refetchInterval: 5000,
  });

  // Process Chat Events
  useEffect(() => {
    if (!chatEvents?.data || !account) return;

    const newChatIds: Record<string, string> = {};

    chatEvents.data.forEach((event: any) => {
      const parsed = event.parsedJson;
      // Normalize to lowercase
      const participants = (parsed.participants as string[]).map(p => p.toLowerCase());
      const myAddress = account.address.toLowerCase();

      if (participants.includes(myAddress)) {
        // Find the other party
        const otherParty = participants.find(p => p !== myAddress);
        if (otherParty) {
          newChatIds[otherParty] = parsed.id;
        }
      }
    });

    setChatIds(newChatIds);
  }, [chatEvents, account]);

  // 2. Fetch Chat Objects to get Unread Counts
  const { data: chatObjects, refetch: refetchChats } = useSuiClientQuery('multiGetObjects', {
    ids: Object.values(chatIds),
    options: { showContent: true }
  }, {
    enabled: Object.keys(chatIds).length > 0,
    refetchInterval: 3000
  });

  // Process Unread Counts
  useEffect(() => {
    if (!chatObjects || !account) return;

    const newUnreadCounts: Record<string, number> = {};

    chatObjects.forEach((obj: any) => {
      if (!obj.data || !obj.data.content) return;

      const fields = obj.data.content.fields;
      const participants = (fields.participants as string[]).map(p => p.toLowerCase());
      const unreadMap = fields.unread_counts.fields.contents; // VecMap structure
      const myAddress = account.address.toLowerCase();

      // Find other party
      const otherParty = participants.find(p => p !== myAddress);
      if (!otherParty) return;

      // Find my unread count
      // Note: VecMap keys might not be normalized in the response, but usually are.
      // We should check both or normalize if possible.
      const myEntry = unreadMap.find((entry: any) => entry.fields.key.toLowerCase() === myAddress);
      if (myEntry) {
        newUnreadCounts[otherParty] = Number(myEntry.fields.value);
      }
    });

    setUnreadCounts(newUnreadCounts);
  }, [chatObjects, account]);

  // 3. Query Message Events
  const { data: events, refetch: refetchMessages } = useSuiClientQuery('queryEvents', {
    query: {
      MoveEventType: `${PACKAGE_ID}::events::MessageSent`,
    },
    limit: 100,
    order: 'descending',
  }, {
    enabled: !!account,
    refetchInterval: 3000,
  });

  // 4. Query MessageReadSimple Events
  const { data: readEvents } = useSuiClientQuery('queryEvents', {
    query: {
      MoveEventType: `${PACKAGE_ID}::events::MessageReadSimple`,
    },
    limit: 100,
    order: 'descending',
  }, {
    enabled: !!account,
    refetchInterval: 3000,
  });

  // Process Read Events
  useEffect(() => {
    if (!readEvents?.data) return;

    setReadMessageIds(prev => {
      const next = new Set(prev);
      let hasChanges = false;
      readEvents.data.forEach((event: any) => {
        const parsed = event.parsedJson;
        console.log("Processing Read Event:", parsed); // DEBUG LOG
        if (parsed) {
          // Handle both direct ID string and { id: string } object format
          const rawId = parsed.message_id;
          const messageId = typeof rawId === 'object' && rawId !== null && 'id' in rawId ? rawId.id : rawId;

          console.log("Extracted Message ID:", messageId); // DEBUG LOG

          if (messageId && !next.has(messageId)) {
            next.add(messageId);
            hasChanges = true;
          }
        }
      });
      return hasChanges ? next : prev;
    });
  }, [readEvents]);


  // Conversations Grouping
  const conversations = useMemo(() => {
    if (!events?.data || !account) return [];
    const groups: Record<string, any> = {};

    events.data.forEach((event: any) => {
      const parsedJson = event.parsedJson;
      if (!parsedJson) return;

      const isSender = parsedJson.sender === account.address;
      const isRecipient = parsedJson.recipient === account.address;

      if (!isSender && !isRecipient) return;

      const otherParty = isSender ? parsedJson.recipient : parsedJson.sender;

      if (!groups[otherParty]) {
        groups[otherParty] = {
          address: otherParty,
          lastMessage: parsedJson,
          messages: []
        };
      }

      groups[otherParty].messages.push({
        ...parsedJson,
        isSender
      });

      if (Number(parsedJson.timestamp) > Number(groups[otherParty].lastMessage.timestamp)) {
        groups[otherParty].lastMessage = parsedJson;
      }
    });

    return Object.values(groups).sort((a: any, b: any) => Number(b.lastMessage.timestamp) - Number(a.lastMessage.timestamp));
  }, [events, account]);

  // Contact List
  const contactList = useMemo(() => {
    return conversations.filter((c: any) =>
      c.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [conversations, searchTerm]);

  // Auto-select first contact
  useEffect(() => {
    if (!selectedContact && contactList.length > 0) {
      setSelectedContact(contactList[0].address);
    }
  }, [contactList, selectedContact]);

  // Active Messages
  const activeMessages = useMemo(() => {
    if (!selectedContact) return [];
    const conversation = conversations.find((c: any) => c.address === selectedContact);
    const realMessages = conversation ? conversation.messages : [];

    const optimistic = optimisticMessages.filter((m: any) =>
      m.sender === account?.address && m.recipient === selectedContact
    );

    return [...optimistic, ...realMessages];
  }, [selectedContact, conversations, optimisticMessages, account]);

  // Decrypt Messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeMessages.length || !account) return;

      // Wait for session key if not ready yet
      if (!sessionKey && isSessionReady === false) {
        console.log('[SEAL] Waiting for session key...');
        return;
      }

      activeMessages.forEach(async (msg: any) => {
        // Fix: Match the ID logic used in the render loop
        const rawMsgId = msg.message_id || msg.id;
        const msgId = (typeof rawMsgId === 'string' ? rawMsgId : rawMsgId?.id) || msg.walrus_blob_id;

        if (!msgId || decryptedMessages[msgId]) return;

        if (msg.walrus_blob_id) {
          try {
            // Download encrypted content from Walrus
            const encryptedContent = await downloadFromWalrus(msg.walrus_blob_id);

            // Decrypt with SEAL if we have a session key
            if (sessionKey && chatIds[selectedContact?.toLowerCase() || '']) {
              try {
                const chatId = chatIds[selectedContact!.toLowerCase()];
                const isSender = msg.sender?.toLowerCase() === account.address.toLowerCase();

                console.log(`[SEAL] Decrypting message ${msgId} (${isSender ? 'sender' : 'receiver'})`);

                const decryptedText = await decryptMessage(
                  encryptedContent,
                  msgId,
                  chatId,
                  sessionKey,
                  isSender
                );

                setDecryptedMessages(prev => ({
                  ...prev,
                  [msgId]: decryptedText
                }));
              } catch (decryptError) {
                console.error(`[SEAL] Decryption failed for ${msgId}:`, decryptError);
                // Fallback: show encrypted content (shouldn't happen in normal flow)
                setDecryptedMessages(prev => ({
                  ...prev,
                  [msgId]: encryptedContent
                }));
              }
            } else {
              // No session key yet or no chat ID - store encrypted for now
              console.warn(`[SEAL] Cannot decrypt ${msgId}: missing session key or chat ID`);
              setDecryptedMessages(prev => ({
                ...prev,
                [msgId]: "🔒 Creating secure session..."
              }));
            }
          } catch (e) {
            console.error(`Failed to load message ${msgId}:`, e);
            setDecryptedMessages(prev => ({
              ...prev,
              [msgId]: "⚠️ Failed to load content"
            }));
          }
        }
      });
    };
    fetchMessages();
  }, [activeMessages, decryptedMessages, sessionKey, isSessionReady, account, chatIds, selectedContact]);

  // Remove Optimistic Messages
  useEffect(() => {
    if (!optimisticMessages.length) return;

    const conversation = conversations.find((c: any) => c.address === selectedContact);
    const realMessages = conversation ? conversation.messages : [];
    const realBlobIds = new Set(realMessages.map((m: any) => m.walrus_blob_id).filter(Boolean));

    optimisticMessages.forEach((opt: any) => {
      const optBlobId = opt.walrus_blob_id;
      if (optBlobId && realBlobIds.has(optBlobId)) {
        setOptimisticMessages(prev => prev.filter(m => m.id.id !== opt.id.id));
      }
    });
  }, [conversations, selectedContact, optimisticMessages]);

  // Clear Optimistic on Account Change
  useEffect(() => {
    setOptimisticMessages([]);
    setDecryptedMessages({});
    setChatIds({});
    setUnreadCounts({});
  }, [account?.address]);

  // Scroll Logic
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 100);
  };

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [activeMessages.length, isAtBottom]);

  // Formatters
  const formatTime = (timestamp: string) => {
    return new Date(Number(timestamp) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Epoch Duration
  const [epochDuration, setEpochDuration] = useState<number>(24 * 60 * 60 * 1000);
  const [showEpochDropdown, setShowEpochDropdown] = useState(false);

  useEffect(() => {
    const fetchEpochDuration = async () => {
      try {
        const state = await suiClient.getLatestSuiSystemState();
        const duration = Number(state.epochDurationMs);
        if (!isNaN(duration) && duration > 0) {
          setEpochDuration(duration);
        }
      } catch (e) {
        console.error('Failed to fetch epoch duration:', e);
      }
    };
    fetchEpochDuration();
  }, [suiClient]);

  const expirationDate = useMemo(() => {
    const date = new Date();
    date.setTime(date.getTime() + (epochs * epochDuration));
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [epochs, epochDuration]);

  // Handlers
  const handleStartNewChat = () => {
    if (newChatAddress.startsWith('0x') && newChatAddress.length > 10) {
      setSelectedContact(newChatAddress);
      setShowNewChatInput(false);
      setNewChatAddress('');
    } else {
      alert('Please enter a valid Sui address');
    }
  };

  const markMessagesAsRead = async (contactAddress: string) => {
    const chatId = chatIds[contactAddress];
    if (!chatId) return;

    // Find unread messages to mark (we need at least one message to pass to the function?)
    // Wait, messenger::mark_as_read takes `message: &mut Message` AND `chat: &mut Chat`.
    // So we need to find an unread message object.
    // We can query owned messages.

    // Fetch owned messages for this contact
    const owned = await suiClient.getOwnedObjects({
      owner: account!.address,
      filter: { StructType: `${PACKAGE_ID}::message::Message` },
      options: { showContent: true }
    });

    const unreadMsgs = owned.data.filter((obj: any) => {
      const fields = obj.data?.content?.fields;
      return fields && fields.sender === contactAddress && fields.is_read === false;
    });

    if (unreadMsgs.length === 0) return;

    console.log(`Marking ${unreadMsgs.length} messages as read from ${contactAddress}`);

    const tx = new Transaction();
    const batch = unreadMsgs.slice(0, 50);

    batch.forEach((msg: any) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::messenger::mark_as_read`,
        arguments: [
          tx.object(msg.data!.objectId),
          tx.object(chatId), // Pass the Chat Shared Object
          tx.object('0x6')
        ],
      });
    });

    signAndExecute({
      transaction: tx,
    }, {
      onSuccess: () => {
        console.log("Messages marked as read");
        setTimeout(() => {
          refetchChats();
          refetchMessages();
        }, 1000);
      },
      onError: (err) => console.error("Failed to mark as read:", err)
    });
  };

  const fetchChatId = async (contactAddress: string): Promise<string | null> => {
    if (!account) return null;

    console.log("Fetching Chat ID from Registry:", CHAT_REGISTRY_ID);

    try {
      // 1. Get the Table ID from the Registry Object
      const registryObj = await suiClient.getObject({
        id: CHAT_REGISTRY_ID,
        options: { showContent: true }
      });

      if (!registryObj.data || !registryObj.data.content) {
        console.error("Registry object not found");
        return null;
      }

      if (registryObj.data.content.dataType !== 'moveObject') {
        console.error("Registry object is not a Move Object");
        return null;
      }

      const registryFields = registryObj.data.content.fields as any;
      // The 'chats' field contains the Table struct, which has an 'id' field
      const tableId = registryFields.chats.fields.id.id;

      console.log("Found Table ID:", tableId);

      const addr1 = normalizeSuiAddress(account.address);
      const addr2 = normalizeSuiAddress(contactAddress);

      // Sort addresses byte-wise
      const b1 = fromHex(addr1);
      const b2 = fromHex(addr2);

      let sorted = [addr1, addr2];
      for (let i = 0; i < b1.length; i++) {
        if (b1[i] < b2[i]) {
          sorted = [addr1, addr2];
          break;
        }
        if (b1[i] > b2[i]) {
          sorted = [addr2, addr1];
          break;
        }
      }

      // Encode key
      const keyBytes = ParticipantsKey.serialize(sorted).toBytes();
      const keyArray = Array.from(keyBytes);

      console.log("Looking up key in Table:", tableId);

      // 2. Query the Table Object (using the extracted Table ID)
      const response = await suiClient.getDynamicFieldObject({
        parentId: tableId, // Use Table ID, not Registry ID
        name: {
          type: 'vector<u8>',
          value: keyArray
        }
      });

      if (response.data?.content && 'fields' in response.data.content) {
        const fields = response.data.content.fields as any;
        console.log("Found Chat ID via Table lookup:", fields.value);
        return fields.value;
      }

      return null;
    } catch (e) {
      console.error("Error fetching chat ID:", e);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!messageText || !selectedContact || !account) return;

    const optimisticId = `temp_${Date.now()}`;
    // ... (optimistic update logic remains same)
    const optimisticMsg = {
      id: { id: optimisticId },
      sender: account.address,
      recipient: selectedContact,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      walrus_blob_id: optimisticId,
      isSender: true,
      isOptimistic: true
    };

    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    setDecryptedMessages(prev => ({
      ...prev,
      [optimisticId]: messageText
    }));

    const messageToSend = messageText;
    setMessageText('');
    setIsSending(true);

    try {
      // Generate message ID for SEAL encryption
      // SEAL needs the ID before encryption to bind the policy
      const tempMessageId = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}`;

      setSendingStatus('Encrypting message...');
      const { encryptedContent } = await encryptMessage(messageToSend, tempMessageId);

      setSendingStatus('Uploading to Walrus...');
      const { blobId } = await uploadToWalrus(encryptedContent, epochs);
      console.log('Uploaded to Walrus. Blob ID:', blobId);

      setOptimisticMessages(prev => prev.map(m =>
        m.id.id === optimisticId ? { ...m, walrus_blob_id: blobId } : m
      ));

      setSendingStatus('Preparing transaction...');
      const contentHash = calculateContentHash(encryptedContent);

      const tx = new Transaction();
      // Normalize lookup
      let chatId = chatIds[selectedContact.toLowerCase()];

      // Fallback: Query Registry if not found in local state
      if (!chatId) {
        console.log("Chat ID not found in state, querying registry...");
        const fetchedId = await fetchChatId(selectedContact);
        if (fetchedId) {
          console.log("Found Chat ID in registry:", fetchedId);
          chatId = fetchedId;
          // Update local state
          setChatIds(prev => ({ ...prev, [selectedContact.toLowerCase()]: fetchedId }));
        }
      }

      if (chatId) {
        // Existing Chat: use send_message
        tx.moveCall({
          target: `${PACKAGE_ID}::messenger::send_message`,
          arguments: [
            tx.object(chatId),
            tx.pure.address(selectedContact),
            tx.pure.string(blobId),
            tx.pure.vector('u8', Array.from(contentHash)),
            tx.pure.vector('u8', []), // encrypted_metadata (empty for now)
            tx.pure.option('address', null), // seal_policy_id (SEAL handles this now)
            tx.object('0x6'), // clock
          ],
        });
      } else {
        // New Chat: use create_chat_and_send
        if (!CHAT_REGISTRY_ID) throw new Error("Chat Registry ID not configured");

        tx.moveCall({
          target: `${PACKAGE_ID}::messenger::create_chat_and_send`,
          arguments: [
            tx.object(CHAT_REGISTRY_ID),
            tx.pure.address(selectedContact),
            tx.pure.string(blobId),
            tx.pure.vector('u8', Array.from(contentHash)),
            tx.pure.vector('u8', []), // encrypted_metadata (empty for now)
            tx.pure.option('address', null), // seal_policy_id (SEAL handles this now)
            tx.object('0x6'), // clock
          ],
        });
      }

      setSendingStatus('Opening wallet...');
      signAndExecute({
        transaction: tx,
      }, {
        onSuccess: () => {
          setSendingStatus('');
          refetchMessages();
          refetchChats(); // Refresh unread counts/chats
        },
        onError: (err) => {
          console.error('Transaction failed:', err);
          alert('Failed to send message. See console for details.');
          setOptimisticMessages(prev => prev.filter(m => m.id.id !== optimisticId));
          setDecryptedMessages(prev => {
            const newState = { ...prev };
            delete newState[optimisticId];
            return newState;
          });
          setSendingStatus('');
        }
      });

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMsg = error.message || 'Error sending message. Check console.';
      alert(errorMsg);
      setOptimisticMessages(prev => prev.filter(m => m.id.id !== optimisticId));
      setDecryptedMessages(prev => {
        const newState = { ...prev };
        delete newState[optimisticId];
        return newState;
      });
      setSendingStatus('');
    } finally {
      setIsSending(false);
    }
  };

  const retryDownload = async (msgId: string, blobId: string) => {
    setDecryptedMessages(prev => {
      const newState = { ...prev };
      delete newState[msgId];
      return newState;
    });

    try {
      const content = await downloadFromWalrus(blobId);
      setDecryptedMessages(prev => ({
        ...prev,
        [msgId]: content
      }));
    } catch (e) {
      console.error(`Retry failed for ${msgId}:`, e);
      setDecryptedMessages(prev => ({
        ...prev,
        [msgId]: "⚠️ Failed to load content"
      }));
    }
  };

  const handleCopy = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    alert('Address copied to clipboard!');
  };

  return (
    <div className="flex h-full w-full bg-[var(--sui-bg)] overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-[400px] bg-[var(--sui-bg-secondary)] border-r border-[var(--sui-border)] flex flex-col">
        {/* Header Sidebar */}
        <div className="h-[60px] px-4 bg-[var(--sui-bg-tertiary)] flex justify-between items-center shrink-0 border-b border-[var(--sui-border)]">
          <div className="flex items-center gap-3 wallet-btn-container">
            <ConnectButton />
            {account && (
              <button
                onClick={(e) => handleCopy(account.address, e)}
                className="p-2 hover:bg-[var(--sui-bg-secondary)] rounded-full transition-colors text-[var(--sui-text-secondary)] hover:text-[var(--sui-blue)]"
                title="Copy My Address"
              >
                <Copy size={18} />
              </button>
            )}
          </div>
          <div className="flex gap-3 text-[var(--sui-text-secondary)] items-center">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-[var(--sui-bg-secondary)] rounded-full transition-colors"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        {/* Search & New Chat */}
        <div className="p-3 border-b border-[var(--sui-border)] space-y-3">
          <div className="flex gap-2">
            <div className="bg-[var(--sui-bg-tertiary)] flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--sui-border)] focus-within:border-[var(--sui-blue)] focus-within:ring-1 focus-within:ring-[var(--sui-blue)] transition-all">
              <Search size={18} className="text-[var(--sui-text-secondary)]" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent text-[var(--sui-text)] text-sm focus:outline-none w-full placeholder-[var(--sui-text-secondary)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowNewChatInput(!showNewChatInput)}
              className="p-2 bg-[var(--sui-bg-tertiary)] border border-[var(--sui-border)] rounded-xl hover:bg-[var(--sui-bg-secondary)] hover:border-[var(--sui-blue)] text-[var(--sui-text)] transition-all"
              title="Start New Chat"
            >
              <PlusCircle size={20} />
            </button>
          </div>

          {showNewChatInput && (
            <div className="animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Address (0x...)"
                  className="bg-[var(--sui-bg-tertiary)] border border-[var(--sui-border)] rounded-xl px-3 py-2 text-[var(--sui-text)] text-sm focus:outline-none focus:border-[var(--sui-blue)] flex-1"
                  value={newChatAddress}
                  onChange={(e) => setNewChatAddress(e.target.value)}
                />
                <button
                  onClick={handleStartNewChat}
                  className="px-4 py-2 bg-[var(--sui-blue)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Start
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {contactList.map((contact: any) => (
            <div
              key={contact.address}
              onClick={() => setSelectedContact(contact.address)}
              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--sui-bg-tertiary)] transition-all duration-200 border-b border-[var(--sui-border)]/30 ${selectedContact === contact.address ? 'bg-[var(--sui-bg-tertiary)] border-l-2 border-l-[var(--sui-blue)]' : ''
                }`}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-purple)] flex items-center justify-center text-white">
                <MessageSquare size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3
                    className="text-[var(--sui-text)] font-semibold truncate cursor-pointer hover:text-[var(--sui-blue)] transition-colors"
                    onClick={(e) => handleCopy(contact.address, e)}
                    title="Click to copy address"
                  >
                    {formatAddress(contact.address)}
                  </h3>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-[var(--sui-text-secondary)]">
                      {formatTime(contact.lastMessage.timestamp)}
                    </span>
                    {unreadCounts[contact.address] > 0 && (
                      <span className="bg-[var(--sui-blue)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {unreadCounts[contact.address]}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[var(--sui-text-secondary)] text-sm truncate">
                  {contact.lastMessage.isSender ? 'You: ' : ''}
                  Encrypted Message
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col bg-[var(--sui-bg)] relative">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="h-[60px] bg-[var(--sui-bg-tertiary)] px-4 flex items-center justify-between shrink-0 border-b border-[var(--sui-border)]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-purple)] flex items-center justify-center">
                  <MessageSquare size={20} className="text-white" />
                </div>
                <div>
                  <h2
                    className="text-[var(--sui-text)] font-semibold cursor-pointer hover:text-[var(--sui-blue)] transition-colors flex items-center gap-2"
                    onClick={(e) => handleCopy(selectedContact, e)}
                    title="Click to copy address"
                  >
                    {formatAddress(selectedContact)}
                    <Copy size={14} className="opacity-50" />
                  </h2>
                  <p className="text-xs text-[var(--sui-text-secondary)]">Online</p>
                </div>
              </div>
              <div className="flex gap-4 text-[var(--sui-text-secondary)] items-center">
                {selectedContact && unreadCounts[selectedContact] > 0 && (
                  <button
                    onClick={() => markMessagesAsRead(selectedContact)}
                    className="text-[var(--sui-blue)] hover:bg-[var(--sui-blue)]/10 p-2 rounded-full transition-all"
                    title="Mark as Read"
                  >
                    <CheckCheck size={20} />
                  </button>
                )}
                <Search size={20} className="hover:text-[var(--sui-blue)] cursor-pointer transition-colors" />
                <MoreVertical size={20} className="hover:text-[var(--sui-blue)] cursor-pointer transition-colors" />
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative"
            >
              {[...activeMessages].reverse().map((msg: any, index: number) => {
                // Fix: Check for message_id first (from Event), then id (from Optimistic), then fallback
                const rawMsgId = msg.message_id || msg.id;
                const msgId = (typeof rawMsgId === 'string' ? rawMsgId : rawMsgId?.id) || msg.walrus_blob_id || `msg-${index}`;

                const uniqueKey = `${msgId}-${index}`;
                const content = decryptedMessages[msgId];
                const isError = content === "⚠️ Failed to load content";

                return (
                  <div
                    key={uniqueKey}
                    className={`flex ${msg.isSender ? 'justify-end' : 'justify-start'} ${msg.isSender ? 'animate-fadeIn-sent' : 'animate-fadeIn-received'
                      }`}
                  >
                    <div
                      className={`max-w-[60%] rounded-2xl p-3 px-4 shadow-lg relative backdrop-blur-sm ${msg.isSender
                        ? 'bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-cyan)] text-white rounded-br-none'
                        : 'glass-card text-[var(--sui-text)] rounded-bl-none'
                        } ${msg.isOptimistic ? 'animate-optimistic' : ''}`}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {content && !isError ? (
                          <span>{content}</span>
                        ) : (
                          msg.walrus_blob_id ? (
                            isError ? (
                              <span
                                className="text-red-300 text-xs flex items-center gap-1 cursor-pointer hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryDownload(msgId, msg.walrus_blob_id);
                                }}
                                title="Click to retry download"
                              >
                                <RefreshCw size={12} /> Failed to load (Click to retry)
                              </span>
                            ) : (
                              <span className="italic text-gray-300 text-xs flex items-center gap-1">
                                <RefreshCw className="animate-spin" size={10} /> Loading content...
                              </span>
                            )
                          ) : 'Message content unavailable'
                        )}
                      </p>
                      <div className={`text-[10px] mt-1 flex justify-end items-center gap-1 ${msg.isSender ? 'text-white/70' : 'text-[var(--sui-text-secondary)]'
                        }`}>
                        {msg.isOptimistic && (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {formatTime(msg.timestamp)}
                        {msg.isSender && (
                          <ReadReceipt isRead={readMessageIds.has(msgId) || msg.is_read} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />

              {!isAtBottom && (
                <button
                  onClick={scrollToBottom}
                  className="fixed bottom-24 right-8 sui-gradient text-white p-3 rounded-full shadow-2xl hover:scale-110 transition-transform z-10 glow-effect"
                  title="Go to recent messages"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              )}
            </div>

            {/* Input Area */}
            <div className="bg-[var(--sui-bg-tertiary)] p-3 flex flex-col shrink-0 border-t border-[var(--sui-border)]">
              {sendingStatus && (
                <div className="mb-2 text-xs text-[var(--sui-blue)] flex items-center gap-2">
                  <RefreshCw className="animate-spin" size={12} />
                  {sendingStatus}
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="flex-1 bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)] rounded-2xl flex flex-col transition-all focus-within:border-[var(--sui-blue)] focus-within:ring-1 focus-within:ring-[var(--sui-blue)] transition-all">
                  <textarea
                    ref={textareaRef}
                    placeholder="Type a message..."
                    className="bg-transparent w-full text-[var(--sui-text)] p-3 focus:outline-none placeholder-[var(--sui-text-secondary)] resize-none max-h-32 min-h-[44px]"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={1}
                  />
                  <div className="flex justify-between items-center px-2 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1.5 text-[var(--sui-text-secondary)] hover:text-[var(--sui-blue)] hover:bg-[var(--sui-bg-tertiary)] rounded-lg transition-all flex items-center gap-1"
                          title="Set Message Expiration"
                          onClick={() => setShowEpochDropdown(!showEpochDropdown)}
                        >
                          <Clock size={18} />
                          <span className="text-xs font-medium">{epochs} epoch{epochs > 1 ? 's' : ''}</span>
                        </button>

                        {showEpochDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowEpochDropdown(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--sui-bg-tertiary)] border border-[var(--sui-border)] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <div className="p-2 border-b border-[var(--sui-border)] bg-[var(--sui-bg-secondary)]">
                                <p className="text-[10px] text-[var(--sui-text-secondary)] font-medium uppercase tracking-wider">Expires On</p>
                                <p className="text-xs text-[var(--sui-text)] font-semibold mt-0.5">{expirationDate}</p>
                              </div>
                              <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                                {[1, 2, 3, 4, 5, 7, 14, 30].map((val) => (
                                  <button
                                    key={val}
                                    onClick={() => {
                                      if (epochs === val) {
                                        setShowEpochDropdown(false);
                                      } else {
                                        setEpochs(val);
                                      }
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center ${epochs === val
                                      ? 'bg-[var(--sui-blue)] text-white'
                                      : 'text-[var(--sui-text)] hover:bg-[var(--sui-bg-secondary)]'
                                      }`}
                                  >
                                    <span>{val} Epoch{val > 1 ? 's' : ''}</span>
                                    {epochs === val && <CheckCheck size={14} />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || isSending}
                      className={`p-2 rounded-xl transition-all duration-200 ${messageText.trim() && !isSending
                        ? 'bg-[var(--sui-blue)] text-white shadow-lg hover:scale-105 active:scale-95'
                        : 'bg-[var(--sui-bg-tertiary)] text-[var(--sui-text-secondary)] cursor-not-allowed'
                        }`}
                    >
                      {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--sui-text-secondary)]">
            <div className="w-20 h-20 bg-[var(--sui-bg-tertiary)] rounded-full flex items-center justify-center mb-4">
              <MessageSquare size={40} className="opacity-50" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--sui-text)] mb-2">Select a chat</h2>
            <p>Choose a contact to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
