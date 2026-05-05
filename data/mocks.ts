import { User, Book, Shelf, Quote, Project, Post, Agent, Review, RecommendedShelf, Template, BookFlowItem, Author, ForYouFlowItem, Venue, Event, BookFair, VenueReview, Bookmark, Conversation, DirectMessage, Notification, AdminFeedback, PostComment } from '../types/entities.ts';
import { MentorIcon } from '../components/icons/MentorIcon.tsx';
import { ChatIcon } from '../components/icons/ChatIcon.tsx';
import { QuoteIcon } from '../components/icons/QuoteIcon.tsx';
import { LoreIcon } from '../components/icons/LoreIcon.tsx';
import { NovelIcon } from '../components/icons/NovelIcon.tsx';
import { ShortStoryIcon } from '../components/icons/ShortStoryIcon.tsx';
import { EssayIcon } from '../components/icons/EssayIcon.tsx';
import { JournalIcon } from '../components/icons/JournalIcon.tsx';
import { MemoirIcon } from '../components/icons/MemoirIcon.tsx';
import { PoetryIcon } from '../components/icons/PoetryIcon.tsx';
import { BookReviewIcon } from '../components/icons/BookReviewIcon.tsx';
import { ScreenplayIcon } from '../components/icons/ScreenplayIcon.tsx';
import { ResearchPaperIcon } from '../components/icons/ResearchPaperIcon.tsx';
import { BlogPostIcon } from '../components/icons/BlogPostIcon.tsx';
import { PlayIcon } from '../components/icons/PlayIcon.tsx';
import { CharacterProfileIcon } from '../components/icons/CharacterProfileIcon.tsx';

// --- USERS ---
export const mockUsers: User[] = [
    {
        uid: 'alex_doe',
        email: 'test@booktown.com',
        name: 'Alex Doe',
        handle: '@alexdoe',
        avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
        bannerUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1170&q=80',
        joinDate: '2023-01-15T10:00:00Z',
        bioEn: 'Just a reader trying to find the next great story. Sci-fi and fantasy enthusiast. Trying my hand at writing.',
        bioAr: 'مجرد قارئ يحاول العثور على القصة الرائعة التالية. من عشاق الخيال العلمي والفانتازيا. أجرب الكتابة.',
        followers: 125,
        following: 88,
        role: 'superadmin',
        lastActive: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        booksRead: 142,
        quotesSaved: 88,
        shelvesCount: 12,
        wordsWritten: 30630,
        interests: ['Sci-Fi', 'Fantasy', 'World Building'],
        aiConsent: true,
        reportsCount: 0,
        isSuspended: false,
    },
    {
        uid: 'jane_smith',
        name: 'Jane Smith',
        email: 'jane@example.com',
        handle: '@janesmith',
        avatarUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
        bannerUrl: 'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=800&q=80',
        joinDate: '2022-11-20T14:30:00Z',
        bioEn: 'Literary critic and coffee lover.',
        bioAr: 'ناقدة أدبية ومحبة للقهوة.',
        followers: 1200,
        following: 300,
        role: 'user',
        lastActive: new Date().toISOString(),
        booksRead: 320,
        quotesSaved: 450,
        shelvesCount: 25,
        wordsWritten: 0,
        interests: ['Literary Fiction', 'Thrillers', 'Coffee', 'Art'],
        sharedInterest: 'Shares your love for Thrillers',
        aiConsent: false,
        reportsCount: 3,
        isSuspended: false,
    },
    {
        uid: 'sam_jones',
        name: 'Sam Jones',
        email: 'sam@example.com',
        handle: '@samjones',
        avatarUrl: 'https://randomuser.me/api/portraits/men/46.jpg',
        bannerUrl: 'https://images.unsplash.com/photo-1507525428034-b723a9ce6890?w=800&q=80',
        joinDate: '2023-03-10T09:00:00Z',
        bioEn: 'Exploring the classics and historical fiction. Always looking for recommendations.',
        bioAr: 'أستكشف الكلاسيكيات والخيال التاريخي. أبحث دائمًا عن توصيات.',
        followers: 350,
        following: 150,
        role: 'user',
        lastActive: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        booksRead: 88,
        quotesSaved: 120,
        shelvesCount: 8,
        wordsWritten: 1200,
        interests: ['Classics', 'History', 'Non-fiction'],
        sharedInterest: 'Also reads Non-fiction',
        aiConsent: true,
        reportsCount: 0,
        isSuspended: true,
    },
    {
        uid: 'maria_garcia',
        name: 'Maria Garcia',
        email: 'maria@example.com',
        handle: '@mariagarcia',
        avatarUrl: 'https://randomuser.me/api/portraits/women/50.jpg',
        bannerUrl: 'https://images.unsplash.com/photo-1513366333938-569658535a77?w=800&q=80',
        joinDate: '2023-05-22T18:00:00Z',
        bioEn: 'Poetry and contemporary fiction are my jam. Let\'s connect!',
        bioAr: 'الشعر والروايات المعاصرة هي ما أهواه. lنتواصل!',
        followers: 890,
        following: 410,
        role: 'user',
        lastActive: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        booksRead: 210,
        quotesSaved: 300,
        shelvesCount: 15,
        wordsWritten: 5800,
        interests: ['Poetry', 'Contemporary', 'Short Stories'],
        aiConsent: true,
        reportsCount: 0,
        isSuspended: false,
    },
];

// --- AUTHORS ---
export const mockAuthors: Record<string, Author> = {
    'author_matt_haig': {
        id: 'author_matt_haig', nameEn: 'Matt Haig', nameAr: 'مات هيغ',
        avatarUrl: 'https://images.gr-assets.com/authors/1589835942p8/30291.jpg',
        bioEn: 'Matt Haig is an English author and journalist. He has written both fiction and non-fiction books for children and adults, often in the speculative fiction genre.',
        bioAr: 'مات هيغ هو مؤلف وصحفي إنجليزي. لقد كتب كتبًا خيالية وغير خيالية للأطفال والكبار ، غالبًا في نوع الخيال التأملي.',
        lifespan: 'b. 1975', countryEn: 'United Kingdom', countryAr: 'المملكة المتحدة', languageEn: 'English', languageAr: 'الإنجليزية',
        signatureQuoteEn: 'The only way to learn is to live.',
        signatureQuoteAr: 'الطريقة الوحيدة للتعلم هي أن تعيش.',
    },
    'author_andy_weir': {
        id: 'author_andy_weir', nameEn: 'Andy Weir', nameAr: 'آندي وير',
        avatarUrl: 'https://images.gr-assets.com/authors/1415048705p8/5889454.jpg',
        bioEn: 'Andy Weir built a two-decade career as a software engineer until the success of his debut novel, The Martian, allowed him to live out his dream of writing full-time.',
        bioAr: 'بنى آندي وير مسيرة مهنية استمرت عقدين كمهندس برمجيات حتى نجاح روايته الأولى "المريخي" ، مما سمح له بتحقيق حلمه في الكتابة بدوام كامل.',
        lifespan: 'b. 1972', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_frank_herbert': {
        id: 'author_frank_herbert', nameEn: 'Frank Herbert', nameAr: 'فرانك هربرت',
        avatarUrl: 'https://images.gr-assets.com/authors/1195233353p8/58.jpg',
        bioEn: 'Frank Herbert was an American science fiction author best known for the 1965 novel Dune and its five sequels.',
        bioAr: 'كان فرانك هربرت مؤلف خيال علمي أمريكي اشتهر برواية "كثيب" عام 1965 وتكملاتها الخمس.',
        lifespan: '1920-1986', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
        signatureQuoteEn: 'I must not fear. Fear is the mind-killer.',
        signatureQuoteAr: 'يجب ألا أخاف. الخوف هو قاتل العقل.',
    },
    'author_alex_michaelides': {
        id: 'author_alex_michaelides', nameEn: 'Alex Michaelides', nameAr: 'أليكس ميكايليديس',
        avatarUrl: 'https://images.gr-assets.com/authors/1529584307p8/17621448.jpg',
        bioEn: 'Alex Michaelides is a bestselling British-Cypriot author and screenwriter. His debut novel, The Silent Patient, was a No. 1 New York Times bestseller.',
        bioAr: 'أليكس ميكايليديس هو مؤلف وكاتب سيناريو بريطاني قبرصي من أكثر الكتب مبيعًا. كانت روايته الأولى "المريض الصامت" من أكثر الكتب مبيعًا في نيويائورك تايمز.',
        lifespan: 'b. 1977', countryEn: 'Cyprus', countryAr: 'قبرص', languageEn: 'English, Greek', languageAr: 'الإنجليزية، اليونانية',
    },
    'author_madeline_miller': {
        id: 'author_madeline_miller', nameEn: 'Madeline Miller', nameAr: 'مادلين ميلر',
        avatarUrl: 'https://images.gr-assets.com/authors/1328124933p8/1022736.jpg',
        bioEn: 'Madeline Miller is an American novelist, author of The Song of Achilles and Circe. She holds an MA in Classics from Brown University.',
        bioAr: 'مادلين ميلر روائية أمريكية ومؤلفة "أغنية أخيل" و "سيرسي". حاصلة على ماجستير في الكلاسيكيات من جامعة براون.',
        lifespan: 'b. 1978', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
        signatureQuoteEn: 'But in a solitary life, there are rare moments when another soul dips near yours.',
        signatureQuoteAr: 'ولكن في حياة منعزلة، هناك لحظات نادرة تقترب فيها روح أخرى من روحك.',
    },
    'author_james_clear': {
        id: 'author_james_clear', nameEn: 'James Clear', nameAr: 'جيمس كلير',
        avatarUrl: 'https://images.gr-assets.com/authors/1532104523p8/15333155.jpg',
        bioEn: 'James Clear is a writer and speaker focused on habits, decision-making, and continuous improvement. His book Atomic Habits has sold over 5 million copies worldwide.',
        bioAr: 'جيمس كلير كاتب ومتحدث يركز على العادات واتخاذ القرار والتحسين المستمر. باع كتابه "العادات الذرية" أكثر من 5 ملايين نسخة في جميع أنحاء العالم.',
        lifespan: 'b. 1986', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_tara_westover': {
        id: 'author_tara_westover', nameEn: 'Tara Westover', nameAr: 'تارا ويستوفر',
        avatarUrl: 'https://images.gr-assets.com/authors/1513903825p8/15024522.jpg',
        bioEn: 'Tara Westover is an American memoirist, essayist and historian. Her memoir Educated debuted at No. 1 on The New York Times bestseller list.',
        bioAr: 'تارا ويستوفر كاتبة مذكرات وكاتبة مقالات ومؤرخة أمريكية. ظهرت مذكراتها "متعلمة" لأول مرة في المرتبة الأولى على قائمة الكتب الأكثر مبيعًا في نيويورك تايمز.',
        lifespan: 'b. 1986', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_delia_owens': {
        id: 'author_delia_owens', nameEn: 'Delia Owens', nameAr: 'ديليا أوينز',
        avatarUrl: 'https://images.gr-assets.com/authors/1526566236p8/17674313.jpg',
        bioEn: 'Delia Owens is an American author and zoologist. She is best known for her 2018 novel Where the Crawdads Sing.',
        bioAr: 'ديليا أوينز مؤلفة وعالمة حيوان أمريكية. اشتهرت بروايتها "حيث يغني جراد البحر" لعام 2018.',
        lifespan: 'b. 1949', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_kazuo_ishiguro': {
        id: 'author_kazuo_ishiguro', nameEn: 'Kazuo Ishiguro', nameAr: 'كازو إيشيغورو',
        avatarUrl: 'https://images.gr-assets.com/authors/1507636136p8/284.jpg',
        bioEn: 'Kazuo Ishiguro is a British novelist, screenwriter, and short-story writer. He was awarded the Nobel Prize in Literature in 2017.',
        bioAr: 'كازو إيشيغورو روائي وكاتب سيناريو وكاتب قصة قصيرة بريطاني. حصل على جائزة نوبل في الأدب عام 2017.',
        lifespan: 'b. 1954', countryEn: 'Japan / UK', countryAr: 'اليابان / المملكة المتحدة', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_kristin_hannah': {
        id: 'author_kristin_hannah', nameEn: 'Kristin Hannah', nameAr: 'كريستين هانا',
        avatarUrl: 'https://images.gr-assets.com/authors/1601925695p8/54493.jpg',
        bioEn: 'Kristin Hannah is an American writer. She is the author of more than 20 novels, including the international bestseller, The Nightingale.',
        bioAr: 'كريستين هانا كاتبة أمريكية. وهي مؤلفة لأكثر من 20 رواية ، بما في ذلك الرواية الأكثر مبيعًا عالميًا "العندليب".',
        lifespan: 'b. 1960', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_elara_vance': {
        id: 'author_elara_vance', nameEn: 'Elara Vance', nameAr: 'إيلارا فانس',
        avatarUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
        bioEn: 'Elara Vance is a debut author known for her intricate world-building in the steampunk fantasy genre. A former clockmaker, her works often feature complex machinery and cosmic mysteries.',
        bioAr: 'إيلارا فانس مؤلفة لأول مرة تشتهر ببنائها المعقد للعالم في نوع الخيال الستيم بانك. صانعة ساعات سابقة ، غالبًا ما تتميز أعمالها بآلات معقدة وألغاز كونية.',
        lifespan: 'b. 1988', countryEn: 'Aethelburg', countryAr: 'إيثلبورغ', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_brandon_sanderson': {
        id: 'author_brandon_sanderson', nameEn: 'Brandon Sanderson', nameAr: 'براندون ساندرسون',
        avatarUrl: 'https://images.gr-assets.com/authors/1394044556p8/38550.jpg',
        bioEn: 'Brandon Sanderson is an American author of epic fantasy and science fiction. He is best known for the Cosmere fictional universe, in which most of his fantasy novels are set.',
        bioAr: 'براندون ساندرسون هو مؤلف أمريكي للخيال الملحمي والخيال العلمي. يشتهر بالكون الخيالي Cosmere ، حيث تدور أحداث معظم رواياته الخيالية.',
        lifespan: 'b. 1975', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_nk_jemisin': {
        id: 'author_nk_jemisin', nameEn: 'N. K. Jemisin', nameAr: 'ن. ك. جেমيسين',
        avatarUrl: 'https://images.gr-assets.com/authors/1207853104p8/291793.jpg',
        bioEn: 'N. K. Jemisin is an American science fiction and fantasy writer. She has won the Hugo Award for Best Novel for three consecutive years for her Broken Earth series.',
        bioAr: 'ن. ك. جেমيسين كاتبة خيال علمي وفانتازيا أمريكية. فازت بجائزة هوغو لأفضل رواية لثلاث سنوات متتالية عن سلسلتها "الأرض المكسورة".',
        lifespan: 'b. 1972', countryEn: 'USA', countryAr: 'الولايات المتحدة الأمريكية', languageEn: 'English', languageAr: 'الإنجليزية',
    },
    'author_liu_cixin': {
        id: 'author_liu_cixin', nameEn: 'Liu Cixin', nameAr: 'ليو تسي شين',
        avatarUrl: 'https://images.gr-assets.com/authors/1415237335p8/7326442.jpg',
        bioEn: 'Liu Cixin is a Chinese science fiction writer. He is a nine-time winner of the Galaxy Award and a winner of the Hugo Award.',
        bioAr: 'ليو تسي شين كاتب خيال علمي صيني. وهو حائز على جائزة المجرة تسع مرات وحائز على جائزة هوغو.',
        lifespan: 'b. 1963', countryEn: 'China', countryAr: 'الصين', languageEn: 'Chinese, English', languageAr: 'الصينية، الإنجليزية',
    },
};

