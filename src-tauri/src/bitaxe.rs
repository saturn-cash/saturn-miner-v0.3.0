//! Bitaxe (AxeOS) bridge for Saturn Miner's Tauri shell.
//!
//! The webview can't call plain-http LAN devices directly (mixed content, and AxeOS rejects
//! requests whose Origin isn't a private address), so the frontend proxies through these commands.
//!
//! Cargo.toml:
//!   reqwest = { version = "0.12", default-features = false, features = ["json"] }
//!   serde_json = "1"
//!   futures = "0.3"
//!   local-ip-address = "0.6"
//!
//! main.rs / lib.rs:
//!   mod bitaxe;
//!   tauri::Builder::default()
//!       .invoke_handler(tauri::generate_handler![bitaxe::bitaxe_request, bitaxe::bitaxe_scan, /* ... */])

use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;

use futures::stream::{self, StreamExt};
use serde_json::Value;

/// Only talk to things on the local network: private/link-local IPv4, `*.local`, or a bare hostname.
fn allowed_host(host: &str) -> bool {
    let name = host.split(':').next().unwrap_or("");
    if name.is_empty() {
        return false;
    }
    if let Ok(ip) = name.parse::<Ipv4Addr>() {
        return ip.is_private() || ip.is_link_local();
    }
    let valid_chars = name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    valid_chars && (name.ends_with(".local") || !name.contains('.'))
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(timeout).build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bitaxe_request(host: String, method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    if !allowed_host(&host) {
        return Err("Only devices on your local network can be controlled".into());
    }
    if !path.starts_with("/api/") || path.contains("..") {
        return Err("Invalid AxeOS path".into());
    }
    let method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        other => return Err(format!("Unsupported method {other}")),
    };
    let mut req = client(Duration::from_secs(5))?.request(method, format!("http://{host}{path}"));
    if let Some(body) = body.filter(|b| !b.is_null()) {
        req = req.json(&body);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{} {}", status.as_u16(), text.trim()));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
}

/// Probe every address on this machine's /24 for an AxeOS info endpoint.
#[tauri::command]
pub async fn bitaxe_scan() -> Result<Vec<String>, String> {
    let ip = match local_ip_address::local_ip().map_err(|e| e.to_string())? {
        IpAddr::V4(ip) if ip.is_private() => ip,
        _ => return Err("No private IPv4 network found".into()),
    };
    let [a, b, c, _] = ip.octets();
    let http = client(Duration::from_millis(900))?;
    let found: Vec<String> = stream::iter(1u8..=254)
        .map(|d| {
            let http = http.clone();
            async move {
                let host = format!("{a}.{b}.{c}.{d}");
                let info: Value = http.get(format!("http://{host}/api/system/info")).send().await.ok()?.json().await.ok()?;
                info.get("ASICModel").map(|_| host)
            }
        })
        .buffer_unordered(64)
        .filter_map(|x| async move { x })
        .collect()
        .await;
    let mut found = found;
    found.sort_by_key(|h| h.rsplit('.').next().and_then(|n| n.parse::<u8>().ok()).unwrap_or(0));
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::allowed_host;

    #[test]
    fn hosts() {
        assert!(allowed_host("192.168.1.42"));
        assert!(allowed_host("10.0.0.5:80"));
        assert!(allowed_host("bitaxe.local"));
        assert!(allowed_host("bitaxe"));
        assert!(!allowed_host("8.8.8.8"));
        assert!(!allowed_host("example.com"));
        assert!(!allowed_host(""));
    }
}
