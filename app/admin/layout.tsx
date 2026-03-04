import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useNavigation } from '../../store/navigation.tsx';

type AdminLayoutProps = {
  children: ReactNode;
  titleEn?: string;
  titleAr?: string;
};

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  titleEn = 'Intelligence Dashboard',
  titleAr = 'لوحة الذكاء التشغيلي',
}) => {
  const { user, isLoading } = useAuth();
  const { navigate } = useNavigation();
  const [hasSuperadminClaim, setHasSuperadminClaim] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    async function checkClaim() {
      if (!user) {
        if (alive) setHasSuperadminClaim(false);
        return;
      }
      try {
        const tokenResult = await user.getIdTokenResult(true);
        const superadmin = tokenResult.claims.superadmin === true || tokenResult.claims.role === 'superadmin';
        if (alive) setHasSuperadminClaim(superadmin);
      } catch {
        if (alive) setHasSuperadminClaim(false);
      }
    }
    void checkClaim();
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (isLoading || hasSuperadminClaim !== false) return;
    navigate({ type: 'immersive', id: 'adminDashboard' }, { replace: true });
  }, [hasSuperadminClaim, isLoading, navigate]);

  const handleBack = () => {
    navigate({ type: 'immersive', id: 'adminDashboard' });
  };

  if (isLoading || hasSuperadminClaim === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <LoadingSpinner />
      </div>
    );
  }

  if (hasSuperadminClaim === false) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 px-6 text-center">
        <BilingualText role="H1" className="text-white/70">
          Access denied.
        </BilingualText>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <ScreenHeader titleEn={titleEn} titleAr={titleAr} onBack={handleBack} />
      <main className="flex-grow overflow-y-auto pt-24 pb-10">
        <div className="container mx-auto px-4 md:px-8">{children}</div>
      </main>
    </div>
  );
};

export default AdminLayout;

