import type { Agent } from '../../types/entities.ts';
import { ChatIcon } from '../../components/icons/ChatIcon.tsx';
import { LoreIcon } from '../../components/icons/LoreIcon.tsx';
import { MentorIcon } from '../../components/icons/MentorIcon.tsx';
import { QuoteIcon } from '../../components/icons/QuoteIcon.tsx';

export const productionAgents: Agent[] = [
  {
    id: 'librarian',
    name: 'Librarian',
    descriptionEn: 'Find your next\ngreat read',
    descriptionAr: 'اعثر على كتابك المفضل التالي',
    avatarUrl: '/assets/librarian-avatar.png',
    icon: ChatIcon,
    color: 'text-green-400',
    isPremium: false,
    examplePromptsEn: [
      'Recommend me something based on my mood.',
      'What are some underrated books by women authors?',
      "What should I read if I loved 'Dune'?",
    ],
    examplePromptsAr: [
      'أوصي بشيء بناءً على مزاجي.',
      'ما هي بعض الكتب التي لا تحظى بالتقدير الكافي لمؤلفات نساء؟',
      "ماذا يجب أن أقرأ إذا أحببت 'كثيب'؟",
    ],
    placeholderEn: "Tell me what you're looking for...",
    placeholderAr: 'أخبرني عما تبحث عنه...',
  },
  {
    id: 'mentor',
    name: 'Mentor',
    descriptionEn: 'Get writing tips\nand feedback',
    descriptionAr: 'احصل على ملاحظات على كتابتك',
    avatarUrl: '/assets/mentor-avatar.png',
    icon: MentorIcon,
    color: 'text-sky-400',
    isPremium: false,
    examplePromptsEn: [
      'Critique this paragraph...',
      'Does this character feel real?',
      'Suggest a better opening line.',
    ],
    examplePromptsAr: [
      'انقد هذه الفقرة...',
      'هل تبدو هذه الشخصية حقيقية؟',
      'اقترح سطراً افتتاحياً أفضل.',
    ],
    placeholderEn: 'Paste your text or ask a question...',
    placeholderAr: 'ألصق نصك أو اطرح سؤالاً...',
  },
  {
    id: 'quotes',
    name: 'Quotes',
    descriptionEn: 'Discover powerful quotes',
    descriptionAr: 'اكتشف اقتباسات قوية',
    avatarUrl: '/assets/quotes-avatar.png',
    icon: QuoteIcon,
    color: 'text-amber-400',
    isPremium: false,
    examplePromptsEn: ['Quotes about courage', "Find a quote from 'Project Hail Mary'"],
    examplePromptsAr: ['اقتباسات عن الشجاعة', "ابحث عن اقتباس من 'مشروع هيل ماري'"],
    placeholderEn: 'What kind of quote are you seeking?',
    placeholderAr: 'أي نوع من الاقتباسات تبحث عنه؟',
  },
  {
    id: 'lore',
    name: 'Lore',
    descriptionEn: 'Explore fictional worlds',
    descriptionAr: 'استكشف عوالم خيالية',
    avatarUrl: '/assets/lore-avatar.png',
    icon: LoreIcon,
    color: 'text-purple-400',
    isPremium: true,
    examplePromptsEn: [],
    examplePromptsAr: [],
    placeholderEn: '',
    placeholderAr: '',
  },
];

export function findProductionAgent(agentId: string | undefined): Agent | undefined {
  if (!agentId) return undefined;
  return productionAgents.find((agent) => agent.id === agentId);
}
