export interface ListArtifactFeedsParams {
  feedType?: 'npm' | 'nuget' | 'maven' | 'python' | 'universal' | 'all';
  includeDeleted?: boolean;
}

export interface GetPackageVersionsParams {
  feedId: string;
  packageName: string;
  top?: number;
}

export interface PublishPackageParams {
  feedId: string;
  packageType: 'npm' | 'nuget' | 'maven' | 'python' | 'universal';
  packagePath: string;
  packageVersion?: string;
}

export interface PromotePackageParams {
  feedId: string;
  packageName: string;
  packageVersion: string;
  sourceView: string;
  targetView: string;
}

export interface DeletePackageVersionParams {
  feedId: string;
  packageName: string;
  packageVersion: string;
  permanent?: boolean;
}

export interface ListContainerImagesParams {
  repositoryName?: string;
  includeManifests?: boolean;
  includeDeleted?: boolean;
}

export interface GetContainerImageTagsParams {
  repositoryName: string;
  imageName: string;
  top?: number;
}

export interface ScanContainerImageParams {
  repositoryName: string;
  imageTag: string;
  scanType?: 'vulnerability' | 'compliance' | 'both';
}

export interface ManageContainerPoliciesParams {
  repositoryName: string;
  policyType: 'retention' | 'security' | 'access';
  action: 'get' | 'set' | 'delete';
  policySettings?: Record<string, any>;
}

export interface ManageUniversalPackagesParams {
  packageName: string;
  action: 'download' | 'upload' | 'delete';
  packagePath?: string;
  packageVersion?: string;
}

export interface CreatePackageDownloadReportParams {
  feedId?: string;
  packageName?: string;
  timeRange?: string;
  format?: 'csv' | 'json';
}

export interface CheckPackageDependenciesParams {
  packageName: string;
  packageVersion?: string;
  includeTransitive?: boolean;
  checkVulnerabilities?: boolean;
} 