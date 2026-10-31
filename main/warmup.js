"use strict";

/// Cookies for a profile, as a profile in daily use has them: in a tab
/// nobody sees (see Browser.backgroundTab), with everything the profile's
/// own tabs have (its fingerprints, its iPhone in Noor iPhone, its shields
/// and time zone, its extensions), Noor visits a random mix of
/// popular sites, the world's and those of the country of the time zone
/// pages see, and the profile keeps the cookies they give. A visit reads
/// the page for a while, scrolls it as a person does, accepts the cookie
/// banner where one asks, and sometimes goes on to another page of the
/// same site. It never follows a link that signs in or out, buys, deletes
/// or downloads; nothing it opens becomes a window, plays aloud, shows a
/// dialog or goes into the history. Many profiles collect at once, each
/// in its own tab (see Warmup).

const os = require("os");

/// Popular sites, by where their visitors are: the world's, and a
/// country's (or the Arab world's). A visit starts at the home page.
const SITES = {
  global: [
    "https://www.google.com/", "https://www.youtube.com/", "https://www.wikipedia.org/", "https://www.amazon.com/",
    "https://www.ebay.com/", "https://www.bing.com/", "https://www.yahoo.com/", "https://www.msn.com/",
    "https://www.reddit.com/", "https://www.linkedin.com/", "https://www.pinterest.com/", "https://www.instagram.com/",
    "https://www.facebook.com/", "https://www.tiktok.com/", "https://www.netflix.com/", "https://open.spotify.com/",
    "https://www.apple.com/", "https://www.microsoft.com/", "https://www.imdb.com/", "https://stackoverflow.com/",
    "https://github.com/", "https://www.twitch.tv/", "https://www.quora.com/", "https://medium.com/",
    "https://www.booking.com/", "https://www.tripadvisor.com/", "https://www.aliexpress.com/", "https://weather.com/",
    "https://www.bbc.com/", "https://edition.cnn.com/", "https://www.theguardian.com/", "https://www.nytimes.com/",
    "https://www.forbes.com/", "https://www.espn.com/", "https://www.accuweather.com/", "https://duckduckgo.com/",
    "https://x.com/", "https://www.canva.com/", "https://www.paypal.com/", "https://www.shein.com/",
    "https://www.temu.com/", "https://www.whatsapp.com/", "https://www.airbnb.com/", "https://www.dailymotion.com/",
    "https://www.samsung.com/",
  ],
  MA: [
    "https://www.hespress.com/", "https://le360.ma/", "https://www.avito.ma/", "https://www.jumia.ma/",
    "https://lematin.ma/", "https://www.alyaoum24.com/", "https://www.hibapress.com/", "https://medias24.com/",
    "https://www.goud.ma/", "https://www.elbotola.com/", "https://www.yabiladi.com/", "https://www.moroccoworldnews.com/",
    "https://www.mubawab.ma/", "https://telquel.ma/", "https://www.marocannonces.com/", "https://www.chouftv.ma/",
    "https://www.barlamane.com/", "https://snrtnews.com/", "https://www.lesiteinfo.com/",
  ],
  AR: [
    "https://www.aljazeera.net/", "https://www.skynewsarabia.com/", "https://www.alarabiya.net/", "https://www.kooora.com/",
    "https://www.youm7.com/", "https://arabic.cnn.com/", "https://www.almaany.com/", "https://mawdoo3.com/",
    "https://www.masrawy.com/", "https://arabic.rt.com/", "https://www.independentarabia.com/", "https://www.alquds.co.uk/",
    "https://www.yallakora.com/",
  ],
  FR: [
    "https://www.lemonde.fr/", "https://www.lefigaro.fr/", "https://www.leboncoin.fr/", "https://www.francetvinfo.fr/",
    "https://www.20minutes.fr/", "https://www.orange.fr/", "https://www.allocine.fr/", "https://www.marmiton.org/",
    "https://www.doctissimo.fr/", "https://www.ouest-france.fr/", "https://www.lequipe.fr/", "https://www.amazon.fr/",
    "https://www.cdiscount.com/", "https://www.fnac.com/", "https://www.liberation.fr/", "https://www.lepoint.fr/",
    "https://www.bfmtv.com/",
  ],
  ES: [
    "https://elpais.com/", "https://www.elmundo.es/", "https://www.marca.com/", "https://as.com/",
    "https://www.amazon.es/", "https://www.idealista.com/", "https://www.20minutos.es/", "https://www.rtve.es/",
    "https://www.abc.es/", "https://es.wallapop.com/", "https://www.lavanguardia.com/",
  ],
  DE: [
    "https://www.spiegel.de/", "https://www.bild.de/", "https://www.amazon.de/", "https://www.ebay.de/",
    "https://web.de/", "https://www.gmx.net/", "https://www.t-online.de/", "https://www.zeit.de/",
    "https://www.chip.de/", "https://www.kicker.de/", "https://www.otto.de/",
  ],
  UK: [
    "https://www.bbc.co.uk/", "https://www.dailymail.co.uk/", "https://www.amazon.co.uk/", "https://www.ebay.co.uk/",
    "https://www.rightmove.co.uk/", "https://www.sky.com/", "https://www.argos.co.uk/", "https://www.independent.co.uk/",
    "https://www.telegraph.co.uk/", "https://www.gov.uk/", "https://www.autotrader.co.uk/",
  ],
  US: [
    "https://www.walmart.com/", "https://www.target.com/", "https://www.foxnews.com/", "https://www.usatoday.com/",
    "https://www.washingtonpost.com/", "https://www.craigslist.org/", "https://www.zillow.com/", "https://www.yelp.com/",
    "https://www.homedepot.com/", "https://www.bestbuy.com/", "https://www.nbcnews.com/", "https://www.etsy.com/",
    "https://www.costco.com/", "https://www.indeed.com/", "https://www.npr.org/",
  ],
  IT: [
    "https://www.repubblica.it/", "https://www.corriere.it/", "https://www.amazon.it/", "https://www.subito.it/",
    "https://www.gazzetta.it/", "https://www.ansa.it/", "https://www.libero.it/", "https://www.ilmeteo.it/",
  ],
  NL: [
    "https://www.nu.nl/", "https://www.bol.com/", "https://www.marktplaats.nl/", "https://nos.nl/",
    "https://www.telegraaf.nl/", "https://www.ad.nl/",
  ],
  TR: [
    "https://www.hurriyet.com.tr/", "https://www.sahibinden.com/", "https://www.trendyol.com/", "https://www.milliyet.com.tr/",
    "https://www.sozcu.com.tr/", "https://www.hepsiburada.com/",
  ],
};

