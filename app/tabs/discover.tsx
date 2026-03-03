
import React, { useState, useRef, useEffect, useMemo } from 'react';
import AppNav from '../../components/navigation/AppNav.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { mockAgents, mockBooks } from '../../data/mocks.ts';
import { Agent, AgentSession } from '../../types/entities.ts';
import AgentGridCard from '../../components/content/AgentGridCard.tsx';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { ChevronDownIcon } from '../../components/icons/ChevronDownIcon.tsx';
import { SendIcon } from '../../components/icons/SendIcon.tsx';
import { ClockIcon } from '../../components/icons/ClockIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useToast } from '../../store/toast.tsx';
import { useAgentChat, useAgentSessions, useTogglePinSession } from '../../lib/hooks/useAgentChat.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BookCard from '../../components/content/BookCard.tsx';
import { PinIcon } from '../../components/icons/PinIcon.tsx'; // You might need to create this or reuse an icon
import PageShell from '../../components/layout/PageShell.tsx';
import type { LibrarianRecommendationContext } from '../../types/librarian.ts';

// --- Icons ---
// If PinIcon doesn't exist, create a simple inline one or import if available.
// Assuming it doesn't exist based on provided files, defining a simple one here.
const PinIconSvg = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <line x1="12" y1="17" x2="12" y2="22"></line>
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
    </svg>
);


