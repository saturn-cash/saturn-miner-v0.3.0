# Saturn on iPhone and iPad

## What the iOS app can be

Apple's App Store rules don't allow on-device mining ("Apps may not mine for cryptocurrencies unless the
processing is performed off device"). So the iOS app is a **companion**, not a miner:

- **Pool dashboard**: your hashrate, shares and payouts on `pool.saturn.boats`, per worker
- **Bitaxe control** on your home Wi-Fi: the same Hardware screen as desktop (stats, Point at Saturn, clocks, fan)
- **Block-found alerts**: push notification + the supernova when your rig or the pool finds a block
- **The Saturn system**: same 3D flight and liquid-glass UI, tuned for battery

Wallet features (sending SAT) need extra care: Apple only accepts crypto wallet apps from developers
enrolled as an **organization**, not an individual.

## How it gets built

Tauri 2 supports iOS from this same codebase:

```bash
pnpm tauri ios init      # creates src-tauri/gen/apple (Xcode project)
pnpm tauri ios dev       # run in the iOS simulator
pnpm tauri ios build     # .ipa for TestFlight / App Store
```

Needs: a Mac with Xcode, and an Apple Developer Program membership ($99/year) to put it on real devices,
TestFlight or the App Store.

## Work still to do before it's worth shipping

1. A **pool stats API** client (the pool's public endpoints) so the dashboard shows real numbers without a node.
2. Hide the desktop-only parts on iOS (CPU miner controls, local node RPC).
3. Local-network permission text for Bitaxe discovery (`NSLocalNetworkUsageDescription`).
4. Push notifications for block-found and Bitaxe-offline alerts.
5. A lighter 3D quality preset for phones.
