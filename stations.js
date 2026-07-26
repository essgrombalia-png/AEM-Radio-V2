/**
 * ============================================================================
 * AEM Radio Player — Station Data
 * ============================================================================
 * This file holds the full catalogue of radio stations shown in the app.
 *
 * HOW TO ADD YOUR OWN STATION
 * ----------------------------------------------------------------------------
 * Add a new object to the STATIONS array below with this shape:
 *
 * {
 *   id:          "unique-slug",            // must be unique, lowercase, no spaces
 *   name:        "Station Name",
 *   streamUrl:   "https://.../stream.mp3", // direct HTTPS MP3/AAC/HLS stream
 *   logo:        "https://.../logo.png",   // square image, min 300x300 recommended
 *   genre:       "Pop",                    // one of GENRES below (or add a new one)
 *   country:     "Sweden",
 *   description: "Short one-line description of the station."
 * }
 *
 * NOTE ON STREAMS: many public radio streams are served over plain HTTP or
 * block cross-origin requests (CORS). Because GitHub Pages is HTTPS-only,
 * browsers will block/mute HTTP streams and some CORS-restricted streams may
 * fail to play or visualize. See README.md → "CORS & Stream Limitations".
 * ============================================================================
 */

const GENRES = [
  'All',
  'Pop',
  'Rock',
  'Jazz',
  'Classical',
  'News',
  'Electronic',
  'Local'
];

const STATIONS = [
  {
    id: 'neon-pop-fm',
    name: 'Neon Pop FM',
    streamUrl: 'https://ice1.somafm.com/poptron-128-mp3',
    logo: 'https://picsum.photos/seed/neonpop/300/300',
    genre: 'Pop',
    country: 'Sweden',
    description: 'Chart-topping hits and feel-good pop, 24/7.'
  },
  {
    id: 'granite-rock-radio',
    name: 'Granite Rock Radio',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    logo: 'https://picsum.photos/seed/graniterock/300/300',
    genre: 'Rock',
    country: 'United Kingdom',
    description: 'Classic and modern rock anthems, wall to wall.'
  },
  {
    id: 'blue-note-jazz',
    name: 'Blue Note Jazz',
    streamUrl: 'https://ice1.somafm.com/sonicuniverse-128-mp3',
    logo: 'https://picsum.photos/seed/bluenotejazz/300/300',
    genre: 'Jazz',
    country: 'United States',
    description: 'Smooth, smoky jazz for late nights and slow mornings.'
  },
  {
    id: 'aurora-classical',
    name: 'Aurora Classical',
    streamUrl: 'https://ice1.somafm.com/deepspaceone-128-mp3',
    logo: 'https://picsum.photos/seed/auroraclassical/300/300',
    genre: 'Classical',
    country: 'Austria',
    description: 'Orchestral masterworks from the great composers.'
  },
  {
    id: 'pulse-news-network',
    name: 'Pulse News Network',
    streamUrl: 'https://ice1.somafm.com/defcon-128-mp3',
    logo: 'https://picsum.photos/seed/pulsenews/300/300',
    genre: 'News',
    country: 'United States',
    description: 'Around-the-clock headlines and in-depth reporting.'
  },
  {
    id: 'volt-electronic',
    name: 'Volt Electronic',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    logo: 'https://picsum.photos/seed/voltelectronic/300/300',
    genre: 'Electronic',
    country: 'Germany',
    description: 'Downtempo, house and techno for focus and flow.'
  },
  {
    id: 'stockholm-local',
    name: 'Stockholm Local',
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
    logo: 'https://picsum.photos/seed/stockholmlocal/300/300',
    genre: 'Local',
    country: 'Sweden',
    description: 'Homegrown talk, music and community stories.'
  },
  {
    id: 'midnight-indie',
    name: 'Midnight Indie',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    logo: 'https://picsum.photos/seed/midnightindie/300/300',
    genre: 'Pop',
    country: 'Sweden',
    description: 'Dreamy indie-pop for late-night listening sessions.'
  }
];

// Expose globally (no build step / bundler in this project)
window.GENRES = GENRES;
window.STATIONS = STATIONS;
