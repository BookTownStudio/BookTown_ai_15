export const TAB_NAMES = ['home', 'read', 'discover', 'write', 'social'] as const;
export type TabName = typeof TAB_NAMES[number];

export const STACK_SCREEN_NAMES = ['discovery', 'semanticCollection'] as const;
export type StackScreenName = typeof STACK_SCREEN_NAMES[number];

export const IMMERSIVE_SCREEN_NAMES = [
  'bookDetails',
  'editor',
  'agentChat',
  'reader',
  'publicationReader',
  'postComposer',
  'profile',
  'authorDetails',
  'quoteDetails',
  'venueDetails',
  'discoveryFlow',
  'messengerList',
  'messengerChat',
  'notificationsFeed',
  'postDiscussion',
  'shelfDetails',
  'goodreadsImport',
  'drafts',
  'projectEdit',
  'projectPublish',
  'projectPreview',
  'projectPublished',
  'postTextOverlay',
  'bookmarks',
  'quotes',
  'authors',
  'venues',
  'settings',
  'feedback',
  'adminDashboard',
  'adminIntelligence',
  'books',
  'email',
] as const;
export type ImmersiveScreenName = typeof IMMERSIVE_SCREEN_NAMES[number];

export const PUBLIC_BETA_IMMERSIVE_SCREEN_NAMES = [
  'bookDetails',
  'reader',
  'profile',
  'notificationsFeed',
  'messengerList',
  'messengerChat',
  'postDiscussion',
  'postComposer',
  'editor',
] as const satisfies readonly ImmersiveScreenName[];

export const INTERNAL_BETA_IMMERSIVE_SCREEN_NAMES = [
  'bookmarks',
  'authors',
  'quotes',
  'venues',
  'settings',
  'feedback',
  'drafts',
  'goodreadsImport',
  'shelfDetails',
  'projectEdit',
  'projectPublish',
  'projectPreview',
  'projectPublished',
  'publicationReader',
  'authorDetails',
  'quoteDetails',
  'venueDetails',
  'books',
  'email',
] as const satisfies readonly ImmersiveScreenName[];

export const RETAINED_NON_BETA_IMMERSIVE_SCREEN_NAMES = [
  'agentChat',
  'discoveryFlow',
  'postTextOverlay',
  'adminDashboard',
  'adminIntelligence',
] as const satisfies readonly ImmersiveScreenName[];

export const isTabName = (value: unknown): value is TabName =>
  typeof value === 'string' && (TAB_NAMES as readonly string[]).includes(value);

export const isStackScreenName = (value: unknown): value is StackScreenName =>
  typeof value === 'string' && (STACK_SCREEN_NAMES as readonly string[]).includes(value);

export const isImmersiveScreenName = (value: unknown): value is ImmersiveScreenName =>
  typeof value === 'string' && (IMMERSIVE_SCREEN_NAMES as readonly string[]).includes(value);

// A flexible params type for navigation
export interface NavigationParams {
    [key: string]: any;
    from?: View; // Can store the previous view for back navigation
}

export type View =
  | { type: 'tab'; id: TabName; params?: NavigationParams }
  | { type: 'immersive'; id: ImmersiveScreenName; params?: NavigationParams }
  | { type: 'stack'; id: StackScreenName; params?: NavigationParams };
