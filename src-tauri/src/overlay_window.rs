use tauri::AppHandle;
#[cfg(not(target_os = "linux"))]
use tauri::Manager;

#[tauri::command]
pub fn set_overlay_click_through(_app: AppHandle, _enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let window = _app
            .get_webview_window("overlay")
            .ok_or("overlay window not found")?;
        window
            .set_ignore_cursor_events(_enabled)
            .map_err(|e| e.to_string())
    }
}
