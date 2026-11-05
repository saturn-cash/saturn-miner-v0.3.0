//! A full Saturn Core node run by the app on this computer.
//!
//! The app downloads the official saturnd build for this platform from the saturn-core GitHub
//! release, checks it against the release's SHA256SUMS (and the hash pinned below when there is
//! one), unpacks it into the app's data folder and runs it with Saturn's standard data directory,
//! so the node's cookie file is where `node.rs` already looks and the rest of the app (network,
//! peers, blocks) talks to it like any other local node. The node is stopped cleanly (RPC `stop`)
//! when the user turns it off or quits the app.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

pub const CORE_VERSION: &str = "32.1-saturn2";
const CORE_TAG: &str = "core-v32.1-saturn2";
const RELEASE_BASE: &str = "https://github.com/saturn-cash/saturn-core/releases/download";
/// Saturn's main network ports. The node listens for peers on P2P_PORT and answers the app on RPC_PORT.
pub const RPC_PORT: u16 = 9998;
const SEED_NODE: &str = "pool.saturn.boats:9999";

/// Hashes of the release archives, so a tampered download is refused even if SHA256SUMS were
/// replaced too. Empty means "trust SHA256SUMS from the same release" (for builds made before the
/// archives existed).
const PINNED: &[(&str, &str)] = &[
    ("saturn-core-32.1-saturn2-arm64-apple-darwin.tar.gz", "94af68e5dcc0846a49160647eeec1e0c9659472aeb36a29b4925885e67ef02d6"),
    ("saturn-core-32.1-saturn2-win64.zip", "864f0fbd60e233cee3b007698fbfe43062e0f80fba086959cfa9d02ff31d4411"),
    ("saturn-core-32.1-saturn2-x86_64-apple-darwin.tar.gz", "2fefecfce37758778f3fdaf9547aea579302a75b7c1d355d5ce7f821a719bb11"),
    ("saturn-core-32.1-saturn2-x86_64-linux-gnu.tar.gz", "699850ca344d12cdc474ea52615bbf62cfa7c4b646ce06fabaf36369be781289"),
];

fn asset_name() -> Option<String> {
    let suffix = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "win64.zip"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "arm64-apple-darwin.tar.gz"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin.tar.gz"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-linux-gnu.tar.gz"
    } else {
        return None;
    };
    Some(format!("saturn-core-{CORE_VERSION}-{suffix}"))
}

const EXE: &str = if cfg!(windows) { ".exe" } else { "" };

#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub received: u64,
    pub total: u64,
}

#[derive(Default)]
pub struct LocalNode {
    child: Mutex<Option<Child>>,
    download: Mutex<Option<Download>>,
    last_error: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNodeStatus {
    /// false on platforms without a prebuilt node
    pub supported: bool,
    pub installed: bool,
    pub version: String,
    /// started by this app and still running
    pub running: bool,
    /// some Saturn node (ours or one the user runs) answers on 127.0.0.1:9998
    pub rpc_reachable: bool,
    pub pid: Option<u32>,
    pub datadir: String,
    pub binary: String,
    pub downloading: Option<Download>,
    pub error: Option<String>,
    pub rpc_url: String,
}

fn install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("saturn-core").join(CORE_VERSION))
}

fn binary_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(install_dir(app)?.join(format!("{name}{EXE}")))
}

/// Saturn's standard data directory (the first one node.rs looks in for the cookie file).
pub fn datadir() -> Result<PathBuf, String> {
    crate::node::default_datadirs().into_iter().next().ok_or_else(|| "Can't find a home folder for the node's data".to_string())
}

fn rpc_port_open() -> bool {
    std::net::TcpStream::connect_timeout(&([127, 0, 0, 1], RPC_PORT).into(), Duration::from_millis(250)).is_ok()
}

/// Is the child we started still alive? Clears it once it has exited.
fn child_running(node: &LocalNode) -> (bool, Option<u32>) {
    let mut guard = node.child.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => return (true, Some(child.id())),
            Ok(Some(status)) => {
                if !status.success() {
                    *node.last_error.lock().unwrap() = Some(exit_reason(status.code()));
                }
                *guard = None;
            }
            Err(_) => *guard = None,
        }
    }
    (false, None)
}

fn exit_reason(code: Option<i32>) -> String {
    let tail = datadir().ok().and_then(|d| debug_log_error(&d.join("debug.log")));
    match tail {
        Some(line) => format!("Saturn Core stopped: {line}"),
        None => format!("Saturn Core stopped unexpectedly (exit code {})", code.map(|c| c.to_string()).unwrap_or_else(|| "unknown".into())),
    }
}

