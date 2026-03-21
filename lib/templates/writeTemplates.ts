import type { Project, Template, WriteContentDoc, WriteDirection } from '../../types/entities.ts';
import { countWordsScriptAware } from '../editor/writeDocument.ts';
import { BlogPostIcon } from '../../components/icons/BlogPostIcon.tsx';
import { NovelIcon } from '../../components/icons/NovelIcon.tsx';
import { ShortStoryIcon } from '../../components/icons/ShortStoryIcon.tsx';
import { MemoirIcon } from '../../components/icons/MemoirIcon.tsx';
import { JournalIcon } from '../../components/icons/JournalIcon.tsx';
import { PoetryIcon } from '../../components/icons/PoetryIcon.tsx';
import { ScreenplayIcon } from '../../components/icons/ScreenplayIcon.tsx';
import { createChapterBlockHtml, createChapterBlockNodes } from '../editor/chapterNodes.ts';

type WorkType = Project['workType'];
type Locale = 'en' | 'ar';

type SectionCopy = {
    titleEn: string;
    titleAr: string;
    bodyEn: string[];
    bodyAr: string[];
    chapter?: boolean;
};

type TemplateSeedDefinition = Omit<Template, 'boilerplateContent' | 'contentDoc'> & {
    sections: SectionCopy[];
};

type StarterSeed = Pick<Project, 'titleEn' | 'titleAr' | 'workType' | 'typeEn' | 'typeAr' | 'status' | 'wordCount' | 'content' | 'contentDoc' | 'isPublished'>;

const DEFAULT_STATUS = {
    typeEn: 'Draft',
    typeAr: 'مسودة',
    status: 'Draft' as const,
    isPublished: false,
};

const UNTITLED_TITLES: Record<WorkType, { titleEn: string; titleAr: string }> = {
    book: {
        titleEn: 'Untitled Project',
        titleAr: 'مشروع غير معنون',
    },
    article: {
        titleEn: 'Untitled Project',
        titleAr: 'مشروع غير معنون',
    },
    journal: {
        titleEn: 'Untitled Project',
        titleAr: 'مشروع غير معنون',
    },
};

const WORK_TYPE_LABELS: Record<WorkType, { en: string; ar: string }> = {
    book: { en: 'Book', ar: 'كتاب' },
    article: { en: 'Article', ar: 'مقال' },
    journal: { en: 'Journal', ar: 'دفتر' },
};

const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
}

function createTextNode(text: string) {
    return { type: 'text', text };
}

function createParagraphNode(text: string, lang: Locale, dir: WriteDirection) {
    return {
        type: 'paragraph',
        attrs: {
            lang,
            dir,
        },
        content: [createTextNode(text)],
    };
}

function createHeadingNode(text: string, lang: Locale, dir: WriteDirection) {
    return {
        type: 'heading',
        attrs: {
            level: 2,
            lang,
            dir,
        },
        content: [createTextNode(text)],
    };
}

function buildStructuredStarter(sections: SectionCopy[], locale: Locale): Pick<StarterSeed, 'content' | 'contentDoc' | 'wordCount'> {
    const lang: Locale = locale === 'ar' ? 'ar' : 'en';
    const dir: WriteDirection = lang === 'ar' ? 'rtl' : 'ltr';
    const contentNodes: WriteContentDoc['content'] = [];
    const htmlParts: string[] = [];
    const plainTextParts: string[] = [];

    sections.forEach((section) => {
        const title = lang === 'ar' ? section.titleAr : section.titleEn;
        const paragraphs = lang === 'ar' ? section.bodyAr : section.bodyEn;

        if (section.chapter) {
            contentNodes.push(...createChapterBlockNodes({ title, lang, dir, paragraphs }));
            htmlParts.push(createChapterBlockHtml({ title, lang, dir, paragraphs }));
            plainTextParts.push(title, ...paragraphs);
            return;
        }

        contentNodes.push(createHeadingNode(title, lang, dir));
        htmlParts.push(`<h2 lang="${lang}" dir="${dir}">${escapeHtml(title)}</h2>`);
        plainTextParts.push(title);

        paragraphs.forEach((paragraph) => {
            contentNodes.push(createParagraphNode(paragraph, lang, dir));
            htmlParts.push(`<p lang="${lang}" dir="${dir}">${escapeHtml(paragraph)}</p>`);
            plainTextParts.push(paragraph);
        });
    });

    const plainText = plainTextParts.join('\n\n').trim();
    return {
        content: htmlParts.join(''),
        contentDoc: {
            version: 1,
            type: 'doc',
            content: contentNodes,
            plainText,
        },
        wordCount: countWordsScriptAware(plainText),
    };
}

