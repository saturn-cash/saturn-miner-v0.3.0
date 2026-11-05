//! In-app Saturn wallets.
//!
//! Saturn can hold several wallets and switch between them. Each wallet is one secret:
//!   - a BIP39 recovery phrase (created here or restored), keys on BIP84 m/84'/0'/0';
//!   - a Saturn Core key: the `wpkh(xprv…/84h/0h/0h/0/*)` descriptor from `listdescriptors true`
//!     or a bare xprv, so the coins of a Saturn Core wallet (e.g. the address a Bitaxe already
//!     mines to) can be spent here;
//!   - a single private key (WIF), for one address.
//! Phrase and xprv wallets hand out as many addresses as you like (a fresh one per payer is good
//! practice); a single key has exactly one. Addresses are native SegWit (P2WPKH) with the `sat`
//! prefix, so any of them can be used as a mining payout address.
//!
//! No local node is needed: balances come from Saturn Pool's `/utxos` endpoint and signed
//! transactions are relayed through `/broadcast`. Signing happens here; secrets never leave the
//! computer. Secrets live in the OS keychain on macOS/Windows and in user-only files on Linux; the
//! list of wallets (names, kinds, how many addresses were handed out) is a plain JSON file.

use bitcoin::bech32::{segwit, Hrp};
use bitcoin::bip32::{DerivationPath, Xpriv};
use bitcoin::hashes::Hash;
use bitcoin::secp256k1::{All, Message, Secp256k1, SecretKey};
use bitcoin::sighash::{EcdsaSighashType, SighashCache};
use bitcoin::{absolute, transaction, Amount, CompressedPublicKey, Network, OutPoint, PrivateKey, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness, WitnessProgram, WitnessVersion};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const HRP: &str = "sat";
/// BIP84 account; Saturn Core uses coin type 0' on mainnet too
const ACCOUNT: &str = "m/84'/0'/0'";
/// unused addresses watched past the last one handed out (BIP44's gap limit)
const GAP: u32 = 20;
const CHANGE_SCAN: u32 = 5;
const DUST_SATS: u64 = 546;

