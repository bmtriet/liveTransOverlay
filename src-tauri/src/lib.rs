mod commands;
mod macos_permissions;
mod overlay_window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_settings,
            commands::load_settings,
            commands::save_session,
            commands::export_session,
            commands::export_text,
            commands::save_diagnostic,
            commands::host_platform,
            commands::open_microphone_privacy_settings,
            macos_permissions::microphone_permission_status,
            macos_permissions::request_native_microphone_permission,
            overlay_window::set_overlay_click_through
        ])
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            if let Some(main) = _app.get_webview_window("main") {
                main.with_webview(|webview| {
                    use webkit2gtk::{
                        glib::prelude::*, DeviceInfoPermissionRequest, PermissionRequestExt,
                        UserMediaPermissionRequest, WebViewExt,
                    };

                    webview.inner().connect_permission_request(|_, request| {
                        if request.is::<UserMediaPermissionRequest>()
                            || request.is::<DeviceInfoPermissionRequest>()
                        {
                            request.allow();
                            return true;
                        }
                        false
                    });
                })?;
            }

            #[cfg(not(target_os = "linux"))]
            if let Some(overlay) = _app.get_webview_window("overlay") {
                overlay.set_ignore_cursor_events(true)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LiveTranslate Overlay");
}
