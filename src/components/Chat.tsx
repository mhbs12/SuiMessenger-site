import { useState, useMemo, useEffect, useRef } from 'react';
import { useCurrentAccount, useSuiClientQuery, useSignAndExecuteTransaction, ConnectButton, useSuiClient, useSignPersonalMessage, useDisconnectWallet } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import { fromHex, toHex, normalizeSuiAddress } from '@mysten/sui/utils';
import { Mic, Trash2, StopCircle, Play, Pause, Send, Paperclip, Clock, CheckCheck, RefreshCw, MessageSquare, X, Maximize2, Hourglass, Copy, Power, Settings, Sun, Moon, Search, PlusCircle, MoreVertical } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import { useSealSession } from '../hooks/useSealSession';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import { SessionTTLSelector } from './SessionTTLSelector';
import { SettingsModal } from './SettingsModal';
import { ReadReceipt } from './ReadReceipt';
import { getCurrentTTLOption } from '../utils/session-preferences';
import { PACKAGE_ID, CHAT_REGISTRY_ID } from '../constants';
import { downloadFromWalrus, uploadToWalrus } from '../utils/walrus';
import { encryptMessage, decryptMessage, calculateContentHash, createSealSession } from '../utils/crypto';

const Address = bcs.bytes(32).transform({
  input: (val: string) => fromHex(val),
  output: (val) => toHex(val),
});
const ParticipantsKey = bcs.vector(Address);

