mod commands;
mod database;
mod models;
mod reminder;
mod import;

use database::Database;
use reminder::ReminderService;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            let db_path = app_dir.join("bookmarks.db");
            let db = Database::new(db_path.to_str().unwrap())
                .expect("Failed to initialize database");

            // Start reminder service
            let reminder_service = ReminderService::new(db.clone(), app.handle().clone());
            tauri::async_runtime::spawn(async move {
                reminder_service.start().await;
            });

            // Manage database state
            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_bookmark,
            commands::get_all_bookmarks,
            commands::get_bookmark,
            commands::update_bookmark,
            commands::delete_bookmark,
            commands::search_bookmarks,
            commands::get_bookmarks_with_reminders,
            commands::open_url,
            commands::record_visit,
            commands::import_bookmarks,
            commands::export_bookmarks,
            reminder::mark_reminder_completed,
            reminder::snooze_reminder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
