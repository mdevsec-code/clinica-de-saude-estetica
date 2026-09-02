import { apiRequest } from './api';
import type { AuditAction, AuditLogList } from '@/types';

export interface FetchAuditLogParams {
  userId?: string;
  entityType?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function fetchAuditLogs(params: FetchAuditLogParams = {}) {
  const query = new URLSearchParams();
  if (params.userId) query.set('userId', params.userId);
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.action) query.set('action', params.action);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 30));
  return apiRequest<AuditLogList>(`/audit?${query.toString()}`);
}
