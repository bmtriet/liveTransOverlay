#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::runtime::Bool;
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

#[tauri::command]
pub fn microphone_permission_status() -> String {
  #[cfg(target_os = "macos")]
  {
    let audio = unsafe { AVMediaTypeAudio.expect("AVFoundation did not expose AVMediaTypeAudio") };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) };
    return match status {
      AVAuthorizationStatus::Authorized => "granted",
      AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => "denied",
      _ => "unknown",
    }.into();
  }

  #[cfg(not(target_os = "macos"))]
  "unknown".into()
}

#[tauri::command]
pub async fn request_native_microphone_permission() -> Result<bool, String> {
  #[cfg(target_os = "macos")]
  {
    return tauri::async_runtime::spawn_blocking(|| {
      let audio = unsafe { AVMediaTypeAudio.expect("AVFoundation did not expose AVMediaTypeAudio") };
      let current = unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) };
      if current == AVAuthorizationStatus::Authorized { return Ok(true); }
      if current == AVAuthorizationStatus::Denied || current == AVAuthorizationStatus::Restricted { return Ok(false); }

      let (sender, receiver) = std::sync::mpsc::sync_channel(1);
      let handler = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
      });
      unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler) };
      receiver.recv_timeout(std::time::Duration::from_secs(120)).map_err(|_| "Timed out waiting for the macOS microphone permission dialog.".to_string())
    }).await.map_err(|error| error.to_string())?;
  }

  #[cfg(not(target_os = "macos"))]
  Ok(true)
}
