import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAcceptMessageRequest, useConversations, useDeclineMessageRequest } from '../../lib/hooks/useMessenger.ts';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import InputField from '../../components/ui/InputField.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import { Conversation } from '../../types/entities.ts';
import { cn } from '../../lib/utils.ts';
import { EmailIcon } from '../../components/icons/EmailIcon.tsx';

const MESSENGER_INBOX_RAIL_CLASS = 'mx-auto w-full max-w-[760px] px-4 md:px-0';

const ConversationListItem: React.FC<{
    conversation: Conversation;
    folder: 'inbox' | 'requests';
}> = ({ conversation, folder }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    const acceptRequest = useAcceptMessageRequest();
    const declineRequest = useDeclineMessageRequest();
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
        if (folder === 'requests') return;
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

    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handlePress();
        }
    };

    return (
        <div
            role={folder === 'requests' ? undefined : 'button'}
            tabIndex={folder === 'requests' ? undefined : 0}
            onClick={handlePress}
            onKeyDown={handleRowKeyDown}
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
                {folder === 'requests' && (
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            disabled={acceptRequest.isPending}
                            onClick={(event) => {
                                event.stopPropagation();
                                acceptRequest.mutate(conversation.id);
                            }}
                            className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                        >
                            {lang === 'en' ? 'Accept' : 'قبول'}
                        </button>
                        <button
                            type="button"
                            disabled={declineRequest.isPending}
                            onClick={(event) => {
                                event.stopPropagation();
                                declineRequest.mutate(conversation.id);
                            }}
                            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-white/70 disabled:opacity-60"
                        >
                            {lang === 'en' ? 'Decline' : 'رفض'}
                        </button>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}


const MessengerListScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const [folder, setFolder] = useState<'inbox' | 'requests'>('inbox');
    const { data: conversations, isLoading, isError } = useConversations(folder);
    const [searchQuery, setSearchQuery] = useState('');

    const handleBack = () => navigate(currentView.params?.from || { type: 'tab', id: 'home' });
    
    const filteredConversations = conversations?.filter(c => 
        c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-[100dvh] flex flex-col overflow-hidden">
            <ScreenHeader titleEn="BookMessenger" titleAr="بوك ماسنجر" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto overflow-x-hidden overscroll-y-contain pt-20 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className={cn(MESSENGER_INBOX_RAIL_CLASS, 'space-y-4 pb-8')}>
                    <div className="grid grid-cols-2 rounded-lg bg-slate-800/70 p-1">
                        {(['inbox', 'requests'] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setFolder(tab)}
                                className={cn(
                                    'rounded-md px-3 py-2 text-sm font-bold transition-colors',
                                    folder === tab
                                        ? 'bg-accent text-white'
                                        : 'text-white/65 hover:bg-white/10'
                                )}
                            >
                                {tab === 'inbox'
                                    ? (lang === 'en' ? 'Inbox' : 'الوارد')
                                    : (lang === 'en' ? 'Requests' : 'الطلبات')}
                            </button>
                        ))}
                    </div>
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
                    {isError && (
                        <ErrorState
                            title={lang === 'en' ? 'Conversations unavailable' : 'المحادثات غير متاحة'}
                            message={lang === 'en' ? 'Error loading conversations.' : 'خطأ في تحميل المحادثات.'}
                        />
                    )}
                    {filteredConversations && filteredConversations.length > 0 && (
                        <div className="divide-y divide-black/10 dark:divide-white/10">
                            {filteredConversations.map(convo => (
                                <ConversationListItem key={convo.id} conversation={convo} folder={folder} />
                            ))}
                        </div>
                    )}
                     {!isLoading && !isError && (!filteredConversations || filteredConversations.length === 0) && (
                         <EmptyState
                            icon={EmailIcon}
                            titleEn="No conversations found"
                            titleAr="لا توجد محادثات"
                            messageEn={
                                searchQuery.trim()
                                    ? 'Try another name or message.'
                                    : folder === 'requests'
                                        ? 'Message requests will appear here.'
                                        : 'Your conversations will appear here.'
                            }
                            messageAr={
                                searchQuery.trim()
                                    ? 'جرّب اسماً أو رسالة أخرى.'
                                    : folder === 'requests'
                                        ? 'ستظهر طلبات المراسلة هنا.'
                                        : 'ستظهر محادثاتك هنا.'
                            }
                         />
                     )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default MessengerListScreen;
