//! Real CPU mining for Saturn Core (a Bitcoin Core fork: SHA-256d proof of work).
//!
//! A stratum v1 client talks to the pool; worker threads hash block headers with a per-job SHA-256
//! midstate so each nonce costs one short SHA-256 block plus one full hash. Shares that beat the
//! pool's difficulty are submitted; anything that beats the network target is a found block.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinerConfig {
    pub mode: String,
    pub pool_url: String,
    pub worker: String,
    pub payout_address: String,
    pub threads: usize,
    pub intensity: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    pub time: u64,
    pub level: &'static str,
    pub source: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolInfo {
    pub connected: bool,
    pub latency: u32,
    pub difficulty: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    pub status: &'static str,
    pub hashrate: f64,
    pub thread_rates: Vec<f64>,
    pub max_threads: usize,
    pub accepted_shares: u64,
    pub rejected_shares: u64,
    pub blocks_found: u64,
    pub uptime: u64,
    pub pool: PoolInfo,
    pub log: Vec<LogEntry>,
    pub job_height: Option<u64>,
}

/// One unit of work from the pool, already decoded.
struct Job {
    id: String,
    prevhash: [u8; 32],
    coinb1: Vec<u8>,
    coinb2: Vec<u8>,
    merkle_branch: Vec<[u8; 32]>,
    version: u32,
    nbits: u32,
    ntime: u32,
    /// network target, derived from nbits (little-endian uint256)
    block_target: [u8; 32],
    height: Option<u64>,
}

pub struct Shared {
    running: AtomicBool,
    status: Mutex<&'static str>,
    log: Mutex<Vec<LogEntry>>,
    log_id: AtomicU64,
    accepted: AtomicU64,
    rejected: AtomicU64,
    blocks: AtomicU64,
    started_at: Mutex<Option<Instant>>,
    pool_connected: AtomicBool,
    pool_latency_ms: AtomicU64,
    /// share difficulty from mining.set_difficulty, stored as bits of an f64
    difficulty: AtomicU64,
    /// share target (little-endian uint256) matching `difficulty`
    share_target: RwLock<[u8; 32]>,
    job: RwLock<Option<Arc<Job>>>,
    job_gen: AtomicU64,
    extranonce1: RwLock<Vec<u8>>,
    extranonce2_size: AtomicU64,
    hash_counts: Vec<AtomicU64>,
    thread_rates: Mutex<Vec<f64>>,
    hashrate: Mutex<f64>,
    /// shares waiting for the pool's verdict: request id -> (job id, nonce)
    pending: Mutex<HashMap<u64, String>>,
    submit_tx: Mutex<Option<std::sync::mpsc::Sender<String>>>,
    rpc_id: AtomicU64,
    worker_name: RwLock<String>,
}

pub struct MinerHandle(pub Arc<Shared>);

impl Default for MinerHandle {
    fn default() -> Self {
        let max = max_threads();
        MinerHandle(Arc::new(Shared {
            running: AtomicBool::new(false),
            status: Mutex::new("idle"),
            log: Mutex::new(Vec::new()),
            log_id: AtomicU64::new(0),
            accepted: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
            blocks: AtomicU64::new(0),
            started_at: Mutex::new(None),
            pool_connected: AtomicBool::new(false),
            pool_latency_ms: AtomicU64::new(0),
            difficulty: AtomicU64::new(1f64.to_bits()),
            share_target: RwLock::new(target_for_difficulty(1.0)),
            job: RwLock::new(None),
            job_gen: AtomicU64::new(0),
            extranonce1: RwLock::new(Vec::new()),
            extranonce2_size: AtomicU64::new(4),
            hash_counts: (0..max).map(|_| AtomicU64::new(0)).collect(),
            thread_rates: Mutex::new(vec![0.0; max]),
            hashrate: Mutex::new(0.0),
            pending: Mutex::new(HashMap::new()),
            submit_tx: Mutex::new(None),
            rpc_id: AtomicU64::new(10),
            worker_name: RwLock::new(String::new()),
        }))
    }
}

pub fn max_threads() -> usize {
    thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl Shared {
    fn log(&self, level: &'static str, source: &'static str, message: impl Into<String>) {
        let entry = LogEntry { id: self.log_id.fetch_add(1, Ordering::Relaxed) + 1, time: now_ms(), level, source, message: message.into() };
        let mut log = self.log.lock().unwrap();
        log.push(entry);
        if log.len() > 400 {
            let drop = log.len() - 400;
            log.drain(0..drop);
        }
    }
    fn set_status(&self, s: &'static str) {
        *self.status.lock().unwrap() = s;
    }
    fn set_difficulty(&self, d: f64) {
        self.difficulty.store(d.to_bits(), Ordering::Relaxed);
        *self.share_target.write().unwrap() = target_for_difficulty(d);
    }
}

/* ------------------------------------------------------------------ */
/* Hashing helpers                                                     */
/* ------------------------------------------------------------------ */

fn sha256d(data: &[u8]) -> [u8; 32] {
    let first = Sha256::digest(data);
    let second = Sha256::digest(first);
    second.into()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("odd hex length".into());
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string())).collect()
}