/// The last error line saturnd wrote before exiting, if any.
fn debug_log_error(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let start = text.len().saturating_sub(64 * 1024);
    let tail = &text[text.char_indices().map(|(i, _)| i).find(|&i| i >= start).unwrap_or(0)..];
    tail.lines()
        .rev()
        .find(|l| l.contains("Error") || l.contains("error:") || l.contains("Cannot obtain a lock"))
        .map(|l| l.splitn(2, ' ').nth(1).unwrap_or(l).trim().to_string())
}

#[tauri::command]
pub fn local_node_status(app: AppHandle, node: State<'_, LocalNode>) -> LocalNodeStatus {
    let (running, pid) = child_running(&node);
    let binary = binary_path(&app, "saturnd").ok();
    LocalNodeStatus {
        supported: asset_name().is_some(),
        installed: binary.as_ref().map(|b| b.is_file()).unwrap_or(false),
        version: CORE_VERSION.into(),
        running,
        rpc_reachable: rpc_port_open(),
        pid,
        datadir: datadir().map(|d| d.display().to_string()).unwrap_or_default(),
        binary: binary.map(|b| b.display().to_string()).unwrap_or_default(),
        downloading: node.download.lock().unwrap().clone(),
        error: node.last_error.lock().unwrap().clone(),
        rpc_url: format!("http://127.0.0.1:{RPC_PORT}"),
    }
}

/// Download, verify and unpack saturnd + saturn-cli. Progress shows up in `local_node_status`.
#[tauri::command]
pub async fn local_node_install(app: AppHandle, node: State<'_, LocalNode>) -> Result<(), String> {
    if node.download.lock().unwrap().is_some() {
        return Err("Saturn Core is already downloading".into());
    }
    *node.download.lock().unwrap() = Some(Download::default());
    *node.last_error.lock().unwrap() = None;
    let result = install(&app, &node).await;
    *node.download.lock().unwrap() = None;
    if let Err(e) = &result {
        *node.last_error.lock().unwrap() = Some(e.clone());
    }
    result
}

