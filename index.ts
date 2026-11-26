// lens-gate – Worker hinter der KI-Bildbewertung von PPS Lens (v3)
// v3 (26.11.2026, Claude): mehr PPS (Eric 26.11.: „mehr Intelligenz … das PPS-Universum da noch mehr abbilden … grafische
//     Elemente, wo wir etwas zeigen können“ → „1, ja … mach mal weiter“):
//   - PPS-Haltung wie im KI-Coach im Prompt, dazu ein „merksatz“ im PPS-Ton
//   - jeder Tipp kann auf eine passende PPS-Lektion zeigen: tips[].link = { titel, url, code, modul, produkt }
//     (135 öffentliche Artikel auf prophotoskills.com, Liste in lektionen.ts – wie im KI-Coach)
//   - markers: bis zu 5 Punkte im Bild { x, y (0..1, 0/0 = oben links), label, art: staerke|problem|hinweis, kat }
//     – Format mit dem App-Thread abgestimmt. Positionen sind ungefähr (die KI schätzt sie).
//   - Testseite zeichnet die Punkte auf das Foto und zeigt die Lektions-Links
//   Antwort bleibt abwärtskompatibel (nur neue, optionale Felder).
// v2 (26.11.2026, Claude): nur Testseite – Fortschritt und Fehler werden angezeigt, Bild-Laden mit Ausweichweg.
// v1 (26.11.2026, Claude): Name lens-gate wie books-gate (Eric 26.11.: „beim Worker und bei Cloudflare lege ich das an mit
//     Lensgate“). Inhalt = lens-api_v2 (Datenschutz-Fassung), sonst unverändert. Frühere Stände hießen lens-api:
// lens-api v2 (26.11.2026, Claude): nach dem Datenschutz-Konzept (konzept_datenschutz_foto_bewertungs_app.md) überarbeitet
//     (Eric 26.11.: „Kannst du diesen Worker, den du gebaut hast, daraufhin nochmal checken, nochmal einen neuen
//     erstellen und mir sagen, wie wir den einmal zum Sehen kriegen?“):
//   - Einwilligung: ohne gespeicherte Einwilligung („Foto geht zur Bewertung an OpenAI“, Textversion
//     DATENSCHUTZ_VERSION) geht kein Foto raus → 428 einwilligung. Geben/Widerrufen: POST /einwilligung
//   - Bildrechte: jede Bewertung braucht rechte: true („Ich habe die Rechte an diesem Foto“) → sonst 400
//   - Datensparsamkeit: nur JPEG; der Worker entfernt vor dem Versand ALLE Metadaten-Blöcke aus dem JPEG
//     (EXIF mit GPS/Seriennummer, XMP, IPTC, Kommentare) – auch wenn die App das schon getan hat.
//     An die KI gehen nur Kamera, Brennweite, Blende, Zeit, ISO (als Text).
//   - OpenAI mit store: false (Anfrage wird bei OpenAI nicht als gespeicherte Unterhaltung abgelegt;
//     API-Daten werden von OpenAI standardmäßig nicht zum Training genutzt)
//   - Vorschaubild wird nur gespeichert, wenn der Nutzer es will (verlaufBild: true)
//   - Löschen (Art. 17): POST /loeschen { id } oder { alle: true } · Meine Daten (Art. 15/20): GET /export
//   - Testseite: GET /test – Anmelden mit dem Web-Login-Konto, Foto wählen, Ergebnis sehen
// lens-api v1 (26.11.2026, Claude): erste Fassung.
// Ablage: Repo lens-gate (noch nicht angelegt; Repo lens bleibt frei für die App) · Brain 1_web/25_lens-gate/dateien/lens-gate_vN
//
// Aufbau wie books-gate (einfacher Cloudflare-Worker, keine Lovable-App):
//   - Ausweis = Anmelde-Token aus Supabase „Web Login“ (rkgjuq…), als „Authorization: Bearer …“.
//     Der Worker fragt Supabase mit genau diesem Token – KEIN service_role-Schlüssel. Plan, Kontingent,
//     Einwilligung und Speichern regeln Datenbank-Funktionen (SQL in ./supabase/).
//   - KI wie beim KI-Coach (app): OpenAI direkt, Schlüssel OPENAI_API_KEY nur in Cloudflare, Standard gpt-4o-mini.
//
// Adressen:
//   GET  /             → Name, Version, Adressen
//   GET  /test         → Testseite im Browser
//   GET  /stand        → { plan, genutzt, limit, monat, einwilligung, version }
//   POST /einwilligung → { erteilt: true|false } – speichert/widerruft die Einwilligung (Textversion DATENSCHUTZ_VERSION)
//   POST /bewerten     → Foto bewerten (JSON, siehe unten) → Ergebnis im Format des Dummys
//   GET  /verlauf      → die letzten 50 Bewertungen (mit Vorschaubild: ?mitBild=1)
//   POST /loeschen     → { id } eine Bewertung · { alle: true } alle Bewertungen
//   GET  /export       → alles, was Lens über den Nutzer gespeichert hat (JSON)
//
// POST /bewerten – Inhalt (JSON):
//   bild        (Pflicht) data:image/jpeg;base64,… – die App verkleinert vorher auf max. 1600 px
//   rechte      (Pflicht) true = „Ich habe die Rechte an diesem Foto und auf erkennbaren Personen ist das okay“
//   exif        (optional) { camera, focal, aperture, shutter, iso } – liest die App vor dem Verkleinern aus
//   dateiname   (optional) für den Titel
//   thumb       (optional) kleines Vorschaubild (data:image/jpeg, ≤ 40 000 Zeichen)
//   verlaufBild (optional) true = Vorschaubild im Verlauf speichern (Standard: nein)
//   sprache     (optional) de · en · fr · it · es · pt · el · ja (Standard de)
//
// Antworten: 200 Ergebnis · 400 Bild/Rechte fehlen · 401 nicht angemeldet · 402 Kontingent aufgebraucht
//            413 Bild zu groß · 422 kein Foto erkannt (zählt nicht) · 428 Einwilligung fehlt · 502 KI/Datenbank
//
// Variablen in Cloudflare (Einstellungen → Variablen und Geheimnisse):
//   SUPABASE_URL      = https://rkgjuqdkwaaymkruyhvy.supabase.co   (Projekt „Web Login“)
//   SUPABASE_ANON_KEY = der öffentliche „anon“-Schlüssel dieses Projekts (KEIN service_role!)
//   OPENAI_API_KEY    = OpenAI-Schlüssel (als Geheimnis!)
//   OPENAI_MODEL      = gpt-4o-mini   (optional)
//   ALLOWED_ORIGINS   = Adresse der App PPS Lens, z. B. https://lens.prophotoskills.workers.dev,http://localhost:5173
//                       (die Testseite /test braucht keinen Eintrag – sie läuft auf dem Worker selbst)