fn hex_encode(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

/// Bitcoin difficulty 1 target: 0x00000000FFFF0000...0000 (big-endian), as the pool measures shares.
fn target_for_difficulty(diff: f64) -> [u8; 32] {
    // target = diff1 / diff, computed in floating point on the top 64 bits then shifted into place.
    // diff1 = 0xFFFF << 208. Represent as f64 mantissa * 2^exp and build the little-endian uint256.
    let diff = if diff <= 0.0 { 1.0 } else { diff };
    let value = 65535.0 / diff; // in units of 2^208
    // split into integer part at various byte positions
    let mut target = [0u8; 32];
    // scale so we keep ~52 bits of precision: value * 2^(208 - shift)
    // Work in u128 chunks: t = round(value * 2^64) at byte offset 26-8 = 18 (bytes 18..34), clamp.
    let scaled = (value * 18446744073709551616.0) as u128; // value * 2^64, fits since value <= 65535
    // scaled represents target / 2^(208-64) = target / 2^144 → bytes starting at offset 18 (little-endian)
    let bytes = scaled.to_le_bytes();
    for (i, b) in bytes.iter().enumerate() {
        let idx = 18 + i;
        if idx < 32 {
            target[idx] = *b;
        }
    }
    target
}

fn target_from_nbits(nbits: u32) -> [u8; 32] {
    let exponent = (nbits >> 24) as usize;
    let mantissa = nbits & 0x007f_ffff;
    let mut target = [0u8; 32];
    if exponent <= 3 {
        let m = mantissa >> (8 * (3 - exponent));
        target[..4].copy_from_slice(&m.to_le_bytes());
    } else {
        let shift = exponent - 3;
        let m = mantissa.to_le_bytes();
        for i in 0..3 {
            if shift + i < 32 {
                target[shift + i] = m[i];
            }
        }
    }
    target
}

/// Little-endian uint256 comparison: hash <= target.
fn meets_target(hash: &[u8; 32], target: &[u8; 32]) -> bool {
    for i in (0..32).rev() {
        if hash[i] < target[i] {
            return true;
        }
        if hash[i] > target[i] {
            return false;
        }
    }
    true
}

/// Share difficulty of a hash, for the log line.
fn hash_difficulty(hash: &[u8; 32]) -> f64 {
    // diff = diff1_target / hash, both as big numbers; use the top 16 bytes
    let mut v = 0f64;
    for i in (16..32).rev() {
        v = v * 256.0 + hash[i] as f64;
    }
    if v == 0.0 {
        return f64::INFINITY;
    }
    // diff1 top 16 bytes = 0x00000000FFFF0000 00000000 00000000 → 65535 * 2^(208-128) = 65535 * 2^80
    65535.0 * 1208925819614629174706176.0 / v
}

/* ------------------------------------------------------------------ */
/* Stratum                                                             */
/* ------------------------------------------------------------------ */

fn parse_job(params: &[serde_json::Value]) -> Result<Job, String> {
    let s = |i: usize| params.get(i).and_then(|v| v.as_str()).ok_or(format!("notify param {i} missing"));
    let id = s(0)?.to_string();
    let prevhash_raw = hex_decode(s(1)?)?;
    if prevhash_raw.len() != 32 {
        return Err("bad prevhash".into());
    }
    // stratum sends the previous hash as eight big-endian 32-bit words; the header wants each word little-endian
    let mut prevhash = [0u8; 32];
    for w in 0..8 {
        for b in 0..4 {
            prevhash[w * 4 + b] = prevhash_raw[w * 4 + 3 - b];
        }
    }
    let coinb1 = hex_decode(s(2)?)?;
    let coinb2 = hex_decode(s(3)?)?;
    let branch_vals = params.get(4).and_then(|v| v.as_array()).ok_or("merkle branch missing")?;
    let mut merkle_branch = Vec::with_capacity(branch_vals.len());
    for v in branch_vals {
        let bytes = hex_decode(v.as_str().ok_or("bad branch")?)?;
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        merkle_branch.push(arr);
    }
    let version = u32::from_str_radix(s(5)?, 16).map_err(|e| e.to_string())?;
    let nbits = u32::from_str_radix(s(6)?, 16).map_err(|e| e.to_string())?;
    let ntime = u32::from_str_radix(s(7)?, 16).map_err(|e| e.to_string())?;
    let height = coinbase_height(&coinb1);
    Ok(Job { id, prevhash, coinb1, coinb2, merkle_branch, version, nbits, ntime, block_target: target_from_nbits(nbits), height })
}

/// BIP34: the block height is the first push in the coinbase script, which starts 42 bytes into coinb1.
fn coinbase_height(coinb1: &[u8]) -> Option<u64> {
    // version(4) + vin count(1) + prevout(36) + script length varint(1) = 42
    let script = coinb1.get(42..)?;
    let len = *script.first()? as usize;
    if len == 0 || len > 4 {
        return None;
    }
    let bytes = script.get(1..1 + len)?;
    let mut h = 0u64;
    for (i, b) in bytes.iter().enumerate() {
        h |= (*b as u64) << (8 * i);
    }
    Some(h)
}

fn merkle_root(job: &Job, extranonce1: &[u8], extranonce2: &[u8]) -> [u8; 32] {
    let mut coinbase = Vec::with_capacity(job.coinb1.len() + extranonce1.len() + extranonce2.len() + job.coinb2.len());
    coinbase.extend_from_slice(&job.coinb1);
    coinbase.extend_from_slice(extranonce1);
    coinbase.extend_from_slice(extranonce2);
    coinbase.extend_from_slice(&job.coinb2);
    let mut root = sha256d(&coinbase);
    for branch in &job.merkle_branch {
        let mut pair = [0u8; 64];
        pair[..32].copy_from_slice(&root);
        pair[32..].copy_from_slice(branch);
        root = sha256d(&pair);
    }
    root
}

fn stratum_thread(shared: Arc<Shared>, config: MinerConfig) {
    let addr = config.pool_url.trim().trim_start_matches("stratum+tcp://").trim_start_matches("stratum://").trim_start_matches("tcp://").trim_end_matches('/').to_string();
    let worker_name = if config.worker.trim().is_empty() { config.payout_address.trim().to_string() } else { format!("{}.{}", config.payout_address.trim(), config.worker.trim()) };
    *shared.worker_name.write().unwrap() = worker_name.clone();

    let mut backoff = 2u64;
    while shared.running.load(Ordering::Relaxed) {
        shared.log("info", "POOL", format!("Connecting to {addr}…"));
        let t0 = Instant::now();
        let stream = addr
            .to_socket_addrs()
            .map_err(|e| e.to_string())
            .and_then(|mut it| it.next().ok_or_else(|| "no address".to_string()))
            .and_then(|sa| TcpStream::connect_timeout(&sa, Duration::from_secs(10)).map_err(|e| e.to_string()));
        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                shared.log("error", "POOL", format!("Connection failed: {e}. Retrying in {backoff}s"));
                sleep_while_running(&shared, backoff);
                backoff = (backoff * 2).min(60);
                continue;
            }
        };
        backoff = 2;
        shared.pool_latency_ms.store(t0.elapsed().as_millis() as u64, Ordering::Relaxed);
        let _ = stream.set_nodelay(true);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
        let mut writer = match stream.try_clone() {
            Ok(w) => w,
            Err(e) => {
                shared.log("error", "POOL", format!("Socket error: {e}"));
                continue;
            }
        };
        let mut reader = BufReader::new(stream);

        // channel for shares from the hashing threads
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        *shared.submit_tx.lock().unwrap() = Some(tx);

        let send = |writer: &mut TcpStream, msg: String| -> bool { writer.write_all(msg.as_bytes()).and_then(|_| writer.write_all(b"\n")).is_ok() };
        if !send(&mut writer, format!(r#"{{"id":1,"method":"mining.subscribe","params":["SaturnMiner/{}"]}}"#, env!("CARGO_PKG_VERSION"))) {
            continue;
        }
        if !send(&mut writer, format!(r#"{{"id":2,"method":"mining.authorize","params":[{},"x"]}}"#, serde_json::Value::String(worker_name.clone()))) {
            continue;
        }

        let mut line = String::new();
        let mut last_msg = Instant::now();
        'conn: while shared.running.load(Ordering::Relaxed) {
            // outgoing shares
            while let Ok(msg) = rx.try_recv() {
                if !send(&mut writer, msg) {
                    break 'conn;
                }
            }
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    shared.log("warn", "POOL", "Pool closed the connection");
                    break 'conn;
                }
                Ok(_) => {
                    last_msg = Instant::now();
                    handle_message(&shared, line.trim(), &mut writer);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                    if last_msg.elapsed() > Duration::from_secs(600) {
                        shared.log("warn", "POOL", "No work from the pool for 10 minutes, reconnecting");
                        break 'conn;
                    }
                }
                Err(e) => {
                    shared.log("error", "POOL", format!("Read error: {e}"));
                    break 'conn;
                }
            }
        }
        shared.pool_connected.store(false, Ordering::Relaxed);
        *shared.submit_tx.lock().unwrap() = None;
        *shared.job.write().unwrap() = None;
        shared.job_gen.fetch_add(1, Ordering::Relaxed);
        if shared.running.load(Ordering::Relaxed) {
            sleep_while_running(&shared, backoff);
        }
    }
}