/// What the regions are called where the settings name them.
const REGION_NAMES = {
  MA: "Morocco", AR: "the Arab world", FR: "France", ES: "Spain", DE: "Germany", UK: "the United Kingdom",
  US: "the United States", IT: "Italy", NL: "the Netherlands", TR: "Türkiye",
};

/// The regions whose sites a time zone's visitors go to, besides the
/// world's, the first the most.
const ZONES = [
  [/^Africa\/(Casablanca|El_Aaiun)$/, ["MA", "FR", "AR"]],
  [/^Africa\/(Algiers|Tunis)$/, ["FR", "AR"]],
  [/^(Africa\/(Cairo|Tripoli|Khartoum)|Asia\/(Riyadh|Dubai|Qatar|Kuwait|Bahrain|Muscat|Baghdad|Amman|Beirut|Damascus|Aden|Gaza|Hebron))$/, ["AR"]],
  [/^Europe\/(Paris|Brussels|Luxembourg|Monaco)$/, ["FR"]],
  [/^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/, ["ES"]],
  [/^Europe\/(Berlin|Vienna|Zurich|Busingen)$/, ["DE"]],
  [/^Europe\/(London|Dublin|Isle_of_Man|Jersey|Guernsey)$/, ["UK"]],
  [/^Europe\/(Rome|Vatican|San_Marino)$/, ["IT"]],
  [/^Europe\/Amsterdam$/, ["NL"]],
  [/^(Europe|Asia)\/Istanbul$/, ["TR"]],
  [/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/\w+|Kentucky\/\w+|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns)|Pacific\/Honolulu)$/, ["US"]],
];

const regionsFor = (zone) => {
  const found = ZONES.find(([pattern]) => pattern.test(String(zone || "")));
  return found ? found[1].slice() : [];
};

/// A site's own part of a host: its registered name ("hespress.com",
/// "bbc.co.uk"), so its subdomains are the same site.
const siteKey = (host) => {
  const name = String(host || "").toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(name) || name.indexOf(":") !== -1) {
    return name;
  }
  const parts = name.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const second = parts[parts.length - 2];
  const top = parts[parts.length - 1];
  const keep = top.length === 2 && /^(co|com|net|org|gov|ac|edu|gob|or|ne|go)$/.test(second) ? 3 : 2;
  return parts.slice(-keep).join(".");
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
};

/// `list` in a random order (Fisher-Yates), as a new list.
const shuffled = (list, random) => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/// `count` home pages to visit, in a random order, one per site: about
/// half the world's and half the regions' of `zone` (the first region the
/// most), or all the world's where the zone names no region.
const pickSites = (count, zone, random = Math.random) => {
  const wanted = Math.max(1, Math.min(200, Math.floor(Number(count) || 0)));
  const regions = regionsFor(zone);
  const chosen = [];
  const seen = new Set();
  const take = (pool, n) => {
    let left = n;
    for (const url of shuffled(pool, random)) {
      if (left <= 0) {
        break;
      }
      const key = siteKey(hostOf(url));
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      chosen.push(url);
      left -= 1;
    }
  };
  if (regions.length) {
    let regional = Math.round(wanted * 0.45);
    const first = regions.length > 1 ? Math.ceil(regional * 0.6) : regional;
    take(SITES[regions[0]], first);
    regional -= first;
    for (let i = 1; i < regions.length && regional > 0; i++) {
      const share = Math.ceil(regional / (regions.length - i));
      take(SITES[regions[i]], share);
      regional -= share;
    }
  }
  take(SITES.global, wanted - chosen.length);
  if (chosen.length < wanted) {
    take([].concat(...Object.values(SITES)), wanted - chosen.length);
  }
  return shuffled(chosen, random);
};

// MARK: - What the settings keep

/// The most sites one collection visits.
const MAX_SITES = 200;

/// What "Collect cookies" does when nothing is saved: 20 popular sites,
/// nothing by itself in a new profile, and every profile at once (as many
/// as this PC can take, see machineLimit).
const DEFAULT_SETTINGS = { mode: "popular", count: 20, sites: [], auto: false, parallel: 0 };

const clampCount = (value) => Math.max(1, Math.min(MAX_SITES, Math.floor(Number(value)) || DEFAULT_SETTINGS.count));

/// The most profiles that ever collect at once.
const MAX_AT_ONCE = 50;

