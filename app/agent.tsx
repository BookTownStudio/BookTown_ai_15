

import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../components/icons/ChevronLeftIcon.tsx';
import { SendIcon } from '../components/icons/SendIcon.tsx';
import { useAgentChat } from '../lib/hooks/useAgentChat.ts';
import { mockAgents } from '../data/mocks.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';

const AgentChatScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang, isRTL } = useI18n();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const agentId = currentView.type === 'immersive' && currentView.params?.agentId ? currentView.params.agentId : undefined;
    // For this mock, we'll use a hardcoded session ID per agent
    const sessionId = agentId ? `session_${agentId}_123` : undefined;
    
    const { messages, isLoading, isError, sendMessage, isSending } = useAgentChat(agentId, sessionId);
    const agent = mockAgents.find(a => a.id === agentId);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleBack = () => {
        // A better back navigation would use the 'from' param if available
        navigate({ type: 'tab', id: 'discover' }); 
    };

    const handleSend = () => {
        if (input.trim() && !isSending) {
            // FIX: sendMessage (mutate) correctly accepts string now via react-query fix.
            sendMessage(input.trim());
            setInput('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };
    
    return (
        <div className="h-screen w-full flex flex-col bg-gray-50 dark:bg-slate-900">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-20 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className={`container mx-auto flex h-20 items-center justify-between px-4 md:px-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div>
                        <Button variant="ghost" onClick={handleBack} aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
                            <ChevronLeftIcon className="h-6 w-6" />
                        </Button>
                    </div>

                    {agent && (
                         <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
                            <img src={agent.avatarUrl} alt={agent.name} className="h-10 w-10 rounded-full" />
                            <BilingualText role="Body" className="!font-semibold">
                                {agent.name}
                            </BilingualText>
                        </div>
                    )}

                    <div>{/* Right side can have other actions */}</div>
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-grow pt-20 pb-16 overflow-y-auto">
                <div className="container mx-auto p-4 md:p-8 h-full">
                    {isLoading && <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>}
                    {isError && <BilingualText className="text-center text-red-400">Error loading chat.</BilingualText>}
                    <div className="space-y-4">
                        {messages?.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-md p-3 rounded-2xl ${msg.role === 'user' ? 'bg-primary text-white rounded-br-lg' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white/90 rounded-bl-lg'}`}>
                                    <p className={isRTL ? 'text-right' : 'text-left'}>{msg.text}</p>
                                </div>
                            </div>
                        ))}
                        {isSending && (
                             <div className="flex justify-start">
                                <div className="max-w-md p-3 rounded-2xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white/90 rounded-bl-lg">
                                   <LoadingSpinner />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </main>
            
            {/* Input bar */}
             <footer className="fixed bottom-0 left-0 right-0 z-10 bg-gray-50 dark:bg-slate-900 border-t border-black/10 dark:border-white/10">
                <div className="container mx-auto p-2">
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            placeholder={lang === 'en' ? 'Type your message...' : 'اكتب رسالتك...'}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
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

export default AgentChatScreen;