// --- BOOKS ---
export const mockBooks: Record<string, Book> = {
    'book1': {
        id: 'book1',
        authorId: 'author_matt_haig',
        titleEn: 'The Midnight Library',
        titleAr: 'مكتبة منتصف الليل',
        authorEn: 'Matt Haig',
        authorAr: 'مات هيغ',
        coverUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=80&w=400',
        descriptionEn: 'Between life and death there is a library, and within that library, the shelves go on forever. Every book provides a chance to try another life you could have lived.',
        descriptionAr: 'بين الحياة والموت توجد مكتبة، وفي تلك المكتبة، تمتد الأرفف إلى ما لا نهاية. كل كتاب يوفر فرصة لتجربة حياة أخرى كان بإمكانك أن تعيشها.',
        genresEn: ['Fantasy', 'Contemporary'],
        genresAr: ['خيال', 'معاصر'],
        rating: 4.8,
        ratingsCount: 12053,
        isEbookAvailable: true,
        publicationDate: '2020-09-29',
        pageCount: 389,
    },
    'book2': {
        id: 'book2',
        authorId: 'author_andy_weir',
        titleEn: 'Project Hail Mary',
        titleAr: 'مشروع هيل ماري',
        authorEn: 'Andy Weir',
        authorAr: 'آندي وير',
        coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=400',
        descriptionEn: 'Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the earth itself will perish.',
        descriptionAr: 'ريلاند جريس هو الناجي الوحيد في مهمة يائسة وأخيرة - وإذا فشل، فإن البشرية والأرض نفسها ستفنى.',
        genresEn: ['Sci-Fi', 'Thriller'],
        genresAr: ['خيال علمي', 'إثارة'],
        rating: 4.9,
        ratingsCount: 25890,
        isEbookAvailable: false,
        publicationDate: '2021-05-04',
        pageCount: 476,
    },
    'book3': {
        id: 'book3',
        authorId: 'author_frank_herbert',
        titleEn: 'Dune',
        titleAr: 'كثيب',
        authorEn: 'Frank Herbert',
        authorAr: 'فرانك هربرت',
        coverUrl: 'https://images.unsplash.com/photo-1506729623303-a17a262cda28?q=80&w=400',
        descriptionEn: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the “spice” melange.',
        descriptionAr: 'تدور أحداث القصة على كوكب أراكيس الصحراوي، وهي قصة الصبي بول أتريديز، وريث عائلة نبيلة مكلفة بحكم عالم غير مضياف حيث الشيء الوحيد ذو القيمة هو "بهار" الميلانج.',
        genresEn: ['Sci-Fi', 'Classic'],
        genresAr: ['خيال علمي', 'كلاسيكي'],
        rating: 4.6,
        ratingsCount: 98765,
        isEbookAvailable: true,
        publicationDate: '1965-08-01',
        pageCount: 412,
    },
    'book4': {
        id: 'book4',
        authorId: 'author_alex_michaelides',
        titleEn: 'The Silent Patient',
        titleAr: 'المريض الصامت',
        authorEn: 'Alex Michaelides',
        authorAr: 'أليكس ميكايليديس',
        coverUrl: 'https://images.unsplash.com/photo-1555952517-2e8e729e0b44?q=80&w=400',
        descriptionEn: 'Alicia Berenson’s life is seemingly perfect. A famous painter married to an in-demand fashion photographer, she lives in a grand house with big windows overlooking a park in one of London’s most desirable areas.',
        descriptionAr: 'حياة أليسيا بيرينسون تبدو مثالية. رسامة مشهورة متزوجة من مصور أزياء مطلوب، تعيش في منزل كبير بنوافذ كبيرة تطل على حديقة في واحدة من أكثر مناطق لندن المرغوبة.',
        genresEn: ['Thriller', 'Mystery'],
        genresAr: ['إثارة', 'غموض'],
        rating: 4.1,
        ratingsCount: 890123,
        isEbookAvailable: false,
        publicationDate: '2019-02-05',
        pageCount: 325,
    },
    'book5': {
        id: 'book5',
        authorId: 'author_madeline_miller',
        titleEn: 'Circe',
        titleAr: 'سيرسي',
        authorEn: 'Madeline Miller',
        authorAr: 'مادلين ميلر',
        coverUrl: 'https://images.unsplash.com/photo-1589578037326-c284d7c62b66?q=80&w=400',
        descriptionEn: 'In the house of Helios, god of the sun and mightiest of the Titans, a daughter is born. But Circe is a strange child--not powerful, like her father, nor viciously alluring like her mother.',
        descriptionAr: 'في منزل هيليوس، إله الشمس وأقوى الجبابرة، ولدت ابنة. لكن سيرسي طفلة غريبة - ليست قوية مثل والدها، ولا جذابة بوحشية مثل والدتها.',
        genresEn: ['Fantasy', 'Mythology'],
        genresAr: ['خيال', 'أساطير'],
        rating: 4.3,
        ratingsCount: 750321,
        isEbookAvailable: true,
        publicationDate: '2018-04-10',
        pageCount: 393,
    },
    'book6': {
        id: 'book6',
        authorId: 'author_james_clear',
        titleEn: 'Atomic Habits',
        titleAr: 'العادات الذرية',
        authorEn: 'James Clear',
        authorAr: 'جيمس كلير',
        coverUrl: 'https://images.unsplash.com/photo-1550534792-520623a0b691?q=80&w=400',
        descriptionEn: 'Tiny Changes, Remarkable Results. An easy & proven way to build good habits & break bad ones.',
        descriptionAr: 'تغييرات صغيرة، نتائج ملحوظة. طريقة سهلة ومثبتة لبناء عادات جيدة وكسر عادات سيئة.',
        genresEn: ['Self Help', 'Non-fiction'],
        genresAr: ['مساعدة ذاتية', 'واقعي'],
        rating: 4.4,
        ratingsCount: 500123,
        isEbookAvailable: false,
        publicationDate: '2018-10-16',
        pageCount: 320,
    },
    'book7': {
        id: 'book7',
        authorId: 'author_tara_westover',
        titleEn: 'Educated',
        titleAr: 'متعلمة',
        authorEn: 'Tara Westover',
        authorAr: 'تارا ويستوفر',
        coverUrl: 'https://images.unsplash.com/photo-1491841550275-5b462bf985ca?q=80&w=400',
        descriptionEn: 'A memoir about a young girl who, kept out of school, leaves her survivalist family and goes on to earn a PhD from Cambridge University.',
        descriptionAr: 'مذكرات عن فتاة صغيرة، مُنعت من الذهاب إلى المدرسة، تترك عائلتها الانعزالية وتذهب للحصول على درجة الدكتوراه من جامعة كامبريدج.',
        genresEn: ['Memoir', 'Non-fiction'],
        genresAr: ['مذكرات', 'واقعي'],
        rating: 4.47,
        ratingsCount: 890123,
        isEbookAvailable: true,
        publicationDate: '2018-02-20',
        pageCount: 352,
    },
    'book8': {
        id: 'book8',
        authorId: 'author_delia_owens',
        titleEn: 'Where the Crawdads Sing',
        titleAr: 'حيث يغني جراد البحر',
        authorEn: 'Delia Owens',
        authorAr: 'ديليا أوينز',
        coverUrl: 'https://images.unsplash.com/photo-1502472535043-16a319c3d101?q=80&w=400',
        descriptionEn: 'For years, rumors of the “Marsh Girl” have haunted Barkley Cove, a quiet town on the North Carolina coast.',
        descriptionAr: 'لسنوات، طاردت شائعات "فتاة المستنقع" باركلي كوف، وهي بلدة هادئة على ساحل كارولينا الشمالية.',
        genresEn: ['Fiction', 'Mystery'],
        genresAr: ['خيال', 'غموض'],
        rating: 4.4,
        ratingsCount: 1200000,
        isEbookAvailable: false,
        publicationDate: '2018-08-14',
        pageCount: 384,
    },
    'book9': {
        id: 'book9',
        authorId: 'author_kazuo_ishiguro',
        titleEn: 'Klara and the Sun',
        titleAr: 'كلارا والشمس',
        authorEn: 'Kazuo Ishiguro',
        authorAr: 'كازو إيشيغورو',
        coverUrl: 'https://images.unsplash.com/photo-1610484826922-269c75a4d4c4?q=80&w=400',
        descriptionEn: 'A novel that looks at our changing world through the eyes of an unforgettable narrator, and explores the fundamental question: what does it mean to love?',
        descriptionAr: 'رواية تنظر إلى عالمنا المتغير من خلال عيون راوية لا تُنسى، وتستكشف السؤال الأساسي: ماذا يعني أن تحب؟',
        genresEn: ['Sci-Fi', 'Fiction'],
        genresAr: ['خيال علمي', 'خيال'],
        rating: 3.9,
        ratingsCount: 345678,
        isEbookAvailable: true,
        publicationDate: '2021-03-02',
        pageCount: 303,
    },
    'book10': {
        id: 'book10',
        authorId: 'author_kristin_hannah',
        titleEn: 'The Four Winds',
        titleAr: 'الرياح الأربع',
        authorEn: 'Kristin Hannah',
        authorAr: 'كريستين هانا',
        coverUrl: 'https://images.unsplash.com/photo-1590422122243-71a4a159d83a?q=80&w=400',
        descriptionEn: 'An epic novel of love and heroism and hope, set during the Great Depression, a time when the country was in crisis and at war with itself, when millions were out of work and even the land seemed to have turned against them.',
        descriptionAr: 'رواية ملحمية عن الحب والبطولة والأمل، تدور أحداثها خلال فترة الكساد الكبير، وهي فترة كانت فيها البلاد في أزمة وفي حرب مع نفسها، عندما كان الملايين عاطلين عن العمل وحتى الأرض بدت وكأنها انقلبت عليهم.',
        genresEn: ['Historical Fiction', 'Fiction'],
        genresAr: ['خيال تاريخي', 'خيال'],
        rating: 4.3,
        ratingsCount: 450123,
        isEbookAvailable: false,
        publicationDate: '2021-02-02',
        pageCount: 464,
    },
     'book11': {
        id: 'book11', authorId: 'author_brandon_sanderson', titleEn: 'The Way of Kings', titleAr: 'طريق الملوك',
        authorEn: 'Brandon Sanderson', authorAr: 'براندون ساندرسون',
        coverUrl: 'https://images.unsplash.com/photo-1550989460-0d7e62a1a273?q=80&w=400',
        descriptionEn: 'In a world of stone and storms, a war wages. It is a war that will change the world, and one that is fought by men who can bind the storms to their will.',
        descriptionAr: 'في عالم من الحجر والعواصف، تدور حرب. إنها حرب ستغير العالم، ويخوضها رجال يمكنهم ربط العواصف بإرادتهم.',
        genresEn: ['Fantasy', 'Epic'], genresAr: ['خيال', 'ملحمي'], rating: 4.6, ratingsCount: 387654, isEbookAvailable: true, publicationDate: '2010-08-31', pageCount: 1007,
    },
    'book12': {
        id: 'book12', authorId: 'author_nk_jemisin', titleEn: 'The Fifth Season', titleAr: 'الموسم الخامس',
        authorEn: 'N. K. Jemisin', authorAr: 'ن. ك. جেমيسين',
        coverUrl: 'https://images.unsplash.com/photo-1574885090236-40e8b1599a09?q=80&w=400',
        descriptionEn: 'This is the way the world ends. Again. A season of endings has begun. It starts with the great red rift across the heart of the world\'s sole continent.',
        descriptionAr: 'هذه هي الطريقة التي ينتهي بها العالم. مرة أخرى. بدأ موسم النهايات. يبدأ بالصدع الأحمر العظيم عبر قلب القارة الوحيدة في العالم.',
        genresEn: ['Fantasy', 'Sci-Fi'], genresAr: ['خيال', 'خيال علمي'], rating: 4.3, ratingsCount: 187654, isEbookAvailable: false, publicationDate: '2015-08-04', pageCount: 512,
    },
    'book13': {
        id: 'book13', authorId: 'author_liu_cixin', titleEn: 'The Three-Body Problem', titleAr: 'مشكلة الأجسام الثلاثة',
        authorEn: 'Liu Cixin', authorAr: 'ليو تسي شين',
        coverUrl: 'https://images.unsplash.com/photo-1608178398319-48f814d0750c?q=80&w=400',
        descriptionEn: 'Set against the backdrop of China\'s Cultural Revolution, a secret military project sends signals into space to establish contact with aliens.',
        descriptionAr: 'على خلفية الثورة الثقافية في الصين، يرسل مشروع عسكري سري إشارات إلى الفضاء لإقامة اتصال مع كائنات فضائية.',
        genresEn: ['Sci-Fi', 'Hard Sci-Fi'], genresAr: ['خيال علمي', 'خيال علمي صعب'], rating: 4.1, ratingsCount: 234567, isEbookAvailable: true, publicationDate: '2008-01-01', pageCount: 400,
    },
    'book14': {
        id: 'book14', authorId: 'author_brandon_sanderson', titleEn: 'Mistborn: The Final Empire', titleAr: 'مولود الضباب: الإمبراطورية الأخيرة',
        authorEn: 'Brandon Sanderson', authorAr: 'براندون ساندرسون',
        coverUrl: 'https://images.unsplash.com/photo-1549117163-17b5a8a11323?q=80&w=400',
        descriptionEn: 'In a world where ash falls from the sky and mists rule the night, an unlikely heroine rises to lead a rebellion against the immortal Lord Ruler.',
        descriptionAr: 'في عالم يتساقط فيه الرماد من السماء ويسيطر الضباب على الليل، تنهض بطلة غير متوقعة لقيادة تمرد ضد الحاكم الخالد.',
        genresEn: ['Fantasy', 'High Fantasy'], genresAr: ['خيال', 'خيال عالي'], rating: 4.5, ratingsCount: 587321, isEbookAvailable: false, publicationDate: '2006-07-17', pageCount: 541,
    },
    'book15': {
        id: 'book15', authorId: 'author_nk_jemisin', titleEn: 'The City We Became', titleAr: 'المدينة التي أصبحناها',
        authorEn: 'N. K. Jemisin', authorAr: 'ن. ك. جেমيسين',
        coverUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=400',
        descriptionEn: 'Every city has a soul. Some are as ancient as myths, and others are as new and destructive as children. New York City? She\'s got six.',
        descriptionAr: 'كل مدينة لها روح. بعضها قديم قدم الأساطير، والبعض الآخر جديد ومدمر مثل الأطفال. مدينة نيويورك؟ لديها ستة.',
        genresEn: ['Fantasy', 'Urban Fantasy'], genresAr: ['خيال', 'خيال حضري'], rating: 4.0, ratingsCount: 89765, isEbookAvailable: true, publicationDate: '2020-03-24', pageCount: 437,
    },
    'book16': {
        id: 'book16', authorId: 'author_liu_cixin', titleEn: 'The Dark Forest', titleAr: 'الغابة المظلمة',
        authorEn: 'Liu Cixin', authorAr: 'ليو تسي شين',
        coverUrl: 'https://images.unsplash.com/photo-1505322262334-a27f2e259b73?q=80&w=400',
        descriptionEn: 'In The Dark Forest, Earth is reeling from the revelation of a coming alien invasion-in just four centuries\' time.',
        descriptionAr: 'في الغابة المظلمة، تترنح الأرض من كشف غزو فضائي قادم - في غضون أربعة قرون فقط.',
        genresEn: ['Sci-Fi', 'Hard Sci-Fi'], genresAr: ['خيال علمي', 'خيال علمي صعب'], rating: 4.4, ratingsCount: 156789, isEbookAvailable: false, publicationDate: '2008-05-01', pageCount: 512,
    },
    'book17': {
        id: 'book17', authorId: 'author_andy_weir', titleEn: 'Artemis', titleAr: 'أرتميس',
        authorEn: 'Andy Weir', authorAr: 'آندي وير',
        coverUrl: 'https://images.unsplash.com/photo-1534245241235-ea4a5816b803?q=80&w=400',
        descriptionEn: 'Jazz Bashara is a criminal. Well, sort of. Life on Artemis, the first and only city on the moon, is tough if you\'re not a tourist or an eccentric billionaire.',
        descriptionAr: 'جاز بشارة مجرمة. حسنًا، نوعًا ما. الحياة في أرتميس، المدينة الأولى والوحيدة على سطح القمر، صعبة إذا لم تكن سائحًا أو مليارديرًا غريب الأطوار.',
        genresEn: ['Sci-Fi', 'Thriller'], genresAr: ['خيال علمي', 'إثارة'], rating: 3.6, ratingsCount: 245321, isEbookAvailable: true, publicationDate: '2017-11-14', pageCount: 305,
    },
    'book18': {
        id: 'book18', authorId: 'author_matt_haig', titleEn: 'How to Stop Time', titleAr: 'كيف توقف الزمن',
        authorEn: 'Matt Haig', authorAr: 'مات هيغ',
        coverUrl: 'https://images.unsplash.com/photo-1508247957343-a022f469d528?q=80&w=400',
        descriptionEn: 'Tom Hazard has a dangerous secret. He may look like an ordinary 41-year-old, but owing to a rare condition, he\'s been alive for centuries.',
        descriptionAr: 'توم هازارد لديه سر خطير. قد يبدو كرجل عادي يبلغ من العمر 41 عامًا، ولكن بسبب حالة نادرة، فقد عاش لعدة قرون.',
        genresEn: ['Fantasy', 'Historical Fiction'], genresAr: ['خيال', 'خيال تاريخي'], rating: 3.8, ratingsCount: 156789, isEbookAvailable: false, publicationDate: '2017-07-06', pageCount: 352,
    },
    'book19': {
        id: 'book19', authorId: 'author_madeline_miller', titleEn: 'The Song of Achilles', titleAr: 'أغنية أخيل',
        authorEn: 'Madeline Miller', authorAr: 'مادلين ميلر',
        coverUrl: 'https://images.unsplash.com/photo-1617096200347-cb04ae810b1d?q=80&w=400',
        descriptionEn: 'Greece in the age of heroes. Patroclus, an awkward young prince, has been exiled to the kingdom of Phthia. Here he meets Achilles, son of the cruel sea goddess Thetis and the legendary king Peleus.',
        descriptionAr: 'اليونان في عصر الأبطال. بتروكلوس، أمير شاب أخرق، تم نفيه إلى مملكة فثيا. هنا يلتقي أخيل، ابن إلهة البحر القاسية ثيتيس والملك الأسطوري بيليوس.',
        genresEn: ['Fantasy', 'Mythology', 'LGBT'], genresAr: ['خيال', 'أساطير', 'مجتمع الميم'], rating: 4.4, ratingsCount: 987654, isEbookAvailable: true, publicationDate: '2011-09-20', pageCount: 352,
    },
    'book20': {
        id: 'book20', authorId: 'author_kazuo_ishiguro', titleEn: 'The Remains of the Day', titleAr: 'بقايا اليوم',
        authorEn: 'Kazuo Ishiguro', authorAr: 'كازو إيشيغورو',
        coverUrl: 'https://images.unsplash.com/photo-1544716278-e513176f20b5?q=80&w=400',
        descriptionEn: 'A profoundly compelling portrait of the perfect English butler and of his fading, insular world in post-World War II England.',
        descriptionAr: 'صورة مؤثرة للغاية لكبير الخدم الإنجليزي المثالي وعالمه المتلاشي المنعزل في إنجلترا ما بعد الحرب العالمية الثانية.',
        genresEn: ['Fiction', 'Historical Fiction', 'Classic'], genresAr: ['خيال', 'خيال تاريخي', 'كلاسيكي'], rating: 4.1, ratingsCount: 234567, isEbookAvailable: false, publicationDate: '1989-05-04', pageCount: 258,
    },
    'book21': {
        id: 'book21', authorId: 'author_kristin_hannah', titleEn: 'The Nightingale', titleAr: 'العندليب',
        authorEn: 'Kristin Hannah', authorAr: 'كريستين هانا',
        coverUrl: 'https://images.unsplash.com/photo-1478104115514-6316208548a8?q=80&w=400',
        descriptionEn: 'In the quiet village of Carriveau, Vianne Mauriac says goodbye to her husband, Antoine, as he heads for the Front. She doesn’t believe that the Nazis will invade France...but they do.',
        descriptionAr: 'في قرية كاريفو الهادئة، تودع فيان مورياك زوجها أنطوان وهو يتجه إلى الجبهة. لا تعتقد أن النازيين سيغزون فرنسا... لكنهم يفعلون.',
        genresEn: ['Historical Fiction', 'Fiction'], genresAr: ['خيال تاريخي', 'خيال'],
        rating: 4.6,
        ratingsCount: 876543,
        isEbookAvailable: true,
        publicationDate: '2015-02-03',
        pageCount: 440,
    },
     'book22': {
        id: 'book22', authorId: 'author_brandon_sanderson', titleEn: 'Words of Radiance', titleAr: 'كلمات الإشراق',
        authorEn: 'Brandon Sanderson', authorAr: 'براندون ساندرسون',
        coverUrl: 'https://images.unsplash.com/photo-1518359953610-b53351336a5c?q=80&w=400',
        descriptionEn: 'The Knights Radiant must stand again. The ancient oaths have at last been spoken; the spren are returning. As different factions vie for control, the world of Roshar is in turmoil.',
        descriptionAr: 'يجب أن يقف فرسان الإشراق مرة أخرى. تم نطق القسم القديم أخيرًا؛ السبرين عائدون. بينما تتنافس الفصائل المختلفة للسيطرة، عالم روشار في حالة اضطراب.',
        genresEn: ['Fantasy', 'Epic'], genresAr: ['خيال', 'ملحمي'], rating: 4.8, ratingsCount: 312456, isEbookAvailable: false, publicationDate: '2014-03-04', pageCount: 1087,
    },
    'book23': {
        id: 'book23', authorId: 'author_nk_jemisin', titleEn: 'The Obelisk Gate', titleAr: 'بوابة المسلة',
        authorEn: 'N. K. Jemisin', authorAr: 'ن. ك. جেমيسين',
        coverUrl: 'https://images.unsplash.com/photo-1605710340118-282b0e716462?q=80&w=400',
        descriptionEn: 'The season of endings grows darker as civilization fades into the long cold night. Essun has found shelter, but not safety.',
        descriptionAr: 'يزداد موسم النهايات قتامة مع تلاشي الحضارة في الليل البارد الطويل. وجدت إيسون مأوى، ولكن ليس أمانًا.',
        genresEn: ['Fantasy', 'Sci-Fi'], genresAr: ['خيال', 'خيال علمي'], rating: 4.4, ratingsCount: 112345, isEbookAvailable: true, publicationDate: '2016-08-16', pageCount: 416,
    },
    'book24': {
        id: 'book24', authorId: 'author_liu_cixin', titleEn: 'Death\'s End', titleAr: 'نهاية الموت',
        authorEn: 'Liu Cixin', authorAr: 'ليو تسي شين',
        coverUrl: 'https://images.unsplash.com/photo-1506477335327-33cadd35a438?q=80&w=400',
        descriptionEn: 'Half a century after the Doomsday Battle, the uneasy balance of Dark Forest Deterrence keeps the Trisolaran invaders at bay.',
        descriptionAr: 'بعد نصف قرن من معركة يوم القيامة، يحافظ التوازن غير المستقر لردع الغابة المظلمة على غزاة تريسولاران في مأزق.',
        genresEn: ['Sci-Fi', 'Hard Sci-Fi'], genresAr: ['خيال علمي', 'خيال علمي صعب'], rating: 4.5, ratingsCount: 109876, isEbookAvailable: false, publicationDate: '2010-11-01', pageCount: 720,
    },
};

