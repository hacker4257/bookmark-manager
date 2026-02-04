use crate::database::Database;
use crate::models::{Bookmark, ReminderFrequency};
use chrono::{Datelike, DateTime, Duration, Local, NaiveTime, Utc};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{interval, Duration as TokioDuration};

pub struct ReminderService {
    db: Database,
    app_handle: AppHandle,
}

impl ReminderService {
    pub fn new(db: Database, app_handle: AppHandle) -> Self {
        Self { db, app_handle }
    }

    pub async fn start(&self) {
        let db = self.db.clone();
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            let mut interval = interval(TokioDuration::from_secs(60));

            loop {
                interval.tick().await;

                if let Ok(bookmarks) = db.get_bookmarks_with_reminders() {
                    for bookmark in bookmarks {
                        if let Some(reminder) = &bookmark.reminder {
                            if reminder.enabled && Self::should_remind(&bookmark) {
                                Self::send_notification(&app_handle, &bookmark);
                            }
                        }
                    }
                }
            }
        });
    }

    fn should_remind(bookmark: &Bookmark) -> bool {
        let reminder = match &bookmark.reminder {
            Some(r) => r,
            None => return false,
        };

        let now = Local::now();
        let current_time = now.time();
        let current_weekday = now.weekday().num_days_from_sunday() as u8;

        let reminder_time = match NaiveTime::parse_from_str(&reminder.time, "%H:%M") {
            Ok(t) => t,
            Err(_) => return false,
        };

        let time_diff = if current_time >= reminder_time {
            current_time - reminder_time
        } else {
            return false;
        };

        if time_diff.num_minutes() > 1 {
            return false;
        }

        if let Some(last_reminded) = &reminder.last_reminded {
            if let Ok(last_time) = DateTime::parse_from_rfc3339(last_reminded) {
                let last_local = last_time.with_timezone(&Local);
                if last_local.date_naive() == now.date_naive() {
                    return false;
                }
            }
        }

        match &reminder.frequency {
            ReminderFrequency::Daily => true,
            ReminderFrequency::Weekly => reminder.days.contains(&current_weekday),
            ReminderFrequency::Custom { interval_days } => {
                if let Some(last_reminded) = &reminder.last_reminded {
                    if let Ok(last_time) = DateTime::parse_from_rfc3339(last_reminded) {
                        let days_since = (now - last_time.with_timezone(&Local)).num_days();
                        return days_since >= *interval_days as i64;
                    }
                }
                true
            }
            ReminderFrequency::Once => reminder.last_reminded.is_none(),
        }
    }

    fn send_notification(app_handle: &AppHandle, bookmark: &Bookmark) {
        let title = "签到提醒";
        let body = format!("该去 {} 签到了！", bookmark.title);

        let _ = app_handle.notification()
            .builder()
            .title(title)
            .body(&body)
            .show();

        let _ = app_handle.emit("reminder-triggered", bookmark);
    }
}

#[tauri::command]
pub async fn mark_reminder_completed(
    db: tauri::State<'_, Database>,
    bookmark_id: i64,
) -> Result<(), String> {
    let bookmark = db.get_bookmark(bookmark_id).map_err(|e| e.to_string())?;

    if let Some(mut reminder) = bookmark.reminder {
        reminder.last_reminded = Some(Utc::now().to_rfc3339());

        let update_input = crate::models::UpdateBookmarkInput {
            id: bookmark_id,
            title: None,
            url: None,
            category: None,
            tags: None,
            notes: None,
            reminder: Some(reminder),
        };

        db.update_bookmark(update_input)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn snooze_reminder(
    db: tauri::State<'_, Database>,
    bookmark_id: i64,
    minutes: i64,
) -> Result<(), String> {
    let bookmark = db.get_bookmark(bookmark_id).map_err(|e| e.to_string())?;

    if let Some(mut reminder) = bookmark.reminder {
        let snooze_until = Utc::now() + Duration::minutes(minutes);
        reminder.next_reminder = Some(snooze_until.to_rfc3339());

        let update_input = crate::models::UpdateBookmarkInput {
            id: bookmark_id,
            title: None,
            url: None,
            category: None,
            tags: None,
            notes: None,
            reminder: Some(reminder),
        };

        db.update_bookmark(update_input)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
