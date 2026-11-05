//! Bitaxe (AxeOS) bridge for Saturn's Tauri shell.
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

/// Networks a home Bitaxe is commonly on. Scanned as well as the PC's own networks, because the PC
/// and the Bitaxe are often on different Wi-Fi networks of the same home (a 5 GHz mesh behind the
/// ISP router, a guest network…) that still route to each other.
const COMMON_SUBNETS: [[u8; 3]; 10] = [
    [192, 168, 0], [192, 168, 1], [192, 168, 2], [192, 168, 4], [192, 168, 10],
    [192, 168, 50], [192, 168, 68], [192, 168, 86], [10, 0, 0], [10, 0, 1],
];

/// Adapters that are never the home network (WSL, Hyper-V, VirtualBox, VMware, Docker, VPNs).
fn virtual_adapter(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    ["vethernet", "wsl", "hyper-v", "virtualbox", "vmware", "vmnet", "vboxnet", "docker", "br-", "veth", "tailscale", "zerotier", "wireguard", "wg", "tun", "tap", "vpn", "nordlynx", "utun", "loopback"]
        .iter()
        .any(|v| n.contains(v))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// Bitaxes found, as IP addresses
    found: Vec<String>,
    /// AxeOS hostname for each found device, same order
    names: Vec<String>,
    /// networks that were searched, e.g. "192.168.50.x"
    networks: Vec<String>,
}

async fn probe(http: &reqwest::Client, host: String) -> Option<(String, String)> {
    let info: Value = http.get(format!("http://{host}/api/system/info")).send().await.ok()?.json().await.ok()?;
    // every AxeOS build reports its ASIC model; older/newer ones may use either key
    if info.get("ASICModel").is_some() || info.get("asicModel").is_some() || info.get("axeOSVersion").is_some() {
        let name = info.get("hostname").and_then(|h| h.as_str()).unwrap_or("bitaxe").to_string();
        Some((host, name))
    } else {
        None
    }
}

/// Look for Bitaxes (AxeOS) on every network this PC can reach: all of its real adapters, the
/// common home-router networks around them, and any hostnames passed in (e.g. "miner2").
#[tauri::command]
pub async fn bitaxe_scan(hosts: Option<Vec<String>>) -> Result<ScanResult, String> {
    let mut subnets: Vec<[u8; 3]> = Vec::new();
    let mut add = |s: [u8; 3]| {
        if !subnets.contains(&s) {
            subnets.push(s);
        }
    };
    // the PC's own networks first, real adapters before virtual ones
    let mut adapters: Vec<(String, Ipv4Addr)> = local_ip_address::list_afinet_netifas()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(v4) if v4.is_private() => Some((name, v4)),
            _ => None,
        })
        .collect();
    adapters.sort_by_key(|(name, _)| virtual_adapter(name));
    for (name, ip) in &adapters {
        if !virtual_adapter(name) {
            let [a, b, c, _] = ip.octets();
            add([a, b, c]);
        }
    }
    for s in COMMON_SUBNETS {
        add(s);
    }
    for (name, ip) in &adapters {
        if virtual_adapter(name) {
            let [a, b, c, _] = ip.octets();
            add([a, b, c]);
        }
    }

    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(700))
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|e| e.to_string())?;

    let mut targets: Vec<String> = hosts.unwrap_or_default().into_iter().map(|h| h.trim().to_string()).filter(|h| allowed_host(h)).collect();
    for [a, b, c] in &subnets {
        for d in 1u8..=254 {
            targets.push(format!("{a}.{b}.{c}.{d}"));
        }
    }
    let mut hits: Vec<(String, String)> = stream::iter(targets)
        .map(|host| {
            let http = http.clone();
            async move { probe(&http, host).await }
        })
        .buffer_unordered(192)
        .filter_map(|x| async move { x })
        .collect()
        .await;
    // a device found both by hostname and by IP is listed once, by IP
    let by_ip: Vec<String> = hits.iter().filter(|(h, _)| h.parse::<Ipv4Addr>().is_ok()).map(|(_, n)| n.clone()).collect();
    hits.retain(|(h, n)| h.parse::<Ipv4Addr>().is_ok() || !by_ip.contains(n));
    hits.sort_by_key(|(h, _)| h.parse::<Ipv4Addr>().map(u32::from).unwrap_or(0));
    Ok(ScanResult {
        found: hits.iter().map(|(h, _)| h.clone()).collect(),
        names: hits.into_iter().map(|(_, n)| n).collect(),
        networks: subnets.iter().map(|[a, b, c]| format!("{a}.{b}.{c}.x")).collect(),
    })
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

#[cfg(test)]
mod scan_test {
    /// `cargo test --lib scan_finds -- --ignored` with a fake AxeOS on localhost:18555
    #[tokio::test]
    #[ignore]
    async fn scan_finds_a_named_device() {
        let t = std::time::Instant::now();
        let r = super::bitaxe_scan(Some(vec!["localhost:18555".into()])).await.unwrap();
        println!("{:?} {:?} {:?} in {:?}", r.found, r.names, r.networks, t.elapsed());
        assert_eq!(r.found, vec!["localhost:18555".to_string()]);
        assert_eq!(r.names, vec!["miner2".to_string()]);
    }
}