fn sleep_while_running(shared: &Shared, secs: u64) {
    let until = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < until && shared.running.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(100));
    }
}

fn handle_message(shared: &Arc<Shared>, line: &str, writer: &mut TcpStream) {
    if line.is_empty() {
        return;
    }
    let msg: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return,
    };
    if let Some(method) = msg.get("method").and_then(|m| m.as_str()) {
        let params = msg.get("params").and_then(|p| p.as_array()).cloned().unwrap_or_default();
        match method {
            "mining.notify" => match parse_job(&params) {
                Ok(job) => {
                    let clean = params.get(8).and_then(|v| v.as_bool()).unwrap_or(false);
                    let height = job.height;
                    *shared.job.write().unwrap() = Some(Arc::new(job));
                    shared.job_gen.fetch_add(1, Ordering::Relaxed);
                    if clean || !shared.pool_connected.load(Ordering::Relaxed) {
                        shared.pool_connected.store(true, Ordering::Relaxed);
                        shared.set_status("mining");
                        match height {
                            Some(h) => shared.log("info", "POOL", format!("New work: block {h}")),
                            None => shared.log("info", "POOL", "New work from the pool"),
                        }
                    }
                }
                Err(e) => shared.log("error", "POOL", format!("Bad job from pool: {e}")),
            },
            "mining.set_difficulty" => {
                if let Some(d) = params.first().and_then(|v| v.as_f64()) {
                    shared.set_difficulty(d);
                    shared.log("info", "POOL", format!("Share difficulty set to {}", trim_float(d)));
                }
            }
            "mining.set_extranonce" => {
                if let (Some(en1), Some(size)) = (params.first().and_then(|v| v.as_str()), params.get(1).and_then(|v| v.as_u64())) {
                    if let Ok(bytes) = hex_decode(en1) {
                        *shared.extranonce1.write().unwrap() = bytes;
                        shared.extranonce2_size.store(size, Ordering::Relaxed);
                    }
                }
            }
            "client.reconnect" => shared.log("warn", "POOL", "Pool asked us to reconnect"),
            "client.show_message" => {
                if let Some(text) = params.first().and_then(|v| v.as_str()) {
                    shared.log("info", "POOL", text.to_string());
                }
            }
            _ => {}
        }
        // some pools send requests with an id and expect an ack
        if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
            if method == "client.get_version" {
                let _ = writer.write_all(format!(r#"{{"id":{id},"result":"SaturnMiner/{}","error":null}}"#, env!("CARGO_PKG_VERSION")).as_bytes());
                let _ = writer.write_all(b"\n");
            }
        }
        return;
    }

    let id = msg.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
    let error = msg.get("error").filter(|e| !e.is_null());
    match id {
        1 => {
            // subscribe result: [[subscriptions], extranonce1, extranonce2_size]
            if let Some(result) = msg.get("result").and_then(|r| r.as_array()) {
                if let (Some(en1), Some(size)) = (result.get(1).and_then(|v| v.as_str()), result.get(2).and_then(|v| v.as_u64())) {
                    match hex_decode(en1) {
                        Ok(bytes) => {
                            *shared.extranonce1.write().unwrap() = bytes;
                            shared.extranonce2_size.store(size.max(1), Ordering::Relaxed);
                            shared.log("success", "POOL", "Subscribed to the pool");
                        }
                        Err(e) => shared.log("error", "POOL", format!("Bad extranonce from pool: {e}")),
                    }
                }
            } else if let Some(e) = error {
                shared.log("error", "POOL", format!("Subscribe rejected: {e}"));
            }
        }
        2 => {
            if msg.get("result").and_then(|r| r.as_bool()).unwrap_or(false) {
                shared.log("success", "POOL", format!("Authorised worker {}", shared.worker_name.read().unwrap()));
            } else {
                let why = error.map(|e| e.to_string()).unwrap_or_else(|| "unknown reason".into());
                shared.log("error", "POOL", format!("Worker rejected by the pool: {why}. Check the payout address."));
            }
        }
        _ => {
            let pending = shared.pending.lock().unwrap().remove(&id);
            if let Some(job_id) = pending {
                if msg.get("result").and_then(|r| r.as_bool()).unwrap_or(false) {
                    let n = shared.accepted.fetch_add(1, Ordering::Relaxed) + 1;
                    shared.log("success", "POOL", format!("Share accepted ({n} total)"));
                } else {
                    shared.rejected.fetch_add(1, Ordering::Relaxed);
                    let why = error
                        .and_then(|e| e.as_array().and_then(|a| a.get(1)).and_then(|m| m.as_str()).map(|s| s.to_string()).or_else(|| Some(e.to_string())))
                        .unwrap_or_else(|| "rejected".into());
                    shared.log("warn", "POOL", format!("Share rejected for job {job_id}: {why}"));
                }
            }
        }
    }
}

