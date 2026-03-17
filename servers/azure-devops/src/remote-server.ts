#!/usr/bin/env node

/**
 * Azure DevOps MCP Remote Server with Express.js Pipeline
 *
 * This server provides a flexible, pipeline-based architecture for Azure DevOps MCP integration.
 * The Express.js middleware pipeline allows for easy configuration and extension of functionality.
 *
 * Pipeline Architecture:
 * 1. CORS Support - Allow cross-origin requests
 * 2. Logging Middleware - Request/response logging
 * 3. Rate Limiting - Prevent abuse (configurable)
 * 4. Body Parsing - JSON/URL-encoded body parsing
 * 5. Authentication - API key validation
 * 6. Configuration Parsing - Extract Azure DevOps config from headers
 * 7. Route Handlers - Health, config, and MCP endpoints
 *
 * To extend the pipeline, add custom middleware functions using app.use() before route definitions.
 *
 * Example custom middleware:
 * ```typescript
 * app.use((req, res, next) => {
 *   // Custom logic here
 *   next();
 * });
 * ```
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { WorkItemTools } from './Tools/WorkItemTools';
import { BoardsSprintsTools } from './Tools/BoardsSprintsTools';
import { ProjectTools } from './Tools/ProjectTools';
import { GitTools } from './Tools/GitTools';
import { TestingCapabilitiesTools } from './Tools/TestingCapabilitiesTools';
import { DevSecOpsTools } from './Tools/DevSecOpsTools';
import { ArtifactManagementTools } from './Tools/ArtifactManagementTools';
import { AIAssistedDevelopmentTools } from './Tools/AIAssistedDevelopmentTools';
import { WikiTools } from './Tools/WikiTools';
import { EntraAuthHandler } from './Services/EntraAuthHandler';
import { AzureDevOpsConfig } from './Interfaces/AzureDevOps';
import { randomUUID } from 'node:crypto';

/**
 * Try to load environment variables from .env file with multiple possible locations
 */