import { testseite } from "./testseite";
import { LEKTIONEN, PRODUKT_VON_MODUL } from "./lektionen";

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}

const VERSION = 3;
// Version des Einwilligungstextes – ändert sich der Text in der App, hier hochzählen → alle willigen neu ein
export const DATENSCHUTZ_VERSION = "2026-11-26";
const MAX_BILD_ZEICHEN = 6_000_000; // ≈ 4,5 MB Bild
const MAX_THUMB_ZEICHEN = 40_000;

// ---------- Inhalte, die die KI kennen muss (gleich wie im Dummy) ----------

export const KATEGORIEN = {
  comp: "Bildaufbau & Linienführung",
  light: "Licht & Kontrastumfang",
  sharp: "Schärfe & Fokus-Ebene",
  color: "Farbharmonie & Look",
} as const;
type Kat = keyof typeof KATEGORIEN;
const KAT_KEYS = Object.keys(KATEGORIEN) as Kat[];

// Preset-Vorschlag: gleiche IDs wie PRESETS im Dummy
export const PRESETS = [
  { id: 1, name: "CyberRain Teal & Amber", mood: "Nacht, Regen & Neonlicht" },
  { id: 2, name: "Golden Skin Soft Glow", mood: "Porträt & Gegenlicht" },
  { id: 3, name: "CineLog Kodak 2383", mood: "S-Log3 / C-Log Film-Look" },
  { id: 4, name: "Nordic Mist & Peaks", mood: "Berge, Nebel & Morgenlicht" },
  { id: 5, name: "Monochrome Leica Contrast", mood: "Street & Architektur S/W" },
  { id: 6, name: "Anamorphic Night Drift", mood: "Automotive & Night Reels" },
];