const bookKeys = Object.keys(mockBooks) as (keyof typeof mockBooks)[];
bookKeys.forEach((key, index) => {
  mockBooks[key].isEbookAvailable = index % 2 === 0;
});


export const mockRecommendedIds = ['book1', 'book3', 'book5', 'book7', 'book9', 'book11', 'book13', 'book15', 'book17', 'book19', 'book21', 'book23'];
export const mockTrendingIds = ['book2', 'book4', 'book6', 'book8', 'book10', 'book12', 'book14', 'book16', 'book18', 'book20', 'book22', 'book24'];
export const mockFallbackBookIds = ['book1', 'book2', 'book3', 'book4'];


export const mockBookFlowData: BookFlowItem[] = [
    {
        bookId: 'book1',
        bookCoverUrl: mockBooks['book1'].coverUrl,
        quoteTextEn: 'Every book provides a chance to try another life you could have lived.',
        quoteTextAr: 'كل كتاب يوفر فرصة لتجربة حياة أخرى كان بإمكانك أن تعيشها.',
        authorEn: mockBooks['book1'].authorEn,
        authorAr: mockBooks['book1'].authorAr,
    },
    {
        bookId: 'book4',
        bookCoverUrl: mockBooks['book4'].coverUrl,
        quoteTextEn: 'We are all crazy, I believe, just in different ways.',
        quoteTextAr: 'كلنا مجانين، على ما أعتقد، ولكن بطرق مختلفة.',
        authorEn: mockBooks['book4'].authorEn,
        authorAr: mockBooks['book4'].authorAr,
    },
    {
        bookId: 'book5',
        bookCoverUrl: mockBooks['book5'].coverUrl,
        quoteTextEn: 'But in a solitary life, there are rare moments when another soul dips near yours, as stars once a year brush the earth.',
        quoteTextAr: 'ولكن في حياة منعزلة، هناك لحظات نادرة تقترب فيها روح أخرى من روحك، كما تلامس النجوم الأرض مرة في السنة.',
        authorEn: mockBooks['book5'].authorEn,
        authorAr: mockBooks['book5'].authorAr,
    },
    {
        bookId: 'book2',
        bookCoverUrl: mockBooks['book2'].coverUrl,
        quoteTextEn: 'Humanity is a science experiment. All living things are. We\'re all just seeing what happens.',
        quoteTextAr: 'البشرية تجربة علمية. كل الكائنات الحية كذلك. كلنا فقط نرى ما سيحدث.',
        authorEn: mockBooks['book2'].authorEn,
        authorAr: mockBooks['book2'].authorAr,
    },
    {
        bookId: 'book6',
        bookCoverUrl: mockBooks['book6'].coverUrl,
        quoteTextEn: 'You do not rise to the level of your goals. You fall to the level of your systems.',
        quoteTextAr: 'أنت لا ترتقي إلى مستوى أهدافك. أنت تسقط إلى مستوى أنظمتك.',
        authorEn: mockBooks['book6'].authorEn,
        authorAr: mockBooks['book6'].authorAr,
    },
    {
        bookId: 'book3',
        bookCoverUrl: mockBooks['book3'].coverUrl,
        quoteTextEn: 'I must not fear. Fear is the mind-killer.',
        quoteTextAr: 'يجب ألا أخاف. الخوف هو قاتل العقل.',
        authorEn: mockBooks['book3'].authorEn,
        authorAr: mockBooks['book3'].authorAr,
    },
    {
        bookId: 'book7',
        bookCoverUrl: mockBooks['book7'].coverUrl,
        quoteTextEn: 'The decisions I made after that moment were not the ones she would have made. They were the choices of a changed person, a new self.',
        quoteTextAr: 'القرارات التي اتخذتها بعد تلك اللحظة لم تكن تلك التي كانت ستتخذها. كانت خيارات شخص متغير، ذات جديدة.',
        authorEn: mockBooks['book7'].authorEn,
        authorAr: mockBooks['book7'].authorAr,
    },
    {
        bookId: 'book8',
        bookCoverUrl: mockBooks['book8'].coverUrl,
        quoteTextEn: 'I wasn\'t aware that words could hold so much. I didn\'t know a sentence could be so full.',
        quoteTextAr: 'لم أكن أدرك أن الكلمات يمكن أن تحمل الكثير. لم أكن أعرف أن جملة يمكن أن تكون ممتلئة إلى هذا الحد.',
        authorEn: mockBooks['book8'].authorEn,
        authorAr: mockBooks['book8'].authorAr,
    },
    {
        bookId: 'book9',
        bookCoverUrl: mockBooks['book9'].coverUrl,
        quoteTextEn: 'But what is a heart? Is it just something that pumps blood? Or is it the seat of the soul?',
        quoteTextAr: 'ولكن ما هو القلب؟ هل هو مجرد شيء يضخ الدم؟ أم أنه مقر الروح؟',
        authorEn: mockBooks['book9'].authorEn,
        authorAr: mockBooks['book9'].authorAr,
    },
    {
        bookId: 'book10',
        bookCoverUrl: mockBooks['book10'].coverUrl,
        quoteTextEn: 'Hope is a Ferris wheel—you have to wait for your turn to catch it.',
        quoteTextAr: 'الأمل عجلة فيريس - عليك أن تنتظر دورك لتمسك به.',
        authorEn: mockBooks['book10'].authorEn,
        authorAr: mockBooks['book10'].authorAr,
    },
];


