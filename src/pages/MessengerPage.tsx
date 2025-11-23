import { useCurrentAccount } from '@mysten/dapp-kit';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chat } from '../components/Chat';
import { Inbox } from '../components/Inbox';

export function MessengerPage() {
    const account = useCurrentAccount();
    const navigate = useNavigate();

    useEffect(() => {
        if (!account) {
            navigate('/');
        }
    }, [account, navigate]);

    if (!account) return null;

    return (
        <div className="h-screen w-screen bg-[var(--sui-dark)] flex overflow-hidden">
            {/* We will refactor Chat to take full height/width here */}
            <Chat />
        </div>
    );
}