export function Chat() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signAndExecuteAsync } = useSignAndExecuteTransaction();
  const { mutate: disconnect } = useDisconnectWallet();
  const { theme, toggleTheme } = useTheme();

  // SEAL Session Management
  const { sessionKey, isReady: isSessionReady, isLoading: isSessionLoading, saveSession, expirationTimeMs, refresh: refreshSession } = useSealSession();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [userEndedSession, setUserEndedSession] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showSealModal, setShowSealModal] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [hasHadSession, setHasHadSession] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDisconnectMenu, setShowDisconnectMenu] = useState(false);
  const [showTTLSelector, setShowTTLSelector] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | null>(null);
  const [videoGallery, setVideoGallery] = useState<string[]>([]);
  const [videoGalleryIndex, setVideoGalleryIndex] = useState(0);
  const attemptRef = useRef<string | null>(null);

  // Check for TTL preference on mount
  useEffect(() => {
    const currentTTL = getCurrentTTLOption();
    if (!currentTTL) {
      const savedPref = localStorage.getItem('seal_session_ttl_preference');
      if (!savedPref) {
        setShowTTLSelector(true);
      }
    }
  }, []);

  // ... (initSession logic)



  // Mark session as "had" if it's ready (e.g. loaded from storage)
  useEffect(() => {
    if (isSessionReady) {
      setHasHadSession(true);
    }
  }, [isSessionReady]);

  // Automatic Session Creation with Modal
  useEffect(() => {
    const initSession = async () => {
      // Only auto-create if we haven't had a session yet in this page load AND user didn't explicitly end it
      if (account && !isSessionLoading && !sessionKey && !isCreatingSession && isSessionReady === false && !hasHadSession && !userEndedSession) {

        if (attemptRef.current === account.address) {
          return; // Already attempted for this account
        }

        // Check if user has TTL preference
        const currentTTL = getCurrentTTLOption();
        if (!currentTTL) {
          // No preference saved, show TTL selector first
          // We check localStorage directly to be sure, as getCurrentTTLOption returns undefined if not set
          const savedPref = localStorage.getItem('seal_session_ttl_preference');
          if (!savedPref) {
            setShowTTLSelector(true);
            setHasHadSession(true); // Prevent auto-retry loop while selecting
            return;
          }
        }

        setIsCreatingSession(true);
        setShowSealModal(true);
        setSealError(null);
        attemptRef.current = account.address;

        try {
          console.log('[SEAL] Auto-initializing session...');
          const newSession = await createSealSession(
            account.address,
            async (message) => {
              const { signature } = await signPersonalMessage({
                message,
                account,
              });
              return { signature };
            }
          );
          saveSession(newSession);
          setHasHadSession(true); // Mark that we've had a session
          setShowSealModal(false);
        } catch (error: any) {
          console.error('[SEAL] Failed to auto-create session:', error);

          // Check if user rejected signature
          const errorMsg = error?.message || error?.toString() || '';
          if (errorMsg.includes('reject') || errorMsg.includes('denied') || errorMsg.includes('cancel')) {
            setSealError('Signature rejected. You must accept the signature to use this app.');
            // Wait a bit then disconnect
            setTimeout(() => {
              window.location.reload(); // Force reload to connection screen
            }, 2000);
          } else {
            setSealError(`Failed to create session: ${errorMsg}`);
          }
        } finally {
          setIsCreatingSession(false);
        }
      }
    };

    initSession();
  }, [account, sessionKey, isCreatingSession, isSessionReady, isSessionLoading, signPersonalMessage, saveSession, hasHadSession, userEndedSession]);

  // Calculate time remaining for session
  useEffect(() => {
    if (!expirationTimeMs || !isSessionReady) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = expirationTimeMs - now;

      if (remaining <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (minutes > 0) {
        setTimeRemaining(`${minutes}m`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expirationTimeMs, isSessionReady]);

  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState<string | null>(null);
  const [showNewChatInput, setShowNewChatInput] = useState(false);
  const [newChatAddress, setNewChatAddress] = useState('');
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [epochs, setEpochs] = useState(1);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ type: 'image' | 'video', url: string }[]>([]);
  const [showImageModal, setShowImageModal] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messageLimit, setMessageLimit] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevScrollHeightRef = useRef<number | null>(null);

  // Map of Contact Address -> Chat ID
  const [chatIds, setChatIds] = useState<Record<string, string>>({});
  // Map of Contact Address -> Unread Count
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelSendingRef = useRef(false);
  const [sendingImagesCount, setSendingImagesCount] = useState(0);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);


  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // If we are loading more messages (scrolling up), don't auto-scroll to bottom
    if (isLoadingMore) return;

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
    setIsAtBottom(true);
  };

  const processImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIMENSION = 2048;
          if (width > height) {
            if (width > MAX_DIMENSION) {
              height *= MAX_DIMENSION / width;
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width *= MAX_DIMENSION / height;
              height = MAX_DIMENSION;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/webp', 0.9);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: File[] = [];
      Array.from(e.target.files).forEach(file => {
        if (file.size > 50 * 1024 * 1024) {
          alert(`File ${file.name} is too large. Max 50MB.`);
          return;
        }
        newFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setFilePreviews(prev => [...prev, {
              type: file.type.startsWith('video') ? 'video' : 'image',
              url: e.target!.result as string
            }]);
          }
        };
        reader.readAsDataURL(file);
      });
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const clearImageSelection = () => {
    setSelectedFiles([]);
    setFilePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 100);

    // Pagination Logic: Load more when near top
    if (scrollTop < 50 && !isLoadingMore) {
      // Check if we have more messages to load
      const conversation = conversations.find((c: any) => c.address === selectedContact);
      const totalMessages = conversation ? conversation.messages.length + optimisticMessages.length : 0;

      if (messageLimit < totalMessages) {
        console.log(`[Pagination] Loading more messages... Current: ${messageLimit}, Total: ${totalMessages}`);
        setIsLoadingMore(true);
        prevScrollHeightRef.current = scrollHeight;
        setMessageLimit(prev => prev + 20);
      }
    }
  };

  // Restore scroll position after loading more messages
  useEffect(() => {
    if (isLoadingMore && prevScrollHeightRef.current !== null && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const newScrollHeight = container.scrollHeight;
      const heightDifference = newScrollHeight - prevScrollHeightRef.current;

      // Adjust scroll position to maintain visual stability
      container.scrollTop = heightDifference;

      prevScrollHeightRef.current = null;
      setIsLoadingMore(false);
    }
  }, [messageLimit]); // Run when messageLimit changes (and thus content renders)

  // Reset pagination on contact change
  useEffect(() => {
    setMessageLimit(20);
    setIsLoadingMore(false);
    prevScrollHeightRef.current = null;
  }, [selectedContact]);

  // Handle dynamic content resizing (e.g. images loading)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // Only auto-scroll if we were ALREADY at the bottom AND not loading more
      if (isAtBottom && !isLoadingMore) {
        // Use 'auto' (instant) for resize events to prevent "fighting" the user or jitter
        scrollToBottom('auto');
      }
    });

    observer.observe(container);

    if (messagesEndRef.current?.parentElement && messagesEndRef.current.parentElement !== container) {
      observer.observe(messagesEndRef.current.parentElement);
    }

    return () => observer.disconnect();
  }, [isAtBottom, isLoadingMore]);

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
        // console.log("Processing Read Event:", parsed); // DEBUG LOG
        if (parsed) {
          // Handle both direct ID string and { id: string } object format
          const rawId = parsed.message_id;
          const messageId = typeof rawId === 'object' && rawId !== null && 'id' in rawId ? rawId.id : rawId;

          // console.log("Extracted Message ID:", messageId); // DEBUG LOG

          if (messageId && !next.has(messageId)) {
            next.add(messageId);
            hasChanges = true;
          }
        }
      });
      return hasChanges ? next : prev;
    });
  }, [readEvents]);

  // Calculate Unread Counts from Events
  useEffect(() => {
    if (!events?.data || !account) return;

    const counts: Record<string, number> = {};

    events.data.forEach((event: any) => {
      const msg = event.parsedJson;
      if (!msg) return;

      // Only count messages I received (not sent)
      if (msg.recipient === account.address && msg.sender !== account.address) {
        const rawMsgId = msg.message_id;
        const msgId = typeof rawMsgId === 'object' && rawMsgId !== null && 'id' in rawMsgId ? rawMsgId.id : rawMsgId;

        // Check if not read
        if (msgId && !readMessageIds.has(msgId)) {
          const sender = msg.sender;
          counts[sender] = (counts[sender] || 0) + 1;
        }
      }
    });

    setUnreadCounts(counts);
  }, [events, readMessageIds, account]);

  // Conversations Grouping
  const conversations = useMemo(() => {
    if (!account) return [];

    const groups: Record<string, any> = {};

    // 1. Initialize with created chats (even if empty)
    if (chatEvents?.data) {
      chatEvents.data.forEach((event: any) => {
        try {
          const parsed = event.parsedJson;
          if (!parsed || !parsed.participants || !Array.isArray(parsed.participants)) return;

          const participants = (parsed.participants as string[]).map(p => p.toLowerCase());
          const myAddress = account.address.toLowerCase();

          if (participants.includes(myAddress)) {
            const otherParty = participants.find(p => p !== myAddress);
            if (otherParty) {
              groups[otherParty] = {
                address: otherParty,
                lastMessage: null, // No message yet
                messages: [],
                createdAt: Number(event.timestampMs) || 0 // Use event timestamp
              };
            }
          }
        } catch (e) {
          console.warn("Error processing chat event:", e);
        }
      });
    }

    // 2. Populate with messages
    if (events?.data) {
      events.data.forEach((event: any) => {
        try {
          const parsedJson = event.parsedJson;
          if (!parsedJson) return;

          const isSender = parsedJson.sender === account.address;
          const isRecipient = parsedJson.recipient === account.address;

          if (!isSender && !isRecipient) return;

          const otherParty = isSender ? parsedJson.recipient : parsedJson.sender;

          if (!otherParty) return; // Safety check

          // If we didn't find the chat via ChatCreated (maybe old chat?), init it
          if (!groups[otherParty]) {
            groups[otherParty] = {
              address: otherParty,
              lastMessage: null,
              messages: [],
              createdAt: 0
            };
          }

          groups[otherParty].messages.push({
            ...parsedJson,
            isSender
          });

          // Update last message
          if (!groups[otherParty].lastMessage || Number(parsedJson.timestamp) > Number(groups[otherParty].lastMessage.timestamp)) {
            groups[otherParty].lastMessage = parsedJson;
          }
        } catch (e) {
          console.warn("Error processing message event:", e);
        }
      });
    }

    return Object.values(groups).sort((a: any, b: any) => {
      const timeA = a.lastMessage ? Number(a.lastMessage.timestamp) : (a.createdAt / 1000);
      const timeB = b.lastMessage ? Number(b.lastMessage.timestamp) : (b.createdAt / 1000);
      return timeB - timeA;
    });
  }, [events, chatEvents, account]);

  // Contact List
  const contactList = useMemo(() => {
    return conversations.filter((c: any) =>
      c.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [conversations, searchTerm]);



  // Active Messages
  const activeMessages = useMemo(() => {
    if (!selectedContact) return [];
    const conversation = conversations.find((c: any) => c.address === selectedContact);
    const realMessages = conversation ? conversation.messages : [];

    const optimistic = optimisticMessages.filter((m: any) =>
      m.sender === account?.address && m.recipient === selectedContact
    );

    const allMessages = [...optimistic, ...realMessages];
    // Sort by timestamp descending (newest first)
    const sortedMessages = allMessages.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    // Pagination: Slice the messages
    return sortedMessages.slice(0, messageLimit);
  }, [selectedContact, conversations, optimisticMessages, account, messageLimit]);

  // Auto-scroll to bottom when chat opens or messages change
  useEffect(() => {
    if (selectedContact && !isLoadingMore) {
      scrollToBottom();
    }
  }, [selectedContact, activeMessages]); // Warning: activeMessages changes on pagination, but isLoadingMore check prevents jump

  // Decrypt Messages
  // Keep ref in sync to avoid infinite loop in decryption effect
  const decryptedMessagesRef = useRef(decryptedMessages);
  useEffect(() => {
    decryptedMessagesRef.current = decryptedMessages;
  }, [decryptedMessages]);

  // Decrypt Messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeMessages.length || !account) return;

      // Wait for session key if not ready yet
      if (!sessionKey && isSessionReady === false) {
        console.log('[SEAL] Waiting for session key... (sessionKey is null, isReady is false)');
        return;
      }

      if (!sessionKey) {
        console.log('[SEAL] Session key is null but isReady is', isSessionReady);
        return;
      }

      console.log('[SEAL] Have session key, proceeding to decrypt...');

      activeMessages.forEach(async (msg: any) => {
        // Fix: Match the ID logic used in the render loop
        const rawMsgId = msg.message_id || msg.id;
        const msgId = (typeof rawMsgId === 'string' ? rawMsgId : rawMsgId?.id) || msg.walrus_blob_id;

        // Use ref to check if already decrypted without adding to dependency array
        if (!msgId || decryptedMessagesRef.current[msgId]) return;

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

                // Use content_hash from the event for SEAL access control
                if (!msg.content_hash) {
                  console.error('[SEAL] Message is missing content_hash, cannot decrypt');
                  return;
                }

                // Convert content_hash from event (array of numbers) to Uint8Array
                const contentHashArray = Array.isArray(msg.content_hash)
                  ? new Uint8Array(msg.content_hash)
                  : msg.content_hash;

                console.log('[SEAL] content_hash type:', typeof msg.content_hash, 'isArray:', Array.isArray(msg.content_hash));

                const decryptedText = await decryptMessage(
                  encryptedContent,
                  contentHashArray, // Convert to Uint8Array
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
                // Fallback: Show error instead of raw encrypted content (which looks like symbols)
                setDecryptedMessages(prev => ({
                  ...prev,
                  [msgId]: "⚠️ Decryption Failed"
                }));
              }
            } else {
              // No session key yet or no chat ID - store encrypted for now
              const chatId = chatIds[selectedContact?.toLowerCase() || ''];
              console.warn(`[SEAL] Cannot decrypt ${msgId}: missing session key (${!!sessionKey}) or chat ID (${!!chatId}) for contact ${selectedContact}`);
              if (!chatId) {
                console.log('Current chatIds state:', JSON.stringify(chatIds));
              }
              setDecryptedMessages(prev => ({
                ...prev,
                [msgId]: (
                  <span
                    className="cursor-pointer hover:underline text-blue-400"
                    onClick={async (e) => {
                      e.stopPropagation();
                      console.log("Retrying chat ID lookup...");
                      const id = await fetchChatId(selectedContact!);
                      if (id) {
                        setChatIds(prev => ({ ...prev, [selectedContact!.toLowerCase()]: id }));
                        // Clear this message so it re-renders
                        setDecryptedMessages(prev => {
                          const newState = { ...prev };
                          delete newState[msgId];
                          return newState;
                        });
                      } else {
                        alert("Still could not find Chat ID. Please try creating the chat again.");
                        createChatForContact(selectedContact!);
                      }
                    }}
                  >
                    🔒 Creating secure session... (Click to retry)
                  </span>
                )
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
  }, [activeMessages, sessionKey, isSessionReady, account, chatIds, selectedContact]);

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
  }, [account?.address]);

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
      // Auto-create will be triggered by useEffect
    } else {
      alert('Please enter a valid Sui address');
    }
  };

  // Auto-create chat when selecting a contact without existing chat
  useEffect(() => {
    if (!selectedContact || !account || isCreatingChat) return;

    const contactKey = selectedContact.toLowerCase();

    // If no chat exists for this contact, check registry first
    if (!chatIds[contactKey]) {
      let isCancelled = false;

      const checkRegistryAndCreate = async () => {
        console.log('[Chat] Checking registry for existing chat with:', selectedContact);
        try {
          // 1. Check Registry
          const existingId = await fetchChatId(selectedContact);

          if (isCancelled) return;

          if (existingId) {
            console.log('[Chat] Found existing chat on-chain:', existingId);
            setChatIds(prev => ({ ...prev, [contactKey]: existingId }));
          } else {
            // 2. Only create if not found
            console.log('[Chat] No existing chat found, proceeding to create...');
            createChatForContact(selectedContact);
          }
        } catch (e) {
          console.error('[Chat] Error checking registry:', e);
        }
      };

      checkRegistryAndCreate();

      return () => {
        isCancelled = true;
      };
    }
  }, [selectedContact, chatIds, account]);

  const createChatForContact = async (contact: string) => {
    if (!account) return;

    setIsCreatingChat(true);
    try {
      console.log('[Chat] Auto-creating chat with:', contact);

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::messenger::create_chat`,
        arguments: [
          tx.object(CHAT_REGISTRY_ID),
          tx.pure.address(contact),
        ],
      });

      const result = await signAndExecuteAsync({
        transaction: tx as any,
      });

      // Wait for transaction and extract chat ID
      const txDetails = await suiClient.waitForTransaction({
        digest: result.digest,
        options: { showEvents: true }
      });

      const chatCreatedEvent = txDetails.events?.find(
        (e: any) => e.type === `${PACKAGE_ID}::chat::ChatCreated`
      );

      if (chatCreatedEvent && chatCreatedEvent.parsedJson) {
        const parsed = chatCreatedEvent.parsedJson as any;
        const newChatId = parsed.id;
        console.log('[Chat] Chat created successfully. ID:', newChatId);
        setChatIds(prev => ({ ...prev, [contact.toLowerCase()]: newChatId }));
      }
    } catch (error) {
      console.error('[Chat] Failed to create chat:', error);
      alert('Failed to create chat. Please try again.');
      setSelectedContact(null);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const markMessagesAsRead = async (contactAddress: string) => {
    const chatId = chatIds[contactAddress];
    if (!chatId) return;

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

    signAndExecuteAsync({
      transaction: tx as any,
    }).then(() => {
      console.log("Marked as read successfully");
      // Update local state to reflect read status
      setReadMessageIds(prev => {
        const next = new Set(prev);
        unreadMsgs.forEach((msg: any) => next.add(msg.data!.objectId));
        return next;
      });
      // Decrement unread count
      if (selectedContact) {
        setUnreadCounts(prev => ({
          ...prev,
          [selectedContact.toLowerCase()]: 0
        }));
      }
    }).catch((err: any) => console.error("Failed to mark as read:", err));
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
      console.log("Sorted Addresses:", sorted);

      // 2. Query the Table Object
      // Try vector<address> first (Standard Move pattern)
      try {
        const response = await suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: {
            type: 'vector<address>',
            value: sorted
          }
        });

        if (response.data?.content && 'fields' in response.data.content) {
          const fields = response.data.content.fields as any;
          console.log("Found Chat ID via Table lookup (vector<address>):", fields.value);
          return fields.value;
        }
      } catch (e) {
        console.log("Lookup with vector<address> failed, trying vector<u8> fallback...");
      }

      // Fallback: Try vector<u8> (BCS bytes)
      const response = await suiClient.getDynamicFieldObject({
        parentId: tableId,
        name: {
          type: 'vector<u8>',
          value: keyArray
        }
      });

      if (response.data?.content && 'fields' in response.data.content) {
        const fields = response.data.content.fields as any;
        console.log("Found Chat ID via Table lookup (vector<u8>):", fields.value);
        return fields.value;
      }
      return null;
    } catch (error) {
      console.error("Error in fetchChatId:", error);
      return null;
    }
  };

  // Audio Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Start Timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const handleSendAudio = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' });
        handleSendMessage(audioFile);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      };
      stopRecording();
    }
  };

  const handleSendMessage = async (audioFile?: File) => {
    if ((!messageText.trim() && selectedFiles.length === 0 && !audioFile) || !selectedContact || !account) return;

    setIsSending(true);
    setSendingStatus('Preparing...');
    cancelSendingRef.current = false;

    const checkCancelled = () => {
      if (cancelSendingRef.current) {
        setIsSending(false);
        setSendingStatus(null);
        cancelSendingRef.current = false;
        return true;
      }
      return false;
    };

    const messageToSend = messageText;
    const optimisticIds: string[] = [];
    let textOptimisticId: string | null = null;

    // Create Optimistic Messages
    const now = Date.now();
    const imagesToProcess = audioFile ? [audioFile] : selectedFiles;

    // For files
    for (let i = 0; i < imagesToProcess.length; i++) {
      const file = imagesToProcess[i];
      const isVideo = file.type.startsWith('video');
      const isAudio = file.type.startsWith('audio');
      const tempId = `opt-${now}-${i}`;
      optimisticIds.push(tempId);

      // Create optimistic message object
      const optMsg = {
        id: { id: tempId },
        sender: account.address,
        timestamp_ms: String(now),
        walrus_blob_id: null, // Will be updated after upload
        content: isVideo ? 'VID:...' : isAudio ? 'AUD:...' : 'IMG:...', // Placeholder
        isOptimistic: true,
        is_read: false
      };

      // Add to state
      setOptimisticMessages(prev => [...prev, optMsg as any]);

      // Also set decrypted content immediately for preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const prefix = isVideo ? 'VID:' : isAudio ? 'AUD:' : 'IMG:';
          setDecryptedMessages(prev => ({
            ...prev,
            [tempId]: `${prefix}${e.target!.result}`
          }));
        }
      };
      reader.readAsDataURL(file);
    }

    // For text
    if (messageToSend.trim()) {
      const tempId = `opt-${now}-text`;
      textOptimisticId = tempId;

      const optMsg = {
        id: { id: tempId },
        sender: account.address,
        timestamp_ms: String(now),
        walrus_blob_id: null,
        content: messageToSend,
        isOptimistic: true,
        is_read: false
      };

      setOptimisticMessages(prev => [...prev, optMsg as any]);
      setDecryptedMessages(prev => ({
        ...prev,
        [tempId]: messageToSend
      }));
    }

    try {
      let chatId = chatIds[selectedContact.toLowerCase()];

      if (!chatId) {
        console.log("Chat ID not found in state, querying registry...");
        setSendingStatus('Locating secure channel...');
        const fetchedId = await fetchChatId(selectedContact);
        if (fetchedId) {
          console.log("Found Chat ID in registry:", fetchedId);
          chatId = fetchedId;
          setChatIds(prev => ({ ...prev, [selectedContact.toLowerCase()]: fetchedId }));
        }
      }

      if (checkCancelled()) return;

      // If still no Chat ID, we must create the chat first
      if (!chatId) {
        if (!CHAT_REGISTRY_ID) throw new Error("Chat Registry ID not configured");

        console.log("Creating new chat to establish SEAL scope...");
        setSendingStatus('Verifying secure channel...');
        await new Promise(resolve => setTimeout(resolve, 800));

        if (checkCancelled()) return;

        const createTx = new Transaction();
        createTx.moveCall({
          target: `${PACKAGE_ID}::messenger::create_chat`,
          arguments: [
            createTx.object(CHAT_REGISTRY_ID),
            createTx.pure.address(selectedContact),
          ],
        });

        console.log("SendMessage: Executing Create Chat Transaction...");
        const result = await signAndExecuteAsync({
          transaction: createTx as any,
        });

        // Wait for transaction and extract chat ID
        console.log("SendMessage: Waiting for Create Chat Transaction...");
        const txDetails = await suiClient.waitForTransaction({
          digest: result.digest,
          options: { showEvents: true }
        });

        // Extract Chat ID from events
        const chatCreatedEvent = txDetails.events?.find(
          (e: any) => e.type === `${PACKAGE_ID}::chat::ChatCreated`
        );

        if (chatCreatedEvent && chatCreatedEvent.parsedJson) {
          const parsed = chatCreatedEvent.parsedJson as any;
          chatId = parsed.id;
          console.log("Chat created successfully. ID:", chatId);
          setChatIds(prev => ({ ...prev, [selectedContact.toLowerCase()]: chatId }));
        } else {
          throw new Error("Failed to retrieve Chat ID from creation transaction");
        }
      }

      if (checkCancelled()) return;

      const tx = new Transaction();
      let hasActions = false;

      const imagesToProcess = audioFile ? [audioFile] : selectedFiles;

      // Process Files
      for (let i = 0; i < imagesToProcess.length; i++) {
        if (checkCancelled()) return;

        const file = imagesToProcess[i];
        const isVideo = file.type.startsWith('video');
        const isAudio = file.type.startsWith('audio');
        setSendingStatus(`Processing ${isVideo ? 'video' : isAudio ? 'audio' : 'image'} ${i + 1}/${imagesToProcess.length}...`);
        console.log(`SendMessage: Processing file ${i + 1}/${imagesToProcess.length}`);

        let content = '';
        if (isVideo) {
          // For video, we just read as DataURL (no compression for now as agreed)
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result) resolve(`VID:${reader.result}`);
            };
            reader.readAsDataURL(file);
          });
        } else if (isAudio) {
          // For audio, read as DataURL
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result) resolve(`AUD:${reader.result}`);
            };
            reader.readAsDataURL(file);
          });
        } else {
          const webpDataUrl = await processImage(file);
          content = `IMG:${webpDataUrl}`;
        }

        if (checkCancelled()) return;

        // Encrypt
        console.log(`SendMessage: Encrypting file ${i + 1}...`);
        setSendingStatus(`Encrypting ${isVideo ? 'video' : 'image'}...`);
        const plaintextHash = calculateContentHash(content);
        const { encryptedContent } = await encryptMessage(content, chatId, plaintextHash);

        if (checkCancelled()) return;

        // Upload
        console.log(`SendMessage: Uploading file ${i + 1} to Walrus...`);
        setSendingStatus(`Uploading to Walrus...`);
        const { blobId } = await uploadToWalrus(encryptedContent, epochs);
        console.log(`SendMessage: Uploaded file ${i + 1}, Blob ID: ${blobId}`);

        if (checkCancelled()) return;

        // Update Optimistic Blob ID
        const optId = optimisticIds[i];
        setOptimisticMessages(prev => prev.map(m =>
          m.id.id === optId ? { ...m, walrus_blob_id: blobId } : m
        ));

        // Add to Transaction
        tx.moveCall({
          target: `${PACKAGE_ID}::messenger::send_message`,
          arguments: [
            tx.object(chatId),
            tx.pure.address(selectedContact),
            tx.pure.string(blobId),
            tx.pure.vector('u8', Array.from(plaintextHash)),
            tx.pure.vector('u8', []),
            tx.object('0x6'),
          ],
        });
        hasActions = true;
      }

      // Process Text
      if (messageToSend.trim()) {
        if (checkCancelled()) return;

        console.log("SendMessage: Processing text message...");
        setSendingStatus('Encrypting text...');
        const content = messageToSend;
        const plaintextHash = calculateContentHash(content);
        const { encryptedContent } = await encryptMessage(content, chatId, plaintextHash);

        if (checkCancelled()) return;

        console.log("SendMessage: Uploading text to Walrus...");
        setSendingStatus('Uploading to Walrus...');
        const { blobId } = await uploadToWalrus(encryptedContent, epochs);
        console.log("SendMessage: Text uploaded, Blob ID:", blobId);

        if (checkCancelled()) return;

        // Update Optimistic Blob ID
        if (textOptimisticId) {
          setOptimisticMessages(prev => prev.map(m =>
            m.id.id === textOptimisticId ? { ...m, walrus_blob_id: blobId } : m
          ));
        }

        tx.moveCall({
          target: `${PACKAGE_ID}::messenger::send_message`,
          arguments: [
            tx.object(chatId),
            tx.pure.address(selectedContact),
            tx.pure.string(blobId),
            tx.pure.vector('u8', Array.from(plaintextHash)),
            tx.pure.vector('u8', []),
            tx.object('0x6'),
          ],
        });
        hasActions = true;
      }

      // Mark as Read Logic (Batch)
      if (unreadCounts[selectedContact.toLowerCase()] > 0) {
        console.log("SendMessage: Adding Mark as Read commands...");
        try {
          const owned = await suiClient.getOwnedObjects({
            owner: account!.address,
            filter: { StructType: `${PACKAGE_ID}::message::Message` },
            options: { showContent: true }
          });

          const unreadMsgs = owned.data.filter((obj: any) => {
            const fields = obj.data?.content?.fields;
            return fields && fields.sender === selectedContact && fields.is_read === false;
          });

          unreadMsgs.slice(0, 50).forEach((msg: any) => {
            tx.moveCall({
              target: `${PACKAGE_ID}::messenger::mark_as_read`,
              arguments: [
                tx.object(msg.data!.objectId),
                tx.object(chatId),
                tx.object('0x6')
              ],
            });
          });
        } catch (err) {
          console.warn('Failed to fetch unread messages for batching:', err);
        }
      }

      if (hasActions) {
        if (checkCancelled()) return;

        console.log("SendMessage: Requesting Wallet Signature...");
        setSendingStatus('Waiting for wallet signature...');
        await signAndExecuteAsync({
          transaction: tx as any,
        });
        console.log("SendMessage: Transaction Submitted!");
      } else {
        console.warn("SendMessage: No actions to perform in transaction");
      }

      setMessageText('');
      clearImageSelection();
      setSendingStatus(null);
      refetchMessages();
      refetchChats();

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMsg = error.message || 'Error sending message. Check console.';

      // Check for rejection
      if (errorMsg.includes('reject') || errorMsg.includes('denied') || errorMsg.includes('cancel')) {
        setErrorMessage('Transaction rejected by user');
      } else {
        setErrorMessage(errorMsg);
      }

      // Auto-clear error after 3 seconds
      setTimeout(() => setErrorMessage(null), 3000);

      // Clear optimistic messages on error
      setOptimisticMessages(prev => prev.filter(m => !optimisticIds.includes(m.id.id)));
      setDecryptedMessages(prev => {
        const newState = { ...prev };
        optimisticIds.forEach(id => delete newState[id]);
        return newState;
      });
      setSendingStatus('');
    } finally {
      setIsSending(false);
      setSendingImagesCount(0);
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
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const newFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 50 * 1024 * 1024) {
            alert(`File ${file.name} is too large. Max 50MB.`);
            continue;
          }
          newFiles.push(file);
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              setFilePreviews(prev => [...prev, {
                type: file.type.startsWith('video') ? 'video' : 'image',
                url: reader.result as string
              }]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      e.preventDefault();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles: File[] = [];
      Array.from(e.dataTransfer.files).forEach(file => {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          if (file.size > 50 * 1024 * 1024) {
            alert(`File ${file.name} is too large. Max 50MB.`);
            return;
          }
          newFiles.push(file);
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              setFilePreviews(prev => [...prev, {
                type: file.type.startsWith('video') ? 'video' : 'image',
                url: reader.result as string
              }]);
            }
          };
          reader.readAsDataURL(file);
        }
      });

      if (newFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    }
  };

  return (
    <div
      className="flex h-full w-full bg-[var(--sui-bg)] overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[var(--sui-blue)]/10 backdrop-blur-sm border-2 border-dashed border-[var(--sui-blue)] m-4 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
          <div className="bg-[var(--sui-bg)] p-6 rounded-full shadow-xl mb-4">
            <Paperclip size={48} className="text-[var(--sui-blue)] animate-bounce" />
          </div>
          <h3 className="text-2xl font-bold text-[var(--sui-text)]">Drop image to attach</h3>
        </div>
      )}
      {/* SIDEBAR */}
      <div className="w-[400px] bg-[var(--sui-bg-secondary)] border-r border-[var(--sui-border)] flex flex-col">
        {/* Header Sidebar */}
        <div className="h-[60px] px-4 bg-[var(--sui-bg-tertiary)] flex justify-between items-center shrink-0 border-b border-[var(--sui-border)]">
          <div className="flex items-center gap-2 wallet-btn-container">
            {!account ? (
              <ConnectButton />
            ) : (
              <button
                onClick={(e) => handleCopy(account.address, e)}
                className="flex items-center gap-2 h-7 px-3 bg-[var(--sui-bg-secondary)] hover:bg-[var(--sui-bg)] border border-[var(--sui-border)] rounded-full transition-all group shadow-sm"
                title="Click to Copy Address"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-[var(--sui-text)] group-hover:text-[var(--sui-blue)] transition-colors">
                  {formatAddress(account.address)}
                </span>
                {copiedAddress === account.address ? (
                  <CheckCheck size={12} className="text-green-500" />
                ) : (
                  <Copy size={12} className="text-[var(--sui-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            )}
          </div>
          <div className="flex gap-2 text-[var(--sui-text-secondary)] items-center">
            {timeRemaining ? (
              <div
                className="flex items-center gap-2 h-7 px-3 bg-[var(--sui-bg-secondary)] rounded-full border border-[var(--sui-border)] shadow-sm"
                title="Session expiration timer"
              >
                <Hourglass size={12} className="text-[var(--sui-blue)] animate-pulse" />
                <span className={`text-xs font-medium tabular-nums ${timeRemaining === 'Expired' ? 'text-red-500' : 'text-[var(--sui-text)]'}`}>
                  {timeRemaining === 'Expired' ? 'Expired' : `${timeRemaining}`}
                </span>
                {timeRemaining !== 'Expired' ? (
                  <button
                    onClick={() => setShowEndSessionConfirm(true)}
                    className="ml-1 p-0.5 hover:bg-red-500/10 rounded-full text-[var(--sui-text-secondary)] hover:text-red-500 transition-all"
                    title="End Session"
                  >
                    <Power size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setHasHadSession(false);
                      setUserEndedSession(false);
                      attemptRef.current = null;
                    }}
                    className="ml-1 p-0.5 hover:bg-[var(--sui-blue)]/10 rounded-full text-[var(--sui-blue)] transition-all"
                    title="Restart Session"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>
            ) : (
              // Show "Unlock" button if connected but no session (and not loading)
              account && !isSessionLoading && !sessionKey && (
                <button
                  onClick={() => {
                    setHasHadSession(false); // Reset flag to trigger auto-init
                    setUserEndedSession(false); // Allow auto-init to run again
                    attemptRef.current = null; // Reset attempt ref to allow re-try
                  }}
                  className="flex items-center gap-2.5 h-7 px-4 bg-[var(--sui-blue)] text-white rounded-full hover:opacity-90 transition-all shadow-sm"
                  title="Unlock secure session"
                >
                  <Play size={10} fill="currentColor" />
                  <span className="text-xs font-medium tabular-nums">Unlock</span>
                </button>
              )
            )}

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 flex items-center justify-center hover:bg-[var(--sui-bg-secondary)] rounded-full transition-colors"
              title="Settings"
            >
              <Settings size={16} />
            </button>

            {/* Disconnect Button */}
            {account && (
              <button
                onClick={() => setShowDisconnectMenu(true)}
                className="w-8 h-8 flex items-center justify-center hover:bg-red-500/10 text-[var(--sui-text-secondary)] hover:text-red-500 rounded-full transition-colors"
                title="Disconnect Wallet"
              >
                <Power size={16} />
              </button>
            )}

            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center hover:bg-[var(--sui-bg-secondary)] rounded-full transition-colors"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {/* Network Badge */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg text-sm font-medium border border-orange-500/20">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
            <span>Currently on Testnet</span>
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
              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--sui-bg-tertiary)] transition-all duration-200 border-b border-transparent ${selectedContact === contact.address ? 'bg-[var(--sui-bg-tertiary)] border-l-2 border-l-[var(--sui-blue)]' : ''
                }`}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-purple)] flex items-center justify-center text-white">
                <MessageSquare size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-[var(--sui-text)] font-semibold truncate">
                    {formatAddress(contact.address)}
                  </h3>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-[var(--sui-text-secondary)]">
                      {contact.lastMessage ? formatTime(contact.lastMessage.timestamp) : (contact.createdAt ? formatTime((contact.createdAt / 1000).toString()) : '')}
                    </span>
                    {unreadCounts[contact.address] > 0 && (
                      <span className="bg-[var(--sui-blue)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {unreadCounts[contact.address]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CHAT AREA  */}
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
                    {copiedAddress === selectedContact ? (
                      <CheckCheck size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="opacity-50" />
                    )}
                  </h2>
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

            {/* Messages Area Wrapper */}
            <div className="flex-1 relative min-h-0">
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="absolute inset-0 overflow-y-auto p-4 space-y-4 custom-scrollbar"
              >
                {(() => {
                  // Grouping Logic
                  const reversedMessages = [...activeMessages].reverse().map((msg, i) => ({ msg, index: i }));
                  const groupedMessages: { type: 'image-group' | 'single', items: { msg: any, index: number }[], textItem?: { msg: any, index: number } }[] = [];
                  let i = 0;

                  const getMsgId = (msg: any, idx: number) => {
                    const rawMsgId = msg.message_id || msg.id;
                    return (typeof rawMsgId === 'string' ? rawMsgId : rawMsgId?.id) || msg.walrus_blob_id || `msg-${idx}`;
                  };

                  while (i < reversedMessages.length) {
                    const currentItem = reversedMessages[i];
                    const batch = [currentItem];
                    let j = i + 1;

                    // Group by Sender + Timestamp
                    while (j < reversedMessages.length) {
                      const nextItem = reversedMessages[j];
                      if (nextItem.msg.sender === currentItem.msg.sender && nextItem.msg.timestamp === currentItem.msg.timestamp) {
                        batch.push(nextItem);
                        j++;
                      } else {
                        break;
                      }
                    }

                    // Separate Images and Text (including Videos in images for grouping)
                    const images: typeof batch = [];
                    const texts: typeof batch = [];

                    for (const item of batch) {
                      const msgId = getMsgId(item.msg, item.index);
                      const content = decryptedMessages[msgId];
                      if (content && !content.startsWith('⚠️') && (content.startsWith('IMG:') || content.startsWith('VID:'))) {
                        images.push(item);
                      } else {
                        texts.push(item);
                      }
                    }

                    if (images.length > 0) {
                      // Image Group (with optional caption)
                      const captionItem = texts.length > 0 ? texts[0] : undefined;
                      groupedMessages.push({ type: 'image-group', items: images, textItem: captionItem });
                    } else {
                      // No images, render all as singles
                      for (const item of batch) {
                        groupedMessages.push({ type: 'single', items: [item] });
                      }
                    }
                    i = j;
                  }

                  return groupedMessages.map((group, groupIndex) => {
                    const firstItem = group.items[0];
                    const msg = firstItem.msg;
                    const isSender = msg.isSender;

                    if (group.type === 'image-group') {
                      // Render Grid (Oldest to Newest)
                      const gridItems = [...group.items].reverse();
                      const msgId = getMsgId(msg, firstItem.index); // ID for status
                      const count = gridItems.length;

                      // Extract all sources for gallery
                      const allSources = gridItems.map(item => {
                        const mId = getMsgId(item.msg, item.index);
                        const content = decryptedMessages[mId];
                        return content?.substring(4).split('|||')[0] || '';
                      }).filter(src => src);

                      // Truncate for display
                      const visibleItems = gridItems.slice(0, 4);
                      const remainingCount = count - 4;

                      // Caption Logic
                      let captionText: string | null = null;
                      if (group.textItem) {
                        const txtId = getMsgId(group.textItem.msg, group.textItem.index);
                        const txtContent = decryptedMessages[txtId];
                        if (txtContent && !txtContent.startsWith('IMG:') && !txtContent.startsWith('VID:') && txtContent !== "⚠️ Failed to load content") {
                          captionText = txtContent;
                        }
                      }

                      return (
                        <div key={`group-${groupIndex}`} className={`flex ${isSender ? 'justify-end' : 'justify-start'} ${isSender ? 'animate-fadeIn-sent' : 'animate-fadeIn-received'}`}>
                          <div className={`relative max-w-[70%] md:max-w-md rounded-2xl shadow-lg flex flex-col p-1 border border-white/20 ${isSender ? 'bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-cyan)] rounded-br-none' : 'glass-card rounded-bl-none'}`}>
                            <div className={`grid gap-0.5 rounded-xl overflow-hidden border border-white/20 ${visibleItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                              {visibleItems.map((item, idx) => {
                                const mId = getMsgId(item.msg, item.index);
                                const content = decryptedMessages[mId];
                                const isVideo = content?.startsWith('VID:');
                                const src = content?.substring(4).split('|||')[0];

                                // Layout Logic
                                let itemClass = "relative cursor-pointer group overflow-hidden";
                                if (visibleItems.length === 1 && isVideo) {
                                  itemClass += " aspect-video"; // 16:9 for single video
                                } else if (visibleItems.length === 3 && idx === 0) {
                                  itemClass += " col-span-2 aspect-[2/1]";
                                } else {
                                  itemClass += " aspect-square";
                                }

                                const isLastItem = idx === 3;
                                const showOverlay = isLastItem && remainingCount > 0;

                                return (
                                  <div key={idx} className={itemClass} onClick={() => {
                                    if (isVideo) {
                                      // Filter only videos for the gallery
                                      const videoSources = gridItems.map(it => {
                                        const id = getMsgId(it.msg, it.index);
                                        const c = decryptedMessages[id];
                                        return c?.startsWith('VID:') ? c.substring(4).split('|||')[0] : null;
                                      }).filter(s => s) as string[];

                                      const currentIdx = videoSources.indexOf(src);

                                      setPreviewVideoSrc(src);
                                      setVideoGallery(videoSources);
                                      setVideoGalleryIndex(currentIdx !== -1 ? currentIdx : 0);
                                      setShowVideoModal(true);
                                    } else {
                                      setGalleryImages(allSources);
                                      setGalleryIndex(idx);
                                      setShowImageModal(true);
                                    }
                                  }}>
                                    {isVideo ? (
                                      <div className="w-full h-full bg-black flex items-center justify-center relative">
                                        <video src={src} className="w-full h-full object-cover opacity-80" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm group-hover:scale-110 transition-transform">
                                            <Play className="text-white fill-current" size={24} />
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <img src={src} alt="Preview" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                    )}

                                    {/* Hover Overlay */}
                                    <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 ${showOverlay ? 'hidden' : ''}`}>
                                      <Maximize2 className="text-white drop-shadow-md" size={20} />
                                    </div>

                                    {/* +N Overlay */}
                                    {showOverlay && (
                                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[2px] transition-colors hover:bg-black/60">
                                        <span className="text-white text-2xl font-bold drop-shadow-md">+{remainingCount}</span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Caption Area */}
                            {captionText && (
                              <div className={`pt-2 px-3 pb-0 ${isSender ? 'text-white' : 'text-[var(--sui-text)]'}`}>
                                <p className="text-sm break-all whitespace-pre-wrap">{captionText}</p>
                              </div>
                            )}

                            {/* Timestamp & Status Footer */}
                            <div className={`text-[10px] px-2 py-1 flex justify-end items-center gap-1 ${isSender ? 'text-white/90' : 'text-[var(--sui-text-secondary)]'}`}>
                              {msg.isOptimistic && (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              )}
                              {formatTime(msg.timestamp)}
                              {isSender && <ReadReceipt isRead={readMessageIds.has(msgId) || msg.is_read} />}
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // Render Single Message (Original Logic)
                      const item = group.items[0];
                      const msg = item.msg;
                      const index = item.index;

                      const rawMsgId = msg.message_id || msg.id;
                      const msgId = (typeof rawMsgId === 'string' ? rawMsgId : rawMsgId?.id) || msg.walrus_blob_id || `msg-${index}`;

                      const uniqueKey = `${msgId}-${index}`;
                      const content = decryptedMessages[msgId];
                      const isError = content === "⚠️ Failed to load content";

                      // Parse Content for Image/Video/Audio + Caption
                      let imageSrc: string | null = null;
                      let videoSrc: string | null = null;
                      let audioSrc: string | null = null;
                      let captionText: string | null = null;

                      if (content && !isError) {
                        if (content.startsWith('IMG:')) {
                          const parts = content.split('|||');
                          imageSrc = parts[0].substring(4); // Remove IMG:
                          if (parts.length > 1) {
                            captionText = parts.slice(1).join('|||'); // Rejoin rest in case caption has separator
                          }
                        } else if (content.startsWith('VID:')) {
                          const parts = content.split('|||');
                          videoSrc = parts[0].substring(4); // Remove VID:
                          if (parts.length > 1) {
                            captionText = parts.slice(1).join('|||');
                          }
                        } else if (content.startsWith('AUD:')) {
                          const parts = content.split('|||');
                          audioSrc = parts[0].substring(4); // Remove AUD:
                          if (parts.length > 1) {
                            captionText = parts.slice(1).join('|||');
                          }
                        } else {
                          captionText = content;
                        }
                      }

                      return (
                        <div
                          key={uniqueKey}
                          className={`flex ${msg.isSender ? 'justify-end' : 'justify-start'} ${msg.isSender ? 'animate-fadeIn-sent' : 'animate-fadeIn-received'
                            }`}
                        >
                          <div
                            className={`max-w-[70%] ${imageSrc || videoSrc ? 'md:max-w-md' : audioSrc ? 'md:max-w-sm' : 'md:max-w-2xl'} rounded-2xl shadow-lg relative backdrop-blur-sm flex flex-col overflow-hidden ${msg.isSender
                              ? 'bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-cyan)] text-white rounded-br-none'
                              : 'glass-card text-[var(--sui-text)] rounded-bl-none'
                              } ${msg.isOptimistic ? 'animate-optimistic' : ''}`}
                          >
                            {/* Video Part */}
                            {videoSrc && (
                              <div className="relative p-1">
                                <CustomVideoPlayer
                                  src={videoSrc}
                                  className="rounded-xl border border-white/10 shadow-sm"
                                />
                              </div>
                            )}

                            {/* Audio Part */}
                            {audioSrc && (
                              <div className="p-2 min-w-[250px]">
                                <CustomAudioPlayer src={audioSrc} />
                              </div>
                            )}

                            {/* Image Part */}
                            {imageSrc && (
                              <div className="relative group cursor-pointer p-1" onClick={() => {
                                setFullScreenImage(imageSrc);
                                setShowImageModal(true);
                              }}>
                                <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-sm min-h-[200px] bg-[var(--sui-bg-secondary)]">
                                  <img
                                    src={imageSrc}
                                    alt="Encrypted Image"
                                    className="w-full max-h-[400px] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                    onLoad={() => {
                                      if (isAtBottom) scrollToBottom('auto');
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <Maximize2 className="text-white drop-shadow-md" />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Text Part */}
                            {(captionText || (!imageSrc && !content)) && (
                              <div className={`p-3 px-4 ${imageSrc ? 'pt-2' : ''}`}>
                                <p className="text-sm break-all whitespace-pre-wrap">
                                  {captionText || (
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
                                        !isSessionReady && !sessionKey ? (
                                          <span className="text-orange-400 text-xs flex items-center gap-2">
                                            <Hourglass size={12} className="opacity-70" />
                                            <span>Please start a session to decrypt messages</span>
                                          </span>
                                        ) : (
                                          <span className="italic text-gray-300 text-xs flex items-center gap-1">
                                            <RefreshCw className="animate-spin" size={10} /> Loading content...
                                          </span>
                                        )
                                      )
                                    ) : 'Message content unavailable'
                                  )}
                                </p>
                              </div>
                            )}

                            <div className={`text-[10px] px-3 pb-2 flex justify-end items-center gap-1 ${msg.isSender ? 'text-white/70' : 'text-[var(--sui-text-secondary)]'
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
                    }
                  });
                })()
                }
                <div ref={messagesEndRef} />
              </div >

              {!isAtBottom && (
                <button
                  onClick={() => scrollToBottom()}
                  className="absolute bottom-6 right-6 sui-gradient text-white p-3 rounded-full shadow-2xl hover:scale-110 transition-transform z-10 glow-effect"
                  title="Go to recent messages"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              )}
            </div >

            {/* Input Area */}
            < div className="bg-[var(--sui-bg-tertiary)] p-3 flex flex-col shrink-0 border-t border-[var(--sui-border)] relative" >
              <div className="flex items-end gap-3 relative">
                <div className={`flex-1 rounded-2xl border transition-all shadow-sm relative flex flex-col ${isRecording ? 'bg-[var(--sui-bg-secondary)] border-red-500/30' : 'bg-[var(--sui-bg-secondary)] border-[var(--sui-border)] focus-within:border-[var(--sui-blue)]'}`}>

                  {/* Integrated File Preview */}
                  {filePreviews.length > 0 && !isRecording && (
                    <div className="p-3 pb-0 animate-in slide-in-from-bottom-2 fade-in duration-200 flex gap-2 overflow-x-auto custom-scrollbar">
                      {filePreviews.map((preview, index) => (
                        <div key={index} className="relative inline-block group shrink-0">
                          {preview.type === 'video' ? (
                            <div
                              className="h-20 w-32 rounded-lg border border-[var(--sui-border)] bg-black flex items-center justify-center overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => {
                                setPreviewVideoSrc(preview.url);
                                setShowVideoModal(true);
                              }}
                            >
                              <video src={preview.url} className="h-full w-full object-cover opacity-60" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-white/20 p-1.5 rounded-full backdrop-blur-sm">
                                  <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={preview.url}
                              alt={`Preview ${index}`}
                              className="h-20 w-auto rounded-lg border border-[var(--sui-border)] object-cover shadow-sm"
                            />
                          )}
                          <button
                            onClick={() => {
                              setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                              setFilePreviews(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="absolute -top-2 -right-2 bg-[var(--sui-bg-tertiary)] text-[var(--sui-text-secondary)] border border-[var(--sui-border)] rounded-full p-1 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-sm transition-all opacity-0 group-hover:opacity-100"
                            title="Remove file"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isRecording ? (
                    <div className="p-3 flex items-center justify-between">
                      <button
                        onClick={cancelRecording}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                        title="Cancel Recording"
                      >
                        <Trash2 size={20} />
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                        <span className="font-mono font-medium text-[var(--sui-text)] text-lg">
                          {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                        </span>
                      </div>

                      <button
                        onClick={handleSendAudio}
                        className="p-2 bg-[var(--sui-blue)] text-white rounded-full hover:scale-105 transition-transform shadow-md"
                        title="Send Voice Message"
                      >
                        <Send size={20} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <textarea
                        ref={textareaRef}
                        value={messageText}
                        placeholder="Type a message..."
                        className="w-full bg-transparent border-none focus:ring-0 outline-none p-3 min-h-[44px] max-h-32 resize-none text-[var(--sui-text)] placeholder-[var(--sui-text-tertiary)]"
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (messageText.trim() || selectedFiles.length > 0) {
                              handleSendMessage();
                            }
                          }
                        }}
                        rows={1}
                      />
                      <div className="flex justify-between items-center px-2 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelect}
                              accept="image/*,video/*"
                              multiple
                              className="hidden"
                            />
                            <button
                              className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${selectedFiles.length > 0
                                ? 'text-[var(--sui-blue)] bg-[var(--sui-blue)]/10'
                                : 'text-[var(--sui-text-secondary)] hover:text-[var(--sui-blue)] hover:bg-[var(--sui-bg-tertiary)]'}`}
                              title="Attach File"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Paperclip size={18} />
                            </button>
                          </div>

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

                        {sendingStatus && (
                          <div className="flex-1 flex justify-end items-center px-3 animate-in fade-in duration-300 gap-2">
                            <span className="text-[10px] font-medium text-[var(--sui-blue)] animate-pulse tracking-wide">
                              {sendingStatus}
                            </span>
                            {isSending && sendingImagesCount > 0 && (
                              <button
                                onClick={() => {
                                  cancelSendingRef.current = true;
                                  setSendingStatus("Cancelling...");
                                }}
                                className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-full transition-all"
                                title="Cancel sending"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}

                        {isSending ? (
                          <button
                            disabled
                            className="p-2 rounded-xl bg-[var(--sui-bg-tertiary)] text-[var(--sui-text-secondary)] cursor-not-allowed shrink-0"
                          >
                            <RefreshCw className="animate-spin" size={20} />
                          </button>
                        ) : (messageText.trim() || selectedFiles.length > 0) ? (
                          <button
                            onClick={() => handleSendMessage()}
                            className="p-2 rounded-xl bg-[var(--sui-blue)] text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 shrink-0"
                            title="Send Message"
                          >
                            <Send size={20} />
                          </button>
                        ) : (
                          <button
                            onClick={startRecording}
                            className="p-2 rounded-xl bg-[var(--sui-bg-tertiary)] text-[var(--sui-text)] hover:bg-[var(--sui-bg-tertiary)]/80 border border-[var(--sui-border)] transition-all duration-200 shrink-0"
                            title="Record Audio"
                          >
                            <Mic size={20} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
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
        )
        }
      </div >

      {/* SEAL Session Modal - Blocks app until signature accepted   */}
      {
        showSealModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
            <div className="bg-[var(--sui-bg-secondary)] rounded-lg p-8 max-w-md mx-4 border border-[var(--sui-border)] shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[var(--sui-blue)] to-[var(--sui-purple)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>

                <h2 className="text-2xl font-bold text-[var(--sui-text)] mb-2">🔐 Secure Session Required</h2>
                <p className="text-[var(--sui-text-secondary)] mb-6">
                  Please accept the signature request in your wallet to create an encrypted session.
                  <br /><br />
                  This allows you to decrypt messages without signing every time.
                </p>

                {sealError ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                    <p className="text-red-400 text-sm mb-2">{sealError}</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-[var(--sui-text-secondary)]">
                    <RefreshCw className="animate-spin" size={20} />
                    <span>Waiting for signature...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* End Session Confirmation Modal  */}
      {
        showEndSessionConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
            <div className="bg-[var(--sui-bg-secondary)] rounded-xl p-6 max-w-sm mx-4 border border-[var(--sui-border)] shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-semibold text-[var(--sui-text)] mb-2">End Session?</h3>
              <p className="text-sm text-[var(--sui-text-secondary)] mb-6">
                You will need to sign a new transaction to decrypt messages again.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowEndSessionConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--sui-text)] hover:bg-[var(--sui-bg-tertiary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    refreshSession();
                    setUserEndedSession(true); // Prevent auto-restart
                    setShowEndSessionConfirm(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Settings Modal  */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onEndSession={() => setShowEndSessionConfirm(true)}
      />

      {/* TTL Selector Modal - First Time Setup  */}
      {
        showTTLSelector && (
          <SessionTTLSelector
            isOpen={showTTLSelector}
            onConfirm={() => {
              setShowTTLSelector(false);
              setHasHadSession(false); // Trigger session creation
              attemptRef.current = null;
            }}
          />
        )
      }

      {/* Disconnect Confirmation Modal  */}
      {
        showDisconnectMenu && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
            <div className="bg-[var(--sui-bg-secondary)] rounded-xl p-6 max-w-sm mx-4 border border-[var(--sui-border)] shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-semibold text-[var(--sui-text)] mb-2">Disconnect Wallet?</h3>
              <p className="text-sm text-[var(--sui-text-secondary)] mb-6">
                {sessionKey
                  ? "This will end your current secure session and disconnect your wallet."
                  : "Are you sure you want to disconnect your wallet?"}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDisconnectMenu(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--sui-text-secondary)] hover:bg-[var(--sui-bg-tertiary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (sessionKey) {
                      refreshSession(); // End session first
                    }
                    disconnect(); // Then disconnect wallet
                    setShowDisconnectMenu(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Error Toast Notification  */}
      {
        errorMessage && (
          <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-right-5 duration-300">
            <div className="bg-red-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
              <div className="bg-white/20 p-1 rounded-full shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm font-medium">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="ml-auto hover:bg-white/20 p-1 rounded-lg transition-colors"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )
      }


      {/* Full Screen Image Modal  */}
      {
        showImageModal && (fullScreenImage || galleryImages.length > 0) && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setShowImageModal(false);
              setGalleryImages([]);
              setFullScreenImage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowImageModal(false);
                setGalleryImages([]);
                setFullScreenImage(null);
              }
              if (e.key === 'ArrowRight' && galleryImages.length > 1) {
                setGalleryIndex(prev => (prev + 1) % galleryImages.length);
              }
              if (e.key === 'ArrowLeft' && galleryImages.length > 1) {
                setGalleryIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length);
              }
            }}
            tabIndex={0}
          >
            <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
              <img
                src={galleryImages.length > 0 ? galleryImages[galleryIndex] : fullScreenImage!}
                alt="Full Screen"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />

              <div className="absolute top-4 right-4 flex gap-2">
                {/* Download Button */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDownloadMenu(!showDownloadMenu);
                    }}
                    className={`p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all ${showDownloadMenu ? 'bg-black/80 ring-2 ring-white/20' : ''}`}
                    title="Download Image"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>

                  {/* Download Options Dropdown */}
                  {showDownloadMenu && (
                    <div className="absolute right-0 top-full mt-2 w-32 bg-[var(--sui-bg-secondary)] border border-[var(--sui-border)] rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const src = galleryImages.length > 0 ? galleryImages[galleryIndex] : fullScreenImage!;
                          const link = document.createElement('a');
                          link.href = src;
                          link.download = `sui-messenger-image-${Date.now()}.webp`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          setShowDownloadMenu(false);
                        }}
                        className="px-4 py-2 text-sm text-[var(--sui-text)] hover:bg-[var(--sui-bg-tertiary)] text-left transition-colors"
                      >
                        WebP
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const src = galleryImages.length > 0 ? galleryImages[galleryIndex] : fullScreenImage!;
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(img, 0, 0);
                              const pngUrl = canvas.toDataURL('image/png');
                              const link = document.createElement('a');
                              link.href = pngUrl;
                              link.download = `sui-messenger-image-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          };
                          img.src = src;
                          setShowDownloadMenu(false);
                        }}
                        className="px-4 py-2 text-sm text-[var(--sui-text)] hover:bg-[var(--sui-bg-tertiary)] text-left transition-colors"
                      >
                        PNG
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const src = galleryImages.length > 0 ? galleryImages[galleryIndex] : fullScreenImage!;
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              // Fill white background for JPEG transparency
                              ctx.fillStyle = '#FFFFFF';
                              ctx.fillRect(0, 0, canvas.width, canvas.height);
                              ctx.drawImage(img, 0, 0);
                              const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);
                              const link = document.createElement('a');
                              link.href = jpgUrl;
                              link.download = `sui-messenger-image-${Date.now()}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          };
                          img.src = src;
                          setShowDownloadMenu(false);
                        }}
                        className="px-4 py-2 text-sm text-[var(--sui-text)] hover:bg-[var(--sui-bg-tertiary)] text-left transition-colors"
                      >
                        JPEG
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setShowImageModal(false);
                    setGalleryImages([]);
                    setFullScreenImage(null);
                    setShowDownloadMenu(false);
                  }}
                  className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all"
                >
                  <X size={24} />
                </button>
              </div>
              {galleryImages.length > 1 && (
                <>
                  <button
                    className="absolute left-[-50px] top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length);
                    }}
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    className="absolute right-[-50px] top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryIndex(prev => (prev + 1) % galleryImages.length);
                    }}
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  {/* Counter */}
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white/80 font-medium bg-black/50 px-3 py-1 rounded-full text-sm backdrop-blur-md">
                    {galleryIndex + 1} / {galleryImages.length}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      }

      {/* Video Preview Modal  */}
      {
        showVideoModal && (previewVideoSrc || videoGallery.length > 0) && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setShowVideoModal(false);
              setPreviewVideoSrc(null);
              setVideoGallery([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowVideoModal(false);
                setPreviewVideoSrc(null);
                setVideoGallery([]);
              }
              if (e.key === 'ArrowRight' && videoGallery.length > 1) {
                setVideoGalleryIndex(prev => (prev + 1) % videoGallery.length);
              }
              if (e.key === 'ArrowLeft' && videoGallery.length > 1) {
                setVideoGalleryIndex(prev => (prev - 1 + videoGallery.length) % videoGallery.length);
              }
            }}
            tabIndex={0}
          >
            <div className="relative w-full max-w-4xl max-h-[90vh] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
              <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black">
                <CustomVideoPlayer
                  src={videoGallery.length > 0 ? videoGallery[videoGalleryIndex] : previewVideoSrc!}
                  className="max-h-[85vh]"
                  autoPlay={true}
                />
              </div>

              <button
                onClick={() => {
                  setShowVideoModal(false);
                  setPreviewVideoSrc(null);
                  setVideoGallery([]);
                }}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all z-50"
              >
                <X size={24} />
              </button>

              {/* Navigation Arrows */}
              {videoGallery.length > 1 && (
                <>
                  <button
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full z-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoGalleryIndex(prev => (prev - 1 + videoGallery.length) % videoGallery.length);
                    }}
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full z-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoGalleryIndex(prev => (prev + 1) % videoGallery.length);
                    }}
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  {/* Counter */}
                  <div className="absolute bottom-[-40px] left-1/2 -translate-x-1/2 text-white/80 font-medium bg-black/50 px-3 py-1 rounded-full text-sm backdrop-blur-md">
                    {videoGalleryIndex + 1} / {videoGallery.length}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      }

    </div >
  );
}