// --- SHELVES ---
export const mockShelves: Shelf[] = [
    { 
        id: 'currently-reading', 
        ownerId: 'alex_doe', 
        titleEn: 'Currently Reading', 
        titleAr: 'أقرأ حاليًا', 
        bookIds: ['book1', 'book5', 'book2'],
    },
    { 
        id: 'want-to-read', 
        ownerId: 'alex_doe', 
        titleEn: 'Want to Read', 
        titleAr: 'أرغب في قراءته', 
        bookIds: ['book2', 'book6', 'book7', 'book8', 'book9'],
    },
    { 
        id: 'finished', 
        ownerId: 'alex_doe', 
        titleEn: 'Finished', 
        titleAr: 'انتهيت من قراءته', 
        bookIds: ['book4', 'book10', 'book3'],
    },
    { 
        id: 'sci-fi-faves', 
        ownerId: 'alex_doe', 
        titleEn: 'Sci-Fi Faves', 
        titleAr: 'مفضلاتي من الخيال العلمي', 
        bookIds: ['book2', 'book3', 'book9'],
    },
];

export const mockSamJonesShelves: Shelf[] = [
    { id: '2024-reading-challenge', ownerId: 'sam_jones', titleEn: '2024 Reading Challenge', titleAr: 'تحدي قراءة 2024', bookIds: ['book7'] },
    { id: 'sam_want_to_read', ownerId: 'sam_jones', titleEn: 'Want to Read', titleAr: 'أرغب في قراءته', bookIds: ['book8', 'book9'] },
];
export const mockJaneSmithShelves: Shelf[] = [
    { id: 'jane_thrillers', ownerId: 'jane_smith', titleEn: 'Thrillers & Mysteries', titleAr: 'إثارة وغموض', bookIds: ['book4'] },
];
export const mockMariaGarciaShelves: Shelf[] = [
    { id: 'maria_poetry', ownerId: 'maria_garcia', titleEn: 'Modern Poetry', titleAr: 'الشعر الحديث', bookIds: [] },
];