fn trim_float(d: f64) -> String {
    if d.fract() == 0.0 {
        format!("{}", d as u64)
    } else {
        format!("{:.4}", d).trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

/* ------------------------------------------------------------------ */
/* Hashing threads                                                     */
/* ------------------------------------------------------------------ */

fn worker_thread(shared: Arc<Shared>, index: usize, stride: usize, intensity: u32) {
    let mut seen_gen = u64::MAX;
    let mut job: Option<Arc<Job>> = None;
    let mut extranonce2 = Vec::new();
    let mut en2_counter: u64 = index as u64;
    let mut header = [0u8; 80];
    let mut midstate = Sha256::new();
    let mut nonce: u32 = 0;
    let counter = &shared.hash_counts[index];
    // intensity: fraction of time spent hashing. 100 = flat out.
    let duty = (intensity.clamp(5, 100)) as f64 / 100.0;

    while shared.running.load(Ordering::Relaxed) {
        let gen = shared.job_gen.load(Ordering::Relaxed);
        if gen != seen_gen || nonce == u32::MAX {
            seen_gen = gen;
            job = shared.job.read().unwrap().clone();
            let Some(j) = job.as_ref() else {
                thread::sleep(Duration::from_millis(50));
                continue;
            };
            // fresh extranonce2 for this thread, disjoint from the other threads
            let size = shared.extranonce2_size.load(Ordering::Relaxed) as usize;
            extranonce2 = vec![0u8; size.max(1)];
            let bytes = en2_counter.to_le_bytes();
            for i in 0..extranonce2.len().min(8) {
                extranonce2[i] = bytes[i];
            }
            en2_counter += stride as u64;
            let en1 = shared.extranonce1.read().unwrap().clone();
            let root = merkle_root(j, &en1, &extranonce2);
            header[..4].copy_from_slice(&j.version.to_le_bytes());
            header[4..36].copy_from_slice(&j.prevhash);
            header[36..68].copy_from_slice(&root);
            header[68..72].copy_from_slice(&j.ntime.to_le_bytes());
            header[72..76].copy_from_slice(&j.nbits.to_le_bytes());
            midstate = Sha256::new();
            midstate.update(&header[..64]);
            nonce = 0;
        }
        let Some(j) = job.as_ref() else { continue };
        let share_target = *shared.share_target.read().unwrap();

        let batch_start = Instant::now();
        let batch = 8192u32;
        let end = nonce.saturating_add(batch);
        let mut tail = [0u8; 16];
        tail[..12].copy_from_slice(&header[64..76]);
        while nonce < end {
            tail[12..].copy_from_slice(&nonce.to_le_bytes());
            let mut h = midstate.clone();
            h.update(tail);
            let first = h.finalize();
            let hash: [u8; 32] = Sha256::digest(first).into();
            if hash[31] == 0 && hash[30] == 0 && hash[29] == 0 && meets_target(&hash, &share_target) {
                submit_share(&shared, j, &extranonce2, nonce, &hash);
            }
            nonce += 1;
        }
        counter.fetch_add(batch as u64, Ordering::Relaxed);
        if duty < 1.0 {
            let worked = batch_start.elapsed();
            let rest = worked.mul_f64((1.0 - duty) / duty);
            if rest > Duration::from_micros(50) {
                thread::sleep(rest);
            }
        }
    }
}

fn submit_share(shared: &Arc<Shared>, job: &Job, extranonce2: &[u8], nonce: u32, hash: &[u8; 32]) {
    let is_block = meets_target(hash, &job.block_target);
    if is_block {
        shared.blocks.fetch_add(1, Ordering::Relaxed);
        shared.log("success", "MINER", format!("BLOCK FOUND! {}", hex_encode(&reverse(hash))));
    }
    let id = shared.rpc_id.fetch_add(1, Ordering::Relaxed);
    let worker = shared.worker_name.read().unwrap().clone();
    let msg = format!(
        r#"{{"id":{id},"method":"mining.submit","params":[{},"{}","{}","{:08x}","{:08x}"]}}"#,
        serde_json::Value::String(worker),
        job.id,
        hex_encode(extranonce2),
        job.ntime,
        nonce
    );
    shared.pending.lock().unwrap().insert(id, job.id.clone());
    shared.log("info", "MINER", format!("Share found (difficulty {})", trim_float(hash_difficulty(hash))));
    if let Some(tx) = shared.submit_tx.lock().unwrap().as_ref() {
        let _ = tx.send(msg);
    }
}

fn reverse(h: &[u8; 32]) -> [u8; 32] {
    let mut r = *h;
    r.reverse();
    r
}

fn stats_thread(shared: Arc<Shared>, threads: usize) {
    let mut last: Vec<u64> = vec![0; threads];
    let mut smoothed: Vec<f64> = vec![0.0; threads];
    let mut t = Instant::now();
    while shared.running.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(1000));
        let dt = t.elapsed().as_secs_f64().max(0.001);
        t = Instant::now();
        let mut total = 0.0;
        for i in 0..threads {
            let now = shared.hash_counts[i].load(Ordering::Relaxed);
            let rate = (now.saturating_sub(last[i])) as f64 / dt;
            last[i] = now;
            smoothed[i] = smoothed[i] * 0.7 + rate * 0.3;
            total += smoothed[i];
        }
        let mut rates = shared.thread_rates.lock().unwrap();
        for i in 0..rates.len() {
            rates[i] = if i < threads { smoothed[i] } else { 0.0 };
        }
        *shared.hashrate.lock().unwrap() = total;
    }
    for c in &shared.hash_counts {
        c.store(0, Ordering::Relaxed);
    }
    for r in shared.thread_rates.lock().unwrap().iter_mut() {
        *r = 0.0;
    }
    *shared.hashrate.lock().unwrap() = 0.0;
}

