import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { ProjectService } from '../Services/ProjectService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  ListProjectsParams,
  GetProjectDetailsParams,
  CreateProjectParams,
  GetAreasParams,
  GetIterationsParams,
  CreateAreaParams,
  CreateIterationParams,
  GetProcessesParams,
  GetWorkItemTypesParams,
  GetWorkItemTypeFieldsParams
} from '../Interfaces/ProjectManagement';
import getClassMethods from "../utils/getClassMethods";

export class ProjectTools {
  private projectService: ProjectService;

  constructor(config: AzureDevOpsConfig) {
    this.projectService = new ProjectService(config);
  }

  /**
   * List all projects
   */
  public async listProjects(params: ListProjectsParams): Promise<McpResponse> {
    try {
      const projects = await this.projectService.listProjects(params);
      return formatMcpResponse(projects, `Found ${projects.length} projects`);
    } catch (error) {
      console.error('Error in listProjects tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get project details
   */
  public async getProjectDetails(params: GetProjectDetailsParams): Promise<McpResponse> {
    try {
      const project = await this.projectService.getProjectDetails(params);
      return formatMcpResponse(project, `Project details for ${project.name}`);
    } catch (error) {
      console.error('Error in getProjectDetails tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create a project
   */
  public async createProject(params: CreateProjectParams): Promise<McpResponse> {
    try {
      const project = await this.projectService.createProject(params);
      return formatMcpResponse(project, `Project ${params.name} creation initiated`);
    } catch (error) {
      console.error('Error in createProject tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get areas
   */
  public async getAreas(params: GetAreasParams): Promise<McpResponse> {
    try {
      const areas = await this.projectService.getAreas(params);
      return formatMcpResponse(areas, `Retrieved areas for project ${params.projectId}`);
    } catch (error) {
      console.error('Error in getAreas tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get iterations
   */
  public async getIterations(params: GetIterationsParams): Promise<McpResponse> {
    try {
      const iterations = await this.projectService.getIterations(params);
      return formatMcpResponse(iterations, `Retrieved iterations for project ${params.projectId}`);
    } catch (error) {
      console.error('Error in getIterations tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create area
   */
  public async createArea(params: CreateAreaParams): Promise<McpResponse> {
    try {
      const area = await this.projectService.createArea(params);
      return formatMcpResponse(area, `Created area ${params.name} in project ${params.projectId}`);
    } catch (error) {
      console.error('Error in createArea tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Create iteration
   */
  public async createIteration(params: CreateIterationParams): Promise<McpResponse> {
    try {
      const iteration = await this.projectService.createIteration(params);
      return formatMcpResponse(iteration, `Created iteration ${params.name} in project ${params.projectId}`);
    } catch (error) {
      console.error('Error in createIteration tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get processes
   */
  public async getProcesses(params: GetProcessesParams): Promise<McpResponse> {
    try {
      const processes = await this.projectService.getProcesses(params);
      return formatMcpResponse(processes, `Retrieved ${processes.length} processes`);
    } catch (error) {
      console.error('Error in getProcesses tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get work item types
   */
  public async getWorkItemTypes(params: GetWorkItemTypesParams): Promise<McpResponse> {
    try {
      const types = await this.projectService.getWorkItemTypes(params);
      return formatMcpResponse(types, `Retrieved work item types for process ${params.processId}`);
    } catch (error) {
      console.error('Error in getWorkItemTypes tool:', error);
      return formatErrorResponse(error);
    }
  }

  /**
   * Get work item type fields
   */
  public async getWorkItemTypeFields(params: GetWorkItemTypeFieldsParams): Promise<McpResponse> {
    try {
      const fields = await this.projectService.getWorkItemTypeFields(params);
      return formatMcpResponse(fields, `Retrieved fields for work item type ${params.witRefName}`);
    } catch (error) {
      console.error('Error in getWorkItemTypeFields tool:', error);
      return formatErrorResponse(error);
    }
  }
}

export const ProjectToolMethods = getClassMethods(ProjectTools.prototype);