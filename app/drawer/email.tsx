import React from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';

const EmailScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate } = useNavigation();
    const handleBack = () => navigate({ type: 'tab', id: 'home' });

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Email Preferences" titleAr="تفضيلات البريد" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <div className="container mx-auto px-4 md:px-8 text-center">
                    <BilingualText role="Body" className="text-white/60">
                        {lang === 'en' ? 'Manage your email preferences here.' : 'إدارة تفضيلات البريد الإلكتروني الخاصة بك هنا.'}
                    </BilingualText>
                </div>
            </main>
        </div>
    );
};
export default EmailScreen;