function buildBlankStarter(locale: Locale): Pick<StarterSeed, 'content' | 'contentDoc' | 'wordCount'> {
    const lang: Locale = locale === 'ar' ? 'ar' : 'en';
    const dir: WriteDirection = lang === 'ar' ? 'rtl' : 'ltr';
    const contentDoc: WriteContentDoc = {
        version: 1,
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                attrs: {
                    lang,
                    dir,
                },
            },
        ],
        plainText: '',
    };

    return {
        content: `<p lang="${lang}" dir="${dir}"></p>`,
        contentDoc,
        wordCount: 0,
    };
}

const templateDefinitions: TemplateSeedDefinition[] = [
    {
        id: 'article-blog',
        workType: 'article',
        titleEn: 'Article / Blog',
        titleAr: 'مقال / مدونة',
        descriptionEn: 'A guided long-form article with a clear reading arc.',
        descriptionAr: 'مقال طويل موجه ببنية قراءة واضحة.',
        icon: BlogPostIcon,
        featured: true,
        sections: [
            {
                titleEn: 'Introduction',
                titleAr: 'مقدمة',
                bodyEn: ['Open with the live question, scene, or tension that makes the reader care about this piece now.'],
                bodyAr: ['ابدأ بالسؤال الحي أو المشهد أو التوتر الذي يجعل القارئ يهتم بهذا النص الآن.'],
            },
            {
                titleEn: 'Core Idea',
                titleAr: 'الفكرة الأساسية',
                bodyEn: ['State the central idea in direct language and name the argument the rest of the article will develop.'],
                bodyAr: ['قدّم الفكرة الأساسية بلغة مباشرة وسمِّ الحجة التي سيطوّرها باقي المقال.'],
            },
            {
                titleEn: 'Development',
                titleAr: 'التطوير',
                bodyEn: ['Expand with detail, examples, and evidence so the reader can follow the logic without strain.'],
                bodyAr: ['وسّع النص بالتفاصيل والأمثلة والشواهد حتى يتتبع القارئ الفكرة من دون عناء.'],
            },
            {
                titleEn: 'Conclusion',
                titleAr: 'خاتمة',
                bodyEn: ['Close by clarifying what remains with the reader and why the piece mattered in the first place.'],
                bodyAr: ['اختم بتوضيح ما الذي يبقى مع القارئ ولماذا كان هذا النص مهماً من البداية.'],
            },
        ],
    },
    {
        id: 'novel',
        workType: 'book',
        titleEn: 'Novel',
        titleAr: 'رواية',
        descriptionEn: 'A six-beat literary arc for a full-length narrative.',
        descriptionAr: 'قوس أدبي من ست حركات لحكاية طويلة.',
        icon: NovelIcon,
        sections: [
            {
                titleEn: 'Chapter 1 — Beginning',
                titleAr: 'الفصل 1 — البداية',
                bodyEn: ['Introduce the world as it is and let the reader feel the ordinary rhythm before it starts to shift.'],
                bodyAr: ['عرّف العالم كما هو ودَع القارئ يشعر بإيقاعه المعتاد قبل أن يبدأ التحوّل.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 2 — Change Appears',
                titleAr: 'الفصل 2 — ظهور التغيير',
                bodyEn: ['Let the first disturbance arrive in a way that cannot be dismissed or quietly put aside.'],
                bodyAr: ['دَع الاضطراب الأول يصل بطريقة لا يمكن تجاهلها أو تجاوزها بهدوء.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 3 — Crossing Forward',
                titleAr: 'الفصل 3 — العبور إلى الأمام',
                bodyEn: ['Move the protagonist past the point where returning to the old arrangement is no longer possible.'],
                bodyAr: ['ادفع الشخصية إلى ما بعد النقطة التي يصبح فيها الرجوع إلى الترتيب القديم غير ممكن.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 4 — Conflict Deepens',
                titleAr: 'الفصل 4 — تعميق الصراع',
                bodyEn: ['Increase pressure, sharpen desire, and let every choice cost more than the one before it.'],
                bodyAr: ['صعّد الضغط وحدّد الرغبة بوضوح واجعل كل اختيار أثقل كلفة من الذي سبقه.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 5 — Crisis',
                titleAr: 'الفصل 5 — الأزمة',
                bodyEn: ['Bring the story to its most exposed point, where the character must act without certainty.'],
                bodyAr: ['أوصل القصة إلى أشد لحظاتها انكشافاً حيث تضطر الشخصية إلى الفعل بلا يقين.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 6 — Return Changed',
                titleAr: 'الفصل 6 — العودة متغيّرة',
                bodyEn: ['Return the character to the world with visible change and a cost the reader can still feel.'],
                bodyAr: ['أعِد الشخصية إلى العالم وهي متغيرة بوضوح ومعها ثمن ما زال القارئ يشعر به.'],
                chapter: true,
            },
        ],
    },
    {
        id: 'short-story',
        workType: 'book',
        titleEn: 'Short Story',
        titleAr: 'قصة قصيرة',
        descriptionEn: 'A compact narrative structure with one clean turn.',
        descriptionAr: 'بنية سردية مكثفة بانعطافة واحدة واضحة.',
        icon: ShortStoryIcon,
        sections: [
            {
                titleEn: 'Part 1 — Opening',
                titleAr: 'الجزء 1 — الافتتاح',
                bodyEn: ['Begin inside motion, voice, or tension so the reader enters the scene already leaning forward.'],
                bodyAr: ['ابدأ من داخل حركة أو صوت أو توتر حتى يدخل القارئ المشهد وهو منجذب إليه.'],
                chapter: true,
            },
            {
                titleEn: 'Part 2 — Shift',
                titleAr: 'الجزء 2 — التحول',
                bodyEn: ['Deliver the turn that changes how the moment, character, or conflict is understood.'],
                bodyAr: ['قدّم التحول الذي يغيّر فهم اللحظة أو الشخصية أو الصراع.'],
                chapter: true,
            },
            {
                titleEn: 'Part 3 — Ending',
                titleAr: 'الجزء 3 — النهاية',
                bodyEn: ['End on the line, image, or action that keeps resonating after the page is done.'],
                bodyAr: ['اختم بالسطر أو الصورة أو الفعل الذي يستمر صداه بعد انتهاء الصفحة.'],
                chapter: true,
            },
        ],
    },
    {
        id: 'memoir',
        workType: 'book',
        titleEn: 'Memoir',
        titleAr: 'مذكرات',
        descriptionEn: 'A reflective structure rooted in lived change.',
        descriptionAr: 'بنية تأملية تنطلق من أثر التجربة المعيشة.',
        icon: MemoirIcon,
        sections: [
            {
                titleEn: 'Chapter 1 — The Moment',
                titleAr: 'الفصل 1 — اللحظة',
                bodyEn: ['Start with the lived moment that still carries heat, texture, and consequence in memory.'],
                bodyAr: ['ابدأ من اللحظة المعيشة التي ما زالت تحتفظ بحرارتها وملمسها وأثرها في الذاكرة.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 2 — What Changed',
                titleAr: 'الفصل 2 — ما الذي تغيّر',
                bodyEn: ['Name the inner and outer change that followed, and let reflection deepen rather than explain away the event.'],
                bodyAr: ['سمِّ التغير الداخلي والخارجي الذي تبعها ودع التأمل يعمّق الحدث بدل أن يفسّره بعيداً عنه.'],
                chapter: true,
            },
            {
                titleEn: 'Chapter 3 — What Remains',
                titleAr: 'الفصل 3 — ما الذي بقي',
                bodyEn: ['Close with what still lives in you now, and why that memory remains active rather than finished.'],
                bodyAr: ['اختم بما لا يزال حياً فيك الآن ولماذا بقيت تلك الذاكرة فعالة لا منتهية.'],
                chapter: true,
            },
        ],
    },
    {
        id: 'journal',
        workType: 'journal',
        titleEn: 'Journal',
        titleAr: 'يوميات',
        descriptionEn: 'A private reflection frame for what the day held.',
        descriptionAr: 'إطار تأملي خاص لما حمله اليوم.',
        icon: JournalIcon,
        sections: [
            {
                titleEn: 'Entry 1 — Today',
                titleAr: 'المدخل 1 — اليوم',
                bodyEn: ['Record what happened in the plain shape it arrived, without forcing meaning before it is ready.'],
                bodyAr: ['دوّن ما حدث بصورته المباشرة كما وصل، من دون فرض معنى قبل أن ينضج.'],
                chapter: true,
            },
            {
                titleEn: 'Entry 2 — What Stayed',
                titleAr: 'المدخل 2 — ما الذي بقي',
                bodyEn: ['Notice what stayed with you after the day moved on: a feeling, a sentence, a silence, a surprise.'],
                bodyAr: ['لاحظ ما الذي بقي معك بعد انقضاء اليوم: شعور أو جملة أو صمت أو مفاجأة.'],
                chapter: true,
            },
            {
                titleEn: 'Entry 3 — What I Carry Forward',
                titleAr: 'المدخل 3 — ما الذي أحمله معي',
                bodyEn: ['Name the one thing you want to carry into tomorrow with more attention or tenderness.'],
                bodyAr: ['سمِّ الشيء الواحد الذي تريد أن تحمله إلى الغد بمزيد من الانتباه أو اللطف.'],
                chapter: true,
            },
        ],
    },
    {
        id: 'poetry',
        workType: 'book',
        titleEn: 'Poetry',
        titleAr: 'شعر',
        descriptionEn: 'A quiet opening for a poem, cycle, or lyric sequence.',
        descriptionAr: 'افتتاح هادئ لقصيدة أو مجموعة غنائية.',
        icon: PoetryIcon,
        sections: [
            {
                titleEn: 'Poem 1',
                titleAr: 'قصيدة 1',
                bodyEn: ['Start with the first image, line, or rhythm that feels truer than explanation.'],
                bodyAr: ['ابدأ بالصورة أو السطر أو الإيقاع الذي يبدو أصدق من الشرح.'],
                chapter: true,
            },
            {
                titleEn: 'Poem 2',
                titleAr: 'قصيدة 2',
                bodyEn: ['Let the next poem begin from a distinct image, pressure, or music of its own.'],
                bodyAr: ['دع القصيدة التالية تبدأ من صورة أو توتر أو موسيقى تخصها وحدها.'],
                chapter: true,
            },
            {
                titleEn: 'Poem 3',
                titleAr: 'قصيدة 3',
                bodyEn: ['Open a third poem from a fresh line that shifts the emotional weather of the page.'],
                bodyAr: ['افتح قصيدة ثالثة من سطر جديد يغيّر مناخ الصفحة العاطفي.'],
                chapter: true,
            },
        ],
    },
    {
        id: 'screenplay',
        workType: 'book',
        titleEn: 'Screenplay',
        titleAr: 'سيناريو',
        descriptionEn: 'A scene-first dramatic progression for script drafting.',
        descriptionAr: 'تدرج درامي يبدأ بالمشهد لكتابة السيناريو.',
        icon: ScreenplayIcon,
        sections: [
            {
                titleEn: 'Scene 1 — Opening Scene',
                titleAr: 'المشهد 1 — المشهد الافتتاحي',
                bodyEn: ['Place the viewer inside the first visible situation and let the scene announce tone through action.'],
                bodyAr: ['ضع المشاهد داخل الحالة المرئية الأولى ودع المشهد يعلن نبرته من خلال الفعل.'],
                chapter: true,
            },
            {
                titleEn: 'Scene 2 — First Turn',
                titleAr: 'المشهد 2 — التحول الأول',
                bodyEn: ['Introduce the shift that sends the story into motion and changes what the next scene must do.'],
                bodyAr: ['قدّم التحول الذي يطلق القصة ويغيّر ما يجب على المشهد التالي أن يفعله.'],
                chapter: true,
            },
            {
                titleEn: 'Scene 3 — Confrontation',
                titleAr: 'المشهد 3 — المواجهة',
                bodyEn: ['Stage the confrontation where intent, obstacle, and consequence can all be seen at once.'],
                bodyAr: ['ابنِ المواجهة التي يمكن أن تُرى فيها النية والعائق والنتيجة في آن واحد.'],
                chapter: true,
            },
            {
                titleEn: 'Scene 4 — Final Scene',
                titleAr: 'المشهد 4 — المشهد الأخير',
                bodyEn: ['End with the final scene that leaves the audience with an image stronger than explanation.'],
                bodyAr: ['اختم بالمشهد الأخير الذي يترك الجمهور مع صورة أقوى من الشرح.'],
                chapter: true,
            },
        ],
    },
];

export const writeTemplates: Template[] = templateDefinitions.map((template) => ({
    ...template,
    boilerplateContent: buildStructuredStarter(template.sections, 'en').content,
    contentDoc: buildStructuredStarter(template.sections, 'en').contentDoc,
}));

export function getWriteTemplate(templateId?: string | null): Template | undefined {
    if (!templateId) {
        return undefined;
    }
    return writeTemplates.find((template) => template.id === templateId);
}

export function getWorkTypeLabel(workType: WorkType, locale: Locale): string {
    return WORK_TYPE_LABELS[workType][locale];
}

export function createProjectSeedFromTemplate(templateId: string, locale: Locale): StarterSeed {
    const template = getWriteTemplate(templateId);
    if (!template) {
        return createBlankProjectSeed('book', locale);
    }

    const starter = buildStructuredStarter(
        templateDefinitions.find((item) => item.id === template.id)?.sections ?? [],
        locale
    );
    const untitled = UNTITLED_TITLES[template.workType];

    return {
        ...DEFAULT_STATUS,
        ...starter,
        titleEn: untitled.titleEn,
        titleAr: untitled.titleAr,
        workType: template.workType,
    };
}

export function createBlankProjectSeed(workType: WorkType, locale: Locale): StarterSeed {
    const untitled = UNTITLED_TITLES[workType];
    return {
        ...DEFAULT_STATUS,
        ...buildBlankStarter(locale),
        titleEn: untitled.titleEn,
        titleAr: untitled.titleAr,
        workType,
    };
}
