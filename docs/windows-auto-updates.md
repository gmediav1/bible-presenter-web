# Automatische Windows-Updates

Die installierte Bible-Presenter-App prüft beim Start die öffentlichen GitHub-Releases von `gmediav1/bible-presenter-web`.
Netlify wird dafür nicht verwendet.

## Neue Version veröffentlichen

1. Die Versionsnummer in `package.json` erhöhen.
2. `npm test` ausführen.
3. `npm run package:win:update` ausführen. Dadurch entstehen in `release/`:
   - `Bible-Presenter-Setup-<Version>.exe`
   - `Bible-Presenter-Setup-<Version>.exe.blockmap`
   - `latest.yml`
4. `npm run publish:win-update` ausführen. Der Befehl veröffentlicht alle drei Dateien als öffentlichen GitHub-Release.

Beim nächsten Start erkennt eine bereits installierte App die höhere Version, fragt vor dem Download nach und kann sich nach dem Download neu starten und aktualisieren.

Die portable Version ist bewusst ausgenommen: Sie wird nicht installiert und aktualisiert sich daher nicht selbst.
