# Bible Presenter Web

Eine schlanke Präsentations-Webapp für die sieben Übersetzungen aus ChurchPresenter.

Über **Ausgabefenster öffnen** wird eine getrennte, live synchronisierte Ausgabe für einen zweiten Bildschirm gestartet. Die Vollbild-Schaltfläche befindet sich direkt im Ausgabefenster.

## Lokaler Start

```bash
npm install
npm run dev
```

Für Live-Bibeltexte braucht die Netlify-Funktion die geheime Umgebungsvariable `YOUVERSION_APP_KEY`. Sie wird ausschließlich serverseitig verwendet und ist nicht im Browser oder GitHub enthalten.
