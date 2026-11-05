type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

// Tauri 2 injects this global into the webview, so the frontend can call Rust
// commands without bundling @tauri-apps/api in the browser preview build.
export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>) {
  const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals })
    .__TAURI_INTERNALS__
  return (await internals.invoke(cmd, args)) as T
}

/**
 * Rust commands the desktop shell is expected to expose (src-tauri):
 *   backend_info()             -> { miner: boolean, version: string }  (miner=false keeps CPU mining simulated)
 *   start_mining({ config })   -> ()
 *   stop_mining()              -> ()
 *   get_telemetry()            -> Partial<MinerState>
 *   send_to_address({ address, amount }) -> txid string
 *   bitaxe_request({ host, method, path, body }) -> JSON   (AxeOS proxy, LAN hosts only)
 *   bitaxe_scan()              -> string[]  (IPs on the local /24 that answer /api/system/info)
 *   See docs/tauri/bitaxe.rs for a ready-to-use implementation.
 */
export const TAURI_COMMANDS = {
  start: 'start_mining',
  stop: 'stop_mining',
  telemetry: 'get_telemetry',
  send: 'send_to_address',
  backendInfo: 'backend_info',
  bitaxeRequest: 'bitaxe_request',
  bitaxeScan: 'bitaxe_scan',
  nodeRpc: 'node_rpc',
  nodeSnapshot: 'node_snapshot',
  poolSnapshot: 'pool_snapshot',
  walletInfo: 'wallet_info',
  walletCreate: 'wallet_create',
  walletImport: 'wallet_import',
  walletReveal: 'wallet_reveal',
  walletDelete: 'wallet_delete',
  walletDescriptors: 'wallet_descriptors',
  walletBalance: 'wallet_balance',
  walletSend: 'wallet_send',
  walletCheckAddress: 'wallet_check_address',
  walletSelect: 'wallet_select',
  walletRename: 'wallet_rename',
  walletAddresses: 'wallet_addresses',
  walletNewAddress: 'wallet_new_address',
} as const
