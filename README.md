# Bible Presenter Web

Eine schlanke Präsentations-Webapp für die acht Übersetzungen aus ChurchPresenter.

Über **Ausgabefenster öffnen** wird eine getrennte, live synchronisierte Ausgabe für einen zweiten Bildschirm gestartet. Die Vollbild-Schaltfläche befindet sich direkt im Ausgabefenster.

Die Bibelstellen-Suche erkennt die englischen und deutschen Kürzel der lokalen App für alle 66 Bücher. Beispiele: `Mat 5:3-10`, `Ps 23`, `Joh 3:16` oder `1 Kor 13`. Vorschläge lassen sich per Maus oder mit Pfeiltasten und Enter auswählen.

Einmal geladene Stellen werden pro Übersetzung bis zu 30 Tage lokal im Browser gespeichert. Das Ausgabefenster synchronisiert sich laufend mit dem Bedienfenster und ist bei längeren Abschnitten scrollbar.

## Lokaler Start

```bash
npm install
npm run dev
```

Für Live-Bibeltexte braucht die Netlify-Funktion die geheime Umgebungsvariable `YOUVERSION_APP_KEY`. Sie wird ausschließlich serverseitig verwendet und ist nicht im Browser oder GitHub enthalten.
