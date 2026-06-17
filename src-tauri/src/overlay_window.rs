use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
  let window = app.get_webview_window("overlay").ok_or("overlay window not found")?;
  window.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())
}
