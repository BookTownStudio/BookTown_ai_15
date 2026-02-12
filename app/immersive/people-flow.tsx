import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useSuggestedProfiles } from '../../lib/hooks/useSuggestedProfiles.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import UserFlowCard from '../../components/content/UserFlowCard.tsx';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';

const PeopleFlowScreen: React.FC = () => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    const { data: profiles, isLoading, isError } = useSuggestedProfiles();

    const handleBack = () => {
        navigate(currentView.params?.from || { type: 'tab', id: 'social' });
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
                    <LoadingSpinner />
                </div>
            );
        }

        if (isError || !profiles || profiles.length === 0) {
            return (
                <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-center p-4">
                    <BilingualText>
                        {lang === 'en' ? 'Could not load suggestions. Please try again later.' : 'تعذر تحميل الاقتراحات. يرجى المحاولة مرة أخرى في وقت لاحق.'}
                    </BilingualText>
                </div>
            );
        }

        return (
            <div className="h-screen w-screen bg-black overflow-y-auto scroll-snap-type-y-mandatory">
                {profiles.map(user => (
                    <UserFlowCard key={user.uid} user={user} />
                ))}
            </div>
        );
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-20 bg-transparent">
                <div className="container mx-auto flex h-20 items-center justify-start p-4">
                    <Button
                        variant="icon"
                        onClick={handleBack}
                        className="bg-black/20 backdrop-blur-sm !text-white border border-white/30"
                        aria-label={lang === 'en' ? 'Back to Social' : 'العودة إلى التواصل'}
                    >
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                </div>
            </header>
            {renderContent()}
        </>
    );
};

// Add scroll snap style helper
const style = document.createElement('style');
style.innerHTML = `
.scroll-snap-type-y-mandatory {
    scroll-snap-type: y mandatory;
}
`;
document.head.appendChild(style);

export default PeopleFlowScreen;
