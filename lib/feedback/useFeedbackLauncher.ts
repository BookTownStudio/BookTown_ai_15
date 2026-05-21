import { useCallback } from 'react';
import { FeedbackContextService } from './FeedbackContextService.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import type { FeedbackSource } from '../../contracts/apiContracts.ts';
import type { NavigationParams, View } from '../../types/navigation.ts';

type FeedbackLaunchSource = 'appnav' | 'social';

type LaunchFeedbackOptions = {
  launchSource: FeedbackLaunchSource;
  from?: View;
};

function buildFeedbackSource(launchSource: FeedbackLaunchSource): FeedbackSource {
  return launchSource === 'appnav' || launchSource === 'social' ? 'appnav_beta' : 'drawer';
}

export function useFeedbackLauncher() {
  const { lang } = useI18n();
  const { currentView, navigate } = useNavigation();

  return useCallback((options: LaunchFeedbackOptions) => {
    const fromView = options.from ?? currentView;
    const feedbackContext = FeedbackContextService.capture({
      currentView: fromView,
      locale: lang,
    });

    navigate({
      type: 'immersive',
      id: 'feedback',
      params: {
        from: fromView,
        feedbackSource: buildFeedbackSource(options.launchSource),
        feedbackLaunchSource: options.launchSource,
        feedbackContext,
      } as NavigationParams,
    });
  }, [currentView, lang, navigate]);
}
