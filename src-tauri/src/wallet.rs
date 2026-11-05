//! In-app Saturn wallet.
//!
//! A BIP39 recovery phrase is the only secret. Keys follow BIP84 (m/84'/0'/0'), so the same coins can
//! be imported into Saturn Core with the descriptors this module exports. Addresses are native SegWit
//! (P2WPKH) with Saturn's `sat` prefix.
//!
//! The wallet needs no local node: balances come from Saturn Pool's `/utxos` endpoint (the pool's
//! Saturn Core scans the UTXO set) and signed transactions are relayed through `/broadcast`. Every
//! transaction is built and signed here; the recovery phrase never leaves the computer.

use bitcoin::bech32::{segwit, Hrp};
use bitcoin::bip32::{DerivationPath, Xpriv};
use bitcoin::hashes::Hash;
use bitcoin::secp256k1::{All, Message, Secp256k1};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{absolute, transaction, Amount, CompressedPublicKey, Network, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness, WitnessProgram, WitnessVersion};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const HRP: &str = "sat";
/// BIP84 account; Saturn Core uses coin type 0' on mainnet too
const ACCOUNT: &str = "m/84'/0'/0'";
const RECEIVE_SCAN: u32 = 20;
const CHANGE_SCAN: u32 = 5;
const DUST_SATS: u64 = 546;

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

