
import React, { useState } from 'react';
import { useAuth } from '../../lib/auth.tsx';
import { useI18n } from '../../store/i18n.tsx';
import InputField from '../../components/ui/InputField.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { EmailIcon } from '../../components/icons/EmailIcon.tsx';
import { LockIcon } from '../../components/icons/LockIcon.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { EyeOffIcon } from '../../components/icons/EyeOffIcon.tsx';
import { GoogleIcon } from '../../components/icons/GoogleIcon.tsx';
import { XSocialIcon } from '../../components/icons/XSocialIcon.tsx';
import { AppleIcon } from '../../components/icons/AppleIcon.tsx';
import { BookTownLogoIcon } from '../../components/icons/BookTownLogoIcon.tsx';

const LoginScreen: React.FC = () => {
    const { login, signUp, signInWithGoogle, resetPassword, isLoggingIn, error, enterGuestMode } = useAuth();
    const { lang } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setResetEmailSent(false);
        if (isSignUp) {
            signUp(email, password);
        } else {
            login(email, password);
        }
    };
    
    const handleForgotPassword = async () => {
        if (!email) {
            alert('Please enter your email address to reset your password.');
            return;
        }
        try {
            await resetPassword(email);
            setResetEmailSent(true);
        } catch (e) {
            // error is set in auth context
        }
    };

    const SocialButton: React.FC<{ icon: React.ReactNode, label: string, disabled?: boolean, onClick?: () => void }> = ({ icon, label, disabled, onClick }) => (
        <button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="h-12 w-12 flex items-center justify-center border-2 border-slate-600 rounded-lg transition-all hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-600 active:scale-95"
        >
            {icon}
        </button>
    );

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black text-white p-8 font-inter">
            <div className="w-full max-w-sm">
                
                <div className="text-center mb-10 animate-fade-in-up" style={{ animationDelay: '0ms' }}>
                    <BookTownLogoIcon className="w-48 mx-auto h-auto" />
                </div>
                
                <div className="text-center mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                    <h2 className="text-lg font-medium text-slate-400 mt-2">
                        {isSignUp ? (lang === 'en' ? 'Create Account' : 'إنشاء حساب') : (lang === 'en' ? 'Sign In' : 'تسجيل الدخول')}
                    </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                        <InputField
                            id="email"
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="test@booktown.com"
                            startIcon={<EmailIcon className="h-5 w-5 text-slate-400" />}
                        />
                    </div>
                    <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                        <InputField
                            id="password"
                            label="Password"
                            type={passwordVisible ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            placeholder="••••••••"
                            startIcon={<LockIcon className="h-5 w-5 text-slate-400" />}
                            endIcon={
                                <button
                                    type="button"
                                    onClick={() => setPasswordVisible(!passwordVisible)}
                                    className="text-slate-400 hover:text-white"
                                    aria-label={passwordVisible ? "Hide password" : "Show password"}
                                >
                                    {passwordVisible ? (
                                        <EyeOffIcon className="h-5 w-5" />
                                    ) : (
                                        <EyeIcon className="h-5 w-5" />
                                    )}
                                </button>
                            }
                        />
                    </div>
                    
                    {!isSignUp && (
                        <button type="button" onClick={handleForgotPassword} className="text-sm text-accent hover:underline text-right block pt-1 animate-fade-in-up bg-transparent border-none w-full" style={{ animationDelay: '400ms' }}>
                            {lang === 'en' ? 'Forgot your password?' : 'هل نسيت كلمة المرور؟'}
                        </button>
                    )}
                    
                    {resetEmailSent && (
                        <BilingualText role="Caption" className="!text-green-400 text-center animate-fade-in-up">
                            {lang === 'en' ? 'Password reset email sent. Check your inbox.' : 'تم إرسال بريد إعادة تعيين كلمة المرور. تحقق من بريدك الوارد.'}
                        </BilingualText>
                    )}

                    {error && !resetEmailSent && (
                        <BilingualText role="Caption" className="!text-red-400 text-center animate-fade-in-up">{error}</BilingualText>
                    )}
                    
                    <div className="pt-2 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
                        <Button type="submit" className="w-full !h-12 !text-base" disabled={isLoggingIn}>
                            {isLoggingIn ? <LoadingSpinner /> : (isSignUp ? (lang === 'en' ? 'Create Account' : 'إنشاء حساب') : (lang === 'en' ? 'Sign In' : 'تسجيل الدخول'))}
                        </Button>
                    </div>
                </form>

                <p className="text-center text-sm text-slate-400 mt-6 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
                     {isSignUp ? (lang === 'en' ? 'Already have an account? ' : 'هل لديك حساب بالفعل؟ ') : (lang === 'en' ? 'Need an account? ' : 'تحتاج إلى حساب؟ ')}
                    <button 
                        type="button" 
                        onClick={() => { setIsSignUp(!isSignUp); setResetEmailSent(false); }} 
                        className="font-semibold text-accent hover:underline bg-transparent border-none p-0 cursor-pointer"
                    >
                        {isSignUp ? (lang === 'en' ? 'Sign In' : 'تسجيل الدخول') : (lang === 'en' ? 'Create one' : 'أنشئ حسابًا')}
                    </button>
                </p>

                <div className="flex items-center my-6 animate-fade-in-up" style={{ animationDelay: '700ms' }}>
                    <hr className="flex-grow border-slate-600" />
                    <span className="mx-4 text-xs tracking-widest text-slate-400">OR CONTINUE WITH</span>
                    <hr className="flex-grow border-slate-600" />
                </div>

                <div className="flex justify-center gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '800ms' }}>
                    <SocialButton icon={<GoogleIcon className="h-6 w-6" />} label="Continue with Google" onClick={signInWithGoogle} />
                    <SocialButton icon={<XSocialIcon className="h-6 w-6" />} label="Continue with X" disabled />
                    <SocialButton icon={<AppleIcon className="h-6 w-6" />} label="Continue with Apple" disabled />
                </div>

                <div className="animate-fade-in-up" style={{ animationDelay: '900ms' }}>
                    <Button variant="ghost" className="w-full !h-12 border-2 border-slate-600 !text-white hover:bg-slate-800" onClick={enterGuestMode}>
                        Continue as Test User (Admin)
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
