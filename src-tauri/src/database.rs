use anyhow::Result;
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};
use crate::models::{Bookmark, CreateBookmarkInput, UpdateBookmarkInput};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn row_to_bookmark(row: &rusqlite::Row) -> rusqlite::Result<Bookmark> {
        let tags_json: String = row.get(4)?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

        let reminder_json: Option<String> = row.get(7)?;
        let reminder = reminder_json.and_then(|json| serde_json::from_str(&json).ok());

        Ok(Bookmark {
            id: Some(row.get(0)?),
            title: row.get(1)?,
            url: row.get(2)?,
            category: row.get(3)?,
            tags,
            icon_url: row.get(5)?,
            notes: row.get(6)?,
            reminder,
            visit_count: row.get(8).unwrap_or(0),
            last_visited: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                category TEXT,
                tags TEXT,
                icon_url TEXT,
                notes TEXT,
                reminder TEXT,
                visit_count INTEGER DEFAULT 0,
                last_visited TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // 添加新字段（如果表已存在）
        let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN visit_count INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN last_visited TEXT", []);

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at)",
            [],
        )?;

        Ok(())
    }

    pub fn create_bookmark(&self, input: CreateBookmarkInput) -> Result<Bookmark> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        let tags_json = serde_json::to_string(&input.tags)?;
        let reminder_json = input.reminder.as_ref().map(|r| serde_json::to_string(r).ok()).flatten();

        conn.execute(
            "INSERT INTO bookmarks (title, url, category, tags, notes, reminder, visit_count, last_visited, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                input.title,
                input.url,
                input.category,
                tags_json,
                input.notes,
                reminder_json,
                0,
                None::<String>,
                now,
                now,
            ],
        )?;

        let id = conn.last_insert_rowid();
        drop(conn); // 释放锁！
        self.get_bookmark(id)
    }

    pub fn get_bookmark(&self, id: i64) -> Result<Bookmark> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, url, category, tags, icon_url, notes, reminder, visit_count, last_visited, created_at, updated_at
             FROM bookmarks WHERE id = ?1"
        )?;

        let bookmark = stmt.query_row(params![id], Self::row_to_bookmark)?;
        Ok(bookmark)
    }

    pub fn get_all_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, url, category, tags, icon_url, notes, reminder, visit_count, last_visited, created_at, updated_at
             FROM bookmarks ORDER BY created_at DESC"
        )?;

        let bookmarks = stmt.query_map([], Self::row_to_bookmark)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(bookmarks)
    }

    pub fn update_bookmark(&self, input: UpdateBookmarkInput) -> Result<Bookmark> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        // 简化：直接更新所有字段
        let tags_json = serde_json::to_string(&input.tags.unwrap_or_default())?;
        let reminder_json = input.reminder.as_ref().map(|r| serde_json::to_string(r).ok()).flatten();

        conn.execute(
            "UPDATE bookmarks SET
                title = COALESCE(?1, title),
                url = COALESCE(?2, url),
                category = ?3,
                tags = ?4,
                notes = ?5,
                reminder = ?6,
                updated_at = ?7
             WHERE id = ?8",
            params![
                input.title,
                input.url,
                input.category,
                tags_json,
                input.notes,
                reminder_json,
                now,
                input.id,
            ],
        )?;

        drop(conn);
        self.get_bookmark(input.id)
    }

    pub fn delete_bookmark(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn search_bookmarks(&self, query: &str) -> Result<Vec<Bookmark>> {
        let conn = self.conn.lock().unwrap();
        let search_pattern = format!("%{}%", query);

        let mut stmt = conn.prepare(
            "SELECT id, title, url, category, tags, icon_url, notes, reminder, visit_count, last_visited, created_at, updated_at
             FROM bookmarks
             WHERE title LIKE ?1 OR url LIKE ?1 OR category LIKE ?1 OR notes LIKE ?1
             ORDER BY created_at DESC"
        )?;

        let bookmarks = stmt.query_map(params![search_pattern], Self::row_to_bookmark)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(bookmarks)
    }

    pub fn get_bookmarks_with_reminders(&self) -> Result<Vec<Bookmark>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, title, url, category, tags, icon_url, notes, reminder, visit_count, last_visited, created_at, updated_at
             FROM bookmarks
             WHERE reminder IS NOT NULL
             ORDER BY created_at DESC"
        )?;

        let bookmarks = stmt.query_map([], Self::row_to_bookmark)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(bookmarks)
    }

    pub fn record_visit(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE bookmarks SET visit_count = visit_count + 1, last_visited = ?1 WHERE id = ?2",
            params![now, id],
        )?;

        Ok(())
    }
}
