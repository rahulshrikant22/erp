/**
 * Shared types matching the backend's response envelope and a few core
 * API entities. Intentionally narrow — only what the admin UI consumes.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  userType: 'internal' | 'external';
  isActive?: boolean;
  sessionId?: string;
}

export interface LoginPayload {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  sessionId: string;
}

export interface ModuleSummary {
  moduleCode: string;
  name: string;
  description: string | null;
  category: string | null;
  isCore: boolean;
  isBypassable: boolean;
  isActive: boolean;
  activatedAt: string | null;
  deactivatedAt: string | null;
  parentModuleCode: string | null;
  displayOrder: number;
}

export interface DependencyEdge {
  moduleCode: string;
  isHardDependency: boolean;
  isActive: boolean;
}

export interface ModuleDetail extends ModuleSummary {
  dependsOn: DependencyEdge[];
  dependents: DependencyEdge[];
}

export interface SystemSetting {
  id: string;
  settingKey: string;
  settingValue: string | null;
  dataType: 'string' | 'integer' | 'boolean' | 'json';
  category: string | null;
  description: string | null;
  isUserEditable: boolean;
}

export interface AuditLogRow {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  actorUserId: string | null;
  actorIp: string | null;
  changesSummary: string | null;
  actionAt: string;
  requestId: string | null;
}

export interface WorkflowInstanceRow {
  id: string;
  workflowCode: string;
  workflowName: string;
  targetEntity: string;
  targetEntityId: string;
  currentStep: number;
  status: string;
  initiatedAt: string;
  completedAt: string | null;
}

export interface EffectivePermissions {
  context: { userId: string; branchId: string | null; departmentId: string | null; designationId: string | null };
  permissions: { permissionCode: string; source: 'role' | 'override-allow' | 'override-deny' }[];
  modulesActive: string[];
  modulesInactive: string[];
}
