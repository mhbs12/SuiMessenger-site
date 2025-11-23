import { motion } from 'framer-motion';

interface ReadReceiptProps {
    isRead: boolean;
}

export function ReadReceipt({ isRead }: ReadReceiptProps) {
    return (
        <div className="relative w-3.5 h-3.5 flex items-center justify-center" title={isRead ? "Read" : "Sent"}>
            {isRead ? (
                // READ: Solid Droplet Pop
                <motion.svg
                    viewBox="0 0 24 24"
                    className="w-full h-full text-white drop-shadow-sm"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20
                    }}
                >
                    <path
                        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
                        fill="currentColor"
                    />
                    {/* Tiny Checkmark inside - Adjusted for new shape */}
                    <motion.path
                        d="M8.5 13.5L11 16L15.5 10.5"
                        stroke="#3B82F6"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                    />
                </motion.svg>
            ) : (
                // SENT: Floating Outlined Droplet
                <motion.svg
                    viewBox="0 0 24 24"
                    className="w-full h-full text-white/70"
                    animate={{ y: [0, -2, 0] }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    <path
                        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </motion.svg>
            )}
        </div>
    );
}
