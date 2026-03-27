const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const IMPORTANCE_THRESHOLD = 0.4;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "degoog-maps-plugin/1.0";

const apiCache = new Map();
const cacheExpiry = new Map();

let template = "";

const REJECT_PATTERNS = /\b(how to|what is|what are|what does|what do|why does|why do|why is|when did|when does|when is|who is|who are|can i|should i|is there|are there|does it|do i|error|exception|stack ?trace|bug|debug|code|function|class|module|import|require|install|uninstall|download|upload|compile|runtime|syntax|tutorial|example|how|why|what|which|where do|config|setup|troubleshoot|fix|solve|buy|price|cost|cheap|deal|sale|order|shop|amazon|ebay|recipe|cook|ingredient|lyrics|song|album|movie|film|watch|stream|reddit|github|gitlab|stackoverflow|youtube|twitch|twitter|tiktok|instagram|facebook|wiki|wikipedia|vs |versus |compare|review|best|top \d|list of)\b/i;

const LOCATION_KEYWORDS = /\b(map|maps|directions|direction to|near me|nearby|weather in|time in|timezone in|capital of|population of|area of|country|city of|state of|province of|located|location of|where is|gps|coordinates|latitude|longitude)\b/i;

const _cacheGet = (key) => {
  const expiresAt = cacheExpiry.get(key);
  if (expiresAt == null || Date.now() > expiresAt) {
    apiCache.delete(key);
    cacheExpiry.delete(key);
    return undefined;
  }
  return apiCache.get(key);
};

const _cacheSet = (key, value) => {
  if (apiCache.size >= CACHE_MAX_ENTRIES) {
    let oldestKey = null;
    let oldestExpiry = Infinity;
    for (const [k, exp] of cacheExpiry) {
      if (exp < oldestExpiry) {
        oldestExpiry = exp;
        oldestKey = k;
      }
    }
    if (oldestKey != null) {
      apiCache.delete(oldestKey);
      cacheExpiry.delete(oldestKey);
    }
  }
  apiCache.set(key, value);
  cacheExpiry.set(key, Date.now() + CACHE_TTL_MS);
};

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _render = (data) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

const _formatType = (type, cls) => {
  if (!type && !cls) return "";
  const t = (type || "").replace(/_/g, " ");
  if (cls === "boundary" && t === "administrative") return "Region";
  if (cls === "place") {
    const map = { city: "City", town: "Town", village: "Village", hamlet: "Hamlet", country: "Country", state: "State", continent: "Continent", island: "Island" };
    return map[t] || t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (cls === "tourism") return "Landmark";
  if (cls === "amenity") return "Place";
  if (cls === "natural") return "Natural Feature";
  if (cls === "highway") return "Road";
  if (cls === "building") return "Building";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

const _buildDisplayName = (address) => {
  if (!address) return "";
  const parts = [];
  const name = address.city || address.town || address.village || address.hamlet || address.municipality || "";
  const state = address.state || address.region || "";
  const country = address.country || "";
  if (name) parts.push(name);
  if (state && state !== name) parts.push(state);
  if (country && country !== state && country !== name) parts.push(country);
  return parts.join(", ");
};

export const slot = {
  id: "maps",
  name: "Maps",
  position: "above-results",
  description: "Shows an embedded OpenStreetMap for location-based queries using Nominatim geocoding.",

  settingsSchema: [],

  init(ctx) {
    template = ctx.template;
  },

  configure() {},

  trigger(query) {
    if (typeof query !== "string") return false;
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return false;
    if (LOCATION_KEYWORDS.test(q)) return true;
    if (REJECT_PATTERNS.test(q)) return false;
    return true;
  },

  async execute(query) {
    const cacheKey = query.toLowerCase().trim();
    const cached = _cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    let result;
    try {
      const url = `${NOMINATIM_URL}?${new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "1",
        addressdetails: "1",
      })}`;

      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!res.ok) {
        result = { title: "", html: "" };
        _cacheSet(cacheKey, result);
        return result;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        result = { title: "", html: "" };
        _cacheSet(cacheKey, result);
        return result;
      }

      const place = data[0];
      const importance = parseFloat(place.importance) || 0;

      if (importance < IMPORTANCE_THRESHOLD) {
        result = { title: "", html: "" };
        _cacheSet(cacheKey, result);
        return result;
      }

      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const displayName = _esc(place.display_name || "");
      const typeLabel = _esc(_formatType(place.type, place.class));
      const shortName = _esc(
        place.address
          ? (_buildDisplayName(place.address) || place.display_name || query)
          : (place.display_name || query)
      );

      const bb = place.boundingbox;
      let bboxParam = "";
      if (Array.isArray(bb) && bb.length === 4) {
        bboxParam = `${bb[2]},${bb[0]},${bb[3]},${bb[1]}`;
      } else {
        const offset = 0.01;
        bboxParam = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
      }

      const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bboxParam)}&marker=${encodeURIComponent(`${lat},${lon}`)}`;
      const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;

      const html = `<div class="maps-panel">` +
        `<div class="maps-info">` +
        `<h3 class="maps-name">${shortName}</h3>` +
        (typeLabel ? `<span class="maps-type">${typeLabel}</span>` : "") +
        `<p class="maps-address">${displayName}</p>` +
        `<p class="maps-coords">${lat.toFixed(4)}, ${lon.toFixed(4)}</p>` +
        `<a class="maps-link" href="${_esc(osmLink)}" target="_blank" rel="noopener">View on OpenStreetMap →</a>` +
        `</div>` +
        `<div class="maps-embed">` +
        `<iframe src="${_esc(iframeSrc)}" width="100%" height="250" frameborder="0" loading="lazy"></iframe>` +
        `</div>` +
        `</div>`;

      result = { title: "Map", html: _render({ content: html }) };
    } catch {
      result = { title: "", html: "" };
    }

    _cacheSet(cacheKey, result);
    return result;
  },
};

export default { slot };
