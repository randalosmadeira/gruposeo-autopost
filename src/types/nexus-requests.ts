// Solicitações do cliente ao gestor (contrato GA4/gestão, seções A e G).

export type RequestKind = 'connect_source' | 'plugin_link' | 'plugin_update' | 'new_observation_round' | 'report' | 'access' | 'other';
export type RequestStatus = 'open' | 'in_progress' | 'done' | 'rejected';

export interface ClientRequest {
  id: string;
  organization_id: string;
  project_id: string | null;
  requested_by: string;
  kind: RequestKind;
  message: string;
  status: RequestStatus;
  manager_note: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
  /** O gestor vê solicitações de várias organizações; o servidor pode (ou não) mandar o nome. */
  organization_name?: string | null;
  project_name?: string | null;
}

export interface RequestCreateInput { kind: RequestKind; message: string }
export interface RequestUpdateInput { id: string; status?: RequestStatus; managerNote?: string }
