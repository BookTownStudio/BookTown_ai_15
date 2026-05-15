import { useCallback, useState } from 'react';
import { findProductionAgent } from '../agents/agentRegistry.tsx';
import { type View } from '../../types/navigation.ts';

type Navigate = (view: View) => void;

interface UseEditorMentorBridgeParams {
    currentView: View;
    navigate: Navigate;
}

export function useEditorMentorBridge({ currentView, navigate }: UseEditorMentorBridgeParams) {
    const [isMentorOpen, setIsMentorOpen] = useState(false);
    const mentor = findProductionAgent('mentor');

    const openMentor = useCallback(() => {
        setIsMentorOpen(true);
    }, []);

    const closeMentor = useCallback(() => {
        setIsMentorOpen(false);
    }, []);

    const startMentorChat = useCallback(() => {
        setIsMentorOpen(false);
        navigate({ type: 'immersive', id: 'agentChat', params: { agentId: 'mentor', from: currentView } });
    }, [currentView, navigate]);

    return {
        mentor,
        isMentorOpen,
        openMentor,
        closeMentor,
        startMentorChat,
    };
}
