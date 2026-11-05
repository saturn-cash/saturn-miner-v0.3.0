//! Solo mining on your own Saturn Core node: no pool at all.
//!
//! The work comes from the node's `getblocktemplate`. This thread builds the coinbase itself (BIP34
//! height, the whole reward to the payout address, the segwit commitment when it's active), hands
//! the hashing threads a job in the same shape a pool's would have, and when a thread finds a hash
//! below the network target it assembles the full block and `submitblock`s it straight to the node.
//! The node then relays it to the network like any other block.

use super::*;

/// What the node gave us for the current job, kept to assemble a block when one is found.
struct Template {
    job: Arc<Job>,
    /// raw transactions after the coinbase, in template order
    txs: Vec<Vec<u8>>,
    witness: bool,
    height: u64,
    reward_sats: u64,
}

const EXTRANONCE_SIZE: u64 = 8;
const TAG: &[u8] = b"/Saturn app solo/";

pub(super) fn node_thread(shared: Arc<Shared>, config: MinerConfig) {
    let url = if config.rpc_url.trim().is_empty() { "http://127.0.0.1:9998".to_string() } else { config.rpc_url.trim().to_string() };
    let auth = crate::node::NodeAuth { url: url.clone(), user: config.rpc_user.clone(), password: config.rpc_password.clone() };
    *shared.worker_name.write().unwrap() = config.payout_address.trim().to_string();
    // no extranonce1 from a pool: the 8-byte extranonce is all ours
    *shared.extranonce1.write().unwrap() = Vec::new();
    shared.extranonce2_size.store(EXTRANONCE_SIZE, Ordering::Relaxed);

    let rpc = |method: &str, params: serde_json::Value| -> Result<serde_json::Value, String> {
        let creds = crate::node::resolve_auth(&auth);
        call(&url, creds.as_ref(), method, params)
    };

    shared.log("info", "NODE", format!("Solo on your own node: getting work from Saturn Core at {url}"));
    let script = loop {
        if !shared.running.load(Ordering::Relaxed) {
            return;
        }
        match rpc("validateaddress", serde_json::json!([config.payout_address.trim()])) {
            Ok(v) if v.get("isvalid").and_then(|b| b.as_bool()) == Some(true) => match v.get("scriptPubKey").and_then(|s| s.as_str()).map(hex_decode) {
                Some(Ok(s)) => break s,
                _ => {
                    shared.log("error", "NODE", "The node didn't return a script for the payout address");
                    return stop(&shared);
                }
            },
            Ok(_) => {
                shared.log("error", "NODE", "The payout address isn't a valid Saturn address");
                return stop(&shared);
            }
            Err(e) => {
                shared.log("warn", "NODE", format!("{e}. Retrying in 5 s"));
                sleep_while_running(&shared, 5);
            }
        }
    };

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    *shared.submit_tx.lock().unwrap() = Some(tx);
    let mut current: Option<Template> = None;
    let mut best = String::new();
    let mut fetched = Instant::now() - Duration::from_secs(3600);
    let mut last_problem = String::new();
    let mut won = String::new();

    while shared.running.load(Ordering::Relaxed) {
        // blocks found by the hashing threads
        while let Ok(msg) = rx.try_recv() {
            if let Some(t) = current.as_ref() {
                // two threads can finish the same block at once; only the first one counts
                if won == t.job.id {
                    continue;
                }
                if submit_block(&shared, &rpc, t, &msg) {
                    won = t.job.id.clone();
                }
                fetched = Instant::now() - Duration::from_secs(3600); // fresh work right away
            }
        }
        // new tip → new work at once; otherwise refresh every 30 s to pick up new transactions
        let tip = rpc("getbestblockhash", serde_json::json!([])).ok().and_then(|v| v.as_str().map(|s| s.to_string()));
        let tip_changed = tip.as_deref().is_some_and(|t| t != best);
        if tip_changed || fetched.elapsed() > Duration::from_secs(30) {
            match rpc("getblocktemplate", serde_json::json!([{ "rules": ["segwit"] }])) {
                Ok(t) => match build_template(&t, &script) {
                    Ok(tpl) => {
                        if let Some(tip) = tip {
                            best = tip;
                        }
                        fetched = Instant::now();
                        last_problem.clear();
                        let fresh = current.as_ref().map(|c| c.height != tpl.height).unwrap_or(true);
                        // there are no shares here: threads only report hashes that are whole blocks
                        *shared.share_target.write().unwrap() = tpl.job.block_target;
                        let d = difficulty_of(&tpl.job.block_target);
                        shared.difficulty.store(d.to_bits(), Ordering::Relaxed);
                        *shared.job.write().unwrap() = Some(tpl.job.clone());
                        shared.job_gen.fetch_add(1, Ordering::Relaxed);
                        if fresh {
                            shared.pool_connected.store(true, Ordering::Relaxed);
                            shared.set_status("mining");
                            shared.log("info", "NODE", format!("Mining block {} on your node: {} SAT to {} if you find it", tpl.height, tpl.reward_sats as f64 / 1e8, config.payout_address.trim()));
                        }
                        current = Some(tpl);
                    }
                    Err(e) => shared.log("error", "NODE", format!("Couldn't build work from the node's template: {e}")),
                },
                Err(e) => {
                    // the usual reasons: still syncing, or no peers yet (the node won't mine alone)
                    let why = if e.contains("initial sync") || e.contains("downloading blocks") {
                        "Your node is still syncing; mining starts when it's caught up".to_string()
                    } else if e.contains("not connected") {
                        "Your node has no peers yet; it won't build blocks until it's connected to the network".to_string()
                    } else {
                        e
                    };
                    if why != last_problem {
                        shared.log("warn", "NODE", why.clone());
                        last_problem = why;
                    }
                    shared.pool_connected.store(false, Ordering::Relaxed);
                    *shared.job.write().unwrap() = None;
                    shared.job_gen.fetch_add(1, Ordering::Relaxed);
                    sleep_while_running(&shared, 5);
                    continue;
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    *shared.submit_tx.lock().unwrap() = None;
    shared.pool_connected.store(false, Ordering::Relaxed);
}

fn stop(shared: &Shared) {
    shared.running.store(false, Ordering::SeqCst);
    shared.set_status("idle");
}

fn difficulty_of(target: &[u8; 32]) -> f64 {
    // diff1 / target using the top bytes, enough for display
    let mut t = 0f64;
    for i in (0..32).rev() {
        t = t * 256.0 + target[i] as f64;
    }
    let diff1 = 65535.0 * 2f64.powi(208);
    if t > 0.0 { diff1 / t } else { 0.0 }
}

fn varint(n: u64) -> Vec<u8> {
    match n {
        0..=0xfc => vec![n as u8],
        0xfd..=0xffff => {
            let mut v = vec![0xfd];
            v.extend_from_slice(&(n as u16).to_le_bytes());
            v
        }
        0x10000..=0xffff_ffff => {
            let mut v = vec![0xfe];
            v.extend_from_slice(&(n as u32).to_le_bytes());
            v
        }
        _ => {
            let mut v = vec![0xff];
            v.extend_from_slice(&n.to_le_bytes());
            v
        }
    }
}

/// BIP34: the height exactly as `CScript() << nHeight` writes it.
fn height_push(h: u64) -> Vec<u8> {
    if h == 0 {
        return vec![0x00];
    }
    if h <= 16 {
        return vec![0x50 + h as u8];
    }
    let mut bytes = Vec::new();
    let mut v = h;
    while v > 0 {
        bytes.push((v & 0xff) as u8);
        v >>= 8;
    }
    if bytes.last().unwrap() & 0x80 != 0 {
        bytes.push(0);
    }
    let mut out = vec![bytes.len() as u8];
    out.extend(bytes);
    out
}

fn build_template(t: &serde_json::Value, script: &[u8]) -> Result<Template, String> {
    let s = |k: &str| t.get(k).and_then(|v| v.as_str()).ok_or(format!("template has no {k}"));
    let u = |k: &str| t.get(k).and_then(|v| v.as_u64()).ok_or(format!("template has no {k}"));
    let height = u("height")?;
    let reward = u("coinbasevalue")?;
    let version = u("version")? as u32;
    let nbits = u32::from_str_radix(s("bits")?, 16).map_err(|e| e.to_string())?;
    let ntime = u("curtime")? as u32;
    let mut prevhash = [0u8; 32];
    let p = hex_decode(s("previousblockhash")?)?;
    for i in 0..32 {
        prevhash[i] = p[31 - i];
    }
    // segwit data is only allowed once the chain has activated it
    let rules: Vec<String> = t.get("rules").and_then(|r| r.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.trim_start_matches('!').to_string())).collect()).unwrap_or_default();
    let commitment = t.get("default_witness_commitment").and_then(|v| v.as_str()).map(hex_decode).transpose()?;
    let witness = commitment.is_some() && rules.iter().any(|r| r == "segwit");

    // coinbase: version | 1 input (null prevout) | script: height, 8-byte extranonce, tag | outputs | locktime
    let hp = height_push(height);
    let script_len = hp.len() + EXTRANONCE_SIZE as usize + 1 + TAG.len();
    if script_len > 100 {
        return Err("coinbase script too long".into());
    }
    let mut coinb1 = Vec::new();
    coinb1.extend_from_slice(&2u32.to_le_bytes());
    coinb1.push(1);
    coinb1.extend_from_slice(&[0u8; 32]);
    coinb1.extend_from_slice(&[0xff; 4]);
    coinb1.extend(varint(script_len as u64));
    coinb1.extend(&hp);
    let mut coinb2 = vec![TAG.len() as u8];
    coinb2.extend_from_slice(TAG);
    coinb2.extend_from_slice(&[0xff; 4]);
    let outputs = if witness { 2 } else { 1 };
    coinb2.extend(varint(outputs));
    coinb2.extend_from_slice(&reward.to_le_bytes());
    coinb2.extend(varint(script.len() as u64));
    coinb2.extend_from_slice(script);
    if witness {
        let c = commitment.unwrap();
        coinb2.extend_from_slice(&0u64.to_le_bytes());
        coinb2.extend(varint(c.len() as u64));
        coinb2.extend(c);
    }
    coinb2.extend_from_slice(&0u32.to_le_bytes());

    // merkle branch for the coinbase: txids in internal byte order
    let txs_json = t.get("transactions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut txids = Vec::with_capacity(txs_json.len());
    let mut txs = Vec::with_capacity(txs_json.len());
    for tx in &txs_json {
        let mut id = [0u8; 32];
        let raw = hex_decode(tx.get("txid").and_then(|v| v.as_str()).ok_or("tx without txid")?)?;
        for i in 0..32 {
            id[i] = raw[31 - i];
        }
        txids.push(id);
        txs.push(hex_decode(tx.get("data").and_then(|v| v.as_str()).ok_or("tx without data")?)?);
    }
    let mut merkle_branch = Vec::new();
    let mut level: Vec<Option<[u8; 32]>> = std::iter::once(None).chain(txids.into_iter().map(Some)).collect();
    while level.len() > 1 {
        merkle_branch.push(level[1].unwrap());
        let mut next = vec![None];
        let mut i = 2;
        while i < level.len() {
            let a = level[i].unwrap();
            let b = level.get(i + 1).copied().flatten().unwrap_or(a);
            let mut pair = [0u8; 64];
            pair[..32].copy_from_slice(&a);
            pair[32..].copy_from_slice(&b);
            next.push(Some(sha256d(&pair)));
            i += 2;
        }
        level = next;
    }
    let job = Job {
        id: format!("{height}:{ntime}"),
        prevhash,
        coinb1,
        coinb2,
        merkle_branch,
        version,
        nbits,
        ntime,
        block_target: target_from_nbits(nbits),
        height: Some(height),
    };
    Ok(Template { job: Arc::new(job), txs, witness, height, reward_sats: reward })
}

/// The hashing threads report a find in the same JSON shape as a pool share; turn it into a block.
fn submit_block(shared: &Arc<Shared>, rpc: &dyn Fn(&str, serde_json::Value) -> Result<serde_json::Value, String>, t: &Template, msg: &str) -> bool {
    let v: serde_json::Value = match serde_json::from_str(msg) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let id = v.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
    shared.pending.lock().unwrap().remove(&id);
    let p = v.get("params").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let get = |i: usize| p.get(i).and_then(|x| x.as_str()).unwrap_or("");
    if get(1) != t.job.id {
        return false; // found on work that's already been replaced
    }
    let (Ok(en2), Ok(ntime), Ok(nonce)) = (hex_decode(get(2)), u32::from_str_radix(get(3), 16), u32::from_str_radix(get(4), 16)) else { return false };
    let mut coinbase = t.job.coinb1.clone();
    coinbase.extend(&en2);
    coinbase.extend(&t.job.coinb2);
    let root = merkle_root(&t.job, &[], &en2);
    let mut header = Vec::with_capacity(80);
    header.extend_from_slice(&t.job.version.to_le_bytes());
    header.extend_from_slice(&t.job.prevhash);
    header.extend_from_slice(&root);
    header.extend_from_slice(&ntime.to_le_bytes());
    header.extend_from_slice(&t.job.nbits.to_le_bytes());
    header.extend_from_slice(&nonce.to_le_bytes());
    let hash = reverse(&sha256d(&header));
    // the coinbase in witness form: marker, flag, and one 32-byte zero witness item before locktime
    let coinbase_full = if t.witness {
        let n = coinbase.len();
        let mut c = coinbase[..4].to_vec();
        c.extend_from_slice(&[0, 1]);
        c.extend_from_slice(&coinbase[4..n - 4]);
        c.extend_from_slice(&[1, 32]);
        c.extend_from_slice(&[0u8; 32]);
        c.extend_from_slice(&coinbase[n - 4..]);
        c
    } else {
        coinbase
    };
    let mut block = header;
    block.extend(varint(1 + t.txs.len() as u64));
    block.extend(coinbase_full);
    for tx in &t.txs {
        block.extend(tx);
    }
    match rpc("submitblock", serde_json::json!([hex_encode(&block)])) {
        Ok(serde_json::Value::Null) => {
            shared.accepted.fetch_add(1, Ordering::Relaxed);
            shared.log("success", "NODE", format!("Your node accepted block {} ({}). {} SAT are yours once it has 100 confirmations.", t.height, hex_encode(&hash), t.reward_sats as f64 / 1e8));
            true
        }
        Ok(other) => {
            shared.rejected.fetch_add(1, Ordering::Relaxed);
            shared.log("error", "NODE", format!("Your node rejected block {}: {}", t.height, other.as_str().unwrap_or(&other.to_string())));
            false
        }
        Err(e) => {
            shared.rejected.fetch_add(1, Ordering::Relaxed);
            shared.log("error", "NODE", format!("Couldn't submit block {}: {e}", t.height));
            false
        }
    }
}

/// One JSON-RPC call over plain HTTP to the local node (blocking; this runs on its own thread).
pub(super) fn call(url: &str, creds: Option<&(String, String)>, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    use base64::Engine;
    let rest = url.trim_start_matches("http://").trim_end_matches('/');
    let (hostport, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let addr = hostport.to_socket_addrs().map_err(|e| e.to_string())?.next().ok_or("bad node address")?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(5)).map_err(|_| "Can't reach your node. Is Saturn Core running? (Network screen → Saturn node on this computer)".to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(60))).ok();
    let body = serde_json::json!({ "jsonrpc": "1.0", "id": "saturn-solo", "method": method, "params": params }).to_string();
    let auth = creds.map(|(u, p)| format!("Authorization: Basic {}\r\n", base64::engine::general_purpose::STANDARD.encode(format!("{u}:{p}")))).unwrap_or_default();
    write!(s, "POST {path} HTTP/1.1\r\nHost: {hostport}\r\n{auth}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).map_err(|e| e.to_string())?;
    // read the headers, then exactly Content-Length bytes (the node may keep the connection open)
    let mut reader = BufReader::new(s);
    let mut head = String::new();
    let mut length: Option<usize> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            break;
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = v.trim().parse().ok();
        }
        head.push_str(&line);
    }
    let mut body = Vec::new();
    match length {
        Some(n) => {
            body.resize(n, 0);
            std::io::Read::read_exact(&mut reader, &mut body).map_err(|e| e.to_string())?;
        }
        None => {
            std::io::Read::read_to_end(&mut reader, &mut body).map_err(|e| e.to_string())?;
        }
    }
    let payload = String::from_utf8_lossy(&body);
    if head.starts_with("HTTP/1.1 401") || head.starts_with("HTTP/1.0 401") {
        return Err("The node refused the login. Leave RPC user/password empty in Settings when the node runs on this computer.".into());
    }
    let v: serde_json::Value = serde_json::from_str(payload.trim()).map_err(|_| format!("bad reply from the node: {}", head.lines().next().unwrap_or("")))?;
    if let Some(err) = v.get("error").filter(|e| !e.is_null()) {
        return Err(err.get("message").and_then(|m| m.as_str()).unwrap_or("RPC error").to_string());
    }
    Ok(v.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn height_pushes_match_bip34() {
        assert_eq!(height_push(1), vec![0x51]);
        assert_eq!(height_push(16), vec![0x60]);
        assert_eq!(height_push(17), vec![1, 17]);
        assert_eq!(height_push(128), vec![2, 0x80, 0]);
        assert_eq!(height_push(500_000), vec![3, 0x20, 0xa1, 0x07]);
    }

    /// Mines real blocks against a regtest node:
    /// SATURN_RPC=http://127.0.0.1:39998 SATURN_RPC_USER=… SATURN_RPC_PASS=… SATURN_ADDR=bcrt1… cargo test --lib own_node -- --ignored --nocapture
    #[test]
    #[ignore]
    fn mines_blocks_on_a_regtest_node() {
        let url = std::env::var("SATURN_RPC").expect("SATURN_RPC");
        let creds = (std::env::var("SATURN_RPC_USER").unwrap(), std::env::var("SATURN_RPC_PASS").unwrap());
        let addr = std::env::var("SATURN_ADDR").unwrap();
        let start = call(&url, Some(&creds), "getblockcount", serde_json::json!([])).unwrap().as_u64().unwrap();
        let handle = MinerHandle::default();
        let shared = handle.0.clone();
        shared.running.store(true, Ordering::SeqCst);
        let cfg = MinerConfig { mode: "node".into(), pool_url: String::new(), worker: String::new(), payout_address: addr.clone(), threads: 2, intensity: 100, rpc_url: url.clone(), rpc_user: creds.0.clone(), rpc_password: creds.1.clone() };
        let s = shared.clone();
        let t = thread::spawn(move || node_thread(s, cfg));
        for i in 0..2 {
            let s = shared.clone();
            thread::spawn(move || worker_thread(s, i, 2, 100));
        }
        let deadline = Instant::now() + Duration::from_secs(60);
        while shared.accepted.load(Ordering::Relaxed) < 3 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(200));
        }
        shared.running.store(false, Ordering::SeqCst);
        t.join().unwrap();
        for e in shared.log.lock().unwrap().iter() {
            println!("{} {} {}", e.level, e.source, e.message);
        }
        let end = call(&url, Some(&creds), "getblockcount", serde_json::json!([])).unwrap().as_u64().unwrap();
        assert!(shared.accepted.load(Ordering::Relaxed) >= 3, "found {} blocks", shared.accepted.load(Ordering::Relaxed));
        assert!(end >= start + 3);
        // the newest block pays our address in full
        let hash = call(&url, Some(&creds), "getbestblockhash", serde_json::json!([])).unwrap();
        let block = call(&url, Some(&creds), "getblock", serde_json::json!([hash, 2])).unwrap();
        let out = &block["tx"][0]["vout"][0];
        assert_eq!(out["scriptPubKey"]["address"].as_str(), Some(addr.as_str()));
    }
}