export const mockRecommendedShelves: RecommendedShelf[] = [
    { id: 'rec1', titleEn: "Epic Fantasy Worlds", titleAr: 'عوالم الفانتازيا الملحمية', ownerName: 'Jane Smith', bookCovers: [mockBooks['book3'].coverUrl, mockBooks['book1'].coverUrl], followerCount: 12500 },
    { id: 'rec2', titleEn: "Mind-Bending Sci-Fi", titleAr: 'خيال علمي محير للعقل', ownerName: 'BookBot5000', bookCovers: [mockBooks['book2'].coverUrl, mockBooks['book1'].coverUrl], followerCount: 8432 },
];


// --- QUOTES ---
export const mockQuoteOfTheDay: Quote = {
    id: 'qotd1',
    bookId: 'book3',
    authorId: 'author_frank_herbert',
    textEn: 'A reader lives a thousand lives before he dies . . . The man who never reads lives only one.',
    textAr: 'القارئ يعيش ألف حياة قبل أن يموت... الرجل الذي لا يقرأ أبدًا يعيش حياة واحدة فقط.',
    sourceEn: 'George R.R. Martin, A Dance with Dragons',
    sourceAr: 'جورج ر. ر. مارتن، رقصة مع التنانين',
};

export const mockUserQuotes: Quote[] = [
    mockQuoteOfTheDay,
    { id: 'q2', bookId: 'book_slaughterhouse_five', authorId: 'author_matt_haig', textEn: "So it goes.", textAr: "هكذا تسير الأمور.", sourceEn: "Kurt Vonigut, Slaughterhouse-Five", sourceAr: "كورت فونيجت، المسلخ الخامس" },
    { id: 'q3', bookId: 'book1', authorId: 'author_matt_haig', textEn: "The only way to learn is to live.", textAr: "الطريقة الوحيدة للتعلم هي أن تعيش.", sourceEn: "Matt Haig, The Midnight Library", sourceAr: "مات هيغ, مكتبة منتصف الليل" },
    { id: 'q4', bookId: undefined, authorId: undefined, textEn: "A blank page is a canvas for a new world.", textAr: "الصفحة البيضاء هي لوحة لعالم جديد.", sourceEn: "Anonymous", sourceAr: "مجهول" },
    { id: 'q5', bookId: 'book5', authorId: 'author_madeline_miller', textEn: "But in a solitary life, there are rare moments when another soul dips near yours, as stars once a year brush the earth.", textAr: "ولكن في حياة منعزلة، هناك لحظات نادرة تقترب فيها روح أخرى من روحك، كما تلامس النجوم الأرض مرة في السنة.", sourceEn: "Madeline Miller, Circe", sourceAr: "مادلين ميلر, سيرسي" },
    { id: 'q6', bookId: 'book3', authorId: 'author_frank_herbert', textEn: "I must not fear. Fear is the mind-killer.", textAr: "يجب ألا أخاف. الخوف هو قاتل العقل.", sourceEn: "Frank Herbert, Dune", sourceAr: "فرانك هربرت, كثيب" },
];


// --- PROJECTS ---
export const mockProjects: Project[] = [
    { id: 'proj1', titleEn: 'Starfall', titleAr: 'سقوط النجم', workType: 'book', typeEn: 'Novel', typeAr: 'رواية', status: 'Draft', wordCount: 25430, updatedAt: '2023-10-25T14:00:00Z', content: 'The night was cold on Kepler-186f...', isPublished: false },
    { id: 'proj2', titleEn: 'The Last Coffee Shop', titleAr: 'المقهى الأخير', workType: 'book', typeEn: 'Short Story', typeAr: 'قصة قصيرة', status: 'Revision', wordCount: 5200, updatedAt: '2023-10-22T11:00:00Z', content: 'It was the last coffee shop at the end of the world.', isPublished: true },
    { id: 'proj3', titleEn: 'Echoes in the Void', titleAr: 'أصداء في الفراغ', workType: 'book', typeEn: 'Poetry Collection', typeAr: 'مجموعة شعرية', status: 'Idea', wordCount: 500, updatedAt: '2023-11-05T10:00:00Z', content: '# Starlight\n\nA single point of light...\n', isPublished: false },
    { id: 'proj4', titleEn: 'My Journey Through Books', titleAr: 'رحلتي عبر الكتب', workType: 'book', typeEn: 'Memoir Outline', typeAr: 'مخطط مذكرات', status: 'Idea', wordCount: 1200, updatedAt: '2023-11-03T18:00:00Z', content: '## Chapter 1: The First Spark\n\n- The book that started it all...', isPublished: false },
];

