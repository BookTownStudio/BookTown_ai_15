import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useChatHistory, useSendMessage } from '../../lib/hooks/useMessenger.ts';
import { useAuth } from '../../lib/auth.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { DirectMessage } from '../../types/entities.ts';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { SendIcon } from '../../components/icons/SendIcon.tsx';
import { PaperclipIcon } from '../../components/icons/PaperclipIcon.tsx';

const ChatBubble: React.FC<{ message: DirectMessage; isMe: boolean; }> = ({ message, isMe }) => {
    const { isRTL } = useI18n();
    return (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-md lg:max-w-lg px-4 py-3 rounded-2xl shadow-sm ${isMe ? 'bg-gradient-to-br from-primary to-sky-500 text-white rounded-br-lg' : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white/90 rounded-bl-lg'}`}>
                <p className={`${isRTL ? 'text-right' : 'text-left'} leading-relaxed`}>{message.text}</p>
            </div>
        </div>
    );
};


const MessengerChatScreen: React.FC = () => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    const { navigate, currentView } = useNavigation();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    
    const conversationId = currentView.type === 'immersive' ? currentView.params?.conversationId : undefined;
    const contactName = currentView.type === 'immersive' ? currentView.params?.contactName : 'Chat';

    const { data: messages, isLoading, isError } = useChatHistory(conversationId);
    const { mutate: sendMessage, isLoading: isSending } = useSendMessage(conversationId);

    const handleBack = () => navigate(currentView.params?.from || { type: 'immersive', id: 'messengerList' });

    const handleSend = () => {
        if (input.trim() && !isSending) {
            sendMessage(input.trim());
            setInput('');
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="h-screen w-full flex flex-col bg-gray-50 dark:bg-slate-900">
            <header className="fixed top-0 left-0 right-0 z-20 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className={`container mx-auto flex h-20 items-center justify-between px-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button variant="ghost" onClick={handleBack}><ChevronLeftIcon className="h-6 w-6" /></Button>
                    <BilingualText role="H1" className="!text-xl">{contactName}</BilingualText>
                    <div className="w-10" />
                </div>
            </header>

            <main className="flex-grow pt-20 pb-16 overflow-y-auto">
                <div className="container mx-auto p-4 space-y-4">
                    {isLoading && <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>}
                    {isError && <BilingualText className="text-center text-red-400">Error loading messages.</BilingualText>}
                    {messages?.map(msg => (
                        <ChatBubble key={msg.id} message={msg} isMe={msg.senderId === user?.uid} />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

             <footer className="fixed bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-slate-900 border-t border-black/10 dark:border-white/10">
                <div className="container mx-auto p-2">
                    <div className="relative flex items-center gap-2">
                        <Button variant="icon" className="flex-shrink-0 !text-slate-500"><PaperclipIcon className="h-6 w-6" /></Button>
                        <input
                            type="text"
                            placeholder={lang === 'en' ? 'Type your message...' : 'اكتب رسالتك...'}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            disabled={isSending}
                            className="w-full bg-slate-200 dark:bg-slate-800 rounded-full py-3 pl-4 pr-12 text-slate-900 dark:text-white/90 placeholder:text-slate-500 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <Button variant="icon" className="absolute right-2 top-1/2 -translate-y-1/2 !text-accent" onClick={handleSend} disabled={isSending}>
                            <SendIcon className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default MessengerChatScreen;