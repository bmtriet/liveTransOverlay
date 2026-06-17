use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn open_microphone_privacy_settings() -> Result<(), String> {
  #[cfg(target_os = "macos")]
  let mut command = std::process::Command::new("open");
  #[cfg(target_os = "macos")]
  command.arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");

  #[cfg(target_os = "windows")]
  let mut command = {
    let mut value = std::process::Command::new("cmd");
    value.args(["/C", "start", "ms-settings:privacy-microphone"]);
    value
  };

  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  return Err("Open your system privacy settings and allow microphone access for LiveTranslate Overlay.".into());

  #[cfg(any(target_os = "macos", target_os = "windows"))]
  command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&path).map_err(|e| e.to_string())?;
  Ok(path)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
  let path = data_dir(&app)?.join("settings.json");
  fs::write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Option<Value>, String> {
  let path = data_dir(&app)?.join("settings.json");
  if !path.exists() { return Ok(None); }
  let bytes = fs::read(path).map_err(|e| e.to_string())?;
  serde_json::from_slice(&bytes).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_session(app: AppHandle, session: Value) -> Result<String, String> {
  let sessions = data_dir(&app)?.join("sessions");
  fs::create_dir_all(&sessions).map_err(|e| e.to_string())?;
  let id = session.get("id").and_then(Value::as_str).unwrap_or("session");
  let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S");
  let path = sessions.join(format!("{}-{}.json", stamp, id));
  fs::write(&path, serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn export_session(path: String, session: Value) -> Result<String, String> {
  fs::write(&path, serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  Ok(path)
}

#[tauri::command]
pub fn export_text(path: String, content: String) -> Result<String, String> {
  fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
  Ok(path)
}

#[tauri::command]
pub fn save_diagnostic(app: AppHandle, entry: Value) -> Result<String, String> {
  let logs = data_dir(&app)?.join("logs");
  fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
  let path = logs.join("latest-error.json");
  fs::write(&path, serde_json::to_vec_pretty(&entry).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}
