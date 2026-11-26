# lens-gate – Tor und KI-Bildbewertung für PPS Lens · v1 (= früher lens-api v2)

Cloudflare-Worker, aufgebaut wie `books-gate`. Nimmt ein Foto von der App PPS Lens entgegen, lässt es von OpenAI bewerten (wie der KI-Coach) und speichert das Ergebnis im Supabase-Projekt **„Web Login“** – gleiches Konto wie web und PPS Books.

v2: nach dem Datenschutz-Konzept – Einwilligung mit Nachweis, Bildrechte bestätigen, Metadaten (GPS, Seriennummer) werden entfernt, kein Speichern des Fotos, Löschen und Export für Nutzer, Testseite `/test`.

## Adressen
- `GET /` – Name und Version
- `GET /test` – **Testseite**: anmelden, zustimmen, Foto bewerten, Verlauf/Export/Löschen
- `GET /stand` – Plan, genutzt, Limit, Einwilligung
- `POST /einwilligung` – `{ erteilt: true | false }`
- `POST /bewerten` – Foto bewerten (`bild` als JPEG, `rechte: true`)
- `GET /verlauf` – letzte 50 Bewertungen
- `POST /loeschen` – `{ id }` oder `{ alle: true }`
- `GET /export` – alle gespeicherten Daten des Nutzers

Alles außer `/` und `/test` braucht `Authorization: Bearer <Anmelde-Token aus Supabase Web Login>`.

## Pläne
free 3 / pro 300 Bewertungen je Monat · Pro = MemberAbo (629796), weitere Produkte über Tabelle `lc_pro_produkte` · Admin support@prophotoskills.com immer Pro.

## Variablen in Cloudflare
- `SUPABASE_URL` = https://rkgjuqdkwaaymkruyhvy.supabase.co
- `SUPABASE_ANON_KEY` = öffentlicher anon-Schlüssel (nie den service_role-Schlüssel!)
- `OPENAI_API_KEY` = OpenAI-Schlüssel (als Geheimnis)
- `OPENAI_MODEL` = gpt-4o-mini (optional)
- `ALLOWED_ORIGINS` = Adresse der App PPS Lens, mehrere mit Komma (für `/test` nicht nötig)

## Datenbank
`supabase/20261126140000_lens_v2.sql` einmal im SQL Editor von „Web Login“ ausführen (darf mehrfach laufen, auch nach v1; die v1-Datei wird nicht gebraucht).

## Lokal starten (für Entwickler)
`npm install` → Datei `.dev.vars` mit den Variablen oben anlegen (wird nicht hochgeladen) → `npm run dev` → http://localhost:8787/test