/// How many profiles at once a setting says: a number, or 0 for as many as
/// this PC can take.
const clampParallel = (value) => {
  const wanted = Math.floor(Number(value));
  return Number.isFinite(wanted) && wanted > 0 ? Math.min(MAX_AT_ONCE, wanted) : 0;
};

/// As many profiles as this PC can collect in at once: each loads pages
/// as an open tab does, about 400 MB of memory (3 GB left for the rest)
/// and a quarter of a processor (its pages are read more than loaded).
const machineLimit = (totalBytes = os.totalmem(), processors = os.cpus().length) => Math.max(2, Math.min(
  MAX_AT_ONCE,
  Math.floor((totalBytes / 2 ** 30 - 3) / 0.4),
  Math.max(1, processors) * 4,
));

/// Sites as a person writes them, one per line ("hespress.com",
/// "https://www.youtube.com/"), as addresses to visit: https:// where no
/// scheme is given, each once; what isn't a web address is left out.
const normalizeSites = (input) => {
  const parts = Array.isArray(input) ? input : String(input == null ? "" : input).split(/[\s,;]+/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const text = String(part == null ? "" : part).trim();
    if (!text) {
      continue;
    }
    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    } catch (error) {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname.includes(".") || url.username || url.password) {
      continue;
    }
    url.hash = "";
    if (!seen.has(url.href)) {
      seen.add(url.href);
      out.push(url.href);
    }
    if (out.length >= MAX_SITES) {
      break;
    }
  }
  return out;
};

/// The saved settings (store key "warmup"), each value checked: which
/// sites ("popular", a new random mix each time, or "mine", the user's
/// list), how many popular ones, the user's list, whether a new profile
/// collects by itself, and how many profiles collect at once.
const readSettings = (store) => {
  const saved = (store && store.get("warmup", null)) || {};
  return {
    mode: saved.mode === "mine" ? "mine" : "popular",
    count: clampCount(saved.count),
    sites: normalizeSites(Array.isArray(saved.sites) ? saved.sites : []),
    auto: Boolean(saved.auto),
    parallel: clampParallel(saved.parallel),
  };
};

// MARK: - Links worth following

