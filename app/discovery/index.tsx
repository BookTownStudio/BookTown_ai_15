// app/discovery/index.tsx

import React, { useCallback } from "react";
import PageShell from "../../components/layout/PageShell.tsx";
import LiteraryShell from "../../components/layout/LiteraryShell.tsx";
import AppNav from "../../components/navigation/AppNav.tsx";
import { useI18n } from "../../store/i18n.tsx";
import { useNavigation } from "../../store/navigation.tsx";

/* ---------------------------------------
   Static Discovery Directions (Phase 2)
---------------------------------------- */

type StaticDirection = {
  id: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  query: string; // 🔒 Controlled navigation query
};

const STATIC_DIRECTIONS: StaticDirection[] = [
  {
    id: "magic_realism",
    titleEn: "Magical Realism Beyond Latin America",
    titleAr: "الواقعية السحرية خارج أمريكا اللاتينية",
    subtitleEn: "Explore storytelling where reality bends gently.",
    subtitleAr: "استكشف سرداً تنحني فيه الواقعية برفق.",
    query: "magical realism",
  },
  {
    id: "war_reflections",
    titleEn: "Fiction Reflecting on War",
    titleAr: "روايات تتأمل الحرب",
    subtitleEn: "Literature responding to conflict and memory.",
    subtitleAr: "أدب يستجيب للصراع والذاكرة.",
    query: "fiction about war and memory",
  },
  {
    id: "philosophy_essays",
    titleEn: "Political & Philosophical Essays",
    titleAr: "مقالات سياسية وفلسفية",
    subtitleEn: "Ideas shaping societies and identity.",
    subtitleAr: "أفكار تشكّل المجتمعات والهوية.",
    query: "political philosophy essays",
  },
];

/* ---------------------------------------
   Discovery Screen
---------------------------------------- */

const DiscoveryScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate } = useNavigation();

  /* ---------------------------------------
     Controlled Navigation Handler
     🔒 No intelligence, deterministic only
  ---------------------------------------- */
  const handleDirectionClick = useCallback(
    (query: string) => {
      if (!query) return;

      navigate({
        type: "tab",
        id: "home",
        params: { discoveryQuery: query },
      });
    },
    [navigate]
  );

  return (
    <PageShell scrollable>
      <AppNav
        titleEn="Explore"
        titleAr="استكشف"
        showBackButton
        onBack={() => navigate({ type: "tab", id: "home" })}
      />

      <main className="pt-24 pb-20">
        <LiteraryShell className="space-y-6">
          {STATIC_DIRECTIONS.map(direction => (
            <button
              key={direction.id}
              type="button"
              onClick={() => handleDirectionClick(direction.query)}
              className="
                w-full text-left
                p-6 rounded-2xl
                border border-black/5 dark:border-white/10
                bg-white/5 backdrop-blur-sm
                transition hover:bg-white/10
                focus:outline-none focus:ring-2 focus:ring-primary
              "
              aria-label={
                lang === "en"
                  ? `Explore ${direction.titleEn}`
                  : `استكشف ${direction.titleAr}`
              }
            >
              <h3 className="text-lg font-semibold mb-2">
                {lang === "en"
                  ? direction.titleEn
                  : direction.titleAr}
              </h3>

              <p className="text-sm opacity-70">
                {lang === "en"
                  ? direction.subtitleEn
                  : direction.subtitleAr}
              </p>
            </button>
          ))}
        </LiteraryShell>
      </main>
    </PageShell>
  );
};

export default DiscoveryScreen;
