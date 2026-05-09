export type TabName = 'home' | 'read' | 'discover' | 'write' | 'social';
export type StackScreenName = 'discovery' | 'semanticCollection';
export type ImmersiveScreenName = 'bookDetails' | 'editor' | 'agentChat' | 'reader' | 'publicationReader' | 'liveSearch' | 'postComposer' | 'profile' | 'authorDetails' | 'quoteDetails' | 'venueDetails' | 'discoveryFlow' | 'messengerList' | 'messengerChat' | 'notificationsFeed' | 'postDetails' | 'postDiscussion' | 'peopleFlow' | 'shelfDetails' | 'goodreadsImport' | 'drafts' | 'projectEdit' | 'projectPublish' | 'projectPreview' | 'projectPublished' | 'postTextOverlay' | 'bookmarks' | 'quotes' | 'authors' | 'venues' | 'settings' | 'feedback' | 'adminDashboard' | 'adminIntelligence' | 'books' | 'email';

// A flexible params type for navigation
export interface NavigationParams {
    [key: string]: any;
    from?: View; // Can store the previous view for back navigation
}

export type View =
  | { type: 'tab'; id: TabName; params?: NavigationParams }
  | { type: 'immersive'; id: ImmersiveScreenName; params?: NavigationParams }
  | { type: 'stack'; id: StackScreenName; params?: NavigationParams };