function loadEnvFile() {
  // First try the current directory
  if (fs.existsSync('.env')) {
    dotenv.config();
    return;
  }

  // Try the directory of the running script
  const scriptDir = __dirname;
  const envPath = path.join(scriptDir, '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    return;
  }

  // If we still haven't loaded env vars, try a few other common locations
  const possiblePaths = [
    // One level above the dist directory
    path.join(process.cwd(), '.env'),
    // User's home directory
    path.join(process.env.HOME || '', '.azuredevops.env'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }

  // No .env file found, continue with environment variables
}

/**
 * Parse configuration from HTTP headers
 */
function parseConfigFromHeaders(headers: http.IncomingHttpHeaders): {
  config: AzureDevOpsConfig;
  allowedTools: Set<string>;
} {
  // Helper function to get single header value
  const getHeader = (key: string): string | undefined => {
    const value = headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  // Required headers
  const orgUrl = getHeader('x-azure-devops-org-url');
  const project = getHeader('x-azure-devops-project');
  const personalAccessToken = getHeader('x-azure-devops-pat') || '';

  if (!orgUrl || !project) {
    throw new Error('Missing required headers: x-azure-devops-org-url and x-azure-devops-project are required');
  }

  // Optional headers
  const isOnPremises = getHeader('x-azure-devops-is-on-premises') === 'true';
  const collection = getHeader('x-azure-devops-collection');
  const apiVersion = getHeader('x-azure-devops-api-version');
  const authType = getHeader('x-azure-devops-auth-type') || 'pat';
  const acceptHeader = getHeader('accept') || 'text/event-stream';

  // Parse allowed tools
  const allowedToolsStr = getHeader('x-azure-devops-allowed-tools');
  const allowedTools = allowedToolsStr ? new Set(allowedToolsStr.split(',').map((t) => t.trim())) : new Set<string>(); // Empty set means all tools allowed

  // Build auth config based on auth type
  let auth: AzureDevOpsConfig['auth'];

  if (authType === 'entra') {
    if (isOnPremises) {
      throw new Error('Entra authentication is not supported for on-premises Azure DevOps');
    }
    auth = { type: 'entra' };
  } else if (authType === 'ntlm') {
    const username = getHeader('x-azure-devops-username');
    const password = getHeader('x-azure-devops-password');
    const domain = getHeader('x-azure-devops-domain');

    if (!username || !password) {
      throw new Error('NTLM authentication requires x-azure-devops-username and x-azure-devops-password headers');
    }

    auth = { type: 'ntlm', username, password, domain };
  } else if (authType === 'basic') {
    const username = getHeader('x-azure-devops-username');
    const password = getHeader('x-azure-devops-password');

    if (!username || !password) {
      throw new Error('Basic authentication requires x-azure-devops-username and x-azure-devops-password headers');
    }

    auth = { type: 'basic', username, password };
  } else {
    // pat
    if (!personalAccessToken) {
      throw new Error('PAT authentication requires x-azure-devops-pat header');
    }
    auth = { type: 'pat' };
  }

  const config: AzureDevOpsConfig = {
    orgUrl,
    project,
    personalAccessToken,
    isOnPremises,
    collection,
    apiVersion,
    acceptHeader,
    auth,
  };

  return { config, allowedTools };
}

/**
 * Create a new MCP server instance with the given configuration
 */
async function createServerInstance(config: AzureDevOpsConfig, allowedTools: Set<string>): Promise<McpServer> {
  // Initialize Entra auth if needed
  if (config.auth?.type === 'entra') {
    config.entraAuthHandler = await EntraAuthHandler.getInstance();
  }

  // Initialize tools
  const workItemTools = new WorkItemTools(config);
  const boardsSprintsTools = new BoardsSprintsTools(config);
  const projectTools = new ProjectTools(config);
  const gitTools = new GitTools(config);
  const testingCapabilitiesTools = new TestingCapabilitiesTools(config);
  const devSecOpsTools = new DevSecOpsTools(config);
  const artifactManagementTools = new ArtifactManagementTools(config);
  const aiAssistedDevelopmentTools = new AIAssistedDevelopmentTools(config);
  const wikiTools = new WikiTools(config);

  // Create MCP server
  const server = new McpServer({
    name: 'azure-devops-mcp',
    version: '1.0.0',
    description: 'MCP server for Azure DevOps integration',
  });

  // Helper function to check if tool is allowed
  const isToolAllowed = (toolName: string) => allowedTools.size === 0 || allowedTools.has(toolName);

  // Register Work Item Tools
  if (isToolAllowed('listWorkItems')) {
    server.tool(
      'listWorkItems',
      'List work items based on a WIQL query',
      {
        query: z.string().describe('WIQL query to get work items'),
      },
      async (params) => {
        const result = await workItemTools.listWorkItems({ query: params.query });
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWorkItemById')) {
    server.tool(
      'getWorkItemById',
      'Get a specific work item by ID',
      {
        id: z.number().describe('Work item ID'),
      },
      async (params) => {
        const result = await workItemTools.getWorkItemById({ id: params.id });
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('searchWorkItems')) {
    server.tool(
      'searchWorkItems',
      'Search for work items by text',
      {
        searchText: z.string().describe('Text to search for in work items'),
        top: z.number().optional().describe('Maximum number of work items to return'),
      },
      async (params) => {
        const result = await workItemTools.searchWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getRecentlyUpdatedWorkItems')) {
    server.tool(
      'getRecentlyUpdatedWorkItems',
      'Get recently updated work items',
      {
        top: z.number().optional().describe('Maximum number of work items to return'),
        skip: z.number().optional().describe('Number of work items to skip'),
      },
      async (params) => {
        const result = await workItemTools.getRecentlyUpdatedWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getMyWorkItems')) {
    server.tool(
      'getMyWorkItems',
      'Get work items assigned to you',
      {
        state: z.string().optional().describe('Filter by work item state'),
        top: z.number().optional().describe('Maximum number of work items to return'),
      },
      async (params) => {
        const result = await workItemTools.getMyWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createWorkItem')) {
    server.tool(
      'createWorkItem',
      'Create a new work item',
      {
        workItemType: z.string().describe('Type of work item to create'),
        title: z.string().describe('Title of the work item'),
        description: z.string().optional().describe('Description of the work item'),
        assignedTo: z.string().optional().describe('User to assign the work item to'),
        state: z.string().optional().describe('Initial state of the work item'),
        areaPath: z.string().optional().describe('Area path for the work item'),
        iterationPath: z.string().optional().describe('Iteration path for the work item'),
        additionalFields: z.record(z.any()).optional().describe('Additional fields to set on the work item'),
      },
      async (params) => {
        const result = await workItemTools.createWorkItem(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('updateWorkItem')) {
    server.tool(
      'updateWorkItem',
      'Update an existing work item',
      {
        id: z.number().describe('ID of the work item to update'),
        fields: z.record(z.any()).describe('Fields to update on the work item'),
      },
      async (params) => {
        const result = await workItemTools.updateWorkItem(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('addWorkItemComment')) {
    server.tool(
      'addWorkItemComment',
      'Add a comment to a work item',
      {
        id: z.number().describe('ID of the work item'),
        text: z.string().describe('Comment text'),
      },
      async (params) => {
        const result = await workItemTools.addWorkItemComment(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('updateWorkItemState')) {
    server.tool(
      'updateWorkItemState',
      'Update the state of a work item',
      {
        id: z.number().describe('ID of the work item'),
        state: z.string().describe('New state for the work item'),
        comment: z.string().optional().describe('Comment explaining the state change'),
      },
      async (params) => {
        const result = await workItemTools.updateWorkItemState(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('assignWorkItem')) {
    server.tool(
      'assignWorkItem',
      'Assign a work item to a user',
      {
        id: z.number().describe('ID of the work item'),
        assignedTo: z.string().describe('User to assign the work item to'),
      },
      async (params) => {
        const result = await workItemTools.assignWorkItem(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createLink')) {
    server.tool(
      'createLink',
      'Create a link between work items',
      {
        sourceId: z.number().describe('ID of the source work item'),
        targetId: z.number().describe('ID of the target work item'),
        linkType: z.string().describe('Type of link to create'),
        comment: z.string().optional().describe('Comment explaining the link'),
      },
      async (params) => {
        const result = await workItemTools.createLink(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('bulkCreateWorkItems')) {
    server.tool(
      'bulkCreateWorkItems',
      'Create or update multiple work items in a single operation',
      {
        workItems: z
          .array(
            z.union([
              z.object({
                workItemType: z.string().describe('Type of work item to create'),
                title: z.string().describe('Title of the work item'),
                description: z.string().optional().describe('Description of the work item'),
                assignedTo: z.string().optional().describe('User to assign the work item to'),
                state: z.string().optional().describe('Initial state of the work item'),
                areaPath: z.string().optional().describe('Area path for the work item'),
                iterationPath: z.string().optional().describe('Iteration path for the work item'),
                additionalFields: z.record(z.any()).optional().describe('Additional fields to set on the work item'),
              }),
              z.object({
                id: z.number().describe('ID of work item to update'),
                fields: z.record(z.any()).describe('Fields to update on the work item'),
              }),
            ])
          )
          .min(1)
          .describe('Array of work items to create or update'),
      },
      async (params) => {
        const result = await workItemTools.bulkCreateWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register Boards & Sprints Tools
  if (isToolAllowed('getBoards')) {
    server.tool(
      'getBoards',
      'Get all boards for a team',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getBoards(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getBoardColumns')) {
    server.tool(
      'getBoardColumns',
      'Get columns for a specific board',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
        boardId: z.string().describe('ID of the board'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getBoardColumns(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getBoardItems')) {
    server.tool(
      'getBoardItems',
      'Get items on a specific board',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
        boardId: z.string().describe('ID of the board'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getBoardItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('moveCardOnBoard')) {
    server.tool(
      'moveCardOnBoard',
      'Move a card on a board',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
        boardId: z.string().describe('ID of the board'),
        workItemId: z.number().describe('ID of the work item to move'),
        columnId: z.string().describe('ID of the column to move to'),
        position: z.number().optional().describe('Position within the column'),
      },
      async (params) => {
        const result = await boardsSprintsTools.moveCardOnBoard(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getSprints')) {
    server.tool(
      'getSprints',
      'Get all sprints for a team',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getSprints(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getCurrentSprint')) {
    server.tool(
      'getCurrentSprint',
      'Get the current sprint',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getCurrentSprint(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getSprintWorkItems')) {
    server.tool(
      'getSprintWorkItems',
      'Get work items in a specific sprint',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
        sprintId: z.string().describe('ID of the sprint'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getSprintWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getSprintCapacity')) {
    server.tool(
      'getSprintCapacity',
      'Get capacity for a specific sprint',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
        sprintId: z.string().describe('ID of the sprint'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getSprintCapacity(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getTeamMembers')) {
    server.tool(
      'getTeamMembers',
      'Get members of a team',
      {
        teamId: z.string().optional().describe('Team ID (uses default team if not specified)'),
      },
      async (params) => {
        const result = await boardsSprintsTools.getTeamMembers(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register Project Tools
  if (isToolAllowed('listProjects')) {
    server.tool(
      'listProjects',
      'List all projects',
      {
        stateFilter: z.enum(['all', 'createPending', 'deleted', 'deleting', 'new', 'unchanged', 'wellFormed']).optional().describe('Filter by project state'),
        top: z.number().optional().describe('Maximum number of projects to return'),
        skip: z.number().optional().describe('Number of projects to skip'),
      },
      async (params) => {
        const result = await projectTools.listProjects(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getProjectDetails')) {
    server.tool(
      'getProjectDetails',
      'Get details of a specific project',
      {
        projectId: z.string().describe('ID of the project'),
        includeCapabilities: z.boolean().optional().describe('Include project capabilities'),
        includeHistory: z.boolean().optional().describe('Include project history'),
      },
      async (params) => {
        const result = await projectTools.getProjectDetails(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createProject')) {
    server.tool(
      'createProject',
      'Create a new project',
      {
        name: z.string().describe('Name of the project'),
        description: z.string().optional().describe('Description of the project'),
        visibility: z.enum(['private', 'public']).optional().describe('Visibility of the project'),
        capabilities: z.record(z.any()).optional().describe('Project capabilities'),
        processTemplateId: z.string().optional().describe('Process template ID'),
      },
      async (params) => {
        const result = await projectTools.createProject(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getAreas')) {
    server.tool(
      'getAreas',
      'Get areas for a project',
      {
        projectId: z.string().describe('ID of the project'),
        depth: z.number().optional().describe('Maximum depth of the area hierarchy'),
      },
      async (params) => {
        const result = await projectTools.getAreas(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getIterations')) {
    server.tool(
      'getIterations',
      'Get iterations for a project',
      {
        projectId: z.string().describe('ID of the project'),
        includeDeleted: z.boolean().optional().describe('Include deleted iterations'),
      },
      async (params) => {
        const result = await projectTools.getIterations(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createArea')) {
    server.tool(
      'createArea',
      'Create a new area in a project',
      {
        projectId: z.string().describe('ID of the project'),
        name: z.string().describe('Name of the area'),
        parentPath: z.string().optional().describe('Path of the parent area'),
      },
      async (params) => {
        const result = await projectTools.createArea(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createIteration')) {
    server.tool(
      'createIteration',
      'Create a new iteration in a project',
      {
        projectId: z.string().describe('ID of the project'),
        name: z.string().describe('Name of the iteration'),
        parentPath: z.string().optional().describe('Path of the parent iteration'),
        startDate: z.string().optional().describe('Start date of the iteration'),
        finishDate: z.string().optional().describe('End date of the iteration'),
      },
      async (params) => {
        const result = await projectTools.createIteration(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getProcesses')) {
    server.tool(
      'getProcesses',
      'Get all processes',
      {
        expandIcon: z.boolean().optional().describe('Include process icons'),
      },
      async (params) => {
        const result = await projectTools.getProcesses(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWorkItemTypes')) {
    server.tool(
      'getWorkItemTypes',
      'Get work item types for a process',
      {
        processId: z.string().describe('ID of the process'),
      },
      async (params) => {
        const result = await projectTools.getWorkItemTypes(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWorkItemTypeFields')) {
    server.tool(
      'getWorkItemTypeFields',
      'Get fields for a work item type',
      {
        processId: z.string().describe('ID of the process'),
        witRefName: z.string().describe('Reference name of the work item type'),
      },
      async (params) => {
        const result = await projectTools.getWorkItemTypeFields(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register Git Tools
  if (isToolAllowed('listRepositories')) {
    server.tool(
      'listRepositories',
      'List all repositories',
      {
        projectId: z.string().optional().describe('Filter by project'),
        includeHidden: z.boolean().optional().describe('Include hidden repositories'),
        includeAllUrls: z.boolean().optional().describe('Include all URLs'),
      },
      async (params) => {
        const result = await gitTools.listRepositories(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getRepository')) {
    server.tool(
      'getRepository',
      'Get details of a specific repository',
      {
        projectId: z.string().describe('ID of the project'),
        repositoryId: z.string().describe('ID of the repository'),
      },
      async (params) => {
        const result = await gitTools.getRepository(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createRepository')) {
    server.tool(
      'createRepository',
      'Create a new repository',
      {
        name: z.string().describe('Name of the repository'),
        projectId: z.string().describe('ID of the project'),
      },
      async (params) => {
        const result = await gitTools.createRepository(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('listBranches')) {
    server.tool(
      'listBranches',
      'List branches in a repository',
      {
        repositoryId: z.string().describe('ID of the repository'),
        filter: z.string().optional().describe('Filter branches by name'),
        top: z.number().optional().describe('Maximum number of branches to return'),
      },
      async (params) => {
        const result = await gitTools.listBranches(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('searchCode')) {
    server.tool(
      'searchCode',
      'Search for code in repositories',
      {
        searchText: z.string().describe('Text to search for'),
        projectId: z.string().optional().describe('ID of the project'),
        repositoryId: z.string().optional().describe('ID of the repository'),
        fileExtension: z.string().optional().describe('File extension to filter by'),
        top: z.number().optional().describe('Maximum number of results to return'),
      },
      async (params) => {
        const result = await gitTools.searchCode(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('browseRepository')) {
    server.tool(
      'browseRepository',
      'Browse the contents of a repository',
      {
        repositoryId: z.string().describe('ID of the repository'),
        path: z.string().optional().describe('Path within the repository'),
        versionDescriptor: z
          .object({
            version: z.string().optional().describe('Version (branch, tag, or commit)'),
            versionOptions: z.string().optional().describe('Version options'),
            versionType: z.string().optional().describe('Version type'),
          })
          .optional()
          .describe('Version descriptor'),
      },
      async (params) => {
        const result = await gitTools.browseRepository(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getFileContent')) {
    server.tool(
      'getFileContent',
      'Get the content of a file',
      {
        repositoryId: z.string().describe('ID of the repository'),
        path: z.string().describe('Path to the file'),
        versionDescriptor: z
          .object({
            version: z.string().optional().describe('Version (branch, tag, or commit)'),
            versionOptions: z.string().optional().describe('Version options'),
            versionType: z.string().optional().describe('Version type'),
          })
          .optional()
          .describe('Version descriptor'),
      },
      async (params) => {
        const result = await gitTools.getFileContent(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getCommitHistory')) {
    server.tool(
      'getCommitHistory',
      'Get commit history for a repository',
      {
        repositoryId: z.string().describe('ID of the repository'),
        itemPath: z.string().optional().describe('Path to filter commits by'),
        top: z.number().optional().describe('Maximum number of commits to return'),
        skip: z.number().optional().describe('Number of commits to skip'),
      },
      async (params) => {
        const result = await gitTools.getCommitHistory(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('listPullRequests')) {
    server.tool(
      'listPullRequests',
      'List pull requests',
      {
        repositoryId: z.string().describe('ID of the repository'),
        status: z.enum(['abandoned', 'active', 'all', 'completed', 'notSet']).optional().describe('Filter by status'),
        creatorId: z.string().optional().describe('Filter by creator'),
        reviewerId: z.string().optional().describe('Filter by reviewer'),
        top: z.number().optional().describe('Maximum number of pull requests to return'),
        skip: z.number().optional().describe('Number of pull requests to skip'),
      },
      async (params) => {
        const result = await gitTools.listPullRequests(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createPullRequest')) {
    server.tool(
      'createPullRequest',
      'Create a new pull request',
      {
        repositoryId: z.string().describe('ID of the repository'),
        sourceRefName: z.string().describe('Source branch'),
        targetRefName: z.string().describe('Target branch'),
        title: z.string().describe('Title of the pull request'),
        description: z.string().optional().describe('Description of the pull request'),
        reviewers: z.array(z.string()).optional().describe('List of reviewers'),
      },
      async (params) => {
        const result = await gitTools.createPullRequest(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getPullRequest')) {
    server.tool(
      'getPullRequest',
      'Get details of a specific pull request',
      {
        repositoryId: z.string().describe('ID of the repository'),
        pullRequestId: z.number().describe('ID of the pull request'),
      },
      async (params) => {
        const result = await gitTools.getPullRequest(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getPullRequestComments')) {
    server.tool(
      'getPullRequestComments',
      'Get comments on a pull request',
      {
        repositoryId: z.string().describe('ID of the repository'),
        pullRequestId: z.number().describe('ID of the pull request'),
        threadId: z.number().optional().describe('ID of a specific thread'),
        top: z.number().optional().describe('Maximum number of comments to return'),
        skip: z.number().optional().describe('Number of comments to skip'),
      },
      async (params) => {
        const result = await gitTools.getPullRequestComments(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('approvePullRequest')) {
    server.tool(
      'approvePullRequest',
      'Approve a pull request',
      {
        repositoryId: z.string().describe('ID of the repository'),
        pullRequestId: z.number().describe('ID of the pull request'),
      },
      async (params) => {
        const result = await gitTools.approvePullRequest(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('mergePullRequest')) {
    server.tool(
      'mergePullRequest',
      'Merge a pull request',
      {
        repositoryId: z.string().describe('ID of the repository'),
        pullRequestId: z.number().describe('ID of the pull request'),
        mergeStrategy: z.enum(['noFastForward', 'rebase', 'rebaseMerge', 'squash']).optional().describe('Merge strategy'),
        comment: z.string().optional().describe('Comment for the merge commit'),
      },
      async (params) => {
        const result = await gitTools.mergePullRequest(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register Testing Capabilities Tools
  if (isToolAllowed('runAutomatedTests')) {
    server.tool(
      'runAutomatedTests',
      'Execute automated test suites',
      {
        testSuiteId: z.number().optional().describe('ID of the test suite to run'),
        testPlanId: z.number().optional().describe('ID of the test plan to run'),
        testEnvironment: z.string().optional().describe('Environment to run tests in'),
        parallelExecution: z.boolean().optional().describe('Whether to run tests in parallel'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.runAutomatedTests(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getTestAutomationStatus')) {
    server.tool(
      'getTestAutomationStatus',
      'Check status of automated test execution',
      {
        testRunId: z.number().describe('ID of the test run to check status for'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.getTestAutomationStatus(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('configureTestAgents')) {
    server.tool(
      'configureTestAgents',
      'Configure and manage test agents',
      {
        agentName: z.string().describe('Name of the test agent to configure'),
        capabilities: z.record(z.any()).optional().describe('Capabilities to set for the agent'),
        enabled: z.boolean().optional().describe('Whether the agent should be enabled'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.configureTestAgents(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createTestDataGenerator')) {
    server.tool(
      'createTestDataGenerator',
      'Generate test data for automated tests',
      {
        name: z.string().describe('Name of the test data generator'),
        dataSchema: z.record(z.any()).describe('Schema for the test data to generate'),
        recordCount: z.number().optional().describe('Number of records to generate'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.createTestDataGenerator(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('manageTestEnvironments')) {
    server.tool(
      'manageTestEnvironments',
      'Manage test environments for different test types',
      {
        environmentName: z.string().describe('Name of the test environment'),
        action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
        properties: z.record(z.any()).optional().describe('Properties for the environment'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.manageTestEnvironments(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getTestFlakiness')) {
    server.tool(
      'getTestFlakiness',
      'Analyze and report on test flakiness',
      {
        testId: z.number().optional().describe('ID of a specific test to analyze'),
        testRunIds: z.array(z.number()).optional().describe('Specific test runs to analyze'),
        timeRange: z.string().optional().describe("Time range for analysis (e.g., '30d')"),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.getTestFlakiness(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getTestGapAnalysis')) {
    server.tool(
      'getTestGapAnalysis',
      'Identify gaps in test coverage',
      {
        areaPath: z.string().optional().describe('Area path to analyze'),
        codeChangesOnly: z.boolean().optional().describe('Only analyze recent code changes'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.getTestGapAnalysis(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('runTestImpactAnalysis')) {
    server.tool(
      'runTestImpactAnalysis',
      'Determine which tests to run based on code changes',
      {
        buildId: z.number().describe('ID of the build to analyze'),
        changedFiles: z.array(z.string()).optional().describe('List of changed files'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.runTestImpactAnalysis(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getTestHealthDashboard')) {
    server.tool(
      'getTestHealthDashboard',
      'View overall test health metrics',
      {
        timeRange: z.string().optional().describe("Time range for metrics (e.g., '90d')"),
        includeTrends: z.boolean().optional().describe('Include trend data'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.getTestHealthDashboard(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('runTestOptimization')) {
    server.tool(
      'runTestOptimization',
      'Optimize test suite execution for faster feedback',
      {
        testPlanId: z.number().describe('ID of the test plan to optimize'),
        optimizationGoal: z.enum(['time', 'coverage', 'reliability']).describe('Optimization goal'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.runTestOptimization(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createExploratorySessions')) {
    server.tool(
      'createExploratorySessions',
      'Create new exploratory testing sessions',
      {
        title: z.string().describe('Title of the exploratory session'),
        description: z.string().optional().describe('Description of the session'),
        areaPath: z.string().optional().describe('Area path for the session'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.createExploratorySessions(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('recordExploratoryTestResults')) {
    server.tool(
      'recordExploratoryTestResults',
      'Record findings during exploratory testing',
      {
        sessionId: z.number().describe('ID of the exploratory session'),
        findings: z.array(z.string()).describe('List of findings to record'),
        attachments: z
          .array(
            z.object({
              name: z.string().describe('Name of the attachment'),
              content: z.string().describe('Base64 encoded content of the attachment'),
              contentType: z.string().optional().describe('MIME type of the attachment'),
            })
          )
          .optional()
          .describe('Attachments for the findings'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.recordExploratoryTestResults(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('convertFindingsToWorkItems')) {
    server.tool(
      'convertFindingsToWorkItems',
      'Convert exploratory test findings to work items',
      {
        sessionId: z.number().describe('ID of the exploratory session'),
        findingIds: z.array(z.number()).describe('IDs of findings to convert'),
        workItemType: z.string().optional().describe('Type of work item to create'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.convertFindingsToWorkItems(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getExploratoryTestStatistics')) {
    server.tool(
      'getExploratoryTestStatistics',
      'Get statistics on exploratory testing activities',
      {
        timeRange: z.string().optional().describe("Time range for statistics (e.g., '90d')"),
        userId: z.string().optional().describe('Filter by specific user'),
      },
      async (params) => {
        const result = await testingCapabilitiesTools.getExploratoryTestStatistics(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register DevSecOps Tools
  if (isToolAllowed('runSecurityScan')) {
    server.tool(
      'runSecurityScan',
      'Run security scans on repositories',
      {
        repositoryId: z.string().describe('ID of the repository to scan'),
        branch: z.string().optional().describe('Branch to scan'),
        scanType: z.enum(['static', 'dynamic', 'container', 'dependency', 'all']).optional().describe('Type of security scan to run'),
      },
      async (params) => {
        const result = await devSecOpsTools.runSecurityScan(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getSecurityScanResults')) {
    server.tool(
      'getSecurityScanResults',
      'Get results from security scans',
      {
        scanId: z.string().describe('ID of the scan to get results for'),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'all']).optional().describe('Filter results by severity'),
      },
      async (params) => {
        const result = await devSecOpsTools.getSecurityScanResults(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('trackSecurityVulnerabilities')) {
    server.tool(
      'trackSecurityVulnerabilities',
      'Track and manage security vulnerabilities',
      {
        vulnerabilityId: z.string().optional().describe('ID of a specific vulnerability to track'),
        status: z.enum(['open', 'in-progress', 'mitigated', 'resolved', 'false-positive']).optional().describe('Filter by vulnerability status'),
        timeRange: z.string().optional().describe("Time range for tracking (e.g., '90d')"),
      },
      async (params) => {
        const result = await devSecOpsTools.trackSecurityVulnerabilities(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('generateSecurityCompliance')) {
    server.tool(
      'generateSecurityCompliance',
      'Generate security compliance reports',
      {
        standardType: z.enum(['owasp', 'pci-dss', 'hipaa', 'gdpr', 'iso27001', 'custom']).optional().describe('Compliance standard to report on'),
        includeEvidence: z.boolean().optional().describe('Include evidence in the report'),
      },
      async (params) => {
        const result = await devSecOpsTools.generateSecurityCompliance(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('integrateSarifResults')) {
    server.tool(
      'integrateSarifResults',
      'Import and process SARIF format security results',
      {
        sarifFilePath: z.string().describe('Path to the SARIF file to import'),
        createWorkItems: z.boolean().optional().describe('Create work items from findings'),
      },
      async (params) => {
        const result = await devSecOpsTools.integrateSarifResults(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('runComplianceChecks')) {
    server.tool(
      'runComplianceChecks',
      'Run compliance checks against standards',
      {
        complianceStandard: z.string().describe('Compliance standard to check against'),
        scopeId: z.string().optional().describe('Scope of the compliance check'),
      },
      async (params) => {
        const result = await devSecOpsTools.runComplianceChecks(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getComplianceStatus')) {
    server.tool(
      'getComplianceStatus',
      'Get current compliance status',
      {
        standardId: z.string().optional().describe('ID of the compliance standard'),
        includeHistory: z.boolean().optional().describe('Include historical compliance data'),
      },
      async (params) => {
        const result = await devSecOpsTools.getComplianceStatus(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createComplianceReport')) {
    server.tool(
      'createComplianceReport',
      'Create compliance reports for auditing',
      {
        standardId: z.string().describe('ID of the compliance standard'),
        format: z.enum(['pdf', 'html', 'json']).optional().describe('Format of the report'),
      },
      async (params) => {
        const result = await devSecOpsTools.createComplianceReport(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('manageSecurityPolicies')) {
    server.tool(
      'manageSecurityPolicies',
      'Manage security policies',
      {
        policyName: z.string().describe('Name of the security policy'),
        action: z.enum(['create', 'update', 'delete', 'get']).describe('Action to perform on the policy'),
        policyDefinition: z.record(z.any()).optional().describe('Definition of the policy'),
      },
      async (params) => {
        const result = await devSecOpsTools.manageSecurityPolicies(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('trackSecurityAwareness')) {
    server.tool(
      'trackSecurityAwareness',
      'Track security awareness and training',
      {
        teamId: z.string().optional().describe('ID of the team to track'),
        trainingId: z.string().optional().describe('ID of specific training to track'),
        timeRange: z.string().optional().describe("Time range for tracking (e.g., '90d')"),
      },
      async (params) => {
        const result = await devSecOpsTools.trackSecurityAwareness(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('rotateSecrets')) {
    server.tool(
      'rotateSecrets',
      'Rotate secrets and credentials',
      {
        secretName: z.string().optional().describe('Name of the secret to rotate'),
        secretType: z.enum(['password', 'token', 'certificate', 'key']).optional().describe('Type of secret to rotate'),
        force: z.boolean().optional().describe('Force rotation even if not expired'),
      },
      async (params) => {
        const result = await devSecOpsTools.rotateSecrets(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('auditSecretUsage')) {
    server.tool(
      'auditSecretUsage',
      'Audit usage of secrets across services',
      {
        secretName: z.string().optional().describe('Name of the secret to audit'),
        timeRange: z.string().optional().describe("Time range for the audit (e.g., '30d')"),
      },
      async (params) => {
        const result = await devSecOpsTools.auditSecretUsage(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('vaultIntegration')) {
    server.tool(
      'vaultIntegration',
      'Integrate with secret vaults',
      {
        vaultUrl: z.string().describe('URL of the vault to integrate with'),
        secretPath: z.string().optional().describe('Path to the secret in the vault'),
        action: z.enum(['get', 'list', 'set', 'delete']).describe('Action to perform'),
        secretValue: z.string().optional().describe("Value to set (for 'set' action)"),
      },
      async (params) => {
        const result = await devSecOpsTools.vaultIntegration(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // Register ArtifactManagement Tools
  if (isToolAllowed('listArtifactFeeds')) {
    server.tool(
      'listArtifactFeeds',
      'List artifact feeds in the organization',
      {
        feedType: z.enum(['npm', 'nuget', 'maven', 'python', 'universal', 'all']).optional().describe('Type of feeds to list'),
        includeDeleted: z.boolean().optional().describe('Include deleted feeds'),
      },
      async (params) => {
        const result = await artifactManagementTools.listArtifactFeeds(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getPackageVersions')) {
    server.tool(
      'getPackageVersions',
      'Get versions of a package in a feed',
      {
        feedId: z.string().describe('ID of the feed'),
        packageName: z.string().describe('Name of the package'),
        top: z.number().optional().describe('Maximum number of versions to return'),
      },
      async (params) => {
        const result = await artifactManagementTools.getPackageVersions(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('publishPackage')) {
    server.tool(
      'publishPackage',
      'Publish a package to a feed',
      {
        feedId: z.string().describe('ID of the feed to publish to'),
        packageType: z.enum(['npm', 'nuget', 'maven', 'python', 'universal']).describe('Type of package'),
        packagePath: z.string().describe('Path to the package file'),
        packageVersion: z.string().optional().describe('Version of the package'),
      },
      async (params) => {
        const result = await artifactManagementTools.publishPackage(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('promotePackage')) {
    server.tool(
      'promotePackage',
      'Promote a package version between views',
      {
        feedId: z.string().describe('ID of the feed'),
        packageName: z.string().describe('Name of the package'),
        packageVersion: z.string().describe('Version of the package'),
        sourceView: z.string().describe("Source view (e.g., 'prerelease')"),
        targetView: z.string().describe("Target view (e.g., 'release')"),
      },
      async (params) => {
        const result = await artifactManagementTools.promotePackage(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('deletePackageVersion')) {
    server.tool(
      'deletePackageVersion',
      'Delete a version of a package',
      {
        feedId: z.string().describe('ID of the feed'),
        packageName: z.string().describe('Name of the package'),
        packageVersion: z.string().describe('Version of the package to delete'),
        permanent: z.boolean().optional().describe('Permanently delete the package version'),
      },
      async (params) => {
        const result = await artifactManagementTools.deletePackageVersion(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('listContainerImages')) {
    server.tool(
      'listContainerImages',
      'List container images in a repository',
      {
        repositoryName: z.string().optional().describe('Name of the container repository'),
        includeManifests: z.boolean().optional().describe('Include image manifests'),
        includeDeleted: z.boolean().optional().describe('Include deleted images'),
      },
      async (params) => {
        const result = await artifactManagementTools.listContainerImages(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getContainerImageTags')) {
    server.tool(
      'getContainerImageTags',
      'Get tags for a container image',
      {
        repositoryName: z.string().describe('Name of the container repository'),
        imageName: z.string().describe('Name of the container image'),
        top: z.number().optional().describe('Maximum number of tags to return'),
      },
      async (params) => {
        const result = await artifactManagementTools.getContainerImageTags(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('scanContainerImage')) {
    server.tool(
      'scanContainerImage',
      'Scan a container image for vulnerabilities and compliance issues',
      {
        repositoryName: z.string().describe('Name of the container repository'),
        imageTag: z.string().describe('Tag of the container image to scan'),
        scanType: z.enum(['vulnerability', 'compliance', 'both']).optional().describe('Type of scan to perform'),
      },
      async (params) => {
        const result = await artifactManagementTools.scanContainerImage(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('manageContainerPolicies')) {
    server.tool(
      'manageContainerPolicies',
      'Manage policies for container repositories',
      {
        repositoryName: z.string().describe('Name of the container repository'),
        policyType: z.enum(['retention', 'security', 'access']).describe('Type of policy to manage'),
        action: z.enum(['get', 'set', 'delete']).describe('Action to perform on the policy'),
        policySettings: z.record(z.any()).optional().describe('Settings for the policy when setting'),
      },
      async (params) => {
        const result = await artifactManagementTools.manageContainerPolicies(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('manageUniversalPackages')) {
    server.tool(
      'manageUniversalPackages',
      'Manage universal packages',
      {
        packageName: z.string().describe('Name of the universal package'),
        action: z.enum(['download', 'upload', 'delete']).describe('Action to perform'),
        packagePath: z.string().optional().describe('Path for package upload or download'),
        packageVersion: z.string().optional().describe('Version of the package'),
      },
      async (params) => {
        const result = await artifactManagementTools.manageUniversalPackages(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('createPackageDownloadReport')) {
    server.tool(
      'createPackageDownloadReport',
      'Create reports on package downloads',
      {
        feedId: z.string().optional().describe('ID of the feed'),
        packageName: z.string().optional().describe('Name of the package'),
        timeRange: z.string().optional().describe("Time range for the report (e.g., '30d')"),
        format: z.enum(['csv', 'json']).optional().describe('Format of the report'),
      },
      async (params) => {
        const result = await artifactManagementTools.createPackageDownloadReport(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('checkPackageDependencies')) {
    server.tool(
      'checkPackageDependencies',
      'Check package dependencies and vulnerabilities',
      {
        packageName: z.string().describe('Name of the package to check'),
        packageVersion: z.string().optional().describe('Version of the package'),
        includeTransitive: z.boolean().optional().describe('Include transitive dependencies'),
        checkVulnerabilities: z.boolean().optional().describe('Check for known vulnerabilities'),
      },
      async (params) => {
        const result = await artifactManagementTools.checkPackageDependencies(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  // AI Assisted Development Tools
  if (isToolAllowed('getAICodeReview')) {
    server.tool(
      'getAICodeReview',
      'Get AI-based code review suggestions',
      {
        pullRequestId: z.number().optional().describe('ID of the pull request to review'),
        repositoryId: z.string().optional().describe('ID of the repository'),
        commitId: z.string().optional().describe('ID of the commit to review'),
        filePath: z.string().optional().describe('Path to the file to review'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.getAICodeReview(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('suggestCodeOptimization')) {
    server.tool(
      'suggestCodeOptimization',
      'Suggest code optimizations using AI',
      {
        repositoryId: z.string().describe('ID of the repository'),
        filePath: z.string().describe('Path to the file to optimize'),
        lineStart: z.number().optional().describe('Starting line number'),
        lineEnd: z.number().optional().describe('Ending line number'),
        optimizationType: z.enum(['performance', 'memory', 'readability', 'all']).optional().describe('Type of optimization to focus on'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.suggestCodeOptimization(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('identifyCodeSmells')) {
    server.tool(
      'identifyCodeSmells',
      'Identify potential code smells and anti-patterns',
      {
        repositoryId: z.string().describe('ID of the repository'),
        branch: z.string().optional().describe('Branch to analyze'),
        filePath: z.string().optional().describe('Path to the file to analyze'),
        severity: z.enum(['high', 'medium', 'low', 'all']).optional().describe('Severity level to filter by'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.identifyCodeSmells(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('getPredictiveBugAnalysis')) {
    server.tool(
      'getPredictiveBugAnalysis',
      'Predict potential bugs in code changes',
      {
        repositoryId: z.string().describe('ID of the repository'),
        pullRequestId: z.number().optional().describe('ID of the pull request'),
        branch: z.string().optional().describe('Branch to analyze'),
        filePath: z.string().optional().describe('Path to the file to analyze'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.getPredictiveBugAnalysis(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('getDeveloperProductivity')) {
    server.tool(
      'getDeveloperProductivity',
      'Measure developer productivity metrics',
      {
        userId: z.string().optional().describe('ID of the user'),
        teamId: z.string().optional().describe('ID of the team'),
        timeRange: z.string().optional().describe("Time range for analysis (e.g., '30d', '3m')"),
        includeMetrics: z.array(z.string()).optional().describe('Specific metrics to include'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.getDeveloperProductivity(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('getPredictiveEffortEstimation')) {
    server.tool(
      'getPredictiveEffortEstimation',
      'AI-based effort estimation for work items',
      {
        workItemIds: z.array(z.number()).optional().describe('IDs of work items to estimate'),
        workItemType: z.string().optional().describe('Type of work items to estimate'),
        areaPath: z.string().optional().describe('Area path to filter work items'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.getPredictiveEffortEstimation(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('getCodeQualityTrends')) {
    server.tool(
      'getCodeQualityTrends',
      'Track code quality trends over time',
      {
        repositoryId: z.string().optional().describe('ID of the repository'),
        branch: z.string().optional().describe('Branch to analyze'),
        timeRange: z.string().optional().describe("Time range for analysis (e.g., '90d', '6m')"),
        metrics: z.array(z.string()).optional().describe('Specific metrics to include'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.getCodeQualityTrends(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('suggestWorkItemRefinements')) {
    server.tool(
      'suggestWorkItemRefinements',
      'Get AI suggestions for work item refinements',
      {
        workItemId: z.number().optional().describe('ID of the work item to refine'),
        workItemType: z.string().optional().describe('Type of work item'),
        areaPath: z.string().optional().describe('Area path to filter work items'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.suggestWorkItemRefinements(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('suggestAutomationOpportunities')) {
    server.tool(
      'suggestAutomationOpportunities',
      'Identify opportunities for automation',
      {
        projectId: z.string().optional().describe('ID of the project'),
        scopeType: z.enum(['builds', 'releases', 'tests', 'workitems', 'all']).optional().describe('Type of scope to analyze'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.suggestAutomationOpportunities(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('createIntelligentAlerts')) {
    server.tool(
      'createIntelligentAlerts',
      'Set up intelligent alerts based on patterns',
      {
        alertName: z.string().describe('Name of the alert'),
        alertType: z.enum(['build', 'release', 'test', 'workitem', 'code']).describe('Type of alert to create'),
        conditions: z.record(z.any()).describe('Conditions for the alert'),
        actions: z.record(z.any()).optional().describe('Actions to take when the alert triggers'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.createIntelligentAlerts(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('predictBuildFailures')) {
    server.tool(
      'predictBuildFailures',
      'Predict potential build failures before they occur',
      {
        buildDefinitionId: z.number().describe('ID of the build definition'),
        lookbackPeriod: z.string().optional().describe("Period to analyze for patterns (e.g., '30d')"),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.predictBuildFailures(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  if (isToolAllowed('optimizeTestSelection')) {
    server.tool(
      'optimizeTestSelection',
      'Intelligently select tests to run based on changes',
      {
        buildId: z.number().describe('ID of the build'),
        changedFiles: z.array(z.string()).optional().describe('List of changed files'),
        maxTestCount: z.number().optional().describe('Maximum number of tests to select'),
      },
      async (params) => {
        const result = await aiAssistedDevelopmentTools.optimizeTestSelection(params);
        return {
          content: result.content,
          rawData: result.rawData,
        };
      }
    );
  }

  // Register Wiki Tools
  if (isToolAllowed('listWikis')) {
    server.tool(
      'listWikis',
      'List all wikis in a project',
      {
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.listWikis(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWiki')) {
    server.tool(
      'getWiki',
      'Get a specific wiki by ID or name',
      {
        wikiIdentifier: z.string().describe('Wiki ID or name'),
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.getWiki(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWikiPage')) {
    server.tool(
      'getWikiPage',
      'Get a wiki page by path',
      {
        wikiIdentifier: z.string().describe('Wiki ID or name'),
        path: z.string().optional().describe('Page path (e.g., "/Home")'),
        recursionLevel: z.enum(['none', 'oneLevel', 'oneLevelPlusNestedEmptyFolders', 'full']).optional().describe('Recursion level for subpages'),
        includeContent: z.boolean().optional().describe('Include page content (default: true)'),
        version: z.string().optional().describe('Git branch/tag/commit'),
        versionType: z.enum(['branch', 'tag', 'commit']).optional().describe('Type of version specifier'),
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.getWikiPage(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWikiPageById')) {
    server.tool(
      'getWikiPageById',
      'Get a wiki page by ID',
      {
        wikiIdentifier: z.string().describe('Wiki ID or name'),
        pageId: z.number().describe('Page ID'),
        recursionLevel: z.enum(['none', 'oneLevel', 'oneLevelPlusNestedEmptyFolders', 'full']).optional().describe('Recursion level for subpages'),
        includeContent: z.boolean().optional().describe('Include page content (default: true)'),
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.getWikiPageById(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWikiPages')) {
    server.tool(
      'getWikiPages',
      'Get a pageable list of wiki pages',
      {
        wikiIdentifier: z.string().describe('Wiki ID or name'),
        pageViewsForDays: z.number().optional().describe('Number of days to include page view stats'),
        continuationToken: z.string().optional().describe('Continuation token for pagination'),
        top: z.number().optional().describe('Maximum number of pages to return'),
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.getWikiPages(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  if (isToolAllowed('getWikiPageDetails')) {
    server.tool(
      'getWikiPageDetails',
      'Get wiki page metadata and view stats',
      {
        wikiIdentifier: z.string().describe('Wiki ID or name'),
        pageId: z.number().describe('Page ID'),
        pageViewsForDays: z.number().optional().describe('Number of days to include page view stats'),
        projectId: z.string().optional().describe('Project ID (defaults to configured project)'),
      },
      async (params) => {
        const result = await wikiTools.getWikiPageDetails(params);
        return {
          content: result.content,
          rawData: result.rawData,
          isError: result.isError,
        };
      }
    );
  }

  return server;
}

/**
 * Start the HTTP server
 */
/**
 * Validate API key from request headers
 */
function validateApiKey(headers: http.IncomingHttpHeaders, requiredApiKey?: string): boolean {
  if (!requiredApiKey) {
    return true; // API key not required
  }

  const requestApiKey = headers['x-api-key'];
  const apiKeyValue = Array.isArray(requestApiKey) ? requestApiKey[0] : requestApiKey;

  return apiKeyValue === requiredApiKey;
}

// Middleware: Authentication
function createAuthMiddleware(apiKey?: string, requireApiKey: boolean = false) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const url = req.url;

    // Skip authentication for public endpoints
    if (url === '/health' || url === '/ping' || url === '/' || url === '/config') {
      return next();
    }

    // Validate API key if required
    if (requireApiKey && !validateApiKey(req.headers, apiKey)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
        code: 'INVALID_API_KEY',
      });
    }

    next();
  };
}

// Middleware: Request Logging (example of extensible pipeline)
function createLoggingMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });

    next();
  };
}

// Middleware: Rate Limiting (example)
function createRateLimitMiddleware(windowMs: number = 60000, maxRequests: number = 100) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowData = requests.get(clientId);

    if (!windowData || now > windowData.resetTime) {
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (windowData.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((windowData.resetTime - now) / 1000),
      });
    }

    windowData.count++;
    next();
  };
}

// Middleware: Parse configuration from headers
function createConfigMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { config, allowedTools } = parseConfigFromHeaders(req.headers);
      (req as any).azureDevOpsConfig = config;
      (req as any).allowedTools = allowedTools;
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : 'Invalid configuration headers',
        code: 'INVALID_CONFIG',
      });
    }
  };
}

async function main() {
  // Load environment variables from .env files
  loadEnvFile();

  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';
  const apiKey = process.env.MCP_API_KEY; // Optional API key for authentication
  const requireApiKey = process.env.MCP_REQUIRE_API_KEY === 'true'; // New env var to make API key mandatory

  console.log(`Starting Azure DevOps MCP Remote Server...`);
  console.log(`Port: ${port}`);
  console.log(`Host: ${host}`);
  console.log(`API Key Authentication: ${apiKey ? 'Enabled' : 'Disabled'}`);
  console.log(`API Key Required: ${requireApiKey ? 'Yes' : 'No'}`);

  // Create Express app
  const app = express();
  app.use(express.json());
  // Middleware pipeline - easily configurable and extensible
  app.use(cors()); // CORS support
  app.use(createLoggingMiddleware()); // Request logging
  app.use(createRateLimitMiddleware(60000, 100)); // Rate limiting: 100 requests per minute
  app.use(createAuthMiddleware(apiKey, requireApiKey)); // Authentication middleware

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'azure-devops-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ping', (req, res) => {
    res.json({
      status: 'pong',
      service: 'azure-devops-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Configuration guide endpoint
  app.get(['/', '/config'], (req, res) => {
    const apiKeyRequired = process.env.MCP_REQUIRE_API_KEY === 'true';
    const apiKeyEnabled = !!process.env.MCP_API_KEY;
    const requestHost = req.headers.host || `${req.protocol || 'http'}://${host}:${port}`;

    res.json({
      service: 'Azure DevOps MCP Server',
      version: '1.0.0',
      description: 'MCP server for Azure DevOps integration providing access to work items, repositories, projects, boards, and sprints',
      repository: 'https://github.com/RyanCardin15/AzureDevOps-MCP',
      endpoints: {
        mcp: `http://${requestHost}/mcp (supports both SSE and StreamableHTTP)`,
        health: `http://${requestHost}/health`,
        config: `http://${requestHost}/config`,
      },
      authentication: {
        apiKey: {
          enabled: apiKeyEnabled,
          required: apiKeyRequired,
          header: 'x-api-key',
          note: 'Not required for /health, /config, and / endpoints',
        },
      },
      requiredHeaders: ['x-azure-devops-org-url', 'x-azure-devops-project', 'x-azure-devops-pat'],
      optionalHeaders: ['x-api-key', 'x-azure-devops-allowed-tools', 'x-azure-devops-auth-type', 'x-azure-devops-is-on-premises', 'accept'],
      transport: {
        unified: '/mcp (GET for SSE, POST for StreamableHTTP)',
        messages: '/mcp/messages?sessionId=<id> (POST for SSE messages)',
        note: 'Unified endpoint supporting both SSE and StreamableHTTP transports. Auto-detects transport type based on HTTP method. Modern clients should use POST for StreamableHTTP.',
      },
      pipeline: {
        description: 'Express.js middleware pipeline for flexible configuration',
        middlewares: [
          'CORS support',
          'Request logging',
          'Rate limiting (100 req/min)',
          'Body parsing',
          'Authentication',
          'Configuration parsing (for MCP endpoint)',
        ],
        extensible: 'Add custom middleware functions as needed',
      },
      installation: {
        quickStart: {
          command: 'npx @ryancardin/azuredevops-mcp-server@latest',
          description: 'Run directly with NPX (no installation required)',
        },
        cursorDeeplink:
          'cursor://anysphere.cursor-deeplink/mcp/install?name=azure-devops&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAcnlhbmNhcmRpbi9henVyZWRldm9wcy1tY3Atc2VydmVyQGxhdGVzdCJdLCJlbnYiOnsiQVpVUkVfREVWT1BTX09SR19VUkwiOiJodHRwczovL2Rldi5henVyZS5jb20veW91ci1vcmdhbml6YXRpb24iLCJBWlVUkVfREVWT1BTX1BST0pFQ1QiOiJ5b3VyLXByb2plY3QiLCJBWlVUkVfREVWT1BTX0lTX09OX1BSRU1JU0VTIjoiZmFsc2UiLCJBWlVUkVfREVWT1BTX0FVVEhfVFlQRSI6InBhdCIsIkFaVVJFX0RFVk9QU19QRVJTT05BTF9BQ0NFU1NfVE9LRU4iOiJ5b3VyLXBlcnNvbmFsLWFjY2Vzcy10b2tlbiJ9fQo=',
        globalInstall: 'npm install -g @ryancardin/azuredevops-mcp-server',
        development: {
          clone: 'git clone https://github.com/RyanCardin15/AzureDevOps-MCP.git',
          install: 'npm install',
          build: 'npm run build',
          start: 'npm start',
        },
      },
      environmentVariables: {
        required: {
          AZURE_DEVOPS_ORG_URL: 'URL of your Azure DevOps organization (e.g., https://dev.azure.com/your-org)',
          AZURE_DEVOPS_PROJECT: 'Default project name to use',
        },
        authentication: {
          pat: {
            AZURE_DEVOPS_AUTH_TYPE: 'pat',
            AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN: 'Your Personal Access Token',
          },
          entra: {
            AZURE_DEVOPS_AUTH_TYPE: 'entra',
            note: 'Requires Azure CLI authentication (az login)',
          },
          ntlm: {
            AZURE_DEVOPS_AUTH_TYPE: 'ntlm',
            AZURE_DEVOPS_USERNAME: 'Your username',
            AZURE_DEVOPS_PASSWORD: 'Your password',
            AZURE_DEVOPS_DOMAIN: 'Your domain (optional)',
          },
        },
        optional: {
          AZURE_DEVOPS_IS_ON_PREMISES: 'true for Azure DevOps Server, false for Services (default: false)',
          AZURE_DEVOPS_COLLECTION: 'Collection name for on-premises (required if on-premises)',
          AZURE_DEVOPS_API_VERSION: 'API version for on-premises',
          ALLOWED_TOOLS: 'Comma-separated list of allowed tool names',
          MCP_API_KEY: 'API key for server authentication',
          MCP_REQUIRE_API_KEY: 'true to require API key for MCP requests (default: false)',
          PORT: 'Server port (default: 8080)',
          HOST: 'Server host (default: localhost)',
        },
      },
      clientConfiguration: {
        cursor: {
          example: {
            mcpServers: {
              'azure-devops': {
                command: 'npx',
                args: ['@ryancardin/azuredevops-mcp-server@latest'],
                env: {
                  AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/your-organization',
                  AZURE_DEVOPS_PROJECT: 'your-project',
                  AZURE_DEVOPS_IS_ON_PREMISES: 'false',
                  AZURE_DEVOPS_AUTH_TYPE: 'pat',
                  AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN: 'your-personal-access-token',
                },
              },
            },
          },
        },
        claudeDesktop: {
          example: {
            mcpServers: {
              'azure-devops': {
                command: 'npx',
                args: ['@ryancardin/azuredevops-mcp-server@latest'],
                env: {
                  AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/your-organization',
                  AZURE_DEVOPS_PROJECT: 'your-project',
                  AZURE_DEVOPS_IS_ON_PREMISES: 'false',
                  AZURE_DEVOPS_AUTH_TYPE: 'pat',
                  AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN: 'your-personal-access-token',
                },
              },
            },
          },
        },
      },
      personalAccessToken: {
        guide: 'Create PAT in Azure DevOps: User Settings > Personal Access Tokens > New Token',
        requiredScopes: ['Work Items: Read & Write', 'Code: Read & Write', 'Project and Team: Read & Write', 'Build: Read', 'Release: Read'],
        note: 'PAT inherits permissions from your user account',
      },
      toolCategories: [
        {
          name: 'Work Item Tools',
          count: 15,
          description: 'Manage work items, create, update, search, and track work items',
        },
        {
          name: 'Boards & Sprints Tools',
          count: 9,
          description: 'Kanban board operations, sprint management, and team capacity',
        },
        {
          name: 'Project Tools',
          count: 10,
          description: 'Project management, areas, iterations, and process templates',
        },
        {
          name: 'Git Tools',
          count: 14,
          description: 'Repository operations, pull requests, branches, and code search',
        },
        {
          name: 'Testing Capabilities Tools',
          count: 14,
          description: 'Test automation, exploratory testing, and test management',
        },
        {
          name: 'DevSecOps Tools',
          count: 13,
          description: 'Security scanning, compliance, and vulnerability management',
        },
        {
          name: 'Artifact Management Tools',
          count: 13,
          description: 'Package feeds, container images, and artifact lifecycle',
        },
        {
          name: 'AI-Assisted Development Tools',
          count: 12,
          description: 'AI-powered code reviews, optimizations, and productivity metrics',
        },
      ],
      troubleshooting: {
        authentication: 'Verify PAT is valid and has required scopes. Check organization URL format.',
        connection: 'Ensure Azure DevOps instance is accessible from your network.',
        tools: 'Use ALLOWED_TOOLS env var to filter available tools if needed.',
        cors: 'Server allows all origins by default for flexibility.',
      },
      documentation: 'https://github.com/RyanCardin15/AzureDevOps-MCP',
    });
  });

  // Store active MCP server instances and transports for different transport types
  const activeSSEConnections = new Map<string, { server: McpServer; transport: SSEServerTransport; cleanup: () => void }>();

  // Unified MCP endpoint supporting both SSE and StreamableHTTP transports
  app.post('/mcp', createConfigMiddleware(), async (req, res) => {
    try {
      const config = (req as any).azureDevOpsConfig as AzureDevOpsConfig;
      const allowedTools = (req as any).allowedTools as Set<string>;

      // Create MCP server instance for this session
      const server = await createServerInstance(config, allowedTools);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      const sessionId = transport.sessionId;
      console.log(`Using StreamableHTTP transport for session ${sessionId}`);

      // Handle cleanup on connection close
      res.on('close', () => {
        console.log(`StreamableHTTP connection closed for session ${sessionId}`);
        try {
          transport.close();
        } catch (error) {
          console.error('Error closing StreamableHTTP transport:', error);
        }
      });

      // Connect server to transport and handle request
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error creating MCP server instance:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to create MCP server instance',
          code: 'SERVER_ERROR',
        });
      }
    }
  });

  app.get('/sse', createConfigMiddleware(), async (req, res) => {
    const config = (req as any).azureDevOpsConfig as AzureDevOpsConfig;
    const allowedTools = (req as any).allowedTools as Set<string>;

    // Create MCP server instance for this session
    const server = await createServerInstance(config, allowedTools);
    const transport = new SSEServerTransport('/sse/messages', res);
    const sessionId = transport.sessionId;
    console.log(`Using SSE transport for session ${sessionId}`);

    // Clean up existing connection for this session if it exists
    const existingConnection = activeSSEConnections.get(sessionId);
    if (existingConnection) {
      existingConnection.cleanup();
      activeSSEConnections.delete(sessionId);
    }

    // Store connection for cleanup
    const cleanup = () => {
      try {
        transport.close();
      } catch (error) {
        console.error('Error closing SSE transport:', error);
      }
    };

    activeSSEConnections.set(sessionId, { server, transport, cleanup });

    // Handle cleanup on connection close
    res.on('close', () => {
      console.log(`SSE connection closed for session ${sessionId}`);
      cleanup();
      activeSSEConnections.delete(sessionId);
    });

    // Connect server to transport
    await server.connect(transport);
    console.log(`SSE MCP server connected for session ${sessionId}`);
  });

  // SSE message endpoint
  app.post('/sse/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session ID is required for SSE messages',
        code: 'MISSING_SESSION_ID',
      });
    }

    const connection = activeSSEConnections.get(sessionId);
    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active SSE session found',
        code: 'SESSION_NOT_FOUND',
      });
    }

    try {
      await connection.transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling SSE message:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to handle SSE message',
          code: 'SSE_ERROR',
        });
      }
    }
  });

  // Start server
  const server = app.listen(port, host, () => {
    console.log(`✅ Server running on http://${host}:${port}`);
    console.log(`📡 MCP endpoint: http://${host}:${port}/mcp`);
    console.log(`   • Supports both SSE (GET) and StreamableHTTP (POST) transports`);
    console.log(`   • Auto-detects transport type based on request method`);
    console.log(`🏥 Health check: http://${host}:${port}/health (public)`);
    console.log(`📋 Config guide: http://${host}:${port}/config (public)`);

    if (requireApiKey) {
      console.log(`🔐 API Key: REQUIRED for MCP requests`);
    } else if (apiKey) {
      console.log(`🔐 API Key: OPTIONAL for MCP requests`);
    }
  });

  // Handle shutdown gracefully
  const gracefulShutdown = () => {
    console.log('\nShutting down...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
