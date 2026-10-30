//! Saturn Core node connection over JSON-RPC (the same API as Bitcoin Core).
//!
//! Auth comes from explicit rpcuser/rpcpassword settings, or from the node's `.cookie` file in the
//! default data directory when the node runs on the same machine.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeAuth {
    pub url: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub address: String,
    pub latency: u32,
    pub version: String,
    pub height: u64,
    pub inbound: bool,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BlockSummary {
    pub height: u64,
    pub hash: String,
    pub time: u64,
    pub tx_count: u64,
    pub size: u64,
    pub mined_by_you: bool,
    pub reward: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub amount: f64,
    pub confirmations: i64,
    pub time: u64,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeSnapshot {
    pub connected: bool,
    pub error: Option<String>,
    pub version: String,
    pub height: u64,
    pub headers: u64,
    pub difficulty: f64,
    pub network_hashrate: f64,
    pub mempool: u64,
    pub synced: bool,
    pub progress: f64,
    pub peers: Vec<Peer>,
    pub blocks: Vec<BlockSummary>,
    pub has_wallet: bool,
    pub balance: f64,
    pub immature: f64,
    pub transactions: Vec<Transaction>,
}

fn default_datadirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(p) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(p).join("Saturn"));
        }
        if let Ok(p) = std::env::var("APPDATA") {
            dirs.push(PathBuf::from(p).join("Saturn"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(h) = std::env::var("HOME") {
            dirs.push(PathBuf::from(h).join("Library/Application Support/Saturn"));
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(h) = std::env::var("HOME") {
            dirs.push(PathBuf::from(h).join(".saturn"));
        }
    }
    dirs
}

/// (user, password) for the RPC call: explicit settings first, then the node's cookie file.
fn resolve_auth(auth: &NodeAuth) -> Option<(String, String)> {
    if !auth.user.is_empty() {
        return Some((auth.user.clone(), auth.password.clone()));
    }
    for dir in default_datadirs() {
        if let Ok(cookie) = std::fs::read_to_string(dir.join(".cookie")) {
            if let Some((u, p)) = cookie.trim().split_once(':') {
                return Some((u.to_string(), p.to_string()));
            }
        }
    }
    None
}

async fn call(client: &reqwest::Client, auth: &NodeAuth, creds: &Option<(String, String)>, method: &str, params: Value) -> Result<Value, String> {
    let mut req = client.post(&auth.url).json(&json!({ "jsonrpc": "1.0", "id": "saturn-miner", "method": method, "params": params }));
    if let Some((u, p)) = creds {
        req = req.basic_auth(u, Some(p));
    }
    let resp = req.send().await.map_err(|e| {
        if e.is_connect() {
            "Can't reach the node. Is Saturn Core running with server=1?".to_string()
        } else {
            e.to_string()
        }
    })?;
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("The node refused the RPC login. Set rpcuser/rpcpassword in Settings, or run the node on this computer so the cookie file can be used.".into());
    }
    let body: Value = resp.json().await.map_err(|e| format!("Bad reply from node ({status}): {e}"))?;
    if let Some(err) = body.get("error").filter(|e| !e.is_null()) {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("RPC error").to_string();
        return Err(msg);
    }
    Ok(body.get("result").cloned().unwrap_or(Value::Null))
}

fn f(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(|x| x.as_f64()).unwrap_or(0.0)
}
fn u(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(0)
}
fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// Any JSON-RPC call, for the few places the UI needs something specific (e.g. a fresh address).
#[tauri::command]
pub async fn node_rpc(auth: NodeAuth, method: String, params: Option<Value>) -> Result<Value, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(8)).build().map_err(|e| e.to_string())?;
    let creds = resolve_auth(&auth);
    call(&client, &auth, &creds, &method, params.unwrap_or_else(|| json!([]))).await
}

