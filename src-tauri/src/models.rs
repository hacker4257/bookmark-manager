use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: Option<i64>,
    pub title: String,
    pub url: String,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub icon_url: Option<String>,
    pub notes: Option<String>,
    pub reminder: Option<Reminder>,
    pub visit_count: i64,
    pub last_visited: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub enabled: bool,
    pub frequency: ReminderFrequency,
    pub time: String, // HH:MM format
    pub days: Vec<u8>, // 0-6 for Sunday-Saturday
    pub last_reminded: Option<String>,
    pub next_reminder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ReminderFrequency {
    Daily,
    Weekly,
    #[serde(rename = "custom")]
    Custom { interval_days: u32 },
    Once,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateBookmarkInput {
    pub title: String,
    pub url: String,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub notes: Option<String>,
    pub reminder: Option<Reminder>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateBookmarkInput {
    pub id: i64,
    pub title: Option<String>,
    pub url: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub reminder: Option<Reminder>,
}