/// What a link's address or words say it does that a visit never does:
/// sign in, out or up, an account, a cart or an order, a subscription,
/// deleting, downloading or printing, the site's back office.
const AVOID_PATH = /(^|[\/_\-.?=&#])(log-?in|log-?out|log-?off|sign-?in|sign-?out|sign-?up|sign-?off|signin|signout|signup|register|registration|inscription|connexion|deconnexion|déconnexion|auth|oauth|sso|account|accounts|compte|myaccount|profile|profil|settings|preferences|password|cart|basket|panier|checkout|commande|order|orders|subscribe|subscription|abonnement|unsubscribe|delete|remove|supprimer|download|telecharger|télécharger|print|share|admin|wp-admin|wp-login|cdn-cgi|api|captcha|newsletter)([\/_\-.?=&#]|$)|خروج|تسجيل|حذف|حساب|سلة|اشتراك|اشترك/i;
const AVOID_TEXT = /\b(log ?in|log ?out|sign ?in|sign ?out|sign ?up|register|subscribe|unsubscribe|my account|account|cart|checkout|delete|download)\b|s'inscrire|se connecter|se déconnecter|déconnexion|connexion|mon compte|panier|supprimer|télécharger|تسجيل|الدخول|الخروج|اشترك|حسابي|حذف|تحميل/i;
const FILES = /\.(pdf|zip|rar|7z|gz|exe|msi|dmg|apk|ipa|iso|mp3|mp4|m4a|avi|mov|wav|jpe?g|png|gif|webp|svg|ico|docx?|xlsx?|pptx?|csv|txt|xml|json|rss|torrent)$/i;

/// Another page of the site of `pageURL` among `links` ({ href, text,
/// download } as the page has them), one a person reading the page might
/// open: an article's, a product's, a section's. Null when there is none.
const pickLink = (links, pageURL, random = Math.random) => {
  let page;
  try {
    page = new URL(pageURL);
  } catch (error) {
    return null;
  }
  const site = siteKey(page.hostname);
  const here = page.href.split("#")[0];
  const fine = [];
  for (const link of Array.isArray(links) ? links : []) {
    if (!link || typeof link.href !== "string" || link.download) {
      continue;
    }
    let url;
    try {
      url = new URL(link.href);
    } catch (error) {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || siteKey(url.hostname) !== site) {
      continue;
    }
    if (url.href.split("#")[0] === here) {
      continue;
    }
    let path = url.pathname + url.search;
    try {
      path = decodeURIComponent(path);
    } catch (error) {
      // As it is.
    }
    const text = String(link.text || "").trim();
    if (AVOID_PATH.test(path) || FILES.test(url.pathname) || AVOID_TEXT.test(text)) {
      continue;
    }
    fine.push({ href: url.href, text });
  }
  if (!fine.length) {
    return null;
  }
  // Headlines and product names first: what a reader opens.
  const titled = fine.filter((link) => link.text.length >= 12);
  const pool = titled.length ? titled : fine;
  return pool[Math.floor(random() * pool.length)].href;
};

// MARK: - What runs in the page

/// The buttons of the usual cookie banners that accept them.
const CONSENT_SELECTORS = [
  "#onetrust-accept-btn-handler", "#accept-recommended-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept",
  "#didomi-notice-agree-button", "#didomi-popup .didomi-button-highlight",
  ".qc-cmp2-summary-buttons button[mode='primary']", "#qc-cmp2-ui button[mode='primary']",
  ".fc-cta-consent", "#truste-consent-button", "#axeptio_btn_acceptAll", ".cky-btn-accept",
  ".cmplz-btn.cmplz-accept", ".osano-cm-accept-all", "[data-tid='banner-accept']", ".cm-btn-accept-all",
  ".iubenda-cs-accept-btn", "#tarteaucitronPersonalize2", "#tarteaucitronAllAllowed",
  ".moove-gdpr-infobar-allow-all", "#c-p-bn", ".cc-allow", "[data-testid='uc-accept-all-button']",
  "#sp-cc-accept", "#L2AGLb", "#bnp_btn_accept", "button[data-cookiebanner='accept_button']",
  "[data-testid='cookie-policy-manage-dialog-accept-button']",
  "#cookie-accept", "#accept-cookies", "#acceptCookies", "#cookieAccept", ".accept-cookies", ".js-accept-cookies",
];
/// A banner's accepting words, in the languages of the sites visited.
const CONSENT_WORDS = /^(accept|accept all|accept all cookies|accept cookies|accept and close|allow|allow all|allow all cookies|allow cookies|agree|i agree|agree and close|agree & close|agree and continue|got it|ok|okay|i accept|yes, i accept|accepter|tout accepter|accepter tout|accepter et fermer|accepter et continuer|accepter les cookies|j'accepte|j’accepte|autoriser|tout autoriser|autoriser tous les cookies|d'accord|ok, j'ai compris|aceptar|aceptar todo|aceptar todas|aceptar cookies|aceptar y cerrar|alle akzeptieren|akzeptieren|alle zulassen|zustimmen|einverstanden|accetta|accetta tutto|accetta tutti|accetto|kabul et|tümünü kabul et|kabul ediyorum|alles accepteren|accepteren|akkoord|موافق|أوافق|اوافق|قبول|قبول الكل|قبول الجميع|اقبل|أقبل|حسنا|حسناً|السماح بالكل)$/i;
/// What a banner talks about.
const CONSENT_ABOUT = /cookie|consent|gdpr|rgpd|privacy|privacidad|confidentialit|vie privée|datenschutz|çerez|kvkk|الكوكيز|ملفات تعريف الارتباط|ملفات الارتباط|الخصوصية/i;

/// Finds the button that accepts the page's cookie banner, and tells where
/// its middle is in the page's window (CSS pixels), or null. Run in a world
/// of its own, which the page's scripts don't see.
const consentScript = () => `(() => {
  const SELECTORS = ${JSON.stringify(CONSENT_SELECTORS)};
  const WORDS = new RegExp(${JSON.stringify(CONSENT_WORDS.source)}, "i");
  const ABOUT = new RegExp(${JSON.stringify(CONSENT_ABOUT.source)}, "i");
  const visible = (el) => {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1 && s.pointerEvents !== "none";
  };
  const middle = (el, how) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), how };
  };
  const roots = [document];
  for (const host of document.querySelectorAll("#usercentrics-root, #usercentrics-cmp-ui")) {
    if (host.shadowRoot) roots.push(host.shadowRoot);
  }
  for (const root of roots) {
    for (const selector of SELECTORS) {
      let el = null;
      try { el = root.querySelector(selector); } catch (e) {}
      if (visible(el)) return middle(el, selector);
    }
  }
  for (const root of roots) {
    for (const el of root.querySelectorAll("button, [role=button], input[type=button], input[type=submit]")) {
      const text = String(el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ");
      if (!text || text.length > 40 || !WORDS.test(text) || !visible(el)) continue;
      let box = el.parentElement;
      for (let i = 0; i < 6 && box && box !== document.body && box !== document.documentElement; i++, box = box.parentElement) {
        const said = (box.id || "") + " " + (typeof box.className === "string" ? box.className : "") + " " + (box.getAttribute("aria-label") || "");
        if (ABOUT.test(said) || ABOUT.test(String(box.innerText || "").slice(0, 600))) return middle(el, "words");
      }
    }
  }
  return null;
})()`;

/// The page's links a person could see and open, as { href, text,
/// download }, for pickLink. Run in a world of its own.
const LINKS_SCRIPT = `(() => {
  const out = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (out.length >= 300) break;
    const r = a.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(a);
    if (s.visibility === "hidden" || s.display === "none") continue;
    out.push({ href: a.href, text: String(a.innerText || a.getAttribute("aria-label") || a.title || "").trim().replace(/\\s+/g, " ").slice(0, 120), download: a.hasAttribute("download") });
  }
  return out;
})()`;

/// The world the scripts above run in: not the page's (0), nor the one
/// Electron or the extensions use.
const WORLD = 1729;

// MARK: - The visits

/// How long things take, in milliseconds: a page's load at most; a pause
/// once it is shown, between scrolls, after the banner; how far a scroll
/// goes; how many scrolls a page gets, and the odds of going on to another
/// page of the site.
const TIMING = {
  // Before the first site: profiles started together begin within a few
  // seconds of each other, not all in the same one.
  start: [0, 5000],
  load: 25000,
  settle: [1500, 3200],
  between: [900, 2600],
  afterBanner: [700, 1500],
  scrolls: [2, 4],
  moreScrolls: [1, 3],
  scrollBy: [250, 700],
  follow: 0.5,
};

/// TIMING, quicker (the tests').
const FAST = Object.assign({}, TIMING, { start: [0, 200], load: 10000, settle: [150, 300], between: [100, 250], afterBanner: [150, 250] });

/// One profile's visits: the tab nobody sees they happen in (that
/// profile's, with its fingerprints), and how far they are. They go on
/// whichever profile is in use (see Warmup).
class Collection {
  constructor(warmup, profile, list, { mine = false, region = "" } = {}) {
    this.warmup = warmup;
    this.browser = warmup.browser;
    this.profile = profile;
    this.list = list;
    this.timing = warmup.timing;
    this.random = warmup.random;
    this.ses = warmup.session(profile);
    this.tab = null;
    this.wake = null;
    /// Counts the cookies every few seconds while visiting.
    this.ticker = null;
    /// Where the mouse was last (not Noor iPhone's).
    this.mouse = null;
    /// Settled once the visits have ended.
    this.ended = Promise.resolve();
    this.state = {
      running: false, waiting: false, finished: false, stopped: false, profileId: profile.id, profileName: profile.name,
      total: list.length, done: 0, failed: 0, current: "", region, mine, cookies: 0, domains: 0, before: 0,
    };
  }

  status() {
    const s = this.state;
    return { ...s, added: Math.max(0, s.cookies - s.before) };
  }

  emit() {
    this.warmup.emit(this.profile.id);
  }

  count(ses = this.ses) {
    return this.warmup.count(ses);
  }

  /// Starts the visits (the hidden tab made, the cookies counted); they go
  /// on after this returns.
  async begin() {
    const counted = await this.count();
    if (this.state.stopped) {
      return;
    }
    // The hidden tab first: if it can't be made, nothing is under way.
    this.tab = this.browser.backgroundTab(this.profile);
    Object.assign(this.state, { running: true, cookies: counted.cookies, domains: counted.domains, before: counted.cookies });
    // The count goes up as the pages give cookies, not only between sites.
    this.ticker = setInterval(() => {
      this.count().then((now) => {
        if (this.state.running) {
          Object.assign(this.state, now);
          this.emit();
        }
      });
    }, 2000);
    // What a page tries to download is left: no dialog asks where.
    this.refuseDownloads = (event, item, webContents) => {
      if (this.tab && webContents && !this.tab.webContents.isDestroyed() && webContents.id === this.tab.webContents.id) {
        item.cancel();
      }
    };
    this.ses.on("will-download", this.refuseDownloads);
    this.emit();
    this.ended = this.run(this.list, this.ses).catch(() => {}).then(() => this.finish(this.ses)).catch(() => {});
  }

  /// Ends the visits now: the hidden tab closes, and they show as stopped
  /// (what they collected is counted again as they end).
  stop() {
    const was = this.state.running;
    Object.assign(this.state, { running: false, stopped: true, finished: true, current: "" });
    this.stopTicker();
    this.close();
    if (this.wake) {
      this.wake();
    }
    if (was) {
      this.emit();
    }
  }

  stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  close() {
    if (this.tab) {
      const tab = this.tab;
      this.tab = null;
      this.browser.closeBackgroundTab(tab);
    }
  }

  async finish(ses) {
    this.stopTicker();
    this.close();
    if (this.refuseDownloads) {
      ses.removeListener("will-download", this.refuseDownloads);
      this.refuseDownloads = null;
    }
    try {
      await ses.cookies.flushStore();
    } catch (error) {
      // Chromium writes them out by itself in a while.
    }
    Object.assign(this.state, await this.count(ses), { running: false, finished: true, current: "" });
  }

  async run(list, ses) {
    await this.pause(this.timing.start);
    for (const url of list) {
      if (this.state.stopped || !this.tab) {
        break;
      }
      this.state.current = siteKey(hostOf(url));
      this.emit();
      const opened = await this.visit(url);
      if (this.state.stopped) {
        break;
      }
      this.state.done += 1;
      if (!opened) {
        this.state.failed += 1;
      }
      Object.assign(this.state, await this.count(ses));
      this.emit();
    }
  }

  /// One site: its home page read and scrolled, the banner accepted, and
  /// sometimes another of its pages. Whether the home page opened.
  async visit(url) {
    const t = this.timing;
    if (!(await this.open(url))) {
      return false;
    }
    await this.loaded();
    await this.pause(t.settle);
    await this.acceptBanner();
    await this.read(t.scrolls);
    if (this.tab && this.random() < t.follow) {
      const from = this.tab.webContents.getURL();
      const link = await this.linkHere(from);
      if (link && (await this.open(link, from))) {
        await this.loaded();
        await this.pause(t.settle);
        await this.acceptBanner();
        await this.read(t.moreScrolls);
      }
    }
    return true;
  }

  /// A random wait between `range`'s ends, cut short by stop().
  pause([least, most]) {
    if (this.state.stopped) {
      return Promise.resolve();
    }
    const ms = Math.round(least + this.random() * (most - least));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  /// Opens `url` in the hidden tab (from `referrer`, a link's page) and
  /// waits for it to load, as long as TIMING.load at most: a page still
  /// loading by then has given most of its cookies. False if it failed.
  open(url, referrer = null) {
    const tab = this.tab;
    if (!tab || tab.webContents.isDestroyed() || this.state.stopped) {
      return Promise.resolve(false);
    }
    const wc = tab.webContents;
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.wake = null;
        if (!wc.isDestroyed()) {
          wc.removeListener("did-navigate", navigated);
          wc.removeListener("did-finish-load", finished);
          wc.removeListener("did-fail-load", failed);
        }
        resolve(ok);
      };
      // The address that failed: Chromium shows its error page there.
      let failedAt = null;
      // Whether the page asked for is the one shown: the empty page an
      // iPhone's first page comes after isn't (and as it finishes, the
      // address already names the page still loading).
      let committed = false;
      const navigated = (event, url) => {
        if (url && url !== "about:blank") {
          committed = true;
        }
      };
      const finished = () => {
        if (!wc.isDestroyed() && committed) {
          const shown = wc.getURL();
          done(!(failedAt && shown === failedAt));
        }
      };
      // A page that failed over https:// may load again over http:// (see
      // Tab.failed): then that load is waited for.
      const failed = (event, code, description, failedURL, isMainFrame) => {
        if (!isMainFrame || code === -3) {
          return;
        }
        failedAt = failedURL;
        committed = true;
        setImmediate(() => {
          if (wc.isDestroyed() || !wc.isLoading()) {
            done(false);
          }
        });
      };
      const timer = setTimeout(() => {
        if (!wc.isDestroyed()) {
          wc.stop();
        }
        done(true);
      }, this.timing.load);
      this.wake = () => done(false);
      wc.on("did-navigate", navigated);
      wc.on("did-finish-load", finished);
      wc.on("did-fail-load", failed);
      tab.load(url, { referrer });
    });
  }

  /// Waits for the page shown to have loaded (its document complete): the
  /// browser says a page has finished before its document has, now and
  /// then. As long as TIMING.load at most.
  async loaded() {
    const until = Date.now() + this.timing.load;
    while (Date.now() < until && this.tab && !this.state.stopped) {
      if ((await this.inPage("document.readyState")) === "complete") {
        return true;
      }
      await this.wait(150);
    }
    return false;
  }

  /// Runs `code` in the page, in a world of its own.
  async inPage(code) {
    const tab = this.tab;
    if (!tab || tab.webContents.isDestroyed() || this.state.stopped) {
      return null;
    }
    try {
      return await tab.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);
    } catch (error) {
      return null;
    }
  }

  /// Sends the hidden tab's page input, through its debugger, as a
  /// person's: the page gets it as the user's own (trusted) events. Never
  /// waited on for long: the visits go on without what doesn't answer.
  async send(method, params) {
    const tab = this.tab;
    if (!tab || tab.webContents.isDestroyed() || this.state.stopped) {
      return;
    }
    let timer = null;
    try {
      await Promise.race([
        tab.webContents.debugger.sendCommand(method, params),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 5000);
        }),
      ]);
    } catch (error) {
      // The page went on without it.
    } finally {
      clearTimeout(timer);
    }
  }

  wait(ms) {
    return this.pause([ms, ms]);
  }

  /// Mouse input, as the system sends it to the page (not waited on: the
  /// debugger's own mouse input waits a frame's worth for each move).
  pointer(event) {
    const tab = this.tab;
    if (!tab || tab.webContents.isDestroyed() || this.state.stopped) {
      return;
    }
    try {
      tab.webContents.sendInputEvent(event);
    } catch (error) {
      // The page went on without it.
    }
  }

  /// A tap where `x`, `y` is in the page's window (CSS pixels): in Noor
  /// iPhone a finger's (touchstart, touchend, then the click a tap makes),
  /// elsewhere the mouse's, moved there first.
  async tap(x, y) {
    if (this.browser.isIPhone) {
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await this.wait(60 + Math.round(this.random() * 80));
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return;
    }
    await this.moveMouse(x, y);
    this.pointer({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    await this.wait(50 + Math.round(this.random() * 70));
    this.pointer({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  }

  /// The mouse moved to `x`, `y` in a few steps, slowing down at the end.
  async moveMouse(x, y) {
    const from = this.mouse || { x: Math.round(x + (this.random() - 0.5) * 300), y: Math.round(y + 120 + this.random() * 200) };
    const steps = 6 + Math.floor(this.random() * 6);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t * t * (3 - 2 * t);
      this.pointer({ type: "mouseMove", x: Math.round(from.x + (x - from.x) * eased), y: Math.round(from.y + (y - from.y) * eased) });
      await this.wait(12 + Math.round(this.random() * 18));
    }
    this.mouse = { x, y };
  }

  /// A scroll down by about `distance` CSS pixels in a page `width` by
  /// `height`: a finger's flick up the screen in Noor iPhone, the mouse
  /// wheel's turns elsewhere.
  async scrollDown(width, height, distance) {
    const x = Math.round(width * (0.35 + this.random() * 0.3));
    if (this.browser.isIPhone) {
      const from = Math.round(height * (0.7 + this.random() * 0.15));
      const to = Math.max(10, from - Math.round(distance));
      const steps = 10 + Math.floor(this.random() * 8);
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
      for (let i = 1; i <= steps; i++) {
        await this.wait(14 + Math.round(this.random() * 8));
        await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + Math.round((this.random() - 0.5) * 4), y: Math.round(from + ((to - from) * i) / steps) }] });
      }
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return;
    }
    // The wheel's turns, a notch of about 100 pixels at a time.
    const y = Math.round(height * (0.55 + this.random() * 0.2));
    await this.moveMouse(x, y);
    const before = await this.inPage("scrollY");
    let left = Math.round(distance);
    while (left > 0 && this.tab && !this.state.stopped) {
      const notch = Math.min(left, 100 + Math.round(this.random() * 20));
      this.pointer({ type: "mouseWheel", x, y, deltaX: 0, deltaY: -notch });
      left -= notch;
      await this.wait(30 + Math.round(this.random() * 50));
    }
    // Turns the page didn't take (it wasn't ready for them, now and then):
    // the wheel once more, through the debugger, which waits for it.
    await this.wait(150);
    const after = await this.inPage("scrollY");
    if (typeof before === "number" && typeof after === "number" && after - before < 10) {
      await this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: Math.round(distance) });
    }
  }

  /// Accepts the page's cookie banner, if it shows one: tapped again if it
  /// still shows (a tap on a page still scrolling only stops it, as on an
  /// iPhone).
  async acceptBanner() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const spot = await this.inPage(consentScript());
      if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)) {
        return;
      }
      await this.tap(spot.x, spot.y);
      await this.pause(this.timing.afterBanner);
    }
  }

  /// Reads the page: a few scrolls down, with pauses between them.
  async read([least, most]) {
    const t = this.timing;
    const times = least + Math.floor(this.random() * (most - least + 1));
    for (let i = 0; i < times && this.tab && !this.state.stopped; i++) {
      const size = await this.inPage("({ w: innerWidth, h: innerHeight })");
      const width = size && size.w > 0 ? size.w : 400;
      const height = size && size.h > 0 ? size.h : 600;
      await this.scrollDown(width, height, t.scrollBy[0] + this.random() * (t.scrollBy[1] - t.scrollBy[0]));
      await this.pause(t.between);
    }
  }

  /// Another page of the site shown, worth opening, or null.
  async linkHere(pageURL) {
    const links = await this.inPage(LINKS_SCRIPT);
    return pickLink(links, pageURL, this.random);
  }
}