// --- POSTS ---
export const mockSocialFeedPosts: Post[] = [
    {
        id: 'post37',
        authorId: 'system',
        authorName: 'BookTown Discovery',
        authorHandle: '@booktown',
        authorAvatar: '/assets/librarian-avatar.png',
        content: { text: '', attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{
            type: 'user',
            userId: 'sam_jones',
            displayName: 'Sam Jones',
            handle: '@samjones',
            avatarUrl: mockUsers[2].avatarUrl,
            coverUrl: mockUsers[2].bannerUrl,
            bio: mockUsers[2].bioEn,
            vibe: "Historical Fiction Explorer",
            stats: {
                booksRead: 88,
                wordsWritten: 1200,
                shelvesCount: 8
            },
            interests: ['Classics', 'History', 'Non-fiction'],
            topBooks: [
                { id: 'book7', title: 'Educated', coverUrl: mockBooks['book7'].coverUrl },
                { id: 'book3', title: 'Dune', coverUrl: mockBooks['book3'].coverUrl },
                { id: 'book8', title: 'Where the Crawdads Sing', coverUrl: mockBooks['book8'].coverUrl },
            ],
            sharedInterest: "Shares your love for Classics and History.",
        }],
        comments: [],
        isFeatured: true,
    },
    {
        id: 'post2', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "`Project Hail Mary` was phenomenal! The science, the friendship... everything. 🚀 Any other sci-fi books with a strong sense of optimism and problem-solving?", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 132, comments: 1, reposts: 11, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book2', bookTitle: mockBooks.book2.titleEn, bookAuthor: mockBooks.book2.authorEn, bookCover: mockBooks.book2.coverUrl, bookRating: mockBooks.book2.rating }],
        comments: [
            { id: 'c2-1', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl, text: 'You should definitely check out "Children of Time" by Adrian Tchaikovsky!', timestamp: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString() },
        ],
        isFeatured: false,
    },
    {
        id: 'post1', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "Just read a fascinating piece on the rise of 'hopepunk'. It's such a refreshing counter to the grimdark trend. What are your favorite hopepunk novels?", attachments: [] },
        status: 'archived',
        visibility: 'public',
        counters: { likes: 74, comments: 2, reposts: 6, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book1', bookTitle: mockBooks.book1.titleEn, bookAuthor: mockBooks.book1.authorEn, bookCover: mockBooks.book1.coverUrl, bookRating: mockBooks.book1.rating }],
        comments: [
            { id: 'c1-1', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl, text: 'Oh, I love this! "The House in the Cerulean Sea" is a perfect example.', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
            { id: 'c1-2', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl, text: 'Becky Chambers\' Wayfarers series is peak hopepunk for me.', timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
        ],
        isFeatured: false,
    },
    {
        id: 'post3', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "This quote has been on my mind all week. A reminder to embrace every experience. ✨", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 190, comments: 12, reposts: 15, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'q3', quoteOwnerId: 'alex_doe' }], // Owner of quote is Alex
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post4', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Just updated my 'Sci-Fi Faves' shelf. It's my personal hall of fame. What do you think of my picks?", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 62, comments: 9, reposts: 4, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: 'sci-fi-faves', ownerId: 'alex_doe', shelfName: 'Sci-Fi Faves', bookCount: 2, covers: [mockBooks['book2'].coverUrl, mockBooks['book3'].coverUrl] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post5', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "So excited for this! Elara Vance is one of my favorite new authors. Who's planning on going to The Gilded Page for the signing? ✒️", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 85, comments: 14, reposts: 7, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'venue_the_gilded_page' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post6', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Do you prefer reading one book at a time, or do you juggle multiple books at once? I'm a serial monogamist with my reading, but curious about others!", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 99, comments: 45, reposts: 2, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post7', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "I will never get tired of Greek mythology retellings. `Circe` was an absolute masterpiece. Madeline Miller's writing is pure magic.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 280, comments: 21, reposts: 19, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book5', bookTitle: mockBooks.book5.titleEn, bookAuthor: mockBooks.book5.authorEn, bookCover: mockBooks.book5.coverUrl, bookRating: mockBooks.book5.rating }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post8', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Unpopular opinion: The 'chosen one' trope is overdone and I'm tired of it. Give me a protagonist who's just a regular person trying their best.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 450, comments: 88, reposts: 40, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post9', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "My happy place. The best coffee and an even better atmosphere for diving into a new book. If you're in town, you have to visit The Gilded Page.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 110, comments: 6, reposts: 3, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'venue_the_gilded_page' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post10', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Reading `Atomic Habits` has genuinely changed my daily routine. The idea of '1% better every day' is so powerful. Small changes, big results.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 180, comments: 15, reposts: 20, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book6', bookTitle: mockBooks.book6.titleEn, bookAuthor: mockBooks.book6.authorEn, bookCover: mockBooks.book6.coverUrl, bookRating: mockBooks.book6.rating }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post11', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "autumn leaves / a turning page / the story settles. #poetry #booklove", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 95, comments: 4, reposts: 8, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post12', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "A huge shoutout to Andy Weir for making complex science so accessible and thrilling. Your books are a masterclass in storytelling. Can't wait for what's next!", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 215, comments: 22, reposts: 30, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_andy_weir', authorName: mockAuthors['author_andy_weir'].nameEn, authorPhoto: mockAuthors['author_andy_weir'].avatarUrl, authorCountry: mockAuthors['author_andy_weir'].countryEn, signatureQuote: mockAuthors['author_andy_weir'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post13', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "Needed this little bit of inspiration for my current writing project. Sometimes you just have to start.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 150, comments: 7, reposts: 12, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'q4', quoteOwnerId: 'jane_smith' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post14', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Kicking off my '2024 Reading Challenge' shelf! I'm aiming for 50 books this year. Follow my progress and let's share recommendations!", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 78, comments: 11, reposts: 5, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: '2024-reading-challenge', ownerId: 'sam_jones', shelfName: '2024 Reading Challenge', bookCount: 1, covers: [mockBooks['book7'].coverUrl] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post15', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "Finished `Where the Crawdads Sing` and... wow. The atmosphere, the mystery, the prose. It's a story that will linger. So beautifully written.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 302, comments: 18, reposts: 25, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book8', bookTitle: mockBooks.book8.titleEn, bookAuthor: mockBooks.book8.authorEn, bookCover: mockBooks.book8.coverUrl, bookRating: mockBooks.book8.rating }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post16', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Finished 'Educated' by Tara Westover. An incredible, gut-wrenching, and ultimately inspiring memoir. It's a testament to the power of education to reshape a life. Highly, highly recommend.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 351, comments: 28, reposts: 45, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'book', bookId: 'book7', bookTitle: mockBooks.book7.titleEn, bookAuthor: mockBooks.book7.authorEn, bookCover: mockBooks.book7.coverUrl, bookRating: mockBooks.book7.rating }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post17', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "This quote always gets me. The power of reading is immeasurable.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 112, comments: 8, reposts: 14, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'qotd1', quoteOwnerId: 'alex_doe' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post18', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Kurt Vonigut's simple yet profound take on fate. 'So it goes.' A phrase for so many of life's moments.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 234, comments: 19, reposts: 22, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'q2', quoteOwnerId: 'alex_doe' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post19', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "Madeline Miller's prose is just... breathtaking. This line from Circe is everything.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 401, comments: 33, reposts: 50, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'q5', quoteOwnerId: 'maria_garcia' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post20', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Rereading Dune and this line hits just as hard every single time. A mantra.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 310, comments: 25, reposts: 30, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'quote', quoteId: 'q6', quoteOwnerId: 'alex_doe' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post21', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "My 'Thrillers & Mysteries' shelf is getting pretty full! Any suggestions for what to add next?", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 88, comments: 31, reposts: 3, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: 'jane_thrillers', ownerId: 'jane_smith', shelfName: 'Thrillers & Mysteries', bookCount: 1, covers: [mockBooks['book4'].coverUrl] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post22', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "My 'Want to Read' list is a living organism at this point. So many books, so little time!", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 154, comments: 40, reposts: 9, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: 'sam_want_to_read', ownerId: 'sam_jones', shelfName: 'Want to Read', bookCount: 2, covers: [mockBooks['book8'].coverUrl, mockBooks['book9'].coverUrl] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post23', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "Sharing my collection of modern poetry. It's my go-to shelf for inspiration.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 76, comments: 10, reposts: 5, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: 'maria_poetry', ownerId: 'maria_garcia', shelfName: 'Modern Poetry', bookCount: 0, covers: [] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post24', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Just moved another book to my 'Finished' shelf. Such a satisfying feeling. What have you all finished recently?", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 102, comments: 22, reposts: 1, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'shelf', shelfId: 'finished', ownerId: 'alex_doe', shelfName: 'Finished', bookCount: 1, covers: [mockBooks['book4'].coverUrl] }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post25', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Spent the afternoon at The Archive Library. So quiet and peaceful. A perfect spot for some deep reading.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 91, comments: 4, reposts: 2, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'venue_archive_library' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post26', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "Open mic night at The Gilded Page next week! Who's coming? I might read something new...", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 123, comments: 18, reposts: 11, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'event_poetry_slam' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post27', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "Discovered a new gem: Readers Retreat Cafe. Their lavender latte is divine and they have comfy armchairs everywhere.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 145, comments: 15, reposts: 8, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'venue_readers_retreat' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post28', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Book-themed cocktails at The Last Chapter Bar? Yes please. The 'Tequila Mockingbird' was excellent.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 210, comments: 25, reposts: 13, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 27 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 27 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'venue', venueId: 'venue_last_chapter' }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post29', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "Madeline Miller could write a grocery list and I'd read it. Her ability to breathe new life into ancient myths is unparalleled.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 255, comments: 20, reposts: 31, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_madeline_miller', authorName: mockAuthors['author_madeline_miller'].nameEn, authorPhoto: mockAuthors['author_madeline_miller'].avatarUrl, authorCountry: mockAuthors['author_madeline_miller'].countryEn, signatureQuote: mockAuthors['author_madeline_miller'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post30', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "James Clear's work has had a tangible impact on my life. It's not just about habits, it's about systems for living better.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 198, comments: 17, reposts: 24, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_james_clear', authorName: mockAuthors['author_james_clear'].nameEn, authorPhoto: mockAuthors['author_james_clear'].avatarUrl, authorCountry: mockAuthors['author_james_clear'].countryEn, signatureQuote: mockAuthors['author_james_clear'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post31', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "The subtlety in Kazuo Ishiguro's writing is just... chef's kiss. 'Klara and the Sun' was a quiet masterpiece.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 187, comments: 16, reposts: 10, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_kazuo_ishiguro', authorName: mockAuthors['author_kazuo_ishiguro'].nameEn, authorPhoto: mockAuthors['author_kazuo_ishiguro'].avatarUrl, authorCountry: mockAuthors['author_kazuo_ishiguro'].countryEn, signatureQuote: mockAuthors['author_kazuo_ishiguro'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post32', authorId: 'alex_doe', authorName: 'Alex Doe', authorHandle: '@alexdoe', authorAvatar: mockUsers[0].avatarUrl,
        content: { text: "Exploring the mind of Frank Herbert through Dune is a journey. The world-building is on another level.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 156, comments: 14, reposts: 18, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_frank_herbert', authorName: mockAuthors['author_frank_herbert'].nameEn, authorPhoto: mockAuthors['author_frank_herbert'].avatarUrl, authorCountry: mockAuthors['author_frank_herbert'].countryEn, signatureQuote: mockAuthors['author_frank_herbert'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post33', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "I'm officially a huge fan of Elara Vance. Can't wait for her next steampunk adventure.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 99, comments: 9, reposts: 6, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: true },
        attachments: [{ type: 'author', authorId: 'author_elara_vance', authorName: mockAuthors['author_elara_vance'].nameEn, authorPhoto: mockAuthors['author_elara_vance'].avatarUrl, authorCountry: mockAuthors['author_elara_vance'].countryEn, signatureQuote: mockAuthors['author_elara_vance'].signatureQuoteEn }],
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post34', authorId: 'jane_smith', authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        content: { text: "What's a book that you think is criminally underrated? I'm looking for hidden gems.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 205, comments: 101, reposts: 15, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post35', authorId: 'sam_jones', authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        content: { text: "Hot take: It's okay to not finish a book you're not enjoying. Life's too short for 'reading homework'.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 520, comments: 150, reposts: 60, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 34 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 34 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    },
    {
        id: 'post36', authorId: 'maria_garcia', authorName: 'Maria Garcia', authorHandle: '@mariagarcia', authorAvatar: mockUsers[3].avatarUrl,
        content: { text: "There's something magical about rereading a favorite book from your childhood. The nostalgia is so comforting.", attachments: [] },
        status: 'published',
        visibility: 'public',
        counters: { likes: 315, comments: 29, reposts: 21, bookmarks: 0 },
        timestamps: {
            createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: null,
            publishedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
        },
        flags: { edited: false, hasAttachments: false },
        comments: [],
        isFeatured: false,
    }
];

// --- AGENTS ---
export const mockAgents: Agent[] = [
    {
        id: 'librarian', name: 'Librarian', descriptionEn: 'Find your next\ngreat read', descriptionAr: 'اعثر على كتابك المفضل التالي',
        avatarUrl: '/assets/librarian-avatar.png', icon: ChatIcon, color: 'text-green-400', isPremium: false,
        examplePromptsEn: ["Recommend me something based on my mood.", "What are some underrated books by women authors?", "What should I read if I loved 'Dune'?"],
        examplePromptsAr: ["أوصي بشيء بناءً على مزاجي.", "ما هي بعض الكتب التي لا تحظى بالتقدير الكافي لمؤلفات نساء؟", "ماذا يجب أن أقرأ إذا أحببت 'كثيب'؟"],
        placeholderEn: "Tell me what you're looking for...",
        placeholderAr: "أخبرني عما تبحث عنه..."
    },
    {
        id: 'mentor', name: 'Mentor', descriptionEn: 'Get writing tips\nand feedback', descriptionAr: 'احصل على ملاحظات على كتابتك',
        avatarUrl: '/assets/mentor-avatar.png', icon: MentorIcon, color: 'text-sky-400', isPremium: false,
        examplePromptsEn: ["Critique this paragraph...", "Does this character feel real?", "Suggest a better opening line."],
        examplePromptsAr: ["انقد هذه الفقرة...", "هل تبدو هذه الشخصية حقيقية؟", "اقترح سطراً افتتاحياً أفضل."],
        placeholderEn: "Paste your text or ask a question...",
        placeholderAr: "ألصق نصك أو اطرح سؤالاً..."
    },
    {
        id: 'quotes', name: 'Quotes', descriptionEn: 'Discover powerful quotes', descriptionAr: 'اكتشف اقتباسات قوية',
        avatarUrl: '/assets/quotes-avatar.png', icon: QuoteIcon, color: 'text-amber-400', isPremium: false,
        examplePromptsEn: ["Quotes about courage", "Find a quote from 'Project Hail Mary'"],
        examplePromptsAr: ["اقتباسات عن الشجاعة", "ابحث عن اقتباس من 'مشروع هيل ماري'"],
        placeholderEn: "What kind of quote are you seeking?",
        placeholderAr: "أي نوع من الاقتباسات تبحث عنه؟"
    },
    {
        id: 'lore', name: 'Lore', descriptionEn: 'Explore fictional worlds', descriptionAr: 'استكشف عوالم خيالية',
        avatarUrl: '/assets/lore-avatar.png', icon: LoreIcon, color: 'text-purple-400', isPremium: true,
        examplePromptsEn: [], examplePromptsAr: [], placeholderEn: "", placeholderAr: ""
    }
];