/// Address prefix. Tests can point it at a regtest chain (`bcrt`) with SATURN_TEST_HRP.
fn hrp() -> String {
    #[cfg(test)]
    if let Ok(h) = std::env::var("SATURN_TEST_HRP") {
        return h;
    }
    HRP.to_string()
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod secret {
    const SERVICE: &str = "Saturn";
    const USER: &str = "wallet-recovery-phrase";
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, USER).map_err(|e| e.to_string())
    }
    pub fn load(_dir: &std::path::Path) -> Result<Option<String>, String> {
        match entry()?.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("couldn't read the wallet from the keychain: {e}")),
        }
    }
    pub fn save(_dir: &std::path::Path, phrase: &str) -> Result<(), String> {
        entry()?.set_password(phrase).map_err(|e| format!("couldn't save the wallet to the keychain: {e}"))
    }
    pub fn delete(_dir: &std::path::Path) -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub const KIND: &str = "keychain";
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod secret {
    use std::path::Path;
    fn file(dir: &Path) -> std::path::PathBuf {
        dir.join("wallet.seed")
    }
    pub fn load(dir: &Path) -> Result<Option<String>, String> {
        match std::fs::read_to_string(file(dir)) {
            Ok(s) => Ok(Some(s.trim().to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save(dir: &Path, phrase: &str) -> Result<(), String> {
        use std::io::Write;
        #[cfg(unix)]
        use std::os::unix::fs::OpenOptionsExt;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        opts.mode(0o600);
        let mut f = opts.open(file(dir)).map_err(|e| e.to_string())?;
        f.write_all(phrase.as_bytes()).map_err(|e| e.to_string())
    }
    pub fn delete(dir: &Path) -> Result<(), String> {
        match std::fs::remove_file(file(dir)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub const KIND: &str = "file";
}

/* ------------------------------------------------------------------ */
/* keys and addresses                                                  */
/* ------------------------------------------------------------------ */

struct Keys {
    secp: Secp256k1<All>,
    master: Xpriv,
    account: Xpriv,
}

impl Keys {
    fn from_phrase(phrase: &str) -> Result<Keys, String> {
        let mnemonic = bip39::Mnemonic::parse_normalized(phrase.trim()).map_err(|e| format!("That recovery phrase isn't valid: {e}"))?;
        let seed = mnemonic.to_seed("");
        let secp = Secp256k1::new();
        let master = Xpriv::new_master(Network::Bitcoin, &seed).map_err(|e| e.to_string())?;
        let path = DerivationPath::from_str(ACCOUNT).map_err(|e| e.to_string())?;
        let account = master.derive_priv(&secp, &path).map_err(|e| e.to_string())?;
        Ok(Keys { secp, master, account })
    }

    fn key(&self, change: bool, index: u32) -> Result<(bitcoin::secp256k1::SecretKey, CompressedPublicKey), String> {
        let path = DerivationPath::from_str(&format!("m/{}/{}", u32::from(change), index)).map_err(|e| e.to_string())?;
        let child = self.account.derive_priv(&self.secp, &path).map_err(|e| e.to_string())?;
        let pk = CompressedPublicKey::from_private_key(&self.secp, &child.to_priv()).map_err(|e| e.to_string())?;
        Ok((child.private_key, pk))
    }

    fn address(&self, change: bool, index: u32) -> Result<String, String> {
        let (_, pk) = self.key(change, index)?;
        encode_p2wpkh(&pk)
    }
}

fn encode_p2wpkh(pk: &CompressedPublicKey) -> Result<String, String> {
    let hrp = Hrp::parse(&hrp()).map_err(|e| e.to_string())?;
    segwit::encode(hrp, segwit::VERSION_0, pk.wpubkey_hash().as_byte_array()).map_err(|e| e.to_string())
}

/// scriptPubKey for any Saturn address: sat1… (SegWit v0/v1) or the legacy 1…/3… forms.
fn script_for(address: &str) -> Result<ScriptBuf, String> {
    let a = address.trim();
    if a.to_ascii_lowercase().starts_with(&format!("{}1", hrp())) {
        let (hrp, version, program) = segwit::decode(a).map_err(|_| "That address isn't valid (check every character).".to_string())?;
        if hrp.as_str() != self::hrp() {
            return Err("That isn't a Saturn address.".into());
        }
        let wv = WitnessVersion::try_from(version).map_err(|e| e.to_string())?;
        let wp = WitnessProgram::new(wv, &program).map_err(|e| e.to_string())?;
        return Ok(ScriptBuf::new_witness_program(&wp));
    }
    if a.starts_with('1') || a.starts_with('3') {
        // Saturn shares Bitcoin's base58 version bytes
        let parsed = bitcoin::Address::from_str(a).map_err(|_| "That address isn't valid.".to_string())?;
        let checked = parsed.require_network(Network::Bitcoin).map_err(|e| e.to_string())?;
        return Ok(checked.script_pubkey());
    }
    Err("Saturn addresses start with sat1.".into())
}

/// BIP380 descriptor checksum
fn descriptor_checksum(desc: &str) -> String {
    const INPUT: &str = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
    const CHARSET: &[u8] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const GEN: [u64; 5] = [0xf5dee51989, 0xa9fdca3312, 0x1bab10e32d, 0x3706b1677a, 0x644d626ffd];
    fn polymod(c: u64, v: u64) -> u64 {
        let top = c >> 35;
        let mut c = ((c & 0x7ffffffff) << 5) ^ v;
        for (i, g) in GEN.iter().enumerate() {
            if (top >> i) & 1 == 1 {
                c ^= g;
            }
        }
        c
    }
    let mut c = 1u64;
    let mut cls = 0u64;
    let mut count = 0;
    for ch in desc.chars() {
        let pos = INPUT.find(ch).unwrap_or(0) as u64;
        c = polymod(c, pos & 31);
        cls = cls * 3 + (pos >> 5);
        count += 1;
        if count == 3 {
            c = polymod(c, cls);
            cls = 0;
            count = 0;
        }
    }
    if count > 0 {
        c = polymod(c, cls);
    }
    for _ in 0..8 {
        c = polymod(c, 0);
    }
    c ^= 1;
    (0..8).map(|j| CHARSET[((c >> (5 * (7 - j))) & 31) as usize] as char).collect()
}

/* ------------------------------------------------------------------ */
/* commands                                                            */
/* ------------------------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletInfo {
    exists: bool,
    address: Option<String>,
    change_address: Option<String>,
    /// where the recovery phrase is kept: "keychain" or "file"
    storage: &'static str,
}

fn load_keys(app: &AppHandle) -> Result<Option<Keys>, String> {
    let dir = data_dir(app)?;
    match secret::load(&dir)? {
        Some(p) => Ok(Some(Keys::from_phrase(&p)?)),
        None => Ok(None),
    }
}

fn require_keys(app: &AppHandle) -> Result<Keys, String> {
    load_keys(app)?.ok_or_else(|| "There's no wallet yet. Create one first.".to_string())
}

#[tauri::command]
pub fn wallet_info(app: AppHandle) -> Result<WalletInfo, String> {
    let keys = load_keys(&app)?;
    Ok(WalletInfo {
        exists: keys.is_some(),
        address: keys.as_ref().map(|k| k.address(false, 0)).transpose()?,
        change_address: keys.as_ref().map(|k| k.address(true, 0)).transpose()?,
        storage: secret::KIND,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    phrase: String,
    address: String,
}

#[tauri::command]
pub fn wallet_create(app: AppHandle, words: Option<usize>) -> Result<Created, String> {
    if load_keys(&app)?.is_some() {
        return Err("A wallet already exists on this computer.".into());
    }
    let words = match words.unwrap_or(12) {
        24 => 24,
        _ => 12,
    };
    let mnemonic = bip39::Mnemonic::generate(words).map_err(|e| e.to_string())?;
    let phrase = mnemonic.to_string();
    let keys = Keys::from_phrase(&phrase)?;
    secret::save(&data_dir(&app)?, &phrase)?;
    Ok(Created { address: keys.address(false, 0)?, phrase })
}

#[tauri::command]
pub fn wallet_import(app: AppHandle, phrase: String) -> Result<String, String> {
    if load_keys(&app)?.is_some() {
        return Err("A wallet already exists on this computer. Remove it first.".into());
    }
    let normalized = phrase.split_whitespace().map(|w| w.to_lowercase()).collect::<Vec<_>>().join(" ");
    let keys = Keys::from_phrase(&normalized)?;
    secret::save(&data_dir(&app)?, &normalized)?;
    keys.address(false, 0)
}

#[tauri::command]
pub fn wallet_reveal(app: AppHandle) -> Result<String, String> {
    secret::load(&data_dir(&app)?)?.ok_or_else(|| "There's no wallet yet.".into())
}

#[tauri::command]
pub fn wallet_delete(app: AppHandle) -> Result<(), String> {
    secret::delete(&data_dir(&app)?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Descriptors {
    receive: String,
    change: String,
    /// a ready-to-paste `importdescriptors` argument for saturn-cli
    import: String,
}

/// Private descriptors for importing this wallet into Saturn Core (spend from a full node).
#[tauri::command]
pub fn wallet_descriptors(app: AppHandle) -> Result<Descriptors, String> {
    let keys = require_keys(&app)?;
    let base = |chain: u32| {
        let d = format!("wpkh({}/84h/0h/0h/{chain}/*)", keys.master);
        format!("{d}#{}", descriptor_checksum(&d))
    };
    let (receive, change) = (base(0), base(1));
    let import = serde_json::json!([
        { "desc": receive, "timestamp": 0, "active": true, "internal": false },
        { "desc": change, "timestamp": 0, "active": true, "internal": true }
    ])
    .to_string();
    Ok(Descriptors { receive, change, import })
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Utxo {
    txid: String,
    vout: u32,
    sats: u64,
    address: Option<String>,
    height: u64,
    confirmations: i64,
    coinbase: bool,
    spendable: bool,
}

#[derive(Deserialize)]
struct UtxoResponse {
    height: u64,
    utxos: Vec<Utxo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Balance {
    height: u64,
    spendable_sats: u64,
    immature_sats: u64,
    coins: Vec<Utxo>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())
}

/// every address this wallet watches, with its chain and index
fn watched(keys: &Keys) -> Result<Vec<(String, bool, u32)>, String> {
    let mut out = Vec::new();
    for i in 0..RECEIVE_SCAN {
        out.push((keys.address(false, i)?, false, i));
    }
    for i in 0..CHANGE_SCAN {
        out.push((keys.address(true, i)?, true, i));
    }
    Ok(out)
}

async fn fetch_utxos(api: &str, addrs: &[String]) -> Result<UtxoResponse, String> {
    let url = format!("{}/utxos?addrs={}", api.trim_end_matches('/'), addrs.join(","));
    let r = client()?.get(url).send().await.map_err(|e| format!("Can't reach Saturn Pool to read your balance: {e}"))?;
    if !r.status().is_success() {
        let body: serde_json::Value = r.json().await.unwrap_or_default();
        return Err(body["error"].as_str().unwrap_or("Saturn Pool couldn't read your balance").to_string());
    }
    r.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wallet_balance(app: AppHandle, api: String) -> Result<Balance, String> {
    let keys = require_keys(&app)?;
    balance_with(&keys, &api).await
}

async fn balance_with(keys: &Keys, api: &str) -> Result<Balance, String> {
    let addrs: Vec<String> = watched(keys)?.into_iter().map(|(a, _, _)| a).collect();
    let r = fetch_utxos(api, &addrs).await?;
    let spendable = r.utxos.iter().filter(|u| u.spendable).map(|u| u.sats).sum();
    let immature = r.utxos.iter().filter(|u| !u.spendable).map(|u| u.sats).sum();
    let mut coins = r.utxos;
    coins.sort_by(|a, b| b.height.cmp(&a.height));
    Ok(Balance { height: r.height, spendable_sats: spendable, immature_sats: immature, coins })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sent {
    txid: String,
    fee_sats: u64,
    amount_sats: u64,
}

/// Build, sign and broadcast a payment. `amount_sats = None` sends everything spendable (minus fee).
#[tauri::command]
pub async fn wallet_send(app: AppHandle, api: String, to: String, amount_sats: Option<u64>, fee_rate: Option<f64>) -> Result<Sent, String> {
    let keys = require_keys(&app)?;
    send_with(&keys, &api, &to, amount_sats, fee_rate).await
}

async fn send_with(keys: &Keys, api: &str, to: &str, amount_sats: Option<u64>, fee_rate: Option<f64>) -> Result<Sent, String> {
    let dest = script_for(to)?;
    let fee_rate = fee_rate.unwrap_or(2.0).clamp(1.0, 500.0);
    let watched = watched(keys)?;
    let addrs: Vec<String> = watched.iter().map(|(a, _, _)| a.clone()).collect();
    let r = fetch_utxos(api, &addrs).await?;
    let mut coins: Vec<Utxo> = r.utxos.into_iter().filter(|u| u.spendable).collect();
    if coins.is_empty() {
        return Err("Nothing to send yet. Mined coins become spendable after 100 confirmations.".into());
    }
    // largest first keeps transactions small
    coins.sort_by(|a, b| b.sats.cmp(&a.sats));

    let vsize = |inputs: usize, outputs: usize| (11 + 68 * inputs + 31 * outputs) as f64;
    let mut chosen: Vec<Utxo> = Vec::new();
    let mut total = 0u64;
    let (amount, change) = match amount_sats {
        None => {
            chosen = coins;
            total = chosen.iter().map(|u| u.sats).sum();
            let fee = (vsize(chosen.len(), 1) * fee_rate).ceil() as u64;
            if total <= fee + DUST_SATS {
                return Err("The balance is too small to cover the network fee.".into());
            }
            (total - fee, 0u64)
        }
        Some(amount) => {
            if amount < DUST_SATS {
                return Err(format!("The smallest amount you can send is {} SAT.", DUST_SATS as f64 / 1e8));
            }
            let mut fee = 0;
            for c in coins {
                total += c.sats;
                chosen.push(c);
                fee = (vsize(chosen.len(), 2) * fee_rate).ceil() as u64;
                if total >= amount + fee {
                    break;
                }
            }
            if total < amount + fee {
                return Err(format!("Not enough spendable SAT: you have {:.8}, this needs {:.8} including the fee.", total as f64 / 1e8, (amount + fee) as f64 / 1e8));
            }
            let change = total - amount - fee;
            if change < DUST_SATS {
                (amount, 0) // too small to keep: it goes to the fee
            } else {
                (amount, change)
            }
        }
    };

    let mut outputs = vec![TxOut { value: Amount::from_sat(amount), script_pubkey: dest }];
    if change > 0 {
        let (_, pk) = keys.key(true, 0)?;
        outputs.push(TxOut { value: Amount::from_sat(change), script_pubkey: ScriptBuf::new_p2wpkh(&pk.wpubkey_hash()) });
    }
    let mut inputs = Vec::new();
    for c in &chosen {
        inputs.push(TxIn {
            previous_output: OutPoint { txid: Txid::from_str(&c.txid).map_err(|e| e.to_string())?, vout: c.vout },
            script_sig: ScriptBuf::new(),
            sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
            witness: Witness::default(),
        });
    }
    let mut tx = Transaction { version: transaction::Version::TWO, lock_time: absolute::LockTime::ZERO, input: inputs, output: outputs };

    // sign every input with the key of the address it pays
    let mut cache = SighashCache::new(&mut tx);
    for (i, c) in chosen.iter().enumerate() {
        let (_, change_chain, index) = watched
            .iter()
            .find(|(a, _, _)| Some(a) == c.address.as_ref())
            .ok_or("A coin belongs to an address this wallet doesn't recognise.")?;
        let (sk, pk) = keys.key(*change_chain, *index)?;
        let spk = ScriptBuf::new_p2wpkh(&pk.wpubkey_hash());
        let sighash = cache.p2wpkh_signature_hash(i, &spk, Amount::from_sat(c.sats), EcdsaSighashType::All).map_err(|e| e.to_string())?;
        let sig = keys.secp.sign_ecdsa(&Message::from(sighash), &sk);
        let sig = bitcoin::ecdsa::Signature { signature: sig, sighash_type: EcdsaSighashType::All };
        *cache.witness_mut(i).ok_or("signing failed")? = Witness::p2wpkh(&sig, &pk.0);
    }
    let fee = total - amount - change;
    let hex = bitcoin::consensus::encode::serialize_hex(&tx);

    let url = format!("{}/broadcast", api.trim_end_matches('/'));
    let resp = client()?.post(url).json(&serde_json::json!({ "hex": hex })).send().await.map_err(|e| format!("Can't reach Saturn Pool to send: {e}"))?;
    let ok = resp.status().is_success();
    let body: serde_json::Value = resp.json().await.unwrap_or_default();
    if !ok {
        return Err(format!("The network refused the transaction: {}", body["error"].as_str().unwrap_or("unknown reason")));
    }
    Ok(Sent { txid: body["txid"].as_str().unwrap_or_default().to_string(), fee_sats: fee, amount_sats: amount })
}

#[tauri::command]
pub fn wallet_check_address(address: String) -> Result<(), String> {
    script_for(&address).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    // BIP84 test vector (account 0, first receive address), re-encoded with Saturn's prefix
    #[test]
    fn bip84_vector() {
        let k = Keys::from_phrase("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").unwrap();
        let a = k.address(false, 0).unwrap();
        let (_, _, program) = segwit::decode("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").unwrap();
        let hrp = Hrp::parse(HRP).unwrap();
        assert_eq!(a, segwit::encode(hrp, segwit::VERSION_0, &program).unwrap());
        assert!(a.starts_with("sat1q"));
    }

    #[test]
    fn checksum_matches_bip380() {
        // example from BIP380
        assert_eq!(descriptor_checksum("raw(deadbeef)"), "89f8spxm");
    }

    #[test]
    fn rejects_other_coins() {
        assert!(script_for("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").is_err());
        assert!(script_for("sat1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").is_err()); // bad checksum
    }

    /// End-to-end against a pool on a regtest chain:
    /// `SATURN_TEST_API=http://127.0.0.1:38081 SATURN_TEST_PHRASE="…" SATURN_TEST_TO=sat1… cargo test live_wallet -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live_wallet() {
        let api = std::env::var("SATURN_TEST_API").unwrap();
        let k = Keys::from_phrase(&std::env::var("SATURN_TEST_PHRASE").unwrap()).unwrap();
        println!("receive address {}", k.address(false, 0).unwrap());
        let b = balance_with(&k, &api).await.unwrap();
        println!("spendable {} immature {} coins {}", b.spendable_sats, b.immature_sats, b.coins.len());
        let to = std::env::var("SATURN_TEST_TO").unwrap();
        let sent = send_with(&k, &api, &to, Some(1_2345_6789), None).await.unwrap();
        println!("sent {} fee {} txid {}", sent.amount_sats, sent.fee_sats, sent.txid);
    }
}
