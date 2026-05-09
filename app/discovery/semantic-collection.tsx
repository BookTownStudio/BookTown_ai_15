import React, { useMemo } from 'react';
import PageShell from '../../components/layout/PageShell.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import AppNav from '../../components/navigation/AppNav.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import type { View } from '../../types/navigation.ts';

type SemanticCollectionKind = 'tradition' | 'form' | 'subform';

function normalizeKind(value: unknown): SemanticCollectionKind {
  return value === 'tradition' || value === 'form' || value === 'subform'
    ? value
    : 'tradition';
}

function formatSemanticLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectionTitle(kind: SemanticCollectionKind, label: string, lang: 'en' | 'ar') {
  if (lang === 'ar') {
    if (kind === 'tradition') return `تقليد: ${label}`;
    if (kind === 'form') return `شكل: ${label}`;
    return `شكل فرعي: ${label}`;
  }

  if (kind === 'tradition') return label;
  if (kind === 'form') return `${label} Works`;
  return `${label} Pathway`;
}

function isNavigationView(value: unknown): value is View {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; id?: unknown };
  return (
    (candidate.type === 'tab' ||
      candidate.type === 'stack' ||
      candidate.type === 'immersive') &&
    typeof candidate.id === 'string'
  );
}

const SemanticCollectionScreen: React.FC = () => {
  const { lang } = useI18n();
  const { currentView, navigate } = useNavigation();
  const params =
    currentView.type === 'stack'
      ? (currentView.params as Record<string, unknown> | undefined) || {}
      : {};

  const kind = normalizeKind(params.kind);
  const semanticId = typeof params.id === 'string' ? params.id.trim() : '';
  const label = useMemo(
    () => formatSemanticLabel(semanticId),
    [semanticId]
  );
  const backTarget = isNavigationView(params.from)
    ? params.from
    : { type: 'stack' as const, id: 'discovery' as const };

  return (
    <PageShell scrollable>
      <AppNav
        titleEn="Discover"
        titleAr="استكشف"
        showBackButton
        onBack={() => navigate(backTarget)}
      />

      <main className="pt-24 pb-20">
        <LiteraryShell className="space-y-6">
          <section className="space-y-3 py-8">
            <BilingualText role="H1" className="!text-2xl !font-bold">
              {collectionTitle(kind, label || semanticId, lang)}
            </BilingualText>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-white/60">
              {lang === 'en'
                ? 'No works are available in this pathway yet.'
                : 'لا توجد أعمال متاحة في هذا المسار بعد.'}
            </p>
          </section>
        </LiteraryShell>
      </main>
    </PageShell>
  );
};

export default SemanticCollectionScreen;
