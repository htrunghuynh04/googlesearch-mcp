export interface GetProjectCostAnalysisParams {
  projectId?: string;
  timeRange?: string;
  groupBy?: 'service' | 'resource' | 'team' | 'month';
}

export interface ForecastResourceUsageParams {
  projectId?: string;
  resourceType?: 'compute' | 'storage' | 'network' | 'licenses' | 'all';
  forecastPeriod?: string;
}

export interface OptimizeResourceAllocationParams {
  projectId?: string;
  resourceType?: 'compute' | 'storage' | 'network' | 'licenses' | 'all';
  optimizationGoal?: 'cost' | 'performance' | 'balance';
}

export interface TrackCloudSpendingParams {
  projectId?: string;
  timeRange?: string;
  includeForecasts?: boolean;
  serviceTypes?: string[];
}

export interface GetResourceUtilizationParams {
  resourceId?: string;
  resourceType?: 'buildagent' | 'testmachine' | 'deployment' | 'all';
  timeRange?: string;
}

export interface OptimizeParallelizationParams {
  buildDefinitionId?: number;
  releaseDefinitionId?: number;
  maximumAgentCount?: number;
}

export interface TrackLicenseUsageParams {
  licenseType?: 'basic' | 'stakeholder' | 'test' | 'all';
  projectId?: string;
  timeRange?: string;
}

export interface GetResourceBottlenecksParams {
  projectId?: string;
  analysisType?: 'build' | 'release' | 'test' | 'all';
  timeRange?: string;
} 