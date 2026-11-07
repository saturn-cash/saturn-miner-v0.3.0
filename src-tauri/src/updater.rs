//! Self-update: checks the latest Saturn release on GitHub (latest.json, signed with the Saturn
//! update key) and installs it in place. The wallet, settings and node data live in the app data
//! folder, so an update never touches them.

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Is there a newer Saturn? Returns {available, version, notes, current}.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Value, String> {
    let current = app.package_info().version.to_string();
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(match update {
        Some(u) => json!({ "available": true, "version": u.version, "notes": u.body, "current": current }),
        None => json!({ "available": false, "current": current }),
    })
}

/// Download and install the newer version, then restart into it.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let Some(update) = update else { return Err("Saturn is already up to date".into()) };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    crate::local_node::shutdown(&app);
    app.restart();
}