// Symbole für die 3 Tipps (Font-Awesome-Namen wie im Dummy)
export const ICONS = [
  "fa-sun", "fa-moon", "fa-table-cells", "fa-circle-half-stroke", "fa-palette", "fa-bullseye", "fa-eye",
  "fa-sliders", "fa-shoe-prints", "fa-crop-simple", "fa-stopwatch", "fa-layer-group", "fa-compass", "fa-filter",
  "fa-lightbulb",
];

const SPRACHEN: Record<string, string> = {
  de: "Deutsch", en: "English", fr: "Français", it: "Italiano", es: "Español", pt: "Português", el: "Ελληνικά", ja: "日本語",
};

// ---------- Hilfen ----------

function corsHeaders(request: Request, env: Env): Headers {
  const h = new Headers();
  const origin = request.headers.get("Origin");
  const erlaubt = (env.ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (origin && (erlaubt.includes(origin) || erlaubt.includes("*"))) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function json(data: unknown, status: number, extra: Headers): Response {
  const h = new Headers(extra);
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}

function tokenAus(request: Request): string | null {
  const m = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

class Fehler extends Error {
  status: number;
  daten: Record<string, unknown>;
  constructor(status: number, daten: Record<string, unknown>) {
    super(String(daten.fehler ?? status));
    this.status = status;
    this.daten = daten;
  }
}

// ---------- Supabase (immer mit dem Token des Nutzers) ----------

async function supabase(env: Env, token: string, pfad: string, init: RequestInit = {}): Promise<unknown> {
  const sbUrl = clean(env.SUPABASE_URL).replace(/\/+$/, "");
  const anon = clean(env.SUPABASE_ANON_KEY);
  if (!sbUrl || !anon) throw new Fehler(500, { fehler: "SUPABASE_URL/SUPABASE_ANON_KEY fehlen im Worker" });
  const res = await fetch(`${sbUrl}${pfad}`, {
    ...init,
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) throw new Fehler(401, { fehler: "Anmeldung nötig oder abgelaufen" });
  if (!res.ok) throw new Fehler(502, { fehler: "Datenbank nicht erreichbar", details: `Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` });
  return res.json();
}

export type Stand = { plan: string; genutzt: number; limit: number; monat: string; einwilligung: boolean; version?: string };

async function rpc(env: Env, token: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return supabase(env, token, `/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

async function stand(env: Env, token: string): Promise<Stand> {
  const s = (await rpc(env, token, "lc_mein_stand", { p_version: DATENSCHUTZ_VERSION })) as Stand;
  if (!s || s.plan === "keins") throw new Fehler(401, { fehler: "Anmeldung nötig oder abgelaufen" });
  return { ...s, version: DATENSCHUTZ_VERSION };
}

// ---------- Datensparsamkeit: Metadaten aus dem JPEG entfernen ----------

function base64ZuBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesZuBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Behält nur, was zum Anzeigen nötig ist: JFIF (APP0), Farbprofil (APP2 „ICC_PROFILE“), Adobe-Farbinfo (APP14)
// und die Bilddaten. Entfernt EXIF/XMP (APP1, u. a. GPS, Seriennummer), IPTC (APP13), übrige APPn und Kommentare.
export function jpegOhneMetadaten(bytes: Uint8Array): { bytes: Uint8Array; entfernt: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("kein JPEG");
  const teile: Uint8Array[] = [bytes.subarray(0, 2)];
  let o = 2;
  let entfernt = 0;
  while (o + 4 <= bytes.length) {
    if (bytes[o] !== 0xff) throw new Error("JPEG beschädigt");
    const m = bytes[o + 1];
    if (m === 0xff) { o++; continue; }               // Füllbyte
    if (m === 0xda) { teile.push(bytes.subarray(o)); o = bytes.length; break; } // Bilddaten bis zum Ende
    if (m === 0xd9) { teile.push(bytes.subarray(o, o + 2)); o += 2; break; }
    const len = (bytes[o + 2] << 8) | bytes[o + 3];
    const seg = bytes.subarray(o, o + 2 + len);
    const istIcc = m === 0xe2 && String.fromCharCode(...seg.subarray(4, 15)) === "ICC_PROFILE";
    const weg = (m >= 0xe1 && m <= 0xef && m !== 0xee && !istIcc) || m === 0xfe;
    if (weg) entfernt++; else teile.push(seg);
    o += 2 + len;
  }
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let p = 0;
  for (const t of teile) { out.set(t, p); p += t.length; }
  return { bytes: out, entfernt };
}

// ---------- KI (OpenAI, wie im KI-Coach direkt ohne Gateway) ----------

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ist_foto", "titel", "genre", "scores", "notes", "summary", "merksatz", "tips", "markers", "preset"],
  properties: {
    ist_foto: { type: "boolean", description: "false, wenn das Bild kein Foto ist (Screenshot, Grafik, Text, leer)" },
    titel: { type: "string", description: "kurzer Bildtitel, 2–6 Wörter" },
    genre: { type: "string", description: "z. B. Street, Porträt, Landschaft, Architektur, Produkt, Automotive" },
    scores: {
      type: "object",
      additionalProperties: false,
      required: KAT_KEYS,
      properties: Object.fromEntries(KAT_KEYS.map((k) => [k, { type: "number", description: `${KATEGORIEN[k]}, 0–10, eine Nachkommastelle` }])),
    },
    notes: {
      type: "object",
      additionalProperties: false,
      required: KAT_KEYS,
      properties: Object.fromEntries(KAT_KEYS.map((k) => [k, { type: "string", description: `ein Satz zu ${KATEGORIEN[k]}` }])),
    },
    summary: { type: "string", description: "2–3 Sätze: größte Stärke und wo am meisten zu holen ist" },
    merksatz: { type: "string", description: "ein kurzer Satz im PPS-Ton, der den wichtigsten Gedanken zu diesem Bild auf den Punkt bringt" },
    tips: {
      type: "array",
      description: "genau 3 konkrete, umsetzbare Tipps, wichtigster zuerst",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["icon", "label", "text", "lektion"],
        properties: {
          icon: { type: "string", enum: ICONS },
          label: { type: "string", description: "1–2 Wörter, z. B. Belichtung" },
          text: { type: "string", description: "ein Satz mit konkretem Wert (EV, mm, s, Regler)" },
          lektion: { type: "string", enum: [...LEKTIONEN.map((l) => l.code), "KEINE"], description: "Code der PPS-Lektion, die genau dieses Thema vertieft, sonst KEINE" },
        },
      },
    },
    markers: {
      type: "array",
      description: "0–5 Stellen im Bild, die du zeigen willst (Hauptmotiv, ausgefressene Lichter, Störer am Rand, Fluchtpunkt …)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "label", "art", "kat"],
        properties: {
          x: { type: "number", description: "waagerecht 0 (links) bis 1 (rechts), Mitte der Stelle" },
          y: { type: "number", description: "senkrecht 0 (oben) bis 1 (unten), Mitte der Stelle" },
          label: { type: "string", description: "höchstens 40 Zeichen, z. B. „Lichter fressen aus“" },
          art: { type: "string", enum: ["staerke", "problem", "hinweis"] },
          kat: { type: "string", enum: KAT_KEYS },
        },
      },
    },
    preset: { type: "integer", enum: PRESETS.map((p) => p.id) },
  },
};

export function systemPrompt(sprache: string): string {
  return [
    "Du bist der KI-Foto-Coach von ProPhotoSkills (PPS Lens). Du bewertest Fotos wie ein erfahrener Profi-Fotograf und Fotolehrer:",
    "ehrlich, wertschätzend, konkret – kein Marketing-Ton, keine Floskeln. Sprich den Nutzer mit „du“ an.",
    "",
    "Bewerte vier Kategorien auf einer Skala von 0 bis 10 (eine Nachkommastelle):",
    ...KAT_KEYS.map((k) => `- ${k}: ${KATEGORIEN[k]}`),
    "Maßstab: 5 = solides Handyfoto ohne Gestaltung, 7 = gute Amateur-Arbeit, 8,5 = professionell, ab 9,5 nur Ausnahmebilder.",
    "Nutze die ganze Skala; nicht jedes Bild ist 8. Bewerte, was im Bild zu sehen ist, nicht was die EXIF-Daten vermuten lassen.",
    "",
    "Tipps: genau 3, sofort beim nächsten Foto oder in Lightroom umsetzbar, mit konkreten Werten (z. B. -0,7 EV, 1/60 s, Tiefen +25).",
    "Haltung (ProPhotoSkills, Eric P.): „Fotografie beginnt nicht mit der Kamera. Sie beginnt im Kopf.“ Verbinde Technik mit Wahrnehmung,",
    "Vorbereitung und Bildwirkung – wie ein erfahrener Kollege am Set: locker, auf Augenhöhe, nicht belehrend. Emotion vor Perfektion.",
    "",
    "PPS-Lektionen: Gib bei jedem Tipp den Code der Lektion an, die genau dieses Thema vertieft – nur wenn sie wirklich passt, sonst KEINE.",
    "Keine Lektion zweimal. Verkaufe nichts, nenne keine Preise.",
    ...LEKTIONEN.map((l) => `${l.code} [${l.modul}] ${l.titel}`),
    "",
    "Markierungen (markers): Zeige 2–5 Stellen im Bild – mindestens das Hauptmotiv bzw. die größte Stärke und das wichtigste Problem.",
    "x/y = Mitte der Stelle als Anteil der Bildbreite/-höhe (0/0 oben links). Kurze Beschriftung, höchstens 40 Zeichen.",
    "Bei Menschen im Bild: nur Fotografie bewerten (Licht, Pose, Bildschnitt), niemals Aussehen, Körper, Alter oder Herkunft.",
    "Nenne nie Namen, Orte, Adressen, Kennzeichen oder andere Angaben, die eine Person oder einen Ort identifizieren – auch nicht im Titel.",
    "Ist das Bild kein Foto (Screenshot, Grafik, Text, leer), setze ist_foto = false und fülle den Rest kurz aus.",
    "",
    "Preset-Vorschlag (passende ID wählen):",
    ...PRESETS.map((p) => `- ${p.id}: ${p.name} (${p.mood})`),
    "",
    `Schreibe alle Texte auf ${SPRACHEN[sprache] ?? SPRACHEN.de}.`,
  ].join("\n");
}

type KiAntwort = {
  ist_foto: boolean;
  titel: string;
  genre: string;
  scores: Record<Kat, number>;
  notes: Record<Kat, string>;
  summary: string;
  merksatz?: string;
  tips: { icon: string; label: string; text: string; lektion?: string }[];
  markers?: { x: number; y: number; label: string; art: string; kat: string }[];
  preset: number;
};

export function lektionLink(code: string | undefined) {
  const l = LEKTIONEN.find((x) => x.code === code);
  if (!l || !/^https:\/\//.test(l.url)) return undefined;
  return { titel: l.titel, url: l.url, code: l.code, modul: l.modul, produkt: PRODUKT_VON_MODUL[l.modul] ?? null };
}

async function frageKi(env: Env, bild: string, exif: Record<string, string> | null, sprache: string): Promise<{ antwort: KiAntwort; modell: string }> {
  const key = clean(env.OPENAI_API_KEY);
  if (!key) throw new Fehler(500, { fehler: "OPENAI_API_KEY fehlt im Worker" });
  const modell = clean(env.OPENAI_MODEL) || "gpt-4o-mini";
  const exifText = exif
    ? `Aufnahmedaten (EXIF): ${Object.entries(exif).filter(([, v]) => v && v !== "–").map(([k, v]) => `${k} ${v}`).join(", ") || "keine"}`
    : "Keine EXIF-Daten vorhanden.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modell,
      store: false,
      temperature: 0.4,
      max_tokens: 1600,
      response_format: { type: "json_schema", json_schema: { name: "bildbewertung", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: systemPrompt(sprache) },
        {
          role: "user",
          content: [
            { type: "text", text: `Bitte bewerte dieses Foto. ${exifText}` },
            { type: "image_url", image_url: { url: bild, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    console.error("[lens-gate] OpenAI", res.status, text);
    throw new Fehler(502, { fehler: "KI gerade nicht erreichbar", details: `OpenAI HTTP ${res.status}` });
  }
  const daten = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = daten.choices?.[0]?.message;
  if (!msg?.content) throw new Fehler(502, { fehler: "KI hat keine Bewertung geliefert", details: msg?.refusal ?? "leer" });
  return { antwort: JSON.parse(msg.content) as KiAntwort, modell };
}

// KI-Antwort absichern und ins Format des Dummys (S.current) bringen
export function aufbereiten(a: KiAntwort, exif: Record<string, string> | null, dateiname: string) {
  const zahl = (v: unknown) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : 5;
    return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
  };
  const scores = Object.fromEntries(KAT_KEYS.map((k) => [k, zahl(a.scores?.[k])])) as Record<Kat, number>;
  const total = Math.round((KAT_KEYS.reduce((s, k) => s + scores[k], 0) / KAT_KEYS.length) * 10) / 10;
  const tips = (Array.isArray(a.tips) ? a.tips : [])
    .filter((t) => t && t.text)
    .slice(0, 3)
    .map((t) => {
      const link = lektionLink(t.lektion);
      return { icon: ICONS.includes(t.icon) ? t.icon : "fa-lightbulb", label: String(t.label).slice(0, 40), text: String(t.text).slice(0, 400), ...(link ? { link } : {}) };
    });
  // jede Lektion nur einmal verlinken
  const gesehen = new Set<string>();
  for (const t of tips as { link?: { code: string } }[]) {
    if (t.link) { if (gesehen.has(t.link.code)) delete t.link; else gesehen.add(t.link.code); }
  }
  const anteil = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 : null);
  const markers = (Array.isArray(a.markers) ? a.markers : [])
    .map((m) => ({ x: anteil(m?.x), y: anteil(m?.y), label: String(m?.label ?? "").slice(0, 40), art: m?.art, kat: m?.kat }))
    .filter((m) => m.x !== null && m.y !== null && m.label && ["staerke", "problem", "hinweis"].includes(String(m.art)))
    .map((m) => ({ ...m, kat: KAT_KEYS.includes(m.kat as Kat) ? m.kat : undefined }))
    .slice(0, 5);
  const titel = (a.titel || dateiname || "Eigener Upload").slice(0, 80);
  return {
    title: `${titel} • ${a.genre || "Foto"}`,
    exif: exif ?? { camera: "Keine EXIF-Daten", focal: "–", aperture: "–", shutter: "–", iso: "–" },
    scores: { total, ...scores },
    notes: Object.fromEntries(KAT_KEYS.map((k) => [k, String(a.notes?.[k] ?? "").slice(0, 300)])),
    summary: String(a.summary ?? "").slice(0, 800),
    ...(a.merksatz ? { merksatz: String(a.merksatz).slice(0, 200) } : {}),
    tips,
    markers,
    preset: PRESETS.some((p) => p.id === a.preset) ? a.preset : 4,
  };
}

function exifAus(x: unknown): Record<string, string> | null {
  if (!x || typeof x !== "object") return null;
  const o: Record<string, string> = {};
  for (const k of ["camera", "focal", "aperture", "shutter", "iso"]) {
    const v = (x as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) o[k] = v.trim().slice(0, 60);
  }
  return Object.keys(o).length ? o : null;
}


// ---------- Adressen ----------

async function leseJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    throw new Fehler(400, { fehler: "Ungültige Anfrage (kein JSON)" });
  }
}

async function bewerten(request: Request, env: Env, token: string, cors: Headers): Promise<Response> {
  const body = await leseJson(request);
  const bild = typeof body.bild === "string" ? body.bild : "";
  const m = bild.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || bild.length < 200) {
    return json({ fehler: "Bitte ein Foto als JPEG schicken (data:image/jpeg;base64) – die App wandelt vorher um" }, 400, cors);
  }
  if (bild.length > MAX_BILD_ZEICHEN) return json({ fehler: "Bild zu groß – bitte vorher auf max. 1600 px verkleinern" }, 413, cors);
  if (body.rechte !== true) {
    return json({ fehler: "rechte", hinweis: "Bitte bestätigen, dass du die Rechte an diesem Foto hast." }, 400, cors);
  }
  const sprache = typeof body.sprache === "string" && SPRACHEN[body.sprache] ? body.sprache : "de";
  const exif = exifAus(body.exif);
  const dateiname = typeof body.dateiname === "string" ? body.dateiname.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) : "";
  const thumb =
    body.verlaufBild === true && typeof body.thumb === "string" && body.thumb.startsWith("data:image/jpeg;base64,") && body.thumb.length <= MAX_THUMB_ZEICHEN
      ? body.thumb
      : null;

  // 1) Vorab: angemeldet, Einwilligung da, Kontingent frei? (spart KI-Kosten, kein Foto geht ohne Einwilligung raus)
  const s = await stand(env, token);
  if (!s.einwilligung) {
    return json({ fehler: "einwilligung", version: DATENSCHUTZ_VERSION, hinweis: "Bitte zuerst zustimmen, dass dein Foto zur Bewertung an OpenAI geht." }, 428, cors);
  }
  if (s.genutzt >= s.limit) return json({ fehler: "kontingent", plan: s.plan, genutzt: s.genutzt, limit: s.limit, monat: s.monat }, 402, cors);

  // 2) Metadaten aus dem Foto entfernen (GPS, Seriennummer usw.)
  let sauber: string;
  try {
    sauber = "data:image/jpeg;base64," + bytesZuBase64(jpegOhneMetadaten(base64ZuBytes(m[1])).bytes);
  } catch {
    return json({ fehler: "Das Foto lässt sich nicht lesen – bitte als JPG exportieren und nochmal versuchen" }, 400, cors);
  }

  // 3) KI fragen
  const { antwort, modell } = await frageKi(env, sauber, exif, sprache);
  if (antwort.ist_foto === false) {
    return json({ fehler: "kein_foto", hinweis: "Das sieht nicht nach einem Foto aus – zählt nicht für dein Kontingent." }, 422, cors);
  }
  const ergebnis = aufbereiten(antwort, exif, dateiname);

  // 4) Speichern + Kontingent buchen (in einem Schritt in der Datenbank)
  const g = (await rpc(env, token, "lc_analyse_speichern", {
    p_ergebnis: ergebnis, p_version: DATENSCHUTZ_VERSION, p_rechte: true,
    p_exif: exif, p_thumb: thumb, p_modell: modell, p_sprache: sprache,
  })) as { ok: boolean; grund?: string; id?: string; genutzt: number; limit: number; plan: string };
  if (!g?.ok) {
    if (g?.grund === "einwilligung") return json({ fehler: "einwilligung", version: DATENSCHUTZ_VERSION }, 428, cors);
    return json({ fehler: "kontingent", plan: g?.plan, genutzt: g?.genutzt, limit: g?.limit }, 402, cors);
  }
  return json({ id: g.id, ...ergebnis, stand: { plan: g.plan, genutzt: g.genutzt, limit: g.limit } }, 200, cors);
}

async function einwilligung(request: Request, env: Env, token: string, cors: Headers): Promise<Response> {
  const body = await leseJson(request);
  if (typeof body.erteilt !== "boolean") return json({ fehler: "erteilt: true oder false fehlt" }, 400, cors);
  const s = (await rpc(env, token, "lc_einwilligung", { p_version: DATENSCHUTZ_VERSION, p_erteilt: body.erteilt })) as Stand;
  return json({ ...s, version: DATENSCHUTZ_VERSION }, 200, cors);
}

async function loeschen(request: Request, env: Env, token: string, cors: Headers): Promise<Response> {
  const body = await leseJson(request);
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id && body.alle !== true) return json({ fehler: "id oder alle: true fehlt" }, 400, cors);
  const n = await rpc(env, token, "lc_analysen_loeschen", { p_id: id });
  return json({ geloescht: n }, 200, cors);
}

async function verlauf(url: URL, env: Env, token: string, cors: Headers): Promise<Response> {
  const felder = ["id", "created_at", "titel", "gesamt", "bildaufbau", "licht", "schaerfe", "farbe", "ergebnis"];
  if (url.searchParams.get("mitBild") === "1") felder.push("thumb");
  const daten = await supabase(env, token, `/rest/v1/lc_analysen?select=${felder.join(",")}&order=created_at.desc&limit=50`, { method: "GET" });
  return json({ analysen: daten }, 200, cors);
}

// ---------- Worker ----------

const ROUTEN: Record<string, string> = {
  "/stand": "GET", "/verlauf": "GET", "/export": "GET",
  "/bewerten": "POST", "/einwilligung": "POST", "/loeschen": "POST",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const pfad = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (pfad === "/" && request.method === "GET") {
        return json({ name: "lens-gate", version: VERSION, datenschutz: DATENSCHUTZ_VERSION, adressen: ["GET /test", ...Object.entries(ROUTEN).map(([p, mm]) => `${mm} ${p}`)] }, 200, cors);
      }
      if (pfad === "/test" && request.method === "GET") {
        return new Response(testseite(clean(env.SUPABASE_URL), clean(env.SUPABASE_ANON_KEY), DATENSCHUTZ_VERSION), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      if (!ROUTEN[pfad]) return json({ fehler: "Nicht gefunden" }, 404, cors);
      if (request.method !== ROUTEN[pfad]) return json({ fehler: "Methode nicht erlaubt" }, 405, cors);

      const token = tokenAus(request);
      if (!token) return json({ fehler: "Anmeldung nötig" }, 401, cors);

      if (pfad === "/stand") return json(await stand(env, token), 200, cors);
      if (pfad === "/verlauf") return await verlauf(url, env, token, cors);
      if (pfad === "/export") {
        const h = new Headers(cors);
        h.set("Content-Disposition", 'attachment; filename="pps-lens-meine-daten.json"');
        return json(await rpc(env, token, "lc_meine_daten"), 200, h);
      }
      if (pfad === "/einwilligung") return await einwilligung(request, env, token, cors);
      if (pfad === "/loeschen") return await loeschen(request, env, token, cors);
      return await bewerten(request, env, token, cors);
    } catch (err) {
      if (err instanceof Fehler) return json(err.daten, err.status, cors);
      console.error("[lens-gate]", (err as Error).message); // nie Bilddaten ins Log
      return json({ fehler: "Interner Fehler" }, 500, cors);
    }
  },
};
