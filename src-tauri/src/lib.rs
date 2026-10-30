mod bitaxe;
mod miner;
mod node;

use serde_json::{json, Value};

/// What this build of the desktop shell can do. The frontend keeps CPU mining simulated
/// until a native mining engine is added here and `miner` is set to true.
#[tauri::command]
fn backend_info() -> Value {
    json!({ "miner": true, "maxThreads": miner::max_threads(), "version": env!("CARGO_PKG_VERSION") })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(miner::MinerHandle::default())
        .invoke_handler(tauri::generate_handler![backend_info, bitaxe::bitaxe_request, bitaxe::bitaxe_scan, miner::start_mining, miner::stop_mining, miner::get_telemetry, node::node_rpc, node::node_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running Saturn Miner");
}
