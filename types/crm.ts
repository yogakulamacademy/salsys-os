export type LeadStage =
  | 'new'
  | 'contacted'
  | 'engaged'
  | 'qualified'
  | 'high_intent'
  | 'payment_pending'
  | 'closed_won'
  | 'enrolled'
  | 'nurture'
  | 'not_now'
  | 'lost'
  | 'unqualified'
  | 'duplicate';

export type IntentLevel = 'unknown' | 'low' | 'medium' | 'high' | 'very_high';
export type Channel = 'website' | 'instagram' | 'whatsapp' | 'email' | 'phone' | 'meta_lead_form' | 'other';

export interface LeadOverview {
  id: string;
  leadCode: string;
  name: string;
  email?: string;
  phone?: string;
  course: string;
  location: string;
  country: string;
  stage: LeadStage;
  intent: IntentLevel;
  firstTouchSource: string;
  firstTouchMedium: string;
  firstTouchCampaign: string;
  leadCreationChannel: Channel;
  currentContactChannel: Channel;
  owner: string;
  lastContactedAt?: string;
  nextFollowupAt?: string;
  createdAt: string;
  value?: number;
  currency?: string;
}

export interface Touchpoint {
  id: string;
  label: string;
  source: string;
  medium?: string;
  timestamp: string;
  detail?: string;
  kind: 'marketing' | 'website' | 'message' | 'stage' | 'payment' | 'system';
}

export interface LeadDetail extends LeadOverview {
  firstName?: string;
  lastName?: string;
  interestedCourseId?: string;
  preferredBatchId?: string;
  preferredMonthRaw?: string;
  preferredMonth?: string;
  preferredMode?: string;
  timezone?: string;
  summary?: string;
  notes?: string;
  touchpoints: Touchpoint[];
  lastMessages: Array<{ id: string; direction: 'inbound' | 'outbound'; sender: string; body: string; timestamp: string; channel: Channel }>;
}

export interface FollowUp {
  id: string;
  leadId: string;
  leadCode: string;
  leadName: string;
  title: string;
  dueAt: string;
  stage: LeadStage;
  intent: IntentLevel;
  channel: Channel;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  platform: string;
  spend: number;
  leads: number;
  qualified: number;
  highIntent: number;
  enrolled: number;
  revenue: number;
}