/// A profile's status when nothing was collected in it yet.
const IDLE = {
  running: false, waiting: false, finished: false, stopped: false, total: 0, done: 0, failed: 0, current: "", region: "",
  mine: false, cookies: 0, domains: 0, before: 0, added: 0,
};

/// Collecting cookies, profile by profile: each profile's visits happen in
/// a tab of its own that nobody sees, with its own fingerprints, whichever
/// profile is in use (switching to another doesn't stop them); all at once
/// (as many as the settings say, see atOnce), the rest waiting their turn;
/// and what each profile's last visits did.
class Warmup {
  /// `sites`: the addresses to visit instead of popular ones (tests);
  /// `timing`: TIMING's values to change; `random`: what picks.
  constructor(browser, { sites = null, timing = null, random = Math.random } = {}) {
    this.browser = browser;
    this.sites = Array.isArray(sites) && sites.length ? sites.slice() : null;
    this.timing = Object.assign({}, TIMING, timing || {});
    this.random = random;
    this.listeners = [];
    /// The collections under way, by profile id.
    this.active = new Map();
    /// The profiles waiting their turn: { profile, count }.
    this.waiting = [];
    /// What each profile's last collection did, by profile id.
    this.results = new Map();
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  /// Tells the listeners what changed for the profile `id`.
  emit(id) {
    const status = this.status(id);
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        // A listener's trouble isn't the visits'.
      }
    }
  }

  /// Whether any profile is collecting or waiting to.
  get running() {
    return this.active.size > 0 || this.waiting.length > 0;
  }

  /// The saved settings (see readSettings).
  settings() {
    return readSettings(this.browser.store);
  }

  /// Saves what `next` changes of the settings, checked; the settings now.
  saveSettings(next = {}) {
    const current = this.settings();
    const saved = {
      mode: next.mode === "mine" || next.mode === "popular" ? next.mode : current.mode,
      count: next.count !== undefined ? clampCount(next.count) : current.count,
      sites: next.sites !== undefined ? normalizeSites(next.sites) : current.sites,
      auto: next.auto !== undefined ? Boolean(next.auto) : current.auto,
      parallel: next.parallel !== undefined ? clampParallel(next.parallel) : current.parallel,
    };
    this.browser.store.set("warmup", saved);
    // More at once: those waiting start now.
    if (this.waiting.length) {
      this.next().catch(() => {});
    }
    return saved;
  }

  /// A profile's normal session (its cookies), the profile in use's if none.
  session(profile = this.browser.profile) {
    return require("electron").session.fromPartition(this.browser.partitionFor(false, profile));
  }

  /// How many cookies the session keeps, and for how many sites.
  async count(ses = this.session()) {
    try {
      const cookies = await ses.cookies.get({});
      const sites = new Set(cookies.map((cookie) => siteKey(String(cookie.domain || "").replace(/^\./, ""))));
      return { cookies: cookies.length, domains: sites.size };
    } catch (error) {
      return { cookies: 0, domains: 0 };
    }
  }

  profileOf(id) {
    return (id && this.browser.profiles.find(id)) || this.browser.profile;
  }

  /// What is under way, waits, or was last done in the profile `id` (the
  /// one in use if none).
  status(id = this.browser.profile.id) {
    const active = this.active.get(id);
    if (active) {
      return active.status();
    }
    const profile = this.profileOf(id);
    const at = this.waiting.findIndex((entry) => entry.profile.id === id);
    if (at !== -1) {
      return { ...IDLE, waiting: true, position: at + 1, profileId: id, profileName: profile.name };
    }
    const last = this.results.get(id);
    return last ? { ...last, added: Math.max(0, last.cookies - last.before) } : { ...IDLE, profileId: id, profileName: profile.name };
  }

  /// How many profiles collect at once: as the settings say, or as many
  /// as this PC can take.
  atOnce() {
    const parallel = this.settings().parallel;
    return parallel > 0 ? parallel : machineLimit();
  }

  /// The profiles collecting, and those waiting their turn.
  overview() {
    return {
      atOnce: this.atOnce(),
      machine: machineLimit(),
      running: [...this.active.values()].map((c) => ({ id: c.profile.id, name: c.profile.name, done: c.state.done, total: c.state.total })),
      waiting: this.waiting.map((entry) => ({ id: entry.profile.id, name: entry.profile.name })),
    };
  }

  /// What the pages show of the profile `id` (the one in use if none), at
  /// once: its status, the settings, and the other profiles collecting.
  view(id = this.browser.profile.id) {
    return { ...this.status(id), clearOnQuit: this.browser.clearOnQuit(), settings: this.settings(), overview: this.overview() };
  }

  /// The same, with how many cookies the profile has now if it isn't
  /// collecting.
  async snapshot(id = this.browser.profile.id) {
    const profile = this.profileOf(id);
    const view = this.view(profile.id);
    if (!view.running) {
      const counted = await this.count(this.session(profile));
      const last = this.results.get(profile.id);
      if (last) {
        Object.assign(last, counted);
      }
      Object.assign(view, counted, { before: last ? last.before : counted.cookies });
      view.added = Math.max(0, view.cookies - view.before);
    }
    return view;
  }

  /// Collects the cookies of `profile` (the one in use if none), with the
  /// settings (`count`: that many popular sites instead): now if fewer
  /// profiles than atOnce are collecting, else once their turn comes.
  async start(count = null, profile = this.browser.profile) {
    if (profile) {
      await this.startMany([profile], count);
    }
    return this.snapshot(profile && profile.id);
  }

  /// Collects the cookies of each of `profiles` (those not collecting or
  /// waiting already), all together: as many at once as atOnce, the rest
  /// once their turn comes.
  async startMany(profiles, count = null) {
    const added = [];
    for (const profile of profiles) {
      if (profile && !this.active.has(profile.id) && !this.waiting.some((entry) => entry.profile.id === profile.id)) {
        this.results.delete(profile.id);
        this.waiting.push({ profile, count });
        added.push(profile);
      }
    }
    for (const profile of added) {
      this.emit(profile.id);
    }
    await this.next();
  }

  /// Starts what waits, all of it together, while fewer than atOnce are
  /// under way.
  async next() {
    const limit = this.atOnce();
    const starting = [];
    while (this.active.size < limit && this.waiting.length) {
      const { profile, count } = this.waiting.shift();
      if (!this.browser.profiles.find(profile.id)) {
        continue;
      }
      const collection = this.collectionFor(profile, count);
      this.active.set(profile.id, collection);
      starting.push(collection.begin().catch(() => collection.stop()).then(() => {
        collection.ended.then(() => this.ended(collection));
      }));
    }
    await Promise.all(starting);
    for (const entry of this.waiting) {
      this.emit(entry.profile.id);
    }
  }

  /// A profile's collection over: its result kept, the next one started.
  ended(collection) {
    const id = collection.profile.id;
    const current = this.active.get(id);
    if (current === collection) {
      this.active.delete(id);
    }
    if (current === collection || (!this.active.has(id) && !this.waiting.some((entry) => entry.profile.id === id))) {
      this.results.set(id, collection.status());
    }
    this.emit(id);
    this.next().catch(() => {});
  }

  /// The visits of `profile`: its own sites in a new order each time, or
  /// popular ones (the tests' sites in their place).
  collectionFor(profile, count) {
    const settings = this.settings();
    const browser = this.browser;
    const zone = (browser.timezone && browser.timezone.current) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const mine = count == null && settings.mode === "mine" && settings.sites.length > 0;
    const regions = mine ? [] : regionsFor(zone);
    let list;
    if (mine) {
      list = shuffled(settings.sites, this.random);
    } else if (this.sites) {
      list = this.sites.slice(0, Math.max(1, Number(count) || this.sites.length));
    } else {
      list = pickSites(count == null ? settings.count : count, zone, this.random);
    }
    return new Collection(this, profile, list, { mine, region: regions.length ? REGION_NAMES[regions[0]] || "" : "" });
  }

  /// Stops the collection of the profile `id` (the one in use if none), or
  /// takes it out of the line; what it collected is kept.
  stop(id = this.browser.profile.id) {
    const at = this.waiting.findIndex((entry) => entry.profile.id === id);
    if (at !== -1) {
      this.waiting.splice(at, 1);
      this.emit(id);
    }
    const active = this.active.get(id);
    if (active) {
      active.stop();
      this.active.delete(id);
      this.results.set(id, active.status());
      this.emit(id);
      this.next().catch(() => {});
    }
    return this.view(id);
  }

  /// Stops every collection, and empties the line.
  stopAll() {
    const waiting = this.waiting.map((entry) => entry.profile.id);
    this.waiting = [];
    for (const id of waiting) {
      this.emit(id);
    }
    for (const id of [...this.active.keys()]) {
      this.stop(id);
    }
  }
}

module.exports = {
  Warmup, SITES, REGION_NAMES, regionsFor, siteKey, pickSites, pickLink, consentScript, LINKS_SCRIPT,
  CONSENT_SELECTORS, CONSENT_WORDS, CONSENT_ABOUT, TIMING, FAST, MAX_SITES, DEFAULT_SETTINGS, normalizeSites, readSettings,
  Collection, MAX_AT_ONCE, machineLimit, clampParallel,
};