const LibrarianResponse: React.FC<{ text: string }> = ({ text }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();

    const toRecommendationContext = (rec: Record<string, unknown>): LibrarianRecommendationContext | undefined => {
        const suggestionId =
            typeof rec.suggestionId === 'string' && rec.suggestionId.trim().length > 0
                ? rec.suggestionId.trim()
                : '';
        const suggestionSessionId =
            typeof rec.suggestionSessionId === 'string' && rec.suggestionSessionId.trim().length > 0
                ? rec.suggestionSessionId.trim()
                : '';
        const rankPositionRaw = Number(rec.rankPosition);
        const rankPosition =
            Number.isFinite(rankPositionRaw) && rankPositionRaw > 0
                ? Math.trunc(rankPositionRaw)
                : 0;
        const modeRaw = typeof rec.mode === 'string' ? rec.mode.trim() : '';
        if (!suggestionId || !suggestionSessionId || !rankPosition || !modeRaw) {
            return undefined;
        }
        return {
            source: 'librarian',
            suggestionId,
            suggestionSessionId,
            rankPosition,
            mode: modeRaw as LibrarianRecommendationContext['mode'],
        };
    };

    try {
        const data = JSON.parse(text);
        const recommendations = Array.isArray(data?.recommendations)
            ? data.recommendations
            : Array.isArray(data)
            ? data
            : [];

        if (recommendations.length > 0) {
            return (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {recommendations.map((rec: { title: string, author: string, bookId?: string, suggestionId?: string, suggestionSessionId?: string, rankPosition?: number, mode?: string }, idx: number) => {
                            const recommendationContext = toRecommendationContext(rec as unknown as Record<string, unknown>);
                            if (typeof rec.bookId === 'string' && rec.bookId.trim().length > 0) {
                                const canonicalBookId = rec.bookId.trim();
                                return (
                                    <div key={typeof rec.suggestionId === 'string' && rec.suggestionId.trim().length > 0 ? rec.suggestionId.trim() : canonicalBookId} onClick={() => navigate({ type: 'immersive', id: 'bookDetails', params: { bookId: canonicalBookId, from: currentView, recommendationContext } })}>
                                        <BookCard bookId={canonicalBookId} layout="list" className="w-28 mr-2" />
                                    </div>
                                );
                            }

                            // Try to find the book in our mock catalog to get an ID and Cover
                            // In a real app, the agent would ideally return IDs or we use a search service.
                            const bookEntry = Object.values(mockBooks).find(b => b.titleEn.toLowerCase() === rec.title.toLowerCase() || b.titleAr === rec.title);
                            
                            // Fallback visualization if book not in catalog
                            if (!bookEntry) {
                                return (
                                    <div key={idx} className="bg-white/10 p-2 rounded-lg border border-white/10 w-40 flex-shrink-0">
                                        <p className="font-bold text-sm truncate">{rec.title}</p>
                                        <p className="text-xs opacity-70 truncate">{rec.author}</p>
                                    </div>
                                )
                            }

                            return (
                                <div key={`${bookEntry.id}_${idx}`} onClick={() => navigate({ type: 'immersive', id: 'bookDetails', params: { bookId: bookEntry.id, from: currentView, recommendationContext } })}>
                                    <BookCard bookId={bookEntry.id} layout="list" className="w-28 mr-2" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
    } catch (e) {
        // Non-JSON payloads are rendered as a structured fallback card.
    }
    return (
        <div className="bg-white/10 p-3 rounded-lg border border-white/10 w-44">
            <p className="font-bold text-sm truncate">{lang === 'en' ? 'Book request needed' : 'مطلوب طلب كتاب'}</p>
            <p className="text-xs opacity-80 mt-1">
                {lang === 'en'
                    ? 'Share a title, author, or topic and I will return book cards.'
                    : 'شارك عنوانًا أو مؤلفًا أو موضوعًا وسأعرض بطاقات كتب.'}
            </p>
        </div>
    );
};


const AgentChatUI: React.FC<{ agent: Agent, sessionId: string }> = ({ agent, sessionId }) => {
    const { lang, isRTL } = useI18n();
    const [input, setInput] = useState('');
    const [examplesVisible, setExamplesVisible] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { messages, isLoading, sendMessage, isSending } = useAgentChat(agent.id, sessionId);

    const examplePrompts = lang === 'en' ? agent.examplePromptsEn : agent.examplePromptsAr;
    const placeholderText = lang === 'en' ? agent.placeholderEn : agent.placeholderAr;

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${Math.min(scrollHeight, 160)}px`;
        }
    }, [input]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isSending]);
    
    // Hide examples if there are messages
    useEffect(() => {
        if (messages && messages.length > 0) {
            setExamplesVisible(false);
        }
    }, [messages]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    };

    const handleSend = (text: string = input) => {
        if (isSending || !text.trim()) return;
        sendMessage(text);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };
    
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    return (
        <div className="flex flex-col h-full relative">
            
            {/* Messages Area */}
            <div className="flex-grow overflow-y-auto px-4 pb-32 pt-4 space-y-4">
                {isLoading && (!messages || messages.length === 0) && <div className="flex justify-center pt-10"><LoadingSpinner /></div>}
                
                {messages?.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl ${
                            msg.role === 'user' 
                                ? 'bg-primary text-white rounded-br-lg' 
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white/90 rounded-bl-lg'
                        }`}>
                            {msg.role === 'model' && agent.id === 'librarian' ? (
                                <LibrarianResponse text={msg.text} />
                            ) : (
                                <p className={`whitespace-pre-wrap ${isRTL ? 'text-right' : 'text-left'}`}>{msg.text}</p>
                            )}
                        </div>
                    </div>
                ))}
                
                {isSending && (
                    <div className="flex justify-start">
                        <div className="p-3 rounded-2xl bg-slate-200 dark:bg-slate-700 rounded-bl-lg">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Centered Examples (Only show if not loading AND no messages) */}
            {!isLoading && (!messages || messages.length === 0) && (
                <div className="absolute inset-0 flex flex-col justify-center items-center p-4 pointer-events-none">
                    <div className="pointer-events-auto w-full max-w-xl flex flex-col items-center">
                        {/* Example Cards */}
                        <div className={`w-full space-y-3 transition-all duration-500 ease-in-out ${examplesVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                             <div className="flex justify-center mb-4">
                                <button 
                                    onClick={() => setExamplesVisible(!examplesVisible)}
                                    className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors bg-white/50 dark:bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm"
                                >
                                    {examplesVisible ? (lang === 'en' ? 'Hide examples' : 'إخفاء الأمثلة') : (lang === 'en' ? 'Show examples' : 'إظهار الأمثلة')}
                                    <ChevronDownIcon className={`h-4 w-4 transition-transform duration-300 ${examplesVisible ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {examplePrompts.map((prompt, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleSend(prompt)}
                                    className="w-full p-4 text-left rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 transition-all duration-200 backdrop-blur-sm group shadow-sm hover:shadow-md"
                                >
                                     <BilingualText role="Body" className="font-medium group-hover:text-primary dark:group-hover:text-accent transition-colors">
                                        {prompt}
                                    </BilingualText>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

             {/* Input Footer */}
             <footer className="absolute bottom-0 left-0 right-0 z-30 bg-gray-50 dark:bg-slate-900 border-t border-black/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)]">
                <div className="container mx-auto p-3 md:p-4">
                    <div className="relative flex items-end">
                        <textarea
                            ref={textareaRef}
                            placeholder={placeholderText}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            value={input}
                            onChange={handleInput}
                            onKeyDown={handleKeyPress}
                            rows={1}
                            className="w-full bg-slate-200 dark:bg-slate-800 rounded-2xl py-4 pl-6 pr-14 text-slate-900 dark:text-white/90 placeholder:text-slate-500 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent text-lg shadow-inner resize-none overflow-y-auto min-h-[60px] max-h-[160px]"
                        />
                        <Button variant="icon" onClick={() => handleSend()} className="absolute right-2 bottom-3 !text-accent hover:bg-accent/10 rounded-full p-2">
                            <SendIcon className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const HistoryView: React.FC<{ onClose: () => void, onSelectSession: (sessionId: string, agentId: string) => void }> = ({ onClose, onSelectSession }) => {
    const { lang } = useI18n();
    const { data: sessions, isLoading } = useAgentSessions();
    const { mutate: togglePin } = useTogglePinSession();

    const pinnedSessions = sessions?.filter(s => s.isPinned) || [];
    const recentSessions = sessions?.filter(s => !s.isPinned) || [];

    const handlePinToggle = (e: React.MouseEvent, sessionId: string, isPinned: boolean) => {
        e.stopPropagation();
        togglePin({ sessionId, isPinned: !isPinned });
    }

    const renderSessionItem = (session: AgentSession) => {
        const agent = mockAgents.find(a => a.id === session.agentId);
        if (!agent) return null;

        return (
            <button 
                key={session.id} 
                onClick={() => onSelectSession(session.id, session.agentId)}
                className="w-full text-left p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-black/5 dark:border-white/5 transition-all group relative"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${agent.color} bg-opacity-10 bg-current`}>
                        <agent.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-grow overflow-hidden">
                        <div className="flex justify-between items-center">
                            <BilingualText className="font-semibold truncate pr-6">{session.title || agent.name}</BilingualText>
                            <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(session.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-white/60 truncate mt-1">{session.lastMessage}</p>
                    </div>
                </div>
                <button 
                    onClick={(e) => handlePinToggle(e, session.id, !!session.isPinned)}
                    className={`absolute top-4 right-4 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${session.isPinned ? 'text-accent' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`}
                >
                    <PinIconSvg className={`h-4 w-4 ${session.isPinned ? 'fill-current' : ''}`} />
                </button>
            </button>
        );
    };

    return (
        <div className="absolute inset-0 z-40 bg-gray-50 dark:bg-slate-900 flex flex-col">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <BilingualText role="H1" className="!text-2xl">
                    {lang === 'en' ? 'History' : 'السجل'}
                </BilingualText>
                <Button variant="ghost" onClick={onClose}>
                    {lang === 'en' ? 'Close' : 'إغلاق'}
                </Button>
            </div>
            
            <div className="flex-grow overflow-y-auto px-4 pb-20">
                <div className="container mx-auto space-y-6">
                    {isLoading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
                    
                    {/* Pinned Section */}
                    {pinnedSessions.length > 0 && (
                        <div>
                            <BilingualText role="Caption" className="mb-2 block uppercase tracking-wider text-accent">
                                {lang === 'en' ? 'Pinned' : 'مثبتة'}
                            </BilingualText>
                            <div className="space-y-2">
                                {pinnedSessions.map(renderSessionItem)}
                            </div>
                        </div>
                    )}

                    {/* Recent Section */}
                    <div>
                        <BilingualText role="Caption" className="mb-2 block uppercase tracking-wider">
                            {lang === 'en' ? 'Recent' : 'الأخيرة'}
                        </BilingualText>
                        <div className="space-y-2">
                            {recentSessions.length > 0 ? (
                                recentSessions.map(renderSessionItem)
                            ) : (
                                !isLoading && <p className="text-slate-500 text-center py-4">{lang === 'en' ? 'No recent conversations.' : 'لا توجد محادثات حديثة.'}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const AgentInteractionShell = ({ agent, sessionId, onBack, onSelectAgent }: { agent: Agent, sessionId: string, onBack: () => void, onSelectAgent: (id: Agent['id']) => void }) => {
    const { lang } = useI18n();
    const headerRef = useRef<HTMLElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const [chromeHeight, setChromeHeight] = useState({ header: 80, tabs: 72 });

    useEffect(() => {
        const updateHeights = () => {
            const header = headerRef.current?.offsetHeight || 0;
            const tabs = tabsRef.current?.offsetHeight || 0;
            setChromeHeight({ header, tabs });
        };

        updateHeights();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateHeights);
            return () => window.removeEventListener('resize', updateHeights);
        }

        const observer = new ResizeObserver(() => updateHeights());
        if (headerRef.current) observer.observe(headerRef.current);
        if (tabsRef.current) observer.observe(tabsRef.current);
        window.addEventListener('resize', updateHeights);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeights);
        };
    }, []);

    const chatTopOffset = chromeHeight.header + chromeHeight.tabs;

    return (
        <PageShell scrollable={false}>
            <header ref={headerRef} className="fixed top-0 left-0 right-0 z-20 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className="container mx-auto flex h-20 items-center justify-between px-4">
                    <Button variant="ghost" onClick={onBack} aria-label={lang === 'en' ? 'Back to Agents' : 'العودة للمساعدين'}>
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                    <BilingualText role="H1" className="!text-xl absolute left-1/2 -translate-x-1/2">
                        {agent.name}
                    </BilingualText>
                    <div className="w-10"></div>
                </div>
            </header>

            <div
                ref={tabsRef}
                className="fixed left-0 right-0 z-10 bg-gray-50 dark:bg-slate-900 border-b border-black/10 dark:border-white/10"
                style={{ top: `${chromeHeight.header}px` }}
            >
                <div className="container mx-auto p-2">
                    <div className="grid grid-cols-4 gap-2">
                        {mockAgents.map(a => {
                            const isActive = agent.id === a.id;
                            return (
                                <button
                                    key={a.id}
                                    onClick={() => onSelectAgent(a.id)}
                                    className={`
                                        flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-colors duration-200
                                        ${a.isPremium ? 'opacity-60' : ''}
                                        ${isActive 
                                            ? 'bg-primary/10 dark:bg-blue-900/40 text-accent' 
                                            : 'text-slate-500 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5'}
                                    `}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <a.icon className="h-7 w-7 mb-1" />
                                    <BilingualText role="Caption" className="!text-xs !text-inherit text-center">
                                        {a.name}
                                    </BilingualText>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            <main className="flex-grow overflow-hidden relative">
                {/* We use absolute positioning inside AgentChatUI to handle scrolling properly */}
                 <div className="absolute inset-x-0 bottom-0 pt-2" style={{ top: `${chatTopOffset}px` }}>
                    <AgentChatUI key={sessionId} agent={agent} sessionId={sessionId} />
                 </div>
            </main>
        </PageShell>
    );
};


const DiscoverScreen: React.FC = () => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [selectedAgentId, setSelectedAgentId] = useState<Agent['id'] | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    
    const { resetTokens } = useNavigation();
    const mainContentRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    // Tab Reset Effect
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            if (resetTokens.discover > 0) {
                if (selectedAgentId) {
                    setSelectedAgentId(null);
                    setSessionId(null);
                } else {
                    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        }
    }, [resetTokens.discover, selectedAgentId]);

    const handleSelectAgent = (agentId: Agent['id']) => {
        const agent = mockAgents.find(a => a.id === agentId);
        if (agent) {
            if (agent.isPremium) {
                showToast(lang === 'en' ? "Requires Premium Subscription" : "يتطلب اشتراكًا مميزًا");
                return;
            }
            setSelectedAgentId(agentId);
            // For new chats, generate a new session ID
            setSessionId(`session_${agentId}_${Date.now()}`);
        }
    }

    const handleResumeSession = (sessId: string, agentId: string) => {
        const agent = mockAgents.find(a => a.id === agentId);
        if (agent) {
            setSelectedAgentId(agentId);
            setSessionId(sessId);
            setShowHistory(false);
        }
    }
    
    const selectedAgent = mockAgents.find(a => a.id === selectedAgentId);

    if (selectedAgent && sessionId) {
        return <AgentInteractionShell 
                    agent={selectedAgent} 
                    sessionId={sessionId}
                    onBack={() => { setSelectedAgentId(null); setSessionId(null); }}
                    onSelectAgent={handleSelectAgent}
                />
    }

    return (
        <PageShell ref={mainContentRef} scrollable={true}>
            <AppNav titleEn="BookTown" titleAr="بوكتاون" />
            
            <main className="flex-grow pt-20 pb-16 relative">
                {showHistory && (
                    <HistoryView onClose={() => setShowHistory(false)} onSelectSession={handleResumeSession} />
                )}
                
                <div className="container mx-auto px-4 md:px-8 py-6">
                     <div className="flex items-center justify-center gap-3 mb-8 h-10">
                        <button 
                            onClick={() => setShowHistory(true)}
                            className="p-2 bg-slate-200 dark:bg-slate-800 rounded-full hover:bg-accent/10 transition-colors text-slate-500 dark:text-white/60 hover:text-accent"
                            aria-label={lang === 'en' ? 'View Chat History' : 'عرض سجل الدردشة'}
                        >
                             <ClockIcon className="h-5 w-5"/>
                        </button>
                        
                        <BilingualText role="Body" className="font-medium text-slate-500 dark:text-white/60">
                            {lang === 'en' ? 'Chat with Bookwise AI Agents' : 'تحدث مع وكلاء الذكاء الاصطناعي'}
                        </BilingualText>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {mockAgents.map(agent => (
                            <AgentGridCard
                                key={agent.id}
                                agent={agent}
                                onClick={() => handleSelectAgent(agent.id)}
                            />
                        ))}
                    </div>
                </div>
            </main>
        </PageShell>
    );
};

export default DiscoverScreen;