// --- TEMPLATES ---
export const mockTemplates: Template[] = [
    {
        id: 'novel-outline',
        workType: 'book',
        titleEn: 'Novel Outline',
        titleAr: 'مخطط رواية',
        descriptionEn: 'Structure your epic.',
        descriptionAr: 'نظم ملحمتك.',
        icon: NovelIcon,
        boilerplateContent: `# Part 1: The Ordinary World\n\n## Chapter 1\n\n- Introduction to the protagonist...\n\n# Part 2: The Adventure Begins\n\n## Chapter 5\n\n- The inciting incident...\n`
    },
    {
        id: 'short-story-arc',
        workType: 'book',
        titleEn: 'Short Story Arc',
        titleAr: 'قوس القصة القصيرة',
        descriptionEn: 'A simple three-act structure.',
        descriptionAr: 'هيكل بسيط من ثلاثة فصول.',
        icon: ShortStoryIcon,
        boilerplateContent: `# Act 1: Setup\n\n- \n\n# Act 2: Confrontation\n\n- \n\n# Act 3: Resolution\n\n- \n`
    },
    {
        id: 'academic-essay',
        workType: 'article',
        titleEn: 'Academic Essay',
        titleAr: 'مقالة أكاديمية',
        descriptionEn: 'For research papers.',
        descriptionAr: 'لأوراق البحث.',
        icon: EssayIcon,
        boilerplateContent: `# Introduction\n\n- Hook:\n- Thesis Statement:\n\n# Body Paragraph 1\n\n- Topic Sentence:\n\n# Conclusion\n\n- Restate Thesis:\n`
    },
    {
        id: 'journal-entry',
        workType: 'journal',
        titleEn: 'Journal Entry',
        titleAr: 'إدخال يوميات',
        descriptionEn: 'Reflect on your day.',
        descriptionAr: 'تأمل في يومك.',
        icon: JournalIcon,
        boilerplateContent: `## Date: ${new Date().toLocaleDateString()}\n\n### How I'm feeling:\n\n\n### What happened today:\n\n\n### A thought to remember:\n\n`
    },
    {
        id: 'memoir',
        workType: 'book',
        titleEn: 'Memoir',
        titleAr: 'مذكرات',
        descriptionEn: 'Share your life story.',
        descriptionAr: 'شارك قصة حياتك.',
        icon: MemoirIcon,
        boilerplateContent: `# Chapter 1: Early Years\n\n- \n\n# Chapter 2: The Turning Point\n\n- \n`
    },
    {
        id: 'poetry',
        workType: 'book',
        titleEn: 'Poetry',
        titleAr: 'شعر',
        descriptionEn: 'Express with verse.',
        descriptionAr: 'عبر بالقافية.',
        icon: PoetryIcon,
        boilerplateContent: `## Title of Poem\n\nStanza 1...\n`
    },
    {
        id: 'book-review',
        workType: 'article',
        titleEn: 'Book Review',
        titleAr: 'مراجعة كتاب',
        descriptionEn: 'Critique a recent read.',
        descriptionAr: 'انقد قراءة حديثة.',
        icon: BookReviewIcon,
        boilerplateContent: `# Review of [Book Title]\n\n## Summary\n\n## Analysis\n\n## Conclusion\n`
    },
    {
        id: 'screenplay',
        workType: 'book',
        titleEn: 'Screenplay',
        titleAr: 'سيناريو',
        descriptionEn: 'Write for the screen.',
        descriptionAr: 'اكتب للشاشة.',
        icon: ScreenplayIcon,
        boilerplateContent: `FADE IN:\n\nEXT. LOCATION - DAY\n\nCHARACTER\n(V.O.)\nIt all started...\n`
    },
    {
        id: 'research-paper',
        workType: 'article',
        titleEn: 'Research Paper',
        titleAr: 'ورقة بحثية',
        descriptionEn: 'For scholarly articles.',
        descriptionAr: 'للمقالات العلمية.',
        icon: ResearchPaperIcon,
        boilerplateContent: `# Abstract\n\n# Introduction\n\n# Methodology\n\n# Results\n\n# Discussion\n`
    },
    {
        id: 'blog-post',
        workType: 'article',
        titleEn: 'Blog Post',
        titleAr: 'تدوينة',
        descriptionEn: 'Share your thoughts online.',
        descriptionAr: 'شارك أفكارك على الإنترنت.',
        icon: BlogPostIcon,
        boilerplateContent: `## Blog Post Title\n\n### Introduction\n\nBody content...\n`
    },
    {
        id: 'play-script',
        workType: 'book',
        titleEn: 'Play Script',
        titleAr: 'نص مسرحي',
        descriptionEn: 'For the stage.',
        descriptionAr: 'للمسرح.',
        icon: PlayIcon,
        boilerplateContent: `## Act I\n\n### Scene 1\n\n[SETTING]\n\nCHARACTER 1\n(dialogue...)\n`
    },
    {
        id: 'character-profile',
        workType: 'book',
        titleEn: 'Character Profile',
        titleAr: 'ملف شخصية',
        descriptionEn: 'Flesh out your characters.',
        descriptionAr: 'طور شخصياتك.',
        icon: CharacterProfileIcon,
        boilerplateContent: `# [Character Name]\n\n## Physical Description\n\n## Backstory\n\n## Goals\n\n## Flaws\n`
    }
];

// --- REVIEWS ---
export const mockReviews: Review[] = [
    {
        id: 'review1', bookId: 'book1', userId: 'jane_smith', rating: 5, text: 'A beautiful, thought-provoking novel that will stay with me for a long time. A must-read!',
        authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        upvotes: 210,
        downvotes: 5,
        commentsCount: 25,
    }
];

// --- DETAILED MOCK FOR BOOK DETAILS SCREEN ---
export const mockBookDetails: Book = {
    id: 'mock-celestial-labyrinth',
    authorId: 'author_elara_vance',
    titleEn: 'The Celestial Labyrinth',
    titleAr: 'المتاهة السماوية',
    authorEn: 'Elara Vance',
    authorAr: 'إيلارا فانس',
    coverUrl: 'https://images.unsplash.com/photo-1533134486753-c833f0ed4866?q=80&w=870&auto=format&fit=crop',
    descriptionEn: 'In a city powered by captured starlight, a disgraced cartographer discovers a map that leads to the Celestial Labyrinth, a mythical construct said to hold the secrets of the cosmos. But the map is a key, and some secrets are better left locked away.',
    descriptionAr: 'في مدينة تعمل بنور النجوم الأسيرة، تكتشف رسامة خرائط منبوذة خريطة تؤدي إلى المتاهة السماوية، وهي بناء أسطوري يُقال إنه يحمل أسرار الكون. لكن الخريطة هي مفتاح، وبعض الأسرار من الأفضل أن تبقى مغلقة.',
    genresEn: ['Steampunk', 'Fantasy', 'Mystery'],
    genresAr: ['ستيم بانك', 'خيال', 'غموض'],
    rating: 4.7,
    ratingsCount: 18432,
    isEbookAvailable: false,
    publicationDate: '2022-09-15',
    pageCount: 384,
};

export const mockBookDetailsReviews: Review[] = [
    {
        id: 'review-mock-1',
        bookId: 'mock-celestial-labyrinth',
        userId: 'jane_smith',
        rating: 5,
        text: 'An absolutely stunning world with a plot that keeps you guessing until the very end. Elara Vance is a master of steampunk fantasy. A must-read!',
        authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: 'https://randomuser.me/api/portraits/women/44.jpg',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        upvotes: 128,
        downvotes: 3,
        commentsCount: 12,
    },
    {
        id: 'review-mock-2',
        bookId: 'mock-celestial-labyrinth',
        userId: 'sam_jones',
        rating: 4,
        text: 'The world-building is top-notch. I felt like I was walking the gas-lit streets of Aethelburg. The pacing slowed a little in the middle, but the explosive finale more than made up for it.',
        authorName: 'Sam Jones',
        authorHandle: '@samjones',
        authorAvatar: 'https://randomuser.me/api/portraits/men/46.jpg',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        upvotes: 45,
        downvotes: 1,
        commentsCount: 5,
    },
];

export const mockVenue: Venue = {
    id: 'venue_the_gilded_page',
    ownerId: 'alex_doe',
    name: 'The Gilded Page',
    type: 'Bookstore & Cafe',
    address: '123 Literary Lane, BookTown',
    imageUrl: 'https://images.unsplash.com/photo-1550399105-c4db5fb85c18?q=80&w=2071&auto=format&fit=crop',
    descriptionEn: 'A cozy corner for readers and dreamers. Enjoy our curated collection and freshly brewed coffee.',
    descriptionAr: 'ركن دافئ للقراء والحالمين. استمتع بمجموعتنا المختارة والقهوة الطازجة.'
};

export const mockEvent: Event = {
    id: 'event_elara_vance_signing',
    ownerId: 'alex_doe',
    titleEn: 'Meet Elara Vance',
    titleAr: 'لقاء مع إيلارا فانس',
    type: 'Author Signing',
    dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // A week from now
    venueName: 'The Gilded Page',
    imageUrl: 'https://images.unsplash.com/photo-1589998059171-988d887df646?q=80&w=2070&auto=format&fit=crop',
    privacy: 'public',
};

export const mockBookFair: BookFair = {
    id: 'fair_booktown_2024',
    nameEn: 'BookTown Annual Fair 2024',
    nameAr: 'معرض بوكتاون السنوي ٢٠٢٤',
    dates: 'November 15-18, 2024',
    location: 'Exhibition Center, Downtown',
    taglineEn: 'Where stories come to life.',
    taglineAr: 'حيث تنبض القصص بالحياة.',
    imageUrl: 'https://images.unsplash.com/photo-1531988042231-f39a9cc12a9a?q=80&w=2070&auto=format&fit=crop'
};

export const mockVenuesAndEvents: (Venue | Event)[] = [
    {
        id: 'venue_the_gilded_page',
        ownerId: 'alex_doe',
        name: 'The Gilded Page',
        type: 'Bookstore & Cafe',
        address: '123 Literary Lane, BookTown',
        imageUrl: 'https://images.unsplash.com/photo-1550399105-c4db5fb85c18?q=80&w=2071&auto=format&fit=crop',
        descriptionEn: 'A cozy corner for readers and dreamers. Enjoy our curated collection and freshly brewed coffee.',
        descriptionAr: 'ركن دافئ للقراء والحالمين. استمتع بمجموعتنا المختارة والقهوة الطازجة.',
        openingHours: 'Mon-Sat: 9am - 8pm'
    },
    {
        id: 'event_elara_vance_signing',
        ownerId: 'alex_doe',
        titleEn: 'Meet Elara Vance',
        titleAr: 'لقاء مع إيلارا فانس',
        type: 'Author Signing',
        dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // A week from now
        venueName: 'The Gilded Page',
        imageUrl: 'https://images.unsplash.com/photo-1589998059171-988d887df646?q=80&w=2070&auto=format&fit=crop',
        duration: '2 hours',
        privacy: 'public'
    },
    {
        id: 'venue_archive_library',
        ownerId: 'alex_doe',
        name: 'The Archive Library',
        type: 'Public Library',
        address: '451 History Plaza, BookTown',
        imageUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=2070&auto=format&fit=crop',
        descriptionEn: 'A historic public library with a vast collection of classic and contemporary literature. Quiet reading rooms available.',
        descriptionAr: 'مكتبة عامة تاريخية تضم مجموعة واسعة من الأدب الكلاسيكي والمعاصر. تتوفر غرف قراءة هادئة.',
        openingHours: 'Tue-Sun: 10am - 6pm'
    },
    {
        id: 'event_poetry_slam',
        ownerId: 'alex_doe',
        titleEn: 'Open Mic Poetry Slam',
        titleAr: 'أمسية شعرية مفتوحة',
        type: 'Community Event',
        dateTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        venueName: 'The Gilded Page',
        imageUrl: 'https://images.unsplash.com/photo-1509015349254-67145435a242?q=80&w=2070&auto=format&fit=crop',
        duration: '3 hours',
        privacy: 'public'
    },
    {
        id: 'venue_readers_retreat',
        ownerId: 'jane_smith',
        name: 'Readers Retreat Cafe',
        type: 'Cafe',
        address: '456 Serenity St, BookTown',
        imageUrl: 'https://images.unsplash.com/photo-1512568400610-62da2848a608?w=800&auto=format&fit=crop',
        descriptionEn: 'The perfect spot to lose yourself in a book with a delicious lavender latte.',
        descriptionAr: 'المكان المثالي لتفقد نفسك في كتاب مع لاتيه الخزامى اللذيذ.',
        openingHours: 'Mon-Sun: 8am - 6pm',
        rating: 4.9,
        ratingsCount: 42,
    },
    {
        id: 'venue_last_chapter',
        ownerId: 'alex_doe',
        name: 'The Last Chapter Bar',
        type: 'Bar',
        address: '789 Plot Twist Ave, BookTown',
        imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&auto=format&fit=crop',
        descriptionEn: 'Literary-themed cocktails in a speakeasy setting. Try the "Tequila Mockingbird".',
        descriptionAr: 'كوكتيلات ذات طابع أدبي في أجواء تشبه الحانات السرية. جرب "Tequila Mockingbird".',
        openingHours: 'Tue-Sat: 5pm - 1am',
        rating: 4.7,
        ratingsCount: 128,
    },
];

