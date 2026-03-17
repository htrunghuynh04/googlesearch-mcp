import { WikiApi } from 'azure-devops-node-api/WikiApi';
import { VersionControlRecursionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService } from './AzureDevOpsService';
import {
  ListWikisParams,
  GetWikiParams,
  GetWikiPageParams,
  GetWikiPageByIdParams,
  GetWikiPagesParams,
  GetWikiPageDetailsParams
} from '../Interfaces/Wiki';

export class WikiService extends AzureDevOpsService {
  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  /**
   * Get the Wiki API client
   */
  private async getWikiApi(): Promise<WikiApi> {
    return await this.connection.getWikiApi();
  }

  /**
   * Convert a ReadableStream to string
   */
  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
  }

  /**
   * Convert recursion level string to enum value
   */
  private getRecursionLevel(level?: string): VersionControlRecursionType | undefined {
    if (!level) return undefined;
    switch (level) {
      case 'none': return VersionControlRecursionType.None;
      case 'oneLevel': return VersionControlRecursionType.OneLevel;
      case 'oneLevelPlusNestedEmptyFolders': return VersionControlRecursionType.OneLevelPlusNestedEmptyFolders;
      case 'full': return VersionControlRecursionType.Full;
      default: return undefined;
    }
  }

  /**
   * Convert version type string to enum value
   */
  private getVersionType(type?: string): GitVersionType | undefined {
    if (!type) return undefined;
    switch (type) {
      case 'branch': return GitVersionType.Branch;
      case 'tag': return GitVersionType.Tag;
      case 'commit': return GitVersionType.Commit;
      default: return undefined;
    }
  }

  /**
   * List all wikis in a project
   */
  public async listWikis(params: ListWikisParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const wikis = await wikiApi.getAllWikis(params.projectId || this.config.project);
      return wikis;
    } catch (error) {
      console.error('Error listing wikis:', error);
      throw error;
    }
  }

  /**
   * Get a specific wiki by identifier
   */
  public async getWiki(params: GetWikiParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const wiki = await wikiApi.getWiki(
        params.wikiIdentifier,
        params.projectId || this.config.project
      );
      return wiki;
    } catch (error) {
      console.error(`Error getting wiki ${params.wikiIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Get a wiki page by path
   */
  public async getWikiPage(params: GetWikiPageParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const projectId = params.projectId || this.config.project;
      const includeContent = params.includeContent !== false; // Default to true

      // Get page with content as text
      const versionDescriptor = params.version ? {
        version: params.version,
        versionType: this.getVersionType(params.versionType)
      } : undefined;

      const contentStream = await wikiApi.getPageText(
        projectId,
        params.wikiIdentifier,
        params.path,
        this.getRecursionLevel(params.recursionLevel),
        versionDescriptor,
        includeContent
      );

      const content = await this.streamToString(contentStream);

      return {
        path: params.path,
        content: includeContent ? content : undefined,
        rawResponse: content
      };
    } catch (error) {
      console.error(`Error getting wiki page at path ${params.path}:`, error);
      throw error;
    }
  }

  /**
   * Get a wiki page by ID
   */
  public async getWikiPageById(params: GetWikiPageByIdParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const projectId = params.projectId || this.config.project;
      const includeContent = params.includeContent !== false; // Default to true

      // Get page content as text by ID
      const contentStream = await wikiApi.getPageByIdText(
        projectId,
        params.wikiIdentifier,
        params.pageId,
        this.getRecursionLevel(params.recursionLevel),
        includeContent
      );

      const content = await this.streamToString(contentStream);

      return {
        id: params.pageId,
        content: includeContent ? content : undefined,
        rawResponse: content
      };
    } catch (error) {
      console.error(`Error getting wiki page by ID ${params.pageId}:`, error);
      throw error;
    }
  }

  /**
   * Get a pageable list of wiki pages
   */
  public async getWikiPages(params: GetWikiPagesParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const projectId = params.projectId || this.config.project;

      const pages = await wikiApi.getPagesBatch(
        {
          pageViewsForDays: params.pageViewsForDays,
          continuationToken: params.continuationToken,
          top: params.top
        },
        projectId,
        params.wikiIdentifier
      );

      return pages;
    } catch (error) {
      console.error(`Error getting wiki pages for ${params.wikiIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Get wiki page details including view stats
   */
  public async getWikiPageDetails(params: GetWikiPageDetailsParams): Promise<any> {
    try {
      const wikiApi = await this.getWikiApi();
      const projectId = params.projectId || this.config.project;

      // Get page details with metadata and view stats
      const pageDetail = await wikiApi.getPageData(
        projectId,
        params.wikiIdentifier,
        params.pageId,
        params.pageViewsForDays
      );

      return pageDetail;
    } catch (error) {
      console.error(`Error getting wiki page details for page ${params.pageId}:`, error);
      throw error;
    }
  }
}
