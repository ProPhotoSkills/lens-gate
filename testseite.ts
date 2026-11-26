// Testseite des Workers lens-gate (v3) – GET /test
// v4 (26.11.): Einwilligungstext wie in der App (lens-app_v5), Textversion 2026-11-26b.
// v3 (26.11.): Markierungen auf dem Foto, Merksatz, Links zu passenden PPS-Lektionen.
// v2 (26.11.): Fortschritt + Fehler sichtbar, Bild-Laden mit Ausweichweg.
// Zum Ausprobieren ohne fertige App (Eric 26.11.: „sag mir, wie wir den einmal zum Sehen kriegen“):
// mit dem Web-Login-Konto anmelden, Einwilligung geben, Foto wählen, Bewertung sehen, Verlauf/Export/Löschen.
// Schlicht gehalten – das echte Aussehen kommt aus dem Dummy (DUMMY_pps-lens_v2.html).
// Der anon-Schlüssel ist öffentlich (steht auch in books-app und web); geschützt wird über die Datenbank-Regeln.

export function testseite(supabaseUrl: string, anonKey: string, version: string): string {
  const cfg = JSON.stringify({ url: supabaseUrl, key: anonKey, version }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>PPS Lens – Test der KI-Bildbewertung</title>
<style>
  body{font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#222;background:#f6f6f4}
  h1{font-size:22px;margin:0 0 4px} .klein{color:#666;font-size:13px}
  section{background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px;margin:14px 0}
  input[type=email],input[type=password]{width:100%;padding:9px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box}
  button{padding:9px 14px;border:0;border-radius:8px;background:#222;color:#fff;cursor:pointer;margin:4px 6px 4px 0}
  button.hell{background:#e7e7e3;color:#222} button:disabled{opacity:.5}
  label{display:block;margin:8px 0} .note{font-size:40px;font-weight:700}
  .kat{display:flex;justify-content:space-between;border-top:1px solid #eee;padding:6px 0}
  pre{white-space:pre-wrap;background:#f0f0ec;padding:10px;border-radius:8px;font-size:12px;max-height:300px;overflow:auto}
  img.vorschau{max-width:100%;border-radius:8px;margin-top:8px}
  .mk{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.5);color:#fff;font:700 13px/20px system-ui;text-align:center}
  .mk.staerke{background:#1e9e5a}.mk.problem{background:#d23b3b}.mk.hinweis{background:#e0a100}
  .mkl{position:absolute;transform:translate(-50%,16px);background:rgba(0,0,0,.75);color:#fff;font-size:12px;padding:2px 6px;border-radius:6px;white-space:nowrap}
  .merksatz{font-style:italic;border-left:4px solid #e0a100;padding-left:10px} .fehler{color:#b00020}
</style></head><body>
<h1>PPS Lens – Test der KI-Bildbewertung</h1>
<div class="klein">Worker lens-gate · Anmeldung mit deinem ProPhotoSkills-Konto (Web-Login)</div>

<section id="s-login"><b>Anmelden</b>
  <input id="email" type="email" placeholder="E-Mail" autocomplete="username">
  <input id="pw" type="password" placeholder="Passwort" autocomplete="current-password">
  <button id="b-login">Anmelden</button> <span id="login-msg" class="fehler"></span>
</section>

<section id="s-app" hidden>
  <div>Angemeldet als <b id="wer"></b> · Plan <b id="plan"></b> · <span id="zaehler"></span>
    <button class="hell" id="b-logout">Abmelden</button></div>

  <div id="einw" hidden style="margin-top:12px;padding:12px;background:#fff8e1;border-radius:8px">
    <b>Bevor du ein Foto bewerten lässt</b>
    <p class="klein">Für die Bewertung wird dein Foto auf deinem Gerät verkleinert und ohne Standort- und Kameradaten (GPS, Seriennummer)
    an OpenAI übertragen (Vertragspartner OpenAI Ireland, Verarbeitung auch in den USA auf Grundlage der EU-Standardvertragsklauseln).
    OpenAI nutzt es nicht zum Training und kann Anfragen zur Missbrauchskontrolle bis zu 30 Tage aufbewahren.
    Wir speichern dein Foto nicht – nur das Ergebnis (und auf Wunsch ein kleines Vorschaubild).
    Du kannst deine Bewertungen jederzeit löschen und diese Einwilligung widerrufen. (Textversion ${version})</p>
    <label><input type="checkbox" id="c-einw"> Ich stimme zu.</label>
    <button id="b-einw" disabled>Zustimmung speichern</button>
  </div>

  <div id="upload" hidden style="margin-top:12px">
    <b>Foto bewerten</b>
    <label><input type="file" id="datei" accept="image/*"></label>
    <label><input type="checkbox" id="c-rechte"> Ich habe die Rechte an diesem Foto, und erkennbare Personen sind damit einverstanden.</label>
    <label><input type="checkbox" id="c-thumb"> Kleines Vorschaubild im Verlauf speichern</label>
    <button id="b-bewerten" disabled>Bewerten lassen</button> <b id="warte"></b>
    <div id="bildbox" style="position:relative;display:inline-block;max-width:100%;margin-top:8px"><img id="vorschau" class="vorschau" hidden alt="" style="display:block;margin:0"></div>
  </div>

  <div id="ergebnis" hidden style="margin-top:12px"></div>

  <div style="margin-top:12px">
    <button class="hell" id="b-verlauf">Verlauf</button>
    <button class="hell" id="b-export">Meine Daten (Export)</button>
    <button class="hell" id="b-loeschen">Alle Bewertungen löschen</button>
    <button class="hell" id="b-widerruf">Einwilligung widerrufen</button>
  </div>
  <pre id="ausgabe" hidden></pre>
</section>

<script type="module">
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CFG = ${cfg};
const $ = (id) => document.getElementById(id);
const sb = createClient(CFG.url, CFG.key, { auth: { persistSession: true, storageKey: "ppslens_test_auth" } });
let stand = null;

async function api(pfad, body) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch(pfad, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
function zeige(obj) { $("ausgabe").hidden = false; $("ausgabe").textContent = JSON.stringify(obj, null, 2); }

async function ladeStand() {
  const { status, j } = await api("/stand");
  if (status === 401) { await sb.auth.signOut(); return zeigeLogin(); }
  stand = j;
  $("plan").textContent = (j.plan || "").toUpperCase();
  $("zaehler").textContent = j.genutzt + " von " + j.limit + " Bewertungen im " + j.monat;
  $("einw").hidden = !!j.einwilligung;
  $("upload").hidden = !j.einwilligung;
}
function zeigeLogin() { $("s-login").hidden = false; $("s-app").hidden = true; }
async function zeigeApp(session) {
  $("s-login").hidden = true; $("s-app").hidden = false;
  $("wer").textContent = session.user.email;
  await ladeStand();
}

$("b-login").onclick = async () => {
  $("login-msg").textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("pw").value });
  if (error) { $("login-msg").textContent = "Anmeldung fehlgeschlagen: " + error.message; return; }
  zeigeApp(data.session);
};
$("b-logout").onclick = async () => { await sb.auth.signOut(); zeigeLogin(); };
$("c-einw").onchange = () => { $("b-einw").disabled = !$("c-einw").checked; };
$("b-einw").onclick = async () => { zeige((await api("/einwilligung", { erteilt: true })).j); ladeStand(); };
$("b-widerruf").onclick = async () => { zeige((await api("/einwilligung", { erteilt: false })).j); ladeStand(); };
const pruefe = () => { $("b-bewerten").disabled = !($("datei").files[0] && $("c-rechte").checked); };
$("datei").onchange = pruefe; $("c-rechte").onchange = pruefe;

// Bild laden: erst createImageBitmap, sonst über <img> (Safari kann so auch HEIC)
async function ladeBild(datei) {
  try { return await createImageBitmap(datei); } catch (e) {
    const url = URL.createObjectURL(datei);
    try {
      const img = new Image(); img.src = url; await img.decode();
      return img;
    } catch { throw new Error("Dieses Bildformat kann der Browser nicht öffnen (z. B. HEIC in Chrome). Bitte als JPG exportieren."); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
}
async function alsJpeg(datei, max, q) {
  const bild = await ladeBild(datei);
  const f = Math.min(1, max / Math.max(bild.width, bild.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
  c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q); // neu gezeichnet → keine EXIF/GPS-Daten mehr im Bild
}

function zeigeMarker(markers) {
  const box = $("bildbox");
  box.querySelectorAll(".mk,.mkl").forEach((x) => x.remove());
  (markers || []).forEach((m, i) => {
    const p = document.createElement("div"); p.className = "mk " + m.art; p.textContent = String(i + 1);
    p.style.left = (m.x * 100) + "%"; p.style.top = (m.y * 100) + "%"; p.title = m.label;
    const l = document.createElement("div"); l.className = "mkl"; l.textContent = m.label;
    l.style.left = p.style.left; l.style.top = p.style.top;
    box.append(p, l);
  });
}

$("b-bewerten").onclick = async () => {
  const datei = $("datei").files[0];
  $("b-bewerten").disabled = true; $("ergebnis").hidden = true;
  const schritt = (t) => { $("warte").textContent = t; };
  try {
    schritt("Foto wird verkleinert …");
    const bild = await alsJpeg(datei, 1600, 0.85);
    const thumb = await alsJpeg(datei, 96, 0.7);
    $("vorschau").src = bild; $("vorschau").hidden = false; zeigeMarker([]);
    schritt("Die KI schaut sich dein Foto an … (ca. 10–20 Sekunden)");
    const { status, j } = await api("/bewerten", {
      bild, thumb, verlaufBild: $("c-thumb").checked, rechte: $("c-rechte").checked, dateiname: datei.name, sprache: "de",
    });
    zeige(j ?? { fehler: "Antwort " + status });
    if (status === 200) { zeigeErgebnis(j); schritt("Fertig ✓"); }
    else schritt("Nicht geklappt (" + status + ") – Details unten");
  } catch (e) {
    schritt("Fehler: " + (e?.message || e));
    zeige({ fehler: String(e?.message || e) });
  } finally { pruefe(); ladeStand(); }
};

function zeigeErgebnis(e) {
  const box = $("ergebnis"); box.hidden = false; box.replaceChildren();
  const el = (tag, text, cls) => { const x = document.createElement(tag); if (text != null) x.textContent = text; if (cls) x.className = cls; box.append(x); return x; };
  el("b", e.title);
  el("div", e.scores.total.toFixed(1) + " / 10", "note");
  const namen = { comp: "Bildaufbau & Linienführung", light: "Licht & Kontrastumfang", sharp: "Schärfe & Fokus-Ebene", color: "Farbharmonie & Look" };
  for (const k of Object.keys(namen)) {
    const d = el("div", null, "kat");
    const a = document.createElement("span"); a.textContent = namen[k] + " – " + (e.notes[k] || "");
    const b = document.createElement("b"); b.textContent = e.scores[k].toFixed(1);
    d.append(a, b);
  }
  el("p", e.summary);
  if (e.merksatz) el("p", e.merksatz, "merksatz");
  const ul = el("ul");
  for (const t of e.tips) {
    const li = document.createElement("li"); li.textContent = t.label + ": " + t.text;
    if (t.link && String(t.link.url).startsWith("https://")) {
      const a = document.createElement("a"); a.href = t.link.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "PPS-Lektion: " + t.link.titel + (t.link.produkt ? " (" + t.link.produkt + ")" : "");
      li.append(document.createElement("br"), a);
    }
    ul.append(li);
  }
  if (e.markers?.length) {
    el("b", "Markierungen im Foto (ungefähre Position)");
    const ol = el("ol");
    for (const m of e.markers) { const li = document.createElement("li"); li.textContent = (m.art === "staerke" ? "✓ " : m.art === "problem" ? "✗ " : "• ") + m.label; ol.append(li); }
  }
  zeigeMarker(e.markers);
}

$("b-verlauf").onclick = async () => zeige((await api("/verlauf")).j);
$("b-export").onclick = async () => zeige((await api("/export")).j);
$("b-loeschen").onclick = async () => {
  if (!confirm("Alle deine Bewertungen endgültig löschen? Das Monatskontingent bleibt gleich.")) return;
  zeige((await api("/loeschen", { alle: true })).j);
};

const { data } = await sb.auth.getSession();
if (data.session) zeigeApp(data.session); else zeigeLogin();
</script>
</body></html>`;
}
