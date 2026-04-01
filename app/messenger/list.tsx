import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useConversations } from '../../lib/hooks/useMessenger.ts';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import InputField from '../../components/ui/InputField.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { Conversation } from '../../types/entities.ts';
import { cn } from '../../lib/utils.ts';

const MESSENGER_INBOX_RAIL_CLASS = 'mx-auto w-full max-w-[760px] px-4 md:px-0';

const ConversationListItem: React.FC<{ conversation: Conversation }> = ({ conversation }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    const prefillText =
        currentView.type === 'immersive' && typeof currentView.params?.prefillText === 'string'
            ? currentView.params.prefillText.trim()
            : '';
    const attachedBook =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedBook === 'object'
            ? currentView.params.attachedBook
            : undefined;
    const attachedPublication =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedPublication === 'object'
            ? currentView.params.attachedPublication
            : undefined;
    const attachedQuote =
        currentView.type === 'immersive' &&
        currentView.params &&
        typeof currentView.params?.attachedQuote === 'object'
            ? currentView.params.attachedQuote
            : undefined;

    const handlePress = () => {
        navigate({
            type: 'immersive',
            id: 'messengerChat',
            params: {
                from: currentView,
                conversationId: conversation.id,
                contactName: conversation.contactName,
                ...(prefillText ? { prefillText } : {}),
                ...(attachedBook ? { attachedBook } : {}),
                ...(attachedPublication ? { attachedPublication } : {}),
                ...(attachedQuote ? { attachedQuote } : {}),
            }
        });
    };

    const handleProfileClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate({ type: 'immersive', id: 'profile', params: { userId: conversation.contactId, from: currentView } });
    };
    
    const timeAgo = (dateString: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "m" : "د");
        return 'now';
    }

    return (
        <button
            onClick={handlePress}
            className="w-full text-left px-4 py-4 transition-colors hover:bg-slate-800/60 md:px-5"
        >
            <div className="flex items-center gap-4">
            <div className="relative">
                <button onClick={handleProfileClick} className="flex-shrink-0">
                    <img src={conversation.contactAvatar} alt={conversation.contactName} className="h-14 w-14 rounded-full" />
                </button>
            </div>
            <div className="flex-grow overflow-hidden">
                <div className="flex items-baseline justify-between gap-3">
                    <button onClick={handleProfileClick} className="text-left group">
                        <BilingualText className="font-bold truncate group-hover:underline">{conversation.contactName}</BilingualText>
                    </button>
                    <BilingualText role="Caption" className="shrink-0 whitespace-nowrap">
                        {timeAgo(conversation.timestamp)}
                    </BilingualText>
                </div>
                <div className="mt-1 flex items-start justify-between gap-3">
                    <BilingualText role="Body" className="min-w-0 !text-sm text-slate-500 dark:text-white/60 line-clamp-2">
                        {conversation.lastMessage}
                    </BilingualText>
                    {conversation.unreadCount > 0 && (
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                            {conversation.unreadCount}
                        </div>
                    )}
                </div>
            </div>
            </div>
        </button>
    );
}


const MessengerListScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { data: conversations, isLoading, isError } = useConversations();
    const [searchQuery, setSearchQuery] = useState('');

    const handleBack = () => navigate(currentView.params?.from || { type: 'tab', id: 'home' });
    
    const filteredConversations = conversations?.filter(c => 
        c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="BookMessenger" titleAr="بوك ماسنجر" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20">
                <div className={cn(MESSENGER_INBOX_RAIL_CLASS, 'space-y-4 pb-8')}>
                     <InputField
                        id="messenger-search"
                        label=""
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={lang === 'en' ? 'Search messages...' : 'ابحث في الرسائل...'}
                    />
                    <div className="overflow-hidden rounded-3xl border border-black/10 bg-white/40 shadow-sm dark:border-white/10 dark:bg-white/5">
                    {isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
                    {isError && <BilingualText className="text-center py-8">Error loading conversations.</BilingualText>}
                    {filteredConversations && filteredConversations.length > 0 && (
                        <div className="divide-y divide-black/10 dark:divide-white/10">
                            {filteredConversations.map(convo => (
                                <ConversationListItem key={convo.id} conversation={convo} />
                            ))}
                        </div>
                    )}
                     {!isLoading && (!filteredConversations || filteredConversations.length === 0) && (
                         <BilingualText className="text-center py-8 text-slate-500">No conversations found.</BilingualText>
                     )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default MessengerListScreen;