/// Everything the Wallet and Network screens show, in one round of calls.
#[tauri::command]
pub async fn node_snapshot(auth: NodeAuth, payout_address: Option<String>) -> NodeSnapshot {
    let mut snap = NodeSnapshot::default();
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(8)).build() {
        Ok(c) => c,
        Err(e) => {
            snap.error = Some(e.to_string());
            return snap;
        }
    };
    let creds = resolve_auth(&auth);
    let chain = match call(&client, &auth, &creds, "getblockchaininfo", json!([])).await {
        Ok(v) => v,
        Err(e) => {
            snap.error = Some(e);
            return snap;
        }
    };
    snap.connected = true;
    snap.height = u(&chain, "blocks");
    snap.headers = u(&chain, "headers");
    snap.difficulty = f(&chain, "difficulty");
    snap.progress = f(&chain, "verificationprogress");
    snap.synced = !chain.get("initialblockdownload").and_then(|x| x.as_bool()).unwrap_or(true) && snap.progress > 0.999;

    if let Ok(net) = call(&client, &auth, &creds, "getnetworkinfo", json!([])).await {
        snap.version = s(&net, "subversion");
    }
    if let Ok(mining) = call(&client, &auth, &creds, "getmininginfo", json!([])).await {
        snap.network_hashrate = f(&mining, "networkhashps");
    }
    if let Ok(mp) = call(&client, &auth, &creds, "getmempoolinfo", json!([])).await {
        snap.mempool = u(&mp, "size");
    }
    if let Ok(peers) = call(&client, &auth, &creds, "getpeerinfo", json!([])).await {
        if let Some(list) = peers.as_array() {
            snap.peers = list
                .iter()
                .map(|p| Peer {
                    id: u(p, "id").to_string(),
                    address: s(p, "addr"),
                    latency: (f(p, "pingtime") * 1000.0).round() as u32,
                    version: s(p, "subver"),
                    height: p.get("synced_blocks").and_then(|x| x.as_i64()).unwrap_or(0).max(0) as u64,
                    inbound: p.get("inbound").and_then(|x| x.as_bool()).unwrap_or(false),
                    location: s(p, "network"),
                })
                .collect();
        }
    }

    // the last few blocks, newest first
    let mine = payout_address.unwrap_or_default();
    let tip = snap.height;
    for h in (tip.saturating_sub(7)..=tip).rev() {
        if tip == 0 {
            break;
        }
        let Ok(hash) = call(&client, &auth, &creds, "getblockhash", json!([h])).await else { break };
        let Some(hash) = hash.as_str().map(|x| x.to_string()) else { break };
        let Ok(block) = call(&client, &auth, &creds, "getblock", json!([hash, 2])).await else { break };
        let txs = block.get("tx").and_then(|t| t.as_array());
        let mut reward = 0.0;
        let mut mined_by_you = false;
        if let Some(cb) = txs.and_then(|t| t.first()) {
            if let Some(outs) = cb.get("vout").and_then(|v| v.as_array()) {
                for o in outs {
                    reward += f(o, "value");
                    let addr = o.get("scriptPubKey").and_then(|sp| sp.get("address")).and_then(|a| a.as_str()).unwrap_or("");
                    if !mine.is_empty() && addr == mine {
                        mined_by_you = true;
                    }
                }
            }
        }
        snap.blocks.push(BlockSummary {
            height: h,
            hash: s(&block, "hash"),
            time: u(&block, "time") * 1000,
            tx_count: txs.map(|t| t.len() as u64).unwrap_or(u(&block, "nTx")),
            size: u(&block, "size"),
            mined_by_you,
            reward,
        });
    }

    // wallet, if the node has one loaded
    if let Ok(bal) = call(&client, &auth, &creds, "getbalances", json!([])).await {
        snap.has_wallet = true;
        if let Some(m) = bal.get("mine") {
            snap.balance = f(m, "trusted");
            snap.immature = f(m, "immature") + f(m, "untrusted_pending");
        }
        if let Ok(txs) = call(&client, &auth, &creds, "listtransactions", json!(["*", 25])).await {
            if let Some(list) = txs.as_array() {
                snap.transactions = list
                    .iter()
                    .rev()
                    .map(|t| {
                        let cat = s(t, "category");
                        let kind = match cat.as_str() {
                            "generate" | "immature" | "orphan" => "reward",
                            "send" => "send",
                            _ => "receive",
                        };
                        Transaction {
                            id: s(t, "txid"),
                            kind: kind.into(),
                            amount: f(t, "amount"),
                            confirmations: t.get("confirmations").and_then(|x| x.as_i64()).unwrap_or(0),
                            time: u(t, "time") * 1000,
                            address: s(t, "address"),
                        }
                    })
                    .collect();
            }
        }
    }
    snap
}