async fn install(app: &AppHandle, node: &LocalNode) -> Result<(), String> {
    let asset = asset_name().ok_or("There's no Saturn Core build for this computer yet")?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("Saturn/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // the expected hash: pinned in the app, else from the release's SHA256SUMS
    let sums_url = format!("{RELEASE_BASE}/{CORE_TAG}/SHA256SUMS");
    let sums = client.get(&sums_url).send().await.and_then(|r| r.error_for_status()).map_err(|e| format!("Couldn't reach the Saturn Core release: {e}"))?.text().await.map_err(|e| e.to_string())?;
    let listed = sums
        .lines()
        .filter_map(|l| l.split_once(char::is_whitespace))
        .find(|(_, name)| name.trim().trim_start_matches('*') == asset)
        .map(|(h, _)| h.trim().to_lowercase())
        .ok_or_else(|| format!("{asset} isn't listed in the release's SHA256SUMS"))?;
    if let Some((_, pinned)) = PINNED.iter().find(|(n, _)| *n == asset) {
        if *pinned != listed {
            return Err("The release's SHA256SUMS doesn't match the hash built into this app. Not installing.".into());
        }
    }

    let url = format!("{RELEASE_BASE}/{CORE_TAG}/{asset}");
    let mut resp = client.get(&url).send().await.and_then(|r| r.error_for_status()).map_err(|e| format!("Download failed: {e}"))?;
    let total = resp.content_length().unwrap_or(0);
    let mut data: Vec<u8> = Vec::with_capacity(total as usize);
    let mut hasher = Sha256::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        hasher.update(&chunk);
        data.extend_from_slice(&chunk);
        *node.download.lock().unwrap() = Some(Download { received: data.len() as u64, total });
    }
    let got = format!("{:x}", hasher.finalize());
    if got != listed {
        return Err(format!("The download doesn't match its published SHA-256 (expected {listed}, got {got}). Not installing."));
    }

    let dir = install_dir(app)?;
    let staging = dir.with_extension("partial");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    unpack(&asset, &data, &staging)?;
    for name in ["saturnd", "saturn-cli"] {
        let p = staging.join(format!("{name}{EXE}"));
        if !p.is_file() {
            return Err(format!("The download is missing {name}{EXE}"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        }
    }
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&staging, &dir).map_err(|e| format!("Couldn't install Saturn Core: {e}"))?;
    Ok(())
}

/// Only the two executables are taken out of the archive, by file name, so nothing in it can
/// write anywhere else.
fn unpack(asset: &str, data: &[u8], to: &Path) -> Result<(), String> {
    let wanted = |name: &str| -> Option<String> {
        let file = name.rsplit(['/', '\\']).next()?;
        [format!("saturnd{EXE}"), format!("saturn-cli{EXE}")].into_iter().find(|w| w.as_str() == file)
    };
    if asset.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| format!("Bad archive: {e}"))?;
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
            if let Some(name) = wanted(f.name()) {
                let mut out = std::fs::File::create(to.join(name)).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
            }
        }
    } else {
        let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(data));
        for entry in tar.entries().map_err(|e| format!("Bad archive: {e}"))? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            if !entry.header().entry_type().is_file() {
                continue;
            }
            let path = entry.path().map_err(|e| e.to_string())?.to_string_lossy().to_string();
            if let Some(name) = wanted(&path) {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                std::fs::write(to.join(name), buf).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn local_node_start(app: AppHandle, node: State<'_, LocalNode>) -> Result<(), String> {
    if child_running(&node).0 {
        return Ok(());
    }
    if rpc_port_open() {
        return Err("A Saturn Core node is already running on this computer. The app uses it as is.".into());
    }
    let bin = binary_path(&app, "saturnd")?;
    if !bin.is_file() {
        return Err("Saturn Core isn't installed yet".into());
    }
    let dir = datadir()?;
    *node.last_error.lock().unwrap() = None;
    match tauri::async_runtime::spawn_blocking(move || spawn_node(&bin, &dir)).await.map_err(|e| e.to_string())? {
        Ok(child) => {
            *node.child.lock().unwrap() = Some(child);
            Ok(())
        }
        Err(msg) => {
            *node.last_error.lock().unwrap() = Some(msg.clone());
            Err(msg)
        }
    }
}

/// Start saturnd on Saturn's main network with `dir` as its data directory. Returns once it has
/// survived start-up (a bad data directory, or a lock held by another node, makes it exit at once).
fn spawn_node(bin: &Path, dir: &Path) -> Result<Child, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    // anything saturnd prints outside debug.log (start-up errors) goes here
    let console = dir.join("saturn-app-console.log");
    let out = std::fs::File::create(&console).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(bin);
    cmd.arg(format!("-datadir={}", dir.display()))
        .arg("-server=1")
        .arg("-listen=1")
        .arg(format!("-addnode={SEED_NODE}"))
        .arg("-dnsseed=0")
        .arg(format!("-rpcport={RPC_PORT}"))
        .arg("-rpcbind=127.0.0.1")
        .arg("-rpcallowip=127.0.0.1")
        .arg("-printtoconsole=0")
        .stdin(Stdio::null())
        .stdout(out.try_clone().map_err(|e| e.to_string())?)
        .stderr(out);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start Saturn Core: {e}"))?;
    let started = Instant::now();
    while started.elapsed() < Duration::from_millis(2500) {
        if let Ok(Some(status)) = child.try_wait() {
            let printed = std::fs::read_to_string(&console).unwrap_or_default();
            let line = printed.lines().find(|l| !l.trim().is_empty()).map(|l| l.trim().trim_start_matches("Error:").trim().to_string());
            return Err(match line {
                Some(e) => format!("Saturn Core stopped: {e}"),
                None => exit_reason(status.code()),
            });
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(child)
}

#[tauri::command]
pub async fn local_node_stop(node: State<'_, LocalNode>) -> Result<(), String> {
    let child = node.child.lock().unwrap().take();
    if let Some(child) = child {
        tauri::async_runtime::spawn_blocking(move || stop_child(child)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ask the node to shut down cleanly over RPC, wait for it, and only kill it as a last resort.
fn stop_child(mut child: Child) {
    let _ = datadir().and_then(|d| rpc_stop(&d));
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(60) {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// A plain HTTP POST of `stop`, so it works while the app is quitting (no async runtime needed).
fn rpc_stop(dir: &Path) -> Result<(), String> {
    use base64::Engine;
    let cookie = std::fs::read_to_string(dir.join(".cookie")).map_err(|e| e.to_string())?;
    let auth = base64::engine::general_purpose::STANDARD.encode(cookie.trim());
    let body = r#"{"jsonrpc":"1.0","id":"saturn","method":"stop","params":[]}"#;
    let mut s = std::net::TcpStream::connect_timeout(&([127, 0, 0, 1], RPC_PORT).into(), Duration::from_secs(2)).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(5))).ok();
    write!(
        s,
        "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Basic {auth}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .map_err(|e| e.to_string())?;
    let mut reply = String::new();
    let _ = s.read_to_string(&mut reply);
    Ok(())
}

/// Called when the app quits: stop the node we started, if any.
pub fn shutdown(app: &AppHandle) {
    if let Some(node) = app.try_state::<LocalNode>() {
        let child = node.child.lock().unwrap().take();
        if let Some(child) = child {
            stop_child(child);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_for_this_platform() {
        let a = asset_name();
        if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
            assert_eq!(a.as_deref(), Some("saturn-core-32.1-saturn2-x86_64-linux-gnu.tar.gz"));
        }
    }

    #[test]
    fn unpacks_only_the_two_binaries() {
        // a tarball with saturnd, saturn-cli, and a file that tries to escape
        let mut tarball = Vec::new();
        {
            let gz = flate2::write::GzEncoder::new(&mut tarball, flate2::Compression::fast());
            let mut b = tar::Builder::new(gz);
            for (name, body) in [("saturnd", &b"daemon"[..]), ("saturn-cli", b"cli"), ("evil.sh", b"rm -rf")] {
                let mut h = tar::Header::new_gnu();
                h.set_size(body.len() as u64);
                h.set_mode(0o644);
                h.set_cksum();
                b.append_data(&mut h, name, body).unwrap();
            }
            b.into_inner().unwrap().finish().unwrap();
        }
        let dir = std::env::temp_dir().join(format!("saturn-unpack-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        unpack("x.tar.gz", &tarball, &dir).unwrap();
        if !cfg!(windows) {
            assert_eq!(std::fs::read(dir.join("saturnd")).unwrap(), b"daemon");
            assert_eq!(std::fs::read(dir.join("saturn-cli")).unwrap(), b"cli");
        }
        assert!(!dir.join("evil.sh").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Runs a real saturnd: SATURND=/path/to/saturnd cargo test --lib local_node -- --ignored
    #[test]
    #[ignore]
    fn starts_and_stops_a_real_node() {
        let bin = PathBuf::from(std::env::var("SATURND").expect("set SATURND"));
        let dir = std::env::temp_dir().join(format!("saturn-node-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut child = spawn_node(&bin, &dir).expect("node starts");
        // the RPC server comes up and writes its cookie
        let t = Instant::now();
        while !(rpc_port_open() && dir.join(".cookie").exists()) {
            assert!(t.elapsed() < Duration::from_secs(60), "RPC never came up");
            std::thread::sleep(Duration::from_millis(200));
        }
        // a second node on the same data directory is refused with a readable reason
        let err = spawn_node(&bin, &dir).unwrap_err();
        println!("second start: {err}");
        assert!(err.to_lowercase().contains("lock") || err.contains("already"), "{err}");
        // clean RPC stop
        rpc_stop(&dir).unwrap();
        let t = Instant::now();
        loop {
            if let Ok(Some(status)) = child.try_wait() {
                assert!(status.success(), "{status:?}");
                break;
            }
            assert!(t.elapsed() < Duration::from_secs(60), "node didn't stop");
            std::thread::sleep(Duration::from_millis(200));
        }
        let log = std::fs::read_to_string(dir.join("debug.log")).unwrap();
        assert!(log.contains("Shutdown: done") || log.contains("Shutdown done"), "no clean shutdown in debug.log:\n{}", &log[log.len().saturating_sub(1500)..]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Unpacks a real release archive: CORE_ARCHIVE=/path/to/saturn-core-…tar.gz cargo test --lib local_node -- --ignored
    #[test]
    #[ignore]
    fn unpacks_a_release_archive() {
        let path = PathBuf::from(std::env::var("CORE_ARCHIVE").expect("set CORE_ARCHIVE"));
        let data = std::fs::read(&path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let got = format!("{:x}", Sha256::digest(&data));
        assert_eq!(PINNED.iter().find(|(n, _)| *n == name).map(|(_, h)| *h), Some(got.as_str()), "pinned hash");
        let dir = std::env::temp_dir().join(format!("saturn-release-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        unpack(&name, &data, &dir).unwrap();
        assert!(dir.join(format!("saturnd{EXE}")).is_file());
        assert!(dir.join(format!("saturn-cli{EXE}")).is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_error_in_debug_log() {
        let p = std::env::temp_dir().join(format!("saturn-debuglog-{}", std::process::id()));
        std::fs::write(&p, "2026-11-05T00:00:00Z Saturn Core version v32.1\n2026-11-05T00:00:01Z Error: Cannot obtain a lock on data directory /x. Saturn Core is probably already running.\n2026-11-05T00:00:01Z Shutdown: done\n").unwrap();
        assert_eq!(debug_log_error(&p).unwrap(), "Error: Cannot obtain a lock on data directory /x. Saturn Core is probably already running.");
        let _ = std::fs::remove_file(&p);
    }
}
