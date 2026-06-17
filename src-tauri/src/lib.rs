mod commands;
mod macos_permissions;
mod overlay_window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![commands::save_settings, commands::load_settings, commands::save_session, commands::export_session, commands::export_text, commands::save_diagnostic, commands::open_microphone_privacy_settings, macos_permissions::microphone_permission_status, macos_permissions::request_native_microphone_permission, overlay_window::set_overlay_click_through])
    .setup(|app| {
      if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.set_ignore_cursor_events(true)?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running LiveTranslate Overlay");
}
