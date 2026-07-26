# AEM Radio Player

En exklusiv, modern webbaserad radiospelare byggd med **ren HTML5, CSS3 och Vanilla JavaScript** — inget ramverk, inget byggsteg, ingen backend. Designad som en premium streamingplattform med dark mode, glassmorphism och neonaccenter, och redo att publiceras direkt på **GitHub Pages**.

![Status](https://img.shields.io/badge/status-production--ready-22e8ff)
![Stack](https://img.shields.io/badge/stack-HTML%20%2F%20CSS%20%2F%20JS-ff2e9a)
![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-9b6bff)

---

## Innehåll

- [Funktioner](#funktioner)
- [Projektstruktur](#projektstruktur)
- [Installation & lokal körning](#installation--lokal-körning)
- [Så lägger du till egna radiostationer](#så-lägger-du-till-egna-radiostationer)
- [Publicera på GitHub Pages](#publicera-på-github-pages)
- [Byta branding och färger](#byta-branding-och-färger)
- [CORS-begränsningar för radiostreams](#cors-begränsningar-för-radiostreams)
- [PWA — installation & offline](#pwa--installation--offline)
- [Kortkommandon](#kortkommandon)
- [Tillgänglighet](#tillgänglighet)
- [Felsökning](#felsökning)

---

## Funktioner

**Spelare**
- Stor Play/Pause med laddnings- och LIVE-status
- Sticky mini-player längst ned, alltid synlig under uppspelning
- Detaljerad Now Playing-vy med albumkonst, artist/låt, live-indikator och ljudreaktiv equalizer (Web Audio API, med CSS-fallback om Web Audio blockeras)
- Volymkontroll med mute/unmute, Next/Previous
- Automatisk återanslutning vid strömavbrott (kan stängas av i Settings)
- Media Session API — styr uppspelning från låsskärm/systemets mediekontroller

**Bibliotek & upptäckt**
- Sök på namn, genre eller land
- Filtrera på genre: Pop, Rock, Jazz, Classical, News, Electronic, Local
- Favoriter (sparas i `localStorage`)
- Recently Played-historik (senaste 30, sparas lokalt)
- Sleep Timer (15/30/45/60 min)

**Plattform**
- 100 % statisk — fungerar direkt på GitHub Pages, ingen server
- PWA: `manifest.json` + service worker för offline-gränssnitt
- Fullt responsiv: desktop, tablet, mobil (med bottom tab-bar)
- Tangentbordsnavigering + ARIA-etiketter
- Inga externa JS-ramverk eller byggverktyg

---

## Projektstruktur

```
AEM-Radio-Player/
├── index.html          Appens enda HTML-sida (alla vyer)
├── style.css            Allt CSS — designtoken, layout, komponenter, responsivitet
├── script.js             All applikationslogik (state, ljud, rendering, events)
├── stations.js            Konfigurationsfil för radiostationer + genrer
├── manifest.json         PWA-manifest
├── sw.js                    Service worker (offline app-shell)
├── README.md
└── assets/
    ├── icons/            PWA-ikoner (SVG)
    └── images/           (valfritt) egna bilder
```

---

## Installation & lokal körning

Inga beroenden krävs. Ladda ned/klona projektet och öppna `index.html` i en webbläsare, eller kör en enkel lokal server (rekommenderas för att service workern och `fetch`-anrop ska fungera korrekt):

```bash
# Python
python3 -m http.server 8080

# eller Node.js
npx serve .
```

Öppna sedan `http://localhost:8080`.

---

## Så lägger du till egna radiostationer

Öppna `stations.js`. Varje station är ett objekt i arrayen `STATIONS`:

```js
{
  id: 'unique-slug',                       // måste vara unikt, gemener, inga mellanslag
  name: 'Min Station',
  streamUrl: 'https://exempel.se/stream.mp3', // direkt HTTPS-stream (MP3/AAC/HLS)
  logo: 'https://exempel.se/logo.png',        // helst kvadratisk, minst 300×300
  genre: 'Pop',                             // se GENRES-listan i samma fil
  country: 'Sverige',
  description: 'Kort beskrivning av stationen.'
}
```

Lägg till, ta bort eller redigera objekt fritt — gränssnittet uppdateras automatiskt baserat på arrayens innehåll. Vill du lägga till en helt ny genre, lägg till strängen i `GENRES`-arrayen högst upp i samma fil.

---

## Publicera på GitHub Pages

1. Skapa ett nytt repository på GitHub, t.ex. `AEM-Radio-Player`.
2. Ladda upp samtliga filer i den här mappen till repositoryts rot (`git add . && git commit -m "Initial commit" && git push`).
3. Gå till **Settings → Pages** i repositoryt.
4. Under **Build and deployment**, välj **Deploy from a branch**.
5. Välj branchen `main` (eller `master`) och mappen `/ (root)`.
6. Spara. Efter någon minut publiceras sidan på:
   `https://<ditt-användarnamn>.github.io/AEM-Radio-Player/`

Ingen ytterligare konfiguration behövs — projektet innehåller ingen backend, inga miljövariabler och inget byggsteg.

---

## Byta branding och färger

**Namn/logotyp:** Ändra texten i `.brand-text` i `index.html` (`<span class="brand-text">AEM<em>Radio</em></span>`) samt SVG-ikonen i `.brand-mark`. Byt även ut filerna i `assets/icons/` mot din egen logotyp i samma dimensioner (192×192, 512×512).

**Färger:** Alla färger styrs av CSS-variabler högst upp i `style.css`, under `:root`:

```css
--accent:   #22e8ff;   /* primär neonaccent */
--accent-2: #ff2e9a;   /* sekundär neonaccent */
--bg-base:  #0a0c14;   /* basbakgrund */
```

Appen har även fyra färdiga accentteman (cyan, magenta, lime, violet) som användaren själv kan välja under **Settings → Accentfärg**. Vill du lägga till fler teman, kopiera blocket `html[data-accent="..."] { ... }` i `style.css` och lägg till en matchande knapp i `#accent-swatches` i `index.html`.

**Typsnitt:** Just nu används Sora (rubriker) + Inter (brödtext) + JetBrains Mono (data), laddade via Google Fonts i `<head>`. Byt `<link>`-taggen och CSS-variablerna `--ff-display` / `--ff-body` / `--ff-mono` i `style.css`.

---

## CORS-begränsningar för radiostreams

Eftersom AEM Radio Player är en ren klientapplikation utan proxy-server gäller följande begränsningar för strömmar:

- **HTTPS krävs.** GitHub Pages serveras alltid över HTTPS, och webbläsare blockerar "mixed content" — en `http://`-stream kommer alltså inte att spelas upp. Använd alltid en `https://`-stream-URL.
- **CORS för visualizern.** Equalizer-animationen som reagerar på faktiskt ljud använder Web Audio API, vilket kräver att strömmens server skickar korrekta CORS-headers (`Access-Control-Allow-Origin`). Saknas dessa fungerar fortfarande uppspelningen som vanligt, men appen faller automatiskt tillbaka till en ren CSS-animation istället för en ljudreaktiv sådan.
- **Vissa streamar blockerar inbäddning helt** på grund av upphovsrättsavtal eller serverkonfiguration — testa alltid en ny stream-URL innan du lägger till den permanent.
- Om en stream inte går att spela visar appen ett tydligt felmeddelande och försöker automatiskt återansluta (kan stängas av under Settings).

---

## PWA — installation & offline

Appen kan installeras som en fristående app:

- **Desktop (Chrome/Edge):** klicka på installationsikonen i adressfältet.
- **Android:** "Lägg till på startskärmen" i webbläsarmenyn.
- **iOS (Safari):** Dela-ikonen → "Lägg till på hemskärmen".

Service workern (`sw.js`) cachar endast själva gränssnittet (HTML/CSS/JS/ikoner) — **inte** ljudströmmar, eftersom dessa är live och inte går att spela offline. Om du öppnar appen utan internetuppkoppling laddas gränssnittet från cache, men du behöver en aktiv anslutning för att faktiskt lyssna på en station.

---

## Kortkommandon

| Tangent | Funktion |
|---|---|
| `Space` | Play / Pause |
| `↑` / `↓` | Volym upp / ner |
| `←` / `→` | Föregående / nästa station |
| `M` | Mute / unmute |
| `F` | Favoritmarkera aktuell station |

---

## Tillgänglighet

- Semantisk HTML med ARIA-roller (`role="tablist"`, `role="tabpanel"`, `role="dialog"` m.fl.)
- Samtliga interaktiva element är nåbara och användbara via tangentbord
- Synligt fokusläge (`:focus-visible`)
- `prefers-reduced-motion` respekteras — animationer stängs av för användare som föredrar det
- "Hoppa till innehåll"-länk för skärmläsare/tangentbordsanvändare

---

## Felsökning

**Ljudet startar inte alls.** De flesta webbläsare blockerar automatisk uppspelning med ljud innan användaren har interagerat med sidan — klicka på Play manuellt första gången.

**En specifik station laddar aldrig.** Kontrollera att `streamUrl` i `stations.js` pekar på en giltig, direkt `https://`-ljudström (inte en HTML-spelarsida). Testa URL:en genom att öppna den direkt i webbläsaren.

**Equalizern rör sig inte i takt med musiken.** Detta är normalt om strömmens server saknar CORS-headers — se avsnittet [CORS-begränsningar](#cors-begränsningar-för-radiostreams) ovan. Den generiska CSS-animationen används då istället.

**Ändringar syns inte efter uppdatering på GitHub Pages.** Service workern cachar gränssnittet aggressivt. Gör en hård omladdning (Ctrl/Cmd + Shift + R) eller höj versionsnumret i `CACHE_NAME` i `sw.js` för att tvinga fram en ny cache.

---

Byggd med ♥ som ett rent, statiskt, GitHub Pages-redo projekt — inga konton, inga servrar, ingen spårning.
