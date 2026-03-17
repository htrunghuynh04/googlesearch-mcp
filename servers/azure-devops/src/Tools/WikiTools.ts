import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { WikiService } from '../Services/WikiService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  ListWikisParams,
  GetWikiParams,
  GetWikiPageParams,
  GetWikiPageByIdParams,
  GetWikiPagesParams,
  GetWikiPageDetailsParams
} from '../Interfaces/Wiki';
import getClassMethods from '../utils/getClassMethods';

export class WikiTools {
  private wikiService: WikiService;

  constructor(config: AzureDevOpsConfig) {
    this.wikiService = new WikiService(config);
  }

  /**
   * List all wikis in a project
   */
  public async listWikis(params: ListWikisParams): Promise<McpResponse> {
    try {
      const wikis = await this.wikiService.listWikis(params);
      return formatMcpResponse(wikis, `Found ${wikis.length} wiki(s)`);
    } catch (error) {
      console.error('Error in listWikis tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get a specific wiki by identifier
   */
  public async getWiki(params: GetWikiParams): Promise<McpResponse> {
    try {
      const wiki = await this.wikiService.getWiki(params);
      return formatMcpResponse(wiki, `Wiki details for ${wiki.name || params.wikiIdentifier}`);
    } catch (error) {
      console.error('Error in getWiki tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get a wiki page by path
   */
  public async getWikiPage(params: GetWikiPageParams): Promise<McpResponse> {
    try {
      const page = await this.wikiService.getWikiPage(params);
      return formatMcpResponse(page, `Wiki page at path: ${params.path || '/'}`);
    } catch (error) {
      console.error('Error in getWikiPage tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get a wiki page by ID
   */
  public async getWikiPageById(params: GetWikiPageByIdParams): Promise<McpResponse> {
    try {
      const page = await this.wikiService.getWikiPageById(params);
      return formatMcpResponse(page, `Wiki page with ID: ${params.pageId}`);
    } catch (error) {
      console.error('Error in getWikiPageById tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get a pageable list of wiki pages
   */
  public async getWikiPages(params: GetWikiPagesParams): Promise<McpResponse> {
    try {
      const pages = await this.wikiService.getWikiPages(params);
      const count = Array.isArray(pages) ? pages.length : 'batch of';
      return formatMcpResponse(pages, `Retrieved ${count} wiki page(s)`);
    } catch (error) {
      console.error('Error in getWikiPages tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get wiki page details including metadata and stats
   */
  public async getWikiPageDetails(params: GetWikiPageDetailsParams): Promise<McpResponse> {
    try {
      const details = await this.wikiService.getWikiPageDetails(params);
      return formatMcpResponse(details, `Wiki page details for page ID: ${params.pageId}`);
    } catch (error) {
      console.error('Error in getWikiPageDetails tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const WikiToolMethods = getClassMethods(WikiTools.prototype);
