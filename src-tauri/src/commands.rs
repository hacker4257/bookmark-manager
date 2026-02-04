use crate::database::Database;
use crate::models::{Bookmark, CreateBookmarkInput, UpdateBookmarkInput};
use crate::import::{parse_html_bookmarks};
use tauri::State;
use std::fs;

#[tauri::command]
pub async fn create_bookmark(
    db: State<'_, Database>,
    input: CreateBookmarkInput,
) -> Result<Bookmark, String> {
    match db.create_bookmark(input) {
        Ok(bookmark) => Ok(bookmark),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
pub async fn get_all_bookmarks(db: State<'_, Database>) -> Result<Vec<Bookmark>, String> {
    db.get_all_bookmarks().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_bookmark(db: State<'_, Database>, id: i64) -> Result<Bookmark, String> {
    db.get_bookmark(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_bookmark(
    db: State<'_, Database>,
    input: UpdateBookmarkInput,
) -> Result<Bookmark, String> {
    match db.update_bookmark(input) {
        Ok(bookmark) => Ok(bookmark),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
pub async fn delete_bookmark(db: State<'_, Database>, id: i64) -> Result<(), String> {
    db.delete_bookmark(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_bookmarks(
    db: State<'_, Database>,
    query: String,
) -> Result<Vec<Bookmark>, String> {
    db.search_bookmarks(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_bookmarks_with_reminders(
    db: State<'_, Database>,
) -> Result<Vec<Bookmark>, String> {
    db.get_bookmarks_with_reminders()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    opener::open(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn record_visit(
    db: State<'_, Database>,
    bookmark_id: i64,
) -> Result<(), String> {
    db.record_visit(bookmark_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_bookmarks(
    db: State<'_, Database>,
    file_path: String,
) -> Result<usize, String> {
    let imported = parse_html_bookmarks(&file_path).map_err(|e| e.to_string())?;

    let mut count = 0;
    for bookmark in imported {
        let input = CreateBookmarkInput {
            title: bookmark.title,
            url: bookmark.url,
            category: bookmark.folder,
            tags: vec![],
            notes: None,
            reminder: None,
        };

        if db.create_bookmark(input).is_ok() {
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn export_bookmarks(
    db: State<'_, Database>,
    file_path: String,
) -> Result<usize, String> {
    let bookmarks = db.get_all_bookmarks().map_err(|e| e.to_string())?;

    let mut html = String::from(
        r#"<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
"#
    );

    // 按分类分组
    let mut categories: std::collections::HashMap<String, Vec<&Bookmark>> = std::collections::HashMap::new();
    let mut uncategorized: Vec<&Bookmark> = Vec::new();

    for bookmark in &bookmarks {
        if let Some(category) = &bookmark.category {
            categories.entry(category.clone()).or_insert_with(Vec::new).push(bookmark);
        } else {
            uncategorized.push(bookmark);
        }
    }

    // 导出分类书签
    for (category, bookmarks) in categories.iter() {
        html.push_str(&format!("    <DT><H3>{}</H3>\n", category));
        html.push_str("    <DL><p>\n");
        for bookmark in bookmarks {
            let tags = if !bookmark.tags.is_empty() {
                format!(" TAGS=\"{}\"", bookmark.tags.join(","))
            } else {
                String::new()
            };
            html.push_str(&format!(
                "        <DT><A HREF=\"{}\"{}>{}</A>\n",
                bookmark.url, tags, bookmark.title
            ));
        }
        html.push_str("    </DL><p>\n");
    }

    // 导出未分类书签
    if !uncategorized.is_empty() {
        html.push_str("    <DT><H3>未分类</H3>\n");
        html.push_str("    <DL><p>\n");
        for bookmark in uncategorized {
            let tags = if !bookmark.tags.is_empty() {
                format!(" TAGS=\"{}\"", bookmark.tags.join(","))
            } else {
                String::new()
            };
            html.push_str(&format!(
                "        <DT><A HREF=\"{}\"{}>{}</A>\n",
                bookmark.url, tags, bookmark.title
            ));
        }
        html.push_str("    </DL><p>\n");
    }

    html.push_str("</DL><p>\n");

    fs::write(&file_path, html).map_err(|e| e.to_string())?;

    Ok(bookmarks.len())
}
