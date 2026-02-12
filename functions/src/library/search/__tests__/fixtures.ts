type GoogleItem = {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publishedDate?: string;
    language?: string;
    description?: string;
    pageCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string };
  };
  saleInfo?: { isEbook?: boolean };
  accessInfo?: {
    epub?: { isAvailable?: boolean };
    pdf?: { isAvailable?: boolean };
  };
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  language?: string[];
  cover_i?: number;
  ebook_count_i?: number;
  isbn?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
};

export type ProviderFixtures = {
  google: { items: GoogleItem[] };
  openLibrary: { docs: OpenLibraryDoc[] };
};

const googleItem = (
  id: string,
  title: string,
  authors: string[],
  publishedDate: string,
  description: string = 'Description',
  options: {
    isEbook?: boolean;
    epubAvailable?: boolean;
    pdfAvailable?: boolean;
  } = {}
): GoogleItem => {
  const { isEbook = true, epubAvailable, pdfAvailable } = options;
  const accessInfo =
    epubAvailable !== undefined || pdfAvailable !== undefined
      ? {
          epub:
            epubAvailable !== undefined
              ? { isAvailable: epubAvailable }
              : undefined,
          pdf:
            pdfAvailable !== undefined
              ? { isAvailable: pdfAvailable }
              : undefined,
        }
      : undefined;

  return {
    id,
    volumeInfo: {
      title,
      authors,
      publishedDate,
      language: 'en',
      description,
      industryIdentifiers: [{ type: 'ISBN_13', identifier: `978000${id}` }],
      imageLinks: { thumbnail: 'https://example.com/cover.jpg' }
    },
    saleInfo: { isEbook },
    accessInfo,
  };
};

const openDoc = (
  key: string,
  title: string,
  author: string,
  year: number,
  ebookCount: number = 1
): OpenLibraryDoc => ({
  key,
  title,
  author_name: [author],
  language: ['en'],
  cover_i: 123,
  ebook_count_i: ebookCount,
  isbn: [`978000${key.replace(/\D/g, '').slice(0, 6) || '123456'}`],
  first_publish_year: year,
  number_of_pages_median: 300
});

export function getProviderFixtures(query: string): ProviderFixtures {
  const normalized = query.trim().toLowerCase();

  switch (normalized) {
    case 'harry':
      return {
        google: {
          items: [
            googleItem('gb1', "Harry Potter and the Philosopher's Stone", ['J. K. Rowling'], '1997'),
            googleItem('gb2', "Harry Potter and the Chamber of Secrets", ['J. K. Rowling'], '1998'),
            googleItem('gb3', 'Harry Potter and the Prisoner of Azkaban', ['J. K. Rowling'], '1999'),
            googleItem('gb4', 'A Companion to Harry Potter', ['John Scholar'], '2001'),
            googleItem('gb5', 'Harry Potter: Critical Essays', ['Jane Critic'], '2005'),
            googleItem('gb6', 'Estate of Harry v. Something', ['Court Reporter'], '2020')
          ]
        },
        openLibrary: {
          docs: [
            openDoc('ol1', 'Harry S. Truman and the United Nations Conference of 1945', 'Historian', 1946),
            openDoc('ol2', 'In re Harry Estate', 'Legal Reporter', 2021)
          ]
        }
      };

    case 'rowling':
      return {
        google: {
          items: [
            googleItem('gb7', 'Harry Potter and the Goblet of Fire', ['J. K. Rowling'], '2000'),
            googleItem('gb8', 'Harry Potter and the Order of the Phoenix', ['J. K. Rowling'], '2003'),
            googleItem('gb9', 'J. K. Rowling: A Biography', ['Biographer'], '2006'),
            googleItem('gb10', 'Rowling and the Modern Novel', ['Scholar'], '2010'),
            googleItem('gb11', 'Estate of Rowling v. Estate', ['Court Reporter'], '2022')
          ]
        },
        openLibrary: {
          docs: [
            openDoc('ol3', 'Rowling: Critical Studies', 'Critic', 2012)
          ]
        }
      };

    case 'hesse':
      return {
        google: {
          items: [
            googleItem('gb12', 'Steppenwolf', ['Hermann Hesse'], '1927'),
            googleItem('gb13', 'Siddhartha', ['Hermann Hesse'], '1922'),
            googleItem('gb14', 'Hermann Hesse: A Biography', ['Biographer'], '1970')
          ]
        },
        openLibrary: {
          docs: [
            openDoc('ol4', 'Hesse: Critical Studies', 'Critic', 1980)
          ]
        }
      };

    case 'wolf':
      return {
        google: {
          items: [
            googleItem('gb15', 'Wolf Hall', ['Hilary Mantel'], '2009'),
            googleItem('gb16', 'The Wolf', ['Leo Carew'], '2011'),
            googleItem('gb17', 'The Wolf: A Biography', ['Biographer'], '2015')
          ]
        },
        openLibrary: {
          docs: [
            openDoc('ol5', 'Wolf Conference Proceedings', 'Researcher', 2018)
          ]
        }
      };

    case 'financial':
      return {
        google: {
          items: [
            googleItem('gb18', 'Financial Accounting', ['Smith'], '2015'),
            googleItem('gb19', 'Financial Markets and Institutions', ['Jones'], '2018'),
            googleItem('gb20', 'Financial Management', ['Lee'], '2017'),
            googleItem('gb21', 'Financial Strategy', ['Patel'], '2016'),
            googleItem('gb22', 'Financial Systems', ['Garcia'], '2014'),
            googleItem('gb23', 'Financial Analysis', ['Analyst'], '2019'),
            googleItem('gb24', 'Financial Report 2022', ['Gov Agency'], '2022'),
            googleItem('gb25', 'In re Financial Estate', ['Court Reporter'], '2021')
          ]
        },
        openLibrary: {
          docs: []
        }
      };

    case 'ebook filter':
      return {
        google: {
          items: [
            googleItem('gb26', 'Ebook Filter Primary Novel', ['Test Author'], '2020', 'Description', {
              isEbook: true
            }),
            googleItem('gb27', 'Ebook Filter Print Edition', ['Test Author'], '2018', 'Description', {
              isEbook: false
            }),
            googleItem('gb28', 'Ebook Filter EPUB Access', ['Test Author'], '2019', 'Description', {
              isEbook: false,
              epubAvailable: true
            })
          ]
        },
        openLibrary: {
          docs: [
            openDoc('ol6', 'Ebook Filter Library Digital', 'Test Author', 2021, 2),
            openDoc('ol7', 'Ebook Filter Library Print', 'Test Author', 2017, 0)
          ]
        }
      };

    default:
      return {
        google: { items: [] },
        openLibrary: { docs: [] }
      };
  }
}
