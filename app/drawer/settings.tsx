import React, { useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useTheme } from '../../store/theme.tsx';
import { useReadingPreferences, FontSize, FontStyle } from '../../store/reading-prefs.tsx';
import Button from '../../components/ui/Button.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useUpdateAiConsent } from '../../lib/hooks/useUpdateAiConsent.ts';
import { useNotificationPreferences } from '../../lib/hooks/useNotificationPreferences.ts';

// Icons
import { UploadIcon } from '../../components/icons/UploadIcon.tsx';
import { DownloadIcon } from '../../components/icons/DownloadIcon.tsx';
import { TrashIcon } from '../../components/icons/TrashIcon.tsx';
import { MoonIcon } from '../../components/icons/MoonIcon.tsx';
// Added missing SunIcon import
import { SunIcon } from '../../components/icons/SunIcon.tsx';
import { FontSizeIcon } from '../../components/icons/FontSizeIcon.tsx';
import { FontIcon } from '../../components/icons/FontIcon.tsx';
import { LanguageIcon } from '../../components/icons/LanguageIcon.tsx';
import { UserIcon } from '../../components/icons/UserIcon.tsx';
import { SecurityIcon } from '../../components/icons/SecurityIcon.tsx';
import { ChevronRightIcon } from '../../components/icons/ChevronRightIcon.tsx';
import { BrainIcon } from '../../components/icons/BrainIcon.tsx';
import { AdminIcon } from '../../components/icons/AdminIcon.tsx';
import { BellIcon } from '../../components/icons/BellIcon.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import ContentRail from '../../components/layout/ContentRail.tsx';

const SettingsSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-8">
        <BilingualText role="Caption" className="!text-accent uppercase tracking-wider mb-2 px-4">{title}</BilingualText>
        <div className="bg-slate-800/50 border border-white/10 rounded-lg">
            {React.Children.map(children, (child, index) => (
                <>
                    {child}
                    {index < React.Children.count(children) - 1 && <div className="border-t border-white/10 mx-4" />}
                </>
            ))}
        </div>
    </div>
);

