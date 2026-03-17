export interface IntegrateJiraProjectsParams {
  jiraUrl: string;
  projectKey: string;
  syncDirection?: 'ado-to-jira' | 'jira-to-ado' | 'bidirectional';
  mappingDefinition?: Record<string, any>;
}

export interface IntegrateSlackNotificationsParams {
  slackWebhookUrl: string;
  eventType: 'workitem' | 'build' | 'release' | 'pullrequest' | 'all';
  channelName?: string;
  messageTemplate?: string;
}

export interface IntegrateTeamsMessagesParams {
  teamsWebhookUrl: string;
  eventType: 'workitem' | 'build' | 'release' | 'pullrequest' | 'all';
  messageTemplate?: string;
}

export interface ConnectServiceNowParams {
  serviceNowUrl: string;
  authType: 'basic' | 'oauth' | 'apikey';
  credentials?: Record<string, string>;
  mappingRules?: Record<string, any>;
}

export interface IntegrateSonarQubeParams {
  sonarQubeUrl: string;
  projectKey?: string;
  authToken?: string;
  configureBuilds?: boolean;
}

export interface CreateSupportTicketParams {
  workItemId?: number;
  title: string;
  description: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  supportSystem?: 'servicenow' | 'zendesk' | 'jira' | 'custom';
  customFields?: Record<string, any>;
}

export interface TrackSupportStatusParams {
  ticketId: string;
  supportSystem?: 'servicenow' | 'zendesk' | 'jira' | 'custom';
  createWorkItem?: boolean;
}

export interface ManageSLAsParams {
  slaName: string;
  action: 'create' | 'update' | 'delete' | 'get';
  slaDefinition?: Record<string, any>;
}

export interface GenerateSupportReportsParams {
  timeRange: string;
  reportType: 'volume' | 'resolution' | 'satisfaction' | 'sla';
  format?: 'pdf' | 'html' | 'json';
}

export interface CollectCustomerFeedbackParams {
  workItemId?: number;
  feedbackChannel: 'email' | 'web' | 'app' | 'import';
  feedbackData?: string | Record<string, any>;
}

export interface AnalyzeUserSentimentParams {
  feedbackSource: 'workitems' | 'reviews' | 'surveys';
  timeRange?: string;
  includeComments?: boolean;
}

export interface ManageBetaTestingParams {
  testingProgramName: string;
  action: 'create' | 'update' | 'close' | 'get';
  programDetails?: Record<string, any>;
}

export interface CreateFeatureFlagsParams {
  featureName: string;
  description?: string;
  initialState?: boolean;
  targetAudience?: string[];
  expirationDate?: string;
} 