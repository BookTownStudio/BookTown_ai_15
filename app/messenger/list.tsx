import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useConversations } from '../../lib/hooks/useMessenger.ts';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import InputField from '../../components/ui/InputField.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { Conversation } from '../../types/entities.ts';

const ConversationListItem: React.FC<{ conversation: Conversation }> = ({ conversation }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();

    const handlePress = () => {
        navigate({
            type: 'immersive',
            id: 'messengerChat',
            params: { from: currentView, conversationId: conversation.id, contactName: conversation.contactName }
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
        <button onClick={handlePress} className="w-full text-left p-4 flex items-center gap-4 border-b border-black/10 dark:border-white/10 hover:bg-slate-800 transition-colors">
            <div className="relative">
                <button onClick={handleProfileClick} className="flex-shrink-0">
                    <img src={conversation.contactAvatar} alt={conversation.contactName} className="h-14 w-14 rounded-full" />
                </button>
            </div>
            <div className="flex-grow overflow-hidden">
                <div className="flex justify-between items-baseline">
                    <button onClick={handleProfileClick} className="text-left group">
                        <BilingualText className="font-bold truncate group-hover:underline">{conversation.contactName}</BilingualText>
                    </button>
                    <BilingualText role="Caption">{timeAgo(conversation.timestamp)}</BilingualText>
                </div>
                <div className="flex justify-between items-start mt-1">
                    <BilingualText role="Body" className="!text-sm text-slate-500 dark:text-white/60 line-clamp-2">{conversation.lastMessage}</BilingualText>
                    {conversation.unreadCount > 0 && (
                        <div className="flex-shrink-0 ml-2 bg-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {conversation.unreadCount}
                        </div>
                    )}
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
                <div className="container mx-auto px-4 md:px-8">
                     <InputField
                        id="messenger-search"
                        label=""
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={lang === 'en' ? 'Search messages...' : 'ابحث في الرسائل...'}
                    />
                </div>
                <div className="mt-4">
                    {isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
                    {isError && <BilingualText className="text-center py-8">Error loading conversations.</BilingualText>}
                    {filteredConversations && filteredConversations.length > 0 && (
                        <div>
                            {filteredConversations.map(convo => (
                                <ConversationListItem key={convo.id} conversation={convo} />
                            ))}
                        </div>
                    )}
                     {!isLoading && (!filteredConversations || filteredConversations.length === 0) && (
                         <BilingualText className="text-center py-8 text-slate-500">No conversations found.</BilingualText>
                     )}
                </div>
            </main>
        </div>
    );
};

export default MessengerListScreen;