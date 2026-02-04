export interface Bookmark {
  id?: number;
  title: string;
  url: string;
  category?: string;
  tags: string[];
  icon_url?: string;
  notes?: string;
  reminder?: Reminder;
  visit_count: number;
  last_visited?: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  enabled: boolean;
  frequency: ReminderFrequency;
  time: string; // HH:MM format
  days: number[]; // 0-6 for Sunday-Saturday
  last_reminded?: string;
  next_reminder?: string;
}

export type ReminderFrequency =
  | { type: 'daily' }
  | { type: 'weekly' }
  | { type: 'custom'; interval_days: number }
  | { type: 'once' };

export interface CreateBookmarkInput {
  title: string;
  url: string;
  category?: string;
  tags: string[];
  notes?: string;
  reminder?: Reminder;
}

export interface UpdateBookmarkInput {
  id: number;
  title?: string;
  url?: string;
  category?: string;
  tags?: string[];
  notes?: string;
  reminder?: Reminder;
}
