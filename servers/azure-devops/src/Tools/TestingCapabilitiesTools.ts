import { AzureDevOpsConfig } from "../Interfaces/AzureDevOps";
import { TestingCapabilitiesService } from "../Services/TestingCapabilitiesService";
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  RunAutomatedTestsParams,
  GetTestAutomationStatusParams,
  ConfigureTestAgentsParams,
  CreateTestDataGeneratorParams,
  ManageTestEnvironmentsParams,
  GetTestFlakinessParams,
  GetTestGapAnalysisParams,
  RunTestImpactAnalysisParams,
  GetTestHealthDashboardParams,
  RunTestOptimizationParams,
  CreateExploratorySessionsParams,
  RecordExploratoryTestResultsParams,
  ConvertFindingsToWorkItemsParams,
  GetExploratoryTestStatisticsParams
} from "../Interfaces/TestingCapabilities";
import getClassMethods from "../utils/getClassMethods";

export class TestingCapabilitiesTools {
  private service: TestingCapabilitiesService;

  constructor(config: AzureDevOpsConfig) {
    this.service = new TestingCapabilitiesService(config);
  }

  async runAutomatedTests(params: RunAutomatedTestsParams): Promise<McpResponse> {
    try {
      const result = await this.service.runAutomatedTests(params);
      return formatMcpResponse(result, "Automated tests started");
    } catch (error: unknown) {
      console.error('Error running automated tests:', error);
      return formatErrorResponse(error);
    }
  }

  async getTestAutomationStatus(params: GetTestAutomationStatusParams): Promise<McpResponse> {
    try {
      const result = await this.service.getTestAutomationStatus(params);
      return formatMcpResponse(result, `Test run ${params.testRunId} status`);
    } catch (error: unknown) {
      console.error('Error getting test status:', error);
      return formatErrorResponse(error);
    }
  }

  async configureTestAgents(params: ConfigureTestAgentsParams): Promise<McpResponse> {
    try {
      const result = await this.service.configureTestAgents(params);
      return formatMcpResponse(result, `Test agent ${params.agentName} configured`);
    } catch (error: unknown) {
      console.error('Error configuring test agent:', error);
      return formatErrorResponse(error);
    }
  }

  async createTestDataGenerator(params: CreateTestDataGeneratorParams): Promise<McpResponse> {
    try {
      const result = await this.service.createTestDataGenerator(params);
      return formatMcpResponse(result, `Test data generator created: ${params.name}`);
    } catch (error: unknown) {
      console.error('Error creating test data generator:', error);
      return formatErrorResponse(error);
    }
  }

  async manageTestEnvironments(params: ManageTestEnvironmentsParams): Promise<McpResponse> {
    try {
      const result = await this.service.manageTestEnvironments(params);
      return formatMcpResponse(result, `Test environment ${params.environmentName} ${params.action}d`);
    } catch (error: unknown) {
      console.error('Error managing test environment:', error);
      return formatErrorResponse(error);
    }
  }

  async getTestFlakiness(params: GetTestFlakinessParams): Promise<McpResponse> {
    try {
      const result = await this.service.getTestFlakiness(params);
      return formatMcpResponse(result, "Test flakiness analysis");
    } catch (error: unknown) {
      console.error('Error analyzing test flakiness:', error);
      return formatErrorResponse(error);
    }
  }

  async getTestGapAnalysis(params: GetTestGapAnalysisParams): Promise<McpResponse> {
    try {
      const result = await this.service.getTestGapAnalysis(params);
      return formatMcpResponse(result, "Test gap analysis");
    } catch (error: unknown) {
      console.error('Error performing test gap analysis:', error);
      return formatErrorResponse(error);
    }
  }

  async runTestImpactAnalysis(params: RunTestImpactAnalysisParams): Promise<McpResponse> {
    try {
      const result = await this.service.runTestImpactAnalysis(params);
      return formatMcpResponse(result, `Test impact analysis for build ${params.buildId}`);
    } catch (error: unknown) {
      console.error('Error running test impact analysis:', error);
      return formatErrorResponse(error);
    }
  }

  async getTestHealthDashboard(params: GetTestHealthDashboardParams): Promise<McpResponse> {
    try {
      const result = await this.service.getTestHealthDashboard(params);
      return formatMcpResponse(result, "Test health dashboard");
    } catch (error: unknown) {
      console.error('Error getting test health dashboard:', error);
      return formatErrorResponse(error);
    }
  }

  async runTestOptimization(params: RunTestOptimizationParams): Promise<McpResponse> {
    try {
      const result = await this.service.runTestOptimization(params);
      return formatMcpResponse(result, `Test optimization for test plan ${params.testPlanId}`);
    } catch (error: unknown) {
      console.error('Error running test optimization:', error);
      return formatErrorResponse(error);
    }
  }

  async createExploratorySessions(params: CreateExploratorySessionsParams): Promise<McpResponse> {
    try {
      const result = await this.service.createExploratorySessions(params);
      return formatMcpResponse(result, `Created exploratory session: ${params.title}`);
    } catch (error: unknown) {
      console.error('Error creating exploratory session:', error);
      return formatErrorResponse(error);
    }
  }

  async recordExploratoryTestResults(params: RecordExploratoryTestResultsParams): Promise<McpResponse> {
    try {
      const result = await this.service.recordExploratoryTestResults(params);
      return formatMcpResponse(result, `Recorded ${params.findings.length} findings for session ${params.sessionId}`);
    } catch (error: unknown) {
      console.error('Error recording exploratory test results:', error);
      return formatErrorResponse(error);
    }
  }

  async convertFindingsToWorkItems(params: ConvertFindingsToWorkItemsParams): Promise<McpResponse> {
    try {
      const result = await this.service.convertFindingsToWorkItems(params);
      return formatMcpResponse(result, `Converted findings to work items for session ${params.sessionId}`);
    } catch (error: unknown) {
      console.error('Error converting findings to work items:', error);
      return formatErrorResponse(error);
    }
  }

  async getExploratoryTestStatistics(params: GetExploratoryTestStatisticsParams): Promise<McpResponse> {
    try {
      const result = await this.service.getExploratoryTestStatistics(params);
      return formatMcpResponse(result, "Exploratory testing statistics");
    } catch (error: unknown) {
      console.error('Error getting exploratory test statistics:', error);
      return formatErrorResponse(error);
    }
  }
}

export const TestingCapabilitiesToolMethods = getClassMethods(TestingCapabilitiesTools.prototype);