/// Address prefix. Tests can point it at a regtest chain (`bcrt`) with SATURN_TEST_HRP.
fn hrp() -> String {
    #[cfg(test)]
    if let Ok(h) = std::env::var("SATURN_TEST_HRP") {
        return h;
    }
    HRP.to_string()
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod secret {
    use std::path::Path;
    const SERVICE: &str = "Saturn";
    fn entry(id: &str) -> Result<keyring::Entry, String> {
        // the first wallet, from Saturn 0.6.0, kept its original keychain name
        let user = if id == "main" { "wallet-recovery-phrase".to_string() } else { format!("wallet-{id}") };
        keyring::Entry::new(SERVICE, &user).map_err(|e| e.to_string())
    }
    pub fn load(_dir: &Path, id: &str) -> Result<Option<String>, String> {
        match entry(id)?.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("couldn't read the wallet from the keychain: {e}")),
        }
    }
    pub fn save(_dir: &Path, id: &str, secret: &str) -> Result<(), String> {
        entry(id)?.set_password(secret).map_err(|e| format!("couldn't save the wallet to the keychain: {e}"))
    }
    pub fn delete(_dir: &Path, id: &str) -> Result<(), String> {
        match entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub const KIND: &str = "keychain";
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod secret {
    use std::path::{Path, PathBuf};
    fn file(dir: &Path, id: &str) -> PathBuf {
        // the first wallet, from Saturn 0.6.0, kept its original file name
        if id == "main" {
            dir.join("wallet.seed")
        } else {
            dir.join(format!("wallet-{id}.seed"))
        }
    }
    pub fn load(dir: &Path, id: &str) -> Result<Option<String>, String> {
        match std::fs::read_to_string(file(dir, id)) {
            Ok(s) => Ok(Some(s.trim().to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save(dir: &Path, id: &str, secret: &str) -> Result<(), String> {
        use std::io::Write;
        #[cfg(unix)]
        use std::os::unix::fs::OpenOptionsExt;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        opts.mode(0o600);
        let mut f = opts.open(file(dir, id)).map_err(|e| e.to_string())?;
        f.write_all(secret.as_bytes()).map_err(|e| e.to_string())
    }
    pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
        match std::fs::remove_file(file(dir, id)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub const KIND: &str = "file";
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WalletMeta {
    id: String,
    name: String,
    /// "phrase", "xprv" or "key"
    kind: String,
    /// receive addresses handed out so far (always at least 1)
    receive_count: u32,
    created: u64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Registry {
    active: Option<String>,
    wallets: Vec<WalletMeta>,
}

fn registry_path(dir: &Path) -> PathBuf {
    dir.join("wallets.json")
}

fn load_registry(dir: &Path) -> Result<Registry, String> {
    let mut reg: Registry = match std::fs::read_to_string(registry_path(dir)) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string())?,
        Err(_) => Registry::default(),
    };
    // a wallet made by Saturn 0.6.0 has a secret but no registry yet: adopt it as "Main"
    if reg.wallets.is_empty() && secret::load(dir, "main")?.is_some() {
        reg.wallets.push(WalletMeta { id: "main".into(), name: "Main".into(), kind: "phrase".into(), receive_count: 1, created: now() });
        reg.active = Some("main".into());
        save_registry(dir, &reg)?;
    }
    if reg.active.as_ref().map_or(true, |a| !reg.wallets.iter().any(|w| &w.id == a)) {
        reg.active = reg.wallets.first().map(|w| w.id.clone());
    }
    Ok(reg)
}

fn save_registry(dir: &Path, reg: &Registry) -> Result<(), String> {
    let text = serde_json::to_string_pretty(reg).map_err(|e| e.to_string())?;
    std::fs::write(registry_path(dir), text).map_err(|e| e.to_string())
}

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn new_id() -> String {
    let n: u64 = rand_u64();
    format!("{n:016x}")
}

fn rand_u64() -> u64 {
    use bitcoin::secp256k1::rand::RngCore;
    bitcoin::secp256k1::rand::thread_rng().next_u64()
}

/* ------------------------------------------------------------------ */
/* keys and addresses                                                  */
/* ------------------------------------------------------------------ */

enum Source {
    /// BIP84 account key: addresses at m/…/{0,1}/i
    Account(Xpriv),
    /// one key, one address
    Single(SecretKey),
}

struct Keys {
    secp: Secp256k1<All>,
    /// the master key, when there is one (for exporting descriptors)
    master: Option<Xpriv>,
    source: Source,
}

impl Keys {
    /// Recognises a recovery phrase, a Saturn Core descriptor or xprv, or a WIF private key.
    fn from_secret(secret: &str) -> Result<(Keys, &'static str), String> {
        let mut s = secret.trim();
        let secp = Secp256k1::new();
        // pasted `listdescriptors true` output holds several descriptors (pkh, sh(wpkh), wpkh, tr):
        // use the native SegWit receive one
        if s.matches("xprv").count() > 1 {
            let pick = s.match_indices("wpkh(").filter(|(i, _)| !s[..*i].ends_with("sh(")).map(|(i, _)| &s[i..]).find(|d| {
                let line = d.split('"').next().unwrap_or(d);
                line.contains("xprv") && !line.contains("/1/*")
            });
            s = pick.map(|d| d.split('"').next().unwrap_or(d)).ok_or("Couldn't find a wpkh(…) descriptor in what you pasted.")?;
        }
        // Saturn Core descriptor: wpkh(xprv…/84h/0h/0h/0/*)#chk  or  wpkh([fp/84h/0h/0h]xprv…/0/*)
        if let Some(start) = s.find("xprv") {
            let rest = &s[start..];
            let end = rest.find(|c: char| !c.is_ascii_alphanumeric()).unwrap_or(rest.len());
            let xprv = Xpriv::from_str(&rest[..end]).map_err(|e| format!("That xprv isn't valid: {e}"))?;
            let path = &rest[end..];
            let has_origin = s[..start].contains('[');
            let account = if has_origin {
                // the xprv is already the account key
                xprv
            } else if path.starts_with("/84h/0h/0h") || path.starts_with("/84'/0'/0'") || path.is_empty() {
                let p = DerivationPath::from_str(ACCOUNT).map_err(|e| e.to_string())?;
                xprv.derive_priv(&secp, &p).map_err(|e| e.to_string())?
            } else {
                return Err("Only native SegWit (wpkh, m/84h/0h/0h) Saturn Core keys can be imported.".into());
            };
            let master = if has_origin { None } else { Some(xprv) };
            return Ok((Keys { secp, master, source: Source::Account(account) }, "xprv"));
        }
        // single private key (WIF): 51-52 base58 characters starting with 5, K or L
        if !s.contains(' ') && (50..=52).contains(&s.len()) {
            let pk = PrivateKey::from_wif(s).map_err(|e| format!("That private key isn't valid: {e}"))?;
            return Ok((Keys { secp, master: None, source: Source::Single(pk.inner) }, "key"));
        }
        let normalized = s.split_whitespace().map(|w| w.to_lowercase()).collect::<Vec<_>>().join(" ");
        let mnemonic = bip39::Mnemonic::parse_normalized(&normalized).map_err(|e| format!("That recovery phrase isn't valid: {e}"))?;
        let seed = mnemonic.to_seed("");
        let master = Xpriv::new_master(Network::Bitcoin, &seed).map_err(|e| e.to_string())?;
        let path = DerivationPath::from_str(ACCOUNT).map_err(|e| e.to_string())?;
        let account = master.derive_priv(&secp, &path).map_err(|e| e.to_string())?;
        Ok((Keys { secp, master: Some(master), source: Source::Account(account) }, "phrase"))
    }

    fn key(&self, change: bool, index: u32) -> Result<(SecretKey, CompressedPublicKey), String> {
        let sk = match &self.source {
            Source::Single(sk) => *sk,
            Source::Account(account) => {
                let path = DerivationPath::from_str(&format!("m/{}/{}", u32::from(change), index)).map_err(|e| e.to_string())?;
                account.derive_priv(&self.secp, &path).map_err(|e| e.to_string())?.private_key
            }
        };
        let pk = CompressedPublicKey::from_private_key(&self.secp, &PrivateKey::new(sk, Network::Bitcoin)).map_err(|e| e.to_string())?;
        Ok((sk, pk))
    }

    fn address(&self, change: bool, index: u32) -> Result<String, String> {
        let (_, pk) = self.key(change, index)?;
        encode_p2wpkh(&pk)
    }

    fn single(&self) -> bool {
        matches!(self.source, Source::Single(_))
    }

    /// every address to watch, with its chain and index
    fn watched(&self, receive_count: u32) -> Result<Vec<(String, bool, u32)>, String> {
        if self.single() {
            return Ok(vec![(self.address(false, 0)?, false, 0)]);
        }
        let mut out = Vec::new();
        for i in 0..receive_count.max(1) + GAP {
            out.push((self.address(false, i)?, false, i));
        }
        for i in 0..CHANGE_SCAN {
            out.push((self.address(true, i)?, true, i));
        }
        Ok(out)
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
/* wallet list                                                         */
/* ------------------------------------------------------------------ */

struct Active {
    dir: PathBuf,
    reg: Registry,
    meta: WalletMeta,
    keys: Keys,
}

fn active(app: &AppHandle) -> Result<Active, String> {
    let dir = data_dir(app)?;
    let reg = load_registry(&dir)?;
    let id = reg.active.clone().ok_or("There's no wallet yet. Create one first.")?;
    let meta = reg.wallets.iter().find(|w| w.id == id).cloned().ok_or("That wallet is gone.")?;
    let secret = secret::load(&dir, &id)?.ok_or("This wallet's key is missing from the keychain.")?;
    let (keys, _) = Keys::from_secret(&secret)?;
    Ok(Active { dir, reg, meta, keys })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSummary {
    id: String,
    name: String,
    kind: String,
    /// the wallet's first address
    address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletInfo {
    exists: bool,
    active: Option<String>,
    wallets: Vec<WalletSummary>,
    /// the active wallet's first address
    address: Option<String>,
    /// where secrets are kept: "keychain" or "file"
    storage: &'static str,
}

#[tauri::command]
pub fn wallet_info(app: AppHandle) -> Result<WalletInfo, String> {
    let dir = data_dir(&app)?;
    let reg = load_registry(&dir)?;
    let mut wallets = Vec::new();
    for w in &reg.wallets {
        let address = match secret::load(&dir, &w.id)? {
            Some(s) => Keys::from_secret(&s).and_then(|(k, _)| k.address(false, 0)).unwrap_or_default(),
            None => String::new(),
        };
        wallets.push(WalletSummary { id: w.id.clone(), name: w.name.clone(), kind: w.kind.clone(), address });
    }
    let address = reg.active.as_ref().and_then(|a| wallets.iter().find(|w| &w.id == a)).map(|w| w.address.clone());
    Ok(WalletInfo { exists: !wallets.is_empty(), active: reg.active.clone(), wallets, address, storage: secret::KIND })
}

fn add_wallet(app: &AppHandle, name: Option<String>, secret_text: &str) -> Result<(String, String), String> {
    let (keys, kind) = Keys::from_secret(secret_text)?;
    let address = keys.address(false, 0)?;
    let dir = data_dir(app)?;
    let mut reg = load_registry(&dir)?;
    // the same keys twice would only confuse balances
    for w in &reg.wallets {
        if let Some(s) = secret::load(&dir, &w.id)? {
            if Keys::from_secret(&s).and_then(|(k, _)| k.address(false, 0)).ok().as_deref() == Some(address.as_str()) {
                return Err(format!("This wallet is already in Saturn as \"{}\".", w.name));
            }
        }
    }
    let id = if reg.wallets.is_empty() && secret::load(&dir, "main")?.is_none() { "main".to_string() } else { new_id() };
    let stored = if kind == "phrase" { secret_text.split_whitespace().map(|w| w.to_lowercase()).collect::<Vec<_>>().join(" ") } else { secret_text.trim().to_string() };
    secret::save(&dir, &id, &stored)?;
    let default_name = match kind {
        "xprv" => "Saturn Core wallet",
        "key" => "Imported address",
        _ if reg.wallets.is_empty() => "Main",
        _ => "Wallet",
    };
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| {
        let n = reg.wallets.iter().filter(|w| w.name.starts_with(default_name)).count();
        if n == 0 { default_name.to_string() } else { format!("{default_name} {}", n + 1) }
    });
    reg.wallets.push(WalletMeta { id: id.clone(), name, kind: kind.to_string(), receive_count: 1, created: now() });
    reg.active = Some(id.clone());
    save_registry(&dir, &reg)?;
    Ok((id, address))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    id: String,
    phrase: String,
    address: String,
}

#[tauri::command]
pub fn wallet_create(app: AppHandle, name: Option<String>, words: Option<usize>) -> Result<Created, String> {
    let words = if words == Some(24) { 24 } else { 12 };
    let phrase = bip39::Mnemonic::generate(words).map_err(|e| e.to_string())?.to_string();
    let (id, address) = add_wallet(&app, name, &phrase)?;
    Ok(Created { id, phrase, address })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    id: String,
    kind: String,
    address: String,
}

/// Add a wallet from a recovery phrase, a Saturn Core descriptor/xprv, or a WIF private key.
#[tauri::command]
pub fn wallet_import(app: AppHandle, secret: String, name: Option<String>) -> Result<Imported, String> {
    let (_, kind) = Keys::from_secret(&secret)?;
    let (id, address) = add_wallet(&app, name, &secret)?;
    Ok(Imported { id, kind: kind.to_string(), address })
}

#[tauri::command]
pub fn wallet_select(app: AppHandle, id: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let mut reg = load_registry(&dir)?;
    if !reg.wallets.iter().any(|w| w.id == id) {
        return Err("That wallet is gone.".into());
    }
    reg.active = Some(id);
    save_registry(&dir, &reg)
}

#[tauri::command]
pub fn wallet_rename(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let mut reg = load_registry(&dir)?;
    let w = reg.wallets.iter_mut().find(|w| w.id == id).ok_or("That wallet is gone.")?;
    let n = name.trim();
    if n.is_empty() {
        return Err("Give the wallet a name.".into());
    }
    w.name = n.chars().take(40).collect();
    save_registry(&dir, &reg)
}

/// The active wallet's secret, for backing it up.
#[tauri::command]
pub fn wallet_reveal(app: AppHandle) -> Result<String, String> {
    let a = active(&app)?;
    secret::load(&a.dir, &a.meta.id)?.ok_or_else(|| "This wallet's key is missing.".into())
}

/// Removes the active wallet from this computer (the coins stay on the network).
#[tauri::command]
pub fn wallet_delete(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let mut reg = load_registry(&dir)?;
    let id = id.or(reg.active.clone()).ok_or("There's no wallet to remove.")?;
    secret::delete(&dir, &id)?;
    reg.wallets.retain(|w| w.id != id);
    if reg.active.as_deref() == Some(id.as_str()) {
        reg.active = reg.wallets.first().map(|w| w.id.clone());
    }
    save_registry(&dir, &reg)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressRow {
    address: String,
    index: u32,
}

/// Receive addresses handed out so far, newest last.
#[tauri::command]
pub fn wallet_addresses(app: AppHandle) -> Result<Vec<AddressRow>, String> {
    let a = active(&app)?;
    if a.keys.single() {
        return Ok(vec![AddressRow { address: a.keys.address(false, 0)?, index: 0 }]);
    }
    (0..a.meta.receive_count.max(1)).map(|i| Ok(AddressRow { address: a.keys.address(false, i)?, index: i })).collect()
}

/// Hand out the next receive address of the active wallet.
#[tauri::command]
pub fn wallet_new_address(app: AppHandle) -> Result<AddressRow, String> {
    let mut a = active(&app)?;
    if a.keys.single() {
        return Err("A wallet imported from one private key has exactly one address.".into());
    }
    let index = a.meta.receive_count.max(1);
    let address = a.keys.address(false, index)?;
    if let Some(w) = a.reg.wallets.iter_mut().find(|w| w.id == a.meta.id) {
        w.receive_count = index + 1;
    }
    save_registry(&a.dir, &a.reg)?;
    Ok(AddressRow { address, index })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Descriptors {
    receive: String,
    change: String,
    /// a ready-to-paste `importdescriptors` argument for saturn-cli
    import: String,
}

/// Private descriptors for importing the active wallet into Saturn Core.
#[tauri::command]
pub fn wallet_descriptors(app: AppHandle) -> Result<Descriptors, String> {
    let a = active(&app)?;
    let (receive, change) = match (&a.keys.source, &a.keys.master) {
        (Source::Single(sk), _) => {
            let wif = PrivateKey::new(*sk, Network::Bitcoin).to_wif();
            let d = format!("wpkh({wif})");
            let d = format!("{d}#{}", descriptor_checksum(&d));
            (d.clone(), d)
        }
        (_, Some(master)) => {
            let base = |chain: u32| {
                let d = format!("wpkh({master}/84h/0h/0h/{chain}/*)");
                format!("{d}#{}", descriptor_checksum(&d))
            };
            (base(0), base(1))
        }
        (Source::Account(account), None) => {
            let base = |chain: u32| {
                let d = format!("wpkh({account}/{chain}/*)");
                format!("{d}#{}", descriptor_checksum(&d))
            };
            (base(0), base(1))
        }
    };
    let import = if a.keys.single() {
        serde_json::json!([{ "desc": receive, "timestamp": 0 }]).to_string()
    } else {
        serde_json::json!([
            { "desc": receive, "timestamp": 0, "active": true, "internal": false },
            { "desc": change, "timestamp": 0, "active": true, "internal": true }
        ])
        .to_string()
    };
    Ok(Descriptors { receive, change, import })
}

/* ------------------------------------------------------------------ */
/* balance and sending                                                 */
/* ------------------------------------------------------------------ */

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
    let a = active(&app)?;
    balance_with(&a.keys, a.meta.receive_count, &api).await
}

async fn balance_with(keys: &Keys, receive_count: u32, api: &str) -> Result<Balance, String> {
    let addrs: Vec<String> = keys.watched(receive_count)?.into_iter().map(|(a, _, _)| a).collect();
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

/// Build, sign and broadcast a payment from the active wallet. `amount_sats = None` sends
/// everything spendable (minus the fee).
#[tauri::command]
pub async fn wallet_send(app: AppHandle, api: String, to: String, amount_sats: Option<u64>, fee_rate: Option<f64>) -> Result<Sent, String> {
    let a = active(&app)?;
    send_with(&a.keys, a.meta.receive_count, &api, &to, amount_sats, fee_rate).await
}

async fn send_with(keys: &Keys, receive_count: u32, api: &str, to: &str, amount_sats: Option<u64>, fee_rate: Option<f64>) -> Result<Sent, String> {
    let dest = script_for(to)?;
    let fee_rate = fee_rate.unwrap_or(2.0).clamp(1.0, 500.0);
    let watched = keys.watched(receive_count)?;
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
        // change goes to the wallet's change chain (or back to the one address of a single key)
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

    const ABANDON: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    // BIP84 test vector (account 0, first receive address), re-encoded with Saturn's prefix
    #[test]
    fn bip84_vector() {
        let (k, kind) = Keys::from_secret(ABANDON).unwrap();
        assert_eq!(kind, "phrase");
        let a = k.address(false, 0).unwrap();
        let (_, _, program) = segwit::decode("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").unwrap();
        let hrp = Hrp::parse(HRP).unwrap();
        assert_eq!(a, segwit::encode(hrp, segwit::VERSION_0, &program).unwrap());
    }

    // the same keys arrive through every import form and give the same addresses
    #[test]
    fn descriptor_and_xprv_imports_match_the_phrase() {
        let (k, _) = Keys::from_secret(ABANDON).unwrap();
        let master = k.master.unwrap();
        let want = k.address(false, 3).unwrap();
        let d = format!("wpkh({master}/84h/0h/0h/0/*)");
        let desc = format!("{d}#{}", descriptor_checksum(&d));
        for secret in [desc, master.to_string()] {
            let (k2, kind) = Keys::from_secret(&secret).unwrap();
            assert_eq!(kind, "xprv");
            assert_eq!(k2.address(false, 3).unwrap(), want);
        }
        // a descriptor with key origin carries the account key itself
        let Source::Account(account) = &k.source else { panic!() };
        let with_origin = format!("wpkh([73c5da0a/84h/0h/0h]{account}/0/*)");
        let (k3, _) = Keys::from_secret(&with_origin).unwrap();
        assert_eq!(k3.address(false, 3).unwrap(), want);
    }

    #[test]
    fn picks_the_wpkh_receive_descriptor_from_listdescriptors() {
        let (k, _) = Keys::from_secret(ABANDON).unwrap();
        let m = k.master.unwrap();
        let pasted = format!(
            r#"{{"descriptors": [ {{"desc": "pkh({m}/44h/0h/0h/0/*)#aaaa"}}, {{"desc": "sh(wpkh({m}/49h/0h/0h/0/*))#bbbb"}},
            {{"desc": "wpkh({m}/84h/0h/0h/1/*)#cccc"}}, {{"desc": "wpkh({m}/84h/0h/0h/0/*)#dddd", "active": true}}, {{"desc": "tr({m}/86h/0h/0h/0/*)#eeee"}} ]}}"#
        );
        let (k2, kind) = Keys::from_secret(&pasted).unwrap();
        assert_eq!(kind, "xprv");
        assert_eq!(k2.address(false, 0).unwrap(), k.address(false, 0).unwrap());
    }

    #[test]
    fn single_key_import() {
        let (k, _) = Keys::from_secret(ABANDON).unwrap();
        let (sk, _) = k.key(false, 0).unwrap();
        let wif = PrivateKey::new(sk, Network::Bitcoin).to_wif();
        let (k2, kind) = Keys::from_secret(&wif).unwrap();
        assert_eq!(kind, "key");
        assert_eq!(k2.address(false, 0).unwrap(), k.address(false, 0).unwrap());
        assert_eq!(k2.watched(5).unwrap().len(), 1);
    }

    #[test]
    fn checksum_matches_bip380() {
        assert_eq!(descriptor_checksum("raw(deadbeef)"), "89f8spxm");
    }

    #[test]
    fn rejects_other_coins() {
        assert!(script_for("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").is_err());
        assert!(script_for("sat1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu").is_err()); // bad checksum
        assert!(Keys::from_secret("hello world").is_err());
    }

    /// End-to-end against a pool on a regtest chain:
    /// `SATURN_TEST_HRP=bcrt SATURN_TEST_API=http://127.0.0.1:38081 SATURN_TEST_SECRET="…" SATURN_TEST_TO=bcrt1… cargo test live_wallet -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live_wallet() {
        let api = std::env::var("SATURN_TEST_API").unwrap();
        let (k, kind) = Keys::from_secret(&std::env::var("SATURN_TEST_SECRET").unwrap()).unwrap();
        println!("{kind} wallet, receive address {}", k.address(false, 0).unwrap());
        let b = balance_with(&k, 1, &api).await.unwrap();
        println!("spendable {} immature {} coins {}", b.spendable_sats, b.immature_sats, b.coins.len());
        let to = std::env::var("SATURN_TEST_TO").unwrap();
        let sent = send_with(&k, 1, &api, &to, Some(1_2345_6789), None).await.unwrap();
        println!("sent {} fee {} txid {}", sent.amount_sats, sent.fee_sats, sent.txid);
    }
}
