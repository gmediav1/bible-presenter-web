# Bible Presenter für Windows – Umsetzungsplan

## Schutz der bestehenden ChurchPresenter-App

Die neue Anwendung erhält eine eigene Windows-App-ID (`de.gwinnmedia.biblepresenter`) und verwendet ausschließlich ihren eigenen Datenordner `%APPDATA%/Bible Presenter`. Sie liest, ändert oder löscht keine Dateien, Einstellungen, Caches oder Installationsdaten von ChurchPresenter.

## Phase 1 – Desktop-Grundlage ✓

- Electron in dieses Repository integrieren.
- Ein separates Steuerfenster mit der bestehenden Web-Oberfläche starten.
- Eigenen App-Namen, App-ID und Datenordner festlegen.
- Den Vite-Build lokal aus der installierten App laden.

**Ergebnis:** Die Bible-Presenter-Oberfläche startet als eigenständige Desktop-Anwendung, ohne ChurchPresenter zu berühren.

## Phase 2 – Präsentationsfenster und zweiter Bildschirm ✓

- Ein echtes Ausgabefenster statt eines Browser-Pop-ups erstellen.
- Angeschlossene Bildschirme erkennen.
- Ausgabe bevorzugt auf Bildschirm 2 öffnen, randlos und im Vollbild.
- Bibelstelle, Übersetzung und Design sofort zwischen Steuerung und Ausgabe synchronisieren.

**Ergebnis:** Ein Programm mit zwei synchronisierten Fenstern, nicht zwei installierte Apps. Das Steuerfenster übergibt den Zustand direkt an Electron; die Ausgabe startet auf dem zweiten Bildschirm im Vollbild. Ohne zweiten Bildschirm öffnet sich eine normale Ausgabe, damit die Steuerung sichtbar bleibt.

## Phase 3 – Lokaler Cache und Einstellungen

- Bibelstellen und Übersetzungsmetadaten dauerhaft im eigenen App-Datenordner cachen.
- Einstellungen wie zuletzt gewählte Übersetzung, Fenstergrößen und Ausgabebildschirm speichern.
- Optionalen, nur lesenden Import aus ChurchPresenter als getrennte Funktion anbieten.

**Ergebnis:** Bereits verwendete Stellen starten schnell und bleiben ohne Netz verfügbar.

## Phase 4 – Windows-Installer und Updates

- Einen separaten `.exe`-Installer erzeugen.
- Eigenen Startmenü-Eintrag, Desktop-Symbol und Deinstallations-Eintrag anlegen.
- Update-Kanal konfigurieren, ohne die Web-App oder ChurchPresenter zu beeinflussen.

**Ergebnis:** Sauber installierbare Windows-Anwendung.

## Phase 5 – Abnahme auf Windows-Hardware

- Test mit einem und mit zwei Bildschirmen sowie HDMI/USB-C-Beamer.
- Vollbild, Wechsel des Ausgabebildschirms, Scrollen und große Versnummern prüfen.
- Jede verfügbare Übersetzung und den Cache testen.
- Installer und Deinstallation testen; ChurchPresenter muss unverändert bleiben.

**Ergebnis:** Release-Kandidat für Windows.
