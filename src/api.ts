import { invoke } from '@tauri-apps/api/core';
import type { Bookmark, CreateBookmarkInput, UpdateBookmarkInput } from './types';

export const bookmarkApi = {
  async createBookmark(input: CreateBookmarkInput): Promise<Bookmark> {
    try {
      const result = await invoke('create_bookmark', { input });
      return result as Bookmark;
    } catch (error) {
      throw error;
    }
  },

  async getAllBookmarks(): Promise<Bookmark[]> {
    return await invoke('get_all_bookmarks');
  },

  async getBookmark(id: number): Promise<Bookmark> {
    return await invoke('get_bookmark', { id });
  },

  async updateBookmark(input: UpdateBookmarkInput): Promise<Bookmark> {
    return await invoke('update_bookmark', { input });
  },

  async deleteBookmark(id: number): Promise<void> {
    return await invoke('delete_bookmark', { id });
  },

  async searchBookmarks(query: string): Promise<Bookmark[]> {
    return await invoke('search_bookmarks', { query });
  },

  async getBookmarksWithReminders(): Promise<Bookmark[]> {
    return await invoke('get_bookmarks_with_reminders');
  },

  async openUrl(url: string): Promise<void> {
    return await invoke('open_url', { url });
  },

  async recordVisit(bookmarkId: number): Promise<void> {
    return await invoke('record_visit', { bookmarkId });
  },

  async markReminderCompleted(bookmarkId: number): Promise<void> {
    return await invoke('mark_reminder_completed', { bookmarkId });
  },

  async snoozeReminder(bookmarkId: number, minutes: number): Promise<void> {
    return await invoke('snooze_reminder', { bookmarkId, minutes });
  },

  async importBookmarks(filePath: string): Promise<number> {
    try {
      const result = await invoke('import_bookmarks', { filePath });
      return result as number;
    } catch (error) {
      throw error;
    }
  },

  async exportBookmarks(filePath: string): Promise<number> {
    try {
      const result = await invoke('export_bookmarks', { filePath });
      return result as number;
    } catch (error) {
      throw error;
    }
  },
};
