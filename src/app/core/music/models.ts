export type RepertoireCode = 'PRO' | 'PMM';
export type MusicRecord = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};
export type MusicalVoice = MusicRecord & {
  code: string;
  name: string;
  instrument: string | null;
  archived: boolean;
};
export type MusicRepertoire = {
  code: RepertoireCode;
  name: string;
  revision: number;
};
export type RepertoireWork = MusicRecord & {
  repertoire_code: RepertoireCode;
  title: string;
  author: string | null;
  active: boolean;
};
export type WorkPeriod = {
  work_id: string;
  from_revision: number;
  until_revision: number | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
};
export type MusicFolder = MusicRecord & {
  code: string;
  repertoire_code: RepertoireCode;
  voice_id: string;
  baseline_revision: number;
  manually_blocked: boolean;
  archived: boolean;
  notes: string | null;
};
export type FolderInventory = MusicFolder & {
  loan_id?: string | null;
  holder_id?: string | null;
  holder_name?: string | null;
  holder_due_at?: string | null;
  next_reservation_id?: string | null;
  next_assignee?: string | null;
  next_reserved_from?: string | null;
  voice_name: string;
  voice_code: string;
  voice_archived: boolean;
  usable: boolean;
  operability: 'USABLE' | 'UNUSABLE' | 'ARCHIVED';
  physical_issue_count: number;
  blocking_issue_count: number;
  score_issue_count: number;
  conservation_issue_count: number;
  present_count: number;
  missing_count: number;
  pending_add_count: number;
  pending_remove_count: number;
};
export type PresenceState =
  'PRESENT' | 'MISSING' | 'PENDING_ADD' | 'PENDING_REMOVE' | 'ABSENT_RETIRED';
export type WorkPresence = {
  folder_id: string;
  work_id: string;
  repertoire_code: RepertoireCode;
  present: boolean;
  absence_reason: 'MISSING' | 'REMOVED' | null;
  updated_at: string;
  updated_by: string;
};
export type FolderWorkState = Omit<
  WorkPresence,
  'updated_at' | 'updated_by'
> & {
  title: string;
  author: string | null;
  active: boolean;
  work_version: number;
  folder_version: number;
  presumed: boolean;
  state: PresenceState;
};
export type PresenceAction = 'INCORPORATE' | 'REMOVE';
export type WorkMovement = {
  id: string;
  request_id: string;
  folder_id: string;
  work_id: string;
  repertoire_code: RepertoireCode;
  action: PresenceAction | 'MISSING' | 'RECOVER' | 'REPLACE' | 'CONFIRM_ABSENT';
  before_present: boolean;
  after_present: boolean;
  notes: string | null;
  occurred_at: string;
  actor_id: string;
};
export type ScoreIssueKind = 'MISSING' | 'DAMAGED' | 'REPLACE' | 'REPAIR';
export type PhysicalIssueKind =
  'ELASTICS' | 'COVER' | 'RINGS' | 'REPLACE_FOLDER' | 'OTHER';
export type IssueRecord = MusicRecord & {
  folder_id: string;
  description: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
};
export type ScoreIssue = IssueRecord & {
  work_id: string;
  repertoire_code: RepertoireCode;
  kind: ScoreIssueKind;
};
export type PhysicalIssue = IssueRecord & {
  kind: PhysicalIssueKind;
  blocks_use: boolean;
  description: string;
};
export type MaintenanceTask = {
  task_id: string;
  category: 'REPERTOIRE' | 'CONSERVATION';
  kind: 'PENDING_ADD' | 'PENDING_REMOVE' | ScoreIssueKind | PhysicalIssueKind;
  folder_id: string;
  work_id: string | null;
  issue_id: string | null;
  repertoire_code: RepertoireCode;
  title: string | null;
  description: string | null;
  blocks_use: boolean;
  created_at: string | null;
  resolved_at: null;
  issue_version: number | null;
};
export type PresencePreview = {
  action: PresenceAction;
  work_id: string;
  work_version: number;
  title: string;
  folders: {
    id: string;
    version: number;
    code: string;
    state: 'PENDING_ADD' | 'PENDING_REMOVE';
  }[];
};
export type PresenceResult = {
  folder: MusicFolder;
  work_id: string;
  action: PresenceAction;
};
export type IssueResult<T> = { issue: T; folder_version: number };
export type MusicInputs = {
  VOICE_SAVE: Pick<MusicalVoice, 'code' | 'name' | 'archived'> & {
    instrument?: string | null;
  };
  WORK_SAVE: Pick<RepertoireWork, 'repertoire_code' | 'title' | 'active'> & {
    author?: string | null;
  };
  FOLDER_SAVE: Pick<
    MusicFolder,
    'code' | 'repertoire_code' | 'voice_id' | 'manually_blocked' | 'archived'
  > & { notes?: string | null };
  PRESENCE: {
    work_id: string;
    work_version: number;
    action: PresenceAction;
    notes?: string | null;
  };
  SCORE_SAVE: {
    folder_id: string;
    folder_version: number;
    work_id: string;
    work_version: number;
    kind: ScoreIssueKind;
    description?: string | null;
  };
  PHYSICAL_SAVE: {
    folder_id: string;
    folder_version: number;
    kind: PhysicalIssueKind;
    description: string;
    blocks_use: boolean;
  };
  SCORE_RESOLVE: {
    folder_version: number;
    work_version: number;
    outcome: 'PRESENT' | 'ABSENT' | 'UNCHANGED';
    resolution?: string | null;
  };
  PHYSICAL_RESOLVE: { folder_version: number; resolution?: string | null };
};
export type MusicResults = {
  VOICE_SAVE: MusicalVoice;
  WORK_SAVE: RepertoireWork;
  FOLDER_SAVE: MusicFolder;
  PRESENCE: PresenceResult;
  SCORE_SAVE: IssueResult<ScoreIssue>;
  SCORE_RESOLVE: IssueResult<ScoreIssue>;
  PHYSICAL_SAVE: IssueResult<PhysicalIssue>;
  PHYSICAL_RESOLVE: IssueResult<PhysicalIssue>;
};
export type MusicPage<T> = { rows: T[]; count: number };

export type MaintenanceEntry = Omit<MaintenanceTask, 'resolved_at'> & {
  resolved_at: string | null;
  folder_code: string;
  voice_name: string;
  operability: FolderInventory['operability'];
  archived: boolean;
  folder_version: number;
  work_version: number | null;
  work_active: boolean | null;
  family: 'PRESENCE' | 'SCORE' | 'PHYSICAL';
  resolution: string | null;
  created_by_name: string | null;
  resolved_by_name: string | null;
};