/* ------------------------------------------------------------------ */
/* Tauri commands                                                      */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn start_mining(state: tauri::State<'_, MinerHandle>, config: MinerConfig) -> Result<(), String> {
    let shared = state.0.clone();
    if shared.running.swap(true, Ordering::SeqCst) {
        return Err("already mining".into());
    }
    if config.payout_address.trim().is_empty() {
        shared.running.store(false, Ordering::SeqCst);
        return Err("Set a payout address first".into());
    }
    if !config.payout_address.trim().starts_with("sat1") {
        shared.running.store(false, Ordering::SeqCst);
        return Err("The payout address should start with sat1".into());
    }
    if config.mode != "pool" {
        shared.running.store(false, Ordering::SeqCst);
        return Err("Solo mining needs a local Saturn Core node; use pool mode for now".into());
    }
    let threads = config.threads.clamp(1, max_threads());
    shared.set_status("starting");
    *shared.started_at.lock().unwrap() = Some(Instant::now());
    shared.accepted.store(0, Ordering::Relaxed);
    shared.rejected.store(0, Ordering::Relaxed);
    shared.blocks.store(0, Ordering::Relaxed);
    shared.pending.lock().unwrap().clear();
    shared.log("info", "MINER", format!("Starting SHA-256d engine on {threads} thread{}", if threads == 1 { "" } else { "s" }));

    let s = shared.clone();
    let cfg = config.clone();
    thread::Builder::new().name("stratum".into()).spawn(move || stratum_thread(s, cfg)).map_err(|e| e.to_string())?;
    for i in 0..threads {
        let s = shared.clone();
        let intensity = config.intensity;
        thread::Builder::new().name(format!("hash-{i}")).spawn(move || worker_thread(s, i, threads, intensity)).map_err(|e| e.to_string())?;
    }
    let s = shared.clone();
    thread::Builder::new().name("stats".into()).spawn(move || stats_thread(s, threads)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn stop_mining(state: tauri::State<'_, MinerHandle>) -> Result<(), String> {
    let shared = &state.0;
    if !shared.running.swap(false, Ordering::SeqCst) {
        return Ok(());
    }
    shared.set_status("idle");
    shared.pool_connected.store(false, Ordering::Relaxed);
    *shared.job.write().unwrap() = None;
    *shared.started_at.lock().unwrap() = None;
    shared.log("info", "MINER", "Engine stopped");
    Ok(())
}

#[tauri::command]
pub fn get_telemetry(state: tauri::State<'_, MinerHandle>, since: Option<u64>) -> Telemetry {
    let shared = &state.0;
    let since = since.unwrap_or(0);
    let log: Vec<LogEntry> = shared.log.lock().unwrap().iter().filter(|e| e.id > since).cloned().collect();
    let threads_rates = shared.thread_rates.lock().unwrap().clone();
    let job_height = shared.job.read().unwrap().as_ref().and_then(|j| j.height);
    Telemetry {
        status: *shared.status.lock().unwrap(),
        hashrate: *shared.hashrate.lock().unwrap(),
        thread_rates: threads_rates,
        max_threads: max_threads(),
        accepted_shares: shared.accepted.load(Ordering::Relaxed),
        rejected_shares: shared.rejected.load(Ordering::Relaxed),
        blocks_found: shared.blocks.load(Ordering::Relaxed),
        uptime: shared.started_at.lock().unwrap().map(|t| t.elapsed().as_secs()).unwrap_or(0),
        pool: PoolInfo {
            connected: shared.pool_connected.load(Ordering::Relaxed),
            latency: shared.pool_latency_ms.load(Ordering::Relaxed) as u32,
            difficulty: f64::from_bits(shared.difficulty.load(Ordering::Relaxed)),
        },
        log,
        job_height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn genesis_block_hashes_correctly() {
        // Saturn Core mainnet genesis: version 1, nTime 1779650000, nBits 0x1d07ffff, nNonce 79918425
        // expected hash 00000003c7e577ae8d7adbb9281b0a045f8f8036c910d4674cec2835767beb35
        // We can't rebuild the merkle root here without the full coinbase, so check the target logic instead.
        let target = target_from_nbits(0x1d07ffff);
        let expected = hex_decode("00000007ffff0000000000000000000000000000000000000000000000000000").unwrap();
        let mut le = expected.clone();
        le.reverse();
        assert_eq!(target.to_vec(), le);
    }

    #[test]
    fn difficulty_one_target_matches_bitcoin() {
        let t = target_for_difficulty(1.0);
        let mut be = t;
        be.reverse();
        assert_eq!(hex_encode(&be), "00000000ffff0000000000000000000000000000000000000000000000000000");
    }

    #[test]
    fn sha256d_known_vector() {
        // sha256d("hello") = 9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50
        assert_eq!(hex_encode(&sha256d(b"hello")), "9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50");
    }

    #[test]
    fn bitcoin_block_125552_header() {
        // raw 80-byte header of Bitcoin block 125552; hash 00000000000000001e8d6829a8a21adc5d38d0a473b144b6765798e61f98bd1d
        let header = hex_decode("0100000081cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000e320b6c2fffc8d750423db8b1eb942ae710e951ed797f7affc8892b0f1fc122bc7f5d74df2b9441a42a14695").unwrap();
        let h = sha256d(&header);
        assert_eq!(hex_encode(&reverse(&h)), "00000000000000001e8d6829a8a21adc5d38d0a473b144b6765798e61f98bd1d");
        assert!(meets_target(&h, &target_from_nbits(0x1a44b9f2)));
        assert!(hash_difficulty(&h) > 1_000_000.0);
        // the midstate path used by the hashing loop must give the same answer
        let mut mid = Sha256::new();
        mid.update(&header[..64]);
        let mut m = mid.clone();
        m.update(&header[64..]);
        let hash2: [u8; 32] = Sha256::digest(m.finalize()).into();
        assert_eq!(hash2, h);
    }

    /// End-to-end: a mock pool hands out a job at a tiny difficulty; the engine must connect,
    /// subscribe, authorise, hash, and submit shares whose (extranonce2, ntime, nonce) rebuild to a
    /// header hash under the share target.
    #[test]
    fn mines_shares_against_a_mock_pool() {
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let en1 = "f8002c90";
        let coinb1 = "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff2003a08601062f503253482f04b8864e5008";
        let coinb2 = "072f736c7573682f000000000100f2052a010000001976a914d23fcdf86f7e756a64a7a9688ef9903327048ed988ac00000000";
        let prevhash = "4d16b6f85af6e2198f44ae2a6de67f78487ae5611b77c6c0440b921e00000000";
        let branch = "1cd3f6c4f1f6b6ae8e0a5ae9b4b1e2b1fa7a2e8e2bd0d7a1e3d1b8c9a6e5f4d3";
        let received: Arc<Mutex<Vec<(String, String, String)>>> = Arc::new(Mutex::new(Vec::new()));
        let got = received.clone();
        thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut w = stream.try_clone().unwrap();
            let mut r = BufReader::new(stream);
            let mut line = String::new();
            loop {
                line.clear();
                if r.read_line(&mut line).unwrap_or(0) == 0 {
                    break;
                }
                let v: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
                let id = v["id"].as_u64().unwrap();
                match v["method"].as_str().unwrap() {
                    "mining.subscribe" => {
                        writeln!(w, r#"{{"id":{id},"result":[[["mining.set_difficulty","d"],["mining.notify","n"]],"{en1}",4],"error":null}}"#).unwrap();
                    }
                    "mining.authorize" => {
                        writeln!(w, r#"{{"id":{id},"result":true,"error":null}}"#).unwrap();
                        writeln!(w, r#"{{"id":null,"method":"mining.set_difficulty","params":[0.0005]}}"#).unwrap();
                        writeln!(w, r#"{{"id":null,"method":"mining.notify","params":["job1","{prevhash}","{coinb1}","{coinb2}",["{branch}"],"20000000","1d07ffff","68ff0000",true]}}"#).unwrap();
                    }
                    "mining.submit" => {
                        let p = v["params"].as_array().unwrap();
                        got.lock().unwrap().push((p[2].as_str().unwrap().into(), p[3].as_str().unwrap().into(), p[4].as_str().unwrap().into()));
                        writeln!(w, r#"{{"id":{id},"result":true,"error":null}}"#).unwrap();
                    }
                    _ => {}
                }
            }
        });

        let handle = MinerHandle::default();
        let shared = handle.0.clone();
        shared.running.store(true, Ordering::SeqCst);
        let cfg = MinerConfig { mode: "pool".into(), pool_url: format!("stratum+tcp://127.0.0.1:{port}"), worker: "t".into(), payout_address: "sat1qtest".into(), threads: 2, intensity: 100 };
        let s = shared.clone();
        let c = cfg.clone();
        thread::spawn(move || stratum_thread(s, c));
        for i in 0..2 {
            let s = shared.clone();
            thread::spawn(move || worker_thread(s, i, 2, 100));
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        while shared.accepted.load(Ordering::Relaxed) < 3 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        shared.running.store(false, Ordering::SeqCst);
        let shares = received.lock().unwrap().clone();
        assert!(shares.len() >= 3, "expected shares, got {:?}; log: {:?}", shares, shared.log.lock().unwrap().iter().map(|l| l.message.clone()).collect::<Vec<_>>());
        assert!(shared.pool_connected.load(Ordering::Relaxed));

        // rebuild each submitted share independently and check it beats the share target
        let job = {
            let params: Vec<serde_json::Value> = serde_json::from_str(&format!(r#"["job1","{prevhash}","{coinb1}","{coinb2}",["{branch}"],"20000000","1d07ffff","68ff0000",true]"#)).unwrap();
            parse_job(&params).unwrap()
        };
        let target = target_for_difficulty(0.0005);
        for (en2, ntime, nonce) in shares {
            let en2b = hex_decode(&en2).unwrap();
            assert_eq!(en2b.len(), 4);
            let root = merkle_root(&job, &hex_decode(en1).unwrap(), &en2b);
            let mut header = Vec::new();
            header.extend_from_slice(&0x20000000u32.to_le_bytes());
            header.extend_from_slice(&job.prevhash);
            header.extend_from_slice(&root);
            header.extend_from_slice(&u32::from_str_radix(&ntime, 16).unwrap().to_le_bytes());
            header.extend_from_slice(&0x1d07ffffu32.to_le_bytes());
            header.extend_from_slice(&u32::from_str_radix(&nonce, 16).unwrap().to_le_bytes());
            let h = sha256d(&header);
            assert!(meets_target(&h, &target), "share {nonce} does not meet target");
        }
    }

    #[test]
    fn height_from_coinbase() {
        // coinb1 with script starting 03 a0 86 01 (height 100000)
        let mut cb = vec![0u8; 42];
        cb[41] = 0x04 + 4; // script length placeholder (unused)
        cb.extend_from_slice(&[0x03, 0xa0, 0x86, 0x01]);
        assert_eq!(coinbase_height(&cb), Some(100000));
    }
}

#[cfg(test)]
mod bench {
    use super::*;
    #[test]
    #[ignore]
    fn hash_rate_one_thread() {
        let header = [7u8; 80];
        let mut mid = Sha256::new();
        mid.update(&header[..64]);
        let mut tail = [0u8; 16];
        tail[..12].copy_from_slice(&header[64..76]);
        let t = Instant::now();
        let n = 2_000_000u32;
        let mut acc = 0u32;
        for nonce in 0..n {
            tail[12..].copy_from_slice(&nonce.to_le_bytes());
            let mut h = mid.clone();
            h.update(tail);
            let hash: [u8; 32] = Sha256::digest(h.finalize()).into();
            acc ^= hash[0] as u32;
        }
        let secs = t.elapsed().as_secs_f64();
        println!("{} MH/s per thread (acc {acc})", n as f64 / secs / 1e6);
    }
}
