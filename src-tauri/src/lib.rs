mod bitaxe;
mod local_node;
mod miner;
mod node;
mod updater;
mod wallet;

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(miner::MinerHandle::default())
        .manage(local_node::LocalNode::default())
        .invoke_handler(tauri::generate_handler![backend_info, bitaxe::bitaxe_request, bitaxe::bitaxe_scan, miner::start_mining, miner::stop_mining, miner::get_telemetry, node::node_rpc, node::node_snapshot, node::pool_snapshot, wallet::wallet_info, wallet::wallet_create, wallet::wallet_import, wallet::wallet_reveal, wallet::wallet_delete, wallet::wallet_descriptors, wallet::wallet_balance, wallet::wallet_send, wallet::wallet_check_address, wallet::wallet_select, wallet::wallet_rename, wallet::wallet_addresses, wallet::wallet_new_address, local_node::local_node_status, local_node::local_node_install, local_node::local_node_start, local_node::local_node_stop, updater::update_check, updater::update_install])
        .build(tauri::generate_context!())
        .expect("error while running Saturn")
        .run(|app, event| {
            // stop the built-in node cleanly when the app quits
            if let tauri::RunEvent::Exit = event {
                local_node::shutdown(app);
            }
        });
}