const SettingsItem: React.FC<{ icon?: React.FC<any>, label: string, onClick?: () => void, children?: React.ReactNode, isDestructive?: boolean }> = ({ icon: Icon, label, onClick, children, isDestructive = false }) => {
    const { isRTL } = useI18n();
    const content = (
        <div className={`flex items-center justify-between w-full p-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                {Icon && <Icon className={`h-6 w-6 flex-shrink-0 ${isDestructive ? 'text-red-400' : 'text-accent'}`} />}
                <BilingualText className={`flex-grow ${isDestructive ? '!text-red-400' : ''}`}>{label}</BilingualText>
            </div>
            {children ? children : (onClick && <ChevronRightIcon className="h-5 w-5 text-white/50 flex-shrink-0" />)}
        </div>
    );

    if (onClick) {
        return (
            <button onClick={onClick} className="w-full text-left transition-colors hover:bg-white/5 first:rounded-t-lg last:rounded-b-lg">
                {content}
            </button>
        );
    }
    return <div className="w-full">{content}</div>;
};

const ToggleField: React.FC<{ checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <label className="relative inline-flex items-center cursor-pointer">
        <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={checked} 
            onChange={(e) => onChange(e.target.checked)} 
            disabled={disabled}
        />
        <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/50 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
);

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="flex items-center bg-slate-700 rounded-lg p-1 text-sm">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-1 font-semibold rounded-md transition-colors w-full ${value === option.value ? 'bg-slate-500 text-white' : 'text-white/70 hover:bg-slate-600'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SettingsScreen: React.FC = () => {
    const { lang, setLang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { theme, toggleTheme } = useTheme();
    const { fontSize, setFontSize, fontStyle, setFontStyle } = useReadingPreferences();
    const { user, isAdmin } = useAuth();
    const { data: profile } = useUserProfile(user?.uid);
    const { mutate: updateAiConsent } = useUpdateAiConsent();
    const { preferences, update: updatePrefs, isLoading: isPrefsLoading } = useNotificationPreferences();

    const [isNotifsOpen, setNotifsOpen] = useState(false);

    const handleBack = () => navigate({ type: 'tab', id: 'home' });
    
    const toggleCategory = (category: string, value: boolean) => {
        if (preferences) {
            // FIX: Argument passed correctly as TVariables now supports objects via react-query fix.
            updatePrefs({
                categories: {
                    ...preferences.categories,
                    [category]: value
                }
            });
        }
    };

    const toggleChannel = (channel: string, value: boolean) => {
        if (preferences) {
            // FIX: Argument passed correctly.
            updatePrefs({
                channels: {
                    ...preferences.channels,
                    [channel]: value
                }
            });
        }
    };

    const updateDmPrivacyMode = (dmPrivacyMode: 'nobody' | 'mutual_follows' | 'everyone') => {
        updatePrefs({ dmPrivacyMode });
    };

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Settings" titleAr="الإعدادات" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <ContentRail variant="narrow">
                
                    <SettingsSection title={lang === 'en' ? 'Notifications' : 'الإشعارات'}>
                        <SettingsItem 
                            icon={BellIcon} 
                            label={lang === 'en' ? 'Notification Settings' : 'إعدادات الإشعارات'} 
                            onClick={() => setNotifsOpen(!isNotifsOpen)}
                        >
                             <ChevronRightIcon className={`h-5 w-5 text-white/50 transition-transform ${isNotifsOpen ? 'rotate-90' : ''}`} />
                        </SettingsItem>
                        
                        {isNotifsOpen && (
                            <div className="px-4 pb-6 space-y-8 animate-fade-in-up">
                                {isPrefsLoading ? (
                                    <div className="py-8"><LoadingSpinner className="mx-auto" /></div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between py-3 border-b border-white/10">
                                            <div>
                                                <BilingualText role="Body" className="font-bold">
                                                    {lang === 'en' ? 'Enable In-App Notifications' : 'تفعيل الإشعارات في التطبيق'}
                                                </BilingualText>
                                            </div>
                                            <ToggleField checked={!!preferences?.channels.in_app} onChange={(v) => toggleChannel('in_app', v)} />
                                        </div>

                                        <div className={preferences?.channels.in_app ? "opacity-100" : "opacity-30 pointer-events-none"}>
                                            <div className="mb-6">
                                                <BilingualText role="Label" className="!text-accent !text-[10px] mb-2 px-1">
                                                    {lang === 'en' ? 'Social Interactions' : 'التفاعلات الاجتماعية'}
                                                </BilingualText>
                                                <div className="space-y-1">
                                                    <SettingsItem label={lang === 'en' ? 'Likes' : 'الإعجابات'}>
                                                        <ToggleField checked={!!preferences?.categories.likes} onChange={(v) => toggleCategory('likes', v)} />
                                                    </SettingsItem>
                                                    <SettingsItem label={lang === 'en' ? 'Comments' : 'التعليقات'}>
                                                        <ToggleField checked={!!preferences?.categories.comments} onChange={(v) => toggleCategory('comments', v)} />
                                                    </SettingsItem>
                                                    <SettingsItem label={lang === 'en' ? 'Reposts' : 'إعادة النشر'}>
                                                        <ToggleField checked={!!preferences?.categories.reposts} onChange={(v) => toggleCategory('reposts', v)} />
                                                    </SettingsItem>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <BilingualText role="Label" className="!text-accent !text-[10px] mb-2 px-1">
                                                    {lang === 'en' ? 'Connections' : 'الاتصالات'}
                                                </BilingualText>
                                                <SettingsItem label={lang === 'en' ? 'Messages' : 'الرسائل'}>
                                                    <ToggleField checked={!!preferences?.categories.messages} onChange={(v) => toggleCategory('messages', v)} />
                                                </SettingsItem>
                                                <SettingsItem label={lang === 'en' ? 'Followers' : 'المتابعون'}>
                                                    <ToggleField checked={!!preferences?.categories.follows} onChange={(v) => toggleCategory('follows', v)} />
                                                </SettingsItem>
                                            </div>

                                            <div>
                                                <BilingualText role="Label" className="!text-accent !text-[10px] mb-2 px-1">
                                                    {lang === 'en' ? 'Other' : 'أخرى'}
                                                </BilingualText>
                                                <div className="space-y-1">
                                                    <SettingsItem label={lang === 'en' ? 'Mentions' : 'الإشارات'}>
                                                        <ToggleField checked={!!preferences?.categories.mentions} onChange={(v) => toggleCategory('mentions', v)} />
                                                    </SettingsItem>
                                                    <SettingsItem label={lang === 'en' ? 'Quotes' : 'الاقتباسات'}>
                                                        <ToggleField checked={!!preferences?.categories.quotes} onChange={(v) => toggleCategory('quotes', v)} />
                                                    </SettingsItem>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </SettingsSection>

                    <SettingsSection title={lang === 'en' ? 'Privacy' : 'الخصوصية'}>
                        <SettingsItem icon={SecurityIcon} label={lang === 'en' ? 'Direct Messages' : 'الرسائل المباشرة'}>
                            <div className="w-64 space-y-2">
                                <BilingualText role="Caption" className="block text-right !text-[11px] text-white/60">
                                    {lang === 'en' ? 'Who can send you direct messages?' : 'من يمكنه إرسال رسائل مباشرة إليك؟'}
                                </BilingualText>
                                <SegmentedControl<'nobody' | 'mutual_follows' | 'everyone'>
                                    options={[
                                        { value: 'nobody', label: lang === 'en' ? 'Nobody' : 'لا أحد' },
                                        { value: 'mutual_follows', label: lang === 'en' ? 'Mutual Follows' : 'متابعة متبادلة' },
                                        { value: 'everyone', label: lang === 'en' ? 'Everyone' : 'الجميع' },
                                    ]}
                                    value={preferences?.dmPrivacyMode || 'mutual_follows'}
                                    onChange={updateDmPrivacyMode}
                                />
                            </div>
                        </SettingsItem>
                    </SettingsSection>

                    <SettingsSection title={lang === 'en' ? 'Appearance' : 'المظهر'}>
                        <SettingsItem icon={SunIcon} label={lang === 'en' ? 'Dark Mode' : 'الوضع الداكن'}>
                            <label htmlFor="dark-mode-toggle" className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="dark-mode-toggle" className="sr-only peer" checked={theme === 'dark'} onChange={toggleTheme} />
                                <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/50 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </SettingsItem>
                        <SettingsItem icon={FontSizeIcon} label={lang === 'en' ? 'Font Size' : 'حجم الخط'}>
                           <div className="w-32"><SegmentedControl<FontSize>
                                options={[{value: 'xs', label: 'XS'}, {value: 'sm', label: 'S'}, {value: 'md', label: 'M'}, {value: 'lg', label: 'L'}, {value: 'xl', label: 'XL'}]}
                                value={fontSize}
                                onChange={setFontSize}
                            /></div>
                        </SettingsItem>
                        <SettingsItem icon={FontIcon} label={lang === 'en' ? 'Font Style' : 'نمط الخط'}>
                            <div className="w-48"><SegmentedControl<FontStyle>
                                options={[{value: 'default', label: 'Default'}, {value: 'dyslexic', label: 'Dyslexic'}]}
                                value={fontStyle}
                                onChange={setFontStyle}
                            /></div>
                        </SettingsItem>
                        <SettingsItem icon={LanguageIcon} label={lang === 'en' ? 'Language' : 'اللغة'}>
                             <div className="w-48"><SegmentedControl<'en' | 'ar'>
                                options={[{value: 'en', label: 'English'}, {value: 'ar', label: 'العربية'}]}
                                value={lang}
                                onChange={setLang}
                            /></div>
                        </SettingsItem>
                    </SettingsSection>

                    <SettingsSection title={lang === 'en' ? 'Account' : 'الحساب'}>
                        <SettingsItem icon={UserIcon} label={lang === 'en' ? 'Edit Profile' : 'تعديل الملف الشخصي'} onClick={() => navigate({ type: 'immersive', id: 'profile' })} />
                    </SettingsSection>

                    <SettingsSection title={lang === 'en' ? 'Data' : 'البيانات'}>
                        <SettingsItem
                            icon={UploadIcon}
                            label={lang === 'en' ? 'Goodreads Import' : 'استيراد Goodreads'}
                            onClick={() => navigate({ type: 'immersive', id: 'goodreadsImport', params: { from: currentView } })}
                        />
                    </SettingsSection>
                </ContentRail>
            </main>
        </div>
    );
};

export default SettingsScreen;
