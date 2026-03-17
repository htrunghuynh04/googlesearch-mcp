/**
 * Interface for listing wikis in a project
 */
export interface ListWikisParams {
  projectId?: string;
}

/**
 * Interface for getting a specific wiki
 */
export interface GetWikiParams {
  wikiIdentifier: string;
  projectId?: string;
}

/**
 * Interface for getting a wiki page by path
 */
export interface GetWikiPageParams {
  wikiIdentifier: string;
  path?: string;
  recursionLevel?: 'none' | 'oneLevel' | 'oneLevelPlusNestedEmptyFolders' | 'full';
  includeContent?: boolean;
  version?: string;
  versionType?: 'branch' | 'tag' | 'commit';
  projectId?: string;
}

/**
 * Interface for getting a wiki page by ID
 */
export interface GetWikiPageByIdParams {
  wikiIdentifier: string;
  pageId: number;
  recursionLevel?: 'none' | 'oneLevel' | 'oneLevelPlusNestedEmptyFolders' | 'full';
  includeContent?: boolean;
  projectId?: string;
}

/**
 * Interface for getting a pageable list of wiki pages
 */
export interface GetWikiPagesParams {
  wikiIdentifier: string;
  pageViewsForDays?: number;
  continuationToken?: string;
  top?: number;
  projectId?: string;
}

/**
 * Interface for getting wiki page details and stats
 */
export interface GetWikiPageDetailsParams {
  wikiIdentifier: string;
  pageId: number;
  pageViewsForDays?: number;
  projectId?: string;
}