export const mockVenueReviews: VenueReview[] = [
    {
        id: 'vr1',
        venueId: 'venue_the_gilded_page',
        userId: 'jane_smith',
        rating: 5,
        text: 'My absolute favorite spot in town! The coffee is amazing and the book selection is wonderfully curated. A perfect place to spend an afternoon.',
        authorName: 'Jane Smith', authorHandle: '@janesmith', authorAvatar: mockUsers[1].avatarUrl,
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        upvotes: 42,
        downvotes: 1,
        commentsCount: 3,
    },
    {
        id: 'vr2',
        venueId: 'venue_the_gilded_page',
        userId: 'sam_jones',
        rating: 4,
        text: 'Great atmosphere, but can get a bit crowded on weekends. Found a rare first edition here once!',
        authorName: 'Sam Jones', authorHandle: '@samjones', authorAvatar: mockUsers[2].avatarUrl,
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        upvotes: 15,
        downvotes: 0,
        commentsCount: 1,
    }
];


export const mockForYouFlowData: ForYouFlowItem[] = [
    { type: 'book', data: mockBookFlowData[1] }, // The Silent Patient
    { type: 'user', data: mockUsers[2] }, // Sam Jones
    { type: 'event', data: mockEvent },
    { type: 'quote', data: mockUserQuotes[1] }, // So it goes.
    { type: 'venue', data: mockVenue },
    { type: 'book', data: mockBookFlowData[4] }, // Atomic Habits
    { type: 'bookfair', data: mockBookFair },
    { type: 'user', data: mockUsers[3] }, // Maria Garcia
    { type: 'quote', data: mockUserQuotes[2] }, // The only way to learn is to live.
];

export const mockBookmarks: Bookmark[] = [
    { id: 'bookmark1', type: 'book', entityId: 'book1', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'bookmark2', type: 'quote', entityId: 'q2', quoteOwnerId: 'alex_doe', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'bookmark3', type: 'post', entityId: 'post1', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'bookmark4', type: 'author', entityId: 'author_andy_weir', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'bookmark5', type: 'venue', entityId: 'venue_the_gilded_page', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'bookmark6', type: 'event', entityId: 'event_elara_vance_signing', timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
];


export const mockConversations: Conversation[] = [
    {
        id: 'convo1',
        contactId: 'jane_smith',
        contactName: 'Jane Smith',
        contactAvatar: mockUsers[1].avatarUrl,
        lastMessage: "Yeah, Becky Chambers' Wayfarers series is peak hopepunk for me.",
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        unreadCount: 2,
    },
    {
        id: 'convo2',
        contactId: 'sam_jones',
        contactName: 'Sam Jones',
        contactAvatar: mockUsers[2].avatarUrl,
        lastMessage: "You should definitely check out 'Children of Time'!",
        timestamp: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
    },
    {
        id: 'convo3',
        contactId: 'maria_garcia',
        contactName: 'Maria Garcia',
        contactAvatar: mockUsers[3].avatarUrl,
        lastMessage: 'Oh, I love this! "The House in the Cerulean Sea" is a perfect example.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        unreadCount: 0,
    },
];

export const mockMessages: Record<string, DirectMessage[]> = {
    'convo1': [
        { id: 'm1-1', senderId: 'jane_smith', text: "Just read a fascinating piece on the rise of 'hopepunk'.", timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
        { id: 'm1-2', senderId: 'alex_doe', text: "Oh, I love this! 'The House in the Cerulean Sea' is a perfect example.", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { id: 'm1-3', senderId: 'jane_smith', text: "Yeah, Becky Chambers' Wayfarers series is peak hopepunk for me.", timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
    ],
    'convo2': [
        { id: 'm2-1', senderId: 'sam_jones', text: "`Project Hail Mary` was phenomenal! Any other sci-fi books with a strong sense of optimism?", timestamp: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString() },
        { id: 'm2-2', senderId: 'alex_doe', text: "You should definitely check out 'Children of Time'!", timestamp: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString() },
    ],
    'convo3': [
         { id: 'm3-1', senderId: 'maria_garcia', text: 'Oh, I love this! "The House in the Cerulean Sea" is a perfect example.', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ]
};


export const mockNotifications: Notification[] = [
    { 
        id: 'notif1', 
        uid: 'alex_doe',
        type: 'comment', 
        priority: 'medium',
        actor: { uid: 'jane_smith', name: 'Jane Smith' },
        target: { entity_type: 'post', entity_id: 'post1' },
        actorId: 'jane_smith', 
        actorType: 'user',
        entityType: 'post',
        entityId: 'post1',
        postId: 'post1',
        message: 'Jane Smith commented on your post.',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), 
        readAt: null,
        read: false, 
        sourceActivityId: 'act1',
        dedupeId: 'alex_doe_comment_jane_smith_post1'
    },
    { 
        id: 'notif2', 
        uid: 'alex_doe',
        type: 'like', 
        priority: 'medium',
        actor: { uid: 'sam_jones', name: 'Sam Jones' },
        target: { entity_type: 'post', entity_id: 'post4' },
        actorId: 'sam_jones', 
        actorType: 'user',
        entityType: 'post',
        entityId: 'post4',
        postId: 'post4',
        message: 'Sam Jones liked your post.',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), 
        readAt: null,
        read: false, 
        sourceActivityId: 'act2',
        dedupeId: 'alex_doe_like_sam_jones_post4'
    },
    { 
        id: 'notif3', 
        uid: 'alex_doe',
        type: 'like', 
        priority: 'medium',
        actor: { uid: 'alex_doe', name: 'Alex Doe' },
        target: { entity_type: 'post', entity_id: 'post37' },
        actorId: 'alex_doe', 
        actorType: 'user',
        entityType: 'post',
        entityId: 'post37',
        postId: 'post37',
        message: 'You liked your post.',
        createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), 
        readAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
        read: true, 
        sourceActivityId: 'act3',
        dedupeId: 'alex_doe_like_alex_doe_post37'
    },
    { 
        id: 'notif4', 
        uid: 'alex_doe',
        type: 'comment', 
        priority: 'medium',
        actor: { uid: 'maria_garcia', name: 'Maria Garcia' },
        target: { entity_type: 'post', entity_id: 'post23' },
        actorId: 'maria_garcia', 
        actorType: 'user',
        entityType: 'post',
        entityId: 'post23',
        postId: 'post23',
        message: 'Maria Garcia commented on your post.',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), 
        readAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        read: true, 
        sourceActivityId: 'act4',
        dedupeId: 'alex_doe_comment_maria_garcia_post23'
    },
];


export const mockAdminFeedback: AdminFeedback[] = [
    { id: 'fb1', userHandle: '@janesmith', type: 'Suggestion', text: 'It would be great to have a dedicated section for poetry.', status: 'new', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'fb2', userHandle: '@samjones', type: 'Bug', text: 'The "add to shelf" button sometimes doesn\'t work on the book details page.', status: 'in_progress', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'fb3', userHandle: '@mariagarcia', type: 'Complaint', text: 'Another user was rude in the comments of my post.', status: 'resolved', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
];

// --- AGGREGATED MOCK DATABASE ---
// This object mimics the structure of a Firestore database for the mock db service.

const allShelves = [
    ...mockShelves,
    ...mockSamJonesShelves,
    ...mockJaneSmithShelves,
    ...mockMariaGarciaShelves,
];

// Structural Rule: All mock users get access to the global mockUserQuotes pool
// to ensure lookups succeed regardless of referenced ownerUid in posts or bookmarks.
const quotesMap = mockUserQuotes.reduce((acc, q) => {
    acc[q.id] = q;
    return acc;
}, {} as Record<string, any>);

const usersById = mockUsers.reduce((acc, user) => {
    const userShelves = allShelves.filter(shelf => shelf.ownerId === user.uid);
    acc[user.uid] = {
        ...user,
        // Nest subcollections under each user
        shelves: userShelves.reduce((shelfAcc, shelf) => {
            shelfAcc[shelf.id] = shelf;
            return shelfAcc;
        }, {} as Record<string, any>),
        projects: (user.uid === 'alex_doe' ? mockProjects : []).reduce((projAcc, proj) => {
            projAcc[proj.id] = proj;
            return projAcc;
        }, {} as Record<string, any>),
        // Fix: Assign the global quotes pool to all users for demo consistency
        quotes: quotesMap,
        bookmarks: (user.uid === 'alex_doe' ? mockBookmarks : []).reduce((bmAcc, bm) => {
            bmAcc[bm.id] = bm;
            return bmAcc;
        }, {} as Record<string, any>),
        likes: {}, // Initial empty engagement collection
        reposts: {},
        agent_sessions: { // Placeholder for chat history
            'session_librarian_123': { 
                id: 'session_librarian_123',
                agentId: 'librarian',
                title: 'Book Recommendations',
                lastMessage: 'Here are some books you might like...',
                timestamp: new Date().toISOString(),
                isPinned: true, // Mock pinned session
                messages: {} 
            },
            'session_mentor_123': {
                id: 'session_mentor_123',
                agentId: 'mentor',
                title: 'Writing Feedback',
                lastMessage: 'Try making the dialogue snappier.',
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                messages: {} 
            },
            'session_quotes_123': { 
                 id: 'session_quotes_123',
                 agentId: 'quotes',
                 title: 'Quotes about Hope',
                 lastMessage: 'Here is a quote by Emily Dickinson...',
                 timestamp: new Date(Date.now() - 172800000).toISOString(),
                 messages: {} 
            },
        }
    };
    return acc;
}, {} as Record<string, any>);

const allReviews = [...mockReviews, ...mockBookDetailsReviews];
const reviewsByBookId = allReviews.reduce((acc, review) => {
    if (!acc[review.bookId]) {
        acc[review.bookId] = {};
    }
    acc[review.bookId][review.id] = review;
    return acc;
}, {} as Record<string, any>);


export const MOCK_DATA = {
  users: usersById,
  catalog: {
      books: mockBooks
  },
  authors: mockAuthors,
  posts: mockSocialFeedPosts.reduce((acc, post) => {
      acc[post.id] = post;
      return acc;
  }, {} as Record<string, any>),
  reviews: reviewsByBookId,
  venues: mockVenuesAndEvents.reduce((acc, venue) => {
      acc[venue.id] = venue;
      return acc;
  }, {} as Record<string, any>),
  venueReviews: {
      'venue_the_gilded_page': mockVenueReviews.reduce((acc, review) => {
          acc[review.id] = review;
          return acc;
      }, {} as Record<string, any>)
  },
  notifications: {
      'alex_doe': mockNotifications.reduce((acc, notif) => {
          acc[notif.id] = notif;
          return acc;
      }, {} as Record<string, any>)
  },
  conversations: mockConversations.reduce((acc, convo) => {
      acc[convo.id] = convo;
      return acc;
  }, {} as Record<string, any>),
  messages: mockMessages,
  feedback: mockAdminFeedback.reduce((acc, fb) => {
      acc[fb.id] = fb;
      return acc;
  }, {} as Record<string, any>),
};
