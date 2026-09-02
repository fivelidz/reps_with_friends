# RWF TWA keystore

Local-only signing keystore for the Reps With Friends Trusted Web Activity APK
(bubblewrap build). Fine for a prototype — do NOT use for Play Store production.

- **Keystore file:** `apps/twa/rwf.keystore`
- **Keystore password:** `rwf-twa-2026`
- **Key alias:** `rwf`
- **Key password:** `rwf-twa-2026` (same as keystore)
- **Key algo:** RSA 2048, valid 10000 days (2026 → 2054)
- **Distinguished name:** `CN=Reps With Friends, OU=RWF, O=Qalarc, L=Sydney, C=AU`
- **Created:** 2026-09-02

## Signing certificate SHA256 fingerprint

```
81:46:14:C1:AD:93:16:F6:53:D3:A9:18:83:97:D2:36:30:39:C8:B3:01:DC:70:11:EC:4B:6F:2D:8B:E8:DC:2A
```

This fingerprint must appear in `https://rwf.qalarc.com/.well-known/assetlinks.json`
(source-controlled at `apps/twa/assetlinks.json`, copied by `scripts/build-deploy.sh`)
for the TWA to launch without the Chrome address bar. Until the site is redeployed
with that file, the APK opens the app inside a Chrome Custom Tab bubble — still a
real launcher icon, acceptable for prototype installs.

## Rebuild

```bash
cd apps/twa
printf 'rwf-twa-2026\n' | bunx @bubblewrap/cli build --skipPwaValidation
# → app-release-signed.apk
```

## History

- 2026-09-02 first init (previous attempt, package `com.qalarc.rwf`, keystore
  `android.keystore` with lost password) archived in `archive_init_20260902/`.
  `android.keystore` is unused — kept for the archive record.
- 2026-09-02 rebuilt with package `com.qalarc.repswithfriends` + this keystore.
