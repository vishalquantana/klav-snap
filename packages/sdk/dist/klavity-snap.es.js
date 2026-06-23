var ra = Object.defineProperty;
var ia = (e, t, r) => t in e ? ra(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var xt = (e, t, r) => ia(e, typeof t != "symbol" ? t + "" : t, r);
function na(e, t) {
  if (e.match(/^[a-z]+:\/\//i))
    return e;
  if (e.match(/^\/\//))
    return window.location.protocol + e;
  if (e.match(/^[a-z]+:/i))
    return e;
  const r = document.implementation.createHTMLDocument(), n = r.createElement("base"), i = r.createElement("a");
  return r.head.appendChild(n), r.body.appendChild(i), t && (n.href = t), i.href = e, i.href;
}
const sa = /* @__PURE__ */ (() => {
  let e = 0;
  const t = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => (e += 1, `u${t()}${e}`);
})();
function Fe(e) {
  const t = [];
  for (let r = 0, n = e.length; r < n; r++)
    t.push(e[r]);
  return t;
}
let Ke = null;
function Ds(e = {}) {
  return Ke || (e.includeStyleProperties ? (Ke = e.includeStyleProperties, Ke) : (Ke = Fe(window.getComputedStyle(document.documentElement)), Ke));
}
function Dt(e, t) {
  const n = (e.ownerDocument.defaultView || window).getComputedStyle(e).getPropertyValue(t);
  return n ? parseFloat(n.replace("px", "")) : 0;
}
function oa(e) {
  const t = Dt(e, "border-left-width"), r = Dt(e, "border-right-width");
  return e.clientWidth + t + r;
}
function aa(e) {
  const t = Dt(e, "border-top-width"), r = Dt(e, "border-bottom-width");
  return e.clientHeight + t + r;
}
function zs(e, t = {}) {
  const r = t.width || oa(e), n = t.height || aa(e);
  return { width: r, height: n };
}
function la() {
  let e, t;
  try {
    t = process;
  } catch {
  }
  const r = t && t.env ? t.env.devicePixelRatio : null;
  return r && (e = parseInt(r, 10), Number.isNaN(e) && (e = 1)), e || window.devicePixelRatio || 1;
}
const we = 16384;
function ca(e) {
  (e.width > we || e.height > we) && (e.width > we && e.height > we ? e.width > e.height ? (e.height *= we / e.width, e.width = we) : (e.width *= we / e.height, e.height = we) : e.width > we ? (e.height *= we / e.width, e.width = we) : (e.width *= we / e.height, e.height = we));
}
function zt(e) {
  return new Promise((t, r) => {
    const n = new Image();
    n.onload = () => {
      n.decode().then(() => {
        requestAnimationFrame(() => t(n));
      });
    }, n.onerror = r, n.crossOrigin = "anonymous", n.decoding = "async", n.src = e;
  });
}
async function ua(e) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then((t) => `data:image/svg+xml;charset=utf-8,${t}`);
}
async function da(e, t, r) {
  const n = "http://www.w3.org/2000/svg", i = document.createElementNS(n, "svg"), s = document.createElementNS(n, "foreignObject");
  return i.setAttribute("width", `${t}`), i.setAttribute("height", `${r}`), i.setAttribute("viewBox", `0 0 ${t} ${r}`), s.setAttribute("width", "100%"), s.setAttribute("height", "100%"), s.setAttribute("x", "0"), s.setAttribute("y", "0"), s.setAttribute("externalResourcesRequired", "true"), i.appendChild(s), s.appendChild(e), ua(i);
}
const ge = (e, t) => {
  if (e instanceof t)
    return !0;
  const r = Object.getPrototypeOf(e);
  return r === null ? !1 : r.constructor.name === t.name || ge(r, t);
};
function ha(e) {
  const t = e.getPropertyValue("content");
  return `${e.cssText} content: '${t.replace(/'|"/g, "")}';`;
}
function pa(e, t) {
  return Ds(t).map((r) => {
    const n = e.getPropertyValue(r), i = e.getPropertyPriority(r);
    return `${r}: ${n}${i ? " !important" : ""};`;
  }).join(" ");
}
function fa(e, t, r, n) {
  const i = `.${e}:${t}`, s = r.cssText ? ha(r) : pa(r, n);
  return document.createTextNode(`${i}{${s}}`);
}
function Yi(e, t, r, n) {
  const i = window.getComputedStyle(e, r), s = i.getPropertyValue("content");
  if (s === "" || s === "none")
    return;
  const c = sa();
  try {
    t.className = `${t.className} ${c}`;
  } catch {
    return;
  }
  const h = document.createElement("style");
  h.appendChild(fa(c, r, i, n)), t.appendChild(h);
}
function ma(e, t, r) {
  Yi(e, t, ":before", r), Yi(e, t, ":after", r);
}
const Ji = "application/font-woff", Xi = "image/jpeg", ga = {
  woff: Ji,
  woff2: Ji,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: Xi,
  jpeg: Xi,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function ya(e) {
  const t = /\.([^./]*?)$/g.exec(e);
  return t ? t[1] : "";
}
function Si(e) {
  const t = ya(e).toLowerCase();
  return ga[t] || "";
}
function ba(e) {
  return e.split(/,/)[1];
}
function bi(e) {
  return e.search(/^(data:)/) !== -1;
}
function va(e, t) {
  return `data:${t};base64,${e}`;
}
async function Fs(e, t, r) {
  const n = await fetch(e, t);
  if (n.status === 404)
    throw new Error(`Resource "${n.url}" not found`);
  const i = await n.blob();
  return new Promise((s, c) => {
    const h = new FileReader();
    h.onerror = c, h.onloadend = () => {
      try {
        s(r({ res: n, result: h.result }));
      } catch (o) {
        c(o);
      }
    }, h.readAsDataURL(i);
  });
}
const cr = {};
function wa(e, t, r) {
  let n = e.replace(/\?.*/, "");
  return r && (n = e), /ttf|otf|eot|woff2?/i.test(n) && (n = n.replace(/.*\//, "")), t ? `[${t}]${n}` : n;
}
async function Ci(e, t, r) {
  const n = wa(e, t, r.includeQueryParams);
  if (cr[n] != null)
    return cr[n];
  r.cacheBust && (e += (/\?/.test(e) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime());
  let i;
  try {
    const s = await Fs(e, r.fetchRequestInit, ({ res: c, result: h }) => (t || (t = c.headers.get("Content-Type") || ""), ba(h)));
    i = va(s, t);
  } catch (s) {
    i = r.imagePlaceholder || "";
    let c = `Failed to fetch resource: ${e}`;
    s && (c = typeof s == "string" ? s : s.message), c && console.warn(c);
  }
  return cr[n] = i, i;
}
async function xa(e) {
  const t = e.toDataURL();
  return t === "data:," ? e.cloneNode(!1) : zt(t);
}
async function ka(e, t) {
  if (e.currentSrc) {
    const s = document.createElement("canvas"), c = s.getContext("2d");
    s.width = e.clientWidth, s.height = e.clientHeight, c == null || c.drawImage(e, 0, 0, s.width, s.height);
    const h = s.toDataURL();
    return zt(h);
  }
  const r = e.poster, n = Si(r), i = await Ci(r, n, t);
  return zt(i);
}
async function Sa(e, t) {
  var r;
  try {
    if (!((r = e == null ? void 0 : e.contentDocument) === null || r === void 0) && r.body)
      return await Yt(e.contentDocument.body, t, !0);
  } catch {
  }
  return e.cloneNode(!1);
}
async function Ca(e, t) {
  return ge(e, HTMLCanvasElement) ? xa(e) : ge(e, HTMLVideoElement) ? ka(e, t) : ge(e, HTMLIFrameElement) ? Sa(e, t) : e.cloneNode(Us(e));
}
const Ea = (e) => e.tagName != null && e.tagName.toUpperCase() === "SLOT", Us = (e) => e.tagName != null && e.tagName.toUpperCase() === "SVG";
async function Ma(e, t, r) {
  var n, i;
  if (Us(t))
    return t;
  let s = [];
  return Ea(e) && e.assignedNodes ? s = Fe(e.assignedNodes()) : ge(e, HTMLIFrameElement) && (!((n = e.contentDocument) === null || n === void 0) && n.body) ? s = Fe(e.contentDocument.body.childNodes) : s = Fe(((i = e.shadowRoot) !== null && i !== void 0 ? i : e).childNodes), s.length === 0 || ge(e, HTMLVideoElement) || await s.reduce((c, h) => c.then(() => Yt(h, r)).then((o) => {
    o && t.appendChild(o);
  }), Promise.resolve()), t;
}
function Ra(e, t, r) {
  const n = t.style;
  if (!n)
    return;
  const i = window.getComputedStyle(e);
  i.cssText ? (n.cssText = i.cssText, n.transformOrigin = i.transformOrigin) : Ds(r).forEach((s) => {
    let c = i.getPropertyValue(s);
    s === "font-size" && c.endsWith("px") && (c = `${Math.floor(parseFloat(c.substring(0, c.length - 2))) - 0.1}px`), ge(e, HTMLIFrameElement) && s === "display" && c === "inline" && (c = "block"), s === "d" && t.getAttribute("d") && (c = `path(${t.getAttribute("d")})`), n.setProperty(s, c, i.getPropertyPriority(s));
  });
}
function Oa(e, t) {
  ge(e, HTMLTextAreaElement) && (t.innerHTML = e.value), ge(e, HTMLInputElement) && t.setAttribute("value", e.value);
}
function Ia(e, t) {
  if (ge(e, HTMLSelectElement)) {
    const n = Array.from(t.children).find((i) => e.value === i.getAttribute("value"));
    n && n.setAttribute("selected", "");
  }
}
function Aa(e, t, r) {
  return ge(t, Element) && (Ra(e, t, r), ma(e, t, r), Oa(e, t), Ia(e, t)), t;
}
async function La(e, t) {
  const r = e.querySelectorAll ? e.querySelectorAll("use") : [];
  if (r.length === 0)
    return e;
  const n = {};
  for (let s = 0; s < r.length; s++) {
    const h = r[s].getAttribute("xlink:href");
    if (h) {
      const o = e.querySelector(h), p = document.querySelector(h);
      !o && p && !n[h] && (n[h] = await Yt(p, t, !0));
    }
  }
  const i = Object.values(n);
  if (i.length) {
    const s = "http://www.w3.org/1999/xhtml", c = document.createElementNS(s, "svg");
    c.setAttribute("xmlns", s), c.style.position = "absolute", c.style.width = "0", c.style.height = "0", c.style.overflow = "hidden", c.style.display = "none";
    const h = document.createElementNS(s, "defs");
    c.appendChild(h);
    for (let o = 0; o < i.length; o++)
      h.appendChild(i[o]);
    e.appendChild(c);
  }
  return e;
}
async function Yt(e, t, r) {
  return !r && t.filter && !t.filter(e) ? null : Promise.resolve(e).then((n) => Ca(n, t)).then((n) => Ma(e, n, t)).then((n) => Aa(e, n, t)).then((n) => La(n, t));
}
const Bs = /url\((['"]?)([^'"]+?)\1\)/g, Pa = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g, Ta = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function Na(e) {
  const t = e.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`, "g");
}
function _a(e) {
  const t = [];
  return e.replace(Bs, (r, n, i) => (t.push(i), r)), t.filter((r) => !bi(r));
}
async function $a(e, t, r, n, i) {
  try {
    const s = r ? na(t, r) : t, c = Si(t);
    let h;
    return i || (h = await Ci(s, c, n)), e.replace(Na(t), `$1${h}$3`);
  } catch {
  }
  return e;
}
function Da(e, { preferredFontFormat: t }) {
  return t ? e.replace(Ta, (r) => {
    for (; ; ) {
      const [n, , i] = Pa.exec(r) || [];
      if (!i)
        return "";
      if (i === t)
        return `src: ${n};`;
    }
  }) : e;
}
function Ws(e) {
  return e.search(Bs) !== -1;
}
async function qs(e, t, r) {
  if (!Ws(e))
    return e;
  const n = Da(e, r);
  return _a(n).reduce((s, c) => s.then((h) => $a(h, c, t, r)), Promise.resolve(n));
}
async function Ze(e, t, r) {
  var n;
  const i = (n = t.style) === null || n === void 0 ? void 0 : n.getPropertyValue(e);
  if (i) {
    const s = await qs(i, null, r);
    return t.style.setProperty(e, s, t.style.getPropertyPriority(e)), !0;
  }
  return !1;
}
async function za(e, t) {
  await Ze("background", e, t) || await Ze("background-image", e, t), await Ze("mask", e, t) || await Ze("-webkit-mask", e, t) || await Ze("mask-image", e, t) || await Ze("-webkit-mask-image", e, t);
}
async function Fa(e, t) {
  const r = ge(e, HTMLImageElement);
  if (!(r && !bi(e.src)) && !(ge(e, SVGImageElement) && !bi(e.href.baseVal)))
    return;
  const n = r ? e.src : e.href.baseVal, i = await Ci(n, Si(n), t);
  await new Promise((s, c) => {
    e.onload = s, e.onerror = t.onImageErrorHandler ? (...o) => {
      try {
        s(t.onImageErrorHandler(...o));
      } catch (p) {
        c(p);
      }
    } : c;
    const h = e;
    h.decode && (h.decode = s), h.loading === "lazy" && (h.loading = "eager"), r ? (e.srcset = "", e.src = i) : e.href.baseVal = i;
  });
}
async function Ua(e, t) {
  const n = Fe(e.childNodes).map((i) => js(i, t));
  await Promise.all(n).then(() => e);
}
async function js(e, t) {
  ge(e, Element) && (await za(e, t), await Fa(e, t), await Ua(e, t));
}
function Ba(e, t) {
  const { style: r } = e;
  t.backgroundColor && (r.backgroundColor = t.backgroundColor), t.width && (r.width = `${t.width}px`), t.height && (r.height = `${t.height}px`);
  const n = t.style;
  return n != null && Object.keys(n).forEach((i) => {
    r[i] = n[i];
  }), e;
}
const Ki = {};
async function Zi(e) {
  let t = Ki[e];
  if (t != null)
    return t;
  const n = await (await fetch(e)).text();
  return t = { url: e, cssText: n }, Ki[e] = t, t;
}
async function Qi(e, t) {
  let r = e.cssText;
  const n = /url\(["']?([^"')]+)["']?\)/g, s = (r.match(/url\([^)]+\)/g) || []).map(async (c) => {
    let h = c.replace(n, "$1");
    return h.startsWith("https://") || (h = new URL(h, e.url).href), Fs(h, t.fetchRequestInit, ({ result: o }) => (r = r.replace(c, `url(${o})`), [c, o]));
  });
  return Promise.all(s).then(() => r);
}
function en(e) {
  if (e == null)
    return [];
  const t = [], r = /(\/\*[\s\S]*?\*\/)/gi;
  let n = e.replace(r, "");
  const i = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
  for (; ; ) {
    const o = i.exec(n);
    if (o === null)
      break;
    t.push(o[0]);
  }
  n = n.replace(i, "");
  const s = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi, c = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})", h = new RegExp(c, "gi");
  for (; ; ) {
    let o = s.exec(n);
    if (o === null) {
      if (o = h.exec(n), o === null)
        break;
      s.lastIndex = h.lastIndex;
    } else
      h.lastIndex = s.lastIndex;
    t.push(o[0]);
  }
  return t;
}
async function Wa(e, t) {
  const r = [], n = [];
  return e.forEach((i) => {
    if ("cssRules" in i)
      try {
        Fe(i.cssRules || []).forEach((s, c) => {
          if (s.type === CSSRule.IMPORT_RULE) {
            let h = c + 1;
            const o = s.href, p = Zi(o).then((a) => Qi(a, t)).then((a) => en(a).forEach((d) => {
              try {
                i.insertRule(d, d.startsWith("@import") ? h += 1 : i.cssRules.length);
              } catch (u) {
                console.error("Error inserting rule from remote css", {
                  rule: d,
                  error: u
                });
              }
            })).catch((a) => {
              console.error("Error loading remote css", a.toString());
            });
            n.push(p);
          }
        });
      } catch (s) {
        const c = e.find((h) => h.href == null) || document.styleSheets[0];
        i.href != null && n.push(Zi(i.href).then((h) => Qi(h, t)).then((h) => en(h).forEach((o) => {
          c.insertRule(o, c.cssRules.length);
        })).catch((h) => {
          console.error("Error loading remote stylesheet", h);
        })), console.error("Error inlining remote css file", s);
      }
  }), Promise.all(n).then(() => (e.forEach((i) => {
    if ("cssRules" in i)
      try {
        Fe(i.cssRules || []).forEach((s) => {
          r.push(s);
        });
      } catch (s) {
        console.error(`Error while reading CSS rules from ${i.href}`, s);
      }
  }), r));
}
function qa(e) {
  return e.filter((t) => t.type === CSSRule.FONT_FACE_RULE).filter((t) => Ws(t.style.getPropertyValue("src")));
}
async function ja(e, t) {
  if (e.ownerDocument == null)
    throw new Error("Provided element is not within a Document");
  const r = Fe(e.ownerDocument.styleSheets), n = await Wa(r, t);
  return qa(n);
}
function Hs(e) {
  return e.trim().replace(/["']/g, "");
}
function Ha(e) {
  const t = /* @__PURE__ */ new Set();
  function r(n) {
    (n.style.fontFamily || getComputedStyle(n).fontFamily).split(",").forEach((s) => {
      t.add(Hs(s));
    }), Array.from(n.children).forEach((s) => {
      s instanceof HTMLElement && r(s);
    });
  }
  return r(e), t;
}
async function Va(e, t) {
  const r = await ja(e, t), n = Ha(e);
  return (await Promise.all(r.filter((s) => n.has(Hs(s.style.fontFamily))).map((s) => {
    const c = s.parentStyleSheet ? s.parentStyleSheet.href : null;
    return qs(s.cssText, c, t);
  }))).join(`
`);
}
async function Ga(e, t) {
  const r = t.fontEmbedCSS != null ? t.fontEmbedCSS : t.skipFonts ? null : await Va(e, t);
  if (r) {
    const n = document.createElement("style"), i = document.createTextNode(r);
    n.appendChild(i), e.firstChild ? e.insertBefore(n, e.firstChild) : e.appendChild(n);
  }
}
async function Ya(e, t = {}) {
  const { width: r, height: n } = zs(e, t), i = await Yt(e, t, !0);
  return await Ga(i, t), await js(i, t), Ba(i, t), await da(i, r, n);
}
async function Ja(e, t = {}) {
  const { width: r, height: n } = zs(e, t), i = await Ya(e, t), s = await zt(i), c = document.createElement("canvas"), h = c.getContext("2d"), o = t.pixelRatio || la(), p = t.canvasWidth || r, a = t.canvasHeight || n;
  return c.width = p * o, c.height = a * o, t.skipAutoScale || ca(c), c.style.width = `${p}`, c.style.height = `${a}`, t.backgroundColor && (h.fillStyle = t.backgroundColor, h.fillRect(0, 0, c.width, c.height)), h.drawImage(s, 0, 0, c.width, c.height), c;
}
async function Xa(e, t = {}) {
  return (await Ja(e, t)).toDataURL();
}
const Ka = {
  "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
  "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
  dna: '<path d="m10 16 1.5 1.5" /> <path d="m14 8-1.5-1.5" /> <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" /> <path d="m16.5 10.5 1 1" /> <path d="m17 6-2.891-2.891" /> <path d="M2 15c6.667-6 13.333 0 20-6" /> <path d="m20 9 .891.891" /> <path d="M3.109 14.109 4 15" /> <path d="m6.5 12.5 1 1" /> <path d="m7 18 2.891 2.891" /> <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />',
  bug: '<path d="M12 20v-9" /> <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" /> <path d="M14.12 3.88 16 2" /> <path d="M21 21a4 4 0 0 0-3.81-4" /> <path d="M21 5a4 4 0 0 1-3.55 3.97" /> <path d="M22 13h-4" /> <path d="M3 21a4 4 0 0 1 3.81-4" /> <path d="M3 5a4 4 0 0 0 3.55 3.97" /> <path d="M6 13H2" /> <path d="m8 2 1.88 1.88" /> <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />',
  search: '<path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" />',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /> <path d="M9 18h6" /> <path d="M10 22h4" />',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />',
  sun: '<circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" />',
  "mouse-pointer-2": '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /> <circle cx="12" cy="12" r="3" />',
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />',
  meh: '<circle cx="12" cy="12" r="10" /> <line x1="8" x2="16" y1="15" y2="15" /> <line x1="9" x2="9.01" y1="9" y2="9" /> <line x1="15" x2="15.01" y1="9" y2="9" />',
  angry: '<circle cx="12" cy="12" r="10" /> <path d="M16 16s-1.5-2-4-2-4 2-4 2" /> <path d="M7.5 8 10 9" /> <path d="m14 9 2.5-1" /> <path d="M9 10h.01" /> <path d="M15 10h.01" />',
  frown: '<circle cx="12" cy="12" r="10" /> <path d="M16 16s-1.5-2-4-2-4 2-4 2" /> <line x1="9" x2="9.01" y1="9" y2="9" /> <line x1="15" x2="15.01" y1="9" y2="9" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  "check-circle": '<path d="M21.801 10A10 10 0 1 1 17 3.335" /> <path d="m9 11 3 3L22 4" />',
  x: '<path d="M18 6 6 18" /> <path d="m6 6 12 12" />',
  "x-circle": '<circle cx="12" cy="12" r="10" /> <path d="m15 9-6 6" /> <path d="m9 9 6 6" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /> <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />',
  mic: '<path d="M12 19v3" /> <path d="M19 10v2a7 7 0 0 1-14 0v-2" /> <rect x="9" y="2" width="6" height="13" rx="3" />',
  puzzle: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />',
  sprout: '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3" /> <path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" /> <path d="M5 21h14" />',
  camera: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /> <circle cx="12" cy="13" r="3" />',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /> <circle cx="12" cy="10" r="3" />',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2" /> <line x1="8" x2="16" y1="21" y2="21" /> <line x1="12" x2="12" y1="17" y2="21" />',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /> <path d="m15 5 4 4" />',
  scissors: '<circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx="6" cy="18" r="3" /> <path d="M14.8 14.8 20 20" />',
  square: '<rect width="18" height="18" x="3" y="3" rx="2" />',
  "trash-2": '<path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />',
  plug: '<path d="M12 22v-5" /> <path d="M9 8V2" /> <path d="M15 8V2" /> <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /> <path d="M13 5v2" /> <path d="M13 17v2" /> <path d="M13 11v2" />',
  "message-circle": '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" />',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /> <circle cx="12" cy="12" r="3" />',
  "radio-tower": '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" /> <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" /> <circle cx="12" cy="9" r="2" /> <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" /> <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" /> <path d="M9.5 18h5" /> <path d="m8 22 4-11 4 11" />',
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /> <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" />',
  plus: '<path d="M5 12h14" /> <path d="M12 5v14" />',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /> <path d="M20 2v4" /> <path d="M22 4h-4" /> <circle cx="4" cy="20" r="2" />',
  paperclip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />',
  "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" />',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" /> <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" /> <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" /> <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />',
  footprints: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" /> <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" /> <path d="M16 17h4" /> <path d="M4 13h4" />',
  satellite: '<path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5" /> <path d="M16.5 7.5 19 5" /> <path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5" /> <path d="M9 21a6 6 0 0 0-6-6" /> <path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z" />',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
  pause: '<rect x="14" y="3" width="5" height="18" rx="1" /> <rect x="5" y="3" width="5" height="18" rx="1" />',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" />',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0" /> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />',
  "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" /> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /> <path d="M8 16H3v5" />',
  bot: '<path d="M12 8V4H8" /> <rect width="16" height="12" x="4" y="8" rx="2" /> <path d="M2 14h2" /> <path d="M20 14h2" /> <path d="M15 13v2" /> <path d="M9 13v2" />',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
  "chevron-left": '<path d="m15 18-6-6 6-6" />',
  "chevron-right": '<path d="m9 18 6-6-6-6" />'
};
function Za(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function ie(e, t = {}) {
  const r = Ka[e];
  if (!r)
    return console.warn("[Klavity] unknown icon: " + e), "";
  const n = t.size ?? 18, i = t.class ? `icon ${t.class}` : "icon", s = t.label ? 'role="img"' : 'aria-hidden="true"', c = t.label ? `<title>${Za(t.label)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${i}" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.125em" ${s}>${c}${r}</svg>`;
}
const et = {
  integration: "jira",
  backendUrl: "",
  autoFileErrors: !1,
  connectionMode: "direct",
  klavToken: "",
  jira: { baseUrl: "", email: "", token: "", projectKey: "" },
  linear: { apiKey: "", teamId: "" },
  github: { token: "", repo: "" },
  plane: { token: "", host: "https://api.plane.so", workspace: "", projectId: "" }
};
class Qa {
  constructor(t, r) {
    this.shapes = [], this.canvas = t, this.imageDataUrl = r;
  }
  computeLineWidth() {
    return Math.max(3, this.canvas.width / 400);
  }
  computeFontSize() {
    return Math.max(16, this.canvas.width / 60);
  }
  addShape(t) {
    this.shapes.push(t), this.redraw();
  }
  undo() {
    this.shapes.pop(), this.redraw();
  }
  clearAll() {
    this.shapes.length = 0, this.redraw();
  }
  redraw() {
    if (typeof Image > "u") return;
    const t = this.canvas.getContext("2d"), r = new Image();
    r.onload = () => {
      t.clearRect(0, 0, this.canvas.width, this.canvas.height), t.drawImage(r, 0, 0), this.shapes.forEach((n) => this.drawShape(t, n));
    }, r.src = this.imageDataUrl;
  }
  drawShape(t, r) {
    if (t.strokeStyle = r.color, t.fillStyle = r.color, t.lineWidth = this.computeLineWidth(), t.lineCap = "round", r.type === "pen")
      t.beginPath(), r.points.forEach(
        (n, i) => i === 0 ? t.moveTo(n.x, n.y) : t.lineTo(n.x, n.y)
      ), t.stroke();
    else if (r.type === "rect")
      t.strokeRect(r.x, r.y, r.w, r.h);
    else if (r.type === "arrow") {
      const n = Math.atan2(r.y2 - r.y1, r.x2 - r.x1), i = Math.max(12, this.computeLineWidth() * 4);
      t.beginPath(), t.moveTo(r.x1, r.y1), t.lineTo(r.x2, r.y2), t.lineTo(
        r.x2 - i * Math.cos(n - Math.PI / 6),
        r.y2 - i * Math.sin(n - Math.PI / 6)
      ), t.moveTo(r.x2, r.y2), t.lineTo(
        r.x2 - i * Math.cos(n + Math.PI / 6),
        r.y2 - i * Math.sin(n + Math.PI / 6)
      ), t.stroke();
    } else r.type === "circle" ? (t.beginPath(), t.ellipse(r.x, r.y, Math.abs(r.rx), Math.abs(r.ry), 0, 0, Math.PI * 2), t.stroke()) : r.type === "text" && (t.font = `bold ${this.computeFontSize()}px sans-serif`, t.fillText(r.text, r.x, r.y));
  }
  async save() {
    const t = this.canvas.toDataURL("image/png");
    return t.length > 5 * 1024 * 1024 ? this.canvas.toDataURL("image/jpeg", 0.85) : t;
  }
}
async function el(e, t, r) {
  const n = {
    type: e.type,
    description: e.description,
    context: e.context,
    screenshots: e.screenshots,
    settings: t,
    ...e.projectId ? { projectId: e.projectId } : {},
    replayEvents: e.replayEvents
  };
  if (t.backendUrl) {
    if (!r.backend) throw new Error("No handler for backend mode");
    return r.backend(n);
  }
  const i = r[t.integration];
  if (!i) throw new Error(`No handler for integration: ${t.integration}`);
  return i(n);
}
const tl = 50, rl = 2e3, il = 1e3, nl = 500, tn = /^(?:token|access_token|refresh_token|api[_-]?key|apikey|key|secret|password|passwd|pwd|auth|authorization|session|sid|jwt|code|otp)$/i;
function kt(e, t) {
  e.push(t), e.length > tl && e.shift();
}
function Ei(e, t) {
  return e.length <= t ? e : e.slice(0, t) + "…[truncated]";
}
function ur(e) {
  let t = String(e || "");
  try {
    const r = new URL(t, typeof location < "u" ? location.href : "http://localhost");
    let n = !1;
    r.searchParams.forEach((i, s) => {
      tn.test(s) && (r.searchParams.set(s, "REDACTED"), n = !0);
    }), n && (t = r.toString());
  } catch {
    t = t.replace(/([?&])([^=&]+)=([^&]*)/g, (r, n, i, s) => tn.test(i) ? `${n}${i}=REDACTED` : r);
  }
  return Ei(t, il);
}
function sl(e) {
  if (typeof e == "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return Ei(JSON.stringify(e), nl);
  } catch {
    return String(e);
  }
}
function ol(e, t = {}) {
  const r = {
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    consoleErrors: [...e.consoleErrors],
    networkFailures: [...e.networkFailures]
  };
  return t.identity && Object.keys(t.identity).length && (r.identity = t.identity), t.metadata && Object.keys(t.metadata).length && (r.metadata = t.metadata), r;
}
function al(e, t = {}) {
  if (typeof window > "u") return e;
  const r = window;
  if (r.__klavityCaptureInstalled) return e;
  r.__klavityCaptureInstalled = !0;
  const n = () => t.isContextValid ? t.isContextValid() : !0, i = (o, p, a) => {
    kt(e.consoleErrors, { message: Ei(p, rl), stack: a, timestamp: Date.now(), level: o });
  }, s = window.onerror;
  if (window.onerror = (o, p, a, d, u) => {
    var l;
    if (n()) {
      const m = String(o);
      i("error", m, u == null ? void 0 : u.stack), (l = t.onError) == null || l.call(t, m, u == null ? void 0 : u.stack);
    }
    return typeof s == "function" ? s.call(window, o, p, a, d, u) : !1;
  }, window.addEventListener("unhandledrejection", (o) => {
    var d;
    if (!n()) return;
    const p = o.reason, a = String((p == null ? void 0 : p.message) ?? p);
    i("error", a, p == null ? void 0 : p.stack), (d = t.onError) == null || d.call(t, a, p == null ? void 0 : p.stack);
  }), t.consoleLevels) {
    const o = ["log", "info", "warn", "error"];
    for (const p of o) {
      const a = console[p];
      typeof a == "function" && (console[p] = (...d) => {
        try {
          n() && i(p, d.map(sl).join(" "));
        } catch {
        }
        return a.apply(console, d);
      });
    }
  }
  const c = window.fetch;
  window.fetch = async (...o) => {
    var u;
    if (!n()) return c(...o);
    const p = Date.now(), a = typeof o[0] == "string" ? o[0] : o[0] instanceof URL ? o[0].href : o[0].url, d = (typeof o[0] == "object" && o[0] && "method" in o[0] ? o[0].method : (u = o[1]) == null ? void 0 : u.method) || "GET";
    try {
      const l = await c(...o);
      return kt(e.networkFailures, { url: ur(a), status: l.status, method: String(d).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), l;
    } catch (l) {
      throw kt(e.networkFailures, { url: ur(a), status: 0, method: String(d).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), l;
    }
  };
  const h = window.XMLHttpRequest;
  if (h && h.prototype) {
    const o = h.prototype.open, p = h.prototype.send;
    h.prototype.open = function(a, d, ...u) {
      return this.__klav = { method: String(a || "GET").toUpperCase(), url: String(d || "") }, o.call(this, a, d, ...u);
    }, h.prototype.send = function(...a) {
      const d = this.__klav;
      if (d && n()) {
        const u = Date.now();
        this.addEventListener("loadend", () => {
          try {
            kt(e.networkFailures, {
              url: ur(d.url),
              status: Number(this.status) || 0,
              method: d.method,
              timestamp: u,
              durationMs: Date.now() - u
            });
          } catch {
          }
        });
      }
      return p.apply(this, a);
    };
  }
  return e;
}
const ll = ["light", "dark", "glass", "neon", "custom", "liquid"], cl = ["hidden", "icon", "full", "custom"], ul = /^#[0-9a-fA-F]{3,8}$/, dl = /^[\w \-,'"().]+$/, hl = (e) => typeof e == "object" && e !== null, St = (e) => typeof e == "string" && ul.test(e.trim()) ? e.trim() : void 0, rn = (e, t) => typeof e == "string" && e.trim() ? e.trim().slice(0, t) : void 0, pl = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().slice(0, 120);
  return t && dl.test(t) ? t : void 0;
}, nn = {
  // Default = the marketing home surface: warm cream paper with Klavity-purple and amber atmosphere.
  // The panel is intentionally not stark white; chips/inputs are only a step lighter for affordance.
  light: { "--kl-overlay": "rgba(28,22,40,.30)", "--kl-bg": "#f5f3ee", "--kl-fg": "#19140f", "--kl-muted": "#574f45", "--kl-border": "rgba(25,20,15,.12)", "--kl-chip": "#fffdf8", "--kl-input-bg": "#fffdf8", "--kl-accent": "#6366f1", "--kl-on-accent": "#fff", "--kl-accent2": "#d98324", "--kl-radius": "16px", "--kl-shadow": "0 24px 60px rgba(40,28,70,.18), 0 10px 30px rgba(99,102,241,.10)", "--kl-backdrop": "none" },
  dark: { "--kl-overlay": "rgba(0,0,0,.5)", "--kl-bg": "#1e1e2e", "--kl-fg": "#cdd6f4", "--kl-muted": "#a6adc8", "--kl-border": "#45475a", "--kl-chip": "#313244", "--kl-input-bg": "#181825", "--kl-accent": "#89b4fa", "--kl-on-accent": "#1e1e2e", "--kl-accent2": "#fab387", "--kl-radius": "12px", "--kl-shadow": "0 20px 60px rgba(0,0,0,.5)", "--kl-backdrop": "none" },
  glass: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.14)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.28)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.10)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)", "--kl-backdrop": "blur(22px) saturate(180%)" },
  neon: { "--kl-overlay": "rgba(8,4,20,.55)", "--kl-bg": "#0e0b1e", "--kl-fg": "#f4f0ff", "--kl-muted": "#a99fd6", "--kl-border": "#3a2d6b", "--kl-chip": "#1c1640", "--kl-input-bg": "#140f2c", "--kl-accent": "#ff2d95", "--kl-on-accent": "#fff", "--kl-accent2": "#15e0ff", "--kl-radius": "14px", "--kl-shadow": "0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)", "--kl-backdrop": "none" },
  // 'liquid' on a real page can't do clone-refraction; render as frosted glass.
  liquid: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.10)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.4)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.08)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)", "--kl-backdrop": "blur(14px) saturate(170%)" }
};
function sn(e) {
  let t = e.replace("#", "");
  t.length === 3 && (t = t.split("").map((c) => c + c).join(""));
  const r = parseInt(t.slice(0, 6), 16), n = r >> 16 & 255, i = r >> 8 & 255, s = r & 255;
  return 0.299 * n + 0.587 * i + 0.114 * s;
}
function Vs(e) {
  const t = hl(e) ? e : {}, n = { theme: typeof t.theme == "string" && ll.includes(t.theme) ? t.theme : "light" }, i = St(t.primary), s = St(t.secondary), c = St(t.background), h = rn(t.thankYou, 140), o = pl(t.font);
  i && (n.primary = i), s && (n.secondary = s), c && (n.background = c), o && (n.font = o), h && (n.thankYou = h), typeof t.launcherMode == "string" && cl.includes(t.launcherMode) && (n.launcherMode = t.launcherMode);
  const p = rn(t.launcherText, 60);
  p && (n.launcherText = p);
  const a = St(t.launcherIconColor);
  return a && (n.launcherIconColor = a), n;
}
function fl(e) {
  const t = Vs(e), r = t.theme === "custom" ? { ...nn.light } : { ...nn[t.theme] };
  if (t.theme === "custom" && (t.primary && (r["--kl-accent"] = t.primary), t.secondary && (r["--kl-accent2"] = t.secondary), t.background)) {
    r["--kl-bg"] = t.background;
    const s = sn(t.background) < 140;
    r["--kl-fg"] = s ? "#f4f4f7" : "#1d1d24", r["--kl-muted"] = s ? "rgba(255,255,255,.6)" : "#706560", r["--kl-border"] = s ? "rgba(255,255,255,.16)" : "#e6e6ec", r["--kl-chip"] = s ? "rgba(255,255,255,.08)" : "#f4f4f7", r["--kl-input-bg"] = s ? "rgba(255,255,255,.05)" : "#fafafb";
  }
  t.font && (r["--kl-font"] = t.font);
  const n = t.theme === "dark" || t.theme === "neon" || t.theme === "glass" || t.theme === "liquid" || t.theme === "custom" && !!t.background && sn(t.background) < 140;
  return r["--kl-img-outline"] = n ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)", r["--kl-glow"] = n ? "radial-gradient(120% 80% at 50% -12%, rgba(139,92,246,.20), transparent 60%), radial-gradient(95% 75% at 108% 112%, rgba(255,170,90,.08), transparent 58%)" : "radial-gradient(120% 80% at 50% -10%, rgba(139,139,245,.10), transparent 60%), radial-gradient(80% 60% at 100% 110%, rgba(232,162,74,.06), transparent 60%)", `:host{${Object.entries(r).map(([s, c]) => `${s}:${c};`).join("")}}`;
}
function ml(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function gl(e, t, r = {}) {
  var Ae;
  const n = Vs(r), i = document.createElement("div");
  i.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const s = i.attachShadow({ mode: "open" });
  document.body.appendChild(i);
  let c = [], h = [];
  const o = 5, p = 10 * 1024 * 1024, a = {};
  let d = e;
  const u = document.createElement("style");
  u.textContent = `
    ${fl(n)}
    @keyframes kl-genie-in{from{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}to{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}}
    @keyframes kl-genie-out{from{opacity:1;transform:translateY(0) scaleX(1) scaleY(1)}to{opacity:0;transform:translateY(180px) scaleX(.04) scaleY(.06)}}
    @keyframes kl-ov{from{opacity:0}to{opacity:1}}
    .klavity-overlay{position:fixed;inset:0;background:var(--kl-overlay);display:flex;align-items:center;justify-content:center;pointer-events:all;animation:kl-ov .3s ease both;}
    .klavity-modal{position:relative;overflow:hidden;isolation:isolate;background:var(--kl-glow,transparent),var(--kl-bg);color:var(--kl-fg);border-radius:var(--kl-radius);padding:24px;width:100%;max-width:480px;box-shadow:0 0 0 1px var(--kl-border),var(--kl-shadow);font-family:var(--kl-font,system-ui,sans-serif);-webkit-font-smoothing:antialiased;-webkit-backdrop-filter:var(--kl-backdrop);backdrop-filter:var(--kl-backdrop);transform-origin:bottom center;animation:kl-genie-in .6s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(to right,color-mix(in srgb,var(--kl-border) 58%,transparent) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(to bottom,color-mix(in srgb,var(--kl-border) 58%,transparent) 1px,transparent 1px) 0 0/44px 44px;opacity:.36;}
    .klavity-modal>*{position:relative;z-index:1;}
    /* Staggered content reveal — the genie scales the panel in while its rows softly rise + fade so it feels
       alive (not a flat box). Subtle; zeroed under prefers-reduced-motion below. */
    @keyframes kl-rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
    .klavity-modal>.klavity-toggle,.klavity-modal>.klavity-page,.klavity-modal>.klavity-strip,.klavity-modal>.klavity-actions,.klavity-modal>textarea.klavity-desc,.klavity-modal>input.klavity-remail,.klavity-modal>.klavity-submit{animation:kl-rise .5s cubic-bezier(.16,1,.3,1) both;}
    .klavity-modal>.klavity-toggle{animation-delay:.05s}.klavity-modal>.klavity-page{animation-delay:.09s}.klavity-modal>.klavity-strip{animation-delay:.12s}.klavity-modal>.klavity-actions{animation-delay:.15s}.klavity-modal>textarea.klavity-desc{animation-delay:.18s}.klavity-modal>input.klavity-remail{animation-delay:.21s}.klavity-modal>.klavity-submit{animation-delay:.23s}
    .klavity-modal.kl-closing{animation:kl-genie-out .5s cubic-bezier(.55,0,.85,.25) both;}
    .klavity-toggle{display:flex;gap:8px;margin-bottom:16px;padding-right:34px;}
    .klavity-toggle button{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:var(--kl-chip);color:var(--kl-fg);}
    .klavity-toggle .bug.active{background:var(--kl-accent);color:var(--kl-on-accent);}
    .klavity-toggle .feat.active{background:var(--kl-accent);color:var(--kl-on-accent);}
    .klavity-page{font-size:12px;color:var(--kl-muted);margin-bottom:12px;}
    /* overflow-x:auto forces overflow-y to auto (not visible) per CSS spec — adding vertical padding gives
       the absolutely-positioned rm/mk badge ::after hit-area extensions room so they're not clipped. */
    .klavity-strip{display:flex;gap:8px;overflow-x:auto;padding:6px 0;margin-bottom:6px;min-height:64px;align-items:flex-start;}
    .klavity-thumb{position:relative;flex-shrink:0;}
    .klavity-thumb img{height:72px;width:104px;object-fit:cover;object-position:top center;background:var(--kl-chip);display:block;border-radius:8px;outline:1px solid var(--kl-img-outline);outline-offset:-1px;cursor:pointer;transition:filter .12s;}
    .klavity-thumb img:hover{filter:brightness(.85);}
    /* Portrait (tall) screenshots: widen the thumbnail vertically so more page content is visible. */
    .klavity-thumb.kl-tall img{width:68px;height:110px;}
    /* Remove badge: dark semi-transparent circle — universally visible on all themes/backgrounds. */
    .klavity-rm{position:absolute;top:4px;right:4px;z-index:2;background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);}
    .klavity-mk{position:absolute;bottom:4px;right:4px;z-index:2;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:50%;width:22px;height:22px;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);}
    /* Extend the 22px badges to a ≥40px hit area without enlarging the visible button. The top (X) and
       bottom (pencil) pseudo-areas don't overlap each other; the pencil shares the image's markup action. */
    .klavity-rm::after,.klavity-mk::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;}
    .klavity-actions{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-actions button{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:var(--kl-chip);color:var(--kl-fg);border:none;border-radius:8px;cursor:pointer;font-size:12px;}
    /* Optical icon alignment + micro-animation for icon+label buttons (capture row + Bug/Feature toggle): a
       fixed-size, block-rendered icon flex-centered with its label (no baseline drift / stray whitespace),
       with a springy scale+tilt on hover — same feel as the right-click menu's icon chips. */
    .klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{display:inline-flex;align-items:center;flex:none;transition:transform .2s cubic-bezier(.34,1.56,.64,1);}
    .klavity-actions .kl-cap-ic svg,.klavity-toggle .kl-cap-ic svg{display:block;width:15px;height:15px;}
    .klavity-actions button:hover .kl-cap-ic,.klavity-toggle button:hover .kl-cap-ic{transform:scale(1.14) rotate(-6deg);}
    .klavity-actions button:active .kl-cap-ic,.klavity-toggle button:active .kl-cap-ic{transform:scale(1.04);}
    /* Re-entrancy state: while a capture/submit is in flight every capture button is disabled (dimmed, no
       hover/press), and the one doing the work pulses to read as "working". */
    .klavity-actions button:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}
    .klavity-actions button:disabled .kl-cap-ic{transform:none;}
    .klavity-actions button.kl-loading{opacity:.9;animation:kl-cap-pulse 1s ease-in-out infinite;}
    @keyframes kl-cap-pulse{0%,100%{opacity:.55}50%{opacity:.95}}
    .klavity-counter{font-size:11px;color:var(--kl-muted);margin-bottom:8px;font-variant-numeric:tabular-nums;}
    textarea.klavity-desc{width:100%;min-height:100px;resize:vertical;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:10px;font-size:14px;margin-bottom:16px;box-sizing:border-box;box-shadow:0 1px 2px rgba(25,20,15,.04);}
    input.klavity-remail{width:100%;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:10px;font-size:14px;margin-bottom:10px;box-sizing:border-box;box-shadow:0 1px 2px rgba(25,20,15,.04);}
    .klavity-submit{width:100%;min-height:40px;padding:12px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;}
    .klavity-submit:disabled{opacity:.5;cursor:not-allowed;}
    /* Upload progress under Submit — collapsed until a submit is in flight; the fill is animated toward 90%
       over ~10s and snapped to 100% when the request resolves (fetch can't report real upload %). */
    .klavity-progress{height:5px;border-radius:999px;background:var(--kl-chip);overflow:hidden;opacity:0;max-height:0;margin-top:0;transition:opacity .2s ease,max-height .2s ease,margin-top .2s ease;}
    .klavity-progress.show{opacity:1;max-height:5px;margin-top:10px;}
    .klavity-progress-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--kl-accent) 65%,#fff),var(--kl-accent));}
    .klavity-error{color:#f38ba8;font-size:13px;margin-bottom:8px;display:none;}
    .klavity-success h2{margin:0 0 8px;font-size:20px;color:var(--kl-fg);display:flex;align-items:center;gap:8px;line-height:1.2;}
    .klavity-success p{margin:0 0 16px;font-size:14px;color:var(--kl-muted);line-height:1.4;}
    .klavity-success>h2{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .05s both;}.klavity-success>p{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .12s both;}.klavity-lead,.klavity-thanks{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .18s both;}.klavity-success>.klavity-cta{animation:kl-rise .45s cubic-bezier(.16,1,.3,1) .24s both;}
    .klavity-lead{display:flex;gap:8px;margin-bottom:12px;}
    .klavity-lead input{flex:1;background:var(--kl-input-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box;}
    .klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
    .klavity-lead button{min-height:40px;padding:9px 14px;background:var(--kl-accent);color:var(--kl-on-accent);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px color-mix(in srgb,var(--kl-accent) 30%,transparent);}
    .klavity-lead button:disabled{opacity:.5;cursor:not-allowed;}
    .klavity-thanks{font-size:13px;color:var(--kl-fg);margin-bottom:12px;}
    .klavity-cta{display:inline-block;padding:10px 16px;background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));color:var(--kl-on-accent);border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 14px color-mix(in srgb,var(--kl-accent) 35%,transparent);}
    .klavity-pb{text-align:center;font-size:10px;color:var(--kl-muted);margin-top:12px;}
    .klavity-pb a{color:var(--kl-muted);text-decoration:none;transition:color .15s ease;}
    .klavity-pb a:hover{color:var(--kl-accent);}
    /* ── Button micro-interactions — subtle hover lift/scale + press, Klavity-accent on hover, focus
       rings. Same feel as the right-click menu + dashboard buttons. Transform amounts are CSS vars so
       prefers-reduced-motion can zero them (below). color-mix degrades gracefully if unsupported. ── */
    .klavity-modal{--kl-lift:translateY(-1px) scale(1.02);--kl-press:scale(.97);--kl-bhover:scale(1.12);--kl-bpress:scale(.97);}
    .klavity-toggle button,.klavity-actions button,.klavity-submit,.klavity-lead button,.klavity-cta,textarea.klavity-desc,input.klavity-remail,.klavity-lead input{transition:transform .15s cubic-bezier(.2,.7,.2,1),background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease,filter .15s ease;will-change:transform;}
    .klavity-rm,.klavity-mk{transition:transform .15s cubic-bezier(.2,.7,.2,1),box-shadow .15s ease;will-change:transform;}
    textarea.klavity-desc:hover,input.klavity-remail:hover,.klavity-lead input:hover{transform:var(--kl-lift);border-color:var(--kl-accent);box-shadow:0 7px 18px color-mix(in srgb,var(--kl-accent) 16%,transparent),0 0 0 1px color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    textarea.klavity-desc:focus,input.klavity-remail:focus,.klavity-lead input:focus{outline:none;border-color:var(--kl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--kl-accent) 20%,transparent),0 8px 20px color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    /* Bug/Feature toggle — lift + soft accent glow (keeps the active chip's highlight intact) */
    .klavity-toggle button:hover{transform:var(--kl-lift);box-shadow:0 4px 12px color-mix(in srgb,var(--kl-accent) 20%,transparent);}
    .klavity-toggle button:active{transform:var(--kl-press);}
    /* Full Page / Upload / Region — lift + accent tint + accent text */
    .klavity-actions button:hover{transform:var(--kl-lift);color:var(--kl-accent);background:color-mix(in srgb,var(--kl-chip) 80%,var(--kl-accent) 20%);box-shadow:0 5px 14px color-mix(in srgb,var(--kl-accent) 22%,transparent);}
    .klavity-actions button:active{transform:var(--kl-press);}
    /* Submit + lead submit + CTA (accent buttons) — lift + brighten + accent-tinted glow */
    .klavity-submit:hover:not(:disabled),.klavity-lead button:hover:not(:disabled),.klavity-cta:hover{transform:var(--kl-lift);filter:brightness(1.05);background:linear-gradient(135deg,var(--kl-accent),color-mix(in srgb,var(--kl-accent) 70%,#8b5cf6));box-shadow:0 8px 22px color-mix(in srgb,var(--kl-accent) 45%,transparent);}
    .klavity-submit:active:not(:disabled),.klavity-lead button:active:not(:disabled),.klavity-cta:active{transform:var(--kl-press);}
    /* Thumbnail action badges (X remove, pencil edit) — pop on hover, press in */
    .klavity-rm:hover,.klavity-mk:hover{transform:var(--kl-bhover);box-shadow:0 3px 9px rgba(0,0,0,.42);}
    .klavity-rm:active,.klavity-mk:active{transform:var(--kl-bpress);}
    /* Close (×) — top-right corner; same lift+accent / press / focus feel as the rest. 30px visible button
       with a ::after pseudo extending the hit area to ≥40×40 (sits in the reserved toggle padding, so it
       never overlaps the Bug/Feature buttons). */
    .klavity-x{position:absolute;top:14px;right:14px;z-index:3;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;background:transparent;color:var(--kl-muted);border:none;border-radius:9px;cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease,color .15s ease;will-change:transform;}
    .klavity-x svg{display:block;}
    .klavity-x::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;}
    .klavity-x:hover{transform:var(--kl-lift);color:var(--kl-accent);background:color-mix(in srgb,var(--kl-accent) 14%,transparent);}
    .klavity-x:active{transform:var(--kl-press);}
    /* Keyboard accessibility — visible focus ring on every control */
    .klavity-toggle button:focus-visible,.klavity-actions button:focus-visible,.klavity-submit:focus-visible,.klavity-lead button:focus-visible,.klavity-cta:focus-visible,.klavity-rm:focus-visible,.klavity-mk:focus-visible,.klavity-x:focus-visible{outline:2px solid var(--kl-accent);outline-offset:2px;}
    /* ── Sharp (i) info: the ⓘ is an INLINE element inside the Screen button, not a separate affordance.
       It sits right after the "Screen" label so Screen+ⓘ read as a single unified control (KLA-15,
       KLA-26). Clicks on ⓘ stopPropagation so they never trigger the one-click capture. The
       floating tooltip (.kl-float-tip) is positioned via JS and lives outside the overflow:hidden
       modal so it is never clipped. ── */
    #klavity-sharp{flex:1.4;}
    .klavity-info-wrap{display:inline-flex;align-items:center;margin-left:4px;flex:none;}
    .klavity-info{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--kl-muted);cursor:help;opacity:.7;transition:color .15s ease,background .15s ease,opacity .15s ease;}
    .klavity-info-wrap:hover .klavity-info{color:var(--kl-accent);background:color-mix(in srgb,var(--kl-accent) 14%,transparent);opacity:1;}
    /* .klavity-info-pop is kept in markup for its text; visibility is JS-driven via .kl-float-tip so
       the tooltip is rendered outside the overflow:hidden modal and is never clipped. */
    .klavity-info-pop{display:none;}
    /* Floating tooltip — appended to the shadow root (sibling of overlay), position:fixed to viewport so
       overflow:hidden on .klavity-modal cannot clip it. JS positions it with edge-detection. */
    .kl-float-tip{position:fixed;width:228px;max-width:calc(100vw - 16px);padding:10px 12px;border-radius:10px;background:var(--kl-bg);color:var(--kl-fg);box-shadow:0 0 0 1px var(--kl-border),0 12px 30px rgba(20,16,40,.22);font-size:12px;line-height:1.45;text-align:left;text-wrap:pretty;z-index:2147483647;pointer-events:none;visibility:hidden;opacity:0;transition:opacity .15s ease;}
    .kl-float-tip.kl-show{visibility:visible;opacity:1;}
    .kl-float-tip b{color:var(--kl-fg);font-weight:600;}
    /* ── Capture-source active/selected indicator (KLA-21) ──────────────────────────────────────
       .kl-active is applied to whichever capture button the user most recently used successfully.
       Uses the same accent palette and transition system as the rest of the modal so it reads as
       "native" — no custom keyframes; the existing press→release spring on transform is enough.
       A small CSS checkmark (rotated L-shape border) appears at the top-right corner as a clear
       "selected" badge without adding any DOM weight. ── */
    .klavity-actions button.kl-active{
      position:relative;
      color:var(--kl-accent);
      background:color-mix(in srgb,var(--kl-accent) 12%,var(--kl-chip));
      box-shadow:0 0 0 1.5px var(--kl-accent),0 4px 14px color-mix(in srgb,var(--kl-accent) 18%,transparent);
    }
    .klavity-actions button.kl-active .kl-cap-ic{color:var(--kl-accent);}
    .klavity-actions button.kl-active::after{
      content:"";position:absolute;top:6px;right:7px;
      width:6px;height:4px;
      border-left:1.5px solid var(--kl-accent);
      border-bottom:1.5px solid var(--kl-accent);
      transform:rotate(-45deg);
    }
    @media (max-width:430px){.klavity-lead{flex-direction:column}.klavity-lead button{width:100%;}}
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing,.klavity-modal>*{animation-duration:.01ms!important;}.klavity-modal{--kl-lift:none;--kl-press:none;--kl-bhover:none;--kl-bpress:none;}.klavity-info{transition:none;}.klavity-actions button.kl-loading{animation:none;}.klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{transition:none;transform:none!important;}}
  `, s.appendChild(u);
  const l = document.createElement("div");
  l.className = "klavity-overlay";
  const m = document.createElement("div");
  m.className = "klavity-modal", m.innerHTML = `
    <button class="klavity-x" id="klavity-x" type="button" aria-label="Close" title="Close (Esc)">${ie("x", { size: 16 })}</button>
    <div class="klavity-toggle">
      <button class="bug ${e === "bug" ? "active" : ""}"><span class="kl-cap-ic">${ie("bug")}</span>Bug</button>
      <button class="feat ${e === "feature" ? "active" : ""}"><span class="kl-cap-ic">${ie("lightbulb")}</span>Feature</button>
    </div>
    <div class="klavity-page">${ie("map-pin")} ${typeof window < "u" ? ml(window.location.pathname) : ""}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      ${t.onCaptureSharp ? `<button id="klavity-sharp" title="Screen — pixel-perfect full page, every image. Shares this tab (asks permission)."><span class="kl-cap-ic">${ie("monitor")}</span><span class="kl-sharp-label">Screen</span><span class="klavity-info-wrap"><span id="klavity-sharp-info" class="klavity-info" role="button" tabindex="0" title="What does Screen do?" aria-label="What does Screen do?"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;pointer-events:none"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span class="klavity-info-pop" role="tooltip">Screen grabs the <b>whole page — every image, pixel-perfect</b> using your browser's screen-share. Your browser will ask you to <b>share this tab</b>.</span></span></button>` : ""}
      <button id="klavity-full" title="Full Page — instant capture; may miss some cross-origin images"><span class="kl-cap-ic">${ie("camera")}</span>Full Page</button>
      <button id="klavity-upload"><span class="kl-cap-ic">${ie("image")}</span>Upload</button>
      ${t.onRegionCapture ? `<button id="klavity-region"><span class="kl-cap-ic">${ie("scissors")}</span>Region</button>` : ""}
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
    ${t.requireEmail ? '<input type="email" class="klavity-remail" id="klavity-remail" placeholder="your@email.com" autocomplete="email">' : ""}
    <button class="klavity-submit" id="klavity-submit" disabled>Submit</button>
    <div class="klavity-progress" id="klavity-progress" role="progressbar" aria-label="Uploading report"><div class="klavity-progress-fill" id="klavity-progress-fill"></div></div>
  `, l.appendChild(m), s.appendChild(l);
  const f = s.querySelector(".klavity-info-wrap"), g = s.querySelector(".klavity-info-pop");
  if (f && g) {
    const P = document.createElement("div");
    P.className = "kl-float-tip", P.setAttribute("role", "tooltip"), P.innerHTML = g.innerHTML, s.appendChild(P);
    const I = () => {
      const $ = f.getBoundingClientRect(), B = Math.min(228, window.innerWidth - 16), T = 8, F = window.innerWidth, le = window.innerHeight, ne = Math.max(T, Math.min($.right - B, F - B - T));
      P.style.left = ne + "px", P.style.top = "-9999px", P.style.visibility = "hidden", P.style.display = "block";
      const $e = P.offsetHeight;
      P.style.display = "", P.style.visibility = "";
      const Se = $.top - T;
      let Ce = $.top - $e - 10;
      (Ce < T || Se < $e) && (Ce = $.bottom + 10), Ce = Math.max(T, Math.min(Ce, le - $e - T)), P.style.top = Ce + "px", P.classList.add("kl-show");
    }, _ = () => P.classList.remove("kl-show");
    f.addEventListener("mouseenter", I), f.addEventListener("mouseleave", _), f.addEventListener("focusin", I), f.addEventListener("focusout", _);
    const A = s.getElementById("klavity-sharp");
    A && (A.addEventListener("focus", I), A.addEventListener("blur", _));
  }
  const x = {
    shadowRoot: s,
    addScreenshot: v,
    close: E
  };
  function y() {
    const P = s.getElementById("klavity-strip"), I = s.getElementById("klavity-counter");
    P.innerHTML = "", c.forEach((_, A) => {
      const $ = document.createElement("div");
      $.className = "klavity-thumb";
      const B = document.createElement("img");
      B.src = _, B.title = "Click to mark up", B.addEventListener("load", () => {
        B.naturalHeight > B.naturalWidth * 1.4 && $.classList.add("kl-tall");
      }, { once: !0 }), B.addEventListener("click", () => ae(A));
      const T = document.createElement("button");
      T.className = "klavity-rm", T.innerHTML = ie("x", { size: 13 }), T.title = "Remove", T.addEventListener("click", (le) => {
        le.stopPropagation(), c.splice(A, 1), h.splice(A, 1), y();
      });
      const F = document.createElement("button");
      F.className = "klavity-mk", F.innerHTML = ie("pencil", { size: 13 }), F.title = "Mark up", F.addEventListener("click", (le) => {
        le.stopPropagation(), ae(A);
      }), $.append(B, T, F), P.appendChild($);
    }), I.textContent = `${c.length}/5 images`;
  }
  function w(P) {
    const I = s.getElementById("klavity-err");
    I && (I.textContent = P, I.style.display = "block");
  }
  function S() {
    const P = s.getElementById("klavity-err");
    P && (P.style.display = "none");
  }
  function v(P) {
    if (c.length >= o) {
      w(`You can attach up to ${o} images.`);
      return;
    }
    S(), c.push(P), h.push(t.compressImage ? t.compressImage(P) : Promise.resolve(P)), y();
  }
  function b(P) {
    return P.type.startsWith("image/") || /\.(heic|heif|png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(P.name);
  }
  async function k(P) {
    S();
    for (const I of P) {
      if (c.length >= o) {
        w(`You can attach up to ${o} images.`);
        break;
      }
      if (!b(I)) {
        w(`"${I.name}" isn't an image — only image files can be attached.`);
        continue;
      }
      if (I.size > p) {
        w(`"${I.name}" is too large — images must be under ${Math.round(p / 1024 / 1024)} MB.`);
        continue;
      }
      try {
        v(await bl(I));
      } catch {
        w(`Couldn't add "${I.name}". Please try a different image.`);
      }
    }
  }
  function E() {
    var _;
    document.removeEventListener("keydown", O, { capture: !0 }), document.removeEventListener("paste", M);
    try {
      (_ = t.onClose) == null || _.call(t);
    } catch {
    }
    const P = s.querySelector(".klavity-modal");
    if (!P) {
      i.remove();
      return;
    }
    P.classList.add("kl-closing");
    const I = () => i.remove();
    P.addEventListener("animationend", I, { once: !0 }), setTimeout(I, 700);
  }
  function O(P) {
    P.key === "Escape" && (P.stopPropagation(), E());
  }
  document.addEventListener("keydown", O, { capture: !0 });
  const M = (P) => {
    if (!P.clipboardData) return;
    const I = Array.from(P.clipboardData.items).filter((_) => _.type.startsWith("image/")).map((_) => _.getAsFile()).filter((_) => !!_);
    I.length && k(I);
  };
  document.addEventListener("paste", M);
  const D = m.querySelector(".bug"), N = m.querySelector(".feat");
  D.addEventListener("click", () => {
    d = "bug", D.classList.add("active"), N.classList.remove("active");
  }), N.addEventListener("click", () => {
    d = "feature", N.classList.add("active"), D.classList.remove("active");
  });
  const C = m.querySelector("#klavity-desc"), oe = m.querySelector("#klavity-submit"), te = m.querySelector("#klavity-remail"), G = () => !t.requireEmail || !!te && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(te.value.trim()), q = () => {
    oe.disabled = C.value.trim() === "" || !G();
  };
  C.addEventListener("input", q), te == null || te.addEventListener("input", q), l.addEventListener("click", (P) => {
    P.target === l && E();
  }), (Ae = m.querySelector("#klavity-x")) == null || Ae.addEventListener("click", () => E());
  const K = () => Array.from(m.querySelectorAll(".klavity-actions button"));
  let ee = !1;
  const Y = (P) => {
    ee = P, K().forEach((I) => {
      I.disabled = P;
    }), P ? oe.disabled = !0 : q();
  }, j = (P) => {
    K().forEach((I) => {
      I.classList.remove("kl-active"), I.removeAttribute("aria-pressed");
    }), P && (P.classList.add("kl-active"), P.setAttribute("aria-pressed", "true"));
  };
  oe.addEventListener("click", async () => {
    if (ee || oe.disabled) return;
    const P = C.value.trim();
    Y(!0), oe.textContent = "Uploading…";
    const I = s.getElementById("klavity-err");
    I.style.display = "none";
    const _ = s.getElementById("klavity-progress"), A = s.getElementById("klavity-progress-fill");
    _ && A && (_.classList.add("show"), A.style.transition = "none", A.style.width = "8%", A.offsetWidth, A.style.transition = "width 10s cubic-bezier(.05,.7,.2,1)", requestAnimationFrame(() => {
      A.style.width = "90%";
    }));
    const $ = () => {
      A && (A.style.transition = "width .25s ease", A.style.width = "100%");
    }, B = () => {
      _ && A && (_.classList.remove("show"), A.style.transition = "none", A.style.width = "0");
    };
    try {
      const T = await Promise.all(h), F = await t.onSubmit({ type: d, description: P, screenshots: T, annotations: a[0] ?? null, reporterEmail: (te == null ? void 0 : te.value.trim()) || void 0 });
      if ($(), t.success)
        ve(F.issueKey, t.success);
      else {
        const le = document.createElement("div");
        le.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;";
        const ne = document.createElement("div");
        ne.style.cssText = "background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);", n.thankYou ? ne.textContent = n.thankYou : (ne.innerHTML = `${ie("check-circle", { label: "Filed", size: 20 })} Filed as `, ne.appendChild(document.createTextNode(F.issueKey))), le.appendChild(ne), l.remove(), s.appendChild(le), setTimeout(E, n.thankYou ? 2600 : 1500);
      }
    } catch (T) {
      B(), I.textContent = T.message, I.style.display = "block", oe.textContent = "Submit", Y(!1);
    }
  });
  const ye = m.querySelector("#klavity-full");
  ye.addEventListener("click", async () => {
    if (!ee) {
      Y(!0), ye.classList.add("kl-loading");
      try {
        v(await t.onCaptureFull()), j(ye);
      } catch {
      } finally {
        ye.classList.remove("kl-loading"), Y(!1);
      }
    }
  });
  const R = m.querySelector("#klavity-sharp");
  if (R && t.onCaptureSharp) {
    const P = R.querySelector(".kl-sharp-label"), I = async () => {
      if (ee) return;
      Y(!0), i.style.display = "none";
      const A = P ?? R, $ = A.textContent;
      A.textContent = "Capturing…";
      try {
        const B = await t.onCaptureSharp();
        B && (v(B), j(R));
      } catch {
      } finally {
        i.style.display = "", A.textContent = $, Y(!1);
      }
    };
    R.addEventListener("click", () => {
      I();
    });
    const _ = R.querySelector("#klavity-sharp-info");
    _ && _.addEventListener("click", (A) => A.stopPropagation());
  }
  const be = m.querySelector("#klavity-file"), de = m.querySelector("#klavity-upload");
  de.addEventListener("click", () => {
    if (ee || c.length >= o) {
      c.length >= o && w(`You can attach up to ${o} images.`);
      return;
    }
    be.click();
  }), be.addEventListener("change", async (P) => {
    const I = P.target, _ = I.files ? Array.from(I.files) : [];
    if (I.value = "", _.length) {
      const A = c.length;
      await k(_), c.length > A && j(de);
    }
  });
  const Le = s.getElementById("klavity-region");
  Le && t.onRegionCapture && (Le.onclick = () => {
    ee || (Y(!0), document.removeEventListener("keydown", O, { capture: !0 }), i.style.display = "none", yl(async (P) => {
      document.addEventListener("keydown", O, { capture: !0 });
      try {
        const I = await t.onRegionCapture(P);
        I && (v(I), j(Le));
      } finally {
        i.style.display = "", Y(!1);
      }
    }, () => {
      document.addEventListener("keydown", O, { capture: !0 }), i.style.display = "", Y(!1);
    }));
  });
  function ae(P) {
    const I = c[P], _ = new Image();
    _.onload = () => {
      const A = document.createElement("canvas");
      A.width = _.naturalWidth, A.height = _.naturalHeight;
      const $ = new Qa(A, I);
      $.redraw();
      const B = document.createElement("div");
      B.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;pointer-events:all;";
      const T = document.createElement("div");
      T.className = "kl-edtb", T.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;background:#1e1e2e;flex-wrap:wrap;", T.innerHTML = `
        <button data-tool="pen" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${ie("pencil", { size: 14 })} Pen</button>
        <button data-tool="rect" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${ie("square", { size: 14 })} Rect</button>
        <button data-tool="arrow" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">↗ Arrow</button>
        <button data-tool="text" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">T Text</button>
        <button data-color="#ef4444" style="background:#ef4444;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#f97316" style="background:#f97316;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#3b82f6" style="background:#3b82f6;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;"></button>
        <button data-color="#111827" style="background:#111827;width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;border:1px solid #555;"></button>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;">
          <button id="klavity-zoom-out" class="kl-zb" title="Zoom out" aria-label="Zoom out">−</button>
          <span id="klavity-zoom-pct" style="min-width:46px;text-align:center;color:#a6adc8;font-size:12px;font-variant-numeric:tabular-nums;">100%</span>
          <button id="klavity-zoom-in" class="kl-zb" title="Zoom in" aria-label="Zoom in">+</button>
          <button id="klavity-fit-width" class="kl-zb" title="Fit to width (best for tall pages)" style="font-size:11.5px;">Fit&nbsp;W</button>
          <button id="klavity-fit-page" class="kl-zb" title="Fit the whole page" style="font-size:11.5px;">Fit&nbsp;page</button>
        </span>
        <button id="klavity-undo" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">↩ Undo</button>
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${ie("trash-2", { size: 14 })} Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">${ie("check", { label: "Save", size: 14 })} Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${ie("x", { size: 14 })}</button>
      `, A.style.cssText = "cursor:crosshair;display:block;margin:12px auto;touch-action:none;background:#fff;border-radius:4px;outline:1px solid rgba(255,255,255,.12);outline-offset:-1px;box-shadow:0 12px 44px rgba(0,0,0,.55);";
      const F = document.createElement("div");
      F.style.cssText = "flex:1;min-height:0;overflow:auto;display:block;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);", F.appendChild(A);
      const le = document.createElement("style");
      le.textContent = ".kl-edtb button{transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease;will-change:transform;}.kl-edtb button:hover{transform:translateY(-1px) scale(1.02);background:#45475a;}.kl-edtb button[data-color]:hover{transform:scale(1.14);background:initial;}.kl-edtb button:active{transform:scale(.96);}.kl-edtb button:focus-visible{outline:2px solid #89b4fa;outline-offset:2px;}.kl-edtb .kl-zb{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 9px;background:#313244;color:#cdd6f4;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;line-height:1;}.kl-edtb .kl-zb:hover{background:#45475a;}@media (prefers-reduced-motion:reduce){.kl-edtb button{transition:none;}.kl-edtb button:hover,.kl-edtb button:active,.kl-edtb button[data-color]:hover{transform:none;}}", B.append(le, T, F), s.appendChild(B);
      let ne = 1;
      const $e = (z) => Math.max(0.05, Math.min(5, z || 1));
      function Se(z) {
        ne = $e(z), A.style.width = Math.round(A.width * ne) + "px", A.style.height = Math.round(A.height * ne) + "px";
        const J = T.querySelector("#klavity-zoom-pct");
        J && (J.textContent = Math.round(ne * 100) + "%");
      }
      const Ce = () => Math.max(1, F.clientWidth - 24) / A.width, Hi = () => Math.min(Math.max(1, F.clientWidth - 24) / A.width, Math.max(1, F.clientHeight - 24) / A.height), ea = A.height / A.width > Math.max(1, F.clientHeight) / Math.max(1, F.clientWidth);
      Se(ea ? Ce() : Hi()), T.querySelector("#klavity-zoom-in").addEventListener("click", () => Se(ne * 1.25)), T.querySelector("#klavity-zoom-out").addEventListener("click", () => Se(ne / 1.25)), T.querySelector("#klavity-fit-width").addEventListener("click", () => Se(Ce())), T.querySelector("#klavity-fit-page").addEventListener("click", () => Se(Hi()));
      let Pe = "rect", De = "#ef4444", ct = !1, wt = [], We = 0, qe = 0;
      function or(z) {
        Pe = z, T.querySelectorAll("[data-tool]").forEach((J) => {
          const ce = J.dataset.tool === z;
          J.style.background = ce ? "#585b70" : "#313244", J.style.outline = ce ? "2px solid #89b4fa" : "none";
        });
      }
      T.querySelectorAll("[data-tool]").forEach((z) => z.addEventListener("click", () => or(z.dataset.tool))), T.querySelectorAll("[data-color]").forEach((z) => z.addEventListener("click", () => {
        De = z.dataset.color;
      })), T.querySelector("#klavity-undo").addEventListener("click", () => $.undo()), T.querySelector("#klavity-clear-ann").addEventListener("click", () => $.clearAll());
      const Vi = { p: "pen", r: "rect", c: "circle", a: "arrow", t: "text" };
      function Gi(z) {
        const J = z.target;
        if (J && (J.tagName === "INPUT" || J.tagName === "TEXTAREA" || J.isContentEditable)) return;
        if (z.key === "Escape") {
          z.stopPropagation(), ar();
          return;
        }
        if ((z.metaKey || z.ctrlKey) && z.key.toLowerCase() === "z") {
          z.preventDefault(), $.undo();
          return;
        }
        if (z.metaKey || z.ctrlKey || z.altKey) return;
        const ce = z.key.toLowerCase();
        Vi[ce] ? (z.preventDefault(), or(Vi[ce])) : ce === "u" && (z.preventDefault(), $.undo());
      }
      function ar() {
        document.removeEventListener("keydown", Gi, { capture: !0 }), B.remove();
      }
      document.addEventListener("keydown", Gi, { capture: !0 }), or(Pe), T.querySelector("#klavity-save-ann").addEventListener("click", async () => {
        $.shapes.length ? (a[P] = { w: A.width, h: A.height, shapes: $.shapes.map((z) => ({ ...z })) }, c[P] = I) : delete a[P], ar(), y();
      }), T.querySelector("#klavity-cancel-ann").addEventListener("click", () => ar());
      function lr(z) {
        const J = A.getBoundingClientRect();
        return { x: (z.clientX - J.left) / J.width * A.width, y: (z.clientY - J.top) / J.height * A.height };
      }
      A.addEventListener("pointerdown", (z) => {
        ct = !0;
        const J = lr(z);
        if ({ x: We, y: qe } = J, Pe === "pen" && (wt = [J]), Pe === "text") {
          ct = !1;
          const ce = document.createElement("input");
          ce.style.cssText = `position:fixed;left:${z.clientX}px;top:${z.clientY}px;background:transparent;border:1px dashed ${De};color:${De};font-size:16px;outline:none;z-index:9999999;min-width:80px;`, document.body.appendChild(ce), ce.focus(), ce.addEventListener("blur", () => {
            ce.value.trim() && $.addShape({ type: "text", color: De, x: We, y: qe, text: ce.value.trim() }), ce.remove();
          }, { once: !0 }), ce.addEventListener("keydown", (ta) => {
            ta.key === "Enter" && ce.blur();
          });
        }
      }), A.addEventListener("pointermove", (z) => {
        ct && Pe === "pen" && wt.push(lr(z));
      }), A.addEventListener("pointerup", (z) => {
        if (!ct) return;
        ct = !1;
        const J = lr(z);
        Pe === "pen" && wt.length > 1 ? $.addShape({ type: "pen", color: De, points: wt }) : Pe === "rect" ? $.addShape({ type: "rect", color: De, x: Math.min(We, J.x), y: Math.min(qe, J.y), w: Math.abs(J.x - We), h: Math.abs(J.y - qe) }) : Pe === "circle" ? $.addShape({ type: "circle", color: De, x: (We + J.x) / 2, y: (qe + J.y) / 2, rx: Math.abs(J.x - We) / 2, ry: Math.abs(J.y - qe) / 2 }) : Pe === "arrow" && $.addShape({ type: "arrow", color: De, x1: We, y1: qe, x2: J.x, y2: J.y });
      });
    }, _.src = I;
  }
  function ve(P, I) {
    const { copy: _, onLead: A } = I;
    m.innerHTML = "";
    const $ = document.createElement("div");
    $.className = "klavity-success";
    const B = document.createElement("h2");
    if (B.innerHTML = _.headline, $.appendChild(B), _.body) {
      const F = document.createElement("p");
      F.textContent = _.body, $.appendChild(F);
    }
    if (_.showEmail) {
      const F = document.createElement("div");
      F.className = "klavity-lead";
      const le = document.createElement("input");
      le.type = "email", le.placeholder = "you@company.com";
      const ne = document.createElement("button");
      ne.textContent = _.emailLabel;
      const $e = async () => {
        const Se = le.value.trim();
        if (!Se) return;
        ne.disabled = !0;
        try {
          A && await A(P, Se);
        } catch {
        }
        const Ce = document.createElement("div");
        Ce.className = "klavity-thanks", Ce.textContent = "Thanks — we'll be in touch.", F.replaceWith(Ce);
      };
      ne.addEventListener("click", $e), le.addEventListener("keydown", (Se) => {
        Se.key === "Enter" && $e();
      }), F.append(le, ne), $.appendChild(F);
    }
    if (_.showCta && _.ctaUrl) {
      const F = document.createElement("a");
      F.className = "klavity-cta", F.href = _.ctaUrl, F.target = "_blank", F.rel = "noopener", F.textContent = _.ctaText, $.appendChild(F);
    }
    m.appendChild($);
    const T = document.createElement("div");
    T.className = "klavity-pb", T.innerHTML = 'Powered by <a href="https://klavity.quantana.top" target="_blank" rel="noopener">Klavity</a>', m.appendChild(T);
  }
  return t.autoCaptureOnOpen && setTimeout(() => {
    t.onCaptureFull().then(v).catch(() => {
    });
  }, 200), x;
}
function yl(e, t) {
  const r = document.createElement("div");
  r.style.cssText = "position:fixed;inset:0;cursor:crosshair;z-index:2147483646;user-select:none;", r.setAttribute("data-klavity-region-overlay", ""), document.body.appendChild(r);
  const n = document.createElement("div");
  n.textContent = "Drag to select an area · Esc to cancel", n.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:system-ui;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:2147483647;", document.body.appendChild(n);
  let i = 0, s = 0, c = !1;
  function h() {
    document.removeEventListener("keydown", o, { capture: !0 }), r.remove(), n.remove();
  }
  function o(p) {
    p.key === "Escape" && (p.stopPropagation(), h(), t());
  }
  document.addEventListener("keydown", o, { capture: !0 }), r.addEventListener("pointerdown", (p) => {
    c = !0, i = p.clientX, s = p.clientY, n.remove();
  }), r.addEventListener("pointermove", (p) => {
    if (!c) return;
    const a = Math.min(p.clientX, i), d = Math.min(p.clientY, s), u = Math.abs(p.clientX - i), l = Math.abs(p.clientY - s);
    r.style.background = `
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) 0 0/${a}px 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a + u}px 0/calc(100% - ${a + u}px) 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px 0/${u}px ${d}px,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px ${d + l}px/${u}px calc(100% - ${d + l}px)
    `, r.style.backgroundRepeat = "no-repeat";
  }), r.addEventListener("pointerup", (p) => {
    if (!c) return;
    c = !1;
    const a = Math.abs(p.clientX - i), d = Math.abs(p.clientY - s);
    if (a < 8 || d < 8) {
      h(), t();
      return;
    }
    const u = { x: Math.min(p.clientX, i), y: Math.min(p.clientY, s), w: a, h: d };
    h(), e(u);
  });
}
async function bl(e) {
  if (e.type === "image/heic" || e.type === "image/heif" || e.name.endsWith(".heic") || e.name.endsWith(".heif"))
    try {
      const t = (await import("./heic2any-D6xzzX7R.js").then((n) => n.h)).default, r = await t({ blob: e, toType: "image/jpeg", quality: 0.85 });
      return on(r);
    } catch {
    }
  return on(e);
}
function on(e) {
  return new Promise((t, r) => {
    const n = new FileReader();
    n.onload = () => t(n.result), n.onerror = r, n.readAsDataURL(e);
  });
}
const vl = {
  frustrated: { accent: "#e8849a", mark: "vein", label: "Frustrated" },
  confused: { accent: "#e8a24a", mark: "q", label: "Confused" },
  satisfied: { accent: "#7fd1c4", mark: "check", label: "Satisfied" },
  delighted: { accent: "#9fd6a0", mark: "spark", label: "Delighted" },
  neutral: { accent: "#8a8276", mark: "dots", label: "Neutral" },
  inspired: { accent: "#8b8bf5", mark: "bulb", label: "Inspired" },
  alarmed: { accent: "#ef6b6b", mark: "bang", label: "Alarmed" }
};
function wl(e) {
  const t = (e || "").trim().split(/\s+/).filter(Boolean);
  return t.length === 0 ? "?" : t.length === 1 ? t[0].slice(0, 2).toUpperCase() : (t[0][0] + t[t.length - 1][0]).toUpperCase();
}
function xl(e) {
  switch (e) {
    case "vein":
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3 L8 6 M11 3 L14 6 M21 11 L18 8 M21 11 L18 14 M13 21 L16 18 M13 21 L10 18 M3 13 L6 16 M3 13 L6 10"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>';
    case "spark":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/><path d="M5.5 13c.3 1.9 1.3 2.9 3.2 3.2-1.9.3-2.9 1.3-3.2 3.2-.3-1.9-1.3-2.9-3.2-3.2 1.9-.3 2.9-1.3 3.2-3.2Z" opacity=".85"/></svg>';
    case "bulb":
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17.5h6M9.5 20.5h5"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/><path d="M10 9.5c.4-1 1-1.5 2-1.5" opacity=".7"/></svg>';
    case "check":
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-11"/></svg>';
    case "dots":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2.3"/><circle cx="12" cy="12" r="2.3"/><circle cx="19" cy="12" r="2.3"/></svg>';
    case "bang":
      return '<span class="ksim-glyph">!</span>';
    case "q":
      return '<span class="ksim-glyph">?</span>';
  }
}
const kl = {
  vein: "ksim-m-vein",
  spark: "ksim-m-spark",
  bulb: "ksim-m-bulb",
  bang: "ksim-m-bang",
  q: "ksim-m-q",
  dots: "ksim-m-dots",
  check: "ksim-m-check"
};
function je(e) {
  return String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function Sl(e) {
  const {
    name: t,
    photoUrl: r,
    color: n = "#6f6cf2",
    emotion: i = "none",
    size: s = 58,
    eyes: c = !0,
    legs: h = !0,
    animate: o = !0,
    className: p = ""
  } = e, a = je(e.initials || wl(t)), d = i !== "none" ? vl[i] : null, u = d ? `<span class="ksim-mark ${o ? kl[d.mark] : ""}" style="color:${je(d.accent)}">${xl(d.mark)}</span>` : "", m = r ? `<span class="ksim-head ksim-photo"><img src="${je(r)}" alt="${je(t)}" loading="lazy" onerror="this.style.display='none';this.parentNode.classList.add('ksim-fallback')"><span class="ksim-ini">${a}</span></span>` : `<span class="ksim-head ksim-mono"><span class="ksim-ini">${a}</span>${c ? '<span class="ksim-eyes"><i></i><i></i></span>' : ""}</span>`, f = h ? '<span class="ksim-legs"><i></i><i></i></span>' : "", g = ["ksim", o ? "is-animated" : "", p].filter(Boolean).join(" "), x = `--ksim-persona:${je(n)};--ksim-size:${s}px;` + (d ? `--ksim-accent:${je(d.accent)};` : "");
  return `<span class="${g}" style="${x}" data-emotion="${i}" title="${je(t)}">${u}${m}${f}</span>`;
}
function Gs(e) {
  const t = document.createElement("template");
  return t.innerHTML = Sl(e).trim(), t.content.firstElementChild;
}
const Cl = `
.ksim{--ksim-size:58px;position:relative;display:inline-flex;flex-direction:column;align-items:center;line-height:1;vertical-align:bottom}
.ksim.is-animated{animation:ksim-bob 3.1s ease-in-out infinite}
@keyframes ksim-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.ksim-head{position:relative;width:var(--ksim-size);height:var(--ksim-size);border-radius:50%;display:grid;place-items:center;
  box-shadow:0 8px 22px -6px rgba(0,0,0,.7);z-index:2}
.ksim-mono{background:radial-gradient(120% 120% at 30% 22%,color-mix(in srgb,var(--ksim-persona) 72%,#fff 14%),var(--ksim-persona) 58%,color-mix(in srgb,var(--ksim-persona) 55%,#000 38%));
  box-shadow:0 8px 22px -6px rgba(0,0,0,.7),inset 0 2px 4px rgba(255,255,255,.25),inset 0 -6px 12px rgba(0,0,0,.28)}
.ksim-ini{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;color:#fff;letter-spacing:.02em;
  font-size:calc(var(--ksim-size)*.31);text-shadow:0 1px 2px rgba(0,0,0,.35)}
/* photo identity — thin persona ring, monogram fallback */
.ksim-photo{background:var(--ksim-persona);box-shadow:0 8px 22px -6px rgba(0,0,0,.7),0 0 0 2px var(--ksim-persona)}
.ksim-photo img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
.ksim-photo .ksim-ini{position:absolute;inset:0;display:none;place-items:center;border-radius:50%;
  background:radial-gradient(120% 120% at 30% 22%,color-mix(in srgb,var(--ksim-persona) 72%,#fff 12%),var(--ksim-persona) 60%)}
.ksim-photo.ksim-fallback .ksim-ini{display:grid}
/* character eyes (monogram) */
.ksim-eyes{position:absolute;bottom:calc(var(--ksim-size)*.16);left:50%;transform:translateX(-50%);display:flex;gap:calc(var(--ksim-size)*.1);z-index:3}
.ksim-eyes i{width:calc(var(--ksim-size)*.086);height:calc(var(--ksim-size)*.086);border-radius:50%;background:rgba(12,10,8,.8)}
.ksim-mono:has(.ksim-eyes) .ksim-ini{transform:translateY(calc(var(--ksim-size)*-.1));font-size:calc(var(--ksim-size)*.26)}
/* legs */
.ksim-legs{display:flex;gap:calc(var(--ksim-size)*.12);margin-top:calc(var(--ksim-size)*.07)}
.ksim-legs i{width:calc(var(--ksim-size)*.12);height:calc(var(--ksim-size)*.29);border-radius:calc(var(--ksim-size)*.07);
  background:color-mix(in srgb,var(--ksim-persona) 60%,#000 30%);transform-origin:top center}
.ksim.is-animated .ksim-legs i:nth-child(1){animation:ksim-la 1.6s ease-in-out infinite}
.ksim.is-animated .ksim-legs i:nth-child(2){animation:ksim-lb 1.6s ease-in-out infinite}
@keyframes ksim-la{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(7deg)}}
@keyframes ksim-lb{0%,100%{transform:rotate(6deg)}50%{transform:rotate(-7deg)}}
/* floating emotion mark */
.ksim-mark{position:absolute;top:calc(var(--ksim-size)*-.2);right:calc(var(--ksim-size)*-.2);
  width:calc(var(--ksim-size)*.45);height:calc(var(--ksim-size)*.45);color:var(--ksim-accent);z-index:5;
  display:grid;place-items:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.55));transform-origin:center}
.ksim-mark svg{width:100%;height:100%;display:block}
.ksim-glyph{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;font-size:calc(var(--ksim-size)*.36);color:var(--ksim-accent)}
.ksim-m-vein{animation:ksim-vein 1.1s ease-in-out infinite}@keyframes ksim-vein{0%,100%{transform:scale(1) rotate(0)}45%{transform:scale(1.22) rotate(-6deg)}}
.ksim-m-spark{animation:ksim-tw 1.5s ease-in-out infinite}@keyframes ksim-tw{0%,100%{transform:scale(1) rotate(0);opacity:1}50%{transform:scale(1.18) rotate(18deg);opacity:.7}}
.ksim-m-bulb{animation:ksim-bulb 1.7s ease-in-out infinite}@keyframes ksim-bulb{0%,100%{filter:drop-shadow(0 0 0 transparent) drop-shadow(0 2px 5px rgba(0,0,0,.55))}50%{filter:drop-shadow(0 0 9px var(--ksim-accent)) drop-shadow(0 2px 5px rgba(0,0,0,.55))}}
.ksim-m-bang{animation:ksim-bang 1.2s ease-in-out infinite}@keyframes ksim-bang{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-2px) rotate(-7deg)}75%{transform:translateX(2px) rotate(7deg)}}
.ksim-m-q{animation:ksim-q 2.2s ease-in-out infinite}@keyframes ksim-q{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}
.ksim-m-dots{animation:ksim-dots 2s linear infinite}@keyframes ksim-dots{0%,100%{opacity:.45}50%{opacity:1}}
.ksim-m-check{animation:ksim-check 2.4s ease-in-out infinite}@keyframes ksim-check{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@media (prefers-reduced-motion: reduce){.ksim,.ksim *{animation:none !important}}
`;
function El(e = document) {
  var n;
  const t = e.head ?? e ?? null;
  if (!t || (n = t.querySelector) != null && n.call(t, "style[data-ksim]")) return;
  const r = document.createElement("style");
  r.setAttribute("data-ksim", ""), r.textContent = Cl, t.appendChild(r);
}
function Ml(e) {
  const { context: t, description: r } = e, n = t.consoleErrors.map((o) => `- [${o.level ?? "error"}] \`${o.message}\``).join(`
`) || "_none_", i = t.networkFailures.map((o) => `- ${o.method} ${o.url} → ${o.status}${o.durationMs != null ? ` (${o.durationMs}ms)` : ""}`).join(`
`) || "_none_", s = [
    `*Page:* ${t.pageUrl}`,
    `*Browser:* ${t.userAgent}`,
    `*Screen:* ${t.screenSize}  |  *Viewport:* ${t.viewportSize}`
  ], c = t.identity ? Object.entries(t.identity).filter(([, o]) => o != null) : [], h = t.metadata ? Object.entries(t.metadata) : [];
  return (c.length || h.length) && s.push(`*User / metadata:* ${[...c, ...h].map(([o, p]) => `${o}=${p}`).join(", ")}`), [
    ...s,
    "",
    "----",
    r,
    "",
    "*Console:*",
    n,
    "",
    "*Network:*",
    i
  ].join(`
`);
}
async function Rl(e) {
  const { settings: t, type: r, description: n } = e, { baseUrl: i, email: s, token: c, projectKey: h } = t.jira, o = btoa(`${s}:${c}`), p = r === "bug" ? "Bug" : "Story", a = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], d = `[Klavity] ${n.slice(0, 180)}`, u = await fetch(`${i}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${o}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      fields: {
        project: { key: h },
        summary: d,
        description: { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: Ml(e) }] }] },
        issuetype: { name: p },
        labels: a
      }
    })
  });
  if (!u.ok) {
    const g = await u.text();
    throw new Error(`Jira API error ${u.status}: ${g}`);
  }
  const m = (await u.json()).key, f = `${i}/browse/${m}`;
  for (const g of e.screenshots) {
    const x = await (await fetch(g)).blob(), y = new FormData();
    y.append("file", x, `klavity-screenshot-${Date.now()}.png`), await fetch(`${i}/rest/api/3/issue/${m}/attachments`, {
      method: "POST",
      headers: { Authorization: `Basic ${o}`, "X-Atlassian-Token": "no-check" },
      body: y
    });
  }
  return { issueKey: m, issueUrl: f };
}
async function Ol(e) {
  var d, u, l;
  const { settings: t, type: r, description: n, context: i } = e, { apiKey: s, teamId: c } = t.linear, h = [
    n,
    "",
    `**Page:** ${i.pageUrl}`,
    `**Browser:** ${i.userAgent}`
  ].join(`
`), p = await (await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: s,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier url }
          }
        }
      `,
      variables: {
        input: {
          teamId: c,
          title: `[Klavity] ${n.slice(0, 180)}`,
          description: h,
          labelNames: r === "bug" ? ["Bug"] : []
        }
      }
    })
  })).json();
  if ((d = p.errors) != null && d.length)
    throw new Error(`Linear API error: ${p.errors[0].message}`);
  const a = (l = (u = p.data) == null ? void 0 : u.issueCreate) == null ? void 0 : l.issue;
  if (!a) throw new Error("Linear: no issue returned");
  return { issueKey: a.identifier, issueUrl: a.url };
}
async function Il(e) {
  const { settings: t, type: r, description: n, context: i, screenshots: s } = e, { token: c, repo: h } = t.github, o = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], p = s.length ? `

<details><summary>Screenshots (${s.length})</summary>

${s.map((l, m) => `![screenshot-${m + 1}](${l})`).join(`
`)}

</details>` : "", a = [
    n,
    "",
    `**Page:** ${i.pageUrl}`,
    `**Browser:** ${i.userAgent}`,
    `**Screen:** ${i.screenSize} | **Viewport:** ${i.viewportSize}`,
    p
  ].join(`
`), d = await fetch(`https://api.github.com/repos/${h}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: `[Klavity] ${n.slice(0, 180)}`,
      body: a,
      labels: o
    })
  });
  if (!d.ok)
    throw new Error(`GitHub API error ${d.status}: ${await d.text()}`);
  const u = await d.json();
  return { issueKey: `#${u.number}`, issueUrl: u.html_url };
}
async function Al(e) {
  const { settings: t, description: r, context: n } = e, { token: i, workspace: s, projectId: c } = t.plane, h = (t.plane.host || "https://api.plane.so").replace(/\/+$/, ""), o = h === "https://api.plane.so" ? "https://app.plane.so" : h, p = await fetch(
    `${h}/api/v1/workspaces/${s}/projects/${c}/issues/`,
    {
      method: "POST",
      headers: { "X-API-Key": i, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `[Klavity] ${r.slice(0, 180)}`,
        description_html: `<p>${r}</p><p><strong>Page:</strong> ${n.pageUrl}</p>`
      })
    }
  );
  if (!p.ok) throw new Error(`Plane API error ${p.status}: ${await p.text()}`);
  const a = await p.json();
  return {
    issueKey: String(a.sequence_id),
    issueUrl: `${o}/${s}/projects/${c}/issues/`
  };
}
async function Ll(e) {
  const { settings: t, type: r, description: n, context: i, screenshots: s, projectId: c, replayEvents: h } = e, o = new FormData();
  o.append("type", r), o.append("description", n), o.append("page_url", i.pageUrl), o.append("context", JSON.stringify(i)), c && o.append("project_id", c), h && h.length && o.append("replay_events", JSON.stringify(h));
  const p = t.connectionMode === "klavity" && !!t.klavToken;
  if (!p) {
    const { plane: l } = t;
    o.append("plane_token", l.token), o.append("plane_workspace", l.workspace), o.append("plane_project_id", l.projectId), o.append("plane_host", l.host);
  }
  for (let l = 0; l < s.length; l++) {
    const m = await (await fetch(s[l])).blob();
    o.append("screenshots", m, `screenshot-${l}.png`);
  }
  const a = p ? { Authorization: `Bearer ${t.klavToken}` } : {}, d = await fetch(`${t.backendUrl}/api/feedback`, { method: "POST", headers: a, body: o });
  if (!d.ok) throw new Error(`Klavity backend error ${d.status}: ${await d.text()}`);
  const u = await d.json();
  return {
    issueKey: u.jira_key ?? u.id,
    issueUrl: u.issue_url ?? t.backendUrl
  };
}
var Pl = Object.defineProperty, Tl = (e, t, r) => t in e ? Pl(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, L = (e, t, r) => Tl(e, typeof t != "symbol" ? t + "" : t, r), an, Nl = Object.defineProperty, _l = (e, t, r) => t in e ? Nl(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, ln = (e, t, r) => _l(e, typeof t != "symbol" ? t + "" : t, r), se = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(se || {});
const cn = {
  Node: [
    "childNodes",
    "parentNode",
    "parentElement",
    "textContent",
    "ownerDocument"
  ],
  ShadowRoot: ["host", "styleSheets"],
  Element: ["shadowRoot", "querySelector", "querySelectorAll"],
  MutationObserver: []
}, un = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, Ct = {}, Ys = {}, $l = () => !!globalThis.Zone;
function Mi(e) {
  if (Ct[e])
    return Ct[e];
  const t = globalThis[e], r = t.prototype, n = e in cn ? cn[e] : void 0, i = !!(n && // @ts-expect-error 2345
  n.every(
    (h) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, h)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in un ? un[e] : void 0, c = !!(s && s.every(
    // @ts-expect-error 2345
    (h) => {
      var o;
      return typeof r[h] == "function" && ((o = r[h]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (i && c && !$l())
    return Ct[e] = t.prototype, t.prototype;
  try {
    const h = document.createElement("iframe");
    h.style.display = "none", document.body.appendChild(h);
    const o = h.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return h.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (h.classList.add("rr-block"), h.setAttribute("__rrwebUntaintedMutationObserver", ""), Ys[e] = () => h.remove()) : h.remove(), Ct[e] = p;
  } catch {
    return r;
  }
}
const dr = {};
function Ne(e, t, r) {
  var n;
  const i = `${e}.${String(r)}`;
  if (dr[i])
    return dr[i].call(
      t
    );
  const s = Mi(e), c = (n = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : n.get;
  return c ? (dr[i] = c, c.call(t)) : t[r];
}
const hr = {};
function Js(e, t, r) {
  const n = `${e}.${String(r)}`;
  if (hr[n])
    return hr[n].bind(
      t
    );
  const s = Mi(e)[r];
  return typeof s != "function" ? t[r] : (hr[n] = s, s.bind(t));
}
function Dl(e) {
  return Ne("Node", e, "ownerDocument");
}
function zl(e) {
  return Ne("Node", e, "childNodes");
}
function Fl(e) {
  return Ne("Node", e, "parentNode");
}
function Ul(e) {
  return Ne("Node", e, "parentElement");
}
function Bl(e) {
  return Ne("Node", e, "textContent");
}
function Wl(e, t) {
  return Js("Node", e, "contains")(t);
}
function ql(e) {
  return Js("Node", e, "getRootNode")();
}
function jl(e) {
  return !e || !("host" in e) ? null : Ne("ShadowRoot", e, "host");
}
function Hl(e) {
  return e.styleSheets;
}
function Vl(e) {
  return !e || !("shadowRoot" in e) ? null : Ne("Element", e, "shadowRoot");
}
function Gl(e, t) {
  return Ne("Element", e, "querySelector")(t);
}
function Yl(e, t) {
  return Ne("Element", e, "querySelectorAll")(t);
}
function Jl() {
  return [
    Mi("MutationObserver").constructor,
    Ys.MutationObserver ?? (() => {
    })
  ];
}
let Xs = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (Xs = () => (/* @__PURE__ */ new Date()).getTime());
function Xl(e, t, r) {
  try {
    if (!(t in e))
      return () => {
      };
    const n = e[t], i = r(n);
    return typeof i == "function" && (i.prototype = i.prototype || {}, Object.defineProperties(i, {
      __rrweb_original__: {
        enumerable: !1,
        value: n
      }
    })), e[t] = i, () => {
      e[t] = n;
    };
  } catch {
    return () => {
    };
  }
}
const ue = {
  ownerDocument: Dl,
  childNodes: zl,
  parentNode: Fl,
  parentElement: Ul,
  textContent: Bl,
  contains: Wl,
  getRootNode: ql,
  host: jl,
  styleSheets: Hl,
  shadowRoot: Vl,
  querySelector: Gl,
  querySelectorAll: Yl,
  nowTimestamp: Xs,
  mutationObserverCtor: Jl,
  patch: Xl
};
function Ks(e) {
  return e.nodeType === e.ELEMENT_NODE;
}
function dt(e) {
  const t = (
    // anchor and textarea elements also have a `host` property
    // but only shadow roots have a `mode` property
    e && "host" in e && "mode" in e && ue.host(e) || null
  );
  return !!(t && "shadowRoot" in t && ue.shadowRoot(t) === e);
}
function ht(e) {
  return Object.prototype.toString.call(e) === "[object ShadowRoot]";
}
function Kl(e) {
  return e.includes(" background-clip: text;") && !e.includes(" -webkit-background-clip: text;") && (e = e.replace(
    /\sbackground-clip:\s*text;/g,
    " -webkit-background-clip: text; background-clip: text;"
  )), e;
}
function Zl(e) {
  const { cssText: t } = e;
  if (t.split('"').length < 3) return t;
  const r = ["@import", `url(${JSON.stringify(e.href)})`];
  return e.layerName === "" ? r.push("layer") : e.layerName && r.push(`layer(${e.layerName})`), e.supportsText && r.push(`supports(${e.supportsText})`), e.media.length && r.push(e.media.mediaText), r.join(" ") + ";";
}
function vi(e) {
  try {
    const t = e.rules || e.cssRules;
    if (!t)
      return null;
    let r = e.href;
    !r && e.ownerNode && (r = e.ownerNode.baseURI);
    const n = Array.from(
      t,
      (i) => Zs(i, r)
    ).join("");
    return Kl(n);
  } catch {
    return null;
  }
}
function Zs(e, t) {
  if (ec(e)) {
    let r;
    try {
      r = // for same-origin stylesheets,
      // we can access the imported stylesheet rules directly
      vi(e.styleSheet) || // work around browser issues with the raw string `@import url(...)` statement
      Zl(e);
    } catch {
      r = e.cssText;
    }
    return e.styleSheet.href ? Bt(r, e.styleSheet.href) : r;
  } else {
    let r = e.cssText;
    return tc(e) && e.selectorText.includes(":") && (r = Ql(r)), t ? Bt(r, t) : r;
  }
}
function Ql(e) {
  const t = /(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm;
  return e.replace(t, "$1\\$2");
}
function ec(e) {
  return "styleSheet" in e;
}
function tc(e) {
  return "selectorText" in e;
}
class Qs {
  constructor() {
    ln(this, "idNodeMap", /* @__PURE__ */ new Map()), ln(this, "nodeMetaMap", /* @__PURE__ */ new WeakMap());
  }
  getId(t) {
    var r;
    return t ? ((r = this.getMeta(t)) == null ? void 0 : r.id) ?? -1 : -1;
  }
  getNode(t) {
    return this.idNodeMap.get(t) || null;
  }
  getIds() {
    return Array.from(this.idNodeMap.keys());
  }
  getMeta(t) {
    return this.nodeMetaMap.get(t) || null;
  }
  // removes the node from idNodeMap
  // doesn't remove the node from nodeMetaMap
  removeNodeFromMap(t) {
    const r = this.getId(t);
    this.idNodeMap.delete(r), t.childNodes && t.childNodes.forEach(
      (n) => this.removeNodeFromMap(n)
    );
  }
  has(t) {
    return this.idNodeMap.has(t);
  }
  hasNode(t) {
    return this.nodeMetaMap.has(t);
  }
  add(t, r) {
    const n = r.id;
    this.idNodeMap.set(n, t), this.nodeMetaMap.set(t, r);
  }
  replace(t, r) {
    const n = this.getNode(t);
    if (n) {
      const i = this.nodeMetaMap.get(n);
      i && this.nodeMetaMap.set(r, i);
    }
    this.idNodeMap.set(t, r);
  }
  reset() {
    this.idNodeMap = /* @__PURE__ */ new Map(), this.nodeMetaMap = /* @__PURE__ */ new WeakMap();
  }
}
function rc() {
  return new Qs();
}
function Ft({
  element: e,
  maskInputOptions: t,
  tagName: r,
  type: n,
  value: i,
  maskInputFn: s
}) {
  let c = i || "";
  const h = n && Ge(n);
  return (t[r.toLowerCase()] || h && t[h]) && (s ? c = s(c, e) : c = "*".repeat(c.length)), c;
}
function Ge(e) {
  return e.toLowerCase();
}
const dn = "__rrweb_original__";
function ic(e) {
  const t = e.getContext("2d");
  if (!t) return !0;
  const r = 50;
  for (let n = 0; n < e.width; n += r)
    for (let i = 0; i < e.height; i += r) {
      const s = t.getImageData, c = dn in s ? s[dn] : s;
      if (new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        c.call(
          t,
          n,
          i,
          Math.min(r, e.width - n),
          Math.min(r, e.height - i)
        ).data.buffer
      ).some((o) => o !== 0)) return !1;
    }
  return !0;
}
function Ut(e) {
  const t = e.type;
  return e.hasAttribute("data-rr-is-password") ? "password" : t ? (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    Ge(t)
  ) : null;
}
function eo(e, t) {
  let r;
  try {
    r = new URL(e, t ?? window.location.href);
  } catch {
    return null;
  }
  const n = /\.([0-9a-z]+)(?:$)/i, i = r.pathname.match(n);
  return (i == null ? void 0 : i[1]) ?? null;
}
function nc(e) {
  let t = "";
  return e.indexOf("//") > -1 ? t = e.split("/").slice(0, 3).join("/") : t = e.split("/")[0], t = t.split("?")[0], t;
}
const sc = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm, oc = /^(?:[a-z+]+:)?\/\//i, ac = /^www\..*/i, lc = /^(data:)([^,]*),(.*)/i;
function Bt(e, t) {
  return (e || "").replace(
    sc,
    (r, n, i, s, c, h) => {
      const o = i || c || h, p = n || s || "";
      if (!o)
        return r;
      if (oc.test(o) || ac.test(o))
        return `url(${p}${o}${p})`;
      if (lc.test(o))
        return `url(${p}${o}${p})`;
      if (o[0] === "/")
        return `url(${p}${nc(t) + o}${p})`;
      const a = t.split("/"), d = o.split("/");
      a.pop();
      for (const u of d)
        u !== "." && (u === ".." ? a.pop() : a.push(u));
      return `url(${p}${a.join("/")}${p})`;
    }
  );
}
function Et(e, t = !1) {
  return t ? e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "") : e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "").replace(/0px/g, "0");
}
function cc(e, t, r = !1) {
  const n = Array.from(t.childNodes), i = [];
  let s = 0;
  if (n.length > 1 && e && typeof e == "string") {
    let c = Et(e, r);
    const h = c.length / e.length;
    for (let o = 1; o < n.length; o++)
      if (n[o].textContent && typeof n[o].textContent == "string") {
        const p = Et(
          n[o].textContent,
          r
        ), a = 100;
        let d = 3;
        for (; d < p.length && // keep consuming css identifiers (to get a decent chunk more quickly)
        (p[d].match(/[a-zA-Z0-9]/) || // substring needs to be unique to this section
        p.indexOf(p.substring(0, d), 1) !== -1); d++)
          ;
        for (; d < p.length; d++) {
          let u = p.substring(0, d), l = c.split(u), m = -1;
          if (l.length === 2)
            m = l[0].length;
          else if (l.length > 2 && l[0] === "" && n[o - 1].textContent !== "")
            m = c.indexOf(u, 1);
          else if (l.length === 1) {
            if (u = u.substring(
              0,
              u.length - 1
            ), l = c.split(u), l.length <= 1)
              return i.push(e), i;
            d = a + 1;
          } else d === p.length - 1 && (m = c.indexOf(u));
          if (l.length >= 2 && d > a) {
            const f = n[o - 1].textContent;
            if (f && typeof f == "string") {
              const g = Et(f).length;
              m = c.indexOf(u, g);
            }
            m === -1 && (m = l[0].length);
          }
          if (m !== -1) {
            let f = Math.floor(m / h);
            for (; f > 0 && f < e.length; ) {
              if (s += 1, s > 50 * n.length)
                return i.push(e), i;
              const g = Et(
                e.substring(0, f),
                r
              );
              if (g.length === m) {
                i.push(e.substring(0, f)), e = e.substring(f), c = c.substring(m);
                break;
              } else g.length < m ? f += Math.max(
                1,
                Math.floor((m - g.length) / h)
              ) : f -= Math.max(
                1,
                Math.floor((g.length - m) * h)
              );
            }
            break;
          }
        }
      }
  }
  return i.push(e), i;
}
function uc(e, t) {
  return cc(e, t).join("/* rr_split */");
}
let dc = 1;
const hc = new RegExp("[^a-z0-9-_:]"), ft = -2;
function to() {
  return dc++;
}
function pc(e) {
  if (e instanceof HTMLFormElement)
    return "form";
  const t = Ge(e.tagName);
  return hc.test(t) ? "div" : t;
}
let Qe, hn;
const fc = /^[^ \t\n\r\u000c]+/, mc = /^[, \t\n\r\u000c]+/;
function gc(e, t) {
  if (t.trim() === "")
    return t;
  let r = 0;
  function n(s) {
    let c;
    const h = s.exec(t.substring(r));
    return h ? (c = h[0], r += c.length, c) : "";
  }
  const i = [];
  for (; n(mc), !(r >= t.length); ) {
    let s = n(fc);
    if (s.slice(-1) === ",")
      s = it(e, s.substring(0, s.length - 1)), i.push(s);
    else {
      let c = "";
      s = it(e, s);
      let h = !1;
      for (; ; ) {
        const o = t.charAt(r);
        if (o === "") {
          i.push((s + c).trim());
          break;
        } else if (h)
          o === ")" && (h = !1);
        else if (o === ",") {
          r += 1, i.push((s + c).trim());
          break;
        } else o === "(" && (h = !0);
        c += o, r += 1;
      }
    }
  }
  return i.join(", ");
}
const pn = /* @__PURE__ */ new WeakMap();
function it(e, t) {
  return !t || t.trim() === "" ? t : Ri(e, t);
}
function yc(e) {
  return !!(e.tagName === "svg" || e.ownerSVGElement);
}
function Ri(e, t) {
  let r = pn.get(e);
  if (r || (r = e.createElement("a"), pn.set(e, r)), !t)
    t = "";
  else if (t.startsWith("blob:") || t.startsWith("data:"))
    return t;
  return r.setAttribute("href", t), r.href;
}
function ro(e, t, r, n) {
  return n && (r === "src" || r === "href" && !(t === "use" && n[0] === "#") || r === "xlink:href" && n[0] !== "#" || r === "background" && ["table", "td", "th"].includes(t) ? it(e, n) : r === "srcset" ? gc(e, n) : r === "style" ? Bt(n, Ri(e)) : t === "object" && r === "data" ? it(e, n) : n);
}
function io(e, t, r) {
  return ["video", "audio"].includes(e) && t === "autoplay";
}
function bc(e, t, r) {
  try {
    if (typeof t == "string") {
      if (e.classList.contains(t))
        return !0;
    } else
      for (let n = e.classList.length; n--; ) {
        const i = e.classList[n];
        if (t.test(i))
          return !0;
      }
    if (r)
      return e.matches(r);
  } catch {
  }
  return !1;
}
function Wt(e, t, r) {
  if (!e) return !1;
  if (e.nodeType !== e.ELEMENT_NODE)
    return r ? Wt(ue.parentNode(e), t, r) : !1;
  for (let n = e.classList.length; n--; ) {
    const i = e.classList[n];
    if (t.test(i))
      return !0;
  }
  return r ? Wt(ue.parentNode(e), t, r) : !1;
}
function no(e, t, r, n) {
  let i;
  if (Ks(e)) {
    if (i = e, !ue.childNodes(i).length)
      return !1;
  } else {
    if (ue.parentElement(e) === null)
      return !1;
    i = ue.parentElement(e);
  }
  try {
    if (typeof t == "string") {
      if (n) {
        if (i.closest(`.${t}`)) return !0;
      } else if (i.classList.contains(t)) return !0;
    } else if (Wt(i, t, n)) return !0;
    if (r) {
      if (n) {
        if (i.closest(r)) return !0;
      } else if (i.matches(r)) return !0;
    }
  } catch {
  }
  return !1;
}
function vc(e, t, r) {
  const n = e.contentWindow;
  if (!n)
    return;
  let i = !1, s;
  try {
    s = n.document.readyState;
  } catch {
    return;
  }
  if (s !== "complete") {
    const h = setTimeout(() => {
      i || (t(), i = !0);
    }, r);
    e.addEventListener("load", () => {
      clearTimeout(h), i = !0, t();
    });
    return;
  }
  const c = "about:blank";
  if (n.location.href !== c || e.src === c || e.src === "")
    return setTimeout(t, 0), e.addEventListener("load", t);
  e.addEventListener("load", t);
}
function wc(e, t, r) {
  let n = !1, i;
  try {
    i = e.sheet;
  } catch {
    return;
  }
  if (i) return;
  const s = setTimeout(() => {
    n || (t(), n = !0);
  }, r);
  e.addEventListener("load", () => {
    clearTimeout(s), n = !0, t();
  });
}
function xc(e, t) {
  const {
    doc: r,
    mirror: n,
    blockClass: i,
    blockSelector: s,
    needsMask: c,
    inlineStylesheet: h,
    maskInputOptions: o = {},
    maskTextFn: p,
    maskInputFn: a,
    dataURLOptions: d = {},
    inlineImages: u,
    recordCanvas: l,
    keepIframeSrcFn: m,
    newlyAddedElement: f = !1,
    cssCaptured: g = !1
  } = t, x = kc(r, n);
  switch (e.nodeType) {
    case e.DOCUMENT_NODE:
      return e.compatMode !== "CSS1Compat" ? {
        type: se.Document,
        childNodes: [],
        compatMode: e.compatMode
        // probably "BackCompat"
      } : {
        type: se.Document,
        childNodes: []
      };
    case e.DOCUMENT_TYPE_NODE:
      return {
        type: se.DocumentType,
        name: e.name,
        publicId: e.publicId,
        systemId: e.systemId,
        rootId: x
      };
    case e.ELEMENT_NODE:
      return Cc(e, {
        doc: r,
        blockClass: i,
        blockSelector: s,
        inlineStylesheet: h,
        maskInputOptions: o,
        maskInputFn: a,
        dataURLOptions: d,
        inlineImages: u,
        recordCanvas: l,
        keepIframeSrcFn: m,
        newlyAddedElement: f,
        rootId: x
      });
    case e.TEXT_NODE:
      return Sc(e, {
        doc: r,
        needsMask: c,
        maskTextFn: p,
        rootId: x,
        cssCaptured: g
      });
    case e.CDATA_SECTION_NODE:
      return {
        type: se.CDATA,
        textContent: "",
        rootId: x
      };
    case e.COMMENT_NODE:
      return {
        type: se.Comment,
        textContent: ue.textContent(e) || "",
        rootId: x
      };
    default:
      return !1;
  }
}
function kc(e, t) {
  if (!t.hasNode(e)) return;
  const r = t.getId(e);
  return r === 1 ? void 0 : r;
}
function Sc(e, t) {
  const { needsMask: r, maskTextFn: n, rootId: i, cssCaptured: s } = t, c = ue.parentNode(e), h = c && c.tagName;
  let o = "";
  const p = h === "STYLE" ? !0 : void 0, a = h === "SCRIPT" ? !0 : void 0;
  return a ? o = "SCRIPT_PLACEHOLDER" : s || (o = ue.textContent(e), p && o && (o = Bt(o, Ri(t.doc)))), !p && !a && o && r && (o = n ? n(o, ue.parentElement(e)) : o.replace(/[\S]/g, "*")), {
    type: se.Text,
    textContent: o || "",
    rootId: i
  };
}
function Cc(e, t) {
  const {
    doc: r,
    blockClass: n,
    blockSelector: i,
    inlineStylesheet: s,
    maskInputOptions: c = {},
    maskInputFn: h,
    dataURLOptions: o = {},
    inlineImages: p,
    recordCanvas: a,
    keepIframeSrcFn: d,
    newlyAddedElement: u = !1,
    rootId: l
  } = t, m = bc(e, n, i), f = pc(e);
  let g = {};
  const x = e.attributes.length;
  for (let w = 0; w < x; w++) {
    const S = e.attributes[w];
    io(f, S.name, S.value) || (g[S.name] = ro(
      r,
      f,
      Ge(S.name),
      S.value
    ));
  }
  if (f === "link" && s) {
    const w = Array.from(r.styleSheets).find((v) => v.href === e.href);
    let S = null;
    w && (S = vi(w)), S && (delete g.rel, delete g.href, g._cssText = S);
  }
  if (f === "style" && e.sheet) {
    let w = vi(
      e.sheet
    );
    w && (e.childNodes.length > 1 && (w = uc(w, e)), g._cssText = w);
  }
  if (["input", "textarea", "select"].includes(f)) {
    const w = e.value, S = e.checked;
    g.type !== "radio" && g.type !== "checkbox" && g.type !== "submit" && g.type !== "button" && w ? g.value = Ft({
      element: e,
      type: Ut(e),
      tagName: f,
      value: w,
      maskInputOptions: c,
      maskInputFn: h
    }) : S && (g.checked = S);
  }
  if (f === "option" && (e.selected && !c.select ? g.selected = !0 : delete g.selected), f === "dialog" && e.open && (g.rr_open_mode = e.matches("dialog:modal") ? "modal" : "non-modal"), f === "canvas" && a) {
    if (e.__context === "2d")
      ic(e) || (g.rr_dataURL = e.toDataURL(
        o.type,
        o.quality
      ));
    else if (!("__context" in e)) {
      const w = e.toDataURL(
        o.type,
        o.quality
      ), S = r.createElement("canvas");
      S.width = e.width, S.height = e.height;
      const v = S.toDataURL(
        o.type,
        o.quality
      );
      w !== v && (g.rr_dataURL = w);
    }
  }
  if (f === "img" && p) {
    Qe || (Qe = r.createElement("canvas"), hn = Qe.getContext("2d"));
    const w = e, S = w.currentSrc || w.getAttribute("src") || "<unknown-src>", v = w.crossOrigin, b = () => {
      w.removeEventListener("load", b);
      try {
        Qe.width = w.naturalWidth, Qe.height = w.naturalHeight, hn.drawImage(w, 0, 0), g.rr_dataURL = Qe.toDataURL(
          o.type,
          o.quality
        );
      } catch (k) {
        if (w.crossOrigin !== "anonymous") {
          w.crossOrigin = "anonymous", w.complete && w.naturalWidth !== 0 ? b() : w.addEventListener("load", b);
          return;
        } else
          console.warn(
            `Cannot inline img src=${S}! Error: ${k}`
          );
      }
      w.crossOrigin === "anonymous" && (v ? g.crossOrigin = v : w.removeAttribute("crossorigin"));
    };
    w.complete && w.naturalWidth !== 0 ? b() : w.addEventListener("load", b);
  }
  if (["audio", "video"].includes(f)) {
    const w = g;
    w.rr_mediaState = e.paused ? "paused" : "played", w.rr_mediaCurrentTime = e.currentTime, w.rr_mediaPlaybackRate = e.playbackRate, w.rr_mediaMuted = e.muted, w.rr_mediaLoop = e.loop, w.rr_mediaVolume = e.volume;
  }
  if (u || (e.scrollLeft && (g.rr_scrollLeft = e.scrollLeft), e.scrollTop && (g.rr_scrollTop = e.scrollTop)), m) {
    const { width: w, height: S } = e.getBoundingClientRect();
    g = {
      class: g.class,
      rr_width: `${w}px`,
      rr_height: `${S}px`
    };
  }
  f === "iframe" && !d(g.src) && (e.contentDocument || (g.rr_src = g.src), delete g.src);
  let y;
  try {
    customElements.get(f) && (y = !0);
  } catch {
  }
  return {
    type: se.Element,
    tagName: f,
    attributes: g,
    childNodes: [],
    isSVG: yc(e) || void 0,
    needBlock: m,
    rootId: l,
    isCustom: y
  };
}
function X(e) {
  return e == null ? "" : e.toLowerCase();
}
function so(e) {
  return e === !0 || e === "all" ? {
    script: !0,
    comment: !0,
    headFavicon: !0,
    headWhitespace: !0,
    headMetaSocial: !0,
    headMetaRobots: !0,
    headMetaHttpEquiv: !0,
    headMetaVerification: !0,
    // the following are off for slimDOMOptions === true,
    // as they destroy some (hidden) info:
    headMetaAuthorship: e === "all",
    headMetaDescKeywords: e === "all",
    headTitleMutations: e === "all"
  } : e || {};
}
function Ec(e, t) {
  if (t.comment && e.type === se.Comment)
    return !0;
  if (e.type === se.Element) {
    if (t.script && // script tag
    (e.tagName === "script" || // (module)preload link
    e.tagName === "link" && (e.attributes.rel === "preload" && e.attributes.as === "script" || e.attributes.rel === "modulepreload") || // prefetch link
    e.tagName === "link" && e.attributes.rel === "prefetch" && typeof e.attributes.href == "string" && eo(e.attributes.href) === "js"))
      return !0;
    if (t.headFavicon && (e.tagName === "link" && e.attributes.rel === "shortcut icon" || e.tagName === "meta" && (X(e.attributes.name).match(
      /^msapplication-tile(image|color)$/
    ) || X(e.attributes.name) === "application-name" || X(e.attributes.rel) === "icon" || X(e.attributes.rel) === "apple-touch-icon" || X(e.attributes.rel) === "shortcut icon")))
      return !0;
    if (e.tagName === "meta") {
      if (t.headMetaDescKeywords && X(e.attributes.name).match(/^description|keywords$/))
        return !0;
      if (t.headMetaSocial && (X(e.attributes.property).match(/^(og|twitter|fb):/) || // og = opengraph (facebook)
      X(e.attributes.name).match(/^(og|twitter):/) || X(e.attributes.name) === "pinterest"))
        return !0;
      if (t.headMetaRobots && (X(e.attributes.name) === "robots" || X(e.attributes.name) === "googlebot" || X(e.attributes.name) === "bingbot"))
        return !0;
      if (t.headMetaHttpEquiv && e.attributes["http-equiv"] !== void 0)
        return !0;
      if (t.headMetaAuthorship && (X(e.attributes.name) === "author" || X(e.attributes.name) === "generator" || X(e.attributes.name) === "framework" || X(e.attributes.name) === "publisher" || X(e.attributes.name) === "progid" || X(e.attributes.property).match(/^article:/) || X(e.attributes.property).match(/^product:/)))
        return !0;
      if (t.headMetaVerification && (X(e.attributes.name) === "google-site-verification" || X(e.attributes.name) === "yandex-verification" || X(e.attributes.name) === "csrf-token" || X(e.attributes.name) === "p:domain_verify" || X(e.attributes.name) === "verify-v1" || X(e.attributes.name) === "verification" || X(e.attributes.name) === "shopify-checkout-api-token"))
        return !0;
    }
  }
  return !1;
}
function nt(e, t) {
  const {
    doc: r,
    mirror: n,
    blockClass: i,
    blockSelector: s,
    maskTextClass: c,
    maskTextSelector: h,
    skipChild: o = !1,
    inlineStylesheet: p = !0,
    maskInputOptions: a = {},
    maskTextFn: d,
    maskInputFn: u,
    slimDOMOptions: l,
    dataURLOptions: m = {},
    inlineImages: f = !1,
    recordCanvas: g = !1,
    onSerialize: x,
    onIframeLoad: y,
    iframeLoadTimeout: w = 5e3,
    onStylesheetLoad: S,
    stylesheetLoadTimeout: v = 5e3,
    keepIframeSrcFn: b = () => !1,
    newlyAddedElement: k = !1,
    cssCaptured: E = !1
  } = t;
  let { needsMask: O } = t, { preserveWhiteSpace: M = !0 } = t;
  O || (O = no(
    e,
    c,
    h,
    O === void 0
  ));
  const D = xc(e, {
    doc: r,
    mirror: n,
    blockClass: i,
    blockSelector: s,
    needsMask: O,
    inlineStylesheet: p,
    maskInputOptions: a,
    maskTextFn: d,
    maskInputFn: u,
    dataURLOptions: m,
    inlineImages: f,
    recordCanvas: g,
    keepIframeSrcFn: b,
    newlyAddedElement: k,
    cssCaptured: E
  });
  if (!D)
    return console.warn(e, "not serialized"), null;
  let N;
  n.hasNode(e) ? N = n.getId(e) : Ec(D, l) || !M && D.type === se.Text && !D.textContent.replace(/^\s+|\s+$/gm, "").length ? N = ft : N = to();
  const C = Object.assign(D, { id: N });
  if (n.add(e, C), N === ft)
    return null;
  x && x(e);
  let oe = !o;
  if (C.type === se.Element) {
    oe = oe && !C.needBlock, delete C.needBlock;
    const G = ue.shadowRoot(e);
    G && ht(G) && (C.isShadowHost = !0);
  }
  if ((C.type === se.Document || C.type === se.Element) && oe) {
    l.headWhitespace && C.type === se.Element && C.tagName === "head" && (M = !1);
    const G = {
      doc: r,
      mirror: n,
      blockClass: i,
      blockSelector: s,
      needsMask: O,
      maskTextClass: c,
      maskTextSelector: h,
      skipChild: o,
      inlineStylesheet: p,
      maskInputOptions: a,
      maskTextFn: d,
      maskInputFn: u,
      slimDOMOptions: l,
      dataURLOptions: m,
      inlineImages: f,
      recordCanvas: g,
      preserveWhiteSpace: M,
      onSerialize: x,
      onIframeLoad: y,
      iframeLoadTimeout: w,
      onStylesheetLoad: S,
      stylesheetLoadTimeout: v,
      keepIframeSrcFn: b,
      cssCaptured: !1
    };
    if (!(C.type === se.Element && C.tagName === "textarea" && C.attributes.value !== void 0)) {
      C.type === se.Element && C.attributes._cssText !== void 0 && typeof C.attributes._cssText == "string" && (G.cssCaptured = !0);
      for (const K of Array.from(ue.childNodes(e))) {
        const ee = nt(K, G);
        ee && C.childNodes.push(ee);
      }
    }
    let q = null;
    if (Ks(e) && (q = ue.shadowRoot(e)))
      for (const K of Array.from(ue.childNodes(q))) {
        const ee = nt(K, G);
        ee && (ht(q) && (ee.isShadow = !0), C.childNodes.push(ee));
      }
  }
  const te = ue.parentNode(e);
  return te && dt(te) && ht(te) && (C.isShadow = !0), C.type === se.Element && C.tagName === "iframe" && vc(
    e,
    () => {
      const G = e.contentDocument;
      if (G && y) {
        const q = nt(G, {
          doc: G,
          mirror: n,
          blockClass: i,
          blockSelector: s,
          needsMask: O,
          maskTextClass: c,
          maskTextSelector: h,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: d,
          maskInputFn: u,
          slimDOMOptions: l,
          dataURLOptions: m,
          inlineImages: f,
          recordCanvas: g,
          preserveWhiteSpace: M,
          onSerialize: x,
          onIframeLoad: y,
          iframeLoadTimeout: w,
          onStylesheetLoad: S,
          stylesheetLoadTimeout: v,
          keepIframeSrcFn: b
        });
        q && y(
          e,
          q
        );
      }
    },
    w
  ), C.type === se.Element && C.tagName === "link" && typeof C.attributes.rel == "string" && (C.attributes.rel === "stylesheet" || C.attributes.rel === "preload" && typeof C.attributes.href == "string" && eo(C.attributes.href) === "css") && wc(
    e,
    () => {
      if (S) {
        const G = nt(e, {
          doc: r,
          mirror: n,
          blockClass: i,
          blockSelector: s,
          needsMask: O,
          maskTextClass: c,
          maskTextSelector: h,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: d,
          maskInputFn: u,
          slimDOMOptions: l,
          dataURLOptions: m,
          inlineImages: f,
          recordCanvas: g,
          preserveWhiteSpace: M,
          onSerialize: x,
          onIframeLoad: y,
          iframeLoadTimeout: w,
          onStylesheetLoad: S,
          stylesheetLoadTimeout: v,
          keepIframeSrcFn: b
        });
        G && S(
          e,
          G
        );
      }
    },
    v
  ), C;
}
function Mc(e, t) {
  const {
    mirror: r = new Qs(),
    blockClass: n = "rr-block",
    blockSelector: i = null,
    maskTextClass: s = "rr-mask",
    maskTextSelector: c = null,
    inlineStylesheet: h = !0,
    inlineImages: o = !1,
    recordCanvas: p = !1,
    maskAllInputs: a = !1,
    maskTextFn: d,
    maskInputFn: u,
    slimDOM: l = !1,
    dataURLOptions: m,
    preserveWhiteSpace: f,
    onSerialize: g,
    onIframeLoad: x,
    iframeLoadTimeout: y,
    onStylesheetLoad: w,
    stylesheetLoadTimeout: S,
    keepIframeSrcFn: v = () => !1
  } = t, b = a === !0 ? {
    color: !0,
    date: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0,
    textarea: !0,
    select: !0,
    password: !0
  } : a === !1 ? {
    password: !0
  } : a, k = so(l);
  return nt(e, {
    doc: e,
    mirror: r,
    blockClass: n,
    blockSelector: i,
    maskTextClass: s,
    maskTextSelector: c,
    skipChild: !1,
    inlineStylesheet: h,
    maskInputOptions: b,
    maskTextFn: d,
    maskInputFn: u,
    slimDOMOptions: k,
    dataURLOptions: m,
    inlineImages: o,
    recordCanvas: p,
    preserveWhiteSpace: f,
    onSerialize: g,
    onIframeLoad: x,
    iframeLoadTimeout: y,
    onStylesheetLoad: w,
    stylesheetLoadTimeout: S,
    keepIframeSrcFn: v,
    newlyAddedElement: !1
  });
}
function Rc(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function Oc(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var r = function n() {
      return this instanceof n ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    r.prototype = t.prototype;
  } else r = {};
  return Object.defineProperty(r, "__esModule", { value: !0 }), Object.keys(e).forEach(function(n) {
    var i = Object.getOwnPropertyDescriptor(e, n);
    Object.defineProperty(r, n, i.get ? i : {
      enumerable: !0,
      get: function() {
        return e[n];
      }
    });
  }), r;
}
var Mt = { exports: {} }, fn;
function Ic() {
  if (fn) return Mt.exports;
  fn = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return Mt.exports = t(), Mt.exports.createColors = t, Mt.exports;
}
const Ac = {}, Lc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Ac
}, Symbol.toStringTag, { value: "Module" })), Oe = /* @__PURE__ */ Oc(Lc);
var pr, mn;
function Oi() {
  if (mn) return pr;
  mn = 1;
  let e = /* @__PURE__ */ Ic(), t = Oe;
  class r extends Error {
    constructor(i, s, c, h, o, p) {
      super(i), this.name = "CssSyntaxError", this.reason = i, o && (this.file = o), h && (this.source = h), p && (this.plugin = p), typeof s < "u" && typeof c < "u" && (typeof s == "number" ? (this.line = s, this.column = c) : (this.line = s.line, this.column = s.column, this.endLine = c.line, this.endColumn = c.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(i) {
      if (!this.source) return "";
      let s = this.source;
      i == null && (i = e.isColorSupported), t && i && (s = t(s));
      let c = s.split(/\r?\n/), h = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, c.length), p = String(o).length, a, d;
      if (i) {
        let { bold: u, gray: l, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), d = (f) => l(f);
      } else
        a = d = (u) => u;
      return c.slice(h, o).map((u, l) => {
        let m = h + 1 + l, f = " " + (" " + m).slice(-p) + " | ";
        if (m === this.line) {
          let g = d(f.replace(/\d/g, " ")) + u.slice(0, this.column - 1).replace(/[^\t]/g, " ");
          return a(">") + d(f) + u + `
 ` + g + a("^");
        }
        return " " + d(f) + u;
      }).join(`
`);
    }
    toString() {
      let i = this.showSourceCode();
      return i && (i = `

` + i + `
`), this.name + ": " + this.message + i;
    }
  }
  return pr = r, r.default = r, pr;
}
var Rt = {}, gn;
function Ii() {
  return gn || (gn = 1, Rt.isClean = Symbol("isClean"), Rt.my = Symbol("my")), Rt;
}
var fr, yn;
function oo() {
  if (yn) return fr;
  yn = 1;
  const e = {
    after: `
`,
    beforeClose: `
`,
    beforeComment: `
`,
    beforeDecl: `
`,
    beforeOpen: " ",
    beforeRule: `
`,
    colon: ": ",
    commentLeft: " ",
    commentRight: " ",
    emptyBody: "",
    indent: "    ",
    semicolon: !1
  };
  function t(n) {
    return n[0].toUpperCase() + n.slice(1);
  }
  class r {
    constructor(i) {
      this.builder = i;
    }
    atrule(i, s) {
      let c = "@" + i.name, h = i.params ? this.rawValue(i, "params") : "";
      if (typeof i.raws.afterName < "u" ? c += i.raws.afterName : h && (c += " "), i.nodes)
        this.block(i, c + h);
      else {
        let o = (i.raws.between || "") + (s ? ";" : "");
        this.builder(c + h + o, i);
      }
    }
    beforeAfter(i, s) {
      let c;
      i.type === "decl" ? c = this.raw(i, null, "beforeDecl") : i.type === "comment" ? c = this.raw(i, null, "beforeComment") : s === "before" ? c = this.raw(i, null, "beforeRule") : c = this.raw(i, null, "beforeClose");
      let h = i.parent, o = 0;
      for (; h && h.type !== "root"; )
        o += 1, h = h.parent;
      if (c.includes(`
`)) {
        let p = this.raw(i, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) c += p;
      }
      return c;
    }
    block(i, s) {
      let c = this.raw(i, "between", "beforeOpen");
      this.builder(s + c + "{", i, "start");
      let h;
      i.nodes && i.nodes.length ? (this.body(i), h = this.raw(i, "after")) : h = this.raw(i, "after", "emptyBody"), h && this.builder(h), this.builder("}", i, "end");
    }
    body(i) {
      let s = i.nodes.length - 1;
      for (; s > 0 && i.nodes[s].type === "comment"; )
        s -= 1;
      let c = this.raw(i, "semicolon");
      for (let h = 0; h < i.nodes.length; h++) {
        let o = i.nodes[h], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== h || c);
      }
    }
    comment(i) {
      let s = this.raw(i, "left", "commentLeft"), c = this.raw(i, "right", "commentRight");
      this.builder("/*" + s + i.text + c + "*/", i);
    }
    decl(i, s) {
      let c = this.raw(i, "between", "colon"), h = i.prop + c + this.rawValue(i, "value");
      i.important && (h += i.raws.important || " !important"), s && (h += ";"), this.builder(h, i);
    }
    document(i) {
      this.body(i);
    }
    raw(i, s, c) {
      let h;
      if (c || (c = s), s && (h = i.raws[s], typeof h < "u"))
        return h;
      let o = i.parent;
      if (c === "before" && (!o || o.type === "root" && o.first === i || o && o.type === "document"))
        return "";
      if (!o) return e[c];
      let p = i.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[c] < "u")
        return p.rawCache[c];
      if (c === "before" || c === "after")
        return this.beforeAfter(i, c);
      {
        let a = "raw" + t(c);
        this[a] ? h = this[a](p, i) : p.walk((d) => {
          if (h = d.raws[s], typeof h < "u") return !1;
        });
      }
      return typeof h > "u" && (h = e[c]), p.rawCache[c] = h, h;
    }
    rawBeforeClose(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length > 0 && typeof c.raws.after < "u")
          return s = c.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(i, s) {
      let c;
      return i.walkComments((h) => {
        if (typeof h.raws.before < "u")
          return c = h.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeDecl") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeDecl(i, s) {
      let c;
      return i.walkDecls((h) => {
        if (typeof h.raws.before < "u")
          return c = h.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeRule") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeOpen(i) {
      let s;
      return i.walk((c) => {
        if (c.type !== "decl" && (s = c.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && (c.parent !== i || i.first !== c) && typeof c.raws.before < "u")
          return s = c.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(i) {
      let s;
      return i.walkDecls((c) => {
        if (typeof c.raws.between < "u")
          return s = c.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length === 0 && (s = c.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(i) {
      if (i.raws.indent) return i.raws.indent;
      let s;
      return i.walk((c) => {
        let h = c.parent;
        if (h && h !== i && h.parent && h.parent === i && typeof c.raws.before < "u") {
          let o = c.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length && c.last.type === "decl" && (s = c.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(i, s) {
      let c = i[s], h = i.raws[s];
      return h && h.value === c ? h.raw : c;
    }
    root(i) {
      this.body(i), i.raws.after && this.builder(i.raws.after);
    }
    rule(i) {
      this.block(i, this.rawValue(i, "selector")), i.raws.ownSemicolon && this.builder(i.raws.ownSemicolon, i, "end");
    }
    stringify(i, s) {
      if (!this[i.type])
        throw new Error(
          "Unknown AST node type " + i.type + ". Maybe you need to change PostCSS stringifier."
        );
      this[i.type](i, s);
    }
  }
  return fr = r, r.default = r, fr;
}
var mr, bn;
function Jt() {
  if (bn) return mr;
  bn = 1;
  let e = oo();
  function t(r, n) {
    new e(n).stringify(r);
  }
  return mr = t, t.default = t, mr;
}
var gr, vn;
function Xt() {
  if (vn) return gr;
  vn = 1;
  let { isClean: e, my: t } = Ii(), r = Oi(), n = oo(), i = Jt();
  function s(h, o) {
    let p = new h.constructor();
    for (let a in h) {
      if (!Object.prototype.hasOwnProperty.call(h, a) || a === "proxyCache") continue;
      let d = h[a], u = typeof d;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = d : Array.isArray(d) ? p[a] = d.map((l) => s(l, p)) : (u === "object" && d !== null && (d = s(d)), p[a] = d);
    }
    return p;
  }
  class c {
    constructor(o = {}) {
      this.raws = {}, this[e] = !1, this[t] = !0;
      for (let p in o)
        if (p === "nodes") {
          this.nodes = [];
          for (let a of o[p])
            typeof a.clone == "function" ? this.append(a.clone()) : this.append(a);
        } else
          this[p] = o[p];
    }
    addToError(o) {
      if (o.postcssNode = this, o.stack && this.source && /\n\s{4}at /.test(o.stack)) {
        let p = this.source;
        o.stack = o.stack.replace(
          /\n\s{4}at /,
          `$&${p.input.from}:${p.start.line}:${p.start.column}$&`
        );
      }
      return o;
    }
    after(o) {
      return this.parent.insertAfter(this, o), this;
    }
    assign(o = {}) {
      for (let p in o)
        this[p] = o[p];
      return this;
    }
    before(o) {
      return this.parent.insertBefore(this, o), this;
    }
    cleanRaws(o) {
      delete this.raws.before, delete this.raws.after, o || delete this.raws.between;
    }
    clone(o = {}) {
      let p = s(this);
      for (let a in o)
        p[a] = o[a];
      return p;
    }
    cloneAfter(o = {}) {
      let p = this.clone(o);
      return this.parent.insertAfter(this, p), p;
    }
    cloneBefore(o = {}) {
      let p = this.clone(o);
      return this.parent.insertBefore(this, p), p;
    }
    error(o, p = {}) {
      if (this.source) {
        let { end: a, start: d } = this.rangeBy(p);
        return this.source.input.error(
          o,
          { column: d.column, line: d.line },
          { column: a.column, line: a.line },
          p
        );
      }
      return new r(o);
    }
    getProxyProcessor() {
      return {
        get(o, p) {
          return p === "proxyOf" ? o : p === "root" ? () => o.root().toProxy() : o[p];
        },
        set(o, p, a) {
          return o[p] === a || (o[p] = a, (p === "prop" || p === "value" || p === "name" || p === "params" || p === "important" || /* c8 ignore next */
          p === "text") && o.markDirty()), !0;
        }
      };
    }
    markDirty() {
      if (this[e]) {
        this[e] = !1;
        let o = this;
        for (; o = o.parent; )
          o[e] = !1;
      }
    }
    next() {
      if (!this.parent) return;
      let o = this.parent.index(this);
      return this.parent.nodes[o + 1];
    }
    positionBy(o, p) {
      let a = this.source.start;
      if (o.index)
        a = this.positionInside(o.index, p);
      else if (o.word) {
        p = this.toString();
        let d = p.indexOf(o.word);
        d !== -1 && (a = this.positionInside(d, p));
      }
      return a;
    }
    positionInside(o, p) {
      let a = p || this.toString(), d = this.source.start.column, u = this.source.start.line;
      for (let l = 0; l < o; l++)
        a[l] === `
` ? (d = 1, u += 1) : d += 1;
      return { column: d, line: u };
    }
    prev() {
      if (!this.parent) return;
      let o = this.parent.index(this);
      return this.parent.nodes[o - 1];
    }
    rangeBy(o) {
      let p = {
        column: this.source.start.column,
        line: this.source.start.line
      }, a = this.source.end ? {
        column: this.source.end.column + 1,
        line: this.source.end.line
      } : {
        column: p.column + 1,
        line: p.line
      };
      if (o.word) {
        let d = this.toString(), u = d.indexOf(o.word);
        u !== -1 && (p = this.positionInside(u, d), a = this.positionInside(u + o.word.length, d));
      } else
        o.start ? p = {
          column: o.start.column,
          line: o.start.line
        } : o.index && (p = this.positionInside(o.index)), o.end ? a = {
          column: o.end.column,
          line: o.end.line
        } : typeof o.endIndex == "number" ? a = this.positionInside(o.endIndex) : o.index && (a = this.positionInside(o.index + 1));
      return (a.line < p.line || a.line === p.line && a.column <= p.column) && (a = { column: p.column + 1, line: p.line }), { end: a, start: p };
    }
    raw(o, p) {
      return new n().raw(this, o, p);
    }
    remove() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }
    replaceWith(...o) {
      if (this.parent) {
        let p = this, a = !1;
        for (let d of o)
          d === this ? a = !0 : a ? (this.parent.insertAfter(p, d), p = d) : this.parent.insertBefore(p, d);
        a || this.remove();
      }
      return this;
    }
    root() {
      let o = this;
      for (; o.parent && o.parent.type !== "document"; )
        o = o.parent;
      return o;
    }
    toJSON(o, p) {
      let a = {}, d = p == null;
      p = p || /* @__PURE__ */ new Map();
      let u = 0;
      for (let l in this) {
        if (!Object.prototype.hasOwnProperty.call(this, l) || l === "parent" || l === "proxyCache") continue;
        let m = this[l];
        if (Array.isArray(m))
          a[l] = m.map((f) => typeof f == "object" && f.toJSON ? f.toJSON(null, p) : f);
        else if (typeof m == "object" && m.toJSON)
          a[l] = m.toJSON(null, p);
        else if (l === "source") {
          let f = p.get(m.input);
          f == null && (f = u, p.set(m.input, u), u++), a[l] = {
            end: m.end,
            inputId: f,
            start: m.start
          };
        } else
          a[l] = m;
      }
      return d && (a.inputs = [...p.keys()].map((l) => l.toJSON())), a;
    }
    toProxy() {
      return this.proxyCache || (this.proxyCache = new Proxy(this, this.getProxyProcessor())), this.proxyCache;
    }
    toString(o = i) {
      o.stringify && (o = o.stringify);
      let p = "";
      return o(this, (a) => {
        p += a;
      }), p;
    }
    warn(o, p, a) {
      let d = { node: this };
      for (let u in a) d[u] = a[u];
      return o.warn(p, d);
    }
    get proxyOf() {
      return this;
    }
  }
  return gr = c, c.default = c, gr;
}
var yr, wn;
function Kt() {
  if (wn) return yr;
  wn = 1;
  let e = Xt();
  class t extends e {
    constructor(n) {
      n && typeof n.value < "u" && typeof n.value != "string" && (n = { ...n, value: String(n.value) }), super(n), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return yr = t, t.default = t, yr;
}
var br, xn;
function Pc() {
  if (xn) return br;
  xn = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return br = { nanoid: (n = 21) => {
    let i = "", s = n;
    for (; s--; )
      i += e[Math.random() * 64 | 0];
    return i;
  }, customAlphabet: (n, i = 21) => (s = i) => {
    let c = "", h = s;
    for (; h--; )
      c += n[Math.random() * n.length | 0];
    return c;
  } }, br;
}
var vr, kn;
function ao() {
  if (kn) return vr;
  kn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Oe, { existsSync: r, readFileSync: n } = Oe, { dirname: i, join: s } = Oe;
  function c(o) {
    return Buffer ? Buffer.from(o, "base64").toString() : window.atob(o);
  }
  class h {
    constructor(p, a) {
      if (a.map === !1) return;
      this.loadAnnotation(p), this.inline = this.startWith(this.annotation, "data:");
      let d = a.map ? a.map.prev : void 0, u = this.loadMap(a.from, d);
      !this.mapFile && a.from && (this.mapFile = a.from), this.mapFile && (this.root = i(this.mapFile)), u && (this.text = u);
    }
    consumer() {
      return this.consumerCache || (this.consumerCache = new e(this.text)), this.consumerCache;
    }
    decodeInline(p) {
      let a = /^data:application\/json;charset=utf-?8;base64,/, d = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, l = /^data:application\/json,/;
      if (u.test(p) || l.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || d.test(p))
        return c(p.substr(RegExp.lastMatch.length));
      let m = p.match(/data:application\/json;([^,]+),/)[1];
      throw new Error("Unsupported source map encoding " + m);
    }
    getAnnotationURL(p) {
      return p.replace(/^\/\*\s*# sourceMappingURL=/, "").trim();
    }
    isMap(p) {
      return typeof p != "object" ? !1 : typeof p.mappings == "string" || typeof p._mappings == "string" || Array.isArray(p.sections);
    }
    loadAnnotation(p) {
      let a = p.match(/\/\*\s*# sourceMappingURL=/gm);
      if (!a) return;
      let d = p.lastIndexOf(a.pop()), u = p.indexOf("*/", d);
      d > -1 && u > -1 && (this.annotation = this.getAnnotationURL(p.substring(d, u)));
    }
    loadFile(p) {
      if (this.root = i(p), r(p))
        return this.mapFile = p, n(p, "utf-8").toString().trim();
    }
    loadMap(p, a) {
      if (a === !1) return !1;
      if (a) {
        if (typeof a == "string")
          return a;
        if (typeof a == "function") {
          let d = a(p);
          if (d) {
            let u = this.loadFile(d);
            if (!u)
              throw new Error(
                "Unable to load previous source map: " + d.toString()
              );
            return u;
          }
        } else {
          if (a instanceof e)
            return t.fromSourceMap(a).toString();
          if (a instanceof t)
            return a.toString();
          if (this.isMap(a))
            return JSON.stringify(a);
          throw new Error(
            "Unsupported previous source map format: " + a.toString()
          );
        }
      } else {
        if (this.inline)
          return this.decodeInline(this.annotation);
        if (this.annotation) {
          let d = this.annotation;
          return p && (d = s(i(p), d)), this.loadFile(d);
        }
      }
    }
    startWith(p, a) {
      return p ? p.substr(0, a.length) === a : !1;
    }
    withContent() {
      return !!(this.consumer().sourcesContent && this.consumer().sourcesContent.length > 0);
    }
  }
  return vr = h, h.default = h, vr;
}
var wr, Sn;
function Zt() {
  if (Sn) return wr;
  Sn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Oe, { fileURLToPath: r, pathToFileURL: n } = Oe, { isAbsolute: i, resolve: s } = Oe, { nanoid: c } = /* @__PURE__ */ Pc(), h = Oe, o = Oi(), p = ao(), a = Symbol("fromOffsetCache"), d = !!(e && t), u = !!(s && i);
  class l {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || i(g.from) ? this.file = g.from : this.file = s(g.from)), u && d) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let y = x.consumer().file;
          !this.file && y && (this.file = this.mapResolve(y));
        }
      }
      this.file || (this.id = "<input css " + c(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, y = {}) {
      let w, S, v;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let O = this.fromOffset(k.offset);
          g = O.line, x = O.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let O = this.fromOffset(E.offset);
          S = O.line, v = O.col;
        } else
          S = E.line, v = E.column;
      } else if (!x) {
        let k = this.fromOffset(g);
        g = k.line, x = k.col;
      }
      let b = this.origin(g, x, S, v);
      return b ? w = new o(
        f,
        b.endLine === void 0 ? b.line : { column: b.column, line: b.line },
        b.endLine === void 0 ? b.column : { column: b.endColumn, line: b.endLine },
        b.source,
        b.file,
        y.plugin
      ) : w = new o(
        f,
        S === void 0 ? g : { column: x, line: g },
        S === void 0 ? x : { column: v, line: S },
        this.css,
        this.file,
        y.plugin
      ), w.input = { column: x, endColumn: v, endLine: S, line: g, source: this.css }, this.file && (n && (w.input.url = n(this.file).toString()), w.input.file = this.file), w;
    }
    fromOffset(f) {
      let g, x;
      if (this[a])
        x = this[a];
      else {
        let w = this.css.split(`
`);
        x = new Array(w.length);
        let S = 0;
        for (let v = 0, b = w.length; v < b; v++)
          x[v] = S, S += w[v].length + 1;
        this[a] = x;
      }
      g = x[x.length - 1];
      let y = 0;
      if (f >= g)
        y = x.length - 1;
      else {
        let w = x.length - 2, S;
        for (; y < w; )
          if (S = y + (w - y >> 1), f < x[S])
            w = S - 1;
          else if (f >= x[S + 1])
            y = S + 1;
          else {
            y = S;
            break;
          }
      }
      return {
        col: f - x[y] + 1,
        line: y + 1
      };
    }
    mapResolve(f) {
      return /^\w+:\/\//.test(f) ? f : s(this.map.consumer().sourceRoot || this.map.root || ".", f);
    }
    origin(f, g, x, y) {
      if (!this.map) return !1;
      let w = this.map.consumer(), S = w.originalPositionFor({ column: g, line: f });
      if (!S.source) return !1;
      let v;
      typeof x == "number" && (v = w.originalPositionFor({ column: y, line: x }));
      let b;
      i(S.source) ? b = n(S.source) : b = new URL(
        S.source,
        this.map.consumer().sourceRoot || n(this.map.mapFile)
      );
      let k = {
        column: S.column,
        endColumn: v && v.column,
        endLine: v && v.line,
        line: S.line,
        url: b.toString()
      };
      if (b.protocol === "file:")
        if (r)
          k.file = r(b);
        else
          throw new Error("file: protocol is not available in this PostCSS build");
      let E = w.sourceContentFor(S.source);
      return E && (k.source = E), k;
    }
    toJSON() {
      let f = {};
      for (let g of ["hasBOM", "css", "file", "id"])
        this[g] != null && (f[g] = this[g]);
      return this.map && (f.map = { ...this.map }, f.map.consumerCache && (f.map.consumerCache = void 0)), f;
    }
    get from() {
      return this.file || this.id;
    }
  }
  return wr = l, l.default = l, h && h.registerInput && h.registerInput(l), wr;
}
var xr, Cn;
function lo() {
  if (Cn) return xr;
  Cn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Oe, { dirname: r, relative: n, resolve: i, sep: s } = Oe, { pathToFileURL: c } = Oe, h = Zt(), o = !!(e && t), p = !!(r && i && n && s);
  class a {
    constructor(u, l, m, f) {
      this.stringify = u, this.mapOpts = m.map || {}, this.root = l, this.opts = m, this.css = f, this.originalCSS = f, this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute, this.memoizedFileURLs = /* @__PURE__ */ new Map(), this.memoizedPaths = /* @__PURE__ */ new Map(), this.memoizedURLs = /* @__PURE__ */ new Map();
    }
    addAnnotation() {
      let u;
      this.isInline() ? u = "data:application/json;base64," + this.toBase64(this.map.toString()) : typeof this.mapOpts.annotation == "string" ? u = this.mapOpts.annotation : typeof this.mapOpts.annotation == "function" ? u = this.mapOpts.annotation(this.opts.to, this.root) : u = this.outputFile() + ".map";
      let l = `
`;
      this.css.includes(`\r
`) && (l = `\r
`), this.css += l + "/*# sourceMappingURL=" + u + " */";
    }
    applyPrevMaps() {
      for (let u of this.previous()) {
        let l = this.toUrl(this.path(u.file)), m = u.root || r(u.file), f;
        this.mapOpts.sourcesContent === !1 ? (f = new e(u.text), f.sourcesContent && (f.sourcesContent = null)) : f = u.consumer(), this.map.applySourceMap(f, l, this.toUrl(this.path(m)));
      }
    }
    clearAnnotation() {
      if (this.mapOpts.annotation !== !1)
        if (this.root) {
          let u;
          for (let l = this.root.nodes.length - 1; l >= 0; l--)
            u = this.root.nodes[l], u.type === "comment" && u.text.indexOf("# sourceMappingURL=") === 0 && this.root.removeChild(l);
        } else this.css && (this.css = this.css.replace(/\n*?\/\*#[\S\s]*?\*\/$/gm, ""));
    }
    generate() {
      if (this.clearAnnotation(), p && o && this.isMap())
        return this.generateMap();
      {
        let u = "";
        return this.stringify(this.root, (l) => {
          u += l;
        }), [u];
      }
    }
    generateMap() {
      if (this.root)
        this.generateString();
      else if (this.previous().length === 1) {
        let u = this.previous()[0].consumer();
        u.file = this.outputFile(), this.map = t.fromSourceMap(u, {
          ignoreInvalidMapping: !0
        });
      } else
        this.map = new t({
          file: this.outputFile(),
          ignoreInvalidMapping: !0
        }), this.map.addMapping({
          generated: { column: 0, line: 1 },
          original: { column: 0, line: 1 },
          source: this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>"
        });
      return this.isSourcesContent() && this.setSourcesContent(), this.root && this.previous().length > 0 && this.applyPrevMaps(), this.isAnnotation() && this.addAnnotation(), this.isInline() ? [this.css] : [this.css, this.map];
    }
    generateString() {
      this.css = "", this.map = new t({
        file: this.outputFile(),
        ignoreInvalidMapping: !0
      });
      let u = 1, l = 1, m = "<no source>", f = {
        generated: { column: 0, line: 0 },
        original: { column: 0, line: 0 },
        source: ""
      }, g, x;
      this.stringify(this.root, (y, w, S) => {
        if (this.css += y, w && S !== "end" && (f.generated.line = u, f.generated.column = l - 1, w.source && w.source.start ? (f.source = this.sourcePath(w), f.original.line = w.source.start.line, f.original.column = w.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = y.match(/\n/g), g ? (u += g.length, x = y.lastIndexOf(`
`), l = y.length - x) : l += y.length, w && S !== "start") {
          let v = w.parent || { raws: {} };
          (!(w.type === "decl" || w.type === "atrule" && !w.nodes) || w !== v.last || v.raws.semicolon) && (w.source && w.source.end ? (f.source = this.sourcePath(w), f.original.line = w.source.end.line, f.original.column = w.source.end.column - 1, f.generated.line = u, f.generated.column = l - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = l - 1, this.map.addMapping(f)));
        }
      });
    }
    isAnnotation() {
      return this.isInline() ? !0 : typeof this.mapOpts.annotation < "u" ? this.mapOpts.annotation : this.previous().length ? this.previous().some((u) => u.annotation) : !0;
    }
    isInline() {
      if (typeof this.mapOpts.inline < "u")
        return this.mapOpts.inline;
      let u = this.mapOpts.annotation;
      return typeof u < "u" && u !== !0 ? !1 : this.previous().length ? this.previous().some((l) => l.inline) : !0;
    }
    isMap() {
      return typeof this.opts.map < "u" ? !!this.opts.map : this.previous().length > 0;
    }
    isSourcesContent() {
      return typeof this.mapOpts.sourcesContent < "u" ? this.mapOpts.sourcesContent : this.previous().length ? this.previous().some((u) => u.withContent()) : !0;
    }
    outputFile() {
      return this.opts.to ? this.path(this.opts.to) : this.opts.from ? this.path(this.opts.from) : "to.css";
    }
    path(u) {
      if (this.mapOpts.absolute || u.charCodeAt(0) === 60 || /^\w+:\/\//.test(u)) return u;
      let l = this.memoizedPaths.get(u);
      if (l) return l;
      let m = this.opts.to ? r(this.opts.to) : ".";
      typeof this.mapOpts.annotation == "string" && (m = r(i(m, this.mapOpts.annotation)));
      let f = n(m, u);
      return this.memoizedPaths.set(u, f), f;
    }
    previous() {
      if (!this.previousMaps)
        if (this.previousMaps = [], this.root)
          this.root.walk((u) => {
            if (u.source && u.source.input.map) {
              let l = u.source.input.map;
              this.previousMaps.includes(l) || this.previousMaps.push(l);
            }
          });
        else {
          let u = new h(this.originalCSS, this.opts);
          u.map && this.previousMaps.push(u.map);
        }
      return this.previousMaps;
    }
    setSourcesContent() {
      let u = {};
      if (this.root)
        this.root.walk((l) => {
          if (l.source) {
            let m = l.source.input.from;
            if (m && !u[m]) {
              u[m] = !0;
              let f = this.usesFileUrls ? this.toFileUrl(m) : this.toUrl(this.path(m));
              this.map.setSourceContent(f, l.source.input.css);
            }
          }
        });
      else if (this.css) {
        let l = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
        this.map.setSourceContent(l, this.css);
      }
    }
    sourcePath(u) {
      return this.mapOpts.from ? this.toUrl(this.mapOpts.from) : this.usesFileUrls ? this.toFileUrl(u.source.input.from) : this.toUrl(this.path(u.source.input.from));
    }
    toBase64(u) {
      return Buffer ? Buffer.from(u).toString("base64") : window.btoa(unescape(encodeURIComponent(u)));
    }
    toFileUrl(u) {
      let l = this.memoizedFileURLs.get(u);
      if (l) return l;
      if (c) {
        let m = c(u).toString();
        return this.memoizedFileURLs.set(u, m), m;
      } else
        throw new Error(
          "`map.absolute` option is not available in this PostCSS build"
        );
    }
    toUrl(u) {
      let l = this.memoizedURLs.get(u);
      if (l) return l;
      s === "\\" && (u = u.replace(/\\/g, "/"));
      let m = encodeURI(u).replace(/[#?]/g, encodeURIComponent);
      return this.memoizedURLs.set(u, m), m;
    }
  }
  return xr = a, xr;
}
var kr, En;
function Qt() {
  if (En) return kr;
  En = 1;
  let e = Xt();
  class t extends e {
    constructor(n) {
      super(n), this.type = "comment";
    }
  }
  return kr = t, t.default = t, kr;
}
var Sr, Mn;
function Ye() {
  if (Mn) return Sr;
  Mn = 1;
  let { isClean: e, my: t } = Ii(), r = Kt(), n = Qt(), i = Xt(), s, c, h, o;
  function p(u) {
    return u.map((l) => (l.nodes && (l.nodes = p(l.nodes)), delete l.source, l));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let l of u.proxyOf.nodes)
        a(l);
  }
  class d extends i {
    append(...l) {
      for (let m of l) {
        let f = this.normalize(m, this.last);
        for (let g of f) this.proxyOf.nodes.push(g);
      }
      return this.markDirty(), this;
    }
    cleanRaws(l) {
      if (super.cleanRaws(l), this.nodes)
        for (let m of this.nodes) m.cleanRaws(l);
    }
    each(l) {
      if (!this.proxyOf.nodes) return;
      let m = this.getIterator(), f, g;
      for (; this.indexes[m] < this.proxyOf.nodes.length && (f = this.indexes[m], g = l(this.proxyOf.nodes[f], f), g !== !1); )
        this.indexes[m] += 1;
      return delete this.indexes[m], g;
    }
    every(l) {
      return this.nodes.every(l);
    }
    getIterator() {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach += 1;
      let l = this.lastEach;
      return this.indexes[l] = 0, l;
    }
    getProxyProcessor() {
      return {
        get(l, m) {
          return m === "proxyOf" ? l : l[m] ? m === "each" || typeof m == "string" && m.startsWith("walk") ? (...f) => l[m](
            ...f.map((g) => typeof g == "function" ? (x, y) => g(x.toProxy(), y) : g)
          ) : m === "every" || m === "some" ? (f) => l[m](
            (g, ...x) => f(g.toProxy(), ...x)
          ) : m === "root" ? () => l.root().toProxy() : m === "nodes" ? l.nodes.map((f) => f.toProxy()) : m === "first" || m === "last" ? l[m].toProxy() : l[m] : l[m];
        },
        set(l, m, f) {
          return l[m] === f || (l[m] = f, (m === "name" || m === "params" || m === "selector") && l.markDirty()), !0;
        }
      };
    }
    index(l) {
      return typeof l == "number" ? l : (l.proxyOf && (l = l.proxyOf), this.proxyOf.nodes.indexOf(l));
    }
    insertAfter(l, m) {
      let f = this.index(l), g = this.normalize(m, this.proxyOf.nodes[f]).reverse();
      f = this.index(l);
      for (let y of g) this.proxyOf.nodes.splice(f + 1, 0, y);
      let x;
      for (let y in this.indexes)
        x = this.indexes[y], f < x && (this.indexes[y] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(l, m) {
      let f = this.index(l), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(l);
      for (let w of x) this.proxyOf.nodes.splice(f, 0, w);
      let y;
      for (let w in this.indexes)
        y = this.indexes[w], f <= y && (this.indexes[w] = y + x.length);
      return this.markDirty(), this;
    }
    normalize(l, m) {
      if (typeof l == "string")
        l = p(s(l).nodes);
      else if (typeof l > "u")
        l = [];
      else if (Array.isArray(l)) {
        l = l.slice(0);
        for (let g of l)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (l.type === "root" && this.type !== "document") {
        l = l.nodes.slice(0);
        for (let g of l)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (l.type)
        l = [l];
      else if (l.prop) {
        if (typeof l.value > "u")
          throw new Error("Value field is missed in node creation");
        typeof l.value != "string" && (l.value = String(l.value)), l = [new r(l)];
      } else if (l.selector)
        l = [new c(l)];
      else if (l.name)
        l = [new h(l)];
      else if (l.text)
        l = [new n(l)];
      else
        throw new Error("Unknown node type in node creation");
      return l.map((g) => (g[t] || d.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
    }
    prepend(...l) {
      l = l.reverse();
      for (let m of l) {
        let f = this.normalize(m, this.first, "prepend").reverse();
        for (let g of f) this.proxyOf.nodes.unshift(g);
        for (let g in this.indexes)
          this.indexes[g] = this.indexes[g] + f.length;
      }
      return this.markDirty(), this;
    }
    push(l) {
      return l.parent = this, this.proxyOf.nodes.push(l), this;
    }
    removeAll() {
      for (let l of this.proxyOf.nodes) l.parent = void 0;
      return this.proxyOf.nodes = [], this.markDirty(), this;
    }
    removeChild(l) {
      l = this.index(l), this.proxyOf.nodes[l].parent = void 0, this.proxyOf.nodes.splice(l, 1);
      let m;
      for (let f in this.indexes)
        m = this.indexes[f], m >= l && (this.indexes[f] = m - 1);
      return this.markDirty(), this;
    }
    replaceValues(l, m, f) {
      return f || (f = m, m = {}), this.walkDecls((g) => {
        m.props && !m.props.includes(g.prop) || m.fast && !g.value.includes(m.fast) || (g.value = g.value.replace(l, f));
      }), this.markDirty(), this;
    }
    some(l) {
      return this.nodes.some(l);
    }
    walk(l) {
      return this.each((m, f) => {
        let g;
        try {
          g = l(m, f);
        } catch (x) {
          throw m.addToError(x);
        }
        return g !== !1 && m.walk && (g = m.walk(l)), g;
      });
    }
    walkAtRules(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "atrule" && l.test(f.name))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "atrule" && f.name === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "atrule")
          return m(f, g);
      }));
    }
    walkComments(l) {
      return this.walk((m, f) => {
        if (m.type === "comment")
          return l(m, f);
      });
    }
    walkDecls(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "decl" && l.test(f.prop))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "decl" && f.prop === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "decl")
          return m(f, g);
      }));
    }
    walkRules(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "rule" && l.test(f.selector))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "rule" && f.selector === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "rule")
          return m(f, g);
      }));
    }
    get first() {
      if (this.proxyOf.nodes)
        return this.proxyOf.nodes[0];
    }
    get last() {
      if (this.proxyOf.nodes)
        return this.proxyOf.nodes[this.proxyOf.nodes.length - 1];
    }
  }
  return d.registerParse = (u) => {
    s = u;
  }, d.registerRule = (u) => {
    c = u;
  }, d.registerAtRule = (u) => {
    h = u;
  }, d.registerRoot = (u) => {
    o = u;
  }, Sr = d, d.default = d, d.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, h.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, c.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, n.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((l) => {
      d.rebuild(l);
    });
  }, Sr;
}
var Cr, Rn;
function Ai() {
  if (Rn) return Cr;
  Rn = 1;
  let e = Ye(), t, r;
  class n extends e {
    constructor(s) {
      super({ type: "document", ...s }), this.nodes || (this.nodes = []);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return n.registerLazyResult = (i) => {
    t = i;
  }, n.registerProcessor = (i) => {
    r = i;
  }, Cr = n, n.default = n, Cr;
}
var Er, On;
function co() {
  if (On) return Er;
  On = 1;
  let e = {};
  return Er = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, Er;
}
var Mr, In;
function uo() {
  if (In) return Mr;
  In = 1;
  class e {
    constructor(r, n = {}) {
      if (this.type = "warning", this.text = r, n.node && n.node.source) {
        let i = n.node.rangeBy(n);
        this.line = i.start.line, this.column = i.start.column, this.endLine = i.end.line, this.endColumn = i.end.column;
      }
      for (let i in n) this[i] = n[i];
    }
    toString() {
      return this.node ? this.node.error(this.text, {
        index: this.index,
        plugin: this.plugin,
        word: this.word
      }).message : this.plugin ? this.plugin + ": " + this.text : this.text;
    }
  }
  return Mr = e, e.default = e, Mr;
}
var Rr, An;
function Li() {
  if (An) return Rr;
  An = 1;
  let e = uo();
  class t {
    constructor(n, i, s) {
      this.processor = n, this.messages = [], this.root = i, this.opts = s, this.css = void 0, this.map = void 0;
    }
    toString() {
      return this.css;
    }
    warn(n, i = {}) {
      i.plugin || this.lastPlugin && this.lastPlugin.postcssPlugin && (i.plugin = this.lastPlugin.postcssPlugin);
      let s = new e(n, i);
      return this.messages.push(s), s;
    }
    warnings() {
      return this.messages.filter((n) => n.type === "warning");
    }
    get content() {
      return this.css;
    }
  }
  return Rr = t, t.default = t, Rr;
}
var Or, Ln;
function Tc() {
  if (Ln) return Or;
  Ln = 1;
  const e = 39, t = 34, r = 92, n = 47, i = 10, s = 32, c = 12, h = 9, o = 13, p = 91, a = 93, d = 40, u = 41, l = 123, m = 125, f = 59, g = 42, x = 58, y = 64, w = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, v = /.[\r\n"'(/\\]/, b = /[\da-f]/i;
  return Or = function(E, O = {}) {
    let M = E.css.valueOf(), D = O.ignoreErrors, N, C, oe, te, G, q, K, ee, Y, j, ye = M.length, R = 0, be = [], de = [];
    function Le() {
      return R;
    }
    function ae(I) {
      throw E.error("Unclosed " + I, R);
    }
    function ve() {
      return de.length === 0 && R >= ye;
    }
    function Ae(I) {
      if (de.length) return de.pop();
      if (R >= ye) return;
      let _ = I ? I.ignoreUnclosed : !1;
      switch (N = M.charCodeAt(R), N) {
        case i:
        case s:
        case h:
        case o:
        case c: {
          C = R;
          do
            C += 1, N = M.charCodeAt(C);
          while (N === s || N === i || N === h || N === o || N === c);
          j = ["space", M.slice(R, C)], R = C - 1;
          break;
        }
        case p:
        case a:
        case l:
        case m:
        case x:
        case f:
        case u: {
          let A = String.fromCharCode(N);
          j = [A, A, R];
          break;
        }
        case d: {
          if (ee = be.length ? be.pop()[1] : "", Y = M.charCodeAt(R + 1), ee === "url" && Y !== e && Y !== t && Y !== s && Y !== i && Y !== h && Y !== c && Y !== o) {
            C = R;
            do {
              if (q = !1, C = M.indexOf(")", C + 1), C === -1)
                if (D || _) {
                  C = R;
                  break;
                } else
                  ae("bracket");
              for (K = C; M.charCodeAt(K - 1) === r; )
                K -= 1, q = !q;
            } while (q);
            j = ["brackets", M.slice(R, C + 1), R, C], R = C;
          } else
            C = M.indexOf(")", R + 1), te = M.slice(R, C + 1), C === -1 || v.test(te) ? j = ["(", "(", R] : (j = ["brackets", te, R, C], R = C);
          break;
        }
        case e:
        case t: {
          oe = N === e ? "'" : '"', C = R;
          do {
            if (q = !1, C = M.indexOf(oe, C + 1), C === -1)
              if (D || _) {
                C = R + 1;
                break;
              } else
                ae("string");
            for (K = C; M.charCodeAt(K - 1) === r; )
              K -= 1, q = !q;
          } while (q);
          j = ["string", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case y: {
          w.lastIndex = R + 1, w.test(M), w.lastIndex === 0 ? C = M.length - 1 : C = w.lastIndex - 2, j = ["at-word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case r: {
          for (C = R, G = !0; M.charCodeAt(C + 1) === r; )
            C += 1, G = !G;
          if (N = M.charCodeAt(C + 1), G && N !== n && N !== s && N !== i && N !== h && N !== o && N !== c && (C += 1, b.test(M.charAt(C)))) {
            for (; b.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          j = ["word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        default: {
          N === n && M.charCodeAt(R + 1) === g ? (C = M.indexOf("*/", R + 2) + 1, C === 0 && (D || _ ? C = M.length : ae("comment")), j = ["comment", M.slice(R, C + 1), R, C], R = C) : (S.lastIndex = R + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, j = ["word", M.slice(R, C + 1), R, C], be.push(j), R = C);
          break;
        }
      }
      return R++, j;
    }
    function P(I) {
      de.push(I);
    }
    return {
      back: P,
      endOfFile: ve,
      nextToken: Ae,
      position: Le
    };
  }, Or;
}
var Ir, Pn;
function Pi() {
  if (Pn) return Ir;
  Pn = 1;
  let e = Ye();
  class t extends e {
    constructor(n) {
      super(n), this.type = "atrule";
    }
    append(...n) {
      return this.proxyOf.nodes || (this.nodes = []), super.append(...n);
    }
    prepend(...n) {
      return this.proxyOf.nodes || (this.nodes = []), super.prepend(...n);
    }
  }
  return Ir = t, t.default = t, e.registerAtRule(t), Ir;
}
var Ar, Tn;
function yt() {
  if (Tn) return Ar;
  Tn = 1;
  let e = Ye(), t, r;
  class n extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, c, h) {
      let o = super.normalize(s);
      if (c) {
        if (h === "prepend")
          this.nodes.length > 1 ? c.raws.before = this.nodes[1].raws.before : delete c.raws.before;
        else if (this.first !== c)
          for (let p of o)
            p.raws.before = c.raws.before;
      }
      return o;
    }
    removeChild(s, c) {
      let h = this.index(s);
      return !c && h === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[h].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return n.registerLazyResult = (i) => {
    t = i;
  }, n.registerProcessor = (i) => {
    r = i;
  }, Ar = n, n.default = n, e.registerRoot(n), Ar;
}
var Lr, Nn;
function ho() {
  if (Nn) return Lr;
  Nn = 1;
  let e = {
    comma(t) {
      return e.split(t, [","], !0);
    },
    space(t) {
      let r = [" ", `
`, "	"];
      return e.split(t, r);
    },
    split(t, r, n) {
      let i = [], s = "", c = !1, h = 0, o = !1, p = "", a = !1;
      for (let d of t)
        a ? a = !1 : d === "\\" ? a = !0 : o ? d === p && (o = !1) : d === '"' || d === "'" ? (o = !0, p = d) : d === "(" ? h += 1 : d === ")" ? h > 0 && (h -= 1) : h === 0 && r.includes(d) && (c = !0), c ? (s !== "" && i.push(s.trim()), s = "", c = !1) : s += d;
      return (n || s !== "") && i.push(s.trim()), i;
    }
  };
  return Lr = e, e.default = e, Lr;
}
var Pr, _n;
function Ti() {
  if (_n) return Pr;
  _n = 1;
  let e = Ye(), t = ho();
  class r extends e {
    constructor(i) {
      super(i), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(i) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, c = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = i.join(c);
    }
  }
  return Pr = r, r.default = r, e.registerRule(r), Pr;
}
var Tr, $n;
function Nc() {
  if ($n) return Tr;
  $n = 1;
  let e = Kt(), t = Tc(), r = Qt(), n = Pi(), i = yt(), s = Ti();
  const c = {
    empty: !0,
    space: !0
  };
  function h(p) {
    for (let a = p.length - 1; a >= 0; a--) {
      let d = p[a], u = d[3] || d[2];
      if (u) return u;
    }
  }
  class o {
    constructor(a) {
      this.input = a, this.root = new i(), this.current = this.root, this.spaces = "", this.semicolon = !1, this.createTokenizer(), this.root.source = { input: a, start: { column: 1, line: 1, offset: 0 } };
    }
    atrule(a) {
      let d = new n();
      d.name = a[1].slice(1), d.name === "" && this.unnamedAtrule(d, a), this.init(d, a[2]);
      let u, l, m, f = !1, g = !1, x = [], y = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? y.push(u === "(" ? ")" : "]") : u === "{" && y.length > 0 ? y.push("}") : u === y[y.length - 1] && y.pop(), y.length === 0)
          if (u === ";") {
            d.source.end = this.getPosition(a[2]), d.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, l = x[m]; l && l[0] === "space"; )
                l = x[--m];
              l && (d.source.end = this.getPosition(l[3] || l[2]), d.source.end.offset++);
            }
            this.end(a);
            break;
          } else
            x.push(a);
        else
          x.push(a);
        if (this.tokenizer.endOfFile()) {
          f = !0;
          break;
        }
      }
      d.raws.between = this.spacesAndCommentsFromEnd(x), x.length ? (d.raws.afterName = this.spacesAndCommentsFromStart(x), this.raw(d, "params", x), f && (a = x[x.length - 1], d.source.end = this.getPosition(a[3] || a[2]), d.source.end.offset++, this.spaces = d.raws.between, d.raws.between = "")) : (d.raws.afterName = "", d.params = ""), g && (d.nodes = [], this.current = d);
    }
    checkMissedSemicolon(a) {
      let d = this.colon(a);
      if (d === !1) return;
      let u = 0, l;
      for (let m = d - 1; m >= 0 && (l = a[m], !(l[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        l[0] === "word" ? l[3] + 1 : l[2]
      );
    }
    colon(a) {
      let d = 0, u, l, m;
      for (let [f, g] of a.entries()) {
        if (u = g, l = u[0], l === "(" && (d += 1), l === ")" && (d -= 1), d === 0 && l === ":")
          if (!m)
            this.doubleColon(u);
          else {
            if (m[0] === "word" && m[1] === "progid")
              continue;
            return f;
          }
        m = u;
      }
      return !1;
    }
    comment(a) {
      let d = new r();
      this.init(d, a[2]), d.source.end = this.getPosition(a[3] || a[2]), d.source.end.offset++;
      let u = a[1].slice(2, -2);
      if (/^\s*$/.test(u))
        d.text = "", d.raws.left = u, d.raws.right = "";
      else {
        let l = u.match(/^(\s*)([^]*\S)(\s*)$/);
        d.text = l[2], d.raws.left = l[1], d.raws.right = l[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, d) {
      let u = new e();
      this.init(u, a[0][2]);
      let l = a[a.length - 1];
      for (l[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        l[3] || l[2] || h(a)
      ), u.source.end.offset++; a[0][0] !== "word"; )
        a.length === 1 && this.unknownWord(a), u.raws.before += a.shift()[1];
      for (u.source.start = this.getPosition(a[0][2]), u.prop = ""; a.length; ) {
        let y = a[0][0];
        if (y === ":" || y === "space" || y === "comment")
          break;
        u.prop += a.shift()[1];
      }
      u.raws.between = "";
      let m;
      for (; a.length; )
        if (m = a.shift(), m[0] === ":") {
          u.raws.between += m[1];
          break;
        } else
          m[0] === "word" && /\w/.test(m[1]) && this.unknownWord([m]), u.raws.between += m[1];
      (u.prop[0] === "_" || u.prop[0] === "*") && (u.raws.before += u.prop[0], u.prop = u.prop.slice(1));
      let f = [], g;
      for (; a.length && (g = a[0][0], !(g !== "space" && g !== "comment")); )
        f.push(a.shift());
      this.precheckMissedSemicolon(a);
      for (let y = a.length - 1; y >= 0; y--) {
        if (m = a[y], m[1].toLowerCase() === "!important") {
          u.important = !0;
          let w = this.stringFrom(a, y);
          w = this.spacesFromEnd(a) + w, w !== " !important" && (u.raws.important = w);
          break;
        } else if (m[1].toLowerCase() === "important") {
          let w = a.slice(0), S = "";
          for (let v = y; v > 0; v--) {
            let b = w[v][0];
            if (S.trim().indexOf("!") === 0 && b !== "space")
              break;
            S = w.pop()[1] + S;
          }
          S.trim().indexOf("!") === 0 && (u.important = !0, u.raws.important = S, a = w);
        }
        if (m[0] !== "space" && m[0] !== "comment")
          break;
      }
      a.some((y) => y[0] !== "space" && y[0] !== "comment") && (u.raws.between += f.map((y) => y[1]).join(""), f = []), this.raw(u, "value", f.concat(a), d), u.value.includes(":") && !d && this.checkMissedSemicolon(a);
    }
    doubleColon(a) {
      throw this.input.error(
        "Double colon",
        { offset: a[2] },
        { offset: a[2] + a[1].length }
      );
    }
    emptyRule(a) {
      let d = new s();
      this.init(d, a[2]), d.selector = "", d.raws.between = "", this.current = d;
    }
    end(a) {
      this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.semicolon = !1, this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.spaces = "", this.current.parent ? (this.current.source.end = this.getPosition(a[2]), this.current.source.end.offset++, this.current = this.current.parent) : this.unexpectedClose(a);
    }
    endFile() {
      this.current.parent && this.unclosedBlock(), this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.root.source.end = this.getPosition(this.tokenizer.position());
    }
    freeSemicolon(a) {
      if (this.spaces += a[1], this.current.nodes) {
        let d = this.current.nodes[this.current.nodes.length - 1];
        d && d.type === "rule" && !d.raws.ownSemicolon && (d.raws.ownSemicolon = this.spaces, this.spaces = "");
      }
    }
    // Helpers
    getPosition(a) {
      let d = this.input.fromOffset(a);
      return {
        column: d.col,
        line: d.line,
        offset: a
      };
    }
    init(a, d) {
      this.current.push(a), a.source = {
        input: this.input,
        start: this.getPosition(d)
      }, a.raws.before = this.spaces, this.spaces = "", a.type !== "comment" && (this.semicolon = !1);
    }
    other(a) {
      let d = !1, u = null, l = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], y = a;
      for (; y; ) {
        if (u = y[0], x.push(y), u === "(" || u === "[")
          m || (m = y), f.push(u === "(" ? ")" : "]");
        else if (g && l && u === "{")
          m || (m = y), f.push("}");
        else if (f.length === 0)
          if (u === ";")
            if (l) {
              this.decl(x, g);
              return;
            } else
              break;
          else if (u === "{") {
            this.rule(x);
            return;
          } else if (u === "}") {
            this.tokenizer.back(x.pop()), d = !0;
            break;
          } else u === ":" && (l = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        y = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (d = !0), f.length > 0 && this.unclosedBracket(m), d && l) {
        if (!g)
          for (; x.length && (y = x[x.length - 1][0], !(y !== "space" && y !== "comment")); )
            this.tokenizer.back(x.pop());
        this.decl(x, g);
      } else
        this.unknownWord(x);
    }
    parse() {
      let a;
      for (; !this.tokenizer.endOfFile(); )
        switch (a = this.tokenizer.nextToken(), a[0]) {
          case "space":
            this.spaces += a[1];
            break;
          case ";":
            this.freeSemicolon(a);
            break;
          case "}":
            this.end(a);
            break;
          case "comment":
            this.comment(a);
            break;
          case "at-word":
            this.atrule(a);
            break;
          case "{":
            this.emptyRule(a);
            break;
          default:
            this.other(a);
            break;
        }
      this.endFile();
    }
    precheckMissedSemicolon() {
    }
    raw(a, d, u, l) {
      let m, f, g = u.length, x = "", y = !0, w, S;
      for (let v = 0; v < g; v += 1)
        m = u[v], f = m[0], f === "space" && v === g - 1 && !l ? y = !1 : f === "comment" ? (S = u[v - 1] ? u[v - 1][0] : "empty", w = u[v + 1] ? u[v + 1][0] : "empty", !c[S] && !c[w] ? x.slice(-1) === "," ? y = !1 : x += m[1] : y = !1) : x += m[1];
      if (!y) {
        let v = u.reduce((b, k) => b + k[1], "");
        a.raws[d] = { raw: v, value: x };
      }
      a[d] = x;
    }
    rule(a) {
      a.pop();
      let d = new s();
      this.init(d, a[0][2]), d.raws.between = this.spacesAndCommentsFromEnd(a), this.raw(d, "selector", a), this.current = d;
    }
    spacesAndCommentsFromEnd(a) {
      let d, u = "";
      for (; a.length && (d = a[a.length - 1][0], !(d !== "space" && d !== "comment")); )
        u = a.pop()[1] + u;
      return u;
    }
    // Errors
    spacesAndCommentsFromStart(a) {
      let d, u = "";
      for (; a.length && (d = a[0][0], !(d !== "space" && d !== "comment")); )
        u += a.shift()[1];
      return u;
    }
    spacesFromEnd(a) {
      let d, u = "";
      for (; a.length && (d = a[a.length - 1][0], d === "space"); )
        u = a.pop()[1] + u;
      return u;
    }
    stringFrom(a, d) {
      let u = "";
      for (let l = d; l < a.length; l++)
        u += a[l][1];
      return a.splice(d, a.length - d), u;
    }
    unclosedBlock() {
      let a = this.current.source.start;
      throw this.input.error("Unclosed block", a.line, a.column);
    }
    unclosedBracket(a) {
      throw this.input.error(
        "Unclosed bracket",
        { offset: a[2] },
        { offset: a[2] + 1 }
      );
    }
    unexpectedClose(a) {
      throw this.input.error(
        "Unexpected }",
        { offset: a[2] },
        { offset: a[2] + 1 }
      );
    }
    unknownWord(a) {
      throw this.input.error(
        "Unknown word",
        { offset: a[0][2] },
        { offset: a[0][2] + a[0][1].length }
      );
    }
    unnamedAtrule(a, d) {
      throw this.input.error(
        "At-rule without name",
        { offset: d[2] },
        { offset: d[2] + d[1].length }
      );
    }
  }
  return Tr = o, Tr;
}
var Nr, Dn;
function Ni() {
  if (Dn) return Nr;
  Dn = 1;
  let e = Ye(), t = Nc(), r = Zt();
  function n(i, s) {
    let c = new r(i, s), h = new t(c);
    try {
      h.parse();
    } catch (o) {
      throw process.env.NODE_ENV !== "production" && o.name === "CssSyntaxError" && s && s.from && (/\.scss$/i.test(s.from) ? o.message += `
You tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser` : /\.sass/i.test(s.from) ? o.message += `
You tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser` : /\.less$/i.test(s.from) && (o.message += `
You tried to parse Less with the standard CSS parser; try again with the postcss-less parser`)), o;
    }
    return h.root;
  }
  return Nr = n, n.default = n, e.registerParse(n), Nr;
}
var _r, zn;
function po() {
  if (zn) return _r;
  zn = 1;
  let { isClean: e, my: t } = Ii(), r = lo(), n = Jt(), i = Ye(), s = Ai(), c = co(), h = Li(), o = Ni(), p = yt();
  const a = {
    atrule: "AtRule",
    comment: "Comment",
    decl: "Declaration",
    document: "Document",
    root: "Root",
    rule: "Rule"
  }, d = {
    AtRule: !0,
    AtRuleExit: !0,
    Comment: !0,
    CommentExit: !0,
    Declaration: !0,
    DeclarationExit: !0,
    Document: !0,
    DocumentExit: !0,
    Once: !0,
    OnceExit: !0,
    postcssPlugin: !0,
    prepare: !0,
    Root: !0,
    RootExit: !0,
    Rule: !0,
    RuleExit: !0
  }, u = {
    Once: !0,
    postcssPlugin: !0,
    prepare: !0
  }, l = 0;
  function m(S) {
    return typeof S == "object" && typeof S.then == "function";
  }
  function f(S) {
    let v = !1, b = a[S.type];
    return S.type === "decl" ? v = S.prop.toLowerCase() : S.type === "atrule" && (v = S.name.toLowerCase()), v && S.append ? [
      b,
      b + "-" + v,
      l,
      b + "Exit",
      b + "Exit-" + v
    ] : v ? [b, b + "-" + v, b + "Exit", b + "Exit-" + v] : S.append ? [b, l, b + "Exit"] : [b, b + "Exit"];
  }
  function g(S) {
    let v;
    return S.type === "document" ? v = ["Document", l, "DocumentExit"] : S.type === "root" ? v = ["Root", l, "RootExit"] : v = f(S), {
      eventIndex: 0,
      events: v,
      iterator: 0,
      node: S,
      visitorIndex: 0,
      visitors: []
    };
  }
  function x(S) {
    return S[e] = !1, S.nodes && S.nodes.forEach((v) => x(v)), S;
  }
  let y = {};
  class w {
    constructor(v, b, k) {
      this.stringified = !1, this.processed = !1;
      let E;
      if (typeof b == "object" && b !== null && (b.type === "root" || b.type === "document"))
        E = x(b);
      else if (b instanceof w || b instanceof h)
        E = x(b.root), b.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = b.map);
      else {
        let O = o;
        k.syntax && (O = k.syntax.parse), k.parser && (O = k.parser), O.parse && (O = O.parse);
        try {
          E = O(b, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && i.rebuild(E);
      }
      this.result = new h(v, E, k), this.helpers = { ...y, postcss: y, result: this.result }, this.plugins = this.processor.plugins.map((O) => typeof O == "object" && O.prepare ? { ...O, ...O.prepare(this.result) } : O);
    }
    async() {
      return this.error ? Promise.reject(this.error) : this.processed ? Promise.resolve(this.result) : (this.processing || (this.processing = this.runAsync()), this.processing);
    }
    catch(v) {
      return this.async().catch(v);
    }
    finally(v) {
      return this.async().then(v, v);
    }
    getAsyncError() {
      throw new Error("Use process(css).then(cb) to work with async plugins");
    }
    handleError(v, b) {
      let k = this.result.lastPlugin;
      try {
        if (b && b.addToError(v), this.error = v, v.name === "CssSyntaxError" && !v.plugin)
          v.plugin = k.postcssPlugin, v.setMessage();
        else if (k.postcssVersion && process.env.NODE_ENV !== "production") {
          let E = k.postcssPlugin, O = k.postcssVersion, M = this.result.processor.version, D = O.split("."), N = M.split(".");
          (D[0] !== N[0] || parseInt(D[1]) > parseInt(N[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + O + ". Perhaps this is the source of the error below."
          );
        }
      } catch (E) {
        console && console.error && console.error(E);
      }
      return v;
    }
    prepareVisitors() {
      this.listeners = {};
      let v = (b, k, E) => {
        this.listeners[k] || (this.listeners[k] = []), this.listeners[k].push([b, E]);
      };
      for (let b of this.plugins)
        if (typeof b == "object")
          for (let k in b) {
            if (!d[k] && /^[A-Z]/.test(k))
              throw new Error(
                `Unknown event ${k} in ${b.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
              );
            if (!u[k])
              if (typeof b[k] == "object")
                for (let E in b[k])
                  E === "*" ? v(b, k, b[k][E]) : v(
                    b,
                    k + "-" + E.toLowerCase(),
                    b[k][E]
                  );
              else typeof b[k] == "function" && v(b, k, b[k]);
          }
      this.hasListener = Object.keys(this.listeners).length > 0;
    }
    async runAsync() {
      this.plugin = 0;
      for (let v = 0; v < this.plugins.length; v++) {
        let b = this.plugins[v], k = this.runOnRoot(b);
        if (m(k))
          try {
            await k;
          } catch (E) {
            throw this.handleError(E);
          }
      }
      if (this.prepareVisitors(), this.hasListener) {
        let v = this.result.root;
        for (; !v[e]; ) {
          v[e] = !0;
          let b = [g(v)];
          for (; b.length > 0; ) {
            let k = this.visitTick(b);
            if (m(k))
              try {
                await k;
              } catch (E) {
                let O = b[b.length - 1].node;
                throw this.handleError(E, O);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [b, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = b;
            try {
              if (v.type === "document") {
                let E = v.nodes.map(
                  (O) => k(O, this.helpers)
                );
                await Promise.all(E);
              } else
                await k(v, this.helpers);
            } catch (E) {
              throw this.handleError(E);
            }
          }
      }
      return this.processed = !0, this.stringify();
    }
    runOnRoot(v) {
      this.result.lastPlugin = v;
      try {
        if (typeof v == "object" && v.Once) {
          if (this.result.root.type === "document") {
            let b = this.result.root.nodes.map(
              (k) => v.Once(k, this.helpers)
            );
            return m(b[0]) ? Promise.all(b) : b;
          }
          return v.Once(this.result.root, this.helpers);
        } else if (typeof v == "function")
          return v(this.result.root, this.result);
      } catch (b) {
        throw this.handleError(b);
      }
    }
    stringify() {
      if (this.error) throw this.error;
      if (this.stringified) return this.result;
      this.stringified = !0, this.sync();
      let v = this.result.opts, b = n;
      v.syntax && (b = v.syntax.stringify), v.stringifier && (b = v.stringifier), b.stringify && (b = b.stringify);
      let E = new r(b, this.result.root, this.result.opts).generate();
      return this.result.css = E[0], this.result.map = E[1], this.result;
    }
    sync() {
      if (this.error) throw this.error;
      if (this.processed) return this.result;
      if (this.processed = !0, this.processing)
        throw this.getAsyncError();
      for (let v of this.plugins) {
        let b = this.runOnRoot(v);
        if (m(b))
          throw this.getAsyncError();
      }
      if (this.prepareVisitors(), this.hasListener) {
        let v = this.result.root;
        for (; !v[e]; )
          v[e] = !0, this.walkSync(v);
        if (this.listeners.OnceExit)
          if (v.type === "document")
            for (let b of v.nodes)
              this.visitSync(this.listeners.OnceExit, b);
          else
            this.visitSync(this.listeners.OnceExit, v);
      }
      return this.result;
    }
    then(v, b) {
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || c(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(v, b);
    }
    toString() {
      return this.css;
    }
    visitSync(v, b) {
      for (let [k, E] of v) {
        this.result.lastPlugin = k;
        let O;
        try {
          O = E(b, this.helpers);
        } catch (M) {
          throw this.handleError(M, b.proxyOf);
        }
        if (b.type !== "root" && b.type !== "document" && !b.parent)
          return !0;
        if (m(O))
          throw this.getAsyncError();
      }
    }
    visitTick(v) {
      let b = v[v.length - 1], { node: k, visitors: E } = b;
      if (k.type !== "root" && k.type !== "document" && !k.parent) {
        v.pop();
        return;
      }
      if (E.length > 0 && b.visitorIndex < E.length) {
        let [M, D] = E[b.visitorIndex];
        b.visitorIndex += 1, b.visitorIndex === E.length && (b.visitors = [], b.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return D(k.toProxy(), this.helpers);
        } catch (N) {
          throw this.handleError(N, k);
        }
      }
      if (b.iterator !== 0) {
        let M = b.iterator, D;
        for (; D = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !D[e]) {
            D[e] = !0, v.push(g(D));
            return;
          }
        b.iterator = 0, delete k.indexes[M];
      }
      let O = b.events;
      for (; b.eventIndex < O.length; ) {
        let M = O[b.eventIndex];
        if (b.eventIndex += 1, M === l) {
          k.nodes && k.nodes.length && (k[e] = !0, b.iterator = k.getIterator());
          return;
        } else if (this.listeners[M]) {
          b.visitors = this.listeners[M];
          return;
        }
      }
      v.pop();
    }
    walkSync(v) {
      v[e] = !0;
      let b = f(v);
      for (let k of b)
        if (k === l)
          v.nodes && v.each((E) => {
            E[e] || this.walkSync(E);
          });
        else {
          let E = this.listeners[k];
          if (E && this.visitSync(E, v.toProxy()))
            return;
        }
    }
    warnings() {
      return this.sync().warnings();
    }
    get content() {
      return this.stringify().content;
    }
    get css() {
      return this.stringify().css;
    }
    get map() {
      return this.stringify().map;
    }
    get messages() {
      return this.sync().messages;
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      return this.sync().root;
    }
    get [Symbol.toStringTag]() {
      return "LazyResult";
    }
  }
  return w.registerPostcss = (S) => {
    y = S;
  }, _r = w, w.default = w, p.registerLazyResult(w), s.registerLazyResult(w), _r;
}
var $r, Fn;
function _c() {
  if (Fn) return $r;
  Fn = 1;
  let e = lo(), t = Jt(), r = co(), n = Ni();
  const i = Li();
  class s {
    constructor(h, o, p) {
      o = o.toString(), this.stringified = !1, this._processor = h, this._css = o, this._opts = p, this._map = void 0;
      let a, d = t;
      this.result = new i(this._processor, a, this._opts), this.result.css = o;
      let u = this;
      Object.defineProperty(this.result, "root", {
        get() {
          return u.root;
        }
      });
      let l = new e(d, a, this._opts, o);
      if (l.isMap()) {
        let [m, f] = l.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        l.clearAnnotation(), this.result.css = l.css;
    }
    async() {
      return this.error ? Promise.reject(this.error) : Promise.resolve(this.result);
    }
    catch(h) {
      return this.async().catch(h);
    }
    finally(h) {
      return this.async().then(h, h);
    }
    sync() {
      if (this.error) throw this.error;
      return this.result;
    }
    then(h, o) {
      return process.env.NODE_ENV !== "production" && ("from" in this._opts || r(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(h, o);
    }
    toString() {
      return this._css;
    }
    warnings() {
      return [];
    }
    get content() {
      return this.result.css;
    }
    get css() {
      return this.result.css;
    }
    get map() {
      return this.result.map;
    }
    get messages() {
      return [];
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      if (this._root)
        return this._root;
      let h, o = n;
      try {
        h = o(this._css, this._opts);
      } catch (p) {
        this.error = p;
      }
      if (this.error)
        throw this.error;
      return this._root = h, h;
    }
    get [Symbol.toStringTag]() {
      return "NoWorkResult";
    }
  }
  return $r = s, s.default = s, $r;
}
var Dr, Un;
function $c() {
  if (Un) return Dr;
  Un = 1;
  let e = _c(), t = po(), r = Ai(), n = yt();
  class i {
    constructor(c = []) {
      this.version = "8.4.38", this.plugins = this.normalize(c);
    }
    normalize(c) {
      let h = [];
      for (let o of c)
        if (o.postcss === !0 ? o = o() : o.postcss && (o = o.postcss), typeof o == "object" && Array.isArray(o.plugins))
          h = h.concat(o.plugins);
        else if (typeof o == "object" && o.postcssPlugin)
          h.push(o);
        else if (typeof o == "function")
          h.push(o);
        else if (typeof o == "object" && (o.parse || o.stringify)) {
          if (process.env.NODE_ENV !== "production")
            throw new Error(
              "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
            );
        } else
          throw new Error(o + " is not a PostCSS plugin");
      return h;
    }
    process(c, h = {}) {
      return !this.plugins.length && !h.parser && !h.stringifier && !h.syntax ? new e(this, c, h) : new t(this, c, h);
    }
    use(c) {
      return this.plugins = this.plugins.concat(this.normalize([c])), this;
    }
  }
  return Dr = i, i.default = i, n.registerProcessor(i), r.registerProcessor(i), Dr;
}
var zr, Bn;
function Dc() {
  if (Bn) return zr;
  Bn = 1;
  let e = Kt(), t = ao(), r = Qt(), n = Pi(), i = Zt(), s = yt(), c = Ti();
  function h(o, p) {
    if (Array.isArray(o)) return o.map((u) => h(u));
    let { inputs: a, ...d } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let l = { ...u, __proto__: i.prototype };
        l.map && (l.map = {
          ...l.map,
          __proto__: t.prototype
        }), p.push(l);
      }
    }
    if (d.nodes && (d.nodes = o.nodes.map((u) => h(u, p))), d.source) {
      let { inputId: u, ...l } = d.source;
      d.source = l, u != null && (d.source.input = p[u]);
    }
    if (d.type === "root")
      return new s(d);
    if (d.type === "decl")
      return new e(d);
    if (d.type === "rule")
      return new c(d);
    if (d.type === "comment")
      return new r(d);
    if (d.type === "atrule")
      return new n(d);
    throw new Error("Unknown node type: " + o.type);
  }
  return zr = h, h.default = h, zr;
}
var Fr, Wn;
function zc() {
  if (Wn) return Fr;
  Wn = 1;
  let e = Oi(), t = Kt(), r = po(), n = Ye(), i = $c(), s = Jt(), c = Dc(), h = Ai(), o = uo(), p = Qt(), a = Pi(), d = Li(), u = Zt(), l = Ni(), m = ho(), f = Ti(), g = yt(), x = Xt();
  function y(...w) {
    return w.length === 1 && Array.isArray(w[0]) && (w = w[0]), new i(w);
  }
  return y.plugin = function(S, v) {
    let b = !1;
    function k(...O) {
      console && console.warn && !b && (b = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = v(...O);
      return M.postcssPlugin = S, M.postcssVersion = new i().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(O, M, D) {
      return y([k(D)]).process(O, M);
    }, k;
  }, y.stringify = s, y.parse = l, y.fromJSON = c, y.list = m, y.comment = (w) => new p(w), y.atRule = (w) => new a(w), y.decl = (w) => new t(w), y.rule = (w) => new f(w), y.root = (w) => new g(w), y.document = (w) => new h(w), y.CssSyntaxError = e, y.Declaration = t, y.Container = n, y.Processor = i, y.Document = h, y.Comment = p, y.Warning = o, y.AtRule = a, y.Result = d, y.Input = u, y.Rule = f, y.Root = g, y.Node = x, r.registerPostcss(y), Fr = y, y.default = y, Fr;
}
var Fc = zc();
const Z = /* @__PURE__ */ Rc(Fc);
Z.stringify;
Z.fromJSON;
Z.plugin;
Z.parse;
Z.list;
Z.document;
Z.comment;
Z.atRule;
Z.rule;
Z.decl;
Z.root;
Z.CssSyntaxError;
Z.Declaration;
Z.Container;
Z.Processor;
Z.Document;
Z.Comment;
Z.Warning;
Z.AtRule;
Z.Result;
Z.Input;
Z.Rule;
Z.Root;
Z.Node;
var Uc = Object.defineProperty, Bc = (e, t, r) => t in e ? Uc(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, Ee = (e, t, r) => Bc(e, typeof t != "symbol" ? t + "" : t, r);
Date.now().toString();
function Wc(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function qc(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var r = function n() {
      return this instanceof n ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    r.prototype = t.prototype;
  } else r = {};
  return Object.defineProperty(r, "__esModule", { value: !0 }), Object.keys(e).forEach(function(n) {
    var i = Object.getOwnPropertyDescriptor(e, n);
    Object.defineProperty(r, n, i.get ? i : {
      enumerable: !0,
      get: function() {
        return e[n];
      }
    });
  }), r;
}
var Ot = { exports: {} }, qn;
function jc() {
  if (qn) return Ot.exports;
  qn = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return Ot.exports = t(), Ot.exports.createColors = t, Ot.exports;
}
const Hc = {}, Vc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Hc
}, Symbol.toStringTag, { value: "Module" })), Ie = /* @__PURE__ */ qc(Vc);
var Ur, jn;
function _i() {
  if (jn) return Ur;
  jn = 1;
  let e = /* @__PURE__ */ jc(), t = Ie;
  class r extends Error {
    constructor(i, s, c, h, o, p) {
      super(i), this.name = "CssSyntaxError", this.reason = i, o && (this.file = o), h && (this.source = h), p && (this.plugin = p), typeof s < "u" && typeof c < "u" && (typeof s == "number" ? (this.line = s, this.column = c) : (this.line = s.line, this.column = s.column, this.endLine = c.line, this.endColumn = c.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(i) {
      if (!this.source) return "";
      let s = this.source;
      i == null && (i = e.isColorSupported), t && i && (s = t(s));
      let c = s.split(/\r?\n/), h = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, c.length), p = String(o).length, a, d;
      if (i) {
        let { bold: u, gray: l, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), d = (f) => l(f);
      } else
        a = d = (u) => u;
      return c.slice(h, o).map((u, l) => {
        let m = h + 1 + l, f = " " + (" " + m).slice(-p) + " | ";
        if (m === this.line) {
          let g = d(f.replace(/\d/g, " ")) + u.slice(0, this.column - 1).replace(/[^\t]/g, " ");
          return a(">") + d(f) + u + `
 ` + g + a("^");
        }
        return " " + d(f) + u;
      }).join(`
`);
    }
    toString() {
      let i = this.showSourceCode();
      return i && (i = `

` + i + `
`), this.name + ": " + this.message + i;
    }
  }
  return Ur = r, r.default = r, Ur;
}
var It = {}, Hn;
function $i() {
  return Hn || (Hn = 1, It.isClean = Symbol("isClean"), It.my = Symbol("my")), It;
}
var Br, Vn;
function fo() {
  if (Vn) return Br;
  Vn = 1;
  const e = {
    after: `
`,
    beforeClose: `
`,
    beforeComment: `
`,
    beforeDecl: `
`,
    beforeOpen: " ",
    beforeRule: `
`,
    colon: ": ",
    commentLeft: " ",
    commentRight: " ",
    emptyBody: "",
    indent: "    ",
    semicolon: !1
  };
  function t(n) {
    return n[0].toUpperCase() + n.slice(1);
  }
  class r {
    constructor(i) {
      this.builder = i;
    }
    atrule(i, s) {
      let c = "@" + i.name, h = i.params ? this.rawValue(i, "params") : "";
      if (typeof i.raws.afterName < "u" ? c += i.raws.afterName : h && (c += " "), i.nodes)
        this.block(i, c + h);
      else {
        let o = (i.raws.between || "") + (s ? ";" : "");
        this.builder(c + h + o, i);
      }
    }
    beforeAfter(i, s) {
      let c;
      i.type === "decl" ? c = this.raw(i, null, "beforeDecl") : i.type === "comment" ? c = this.raw(i, null, "beforeComment") : s === "before" ? c = this.raw(i, null, "beforeRule") : c = this.raw(i, null, "beforeClose");
      let h = i.parent, o = 0;
      for (; h && h.type !== "root"; )
        o += 1, h = h.parent;
      if (c.includes(`
`)) {
        let p = this.raw(i, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) c += p;
      }
      return c;
    }
    block(i, s) {
      let c = this.raw(i, "between", "beforeOpen");
      this.builder(s + c + "{", i, "start");
      let h;
      i.nodes && i.nodes.length ? (this.body(i), h = this.raw(i, "after")) : h = this.raw(i, "after", "emptyBody"), h && this.builder(h), this.builder("}", i, "end");
    }
    body(i) {
      let s = i.nodes.length - 1;
      for (; s > 0 && i.nodes[s].type === "comment"; )
        s -= 1;
      let c = this.raw(i, "semicolon");
      for (let h = 0; h < i.nodes.length; h++) {
        let o = i.nodes[h], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== h || c);
      }
    }
    comment(i) {
      let s = this.raw(i, "left", "commentLeft"), c = this.raw(i, "right", "commentRight");
      this.builder("/*" + s + i.text + c + "*/", i);
    }
    decl(i, s) {
      let c = this.raw(i, "between", "colon"), h = i.prop + c + this.rawValue(i, "value");
      i.important && (h += i.raws.important || " !important"), s && (h += ";"), this.builder(h, i);
    }
    document(i) {
      this.body(i);
    }
    raw(i, s, c) {
      let h;
      if (c || (c = s), s && (h = i.raws[s], typeof h < "u"))
        return h;
      let o = i.parent;
      if (c === "before" && (!o || o.type === "root" && o.first === i || o && o.type === "document"))
        return "";
      if (!o) return e[c];
      let p = i.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[c] < "u")
        return p.rawCache[c];
      if (c === "before" || c === "after")
        return this.beforeAfter(i, c);
      {
        let a = "raw" + t(c);
        this[a] ? h = this[a](p, i) : p.walk((d) => {
          if (h = d.raws[s], typeof h < "u") return !1;
        });
      }
      return typeof h > "u" && (h = e[c]), p.rawCache[c] = h, h;
    }
    rawBeforeClose(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length > 0 && typeof c.raws.after < "u")
          return s = c.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(i, s) {
      let c;
      return i.walkComments((h) => {
        if (typeof h.raws.before < "u")
          return c = h.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeDecl") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeDecl(i, s) {
      let c;
      return i.walkDecls((h) => {
        if (typeof h.raws.before < "u")
          return c = h.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeRule") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeOpen(i) {
      let s;
      return i.walk((c) => {
        if (c.type !== "decl" && (s = c.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && (c.parent !== i || i.first !== c) && typeof c.raws.before < "u")
          return s = c.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(i) {
      let s;
      return i.walkDecls((c) => {
        if (typeof c.raws.between < "u")
          return s = c.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length === 0 && (s = c.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(i) {
      if (i.raws.indent) return i.raws.indent;
      let s;
      return i.walk((c) => {
        let h = c.parent;
        if (h && h !== i && h.parent && h.parent === i && typeof c.raws.before < "u") {
          let o = c.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(i) {
      let s;
      return i.walk((c) => {
        if (c.nodes && c.nodes.length && c.last.type === "decl" && (s = c.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(i, s) {
      let c = i[s], h = i.raws[s];
      return h && h.value === c ? h.raw : c;
    }
    root(i) {
      this.body(i), i.raws.after && this.builder(i.raws.after);
    }
    rule(i) {
      this.block(i, this.rawValue(i, "selector")), i.raws.ownSemicolon && this.builder(i.raws.ownSemicolon, i, "end");
    }
    stringify(i, s) {
      if (!this[i.type])
        throw new Error(
          "Unknown AST node type " + i.type + ". Maybe you need to change PostCSS stringifier."
        );
      this[i.type](i, s);
    }
  }
  return Br = r, r.default = r, Br;
}
var Wr, Gn;
function er() {
  if (Gn) return Wr;
  Gn = 1;
  let e = fo();
  function t(r, n) {
    new e(n).stringify(r);
  }
  return Wr = t, t.default = t, Wr;
}
var qr, Yn;
function tr() {
  if (Yn) return qr;
  Yn = 1;
  let { isClean: e, my: t } = $i(), r = _i(), n = fo(), i = er();
  function s(h, o) {
    let p = new h.constructor();
    for (let a in h) {
      if (!Object.prototype.hasOwnProperty.call(h, a) || a === "proxyCache") continue;
      let d = h[a], u = typeof d;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = d : Array.isArray(d) ? p[a] = d.map((l) => s(l, p)) : (u === "object" && d !== null && (d = s(d)), p[a] = d);
    }
    return p;
  }
  class c {
    constructor(o = {}) {
      this.raws = {}, this[e] = !1, this[t] = !0;
      for (let p in o)
        if (p === "nodes") {
          this.nodes = [];
          for (let a of o[p])
            typeof a.clone == "function" ? this.append(a.clone()) : this.append(a);
        } else
          this[p] = o[p];
    }
    addToError(o) {
      if (o.postcssNode = this, o.stack && this.source && /\n\s{4}at /.test(o.stack)) {
        let p = this.source;
        o.stack = o.stack.replace(
          /\n\s{4}at /,
          `$&${p.input.from}:${p.start.line}:${p.start.column}$&`
        );
      }
      return o;
    }
    after(o) {
      return this.parent.insertAfter(this, o), this;
    }
    assign(o = {}) {
      for (let p in o)
        this[p] = o[p];
      return this;
    }
    before(o) {
      return this.parent.insertBefore(this, o), this;
    }
    cleanRaws(o) {
      delete this.raws.before, delete this.raws.after, o || delete this.raws.between;
    }
    clone(o = {}) {
      let p = s(this);
      for (let a in o)
        p[a] = o[a];
      return p;
    }
    cloneAfter(o = {}) {
      let p = this.clone(o);
      return this.parent.insertAfter(this, p), p;
    }
    cloneBefore(o = {}) {
      let p = this.clone(o);
      return this.parent.insertBefore(this, p), p;
    }
    error(o, p = {}) {
      if (this.source) {
        let { end: a, start: d } = this.rangeBy(p);
        return this.source.input.error(
          o,
          { column: d.column, line: d.line },
          { column: a.column, line: a.line },
          p
        );
      }
      return new r(o);
    }
    getProxyProcessor() {
      return {
        get(o, p) {
          return p === "proxyOf" ? o : p === "root" ? () => o.root().toProxy() : o[p];
        },
        set(o, p, a) {
          return o[p] === a || (o[p] = a, (p === "prop" || p === "value" || p === "name" || p === "params" || p === "important" || /* c8 ignore next */
          p === "text") && o.markDirty()), !0;
        }
      };
    }
    markDirty() {
      if (this[e]) {
        this[e] = !1;
        let o = this;
        for (; o = o.parent; )
          o[e] = !1;
      }
    }
    next() {
      if (!this.parent) return;
      let o = this.parent.index(this);
      return this.parent.nodes[o + 1];
    }
    positionBy(o, p) {
      let a = this.source.start;
      if (o.index)
        a = this.positionInside(o.index, p);
      else if (o.word) {
        p = this.toString();
        let d = p.indexOf(o.word);
        d !== -1 && (a = this.positionInside(d, p));
      }
      return a;
    }
    positionInside(o, p) {
      let a = p || this.toString(), d = this.source.start.column, u = this.source.start.line;
      for (let l = 0; l < o; l++)
        a[l] === `
` ? (d = 1, u += 1) : d += 1;
      return { column: d, line: u };
    }
    prev() {
      if (!this.parent) return;
      let o = this.parent.index(this);
      return this.parent.nodes[o - 1];
    }
    rangeBy(o) {
      let p = {
        column: this.source.start.column,
        line: this.source.start.line
      }, a = this.source.end ? {
        column: this.source.end.column + 1,
        line: this.source.end.line
      } : {
        column: p.column + 1,
        line: p.line
      };
      if (o.word) {
        let d = this.toString(), u = d.indexOf(o.word);
        u !== -1 && (p = this.positionInside(u, d), a = this.positionInside(u + o.word.length, d));
      } else
        o.start ? p = {
          column: o.start.column,
          line: o.start.line
        } : o.index && (p = this.positionInside(o.index)), o.end ? a = {
          column: o.end.column,
          line: o.end.line
        } : typeof o.endIndex == "number" ? a = this.positionInside(o.endIndex) : o.index && (a = this.positionInside(o.index + 1));
      return (a.line < p.line || a.line === p.line && a.column <= p.column) && (a = { column: p.column + 1, line: p.line }), { end: a, start: p };
    }
    raw(o, p) {
      return new n().raw(this, o, p);
    }
    remove() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }
    replaceWith(...o) {
      if (this.parent) {
        let p = this, a = !1;
        for (let d of o)
          d === this ? a = !0 : a ? (this.parent.insertAfter(p, d), p = d) : this.parent.insertBefore(p, d);
        a || this.remove();
      }
      return this;
    }
    root() {
      let o = this;
      for (; o.parent && o.parent.type !== "document"; )
        o = o.parent;
      return o;
    }
    toJSON(o, p) {
      let a = {}, d = p == null;
      p = p || /* @__PURE__ */ new Map();
      let u = 0;
      for (let l in this) {
        if (!Object.prototype.hasOwnProperty.call(this, l) || l === "parent" || l === "proxyCache") continue;
        let m = this[l];
        if (Array.isArray(m))
          a[l] = m.map((f) => typeof f == "object" && f.toJSON ? f.toJSON(null, p) : f);
        else if (typeof m == "object" && m.toJSON)
          a[l] = m.toJSON(null, p);
        else if (l === "source") {
          let f = p.get(m.input);
          f == null && (f = u, p.set(m.input, u), u++), a[l] = {
            end: m.end,
            inputId: f,
            start: m.start
          };
        } else
          a[l] = m;
      }
      return d && (a.inputs = [...p.keys()].map((l) => l.toJSON())), a;
    }
    toProxy() {
      return this.proxyCache || (this.proxyCache = new Proxy(this, this.getProxyProcessor())), this.proxyCache;
    }
    toString(o = i) {
      o.stringify && (o = o.stringify);
      let p = "";
      return o(this, (a) => {
        p += a;
      }), p;
    }
    warn(o, p, a) {
      let d = { node: this };
      for (let u in a) d[u] = a[u];
      return o.warn(p, d);
    }
    get proxyOf() {
      return this;
    }
  }
  return qr = c, c.default = c, qr;
}
var jr, Jn;
function rr() {
  if (Jn) return jr;
  Jn = 1;
  let e = tr();
  class t extends e {
    constructor(n) {
      n && typeof n.value < "u" && typeof n.value != "string" && (n = { ...n, value: String(n.value) }), super(n), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return jr = t, t.default = t, jr;
}
var Hr, Xn;
function Gc() {
  if (Xn) return Hr;
  Xn = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return Hr = { nanoid: (n = 21) => {
    let i = "", s = n;
    for (; s--; )
      i += e[Math.random() * 64 | 0];
    return i;
  }, customAlphabet: (n, i = 21) => (s = i) => {
    let c = "", h = s;
    for (; h--; )
      c += n[Math.random() * n.length | 0];
    return c;
  } }, Hr;
}
var Vr, Kn;
function mo() {
  if (Kn) return Vr;
  Kn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Ie, { existsSync: r, readFileSync: n } = Ie, { dirname: i, join: s } = Ie;
  function c(o) {
    return Buffer ? Buffer.from(o, "base64").toString() : window.atob(o);
  }
  class h {
    constructor(p, a) {
      if (a.map === !1) return;
      this.loadAnnotation(p), this.inline = this.startWith(this.annotation, "data:");
      let d = a.map ? a.map.prev : void 0, u = this.loadMap(a.from, d);
      !this.mapFile && a.from && (this.mapFile = a.from), this.mapFile && (this.root = i(this.mapFile)), u && (this.text = u);
    }
    consumer() {
      return this.consumerCache || (this.consumerCache = new e(this.text)), this.consumerCache;
    }
    decodeInline(p) {
      let a = /^data:application\/json;charset=utf-?8;base64,/, d = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, l = /^data:application\/json,/;
      if (u.test(p) || l.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || d.test(p))
        return c(p.substr(RegExp.lastMatch.length));
      let m = p.match(/data:application\/json;([^,]+),/)[1];
      throw new Error("Unsupported source map encoding " + m);
    }
    getAnnotationURL(p) {
      return p.replace(/^\/\*\s*# sourceMappingURL=/, "").trim();
    }
    isMap(p) {
      return typeof p != "object" ? !1 : typeof p.mappings == "string" || typeof p._mappings == "string" || Array.isArray(p.sections);
    }
    loadAnnotation(p) {
      let a = p.match(/\/\*\s*# sourceMappingURL=/gm);
      if (!a) return;
      let d = p.lastIndexOf(a.pop()), u = p.indexOf("*/", d);
      d > -1 && u > -1 && (this.annotation = this.getAnnotationURL(p.substring(d, u)));
    }
    loadFile(p) {
      if (this.root = i(p), r(p))
        return this.mapFile = p, n(p, "utf-8").toString().trim();
    }
    loadMap(p, a) {
      if (a === !1) return !1;
      if (a) {
        if (typeof a == "string")
          return a;
        if (typeof a == "function") {
          let d = a(p);
          if (d) {
            let u = this.loadFile(d);
            if (!u)
              throw new Error(
                "Unable to load previous source map: " + d.toString()
              );
            return u;
          }
        } else {
          if (a instanceof e)
            return t.fromSourceMap(a).toString();
          if (a instanceof t)
            return a.toString();
          if (this.isMap(a))
            return JSON.stringify(a);
          throw new Error(
            "Unsupported previous source map format: " + a.toString()
          );
        }
      } else {
        if (this.inline)
          return this.decodeInline(this.annotation);
        if (this.annotation) {
          let d = this.annotation;
          return p && (d = s(i(p), d)), this.loadFile(d);
        }
      }
    }
    startWith(p, a) {
      return p ? p.substr(0, a.length) === a : !1;
    }
    withContent() {
      return !!(this.consumer().sourcesContent && this.consumer().sourcesContent.length > 0);
    }
  }
  return Vr = h, h.default = h, Vr;
}
var Gr, Zn;
function ir() {
  if (Zn) return Gr;
  Zn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Ie, { fileURLToPath: r, pathToFileURL: n } = Ie, { isAbsolute: i, resolve: s } = Ie, { nanoid: c } = /* @__PURE__ */ Gc(), h = Ie, o = _i(), p = mo(), a = Symbol("fromOffsetCache"), d = !!(e && t), u = !!(s && i);
  class l {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || i(g.from) ? this.file = g.from : this.file = s(g.from)), u && d) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let y = x.consumer().file;
          !this.file && y && (this.file = this.mapResolve(y));
        }
      }
      this.file || (this.id = "<input css " + c(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, y = {}) {
      let w, S, v;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let O = this.fromOffset(k.offset);
          g = O.line, x = O.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let O = this.fromOffset(E.offset);
          S = O.line, v = O.col;
        } else
          S = E.line, v = E.column;
      } else if (!x) {
        let k = this.fromOffset(g);
        g = k.line, x = k.col;
      }
      let b = this.origin(g, x, S, v);
      return b ? w = new o(
        f,
        b.endLine === void 0 ? b.line : { column: b.column, line: b.line },
        b.endLine === void 0 ? b.column : { column: b.endColumn, line: b.endLine },
        b.source,
        b.file,
        y.plugin
      ) : w = new o(
        f,
        S === void 0 ? g : { column: x, line: g },
        S === void 0 ? x : { column: v, line: S },
        this.css,
        this.file,
        y.plugin
      ), w.input = { column: x, endColumn: v, endLine: S, line: g, source: this.css }, this.file && (n && (w.input.url = n(this.file).toString()), w.input.file = this.file), w;
    }
    fromOffset(f) {
      let g, x;
      if (this[a])
        x = this[a];
      else {
        let w = this.css.split(`
`);
        x = new Array(w.length);
        let S = 0;
        for (let v = 0, b = w.length; v < b; v++)
          x[v] = S, S += w[v].length + 1;
        this[a] = x;
      }
      g = x[x.length - 1];
      let y = 0;
      if (f >= g)
        y = x.length - 1;
      else {
        let w = x.length - 2, S;
        for (; y < w; )
          if (S = y + (w - y >> 1), f < x[S])
            w = S - 1;
          else if (f >= x[S + 1])
            y = S + 1;
          else {
            y = S;
            break;
          }
      }
      return {
        col: f - x[y] + 1,
        line: y + 1
      };
    }
    mapResolve(f) {
      return /^\w+:\/\//.test(f) ? f : s(this.map.consumer().sourceRoot || this.map.root || ".", f);
    }
    origin(f, g, x, y) {
      if (!this.map) return !1;
      let w = this.map.consumer(), S = w.originalPositionFor({ column: g, line: f });
      if (!S.source) return !1;
      let v;
      typeof x == "number" && (v = w.originalPositionFor({ column: y, line: x }));
      let b;
      i(S.source) ? b = n(S.source) : b = new URL(
        S.source,
        this.map.consumer().sourceRoot || n(this.map.mapFile)
      );
      let k = {
        column: S.column,
        endColumn: v && v.column,
        endLine: v && v.line,
        line: S.line,
        url: b.toString()
      };
      if (b.protocol === "file:")
        if (r)
          k.file = r(b);
        else
          throw new Error("file: protocol is not available in this PostCSS build");
      let E = w.sourceContentFor(S.source);
      return E && (k.source = E), k;
    }
    toJSON() {
      let f = {};
      for (let g of ["hasBOM", "css", "file", "id"])
        this[g] != null && (f[g] = this[g]);
      return this.map && (f.map = { ...this.map }, f.map.consumerCache && (f.map.consumerCache = void 0)), f;
    }
    get from() {
      return this.file || this.id;
    }
  }
  return Gr = l, l.default = l, h && h.registerInput && h.registerInput(l), Gr;
}
var Yr, Qn;
function go() {
  if (Qn) return Yr;
  Qn = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Ie, { dirname: r, relative: n, resolve: i, sep: s } = Ie, { pathToFileURL: c } = Ie, h = ir(), o = !!(e && t), p = !!(r && i && n && s);
  class a {
    constructor(u, l, m, f) {
      this.stringify = u, this.mapOpts = m.map || {}, this.root = l, this.opts = m, this.css = f, this.originalCSS = f, this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute, this.memoizedFileURLs = /* @__PURE__ */ new Map(), this.memoizedPaths = /* @__PURE__ */ new Map(), this.memoizedURLs = /* @__PURE__ */ new Map();
    }
    addAnnotation() {
      let u;
      this.isInline() ? u = "data:application/json;base64," + this.toBase64(this.map.toString()) : typeof this.mapOpts.annotation == "string" ? u = this.mapOpts.annotation : typeof this.mapOpts.annotation == "function" ? u = this.mapOpts.annotation(this.opts.to, this.root) : u = this.outputFile() + ".map";
      let l = `
`;
      this.css.includes(`\r
`) && (l = `\r
`), this.css += l + "/*# sourceMappingURL=" + u + " */";
    }
    applyPrevMaps() {
      for (let u of this.previous()) {
        let l = this.toUrl(this.path(u.file)), m = u.root || r(u.file), f;
        this.mapOpts.sourcesContent === !1 ? (f = new e(u.text), f.sourcesContent && (f.sourcesContent = null)) : f = u.consumer(), this.map.applySourceMap(f, l, this.toUrl(this.path(m)));
      }
    }
    clearAnnotation() {
      if (this.mapOpts.annotation !== !1)
        if (this.root) {
          let u;
          for (let l = this.root.nodes.length - 1; l >= 0; l--)
            u = this.root.nodes[l], u.type === "comment" && u.text.indexOf("# sourceMappingURL=") === 0 && this.root.removeChild(l);
        } else this.css && (this.css = this.css.replace(/\n*?\/\*#[\S\s]*?\*\/$/gm, ""));
    }
    generate() {
      if (this.clearAnnotation(), p && o && this.isMap())
        return this.generateMap();
      {
        let u = "";
        return this.stringify(this.root, (l) => {
          u += l;
        }), [u];
      }
    }
    generateMap() {
      if (this.root)
        this.generateString();
      else if (this.previous().length === 1) {
        let u = this.previous()[0].consumer();
        u.file = this.outputFile(), this.map = t.fromSourceMap(u, {
          ignoreInvalidMapping: !0
        });
      } else
        this.map = new t({
          file: this.outputFile(),
          ignoreInvalidMapping: !0
        }), this.map.addMapping({
          generated: { column: 0, line: 1 },
          original: { column: 0, line: 1 },
          source: this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>"
        });
      return this.isSourcesContent() && this.setSourcesContent(), this.root && this.previous().length > 0 && this.applyPrevMaps(), this.isAnnotation() && this.addAnnotation(), this.isInline() ? [this.css] : [this.css, this.map];
    }
    generateString() {
      this.css = "", this.map = new t({
        file: this.outputFile(),
        ignoreInvalidMapping: !0
      });
      let u = 1, l = 1, m = "<no source>", f = {
        generated: { column: 0, line: 0 },
        original: { column: 0, line: 0 },
        source: ""
      }, g, x;
      this.stringify(this.root, (y, w, S) => {
        if (this.css += y, w && S !== "end" && (f.generated.line = u, f.generated.column = l - 1, w.source && w.source.start ? (f.source = this.sourcePath(w), f.original.line = w.source.start.line, f.original.column = w.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = y.match(/\n/g), g ? (u += g.length, x = y.lastIndexOf(`
`), l = y.length - x) : l += y.length, w && S !== "start") {
          let v = w.parent || { raws: {} };
          (!(w.type === "decl" || w.type === "atrule" && !w.nodes) || w !== v.last || v.raws.semicolon) && (w.source && w.source.end ? (f.source = this.sourcePath(w), f.original.line = w.source.end.line, f.original.column = w.source.end.column - 1, f.generated.line = u, f.generated.column = l - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = l - 1, this.map.addMapping(f)));
        }
      });
    }
    isAnnotation() {
      return this.isInline() ? !0 : typeof this.mapOpts.annotation < "u" ? this.mapOpts.annotation : this.previous().length ? this.previous().some((u) => u.annotation) : !0;
    }
    isInline() {
      if (typeof this.mapOpts.inline < "u")
        return this.mapOpts.inline;
      let u = this.mapOpts.annotation;
      return typeof u < "u" && u !== !0 ? !1 : this.previous().length ? this.previous().some((l) => l.inline) : !0;
    }
    isMap() {
      return typeof this.opts.map < "u" ? !!this.opts.map : this.previous().length > 0;
    }
    isSourcesContent() {
      return typeof this.mapOpts.sourcesContent < "u" ? this.mapOpts.sourcesContent : this.previous().length ? this.previous().some((u) => u.withContent()) : !0;
    }
    outputFile() {
      return this.opts.to ? this.path(this.opts.to) : this.opts.from ? this.path(this.opts.from) : "to.css";
    }
    path(u) {
      if (this.mapOpts.absolute || u.charCodeAt(0) === 60 || /^\w+:\/\//.test(u)) return u;
      let l = this.memoizedPaths.get(u);
      if (l) return l;
      let m = this.opts.to ? r(this.opts.to) : ".";
      typeof this.mapOpts.annotation == "string" && (m = r(i(m, this.mapOpts.annotation)));
      let f = n(m, u);
      return this.memoizedPaths.set(u, f), f;
    }
    previous() {
      if (!this.previousMaps)
        if (this.previousMaps = [], this.root)
          this.root.walk((u) => {
            if (u.source && u.source.input.map) {
              let l = u.source.input.map;
              this.previousMaps.includes(l) || this.previousMaps.push(l);
            }
          });
        else {
          let u = new h(this.originalCSS, this.opts);
          u.map && this.previousMaps.push(u.map);
        }
      return this.previousMaps;
    }
    setSourcesContent() {
      let u = {};
      if (this.root)
        this.root.walk((l) => {
          if (l.source) {
            let m = l.source.input.from;
            if (m && !u[m]) {
              u[m] = !0;
              let f = this.usesFileUrls ? this.toFileUrl(m) : this.toUrl(this.path(m));
              this.map.setSourceContent(f, l.source.input.css);
            }
          }
        });
      else if (this.css) {
        let l = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
        this.map.setSourceContent(l, this.css);
      }
    }
    sourcePath(u) {
      return this.mapOpts.from ? this.toUrl(this.mapOpts.from) : this.usesFileUrls ? this.toFileUrl(u.source.input.from) : this.toUrl(this.path(u.source.input.from));
    }
    toBase64(u) {
      return Buffer ? Buffer.from(u).toString("base64") : window.btoa(unescape(encodeURIComponent(u)));
    }
    toFileUrl(u) {
      let l = this.memoizedFileURLs.get(u);
      if (l) return l;
      if (c) {
        let m = c(u).toString();
        return this.memoizedFileURLs.set(u, m), m;
      } else
        throw new Error(
          "`map.absolute` option is not available in this PostCSS build"
        );
    }
    toUrl(u) {
      let l = this.memoizedURLs.get(u);
      if (l) return l;
      s === "\\" && (u = u.replace(/\\/g, "/"));
      let m = encodeURI(u).replace(/[#?]/g, encodeURIComponent);
      return this.memoizedURLs.set(u, m), m;
    }
  }
  return Yr = a, Yr;
}
var Jr, es;
function nr() {
  if (es) return Jr;
  es = 1;
  let e = tr();
  class t extends e {
    constructor(n) {
      super(n), this.type = "comment";
    }
  }
  return Jr = t, t.default = t, Jr;
}
var Xr, ts;
function Je() {
  if (ts) return Xr;
  ts = 1;
  let { isClean: e, my: t } = $i(), r = rr(), n = nr(), i = tr(), s, c, h, o;
  function p(u) {
    return u.map((l) => (l.nodes && (l.nodes = p(l.nodes)), delete l.source, l));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let l of u.proxyOf.nodes)
        a(l);
  }
  class d extends i {
    append(...l) {
      for (let m of l) {
        let f = this.normalize(m, this.last);
        for (let g of f) this.proxyOf.nodes.push(g);
      }
      return this.markDirty(), this;
    }
    cleanRaws(l) {
      if (super.cleanRaws(l), this.nodes)
        for (let m of this.nodes) m.cleanRaws(l);
    }
    each(l) {
      if (!this.proxyOf.nodes) return;
      let m = this.getIterator(), f, g;
      for (; this.indexes[m] < this.proxyOf.nodes.length && (f = this.indexes[m], g = l(this.proxyOf.nodes[f], f), g !== !1); )
        this.indexes[m] += 1;
      return delete this.indexes[m], g;
    }
    every(l) {
      return this.nodes.every(l);
    }
    getIterator() {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach += 1;
      let l = this.lastEach;
      return this.indexes[l] = 0, l;
    }
    getProxyProcessor() {
      return {
        get(l, m) {
          return m === "proxyOf" ? l : l[m] ? m === "each" || typeof m == "string" && m.startsWith("walk") ? (...f) => l[m](
            ...f.map((g) => typeof g == "function" ? (x, y) => g(x.toProxy(), y) : g)
          ) : m === "every" || m === "some" ? (f) => l[m](
            (g, ...x) => f(g.toProxy(), ...x)
          ) : m === "root" ? () => l.root().toProxy() : m === "nodes" ? l.nodes.map((f) => f.toProxy()) : m === "first" || m === "last" ? l[m].toProxy() : l[m] : l[m];
        },
        set(l, m, f) {
          return l[m] === f || (l[m] = f, (m === "name" || m === "params" || m === "selector") && l.markDirty()), !0;
        }
      };
    }
    index(l) {
      return typeof l == "number" ? l : (l.proxyOf && (l = l.proxyOf), this.proxyOf.nodes.indexOf(l));
    }
    insertAfter(l, m) {
      let f = this.index(l), g = this.normalize(m, this.proxyOf.nodes[f]).reverse();
      f = this.index(l);
      for (let y of g) this.proxyOf.nodes.splice(f + 1, 0, y);
      let x;
      for (let y in this.indexes)
        x = this.indexes[y], f < x && (this.indexes[y] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(l, m) {
      let f = this.index(l), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(l);
      for (let w of x) this.proxyOf.nodes.splice(f, 0, w);
      let y;
      for (let w in this.indexes)
        y = this.indexes[w], f <= y && (this.indexes[w] = y + x.length);
      return this.markDirty(), this;
    }
    normalize(l, m) {
      if (typeof l == "string")
        l = p(s(l).nodes);
      else if (typeof l > "u")
        l = [];
      else if (Array.isArray(l)) {
        l = l.slice(0);
        for (let g of l)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (l.type === "root" && this.type !== "document") {
        l = l.nodes.slice(0);
        for (let g of l)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (l.type)
        l = [l];
      else if (l.prop) {
        if (typeof l.value > "u")
          throw new Error("Value field is missed in node creation");
        typeof l.value != "string" && (l.value = String(l.value)), l = [new r(l)];
      } else if (l.selector)
        l = [new c(l)];
      else if (l.name)
        l = [new h(l)];
      else if (l.text)
        l = [new n(l)];
      else
        throw new Error("Unknown node type in node creation");
      return l.map((g) => (g[t] || d.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
    }
    prepend(...l) {
      l = l.reverse();
      for (let m of l) {
        let f = this.normalize(m, this.first, "prepend").reverse();
        for (let g of f) this.proxyOf.nodes.unshift(g);
        for (let g in this.indexes)
          this.indexes[g] = this.indexes[g] + f.length;
      }
      return this.markDirty(), this;
    }
    push(l) {
      return l.parent = this, this.proxyOf.nodes.push(l), this;
    }
    removeAll() {
      for (let l of this.proxyOf.nodes) l.parent = void 0;
      return this.proxyOf.nodes = [], this.markDirty(), this;
    }
    removeChild(l) {
      l = this.index(l), this.proxyOf.nodes[l].parent = void 0, this.proxyOf.nodes.splice(l, 1);
      let m;
      for (let f in this.indexes)
        m = this.indexes[f], m >= l && (this.indexes[f] = m - 1);
      return this.markDirty(), this;
    }
    replaceValues(l, m, f) {
      return f || (f = m, m = {}), this.walkDecls((g) => {
        m.props && !m.props.includes(g.prop) || m.fast && !g.value.includes(m.fast) || (g.value = g.value.replace(l, f));
      }), this.markDirty(), this;
    }
    some(l) {
      return this.nodes.some(l);
    }
    walk(l) {
      return this.each((m, f) => {
        let g;
        try {
          g = l(m, f);
        } catch (x) {
          throw m.addToError(x);
        }
        return g !== !1 && m.walk && (g = m.walk(l)), g;
      });
    }
    walkAtRules(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "atrule" && l.test(f.name))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "atrule" && f.name === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "atrule")
          return m(f, g);
      }));
    }
    walkComments(l) {
      return this.walk((m, f) => {
        if (m.type === "comment")
          return l(m, f);
      });
    }
    walkDecls(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "decl" && l.test(f.prop))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "decl" && f.prop === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "decl")
          return m(f, g);
      }));
    }
    walkRules(l, m) {
      return m ? l instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "rule" && l.test(f.selector))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "rule" && f.selector === l)
          return m(f, g);
      }) : (m = l, this.walk((f, g) => {
        if (f.type === "rule")
          return m(f, g);
      }));
    }
    get first() {
      if (this.proxyOf.nodes)
        return this.proxyOf.nodes[0];
    }
    get last() {
      if (this.proxyOf.nodes)
        return this.proxyOf.nodes[this.proxyOf.nodes.length - 1];
    }
  }
  return d.registerParse = (u) => {
    s = u;
  }, d.registerRule = (u) => {
    c = u;
  }, d.registerAtRule = (u) => {
    h = u;
  }, d.registerRoot = (u) => {
    o = u;
  }, Xr = d, d.default = d, d.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, h.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, c.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, n.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((l) => {
      d.rebuild(l);
    });
  }, Xr;
}
var Kr, rs;
function Di() {
  if (rs) return Kr;
  rs = 1;
  let e = Je(), t, r;
  class n extends e {
    constructor(s) {
      super({ type: "document", ...s }), this.nodes || (this.nodes = []);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return n.registerLazyResult = (i) => {
    t = i;
  }, n.registerProcessor = (i) => {
    r = i;
  }, Kr = n, n.default = n, Kr;
}
var Zr, is;
function yo() {
  if (is) return Zr;
  is = 1;
  let e = {};
  return Zr = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, Zr;
}
var Qr, ns;
function bo() {
  if (ns) return Qr;
  ns = 1;
  class e {
    constructor(r, n = {}) {
      if (this.type = "warning", this.text = r, n.node && n.node.source) {
        let i = n.node.rangeBy(n);
        this.line = i.start.line, this.column = i.start.column, this.endLine = i.end.line, this.endColumn = i.end.column;
      }
      for (let i in n) this[i] = n[i];
    }
    toString() {
      return this.node ? this.node.error(this.text, {
        index: this.index,
        plugin: this.plugin,
        word: this.word
      }).message : this.plugin ? this.plugin + ": " + this.text : this.text;
    }
  }
  return Qr = e, e.default = e, Qr;
}
var ei, ss;
function zi() {
  if (ss) return ei;
  ss = 1;
  let e = bo();
  class t {
    constructor(n, i, s) {
      this.processor = n, this.messages = [], this.root = i, this.opts = s, this.css = void 0, this.map = void 0;
    }
    toString() {
      return this.css;
    }
    warn(n, i = {}) {
      i.plugin || this.lastPlugin && this.lastPlugin.postcssPlugin && (i.plugin = this.lastPlugin.postcssPlugin);
      let s = new e(n, i);
      return this.messages.push(s), s;
    }
    warnings() {
      return this.messages.filter((n) => n.type === "warning");
    }
    get content() {
      return this.css;
    }
  }
  return ei = t, t.default = t, ei;
}
var ti, os;
function Yc() {
  if (os) return ti;
  os = 1;
  const e = 39, t = 34, r = 92, n = 47, i = 10, s = 32, c = 12, h = 9, o = 13, p = 91, a = 93, d = 40, u = 41, l = 123, m = 125, f = 59, g = 42, x = 58, y = 64, w = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, v = /.[\r\n"'(/\\]/, b = /[\da-f]/i;
  return ti = function(E, O = {}) {
    let M = E.css.valueOf(), D = O.ignoreErrors, N, C, oe, te, G, q, K, ee, Y, j, ye = M.length, R = 0, be = [], de = [];
    function Le() {
      return R;
    }
    function ae(I) {
      throw E.error("Unclosed " + I, R);
    }
    function ve() {
      return de.length === 0 && R >= ye;
    }
    function Ae(I) {
      if (de.length) return de.pop();
      if (R >= ye) return;
      let _ = I ? I.ignoreUnclosed : !1;
      switch (N = M.charCodeAt(R), N) {
        case i:
        case s:
        case h:
        case o:
        case c: {
          C = R;
          do
            C += 1, N = M.charCodeAt(C);
          while (N === s || N === i || N === h || N === o || N === c);
          j = ["space", M.slice(R, C)], R = C - 1;
          break;
        }
        case p:
        case a:
        case l:
        case m:
        case x:
        case f:
        case u: {
          let A = String.fromCharCode(N);
          j = [A, A, R];
          break;
        }
        case d: {
          if (ee = be.length ? be.pop()[1] : "", Y = M.charCodeAt(R + 1), ee === "url" && Y !== e && Y !== t && Y !== s && Y !== i && Y !== h && Y !== c && Y !== o) {
            C = R;
            do {
              if (q = !1, C = M.indexOf(")", C + 1), C === -1)
                if (D || _) {
                  C = R;
                  break;
                } else
                  ae("bracket");
              for (K = C; M.charCodeAt(K - 1) === r; )
                K -= 1, q = !q;
            } while (q);
            j = ["brackets", M.slice(R, C + 1), R, C], R = C;
          } else
            C = M.indexOf(")", R + 1), te = M.slice(R, C + 1), C === -1 || v.test(te) ? j = ["(", "(", R] : (j = ["brackets", te, R, C], R = C);
          break;
        }
        case e:
        case t: {
          oe = N === e ? "'" : '"', C = R;
          do {
            if (q = !1, C = M.indexOf(oe, C + 1), C === -1)
              if (D || _) {
                C = R + 1;
                break;
              } else
                ae("string");
            for (K = C; M.charCodeAt(K - 1) === r; )
              K -= 1, q = !q;
          } while (q);
          j = ["string", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case y: {
          w.lastIndex = R + 1, w.test(M), w.lastIndex === 0 ? C = M.length - 1 : C = w.lastIndex - 2, j = ["at-word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case r: {
          for (C = R, G = !0; M.charCodeAt(C + 1) === r; )
            C += 1, G = !G;
          if (N = M.charCodeAt(C + 1), G && N !== n && N !== s && N !== i && N !== h && N !== o && N !== c && (C += 1, b.test(M.charAt(C)))) {
            for (; b.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          j = ["word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        default: {
          N === n && M.charCodeAt(R + 1) === g ? (C = M.indexOf("*/", R + 2) + 1, C === 0 && (D || _ ? C = M.length : ae("comment")), j = ["comment", M.slice(R, C + 1), R, C], R = C) : (S.lastIndex = R + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, j = ["word", M.slice(R, C + 1), R, C], be.push(j), R = C);
          break;
        }
      }
      return R++, j;
    }
    function P(I) {
      de.push(I);
    }
    return {
      back: P,
      endOfFile: ve,
      nextToken: Ae,
      position: Le
    };
  }, ti;
}
var ri, as;
function Fi() {
  if (as) return ri;
  as = 1;
  let e = Je();
  class t extends e {
    constructor(n) {
      super(n), this.type = "atrule";
    }
    append(...n) {
      return this.proxyOf.nodes || (this.nodes = []), super.append(...n);
    }
    prepend(...n) {
      return this.proxyOf.nodes || (this.nodes = []), super.prepend(...n);
    }
  }
  return ri = t, t.default = t, e.registerAtRule(t), ri;
}
var ii, ls;
function bt() {
  if (ls) return ii;
  ls = 1;
  let e = Je(), t, r;
  class n extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, c, h) {
      let o = super.normalize(s);
      if (c) {
        if (h === "prepend")
          this.nodes.length > 1 ? c.raws.before = this.nodes[1].raws.before : delete c.raws.before;
        else if (this.first !== c)
          for (let p of o)
            p.raws.before = c.raws.before;
      }
      return o;
    }
    removeChild(s, c) {
      let h = this.index(s);
      return !c && h === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[h].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return n.registerLazyResult = (i) => {
    t = i;
  }, n.registerProcessor = (i) => {
    r = i;
  }, ii = n, n.default = n, e.registerRoot(n), ii;
}
var ni, cs;
function vo() {
  if (cs) return ni;
  cs = 1;
  let e = {
    comma(t) {
      return e.split(t, [","], !0);
    },
    space(t) {
      let r = [" ", `
`, "	"];
      return e.split(t, r);
    },
    split(t, r, n) {
      let i = [], s = "", c = !1, h = 0, o = !1, p = "", a = !1;
      for (let d of t)
        a ? a = !1 : d === "\\" ? a = !0 : o ? d === p && (o = !1) : d === '"' || d === "'" ? (o = !0, p = d) : d === "(" ? h += 1 : d === ")" ? h > 0 && (h -= 1) : h === 0 && r.includes(d) && (c = !0), c ? (s !== "" && i.push(s.trim()), s = "", c = !1) : s += d;
      return (n || s !== "") && i.push(s.trim()), i;
    }
  };
  return ni = e, e.default = e, ni;
}
var si, us;
function Ui() {
  if (us) return si;
  us = 1;
  let e = Je(), t = vo();
  class r extends e {
    constructor(i) {
      super(i), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(i) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, c = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = i.join(c);
    }
  }
  return si = r, r.default = r, e.registerRule(r), si;
}
var oi, ds;
function Jc() {
  if (ds) return oi;
  ds = 1;
  let e = rr(), t = Yc(), r = nr(), n = Fi(), i = bt(), s = Ui();
  const c = {
    empty: !0,
    space: !0
  };
  function h(p) {
    for (let a = p.length - 1; a >= 0; a--) {
      let d = p[a], u = d[3] || d[2];
      if (u) return u;
    }
  }
  class o {
    constructor(a) {
      this.input = a, this.root = new i(), this.current = this.root, this.spaces = "", this.semicolon = !1, this.createTokenizer(), this.root.source = { input: a, start: { column: 1, line: 1, offset: 0 } };
    }
    atrule(a) {
      let d = new n();
      d.name = a[1].slice(1), d.name === "" && this.unnamedAtrule(d, a), this.init(d, a[2]);
      let u, l, m, f = !1, g = !1, x = [], y = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? y.push(u === "(" ? ")" : "]") : u === "{" && y.length > 0 ? y.push("}") : u === y[y.length - 1] && y.pop(), y.length === 0)
          if (u === ";") {
            d.source.end = this.getPosition(a[2]), d.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, l = x[m]; l && l[0] === "space"; )
                l = x[--m];
              l && (d.source.end = this.getPosition(l[3] || l[2]), d.source.end.offset++);
            }
            this.end(a);
            break;
          } else
            x.push(a);
        else
          x.push(a);
        if (this.tokenizer.endOfFile()) {
          f = !0;
          break;
        }
      }
      d.raws.between = this.spacesAndCommentsFromEnd(x), x.length ? (d.raws.afterName = this.spacesAndCommentsFromStart(x), this.raw(d, "params", x), f && (a = x[x.length - 1], d.source.end = this.getPosition(a[3] || a[2]), d.source.end.offset++, this.spaces = d.raws.between, d.raws.between = "")) : (d.raws.afterName = "", d.params = ""), g && (d.nodes = [], this.current = d);
    }
    checkMissedSemicolon(a) {
      let d = this.colon(a);
      if (d === !1) return;
      let u = 0, l;
      for (let m = d - 1; m >= 0 && (l = a[m], !(l[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        l[0] === "word" ? l[3] + 1 : l[2]
      );
    }
    colon(a) {
      let d = 0, u, l, m;
      for (let [f, g] of a.entries()) {
        if (u = g, l = u[0], l === "(" && (d += 1), l === ")" && (d -= 1), d === 0 && l === ":")
          if (!m)
            this.doubleColon(u);
          else {
            if (m[0] === "word" && m[1] === "progid")
              continue;
            return f;
          }
        m = u;
      }
      return !1;
    }
    comment(a) {
      let d = new r();
      this.init(d, a[2]), d.source.end = this.getPosition(a[3] || a[2]), d.source.end.offset++;
      let u = a[1].slice(2, -2);
      if (/^\s*$/.test(u))
        d.text = "", d.raws.left = u, d.raws.right = "";
      else {
        let l = u.match(/^(\s*)([^]*\S)(\s*)$/);
        d.text = l[2], d.raws.left = l[1], d.raws.right = l[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, d) {
      let u = new e();
      this.init(u, a[0][2]);
      let l = a[a.length - 1];
      for (l[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        l[3] || l[2] || h(a)
      ), u.source.end.offset++; a[0][0] !== "word"; )
        a.length === 1 && this.unknownWord(a), u.raws.before += a.shift()[1];
      for (u.source.start = this.getPosition(a[0][2]), u.prop = ""; a.length; ) {
        let y = a[0][0];
        if (y === ":" || y === "space" || y === "comment")
          break;
        u.prop += a.shift()[1];
      }
      u.raws.between = "";
      let m;
      for (; a.length; )
        if (m = a.shift(), m[0] === ":") {
          u.raws.between += m[1];
          break;
        } else
          m[0] === "word" && /\w/.test(m[1]) && this.unknownWord([m]), u.raws.between += m[1];
      (u.prop[0] === "_" || u.prop[0] === "*") && (u.raws.before += u.prop[0], u.prop = u.prop.slice(1));
      let f = [], g;
      for (; a.length && (g = a[0][0], !(g !== "space" && g !== "comment")); )
        f.push(a.shift());
      this.precheckMissedSemicolon(a);
      for (let y = a.length - 1; y >= 0; y--) {
        if (m = a[y], m[1].toLowerCase() === "!important") {
          u.important = !0;
          let w = this.stringFrom(a, y);
          w = this.spacesFromEnd(a) + w, w !== " !important" && (u.raws.important = w);
          break;
        } else if (m[1].toLowerCase() === "important") {
          let w = a.slice(0), S = "";
          for (let v = y; v > 0; v--) {
            let b = w[v][0];
            if (S.trim().indexOf("!") === 0 && b !== "space")
              break;
            S = w.pop()[1] + S;
          }
          S.trim().indexOf("!") === 0 && (u.important = !0, u.raws.important = S, a = w);
        }
        if (m[0] !== "space" && m[0] !== "comment")
          break;
      }
      a.some((y) => y[0] !== "space" && y[0] !== "comment") && (u.raws.between += f.map((y) => y[1]).join(""), f = []), this.raw(u, "value", f.concat(a), d), u.value.includes(":") && !d && this.checkMissedSemicolon(a);
    }
    doubleColon(a) {
      throw this.input.error(
        "Double colon",
        { offset: a[2] },
        { offset: a[2] + a[1].length }
      );
    }
    emptyRule(a) {
      let d = new s();
      this.init(d, a[2]), d.selector = "", d.raws.between = "", this.current = d;
    }
    end(a) {
      this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.semicolon = !1, this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.spaces = "", this.current.parent ? (this.current.source.end = this.getPosition(a[2]), this.current.source.end.offset++, this.current = this.current.parent) : this.unexpectedClose(a);
    }
    endFile() {
      this.current.parent && this.unclosedBlock(), this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.root.source.end = this.getPosition(this.tokenizer.position());
    }
    freeSemicolon(a) {
      if (this.spaces += a[1], this.current.nodes) {
        let d = this.current.nodes[this.current.nodes.length - 1];
        d && d.type === "rule" && !d.raws.ownSemicolon && (d.raws.ownSemicolon = this.spaces, this.spaces = "");
      }
    }
    // Helpers
    getPosition(a) {
      let d = this.input.fromOffset(a);
      return {
        column: d.col,
        line: d.line,
        offset: a
      };
    }
    init(a, d) {
      this.current.push(a), a.source = {
        input: this.input,
        start: this.getPosition(d)
      }, a.raws.before = this.spaces, this.spaces = "", a.type !== "comment" && (this.semicolon = !1);
    }
    other(a) {
      let d = !1, u = null, l = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], y = a;
      for (; y; ) {
        if (u = y[0], x.push(y), u === "(" || u === "[")
          m || (m = y), f.push(u === "(" ? ")" : "]");
        else if (g && l && u === "{")
          m || (m = y), f.push("}");
        else if (f.length === 0)
          if (u === ";")
            if (l) {
              this.decl(x, g);
              return;
            } else
              break;
          else if (u === "{") {
            this.rule(x);
            return;
          } else if (u === "}") {
            this.tokenizer.back(x.pop()), d = !0;
            break;
          } else u === ":" && (l = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        y = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (d = !0), f.length > 0 && this.unclosedBracket(m), d && l) {
        if (!g)
          for (; x.length && (y = x[x.length - 1][0], !(y !== "space" && y !== "comment")); )
            this.tokenizer.back(x.pop());
        this.decl(x, g);
      } else
        this.unknownWord(x);
    }
    parse() {
      let a;
      for (; !this.tokenizer.endOfFile(); )
        switch (a = this.tokenizer.nextToken(), a[0]) {
          case "space":
            this.spaces += a[1];
            break;
          case ";":
            this.freeSemicolon(a);
            break;
          case "}":
            this.end(a);
            break;
          case "comment":
            this.comment(a);
            break;
          case "at-word":
            this.atrule(a);
            break;
          case "{":
            this.emptyRule(a);
            break;
          default:
            this.other(a);
            break;
        }
      this.endFile();
    }
    precheckMissedSemicolon() {
    }
    raw(a, d, u, l) {
      let m, f, g = u.length, x = "", y = !0, w, S;
      for (let v = 0; v < g; v += 1)
        m = u[v], f = m[0], f === "space" && v === g - 1 && !l ? y = !1 : f === "comment" ? (S = u[v - 1] ? u[v - 1][0] : "empty", w = u[v + 1] ? u[v + 1][0] : "empty", !c[S] && !c[w] ? x.slice(-1) === "," ? y = !1 : x += m[1] : y = !1) : x += m[1];
      if (!y) {
        let v = u.reduce((b, k) => b + k[1], "");
        a.raws[d] = { raw: v, value: x };
      }
      a[d] = x;
    }
    rule(a) {
      a.pop();
      let d = new s();
      this.init(d, a[0][2]), d.raws.between = this.spacesAndCommentsFromEnd(a), this.raw(d, "selector", a), this.current = d;
    }
    spacesAndCommentsFromEnd(a) {
      let d, u = "";
      for (; a.length && (d = a[a.length - 1][0], !(d !== "space" && d !== "comment")); )
        u = a.pop()[1] + u;
      return u;
    }
    // Errors
    spacesAndCommentsFromStart(a) {
      let d, u = "";
      for (; a.length && (d = a[0][0], !(d !== "space" && d !== "comment")); )
        u += a.shift()[1];
      return u;
    }
    spacesFromEnd(a) {
      let d, u = "";
      for (; a.length && (d = a[a.length - 1][0], d === "space"); )
        u = a.pop()[1] + u;
      return u;
    }
    stringFrom(a, d) {
      let u = "";
      for (let l = d; l < a.length; l++)
        u += a[l][1];
      return a.splice(d, a.length - d), u;
    }
    unclosedBlock() {
      let a = this.current.source.start;
      throw this.input.error("Unclosed block", a.line, a.column);
    }
    unclosedBracket(a) {
      throw this.input.error(
        "Unclosed bracket",
        { offset: a[2] },
        { offset: a[2] + 1 }
      );
    }
    unexpectedClose(a) {
      throw this.input.error(
        "Unexpected }",
        { offset: a[2] },
        { offset: a[2] + 1 }
      );
    }
    unknownWord(a) {
      throw this.input.error(
        "Unknown word",
        { offset: a[0][2] },
        { offset: a[0][2] + a[0][1].length }
      );
    }
    unnamedAtrule(a, d) {
      throw this.input.error(
        "At-rule without name",
        { offset: d[2] },
        { offset: d[2] + d[1].length }
      );
    }
  }
  return oi = o, oi;
}
var ai, hs;
function Bi() {
  if (hs) return ai;
  hs = 1;
  let e = Je(), t = Jc(), r = ir();
  function n(i, s) {
    let c = new r(i, s), h = new t(c);
    try {
      h.parse();
    } catch (o) {
      throw process.env.NODE_ENV !== "production" && o.name === "CssSyntaxError" && s && s.from && (/\.scss$/i.test(s.from) ? o.message += `
You tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser` : /\.sass/i.test(s.from) ? o.message += `
You tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser` : /\.less$/i.test(s.from) && (o.message += `
You tried to parse Less with the standard CSS parser; try again with the postcss-less parser`)), o;
    }
    return h.root;
  }
  return ai = n, n.default = n, e.registerParse(n), ai;
}
var li, ps;
function wo() {
  if (ps) return li;
  ps = 1;
  let { isClean: e, my: t } = $i(), r = go(), n = er(), i = Je(), s = Di(), c = yo(), h = zi(), o = Bi(), p = bt();
  const a = {
    atrule: "AtRule",
    comment: "Comment",
    decl: "Declaration",
    document: "Document",
    root: "Root",
    rule: "Rule"
  }, d = {
    AtRule: !0,
    AtRuleExit: !0,
    Comment: !0,
    CommentExit: !0,
    Declaration: !0,
    DeclarationExit: !0,
    Document: !0,
    DocumentExit: !0,
    Once: !0,
    OnceExit: !0,
    postcssPlugin: !0,
    prepare: !0,
    Root: !0,
    RootExit: !0,
    Rule: !0,
    RuleExit: !0
  }, u = {
    Once: !0,
    postcssPlugin: !0,
    prepare: !0
  }, l = 0;
  function m(S) {
    return typeof S == "object" && typeof S.then == "function";
  }
  function f(S) {
    let v = !1, b = a[S.type];
    return S.type === "decl" ? v = S.prop.toLowerCase() : S.type === "atrule" && (v = S.name.toLowerCase()), v && S.append ? [
      b,
      b + "-" + v,
      l,
      b + "Exit",
      b + "Exit-" + v
    ] : v ? [b, b + "-" + v, b + "Exit", b + "Exit-" + v] : S.append ? [b, l, b + "Exit"] : [b, b + "Exit"];
  }
  function g(S) {
    let v;
    return S.type === "document" ? v = ["Document", l, "DocumentExit"] : S.type === "root" ? v = ["Root", l, "RootExit"] : v = f(S), {
      eventIndex: 0,
      events: v,
      iterator: 0,
      node: S,
      visitorIndex: 0,
      visitors: []
    };
  }
  function x(S) {
    return S[e] = !1, S.nodes && S.nodes.forEach((v) => x(v)), S;
  }
  let y = {};
  class w {
    constructor(v, b, k) {
      this.stringified = !1, this.processed = !1;
      let E;
      if (typeof b == "object" && b !== null && (b.type === "root" || b.type === "document"))
        E = x(b);
      else if (b instanceof w || b instanceof h)
        E = x(b.root), b.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = b.map);
      else {
        let O = o;
        k.syntax && (O = k.syntax.parse), k.parser && (O = k.parser), O.parse && (O = O.parse);
        try {
          E = O(b, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && i.rebuild(E);
      }
      this.result = new h(v, E, k), this.helpers = { ...y, postcss: y, result: this.result }, this.plugins = this.processor.plugins.map((O) => typeof O == "object" && O.prepare ? { ...O, ...O.prepare(this.result) } : O);
    }
    async() {
      return this.error ? Promise.reject(this.error) : this.processed ? Promise.resolve(this.result) : (this.processing || (this.processing = this.runAsync()), this.processing);
    }
    catch(v) {
      return this.async().catch(v);
    }
    finally(v) {
      return this.async().then(v, v);
    }
    getAsyncError() {
      throw new Error("Use process(css).then(cb) to work with async plugins");
    }
    handleError(v, b) {
      let k = this.result.lastPlugin;
      try {
        if (b && b.addToError(v), this.error = v, v.name === "CssSyntaxError" && !v.plugin)
          v.plugin = k.postcssPlugin, v.setMessage();
        else if (k.postcssVersion && process.env.NODE_ENV !== "production") {
          let E = k.postcssPlugin, O = k.postcssVersion, M = this.result.processor.version, D = O.split("."), N = M.split(".");
          (D[0] !== N[0] || parseInt(D[1]) > parseInt(N[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + O + ". Perhaps this is the source of the error below."
          );
        }
      } catch (E) {
        console && console.error && console.error(E);
      }
      return v;
    }
    prepareVisitors() {
      this.listeners = {};
      let v = (b, k, E) => {
        this.listeners[k] || (this.listeners[k] = []), this.listeners[k].push([b, E]);
      };
      for (let b of this.plugins)
        if (typeof b == "object")
          for (let k in b) {
            if (!d[k] && /^[A-Z]/.test(k))
              throw new Error(
                `Unknown event ${k} in ${b.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
              );
            if (!u[k])
              if (typeof b[k] == "object")
                for (let E in b[k])
                  E === "*" ? v(b, k, b[k][E]) : v(
                    b,
                    k + "-" + E.toLowerCase(),
                    b[k][E]
                  );
              else typeof b[k] == "function" && v(b, k, b[k]);
          }
      this.hasListener = Object.keys(this.listeners).length > 0;
    }
    async runAsync() {
      this.plugin = 0;
      for (let v = 0; v < this.plugins.length; v++) {
        let b = this.plugins[v], k = this.runOnRoot(b);
        if (m(k))
          try {
            await k;
          } catch (E) {
            throw this.handleError(E);
          }
      }
      if (this.prepareVisitors(), this.hasListener) {
        let v = this.result.root;
        for (; !v[e]; ) {
          v[e] = !0;
          let b = [g(v)];
          for (; b.length > 0; ) {
            let k = this.visitTick(b);
            if (m(k))
              try {
                await k;
              } catch (E) {
                let O = b[b.length - 1].node;
                throw this.handleError(E, O);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [b, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = b;
            try {
              if (v.type === "document") {
                let E = v.nodes.map(
                  (O) => k(O, this.helpers)
                );
                await Promise.all(E);
              } else
                await k(v, this.helpers);
            } catch (E) {
              throw this.handleError(E);
            }
          }
      }
      return this.processed = !0, this.stringify();
    }
    runOnRoot(v) {
      this.result.lastPlugin = v;
      try {
        if (typeof v == "object" && v.Once) {
          if (this.result.root.type === "document") {
            let b = this.result.root.nodes.map(
              (k) => v.Once(k, this.helpers)
            );
            return m(b[0]) ? Promise.all(b) : b;
          }
          return v.Once(this.result.root, this.helpers);
        } else if (typeof v == "function")
          return v(this.result.root, this.result);
      } catch (b) {
        throw this.handleError(b);
      }
    }
    stringify() {
      if (this.error) throw this.error;
      if (this.stringified) return this.result;
      this.stringified = !0, this.sync();
      let v = this.result.opts, b = n;
      v.syntax && (b = v.syntax.stringify), v.stringifier && (b = v.stringifier), b.stringify && (b = b.stringify);
      let E = new r(b, this.result.root, this.result.opts).generate();
      return this.result.css = E[0], this.result.map = E[1], this.result;
    }
    sync() {
      if (this.error) throw this.error;
      if (this.processed) return this.result;
      if (this.processed = !0, this.processing)
        throw this.getAsyncError();
      for (let v of this.plugins) {
        let b = this.runOnRoot(v);
        if (m(b))
          throw this.getAsyncError();
      }
      if (this.prepareVisitors(), this.hasListener) {
        let v = this.result.root;
        for (; !v[e]; )
          v[e] = !0, this.walkSync(v);
        if (this.listeners.OnceExit)
          if (v.type === "document")
            for (let b of v.nodes)
              this.visitSync(this.listeners.OnceExit, b);
          else
            this.visitSync(this.listeners.OnceExit, v);
      }
      return this.result;
    }
    then(v, b) {
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || c(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(v, b);
    }
    toString() {
      return this.css;
    }
    visitSync(v, b) {
      for (let [k, E] of v) {
        this.result.lastPlugin = k;
        let O;
        try {
          O = E(b, this.helpers);
        } catch (M) {
          throw this.handleError(M, b.proxyOf);
        }
        if (b.type !== "root" && b.type !== "document" && !b.parent)
          return !0;
        if (m(O))
          throw this.getAsyncError();
      }
    }
    visitTick(v) {
      let b = v[v.length - 1], { node: k, visitors: E } = b;
      if (k.type !== "root" && k.type !== "document" && !k.parent) {
        v.pop();
        return;
      }
      if (E.length > 0 && b.visitorIndex < E.length) {
        let [M, D] = E[b.visitorIndex];
        b.visitorIndex += 1, b.visitorIndex === E.length && (b.visitors = [], b.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return D(k.toProxy(), this.helpers);
        } catch (N) {
          throw this.handleError(N, k);
        }
      }
      if (b.iterator !== 0) {
        let M = b.iterator, D;
        for (; D = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !D[e]) {
            D[e] = !0, v.push(g(D));
            return;
          }
        b.iterator = 0, delete k.indexes[M];
      }
      let O = b.events;
      for (; b.eventIndex < O.length; ) {
        let M = O[b.eventIndex];
        if (b.eventIndex += 1, M === l) {
          k.nodes && k.nodes.length && (k[e] = !0, b.iterator = k.getIterator());
          return;
        } else if (this.listeners[M]) {
          b.visitors = this.listeners[M];
          return;
        }
      }
      v.pop();
    }
    walkSync(v) {
      v[e] = !0;
      let b = f(v);
      for (let k of b)
        if (k === l)
          v.nodes && v.each((E) => {
            E[e] || this.walkSync(E);
          });
        else {
          let E = this.listeners[k];
          if (E && this.visitSync(E, v.toProxy()))
            return;
        }
    }
    warnings() {
      return this.sync().warnings();
    }
    get content() {
      return this.stringify().content;
    }
    get css() {
      return this.stringify().css;
    }
    get map() {
      return this.stringify().map;
    }
    get messages() {
      return this.sync().messages;
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      return this.sync().root;
    }
    get [Symbol.toStringTag]() {
      return "LazyResult";
    }
  }
  return w.registerPostcss = (S) => {
    y = S;
  }, li = w, w.default = w, p.registerLazyResult(w), s.registerLazyResult(w), li;
}
var ci, fs;
function Xc() {
  if (fs) return ci;
  fs = 1;
  let e = go(), t = er(), r = yo(), n = Bi();
  const i = zi();
  class s {
    constructor(h, o, p) {
      o = o.toString(), this.stringified = !1, this._processor = h, this._css = o, this._opts = p, this._map = void 0;
      let a, d = t;
      this.result = new i(this._processor, a, this._opts), this.result.css = o;
      let u = this;
      Object.defineProperty(this.result, "root", {
        get() {
          return u.root;
        }
      });
      let l = new e(d, a, this._opts, o);
      if (l.isMap()) {
        let [m, f] = l.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        l.clearAnnotation(), this.result.css = l.css;
    }
    async() {
      return this.error ? Promise.reject(this.error) : Promise.resolve(this.result);
    }
    catch(h) {
      return this.async().catch(h);
    }
    finally(h) {
      return this.async().then(h, h);
    }
    sync() {
      if (this.error) throw this.error;
      return this.result;
    }
    then(h, o) {
      return process.env.NODE_ENV !== "production" && ("from" in this._opts || r(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(h, o);
    }
    toString() {
      return this._css;
    }
    warnings() {
      return [];
    }
    get content() {
      return this.result.css;
    }
    get css() {
      return this.result.css;
    }
    get map() {
      return this.result.map;
    }
    get messages() {
      return [];
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      if (this._root)
        return this._root;
      let h, o = n;
      try {
        h = o(this._css, this._opts);
      } catch (p) {
        this.error = p;
      }
      if (this.error)
        throw this.error;
      return this._root = h, h;
    }
    get [Symbol.toStringTag]() {
      return "NoWorkResult";
    }
  }
  return ci = s, s.default = s, ci;
}
var ui, ms;
function Kc() {
  if (ms) return ui;
  ms = 1;
  let e = Xc(), t = wo(), r = Di(), n = bt();
  class i {
    constructor(c = []) {
      this.version = "8.4.38", this.plugins = this.normalize(c);
    }
    normalize(c) {
      let h = [];
      for (let o of c)
        if (o.postcss === !0 ? o = o() : o.postcss && (o = o.postcss), typeof o == "object" && Array.isArray(o.plugins))
          h = h.concat(o.plugins);
        else if (typeof o == "object" && o.postcssPlugin)
          h.push(o);
        else if (typeof o == "function")
          h.push(o);
        else if (typeof o == "object" && (o.parse || o.stringify)) {
          if (process.env.NODE_ENV !== "production")
            throw new Error(
              "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
            );
        } else
          throw new Error(o + " is not a PostCSS plugin");
      return h;
    }
    process(c, h = {}) {
      return !this.plugins.length && !h.parser && !h.stringifier && !h.syntax ? new e(this, c, h) : new t(this, c, h);
    }
    use(c) {
      return this.plugins = this.plugins.concat(this.normalize([c])), this;
    }
  }
  return ui = i, i.default = i, n.registerProcessor(i), r.registerProcessor(i), ui;
}
var di, gs;
function Zc() {
  if (gs) return di;
  gs = 1;
  let e = rr(), t = mo(), r = nr(), n = Fi(), i = ir(), s = bt(), c = Ui();
  function h(o, p) {
    if (Array.isArray(o)) return o.map((u) => h(u));
    let { inputs: a, ...d } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let l = { ...u, __proto__: i.prototype };
        l.map && (l.map = {
          ...l.map,
          __proto__: t.prototype
        }), p.push(l);
      }
    }
    if (d.nodes && (d.nodes = o.nodes.map((u) => h(u, p))), d.source) {
      let { inputId: u, ...l } = d.source;
      d.source = l, u != null && (d.source.input = p[u]);
    }
    if (d.type === "root")
      return new s(d);
    if (d.type === "decl")
      return new e(d);
    if (d.type === "rule")
      return new c(d);
    if (d.type === "comment")
      return new r(d);
    if (d.type === "atrule")
      return new n(d);
    throw new Error("Unknown node type: " + o.type);
  }
  return di = h, h.default = h, di;
}
var hi, ys;
function Qc() {
  if (ys) return hi;
  ys = 1;
  let e = _i(), t = rr(), r = wo(), n = Je(), i = Kc(), s = er(), c = Zc(), h = Di(), o = bo(), p = nr(), a = Fi(), d = zi(), u = ir(), l = Bi(), m = vo(), f = Ui(), g = bt(), x = tr();
  function y(...w) {
    return w.length === 1 && Array.isArray(w[0]) && (w = w[0]), new i(w);
  }
  return y.plugin = function(S, v) {
    let b = !1;
    function k(...O) {
      console && console.warn && !b && (b = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = v(...O);
      return M.postcssPlugin = S, M.postcssVersion = new i().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(O, M, D) {
      return y([k(D)]).process(O, M);
    }, k;
  }, y.stringify = s, y.parse = l, y.fromJSON = c, y.list = m, y.comment = (w) => new p(w), y.atRule = (w) => new a(w), y.decl = (w) => new t(w), y.rule = (w) => new f(w), y.root = (w) => new g(w), y.document = (w) => new h(w), y.CssSyntaxError = e, y.Declaration = t, y.Container = n, y.Processor = i, y.Document = h, y.Comment = p, y.Warning = o, y.AtRule = a, y.Result = d, y.Input = u, y.Rule = f, y.Root = g, y.Node = x, r.registerPostcss(y), hi = y, y.default = y, hi;
}
var eu = Qc();
const Q = /* @__PURE__ */ Wc(eu);
Q.stringify;
Q.fromJSON;
Q.plugin;
Q.parse;
Q.list;
Q.document;
Q.comment;
Q.atRule;
Q.rule;
Q.decl;
Q.root;
Q.CssSyntaxError;
Q.Declaration;
Q.Container;
Q.Processor;
Q.Document;
Q.Comment;
Q.Warning;
Q.AtRule;
Q.Result;
Q.Input;
Q.Rule;
Q.Root;
Q.Node;
class Wi {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  constructor(...t) {
    Ee(this, "parentElement", null), Ee(this, "parentNode", null), Ee(this, "ownerDocument"), Ee(this, "firstChild", null), Ee(this, "lastChild", null), Ee(this, "previousSibling", null), Ee(this, "nextSibling", null), Ee(this, "ELEMENT_NODE", 1), Ee(this, "TEXT_NODE", 3), Ee(this, "nodeType"), Ee(this, "nodeName"), Ee(this, "RRNodeType");
  }
  get childNodes() {
    const t = [];
    let r = this.firstChild;
    for (; r; )
      t.push(r), r = r.nextSibling;
    return t;
  }
  contains(t) {
    if (t instanceof Wi) {
      if (t.ownerDocument !== this.ownerDocument) return !1;
      if (t === this) return !0;
    } else return !1;
    for (; t.parentNode; ) {
      if (t.parentNode === this) return !0;
      t = t.parentNode;
    }
    return !1;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  appendChild(t) {
    throw new Error(
      "RRDomException: Failed to execute 'appendChild' on 'RRNode': This RRNode type does not support this method."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  insertBefore(t, r) {
    throw new Error(
      "RRDomException: Failed to execute 'insertBefore' on 'RRNode': This RRNode type does not support this method."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeChild(t) {
    throw new Error(
      "RRDomException: Failed to execute 'removeChild' on 'RRNode': This RRNode type does not support this method."
    );
  }
  toString() {
    return "RRNode";
  }
}
const bs = {
  Node: [
    "childNodes",
    "parentNode",
    "parentElement",
    "textContent",
    "ownerDocument"
  ],
  ShadowRoot: ["host", "styleSheets"],
  Element: ["shadowRoot", "querySelector", "querySelectorAll"],
  MutationObserver: []
}, vs = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, At = {}, xo = {}, tu = () => !!globalThis.Zone;
function qi(e) {
  if (At[e])
    return At[e];
  const t = globalThis[e], r = t.prototype, n = e in bs ? bs[e] : void 0, i = !!(n && // @ts-expect-error 2345
  n.every(
    (h) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, h)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in vs ? vs[e] : void 0, c = !!(s && s.every(
    // @ts-expect-error 2345
    (h) => {
      var o;
      return typeof r[h] == "function" && ((o = r[h]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (i && c && !tu())
    return At[e] = t.prototype, t.prototype;
  try {
    const h = document.createElement("iframe");
    h.style.display = "none", document.body.appendChild(h);
    const o = h.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return h.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (h.classList.add("rr-block"), h.setAttribute("__rrwebUntaintedMutationObserver", ""), xo[e] = () => h.remove()) : h.remove(), At[e] = p;
  } catch {
    return r;
  }
}
const pi = {};
function _e(e, t, r) {
  var n;
  const i = `${e}.${String(r)}`;
  if (pi[i])
    return pi[i].call(
      t
    );
  const s = qi(e), c = (n = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : n.get;
  return c ? (pi[i] = c, c.call(t)) : t[r];
}
const fi = {};
function ko(e, t, r) {
  const n = `${e}.${String(r)}`;
  if (fi[n])
    return fi[n].bind(
      t
    );
  const s = qi(e)[r];
  return typeof s != "function" ? t[r] : (fi[n] = s, s.bind(t));
}
function ru(e) {
  return _e("Node", e, "ownerDocument");
}
function iu(e) {
  return _e("Node", e, "childNodes");
}
function nu(e) {
  return _e("Node", e, "parentNode");
}
function su(e) {
  return _e("Node", e, "parentElement");
}
function ou(e) {
  return _e("Node", e, "textContent");
}
function au(e, t) {
  return ko("Node", e, "contains")(t);
}
function lu(e) {
  return ko("Node", e, "getRootNode")();
}
function cu(e) {
  return !e || !("host" in e) ? null : _e("ShadowRoot", e, "host");
}
function uu(e) {
  return e.styleSheets;
}
function du(e) {
  return !e || !("shadowRoot" in e) ? null : _e("Element", e, "shadowRoot");
}
function hu(e, t) {
  return _e("Element", e, "querySelector")(t);
}
function pu(e, t) {
  return _e("Element", e, "querySelectorAll")(t);
}
function So() {
  return [
    qi("MutationObserver").constructor,
    xo.MutationObserver ?? (() => {
    })
  ];
}
let mt = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (mt = () => (/* @__PURE__ */ new Date()).getTime());
function Xe(e, t, r) {
  try {
    if (!(t in e))
      return () => {
      };
    const n = e[t], i = r(n);
    return typeof i == "function" && (i.prototype = i.prototype || {}, Object.defineProperties(i, {
      __rrweb_original__: {
        enumerable: !1,
        value: n
      }
    })), e[t] = i, () => {
      e[t] = n;
    };
  } catch {
    return () => {
    };
  }
}
const U = {
  ownerDocument: ru,
  childNodes: iu,
  parentNode: nu,
  parentElement: su,
  textContent: ou,
  contains: au,
  getRootNode: lu,
  host: cu,
  styleSheets: uu,
  shadowRoot: du,
  querySelector: hu,
  querySelectorAll: pu,
  nowTimestamp: mt,
  mutationObserverCtor: So,
  patch: Xe
};
function he(e, t, r = document) {
  const n = { capture: !0, passive: !0 };
  return r.addEventListener(e, t, n), () => r.removeEventListener(e, t, n);
}
const tt = `Please stop import mirror directly. Instead of that,\r
now you can use replayer.getMirror() to access the mirror instance of a replayer,\r
or you can use record.mirror to access the mirror instance during recording.`;
let ws = {
  map: {},
  getId() {
    return console.error(tt), -1;
  },
  getNode() {
    return console.error(tt), null;
  },
  removeNodeFromMap() {
    console.error(tt);
  },
  has() {
    return console.error(tt), !1;
  },
  reset() {
    console.error(tt);
  }
};
typeof window < "u" && window.Proxy && window.Reflect && (ws = new Proxy(ws, {
  get(e, t, r) {
    return t === "map" && console.error(tt), Reflect.get(e, t, r);
  }
}));
function gt(e, t, r = {}) {
  let n = null, i = 0;
  return function(...s) {
    const c = Date.now();
    !i && r.leading === !1 && (i = c);
    const h = t - (c - i), o = this;
    h <= 0 || h > t ? (n && (clearTimeout(n), n = null), i = c, e.apply(o, s)) : !n && r.trailing !== !1 && (n = setTimeout(() => {
      i = r.leading === !1 ? 0 : Date.now(), n = null, e.apply(o, s);
    }, h));
  };
}
function sr(e, t, r, n, i = window) {
  const s = i.Object.getOwnPropertyDescriptor(e, t);
  return i.Object.defineProperty(
    e,
    t,
    n ? r : {
      set(c) {
        setTimeout(() => {
          r.set.call(this, c);
        }, 0), s && s.set && s.set.call(this, c);
      }
    }
  ), () => sr(e, t, s || {}, !0);
}
function Co(e) {
  var t, r, n, i;
  const s = e.document;
  return {
    left: s.scrollingElement ? s.scrollingElement.scrollLeft : e.pageXOffset !== void 0 ? e.pageXOffset : s.documentElement.scrollLeft || (s == null ? void 0 : s.body) && ((t = U.parentElement(s.body)) == null ? void 0 : t.scrollLeft) || ((r = s == null ? void 0 : s.body) == null ? void 0 : r.scrollLeft) || 0,
    top: s.scrollingElement ? s.scrollingElement.scrollTop : e.pageYOffset !== void 0 ? e.pageYOffset : (s == null ? void 0 : s.documentElement.scrollTop) || (s == null ? void 0 : s.body) && ((n = U.parentElement(s.body)) == null ? void 0 : n.scrollTop) || ((i = s == null ? void 0 : s.body) == null ? void 0 : i.scrollTop) || 0
  };
}
function Eo() {
  return window.innerHeight || document.documentElement && document.documentElement.clientHeight || document.body && document.body.clientHeight;
}
function Mo() {
  return window.innerWidth || document.documentElement && document.documentElement.clientWidth || document.body && document.body.clientWidth;
}
function Ro(e) {
  return e ? e.nodeType === e.ELEMENT_NODE ? e : U.parentElement(e) : null;
}
function pe(e, t, r, n) {
  if (!e)
    return !1;
  const i = Ro(e);
  if (!i)
    return !1;
  try {
    if (typeof t == "string") {
      if (i.classList.contains(t) || n && i.closest("." + t) !== null) return !0;
    } else if (Wt(i, t, n)) return !0;
  } catch {
  }
  return !!(r && (i.matches(r) || n && i.closest(r) !== null));
}
function fu(e, t) {
  return t.getId(e) !== -1;
}
function mi(e, t, r) {
  return e.tagName === "TITLE" && r.headTitleMutations ? !0 : t.getId(e) === ft;
}
function Oo(e, t) {
  if (dt(e))
    return !1;
  const r = t.getId(e);
  if (!t.has(r))
    return !0;
  const n = U.parentNode(e);
  return n && n.nodeType === e.DOCUMENT_NODE ? !1 : n ? Oo(n, t) : !0;
}
function wi(e) {
  return !!e.changedTouches;
}
function mu(e = window) {
  "NodeList" in e && !e.NodeList.prototype.forEach && (e.NodeList.prototype.forEach = Array.prototype.forEach), "DOMTokenList" in e && !e.DOMTokenList.prototype.forEach && (e.DOMTokenList.prototype.forEach = Array.prototype.forEach);
}
function Io(e, t) {
  return !!(e.nodeName === "IFRAME" && t.getMeta(e));
}
function Ao(e, t) {
  return !!(e.nodeName === "LINK" && e.nodeType === e.ELEMENT_NODE && e.getAttribute && e.getAttribute("rel") === "stylesheet" && t.getMeta(e));
}
function xi(e) {
  return e ? e instanceof Wi && "shadowRoot" in e ? !!e.shadowRoot : !!U.shadowRoot(e) : !1;
}
class gu {
  constructor() {
    L(this, "id", 1), L(this, "styleIDMap", /* @__PURE__ */ new WeakMap()), L(this, "idStyleMap", /* @__PURE__ */ new Map());
  }
  getId(t) {
    return this.styleIDMap.get(t) ?? -1;
  }
  has(t) {
    return this.styleIDMap.has(t);
  }
  /**
   * @returns If the stylesheet is in the mirror, returns the id of the stylesheet. If not, return the new assigned id.
   */
  add(t, r) {
    if (this.has(t)) return this.getId(t);
    let n;
    return r === void 0 ? n = this.id++ : n = r, this.styleIDMap.set(t, n), this.idStyleMap.set(n, t), n;
  }
  getStyle(t) {
    return this.idStyleMap.get(t) || null;
  }
  reset() {
    this.styleIDMap = /* @__PURE__ */ new WeakMap(), this.idStyleMap = /* @__PURE__ */ new Map(), this.id = 1;
  }
  generateId() {
    return this.id++;
  }
}
function Lo(e) {
  var t;
  let r = null;
  return "getRootNode" in e && ((t = U.getRootNode(e)) == null ? void 0 : t.nodeType) === Node.DOCUMENT_FRAGMENT_NODE && U.host(U.getRootNode(e)) && (r = U.host(U.getRootNode(e))), r;
}
function yu(e) {
  let t = e, r;
  for (; r = Lo(t); )
    t = r;
  return t;
}
function bu(e) {
  const t = U.ownerDocument(e);
  if (!t) return !1;
  const r = yu(e);
  return U.contains(t, r);
}
function Po(e) {
  const t = U.ownerDocument(e);
  return t ? U.contains(t, e) || bu(e) : !1;
}
var V = /* @__PURE__ */ ((e) => (e[e.DomContentLoaded = 0] = "DomContentLoaded", e[e.Load = 1] = "Load", e[e.FullSnapshot = 2] = "FullSnapshot", e[e.IncrementalSnapshot = 3] = "IncrementalSnapshot", e[e.Meta = 4] = "Meta", e[e.Custom = 5] = "Custom", e[e.Plugin = 6] = "Plugin", e[e.Asset = 7] = "Asset", e))(V || {}), W = /* @__PURE__ */ ((e) => (e[e.Mutation = 0] = "Mutation", e[e.MouseMove = 1] = "MouseMove", e[e.MouseInteraction = 2] = "MouseInteraction", e[e.Scroll = 3] = "Scroll", e[e.ViewportResize = 4] = "ViewportResize", e[e.Input = 5] = "Input", e[e.TouchMove = 6] = "TouchMove", e[e.MediaInteraction = 7] = "MediaInteraction", e[e.StyleSheetRule = 8] = "StyleSheetRule", e[e.CanvasMutation = 9] = "CanvasMutation", e[e.Font = 10] = "Font", e[e.Log = 11] = "Log", e[e.Drag = 12] = "Drag", e[e.StyleDeclaration = 13] = "StyleDeclaration", e[e.Selection = 14] = "Selection", e[e.AdoptedStyleSheet = 15] = "AdoptedStyleSheet", e[e.CustomElement = 16] = "CustomElement", e))(W || {}), fe = /* @__PURE__ */ ((e) => (e[e.MouseUp = 0] = "MouseUp", e[e.MouseDown = 1] = "MouseDown", e[e.Click = 2] = "Click", e[e.ContextMenu = 3] = "ContextMenu", e[e.DblClick = 4] = "DblClick", e[e.Focus = 5] = "Focus", e[e.Blur = 6] = "Blur", e[e.TouchStart = 7] = "TouchStart", e[e.TouchMove_Departed = 8] = "TouchMove_Departed", e[e.TouchEnd = 9] = "TouchEnd", e[e.TouchCancel = 10] = "TouchCancel", e))(fe || {}), Te = /* @__PURE__ */ ((e) => (e[e.Mouse = 0] = "Mouse", e[e.Pen = 1] = "Pen", e[e.Touch = 2] = "Touch", e))(Te || {}), lt = /* @__PURE__ */ ((e) => (e[e["2D"] = 0] = "2D", e[e.WebGL = 1] = "WebGL", e[e.WebGL2 = 2] = "WebGL2", e))(lt || {}), rt = /* @__PURE__ */ ((e) => (e[e.Play = 0] = "Play", e[e.Pause = 1] = "Pause", e[e.Seeked = 2] = "Seeked", e[e.VolumeChange = 3] = "VolumeChange", e[e.RateChange = 4] = "RateChange", e))(rt || {}), To = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(To || {});
function xs(e) {
  return "__ln" in e;
}
class vu {
  constructor() {
    L(this, "length", 0), L(this, "head", null), L(this, "tail", null);
  }
  get(t) {
    if (t >= this.length)
      throw new Error("Position outside of list range");
    let r = this.head;
    for (let n = 0; n < t; n++)
      r = (r == null ? void 0 : r.next) || null;
    return r;
  }
  addNode(t) {
    const r = {
      value: t,
      previous: null,
      next: null
    };
    if (t.__ln = r, t.previousSibling && xs(t.previousSibling)) {
      const n = t.previousSibling.__ln.next;
      r.next = n, r.previous = t.previousSibling.__ln, t.previousSibling.__ln.next = r, n && (n.previous = r);
    } else if (t.nextSibling && xs(t.nextSibling) && t.nextSibling.__ln.previous) {
      const n = t.nextSibling.__ln.previous;
      r.previous = n, r.next = t.nextSibling.__ln, t.nextSibling.__ln.previous = r, n && (n.next = r);
    } else
      this.head && (this.head.previous = r), r.next = this.head, this.head = r;
    r.next === null && (this.tail = r), this.length++;
  }
  removeNode(t) {
    const r = t.__ln;
    this.head && (r.previous ? (r.previous.next = r.next, r.next ? r.next.previous = r.previous : this.tail = r.previous) : (this.head = r.next, this.head ? this.head.previous = null : this.tail = null), t.__ln && delete t.__ln, this.length--);
  }
}
const ks = (e, t) => `${e}@${t}`;
class wu {
  constructor() {
    L(this, "frozen", !1), L(this, "locked", !1), L(this, "texts", []), L(this, "attributes", []), L(this, "attributeMap", /* @__PURE__ */ new WeakMap()), L(this, "removes", []), L(this, "mapRemoves", []), L(this, "movedMap", {}), L(this, "addedSet", /* @__PURE__ */ new Set()), L(this, "movedSet", /* @__PURE__ */ new Set()), L(this, "droppedSet", /* @__PURE__ */ new Set()), L(this, "removesSubTreeCache", /* @__PURE__ */ new Set()), L(this, "mutationCb"), L(this, "blockClass"), L(this, "blockSelector"), L(this, "maskTextClass"), L(this, "maskTextSelector"), L(this, "inlineStylesheet"), L(this, "maskInputOptions"), L(this, "maskTextFn"), L(this, "maskInputFn"), L(this, "keepIframeSrcFn"), L(this, "recordCanvas"), L(this, "inlineImages"), L(this, "slimDOMOptions"), L(this, "dataURLOptions"), L(this, "doc"), L(this, "mirror"), L(this, "iframeManager"), L(this, "stylesheetManager"), L(this, "shadowDomManager"), L(this, "canvasManager"), L(this, "processedNodeManager"), L(this, "unattachedDoc"), L(this, "processMutations", (t) => {
      t.forEach(this.processMutation), this.emit();
    }), L(this, "emit", () => {
      if (this.frozen || this.locked)
        return;
      const t = [], r = /* @__PURE__ */ new Set(), n = new vu(), i = (o) => {
        let p = o, a = ft;
        for (; a === ft; )
          p = p && p.nextSibling, a = p && this.mirror.getId(p);
        return a;
      }, s = (o) => {
        const p = U.parentNode(o);
        if (!p || !Po(o))
          return;
        let a = !1;
        if (o.nodeType === Node.TEXT_NODE) {
          const m = p.tagName;
          if (m === "TEXTAREA")
            return;
          m === "STYLE" && this.addedSet.has(p) && (a = !0);
        }
        const d = dt(p) ? this.mirror.getId(Lo(o)) : this.mirror.getId(p), u = i(o);
        if (d === -1 || u === -1)
          return n.addNode(o);
        const l = nt(o, {
          doc: this.doc,
          mirror: this.mirror,
          blockClass: this.blockClass,
          blockSelector: this.blockSelector,
          maskTextClass: this.maskTextClass,
          maskTextSelector: this.maskTextSelector,
          skipChild: !0,
          newlyAddedElement: !0,
          inlineStylesheet: this.inlineStylesheet,
          maskInputOptions: this.maskInputOptions,
          maskTextFn: this.maskTextFn,
          maskInputFn: this.maskInputFn,
          slimDOMOptions: this.slimDOMOptions,
          dataURLOptions: this.dataURLOptions,
          recordCanvas: this.recordCanvas,
          inlineImages: this.inlineImages,
          onSerialize: (m) => {
            Io(m, this.mirror) && this.iframeManager.addIframe(m), Ao(m, this.mirror) && this.stylesheetManager.trackLinkElement(
              m
            ), xi(o) && this.shadowDomManager.addShadowRoot(U.shadowRoot(o), this.doc);
          },
          onIframeLoad: (m, f) => {
            this.iframeManager.attachIframe(m, f), this.shadowDomManager.observeAttachShadow(m);
          },
          onStylesheetLoad: (m, f) => {
            this.stylesheetManager.attachLinkElement(m, f);
          },
          cssCaptured: a
        });
        l && (t.push({
          parentId: d,
          nextId: u,
          node: l
        }), r.add(l.id));
      };
      for (; this.mapRemoves.length; )
        this.mirror.removeNodeFromMap(this.mapRemoves.shift());
      for (const o of this.movedSet)
        Ss(this.removesSubTreeCache, o, this.mirror) && !this.movedSet.has(U.parentNode(o)) || s(o);
      for (const o of this.addedSet)
        !Cs(this.droppedSet, o) && !Ss(this.removesSubTreeCache, o, this.mirror) || Cs(this.movedSet, o) ? s(o) : this.droppedSet.add(o);
      let c = null;
      for (; n.length; ) {
        let o = null;
        if (c) {
          const p = this.mirror.getId(U.parentNode(c.value)), a = i(c.value);
          p !== -1 && a !== -1 && (o = c);
        }
        if (!o) {
          let p = n.tail;
          for (; p; ) {
            const a = p;
            if (p = p.previous, a) {
              const d = this.mirror.getId(U.parentNode(a.value));
              if (i(a.value) === -1) continue;
              if (d !== -1) {
                o = a;
                break;
              } else {
                const l = a.value, m = U.parentNode(l);
                if (m && m.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                  const f = U.host(m);
                  if (this.mirror.getId(f) !== -1) {
                    o = a;
                    break;
                  }
                }
              }
            }
          }
        }
        if (!o) {
          for (; n.head; )
            n.removeNode(n.head.value);
          break;
        }
        c = o.previous, n.removeNode(o.value), s(o.value);
      }
      const h = {
        texts: this.texts.map((o) => {
          const p = o.node, a = U.parentNode(p);
          return a && a.tagName === "TEXTAREA" && this.genTextAreaValueMutation(a), {
            id: this.mirror.getId(p),
            value: o.value
          };
        }).filter((o) => !r.has(o.id)).filter((o) => this.mirror.has(o.id)),
        attributes: this.attributes.map((o) => {
          const { attributes: p } = o;
          if (typeof p.style == "string") {
            const a = JSON.stringify(o.styleDiff), d = JSON.stringify(o._unchangedStyles);
            a.length < p.style.length && (a + d).split("var(").length === p.style.split("var(").length && (p.style = o.styleDiff);
          }
          return {
            id: this.mirror.getId(o.node),
            attributes: p
          };
        }).filter((o) => !r.has(o.id)).filter((o) => this.mirror.has(o.id)),
        removes: this.removes,
        adds: t
      };
      !h.texts.length && !h.attributes.length && !h.removes.length && !h.adds.length || (this.texts = [], this.attributes = [], this.attributeMap = /* @__PURE__ */ new WeakMap(), this.removes = [], this.addedSet = /* @__PURE__ */ new Set(), this.movedSet = /* @__PURE__ */ new Set(), this.droppedSet = /* @__PURE__ */ new Set(), this.removesSubTreeCache = /* @__PURE__ */ new Set(), this.movedMap = {}, this.mutationCb(h));
    }), L(this, "genTextAreaValueMutation", (t) => {
      let r = this.attributeMap.get(t);
      r || (r = {
        node: t,
        attributes: {},
        styleDiff: {},
        _unchangedStyles: {}
      }, this.attributes.push(r), this.attributeMap.set(t, r));
      const n = Array.from(
        U.childNodes(t),
        (i) => U.textContent(i) || ""
      ).join("");
      r.attributes.value = Ft({
        element: t,
        maskInputOptions: this.maskInputOptions,
        tagName: t.tagName,
        type: Ut(t),
        value: n,
        maskInputFn: this.maskInputFn
      });
    }), L(this, "processMutation", (t) => {
      if (!mi(t.target, this.mirror, this.slimDOMOptions))
        switch (t.type) {
          case "characterData": {
            const r = U.textContent(t.target);
            !pe(t.target, this.blockClass, this.blockSelector, !1) && r !== t.oldValue && this.texts.push({
              value: no(
                t.target,
                this.maskTextClass,
                this.maskTextSelector,
                !0
                // checkAncestors
              ) && r ? this.maskTextFn ? this.maskTextFn(r, Ro(t.target)) : r.replace(/[\S]/g, "*") : r,
              node: t.target
            });
            break;
          }
          case "attributes": {
            const r = t.target;
            let n = t.attributeName, i = t.target.getAttribute(n);
            if (n === "value") {
              const c = Ut(r);
              i = Ft({
                element: r,
                maskInputOptions: this.maskInputOptions,
                tagName: r.tagName,
                type: c,
                value: i,
                maskInputFn: this.maskInputFn
              });
            }
            if (pe(t.target, this.blockClass, this.blockSelector, !1) || i === t.oldValue)
              return;
            let s = this.attributeMap.get(t.target);
            if (r.tagName === "IFRAME" && n === "src" && !this.keepIframeSrcFn(i))
              if (!r.contentDocument)
                n = "rr_src";
              else
                return;
            if (s || (s = {
              node: t.target,
              attributes: {},
              styleDiff: {},
              _unchangedStyles: {}
            }, this.attributes.push(s), this.attributeMap.set(t.target, s)), n === "type" && r.tagName === "INPUT" && (t.oldValue || "").toLowerCase() === "password" && r.setAttribute("data-rr-is-password", "true"), !io(r.tagName, n))
              if (s.attributes[n] = ro(
                this.doc,
                Ge(r.tagName),
                Ge(n),
                i
              ), n === "style") {
                if (!this.unattachedDoc)
                  try {
                    this.unattachedDoc = document.implementation.createHTMLDocument();
                  } catch {
                    this.unattachedDoc = this.doc;
                  }
                const c = this.unattachedDoc.createElement("span");
                t.oldValue && c.setAttribute("style", t.oldValue);
                for (const h of Array.from(r.style)) {
                  const o = r.style.getPropertyValue(h), p = r.style.getPropertyPriority(h);
                  o !== c.style.getPropertyValue(h) || p !== c.style.getPropertyPriority(h) ? p === "" ? s.styleDiff[h] = o : s.styleDiff[h] = [o, p] : s._unchangedStyles[h] = [o, p];
                }
                for (const h of Array.from(c.style))
                  r.style.getPropertyValue(h) === "" && (s.styleDiff[h] = !1);
              } else n === "open" && r.tagName === "DIALOG" && (r.matches("dialog:modal") ? s.attributes.rr_open_mode = "modal" : s.attributes.rr_open_mode = "non-modal");
            break;
          }
          case "childList": {
            if (pe(t.target, this.blockClass, this.blockSelector, !0))
              return;
            if (t.target.tagName === "TEXTAREA") {
              this.genTextAreaValueMutation(t.target);
              return;
            }
            t.addedNodes.forEach((r) => this.genAdds(r, t.target)), t.removedNodes.forEach((r) => {
              const n = this.mirror.getId(r), i = dt(t.target) ? this.mirror.getId(U.host(t.target)) : this.mirror.getId(t.target);
              pe(t.target, this.blockClass, this.blockSelector, !1) || mi(r, this.mirror, this.slimDOMOptions) || !fu(r, this.mirror) || (this.addedSet.has(r) ? (ki(this.addedSet, r), this.droppedSet.add(r)) : this.addedSet.has(t.target) && n === -1 || Oo(t.target, this.mirror) || (this.movedSet.has(r) && this.movedMap[ks(n, i)] ? ki(this.movedSet, r) : (this.removes.push({
                parentId: i,
                id: n,
                isShadow: dt(t.target) && ht(t.target) ? !0 : void 0
              }), xu(r, this.removesSubTreeCache))), this.mapRemoves.push(r));
            });
            break;
          }
        }
    }), L(this, "genAdds", (t, r) => {
      if (!this.processedNodeManager.inOtherBuffer(t, this) && !(this.addedSet.has(t) || this.movedSet.has(t))) {
        if (this.mirror.hasNode(t)) {
          if (mi(t, this.mirror, this.slimDOMOptions))
            return;
          this.movedSet.add(t);
          let n = null;
          r && this.mirror.hasNode(r) && (n = this.mirror.getId(r)), n && n !== -1 && (this.movedMap[ks(this.mirror.getId(t), n)] = !0);
        } else
          this.addedSet.add(t), this.droppedSet.delete(t);
        pe(t, this.blockClass, this.blockSelector, !1) || (U.childNodes(t).forEach((n) => this.genAdds(n)), xi(t) && U.childNodes(U.shadowRoot(t)).forEach((n) => {
          this.processedNodeManager.add(n, this), this.genAdds(n, t);
        }));
      }
    });
  }
  init(t) {
    [
      "mutationCb",
      "blockClass",
      "blockSelector",
      "maskTextClass",
      "maskTextSelector",
      "inlineStylesheet",
      "maskInputOptions",
      "maskTextFn",
      "maskInputFn",
      "keepIframeSrcFn",
      "recordCanvas",
      "inlineImages",
      "slimDOMOptions",
      "dataURLOptions",
      "doc",
      "mirror",
      "iframeManager",
      "stylesheetManager",
      "shadowDomManager",
      "canvasManager",
      "processedNodeManager"
    ].forEach((r) => {
      this[r] = t[r];
    });
  }
  freeze() {
    this.frozen = !0, this.canvasManager.freeze();
  }
  unfreeze() {
    this.frozen = !1, this.canvasManager.unfreeze(), this.emit();
  }
  isFrozen() {
    return this.frozen;
  }
  lock() {
    this.locked = !0, this.canvasManager.lock();
  }
  unlock() {
    this.locked = !1, this.canvasManager.unlock(), this.emit();
  }
  reset() {
    this.shadowDomManager.reset(), this.canvasManager.reset();
  }
}
function ki(e, t) {
  e.delete(t), U.childNodes(t).forEach((r) => ki(e, r));
}
function xu(e, t) {
  const r = [e];
  for (; r.length; ) {
    const n = r.pop();
    t.has(n) || (t.add(n), U.childNodes(n).forEach((i) => r.push(i)));
  }
}
function Ss(e, t, r) {
  return e.size === 0 ? !1 : ku(e, t);
}
function ku(e, t, r) {
  const n = U.parentNode(t);
  return n ? e.has(n) : !1;
}
function Cs(e, t) {
  return e.size === 0 ? !1 : No(e, t);
}
function No(e, t) {
  const r = U.parentNode(t);
  return r ? e.has(r) ? !0 : No(e, r) : !1;
}
let pt;
function Su(e) {
  pt = e;
}
function Cu() {
  pt = void 0;
}
const H = (e) => pt ? (...r) => {
  try {
    return e(...r);
  } catch (n) {
    if (pt && pt(n) === !0)
      return;
    throw n;
  }
} : e, Ve = [];
function vt(e) {
  try {
    if ("composedPath" in e) {
      const t = e.composedPath();
      if (t.length)
        return t[0];
    } else if ("path" in e && e.path.length)
      return e.path[0];
  } catch {
  }
  return e && e.target;
}
function _o(e, t) {
  const r = new wu();
  Ve.push(r), r.init(e);
  const [n, i] = So(), s = new n(
    H(r.processMutations.bind(r))
  );
  return s.observe(t, {
    attributes: !0,
    attributeOldValue: !0,
    characterData: !0,
    characterDataOldValue: !0,
    childList: !0,
    subtree: !0
  }), [s, i];
}
function Eu({
  mousemoveCb: e,
  sampling: t,
  doc: r,
  mirror: n
}) {
  if (t.mousemove === !1)
    return () => {
    };
  const i = typeof t.mousemove == "number" ? t.mousemove : 50, s = typeof t.mousemoveCallback == "number" ? t.mousemoveCallback : 500;
  let c = [], h;
  const o = gt(
    H(
      (d) => {
        const u = Date.now() - h;
        e(
          c.map((l) => (l.timeOffset -= u, l)),
          d
        ), c = [], h = null;
      }
    ),
    s
  ), p = H(
    gt(
      H((d) => {
        const u = vt(d), { clientX: l, clientY: m } = wi(d) ? d.changedTouches[0] : d;
        h || (h = mt()), c.push({
          x: l,
          y: m,
          id: n.getId(u),
          timeOffset: mt() - h
        }), o(
          typeof DragEvent < "u" && d instanceof DragEvent ? W.Drag : d instanceof MouseEvent ? W.MouseMove : W.TouchMove
        );
      }),
      i,
      {
        trailing: !1
      }
    )
  ), a = [
    he("mousemove", p, r),
    he("touchmove", p, r),
    he("drag", p, r)
  ];
  return H(() => {
    a.forEach((d) => d());
  });
}
function Mu({
  mouseInteractionCb: e,
  doc: t,
  mirror: r,
  blockClass: n,
  blockSelector: i,
  sampling: s
}) {
  if (s.mouseInteraction === !1)
    return () => {
    };
  const c = s.mouseInteraction === !0 || s.mouseInteraction === void 0 ? {} : s.mouseInteraction, h = [];
  let o = null;
  const p = (a) => (d) => {
    const u = vt(d);
    if (pe(u, n, i, !0))
      return;
    let l = null, m = a;
    if ("pointerType" in d) {
      switch (d.pointerType) {
        case "mouse":
          l = Te.Mouse;
          break;
        case "touch":
          l = Te.Touch;
          break;
        case "pen":
          l = Te.Pen;
          break;
      }
      l === Te.Touch ? fe[a] === fe.MouseDown ? m = "TouchStart" : fe[a] === fe.MouseUp && (m = "TouchEnd") : Te.Pen;
    } else wi(d) && (l = Te.Touch);
    l !== null ? (o = l, (m.startsWith("Touch") && l === Te.Touch || m.startsWith("Mouse") && l === Te.Mouse) && (l = null)) : fe[a] === fe.Click && (l = o, o = null);
    const f = wi(d) ? d.changedTouches[0] : d;
    if (!f)
      return;
    const g = r.getId(u), { clientX: x, clientY: y } = f;
    H(e)({
      type: fe[m],
      id: g,
      x,
      y,
      ...l !== null && { pointerType: l }
    });
  };
  return Object.keys(fe).filter(
    (a) => Number.isNaN(Number(a)) && !a.endsWith("_Departed") && c[a] !== !1
  ).forEach((a) => {
    let d = Ge(a);
    const u = p(a);
    if (window.PointerEvent)
      switch (fe[a]) {
        case fe.MouseDown:
        case fe.MouseUp:
          d = d.replace(
            "mouse",
            "pointer"
          );
          break;
        case fe.TouchStart:
        case fe.TouchEnd:
          return;
      }
    h.push(he(d, u, t));
  }), H(() => {
    h.forEach((a) => a());
  });
}
function $o({
  scrollCb: e,
  doc: t,
  mirror: r,
  blockClass: n,
  blockSelector: i,
  sampling: s
}) {
  const c = H(
    gt(
      H((h) => {
        const o = vt(h);
        if (!o || pe(o, n, i, !0))
          return;
        const p = r.getId(o);
        if (o === t && t.defaultView) {
          const a = Co(t.defaultView);
          e({
            id: p,
            x: a.left,
            y: a.top
          });
        } else
          e({
            id: p,
            x: o.scrollLeft,
            y: o.scrollTop
          });
      }),
      s.scroll || 100
    )
  );
  return he("scroll", c, t);
}
function Ru({ viewportResizeCb: e }, { win: t }) {
  let r = -1, n = -1;
  const i = H(
    gt(
      H(() => {
        const s = Eo(), c = Mo();
        (r !== s || n !== c) && (e({
          width: Number(c),
          height: Number(s)
        }), r = s, n = c);
      }),
      200
    )
  );
  return he("resize", i, t);
}
const Ou = ["INPUT", "TEXTAREA", "SELECT"], Es = /* @__PURE__ */ new WeakMap();
function Iu({
  inputCb: e,
  doc: t,
  mirror: r,
  blockClass: n,
  blockSelector: i,
  ignoreClass: s,
  ignoreSelector: c,
  maskInputOptions: h,
  maskInputFn: o,
  sampling: p,
  userTriggeredOnInput: a
}) {
  function d(y) {
    let w = vt(y);
    const S = y.isTrusted, v = w && w.tagName;
    if (w && v === "OPTION" && (w = U.parentElement(w)), !w || !v || Ou.indexOf(v) < 0 || pe(w, n, i, !0) || w.classList.contains(s) || c && w.matches(c))
      return;
    let b = w.value, k = !1;
    const E = Ut(w) || "";
    E === "radio" || E === "checkbox" ? k = w.checked : (h[v.toLowerCase()] || h[E]) && (b = Ft({
      element: w,
      maskInputOptions: h,
      tagName: v,
      type: E,
      value: b,
      maskInputFn: o
    })), u(
      w,
      a ? { text: b, isChecked: k, userTriggered: S } : { text: b, isChecked: k }
    );
    const O = w.name;
    E === "radio" && O && k && t.querySelectorAll(`input[type="radio"][name="${O}"]`).forEach((M) => {
      if (M !== w) {
        const D = M.value;
        u(
          M,
          a ? { text: D, isChecked: !k, userTriggered: !1 } : { text: D, isChecked: !k }
        );
      }
    });
  }
  function u(y, w) {
    const S = Es.get(y);
    if (!S || S.text !== w.text || S.isChecked !== w.isChecked) {
      Es.set(y, w);
      const v = r.getId(y);
      H(e)({
        ...w,
        id: v
      });
    }
  }
  const m = (p.input === "last" ? ["change"] : ["input", "change"]).map(
    (y) => he(y, H(d), t)
  ), f = t.defaultView;
  if (!f)
    return () => {
      m.forEach((y) => y());
    };
  const g = f.Object.getOwnPropertyDescriptor(
    f.HTMLInputElement.prototype,
    "value"
  ), x = [
    [f.HTMLInputElement.prototype, "value"],
    [f.HTMLInputElement.prototype, "checked"],
    [f.HTMLSelectElement.prototype, "value"],
    [f.HTMLTextAreaElement.prototype, "value"],
    // Some UI library use selectedIndex to set select value
    [f.HTMLSelectElement.prototype, "selectedIndex"],
    [f.HTMLOptionElement.prototype, "selected"]
  ];
  return g && g.set && m.push(
    ...x.map(
      (y) => sr(
        y[0],
        y[1],
        {
          set() {
            H(d)({
              target: this,
              isTrusted: !1
              // userTriggered to false as this could well be programmatic
            });
          }
        },
        !1,
        f
      )
    )
  ), H(() => {
    m.forEach((y) => y());
  });
}
function qt(e) {
  const t = [];
  function r(n, i) {
    if (Lt("CSSGroupingRule") && n.parentRule instanceof CSSGroupingRule || Lt("CSSMediaRule") && n.parentRule instanceof CSSMediaRule || Lt("CSSSupportsRule") && n.parentRule instanceof CSSSupportsRule || Lt("CSSConditionRule") && n.parentRule instanceof CSSConditionRule) {
      const c = Array.from(
        n.parentRule.cssRules
      ).indexOf(n);
      return i.unshift(c), r(n.parentRule, i);
    } else if (n.parentStyleSheet) {
      const c = Array.from(n.parentStyleSheet.cssRules).indexOf(n);
      i.unshift(c);
    }
    return i;
  }
  return r(e, t);
}
function ze(e, t, r) {
  let n, i;
  return e ? (e.ownerNode ? n = t.getId(e.ownerNode) : i = r.getId(e), {
    styleId: i,
    id: n
  }) : {};
}
function Au({ styleSheetRuleCb: e, mirror: t, stylesheetManager: r }, { win: n }) {
  if (!n.CSSStyleSheet || !n.CSSStyleSheet.prototype)
    return () => {
    };
  const i = n.CSSStyleSheet.prototype.insertRule;
  n.CSSStyleSheet.prototype.insertRule = new Proxy(i, {
    apply: H(
      (a, d, u) => {
        const [l, m] = u, { id: f, styleId: g } = ze(
          d,
          t,
          r.styleMirror
        );
        return (f && f !== -1 || g && g !== -1) && e({
          id: f,
          styleId: g,
          adds: [{ rule: l, index: m }]
        }), a.apply(d, u);
      }
    )
  }), n.CSSStyleSheet.prototype.addRule = function(a, d, u = this.cssRules.length) {
    const l = `${a} { ${d} }`;
    return n.CSSStyleSheet.prototype.insertRule.apply(this, [l, u]);
  };
  const s = n.CSSStyleSheet.prototype.deleteRule;
  n.CSSStyleSheet.prototype.deleteRule = new Proxy(s, {
    apply: H(
      (a, d, u) => {
        const [l] = u, { id: m, styleId: f } = ze(
          d,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          removes: [{ index: l }]
        }), a.apply(d, u);
      }
    )
  }), n.CSSStyleSheet.prototype.removeRule = function(a) {
    return n.CSSStyleSheet.prototype.deleteRule.apply(this, [a]);
  };
  let c;
  n.CSSStyleSheet.prototype.replace && (c = n.CSSStyleSheet.prototype.replace, n.CSSStyleSheet.prototype.replace = new Proxy(c, {
    apply: H(
      (a, d, u) => {
        const [l] = u, { id: m, styleId: f } = ze(
          d,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replace: l
        }), a.apply(d, u);
      }
    )
  }));
  let h;
  n.CSSStyleSheet.prototype.replaceSync && (h = n.CSSStyleSheet.prototype.replaceSync, n.CSSStyleSheet.prototype.replaceSync = new Proxy(h, {
    apply: H(
      (a, d, u) => {
        const [l] = u, { id: m, styleId: f } = ze(
          d,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replaceSync: l
        }), a.apply(d, u);
      }
    )
  }));
  const o = {};
  Pt("CSSGroupingRule") ? o.CSSGroupingRule = n.CSSGroupingRule : (Pt("CSSMediaRule") && (o.CSSMediaRule = n.CSSMediaRule), Pt("CSSConditionRule") && (o.CSSConditionRule = n.CSSConditionRule), Pt("CSSSupportsRule") && (o.CSSSupportsRule = n.CSSSupportsRule));
  const p = {};
  return Object.entries(o).forEach(([a, d]) => {
    p[a] = {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      insertRule: d.prototype.insertRule,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      deleteRule: d.prototype.deleteRule
    }, d.prototype.insertRule = new Proxy(
      p[a].insertRule,
      {
        apply: H(
          (u, l, m) => {
            const [f, g] = m, { id: x, styleId: y } = ze(
              l.parentStyleSheet,
              t,
              r.styleMirror
            );
            return (x && x !== -1 || y && y !== -1) && e({
              id: x,
              styleId: y,
              adds: [
                {
                  rule: f,
                  index: [
                    ...qt(l),
                    g || 0
                    // defaults to 0
                  ]
                }
              ]
            }), u.apply(l, m);
          }
        )
      }
    ), d.prototype.deleteRule = new Proxy(
      p[a].deleteRule,
      {
        apply: H(
          (u, l, m) => {
            const [f] = m, { id: g, styleId: x } = ze(
              l.parentStyleSheet,
              t,
              r.styleMirror
            );
            return (g && g !== -1 || x && x !== -1) && e({
              id: g,
              styleId: x,
              removes: [
                { index: [...qt(l), f] }
              ]
            }), u.apply(l, m);
          }
        )
      }
    );
  }), H(() => {
    n.CSSStyleSheet.prototype.insertRule = i, n.CSSStyleSheet.prototype.deleteRule = s, c && (n.CSSStyleSheet.prototype.replace = c), h && (n.CSSStyleSheet.prototype.replaceSync = h), Object.entries(o).forEach(([a, d]) => {
      d.prototype.insertRule = p[a].insertRule, d.prototype.deleteRule = p[a].deleteRule;
    });
  });
}
function Do({
  mirror: e,
  stylesheetManager: t
}, r) {
  var n, i, s;
  let c = null;
  r.nodeName === "#document" ? c = e.getId(r) : c = e.getId(U.host(r));
  const h = r.nodeName === "#document" ? (n = r.defaultView) == null ? void 0 : n.Document : (s = (i = r.ownerDocument) == null ? void 0 : i.defaultView) == null ? void 0 : s.ShadowRoot, o = h != null && h.prototype ? Object.getOwnPropertyDescriptor(
    h == null ? void 0 : h.prototype,
    "adoptedStyleSheets"
  ) : void 0;
  return c === null || c === -1 || !h || !o ? () => {
  } : (Object.defineProperty(r, "adoptedStyleSheets", {
    configurable: o.configurable,
    enumerable: o.enumerable,
    get() {
      var p;
      return (p = o.get) == null ? void 0 : p.call(this);
    },
    set(p) {
      var a;
      const d = (a = o.set) == null ? void 0 : a.call(this, p);
      if (c !== null && c !== -1)
        try {
          t.adoptStyleSheets(p, c);
        } catch {
        }
      return d;
    }
  }), H(() => {
    Object.defineProperty(r, "adoptedStyleSheets", {
      configurable: o.configurable,
      enumerable: o.enumerable,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      get: o.get,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      set: o.set
    });
  }));
}
function Lu({
  styleDeclarationCb: e,
  mirror: t,
  ignoreCSSAttributes: r,
  stylesheetManager: n
}, { win: i }) {
  const s = i.CSSStyleDeclaration.prototype.setProperty;
  i.CSSStyleDeclaration.prototype.setProperty = new Proxy(s, {
    apply: H(
      (h, o, p) => {
        var a;
        const [d, u, l] = p;
        if (r.has(d))
          return s.apply(o, [d, u, l]);
        const { id: m, styleId: f } = ze(
          (a = o.parentRule) == null ? void 0 : a.parentStyleSheet,
          t,
          n.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          set: {
            property: d,
            value: u,
            priority: l
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: qt(o.parentRule)
        }), h.apply(o, p);
      }
    )
  });
  const c = i.CSSStyleDeclaration.prototype.removeProperty;
  return i.CSSStyleDeclaration.prototype.removeProperty = new Proxy(c, {
    apply: H(
      (h, o, p) => {
        var a;
        const [d] = p;
        if (r.has(d))
          return c.apply(o, [d]);
        const { id: u, styleId: l } = ze(
          (a = o.parentRule) == null ? void 0 : a.parentStyleSheet,
          t,
          n.styleMirror
        );
        return (u && u !== -1 || l && l !== -1) && e({
          id: u,
          styleId: l,
          remove: {
            property: d
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: qt(o.parentRule)
        }), h.apply(o, p);
      }
    )
  }), H(() => {
    i.CSSStyleDeclaration.prototype.setProperty = s, i.CSSStyleDeclaration.prototype.removeProperty = c;
  });
}
function Pu({
  mediaInteractionCb: e,
  blockClass: t,
  blockSelector: r,
  mirror: n,
  sampling: i,
  doc: s
}) {
  const c = H(
    (o) => gt(
      H((p) => {
        const a = vt(p);
        if (!a || pe(a, t, r, !0))
          return;
        const { currentTime: d, volume: u, muted: l, playbackRate: m, loop: f } = a;
        e({
          type: o,
          id: n.getId(a),
          currentTime: d,
          volume: u,
          muted: l,
          playbackRate: m,
          loop: f
        });
      }),
      i.media || 500
    )
  ), h = [
    he("play", c(rt.Play), s),
    he("pause", c(rt.Pause), s),
    he("seeked", c(rt.Seeked), s),
    he("volumechange", c(rt.VolumeChange), s),
    he("ratechange", c(rt.RateChange), s)
  ];
  return H(() => {
    h.forEach((o) => o());
  });
}
function Tu({ fontCb: e, doc: t }) {
  const r = t.defaultView;
  if (!r)
    return () => {
    };
  const n = [], i = /* @__PURE__ */ new WeakMap(), s = r.FontFace;
  r.FontFace = function(o, p, a) {
    const d = new s(o, p, a);
    return i.set(d, {
      family: o,
      buffer: typeof p != "string",
      descriptors: a,
      fontSource: typeof p == "string" ? p : JSON.stringify(Array.from(new Uint8Array(p)))
    }), d;
  };
  const c = Xe(
    t.fonts,
    "add",
    function(h) {
      return function(o) {
        return setTimeout(
          H(() => {
            const p = i.get(o);
            p && (e(p), i.delete(o));
          }),
          0
        ), h.apply(this, [o]);
      };
    }
  );
  return n.push(() => {
    r.FontFace = s;
  }), n.push(c), H(() => {
    n.forEach((h) => h());
  });
}
function Nu(e) {
  const { doc: t, mirror: r, blockClass: n, blockSelector: i, selectionCb: s } = e;
  let c = !0;
  const h = H(() => {
    const o = t.getSelection();
    if (!o || c && (o != null && o.isCollapsed)) return;
    c = o.isCollapsed || !1;
    const p = [], a = o.rangeCount || 0;
    for (let d = 0; d < a; d++) {
      const u = o.getRangeAt(d), { startContainer: l, startOffset: m, endContainer: f, endOffset: g } = u;
      pe(l, n, i, !0) || pe(f, n, i, !0) || p.push({
        start: r.getId(l),
        startOffset: m,
        end: r.getId(f),
        endOffset: g
      });
    }
    s({ ranges: p });
  });
  return h(), he("selectionchange", h);
}
function _u({
  doc: e,
  customElementCb: t
}) {
  const r = e.defaultView;
  return !r || !r.customElements ? () => {
  } : Xe(
    r.customElements,
    "define",
    function(i) {
      return function(s, c, h) {
        try {
          t({
            define: {
              name: s
            }
          });
        } catch {
          console.warn(`Custom element callback failed for ${s}`);
        }
        return i.apply(this, [s, c, h]);
      };
    }
  );
}
function $u(e, t) {
  const {
    mutationCb: r,
    mousemoveCb: n,
    mouseInteractionCb: i,
    scrollCb: s,
    viewportResizeCb: c,
    inputCb: h,
    mediaInteractionCb: o,
    styleSheetRuleCb: p,
    styleDeclarationCb: a,
    canvasMutationCb: d,
    fontCb: u,
    selectionCb: l,
    customElementCb: m
  } = e;
  e.mutationCb = (...f) => {
    t.mutation && t.mutation(...f), r(...f);
  }, e.mousemoveCb = (...f) => {
    t.mousemove && t.mousemove(...f), n(...f);
  }, e.mouseInteractionCb = (...f) => {
    t.mouseInteraction && t.mouseInteraction(...f), i(...f);
  }, e.scrollCb = (...f) => {
    t.scroll && t.scroll(...f), s(...f);
  }, e.viewportResizeCb = (...f) => {
    t.viewportResize && t.viewportResize(...f), c(...f);
  }, e.inputCb = (...f) => {
    t.input && t.input(...f), h(...f);
  }, e.mediaInteractionCb = (...f) => {
    t.mediaInteaction && t.mediaInteaction(...f), o(...f);
  }, e.styleSheetRuleCb = (...f) => {
    t.styleSheetRule && t.styleSheetRule(...f), p(...f);
  }, e.styleDeclarationCb = (...f) => {
    t.styleDeclaration && t.styleDeclaration(...f), a(...f);
  }, e.canvasMutationCb = (...f) => {
    t.canvasMutation && t.canvasMutation(...f), d(...f);
  }, e.fontCb = (...f) => {
    t.font && t.font(...f), u(...f);
  }, e.selectionCb = (...f) => {
    t.selection && t.selection(...f), l(...f);
  }, e.customElementCb = (...f) => {
    t.customElement && t.customElement(...f), m(...f);
  };
}
function Du(e, t = {}) {
  const r = e.doc.defaultView;
  if (!r)
    return () => {
    };
  $u(e, t);
  let n, i = () => {
  };
  e.recordDOM && ([n, i] = _o(e, e.doc));
  const s = Eu(e), c = Mu(e), h = $o(e), o = Ru(e, {
    win: r
  }), p = Iu(e), a = Pu(e);
  let d = () => {
  }, u = () => {
  }, l = () => {
  }, m = () => {
  };
  e.recordDOM && (d = Au(e, { win: r }), u = Do(e, e.doc), l = Lu(e, {
    win: r
  }), e.collectFonts && (m = Tu(e)));
  const f = Nu(e), g = _u(e), x = [];
  for (const y of e.plugins)
    x.push(
      y.observer(y.callback, r, y.options)
    );
  return H(() => {
    Ve.forEach((y) => y.reset()), n == null || n.disconnect(), i(), s(), c(), h(), o(), p(), a(), d(), u(), l(), m(), f(), g(), x.forEach((y) => y());
  });
}
function Lt(e) {
  return typeof window[e] < "u";
}
function Pt(e) {
  return !!(typeof window[e] < "u" && // Note: Generally, this check _shouldn't_ be necessary
  // However, in some scenarios (e.g. jsdom) this can sometimes fail, so we check for it here
  window[e].prototype && "insertRule" in window[e].prototype && "deleteRule" in window[e].prototype);
}
class Ms {
  constructor(t) {
    L(this, "iframeIdToRemoteIdMap", /* @__PURE__ */ new WeakMap()), L(this, "iframeRemoteIdToIdMap", /* @__PURE__ */ new WeakMap()), this.generateIdFn = t;
  }
  getId(t, r, n, i) {
    const s = n || this.getIdToRemoteIdMap(t), c = i || this.getRemoteIdToIdMap(t);
    let h = s.get(r);
    return h || (h = this.generateIdFn(), s.set(r, h), c.set(h, r)), h;
  }
  getIds(t, r) {
    const n = this.getIdToRemoteIdMap(t), i = this.getRemoteIdToIdMap(t);
    return r.map(
      (s) => this.getId(t, s, n, i)
    );
  }
  getRemoteId(t, r, n) {
    const i = n || this.getRemoteIdToIdMap(t);
    if (typeof r != "number") return r;
    const s = i.get(r);
    return s || -1;
  }
  getRemoteIds(t, r) {
    const n = this.getRemoteIdToIdMap(t);
    return r.map((i) => this.getRemoteId(t, i, n));
  }
  reset(t) {
    if (!t) {
      this.iframeIdToRemoteIdMap = /* @__PURE__ */ new WeakMap(), this.iframeRemoteIdToIdMap = /* @__PURE__ */ new WeakMap();
      return;
    }
    this.iframeIdToRemoteIdMap.delete(t), this.iframeRemoteIdToIdMap.delete(t);
  }
  getIdToRemoteIdMap(t) {
    let r = this.iframeIdToRemoteIdMap.get(t);
    return r || (r = /* @__PURE__ */ new Map(), this.iframeIdToRemoteIdMap.set(t, r)), r;
  }
  getRemoteIdToIdMap(t) {
    let r = this.iframeRemoteIdToIdMap.get(t);
    return r || (r = /* @__PURE__ */ new Map(), this.iframeRemoteIdToIdMap.set(t, r)), r;
  }
}
class zu {
  constructor(t) {
    L(this, "iframes", /* @__PURE__ */ new WeakMap()), L(this, "crossOriginIframeMap", /* @__PURE__ */ new WeakMap()), L(this, "crossOriginIframeMirror", new Ms(to)), L(this, "crossOriginIframeStyleMirror"), L(this, "crossOriginIframeRootIdMap", /* @__PURE__ */ new WeakMap()), L(this, "mirror"), L(this, "mutationCb"), L(this, "wrappedEmit"), L(this, "loadListener"), L(this, "stylesheetManager"), L(this, "recordCrossOriginIframes"), this.mutationCb = t.mutationCb, this.wrappedEmit = t.wrappedEmit, this.stylesheetManager = t.stylesheetManager, this.recordCrossOriginIframes = t.recordCrossOriginIframes, this.crossOriginIframeStyleMirror = new Ms(
      this.stylesheetManager.styleMirror.generateId.bind(
        this.stylesheetManager.styleMirror
      )
    ), this.mirror = t.mirror, this.recordCrossOriginIframes && window.addEventListener("message", this.handleMessage.bind(this));
  }
  addIframe(t) {
    this.iframes.set(t, !0), t.contentWindow && this.crossOriginIframeMap.set(t.contentWindow, t);
  }
  addLoadListener(t) {
    this.loadListener = t;
  }
  attachIframe(t, r) {
    var n, i;
    this.mutationCb({
      adds: [
        {
          parentId: this.mirror.getId(t),
          nextId: null,
          node: r
        }
      ],
      removes: [],
      texts: [],
      attributes: [],
      isAttachIframe: !0
    }), this.recordCrossOriginIframes && ((n = t.contentWindow) == null || n.addEventListener(
      "message",
      this.handleMessage.bind(this)
    )), (i = this.loadListener) == null || i.call(this, t), t.contentDocument && t.contentDocument.adoptedStyleSheets && t.contentDocument.adoptedStyleSheets.length > 0 && this.stylesheetManager.adoptStyleSheets(
      t.contentDocument.adoptedStyleSheets,
      this.mirror.getId(t.contentDocument)
    );
  }
  handleMessage(t) {
    const r = t;
    if (r.data.type !== "rrweb" || // To filter out the rrweb messages which are forwarded by some sites.
    r.origin !== r.data.origin || !t.source) return;
    const i = this.crossOriginIframeMap.get(t.source);
    if (!i) return;
    const s = this.transformCrossOriginEvent(
      i,
      r.data.event
    );
    s && this.wrappedEmit(
      s,
      r.data.isCheckout
    );
  }
  transformCrossOriginEvent(t, r) {
    var n;
    switch (r.type) {
      case V.FullSnapshot: {
        this.crossOriginIframeMirror.reset(t), this.crossOriginIframeStyleMirror.reset(t), this.replaceIdOnNode(r.data.node, t);
        const i = r.data.node.id;
        return this.crossOriginIframeRootIdMap.set(t, i), this.patchRootIdOnNode(r.data.node, i), {
          timestamp: r.timestamp,
          type: V.IncrementalSnapshot,
          data: {
            source: W.Mutation,
            adds: [
              {
                parentId: this.mirror.getId(t),
                nextId: null,
                node: r.data.node
              }
            ],
            removes: [],
            texts: [],
            attributes: [],
            isAttachIframe: !0
          }
        };
      }
      case V.Meta:
      case V.Load:
      case V.DomContentLoaded:
        return !1;
      case V.Plugin:
        return r;
      case V.Custom:
        return this.replaceIds(
          r.data.payload,
          t,
          ["id", "parentId", "previousId", "nextId"]
        ), r;
      case V.IncrementalSnapshot:
        switch (r.data.source) {
          case W.Mutation:
            return r.data.adds.forEach((i) => {
              this.replaceIds(i, t, [
                "parentId",
                "nextId",
                "previousId"
              ]), this.replaceIdOnNode(i.node, t);
              const s = this.crossOriginIframeRootIdMap.get(t);
              s && this.patchRootIdOnNode(i.node, s);
            }), r.data.removes.forEach((i) => {
              this.replaceIds(i, t, ["parentId", "id"]);
            }), r.data.attributes.forEach((i) => {
              this.replaceIds(i, t, ["id"]);
            }), r.data.texts.forEach((i) => {
              this.replaceIds(i, t, ["id"]);
            }), r;
          case W.Drag:
          case W.TouchMove:
          case W.MouseMove:
            return r.data.positions.forEach((i) => {
              this.replaceIds(i, t, ["id"]);
            }), r;
          case W.ViewportResize:
            return !1;
          case W.MediaInteraction:
          case W.MouseInteraction:
          case W.Scroll:
          case W.CanvasMutation:
          case W.Input:
            return this.replaceIds(r.data, t, ["id"]), r;
          case W.StyleSheetRule:
          case W.StyleDeclaration:
            return this.replaceIds(r.data, t, ["id"]), this.replaceStyleIds(r.data, t, ["styleId"]), r;
          case W.Font:
            return r;
          case W.Selection:
            return r.data.ranges.forEach((i) => {
              this.replaceIds(i, t, ["start", "end"]);
            }), r;
          case W.AdoptedStyleSheet:
            return this.replaceIds(r.data, t, ["id"]), this.replaceStyleIds(r.data, t, ["styleIds"]), (n = r.data.styles) == null || n.forEach((i) => {
              this.replaceStyleIds(i, t, ["styleId"]);
            }), r;
        }
    }
    return !1;
  }
  replace(t, r, n, i) {
    for (const s of i)
      !Array.isArray(r[s]) && typeof r[s] != "number" || (Array.isArray(r[s]) ? r[s] = t.getIds(
        n,
        r[s]
      ) : r[s] = t.getId(n, r[s]));
    return r;
  }
  replaceIds(t, r, n) {
    return this.replace(this.crossOriginIframeMirror, t, r, n);
  }
  replaceStyleIds(t, r, n) {
    return this.replace(this.crossOriginIframeStyleMirror, t, r, n);
  }
  replaceIdOnNode(t, r) {
    this.replaceIds(t, r, ["id", "rootId"]), "childNodes" in t && t.childNodes.forEach((n) => {
      this.replaceIdOnNode(n, r);
    });
  }
  patchRootIdOnNode(t, r) {
    t.type !== To.Document && !t.rootId && (t.rootId = r), "childNodes" in t && t.childNodes.forEach((n) => {
      this.patchRootIdOnNode(n, r);
    });
  }
}
class Fu {
  constructor(t) {
    L(this, "shadowDoms", /* @__PURE__ */ new WeakSet()), L(this, "mutationCb"), L(this, "scrollCb"), L(this, "bypassOptions"), L(this, "mirror"), L(this, "restoreHandlers", []), this.mutationCb = t.mutationCb, this.scrollCb = t.scrollCb, this.bypassOptions = t.bypassOptions, this.mirror = t.mirror, this.init();
  }
  init() {
    this.reset(), this.patchAttachShadow(Element, document);
  }
  addShadowRoot(t, r) {
    if (!ht(t) || this.shadowDoms.has(t)) return;
    this.shadowDoms.add(t);
    const [n] = _o(
      {
        ...this.bypassOptions,
        doc: r,
        mutationCb: this.mutationCb,
        mirror: this.mirror,
        shadowDomManager: this
      },
      t
    );
    this.restoreHandlers.push(() => n.disconnect()), this.restoreHandlers.push(
      $o({
        ...this.bypassOptions,
        scrollCb: this.scrollCb,
        // https://gist.github.com/praveenpuglia/0832da687ed5a5d7a0907046c9ef1813
        // scroll is not allowed to pass the boundary, so we need to listen the shadow document
        doc: t,
        mirror: this.mirror
      })
    ), setTimeout(() => {
      t.adoptedStyleSheets && t.adoptedStyleSheets.length > 0 && this.bypassOptions.stylesheetManager.adoptStyleSheets(
        t.adoptedStyleSheets,
        this.mirror.getId(U.host(t))
      ), this.restoreHandlers.push(
        Do(
          {
            mirror: this.mirror,
            stylesheetManager: this.bypassOptions.stylesheetManager
          },
          t
        )
      );
    }, 0);
  }
  /**
   * Monkey patch 'attachShadow' of an IFrameElement to observe newly added shadow doms.
   */
  observeAttachShadow(t) {
    !t.contentWindow || !t.contentDocument || this.patchAttachShadow(
      t.contentWindow.Element,
      t.contentDocument
    );
  }
  /**
   * Patch 'attachShadow' to observe newly added shadow doms.
   */
  patchAttachShadow(t, r) {
    const n = this;
    this.restoreHandlers.push(
      Xe(
        t.prototype,
        "attachShadow",
        function(i) {
          return function(s) {
            const c = i.call(this, s), h = U.shadowRoot(this);
            return h && Po(this) && n.addShadowRoot(h, r), c;
          };
        }
      )
    );
  }
  reset() {
    this.restoreHandlers.forEach((t) => {
      try {
        t();
      } catch {
      }
    }), this.restoreHandlers = [], this.shadowDoms = /* @__PURE__ */ new WeakSet();
  }
}
var st = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", Uu = typeof Uint8Array > "u" ? [] : new Uint8Array(256);
for (var Tt = 0; Tt < st.length; Tt++)
  Uu[st.charCodeAt(Tt)] = Tt;
var Bu = function(e) {
  var t = new Uint8Array(e), r, n = t.length, i = "";
  for (r = 0; r < n; r += 3)
    i += st[t[r] >> 2], i += st[(t[r] & 3) << 4 | t[r + 1] >> 4], i += st[(t[r + 1] & 15) << 2 | t[r + 2] >> 6], i += st[t[r + 2] & 63];
  return n % 3 === 2 ? i = i.substring(0, i.length - 1) + "=" : n % 3 === 1 && (i = i.substring(0, i.length - 2) + "=="), i;
};
const Rs = /* @__PURE__ */ new Map();
function Wu(e, t) {
  let r = Rs.get(e);
  return r || (r = /* @__PURE__ */ new Map(), Rs.set(e, r)), r.has(t) || r.set(t, []), r.get(t);
}
const zo = (e, t, r) => {
  if (!e || !(Uo(e, t) || typeof e == "object"))
    return;
  const n = e.constructor.name, i = Wu(r, n);
  let s = i.indexOf(e);
  return s === -1 && (s = i.length, i.push(e)), s;
};
function Nt(e, t, r) {
  if (e instanceof Array)
    return e.map((n) => Nt(n, t, r));
  if (e === null)
    return e;
  if (e instanceof Float32Array || e instanceof Float64Array || e instanceof Int32Array || e instanceof Uint32Array || e instanceof Uint8Array || e instanceof Uint16Array || e instanceof Int16Array || e instanceof Int8Array || e instanceof Uint8ClampedArray)
    return {
      rr_type: e.constructor.name,
      args: [Object.values(e)]
    };
  if (
    // SharedArrayBuffer disabled on most browsers due to spectre.
    // More info: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/SharedArrayBuffer
    // value instanceof SharedArrayBuffer ||
    e instanceof ArrayBuffer
  ) {
    const n = e.constructor.name, i = Bu(e);
    return {
      rr_type: n,
      base64: i
    };
  } else {
    if (e instanceof DataView)
      return {
        rr_type: e.constructor.name,
        args: [
          Nt(e.buffer, t, r),
          e.byteOffset,
          e.byteLength
        ]
      };
    if (e instanceof HTMLImageElement) {
      const n = e.constructor.name, { src: i } = e;
      return {
        rr_type: n,
        src: i
      };
    } else if (e instanceof HTMLCanvasElement) {
      const n = "HTMLImageElement", i = e.toDataURL();
      return {
        rr_type: n,
        src: i
      };
    } else {
      if (e instanceof ImageData)
        return {
          rr_type: e.constructor.name,
          args: [Nt(e.data, t, r), e.width, e.height]
        };
      if (Uo(e, t) || typeof e == "object") {
        const n = e.constructor.name, i = zo(e, t, r);
        return {
          rr_type: n,
          index: i
        };
      }
    }
  }
  return e;
}
const Fo = (e, t, r) => e.map((n) => Nt(n, t, r)), Uo = (e, t) => !![
  "WebGLActiveInfo",
  "WebGLBuffer",
  "WebGLFramebuffer",
  "WebGLProgram",
  "WebGLRenderbuffer",
  "WebGLShader",
  "WebGLShaderPrecisionFormat",
  "WebGLTexture",
  "WebGLUniformLocation",
  "WebGLVertexArrayObject",
  // In old Chrome versions, value won't be an instanceof WebGLVertexArrayObject.
  "WebGLVertexArrayObjectOES"
].filter(
  (i) => typeof t[i] == "function"
).find(
  (i) => e instanceof t[i]
);
function qu(e, t, r, n) {
  const i = [], s = Object.getOwnPropertyNames(
    t.CanvasRenderingContext2D.prototype
  );
  for (const c of s)
    try {
      if (typeof t.CanvasRenderingContext2D.prototype[c] != "function")
        continue;
      const h = Xe(
        t.CanvasRenderingContext2D.prototype,
        c,
        function(o) {
          return function(...p) {
            return pe(this.canvas, r, n, !0) || setTimeout(() => {
              const a = Fo(p, t, this);
              e(this.canvas, {
                type: lt["2D"],
                property: c,
                args: a
              });
            }, 0), o.apply(this, p);
          };
        }
      );
      i.push(h);
    } catch {
      const h = sr(
        t.CanvasRenderingContext2D.prototype,
        c,
        {
          set(o) {
            e(this.canvas, {
              type: lt["2D"],
              property: c,
              args: [o],
              setter: !0
            });
          }
        }
      );
      i.push(h);
    }
  return () => {
    i.forEach((c) => c());
  };
}
function ju(e) {
  return e === "experimental-webgl" ? "webgl" : e;
}
function Os(e, t, r, n) {
  const i = [];
  try {
    const s = Xe(
      e.HTMLCanvasElement.prototype,
      "getContext",
      function(c) {
        return function(h, ...o) {
          if (!pe(this, t, r, !0)) {
            const p = ju(h);
            if ("__context" in this || (this.__context = p), n && ["webgl", "webgl2"].includes(p))
              if (o[0] && typeof o[0] == "object") {
                const a = o[0];
                a.preserveDrawingBuffer || (a.preserveDrawingBuffer = !0);
              } else
                o.splice(0, 1, {
                  preserveDrawingBuffer: !0
                });
          }
          return c.apply(this, [h, ...o]);
        };
      }
    );
    i.push(s);
  } catch {
    console.error("failed to patch HTMLCanvasElement.prototype.getContext");
  }
  return () => {
    i.forEach((s) => s());
  };
}
function Is(e, t, r, n, i, s) {
  const c = [], h = Object.getOwnPropertyNames(e);
  for (const o of h)
    if (
      //prop.startsWith('get') ||  // e.g. getProgramParameter, but too risky
      ![
        "isContextLost",
        "canvas",
        "drawingBufferWidth",
        "drawingBufferHeight"
      ].includes(o)
    )
      try {
        if (typeof e[o] != "function")
          continue;
        const p = Xe(
          e,
          o,
          function(a) {
            return function(...d) {
              const u = a.apply(this, d);
              if (zo(u, s, this), "tagName" in this.canvas && !pe(this.canvas, n, i, !0)) {
                const l = Fo(d, s, this), m = {
                  type: t,
                  property: o,
                  args: l
                };
                r(this.canvas, m);
              }
              return u;
            };
          }
        );
        c.push(p);
      } catch {
        const p = sr(e, o, {
          set(a) {
            r(this.canvas, {
              type: t,
              property: o,
              args: [a],
              setter: !0
            });
          }
        });
        c.push(p);
      }
  return c;
}
function Hu(e, t, r, n) {
  const i = [];
  return typeof t.WebGLRenderingContext < "u" && i.push(
    ...Is(
      t.WebGLRenderingContext.prototype,
      lt.WebGL,
      e,
      r,
      n,
      t
    )
  ), typeof t.WebGL2RenderingContext < "u" && i.push(
    ...Is(
      t.WebGL2RenderingContext.prototype,
      lt.WebGL2,
      e,
      r,
      n,
      t
    )
  ), () => {
    i.forEach((s) => s());
  };
}
const Bo = `(function() {
  "use strict";
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var lookup = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  var encode = function(arraybuffer) {
    var bytes = new Uint8Array(arraybuffer), i2, len = bytes.length, base64 = "";
    for (i2 = 0; i2 < len; i2 += 3) {
      base64 += chars[bytes[i2] >> 2];
      base64 += chars[(bytes[i2] & 3) << 4 | bytes[i2 + 1] >> 4];
      base64 += chars[(bytes[i2 + 1] & 15) << 2 | bytes[i2 + 2] >> 6];
      base64 += chars[bytes[i2 + 2] & 63];
    }
    if (len % 3 === 2) {
      base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (len % 3 === 1) {
      base64 = base64.substring(0, base64.length - 2) + "==";
    }
    return base64;
  };
  const lastBlobMap = /* @__PURE__ */ new Map();
  const transparentBlobMap = /* @__PURE__ */ new Map();
  async function getTransparentBlobFor(width, height, dataURLOptions) {
    const id = \`\${width}-\${height}\`;
    if ("OffscreenCanvas" in globalThis) {
      if (transparentBlobMap.has(id)) return transparentBlobMap.get(id);
      const offscreen = new OffscreenCanvas(width, height);
      offscreen.getContext("2d");
      const blob = await offscreen.convertToBlob(dataURLOptions);
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = encode(arrayBuffer);
      transparentBlobMap.set(id, base64);
      return base64;
    } else {
      return "";
    }
  }
  const worker = self;
  worker.onmessage = async function(e) {
    if ("OffscreenCanvas" in globalThis) {
      const { id, bitmap, width, height, dataURLOptions } = e.data;
      const transparentBase64 = getTransparentBlobFor(
        width,
        height,
        dataURLOptions
      );
      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await offscreen.convertToBlob(dataURLOptions);
      const type = blob.type;
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = encode(arrayBuffer);
      if (!lastBlobMap.has(id) && await transparentBase64 === base64) {
        lastBlobMap.set(id, base64);
        return worker.postMessage({ id });
      }
      if (lastBlobMap.get(id) === base64) return worker.postMessage({ id });
      worker.postMessage({
        id,
        type,
        base64,
        width,
        height
      });
      lastBlobMap.set(id, base64);
    } else {
      return worker.postMessage({ id: e.data.id });
    }
  };
})();
//# sourceMappingURL=image-bitmap-data-url-worker-IJpC7g_b.js.map
`, As = typeof self < "u" && self.Blob && new Blob([Bo], { type: "text/javascript;charset=utf-8" });
function Vu(e) {
  let t;
  try {
    if (t = As && (self.URL || self.webkitURL).createObjectURL(As), !t) throw "";
    const r = new Worker(t, {
      name: e == null ? void 0 : e.name
    });
    return r.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(t);
    }), r;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent(Bo),
      {
        name: e == null ? void 0 : e.name
      }
    );
  } finally {
    t && (self.URL || self.webkitURL).revokeObjectURL(t);
  }
}
class Gu {
  constructor(t) {
    L(this, "pendingCanvasMutations", /* @__PURE__ */ new Map()), L(this, "rafStamps", { latestId: 0, invokeId: null }), L(this, "mirror"), L(this, "mutationCb"), L(this, "resetObservers"), L(this, "frozen", !1), L(this, "locked", !1), L(this, "processMutation", (o, p) => {
      (this.rafStamps.invokeId && this.rafStamps.latestId !== this.rafStamps.invokeId || !this.rafStamps.invokeId) && (this.rafStamps.invokeId = this.rafStamps.latestId), this.pendingCanvasMutations.has(o) || this.pendingCanvasMutations.set(o, []), this.pendingCanvasMutations.get(o).push(p);
    });
    const {
      sampling: r = "all",
      win: n,
      blockClass: i,
      blockSelector: s,
      recordCanvas: c,
      dataURLOptions: h
    } = t;
    this.mutationCb = t.mutationCb, this.mirror = t.mirror, c && r === "all" && this.initCanvasMutationObserver(n, i, s), c && typeof r == "number" && this.initCanvasFPSObserver(r, n, i, s, {
      dataURLOptions: h
    });
  }
  reset() {
    this.pendingCanvasMutations.clear(), this.resetObservers && this.resetObservers();
  }
  freeze() {
    this.frozen = !0;
  }
  unfreeze() {
    this.frozen = !1;
  }
  lock() {
    this.locked = !0;
  }
  unlock() {
    this.locked = !1;
  }
  initCanvasFPSObserver(t, r, n, i, s) {
    const c = Os(
      r,
      n,
      i,
      !0
    ), h = /* @__PURE__ */ new Map(), o = new Vu();
    o.onmessage = (m) => {
      const { id: f } = m.data;
      if (h.set(f, !1), !("base64" in m.data)) return;
      const { base64: g, type: x, width: y, height: w } = m.data;
      this.mutationCb({
        id: f,
        type: lt["2D"],
        commands: [
          {
            property: "clearRect",
            // wipe canvas
            args: [0, 0, y, w]
          },
          {
            property: "drawImage",
            // draws (semi-transparent) image
            args: [
              {
                rr_type: "ImageBitmap",
                args: [
                  {
                    rr_type: "Blob",
                    data: [{ rr_type: "ArrayBuffer", base64: g }],
                    type: x
                  }
                ]
              },
              0,
              0
            ]
          }
        ]
      });
    };
    const p = 1e3 / t;
    let a = 0, d;
    const u = () => {
      const m = [];
      return r.document.querySelectorAll("canvas").forEach((f) => {
        pe(f, n, i, !0) || m.push(f);
      }), m;
    }, l = (m) => {
      if (a && m - a < p) {
        d = requestAnimationFrame(l);
        return;
      }
      a = m, u().forEach(async (f) => {
        var g;
        const x = this.mirror.getId(f);
        if (h.get(x) || f.width === 0 || f.height === 0) return;
        if (h.set(x, !0), ["webgl", "webgl2"].includes(f.__context)) {
          const w = f.getContext(f.__context);
          ((g = w == null ? void 0 : w.getContextAttributes()) == null ? void 0 : g.preserveDrawingBuffer) === !1 && w.clear(w.COLOR_BUFFER_BIT);
        }
        const y = await createImageBitmap(f);
        o.postMessage(
          {
            id: x,
            bitmap: y,
            width: f.width,
            height: f.height,
            dataURLOptions: s.dataURLOptions
          },
          [y]
        );
      }), d = requestAnimationFrame(l);
    };
    d = requestAnimationFrame(l), this.resetObservers = () => {
      c(), cancelAnimationFrame(d);
    };
  }
  initCanvasMutationObserver(t, r, n) {
    this.startRAFTimestamping(), this.startPendingCanvasMutationFlusher();
    const i = Os(
      t,
      r,
      n,
      !1
    ), s = qu(
      this.processMutation.bind(this),
      t,
      r,
      n
    ), c = Hu(
      this.processMutation.bind(this),
      t,
      r,
      n
    );
    this.resetObservers = () => {
      i(), s(), c();
    };
  }
  startPendingCanvasMutationFlusher() {
    requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }
  startRAFTimestamping() {
    const t = (r) => {
      this.rafStamps.latestId = r, requestAnimationFrame(t);
    };
    requestAnimationFrame(t);
  }
  flushPendingCanvasMutations() {
    this.pendingCanvasMutations.forEach(
      (t, r) => {
        const n = this.mirror.getId(r);
        this.flushPendingCanvasMutationFor(r, n);
      }
    ), requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }
  flushPendingCanvasMutationFor(t, r) {
    if (this.frozen || this.locked)
      return;
    const n = this.pendingCanvasMutations.get(t);
    if (!n || r === -1) return;
    const i = n.map((c) => {
      const { type: h, ...o } = c;
      return o;
    }), { type: s } = n[0];
    this.mutationCb({ id: r, type: s, commands: i }), this.pendingCanvasMutations.delete(t);
  }
}
class Yu {
  constructor(t) {
    L(this, "trackedLinkElements", /* @__PURE__ */ new WeakSet()), L(this, "mutationCb"), L(this, "adoptedStyleSheetCb"), L(this, "styleMirror", new gu()), this.mutationCb = t.mutationCb, this.adoptedStyleSheetCb = t.adoptedStyleSheetCb;
  }
  attachLinkElement(t, r) {
    "_cssText" in r.attributes && this.mutationCb({
      adds: [],
      removes: [],
      texts: [],
      attributes: [
        {
          id: r.id,
          attributes: r.attributes
        }
      ]
    }), this.trackLinkElement(t);
  }
  trackLinkElement(t) {
    this.trackedLinkElements.has(t) || (this.trackedLinkElements.add(t), this.trackStylesheetInLinkElement(t));
  }
  adoptStyleSheets(t, r) {
    if (t.length === 0) return;
    const n = {
      id: r,
      styleIds: []
    }, i = [];
    for (const s of t) {
      let c;
      this.styleMirror.has(s) ? c = this.styleMirror.getId(s) : (c = this.styleMirror.add(s), i.push({
        styleId: c,
        rules: Array.from(s.rules || CSSRule, (h, o) => ({
          rule: Zs(h, s.href),
          index: o
        }))
      })), n.styleIds.push(c);
    }
    i.length > 0 && (n.styles = i), this.adoptedStyleSheetCb(n);
  }
  reset() {
    this.styleMirror.reset(), this.trackedLinkElements = /* @__PURE__ */ new WeakSet();
  }
  // TODO: take snapshot on stylesheet reload by applying event listener
  trackStylesheetInLinkElement(t) {
  }
}
class Ju {
  constructor() {
    L(this, "nodeMap", /* @__PURE__ */ new WeakMap()), L(this, "active", !1);
  }
  inOtherBuffer(t, r) {
    const n = this.nodeMap.get(t);
    return n && Array.from(n).some((i) => i !== r);
  }
  add(t, r) {
    this.active || (this.active = !0, requestAnimationFrame(() => {
      this.nodeMap = /* @__PURE__ */ new WeakMap(), this.active = !1;
    })), this.nodeMap.set(t, (this.nodeMap.get(t) || /* @__PURE__ */ new Set()).add(r));
  }
  destroy() {
  }
}
let re, _t, gi, jt = !1;
try {
  if (Array.from([1], (e) => e * 2)[0] !== 2) {
    const e = document.createElement("iframe");
    document.body.appendChild(e), Array.from = ((an = e.contentWindow) == null ? void 0 : an.Array.from) || Array.from, document.body.removeChild(e);
  }
} catch (e) {
  console.debug("Unable to override Array.from", e);
}
const Me = rc();
function Be(e = {}) {
  const {
    emit: t,
    checkoutEveryNms: r,
    checkoutEveryNth: n,
    blockClass: i = "rr-block",
    blockSelector: s = null,
    ignoreClass: c = "rr-ignore",
    ignoreSelector: h = null,
    maskTextClass: o = "rr-mask",
    maskTextSelector: p = null,
    inlineStylesheet: a = !0,
    maskAllInputs: d,
    maskInputOptions: u,
    slimDOMOptions: l,
    maskInputFn: m,
    maskTextFn: f,
    hooks: g,
    packFn: x,
    sampling: y = {},
    dataURLOptions: w = {},
    mousemoveWait: S,
    recordDOM: v = !0,
    recordCanvas: b = !1,
    recordCrossOriginIframes: k = !1,
    recordAfter: E = e.recordAfter === "DOMContentLoaded" ? e.recordAfter : "load",
    userTriggeredOnInput: O = !1,
    collectFonts: M = !1,
    inlineImages: D = !1,
    plugins: N,
    keepIframeSrcFn: C = () => !1,
    ignoreCSSAttributes: oe = /* @__PURE__ */ new Set([]),
    errorHandler: te
  } = e;
  Su(te);
  const G = k ? window.parent === window : !0;
  let q = !1;
  if (!G)
    try {
      window.parent.document && (q = !1);
    } catch {
      q = !0;
    }
  if (G && !t)
    throw new Error("emit function is required");
  if (!G && !q)
    return () => {
    };
  S !== void 0 && y.mousemove === void 0 && (y.mousemove = S), Me.reset();
  const K = d === !0 ? {
    color: !0,
    date: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0,
    textarea: !0,
    select: !0,
    password: !0
  } : u !== void 0 ? u : { password: !0 }, ee = so(l);
  mu();
  let Y, j = 0;
  const ye = (I) => {
    for (const _ of N || [])
      _.eventProcessor && (I = _.eventProcessor(I));
    return x && // Disable packing events which will be emitted to parent frames.
    !q && (I = x(I)), I;
  };
  re = (I, _) => {
    var A;
    const $ = I;
    if ($.timestamp = mt(), (A = Ve[0]) != null && A.isFrozen() && $.type !== V.FullSnapshot && !($.type === V.IncrementalSnapshot && $.data.source === W.Mutation) && Ve.forEach((B) => B.unfreeze()), G)
      t == null || t(ye($), _);
    else if (q) {
      const B = {
        type: "rrweb",
        event: ye($),
        origin: window.location.origin,
        isCheckout: _
      };
      window.parent.postMessage(B, "*");
    }
    if ($.type === V.FullSnapshot)
      Y = $, j = 0;
    else if ($.type === V.IncrementalSnapshot) {
      if ($.data.source === W.Mutation && $.data.isAttachIframe)
        return;
      j++;
      const B = n && j >= n, T = r && $.timestamp - Y.timestamp > r;
      (B || T) && _t(!0);
    }
  };
  const R = (I) => {
    re({
      type: V.IncrementalSnapshot,
      data: {
        source: W.Mutation,
        ...I
      }
    });
  }, be = (I) => re({
    type: V.IncrementalSnapshot,
    data: {
      source: W.Scroll,
      ...I
    }
  }), de = (I) => re({
    type: V.IncrementalSnapshot,
    data: {
      source: W.CanvasMutation,
      ...I
    }
  }), Le = (I) => re({
    type: V.IncrementalSnapshot,
    data: {
      source: W.AdoptedStyleSheet,
      ...I
    }
  }), ae = new Yu({
    mutationCb: R,
    adoptedStyleSheetCb: Le
  }), ve = new zu({
    mirror: Me,
    mutationCb: R,
    stylesheetManager: ae,
    recordCrossOriginIframes: k,
    wrappedEmit: re
  });
  for (const I of N || [])
    I.getMirror && I.getMirror({
      nodeMirror: Me,
      crossOriginIframeMirror: ve.crossOriginIframeMirror,
      crossOriginIframeStyleMirror: ve.crossOriginIframeStyleMirror
    });
  const Ae = new Ju();
  gi = new Gu({
    recordCanvas: b,
    mutationCb: de,
    win: window,
    blockClass: i,
    blockSelector: s,
    mirror: Me,
    sampling: y.canvas,
    dataURLOptions: w
  });
  const P = new Fu({
    mutationCb: R,
    scrollCb: be,
    bypassOptions: {
      blockClass: i,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskInputOptions: K,
      dataURLOptions: w,
      maskTextFn: f,
      maskInputFn: m,
      recordCanvas: b,
      inlineImages: D,
      sampling: y,
      slimDOMOptions: ee,
      iframeManager: ve,
      stylesheetManager: ae,
      canvasManager: gi,
      keepIframeSrcFn: C,
      processedNodeManager: Ae
    },
    mirror: Me
  });
  _t = (I = !1) => {
    if (!v)
      return;
    re(
      {
        type: V.Meta,
        data: {
          href: window.location.href,
          width: Mo(),
          height: Eo()
        }
      },
      I
    ), ae.reset(), P.init(), Ve.forEach((A) => A.lock());
    const _ = Mc(document, {
      mirror: Me,
      blockClass: i,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskAllInputs: K,
      maskTextFn: f,
      maskInputFn: m,
      slimDOM: ee,
      dataURLOptions: w,
      recordCanvas: b,
      inlineImages: D,
      onSerialize: (A) => {
        Io(A, Me) && ve.addIframe(A), Ao(A, Me) && ae.trackLinkElement(A), xi(A) && P.addShadowRoot(U.shadowRoot(A), document);
      },
      onIframeLoad: (A, $) => {
        ve.attachIframe(A, $), P.observeAttachShadow(A);
      },
      onStylesheetLoad: (A, $) => {
        ae.attachLinkElement(A, $);
      },
      keepIframeSrcFn: C
    });
    if (!_)
      return console.warn("Failed to snapshot the document");
    re(
      {
        type: V.FullSnapshot,
        data: {
          node: _,
          initialOffset: Co(window)
        }
      },
      I
    ), Ve.forEach((A) => A.unlock()), document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0 && ae.adoptStyleSheets(
      document.adoptedStyleSheets,
      Me.getId(document)
    );
  };
  try {
    const I = [], _ = ($) => {
      var B;
      return H(Du)(
        {
          mutationCb: R,
          mousemoveCb: (T, F) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: F,
              positions: T
            }
          }),
          mouseInteractionCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.MouseInteraction,
              ...T
            }
          }),
          scrollCb: be,
          viewportResizeCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.ViewportResize,
              ...T
            }
          }),
          inputCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.Input,
              ...T
            }
          }),
          mediaInteractionCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.MediaInteraction,
              ...T
            }
          }),
          styleSheetRuleCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.StyleSheetRule,
              ...T
            }
          }),
          styleDeclarationCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.StyleDeclaration,
              ...T
            }
          }),
          canvasMutationCb: de,
          fontCb: (T) => re({
            type: V.IncrementalSnapshot,
            data: {
              source: W.Font,
              ...T
            }
          }),
          selectionCb: (T) => {
            re({
              type: V.IncrementalSnapshot,
              data: {
                source: W.Selection,
                ...T
              }
            });
          },
          customElementCb: (T) => {
            re({
              type: V.IncrementalSnapshot,
              data: {
                source: W.CustomElement,
                ...T
              }
            });
          },
          blockClass: i,
          ignoreClass: c,
          ignoreSelector: h,
          maskTextClass: o,
          maskTextSelector: p,
          maskInputOptions: K,
          inlineStylesheet: a,
          sampling: y,
          recordDOM: v,
          recordCanvas: b,
          inlineImages: D,
          userTriggeredOnInput: O,
          collectFonts: M,
          doc: $,
          maskInputFn: m,
          maskTextFn: f,
          keepIframeSrcFn: C,
          blockSelector: s,
          slimDOMOptions: ee,
          dataURLOptions: w,
          mirror: Me,
          iframeManager: ve,
          stylesheetManager: ae,
          shadowDomManager: P,
          processedNodeManager: Ae,
          canvasManager: gi,
          ignoreCSSAttributes: oe,
          plugins: ((B = N == null ? void 0 : N.filter((T) => T.observer)) == null ? void 0 : B.map((T) => ({
            observer: T.observer,
            options: T.options,
            callback: (F) => re({
              type: V.Plugin,
              data: {
                plugin: T.name,
                payload: F
              }
            })
          }))) || []
        },
        g
      );
    };
    ve.addLoadListener(($) => {
      try {
        I.push(_($.contentDocument));
      } catch (B) {
        console.warn(B);
      }
    });
    const A = () => {
      _t(), I.push(_(document)), jt = !0;
    };
    return ["interactive", "complete"].includes(document.readyState) ? A() : (I.push(
      he("DOMContentLoaded", () => {
        re({
          type: V.DomContentLoaded,
          data: {}
        }), E === "DOMContentLoaded" && A();
      })
    ), I.push(
      he(
        "load",
        () => {
          re({
            type: V.Load,
            data: {}
          }), E === "load" && A();
        },
        window
      )
    )), () => {
      I.forEach(($) => {
        try {
          $();
        } catch (B) {
          String(B).toLowerCase().includes("cross-origin") || console.warn(B);
        }
      }), Ae.destroy(), jt = !1, Cu();
    };
  } catch (I) {
    console.warn(I);
  }
}
Be.addCustomEvent = (e, t) => {
  if (!jt)
    throw new Error("please add custom event after start recording");
  re({
    type: V.Custom,
    data: {
      tag: e,
      payload: t
    }
  });
};
Be.freezePage = () => {
  Ve.forEach((e) => e.freeze());
};
Be.takeFullSnapshot = (e) => {
  if (!jt)
    throw new Error("please take full snapshot after start recording");
  _t(e);
};
Be.mirror = Me;
var Ls;
(function(e) {
  e[e.NotStarted = 0] = "NotStarted", e[e.Running = 1] = "Running", e[e.Stopped = 2] = "Stopped";
})(Ls || (Ls = {}));
const { addCustomEvent: Sd } = Be, { freezePage: Cd } = Be, { takeFullSnapshot: Ed } = Be, yi = 2, Xu = 4;
class Ku {
  constructor(t) {
    xt(this, "events", []);
    xt(this, "lastMeta", null);
    xt(this, "lastFull", null);
    this.opts = t;
  }
  push(t) {
    t.type === Xu && (this.lastMeta = t), t.type === yi && (this.lastFull = t, this.events = []), this.events.push(t), this.prune();
  }
  prune() {
    if (!this.events.length) return;
    const r = this.events[this.events.length - 1].timestamp - this.opts.windowMs;
    let n = 0;
    for (; n < this.events.length && this.events[n].timestamp < r; ) n++;
    n > 0 && (this.events = this.events.slice(n)), this.events.length > this.opts.maxEvents && (this.events = this.events.slice(this.events.length - this.opts.maxEvents));
  }
  /** A playable, head-anchored copy: [meta?, fullSnapshot, ...trailing incrementals]. */
  snapshot() {
    const t = [];
    return !this.events.some((n) => n.type === yi) && this.lastFull && (this.lastMeta && t.push(this.lastMeta), t.push(this.lastFull)), [...t, ...this.events];
  }
  /** True when the buffer can produce a scrubbable replay (a full snapshot + at least one more event). */
  isPlayable() {
    const t = this.snapshot();
    return t.some((n) => n.type === yi) && t.length >= 2;
  }
  clear() {
    this.events = [], this.lastMeta = null, this.lastFull = null;
  }
}
function Zu(e, t = {}) {
  const r = new Ku({
    windowMs: t.windowMs ?? 45e3,
    maxEvents: t.maxEvents ?? 2e3
  }), n = t.maskAllInputs !== !1, i = t.maskText !== !1;
  let s;
  try {
    s = e({
      emit(c) {
        try {
          r.push(c);
        } catch {
        }
      },
      maskAllInputs: n,
      // Mask every text node by default. rrweb calls maskTextFn(text) per node; '*' keeps layout.
      maskTextFn: i ? (c) => "*".repeat(c.length) : void 0,
      // Don't record <script>/<noscript> contents and obvious secrets.
      blockClass: "klavity-no-record",
      ignoreClass: "klavity-no-record",
      recordCanvas: !1,
      collectFonts: !1
    });
  } catch {
  }
  return {
    getEvents: () => r.isPlayable() ? r.snapshot() : [],
    hasRecording: () => r.isPlayable(),
    stop: () => {
      try {
        s == null || s();
      } catch {
      }
      r.clear();
    }
  };
}
const Qu = "klav-sims-live", ed = "klav-sims-overlay", Ps = "klav-sims-ext-css";
let ke = null, Re = null, xe = null, me = null, ot = null, Wo = "critical";
const Ue = /* @__PURE__ */ new Map(), Ht = /* @__PURE__ */ new Set(), Vt = /* @__PURE__ */ new Map(), td = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }

  .ksl-sr {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; pointer-events: none;
  }

  .ksl-dock {
    display: flex; flex-direction: row;
    flex-wrap: wrap-reverse; justify-content: flex-end; align-items: flex-end;
    gap: 10px; row-gap: 6px;
    max-width: min(400px, calc(100vw - 32px));
    pointer-events: auto;
  }

  @keyframes ksl-jumpin {
    0%   { transform: translateY(80px) scale(.6);  opacity: 0; }
    52%  { transform: translateY(-14px) scale(1.1); opacity: 1; }
    72%  { transform: translateY(6px)   scale(.95); }
    88%  { transform: translateY(-2px)  scale(1.01); }
    100% { transform: translateY(0)    scale(1);    opacity: 1; }
  }
  .ksl-slot {
    position: relative; display: flex; flex-direction: column; align-items: center;
    cursor: default;
    animation: ksl-jumpin .62s cubic-bezier(.34,1.36,.64,1) both;
    animation-delay: calc(var(--ksl-idx,0) * 72ms);
    pointer-events: auto;
  }

  /* Idle "watching…" label */
  .ksl-idle {
    font-family: ui-monospace,'JetBrains Mono',monospace;
    font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase;
    color: rgba(255,255,255,.25); margin-top: 3px; white-space: nowrap;
    pointer-events: none; user-select: none;
    animation: ksl-idle-breathe 2.8s ease-in-out infinite;
    transition: opacity .3s;
  }
  @keyframes ksl-idle-breathe { 0%,100%{opacity:.45} 50%{opacity:.85} }
  .ksl-slot.ksl-has-bubble .ksl-idle,
  .ksl-slot.ksl-thinking   .ksl-idle { opacity: 0 !important; animation: none; }

  /*
   * Thinking state — spinning SVG progress ring + time hint.
   *
   * Layout: the .ksl-ring SVG is absolutely positioned so it orbits the Sim head
   * without changing the layout. The arc (circle with stroke-dasharray) spins once
   * every 2.4s, giving a clear "in-progress" signal.
   *
   * Time hint: a small "~5s" pill fades in below the ring so the admin knows a
   * review takes a few seconds (reviews typically run 3–8s in prod).
   */
  .ksl-ring {
    position: absolute;
    top: 50%; left: 50%;
    /* Centre over the ksim-head. The SVG is 58px; offset by half to centre. */
    transform: translate(-50%, -72%);
    pointer-events: none;
    opacity: 0;
    transition: opacity .25s;
  }
  .ksl-slot.ksl-thinking .ksl-ring { opacity: 1; }
  .ksl-ring circle {
    fill: none;
    stroke: var(--ksl-accent, #6366f1);
    stroke-width: 2.5;
    stroke-linecap: round;
    /* circumference ≈ 2π × 30 ≈ 188.5; dash = 60% of arc */
    stroke-dasharray: 113 75;
    stroke-dashoffset: 0;
    transform-origin: 31px 31px;
    animation: ksl-spin 2.4s linear infinite;
  }
  @keyframes ksl-spin { to { transform: rotate(360deg); } }

  /* "~5s" time hint pill — appears below the avatar while thinking */
  .ksl-time-hint {
    position: absolute;
    bottom: -18px; left: 50%;
    transform: translateX(-50%);
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 8px; letter-spacing: .06em; text-transform: uppercase;
    color: rgba(255,255,255,.5);
    background: rgba(99,102,241,.18);
    border: 1px solid rgba(99,102,241,.3);
    border-radius: 20px; padding: 1px 6px;
    white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity .3s .4s;  /* delayed fade-in so fast reviews don't flash it */
  }
  .ksl-slot.ksl-thinking .ksl-time-hint { opacity: 1; }

  /* Huddle bubble */
  .ksl-bubble {
    position: absolute; bottom: calc(100% + 10px); right: 0; width: 200px;
    transform-origin: bottom center;
    background: linear-gradient(168deg,rgba(28,22,16,.97),rgba(18,14,10,.99));
    border: 1px solid #3a332b; border-left-width: 3px; border-radius: 13px;
    padding: 10px 30px 10px 11px;
    box-shadow: 0 20px 52px rgba(0,0,0,.65), 0 6px 20px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%); backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto; z-index: 10;
    animation: ksl-bubble-in .32s cubic-bezier(.34,1.36,.64,1) both;
  }
  @keyframes ksl-bubble-in {
    0%  { transform: translateY(18px) scale(.78); opacity: 0; }
    58% { transform: translateY(-4px)  scale(1.04); opacity: 1; }
    80% { transform: translateY(2px)   scale(.98); }
    100%{ transform: translateY(0)     scale(1);   opacity: 1; }
  }
  @keyframes ksl-bubble-out {
    0%  { transform: translateY(0)     scale(1);  opacity: 1; }
    100%{ transform: translateY(-10px) scale(.88); opacity: 0; }
  }
  .ksl-bubble.is-out { pointer-events: none; animation: ksl-bubble-out .24s ease-in forwards; }
  .ksl-bubble::after  { content:''; position:absolute; bottom:-8px; right:14px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .ksl-bubble::before { content:''; position:absolute; bottom:-6px; right:15px; border:6px solid transparent; border-top-color:#1c1610; border-bottom:none; z-index:1; pointer-events:none; }

  .ksl-b-tag { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:9px; letter-spacing:.09em; text-transform:uppercase; font-weight:700; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ksl-b-sev { display:inline-block; font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; margin-left:7px; vertical-align:middle; background:rgba(233,79,55,.22); color:#e8849a; }
  .ksl-b-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .ksl-b-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }
  .ksl-b-obs  { font-size:12.5px; line-height:1.47; color:#cec6bd; }
  .ksl-b-more { font-size:11px; color:#5e5852; margin-top:5px; font-style:italic; }
  .ksl-b-close {
    position:absolute; top:7px; right:8px;
    background:none; border:none; cursor:pointer; color:#5e5852; font-size:13px;
    line-height:1; padding:2px 4px; border-radius:4px; pointer-events:auto;
    transition:color .15s,background .15s;
  }
  .ksl-b-close:hover   { color:#f5f3ee; background:rgba(255,255,255,.1); }
  .ksl-b-close:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  .ksl-close-all {
    position:absolute; top:-10px; left:-10px; width:20px; height:20px;
    border-radius:50%; background:#1a1510; border:1px solid #3a332b;
    color:#7a7268; font-size:11px; display:grid; place-items:center;
    cursor:pointer; pointer-events:auto; opacity:0;
    transition:opacity .2s,color .15s,background .15s; z-index:20;
  }
  .ksl-dock:hover .ksl-close-all { opacity:1; }
  .ksl-close-all:hover { color:#f5f3ee; background:#2a2218; }
  .ksl-close-all:focus-visible { opacity:1; outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (max-width:480px) {
    .ksl-dock { max-width:calc(100vw - 24px); gap:7px; }
    .ksl-bubble { width:min(180px,calc(100vw - 40px)); font-size:12px; }
  }
  @media (prefers-reduced-motion:reduce) {
    .ksl-slot,.ksl-bubble,.ksl-bubble.is-out { animation:none !important; opacity:1; transform:none; }
    .ksl-idle { animation:none !important; opacity:.6; }
    .ksl-ring circle { animation:none !important; }
  }
`, rd = `
  /* ── Walker — a Sim that travels from the huddle to a page element ── */
  .klav-walker {
    position: fixed;
    pointer-events: none;
    z-index: 2147483641;
    /* CSS transition drives the walk trajectory */
    transition: left 1.1s cubic-bezier(.4,0,.2,1), top 1.1s cubic-bezier(.4,0,.2,1);
    will-change: left, top;
  }
  /* Suppress idle bob while walking; keep legs moving */
  .klav-walker .ksim { animation: none !important; }
  /* Homepage-style fast leg walk (mirrors .sim.walk legA/legB from site/index.html) */
  .klav-walker .ksim-legs i:nth-child(1) { animation: klav-leg-a .34s ease-in-out infinite alternate !important; }
  .klav-walker .ksim-legs i:nth-child(2) { animation: klav-leg-b .34s ease-in-out infinite alternate !important; }
  @keyframes klav-leg-a { from { transform: rotate(-24deg) } to { transform: rotate(24deg) } }
  @keyframes klav-leg-b { from { transform: rotate(24deg)  } to { transform: rotate(-24deg) } }

  /* ── Halo box — drawn around the flagged page element ── */
  .klav-halo {
    position: fixed;
    pointer-events: none;
    border-radius: 8px;
    z-index: 2147483640;
    border-width: 2px;
    border-style: solid;
    /* entry: scale-in from centre */
    animation: klav-halo-in .38s cubic-bezier(.34,1.36,.64,1) both,
               klav-halo-pulse 2.4s ease-in-out .4s infinite;
  }
  @keyframes klav-halo-in {
    from { transform: scale(.84); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes klav-halo-pulse {
    0%,100% { opacity: .75; }
    50%     { opacity: 1; }
  }

  /* ── Pinned bubble — sticky annotation anchored to the halo ── */
  @keyframes klav-pin-in {
    from { transform: scale(.86) translateY(10px); opacity: 0; }
    60%  { transform: scale(1.02) translateY(-2px); opacity: 1; }
    to   { transform: scale(1)   translateY(0);    opacity: 1; }
  }
  @keyframes klav-pin-out {
    to   { transform: scale(.88) translateY(-8px); opacity: 0; }
  }
  .klav-pin {
    position: fixed;
    z-index: 2147483642;
    width: 224px;
    background: linear-gradient(168deg, rgba(22,17,12,.98), rgba(14,11,8,.99));
    border: 1px solid #3a332b;
    border-left-width: 3px;
    border-radius: 13px;
    padding: 11px 11px 10px 12px;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 20px 52px rgba(0,0,0,.68), 0 6px 18px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto;
    animation: klav-pin-in .36s cubic-bezier(.34,1.36,.64,1) both;
  }
  .klav-pin.is-out { animation: klav-pin-out .22s ease-in forwards; pointer-events: none; }

  /* Tail pointing down toward the halo */
  .klav-pin::after  { content:''; position:absolute; bottom:-8px; left:18px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .klav-pin::before { content:''; position:absolute; bottom:-6px; left:19px; border:6px solid transparent; border-top-color:#16110c;  border-bottom:none; z-index:1; pointer-events:none; }

  /* Header row: mini avatar + name tag + severity pill */
  .klav-pin-hd    { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
  .klav-pin-av    { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; font-family:ui-monospace,monospace; font-size:7.5px; font-weight:700; color:#fff; flex-shrink:0; }
  .klav-pin-name  { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:9px; letter-spacing:.09em; text-transform:uppercase; font-weight:700; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .klav-pin-sev   { font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; background:rgba(233,79,55,.22); color:#e8849a; flex-shrink:0; }
  .klav-pin-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .klav-pin-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }

  /* Observation text */
  .klav-pin-obs { font-size:12.5px; line-height:1.47; color:#cec6bd; margin-bottom:10px; }

  /* Action buttons */
  .klav-pin-actions { display:flex; gap:7px; }
  .klav-pin-triage {
    flex:1; background:rgba(139,92,246,.18); border:1px solid rgba(139,92,246,.38);
    color:#c4b5fd; font-size:11.5px; font-weight:600; border-radius:7px;
    padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,border-color .15s;
  }
  .klav-pin-triage:hover { background:rgba(139,92,246,.32); border-color:rgba(139,92,246,.6); }
  .klav-pin-triage:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }
  .klav-pin-dismiss {
    background:none; border:1px solid #3a332b; color:#6e6560; font-size:11.5px;
    border-radius:7px; padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,color .15s,border-color .15s;
  }
  .klav-pin-dismiss:hover { background:rgba(255,255,255,.08); color:#f5f3ee; border-color:#5a5248; }
  .klav-pin-dismiss:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (prefers-reduced-motion:reduce) {
    .klav-walker { transition:none !important; }
    .klav-walker .ksim-legs i { animation:none !important; }
    .klav-halo,.klav-halo.klav-halo { animation:none !important; opacity:1; transform:none; }
    .klav-pin,.klav-pin.is-out { animation:none !important; opacity:1; transform:none; }
  }
`;
function Ts(e, t) {
  const r = e.replace("#", ""), n = (h) => parseInt(h, 16), [i, s, c] = r.length === 3 ? [n(r[0] + r[0]), n(r[1] + r[1]), n(r[2] + r[2])] : [n(r.slice(0, 2)), n(r.slice(2, 4)), n(r.slice(4, 6))];
  return `rgba(${i},${s},${c},${t})`;
}
function id(e) {
  if (e.severity === "high" || e.severity === "critical") return !0;
  const t = /* @__PURE__ */ new Set(["frustrated", "confused", "alarmed", "negative", "blocked", "stuck"]);
  return !!(e.sentiment && t.has(e.sentiment.toLowerCase()));
}
function nd(e) {
  const t = Math.round((e.x + e.w / 2) * window.innerWidth), r = Math.round((e.y + e.h / 2) * window.innerHeight), n = [];
  for (const s of [me, ke])
    s && (n.push({ el: s, vis: s.style.visibility }), s.style.visibility = "hidden");
  const i = document.elementFromPoint(t, r);
  for (const { el: s, vis: c } of n) s.style.visibility = c;
  return !i || i === document.body || i === document.documentElement ? null : i;
}
function sd() {
  if (ke && Re) return Re;
  ke = document.createElement("div"), ke.id = Qu, ke.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;", Re = ke.attachShadow({ mode: "open" }), El(Re);
  const e = document.createElement("style");
  return e.textContent = td, Re.appendChild(e), document.body.appendChild(ke), Re;
}
function qo() {
  if (me) return me;
  if (!document.getElementById(Ps)) {
    const e = document.createElement("style");
    e.id = Ps, e.textContent = rd, document.head.appendChild(e);
  }
  return me = document.createElement("div"), me.id = ed, me.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483640;pointer-events:none;overflow:visible;", document.body.appendChild(me), me;
}
function od(e, t = [], r = {}) {
  if (typeof document > "u") return;
  ut(), Wo = r.mode ?? "critical";
  const n = sd();
  qo(), ot = new AbortController(), document.addEventListener(
    "keydown",
    (h) => {
      h.key === "Escape" && ut();
    },
    { signal: ot.signal }
  );
  const i = document.createElement("div");
  i.className = "ksl-sr", i.id = "ksl-announcer", i.setAttribute("aria-live", "polite"), i.setAttribute("aria-atomic", "true"), n.appendChild(i), xe = document.createElement("div"), xe.className = "ksl-dock", xe.setAttribute("role", "region"), xe.setAttribute("aria-label", "Sims — live feedback"), n.appendChild(xe);
  const s = document.createElement("button");
  s.className = "ksl-close-all", s.setAttribute("aria-label", "Stop all Sim reviews"), s.title = "Stop Sim reviews", s.innerHTML = ie("x", { size: 12 }), s.addEventListener("click", ut), xe.appendChild(s);
  const c = e === "all" ? t : t.filter((h) => e.includes(h.id));
  if (!c.length) {
    console.warn("[KlavitySims] deploy(): no matching Sims — dock not mounted."), ut();
    return;
  }
  c.slice(0, 8).forEach((h, o) => {
    const p = h.accent || "#6366f1", a = h.initials || h.name.slice(0, 2).toUpperCase(), d = document.createElement("div");
    d.className = "ksl-slot", d.dataset.simId = h.id, d.setAttribute("aria-label", h.name), d.style.setProperty("--ksl-idx", String(o)), d.style.setProperty("--ksl-accent", p);
    const u = window.innerWidth <= 480 ? 38 : 46;
    d.appendChild(Gs({ name: h.name, initials: a, photoUrl: h.photoUrl, color: p, animate: !0, legs: !0, size: u }));
    const l = "http://www.w3.org/2000/svg", m = document.createElementNS(l, "svg");
    m.setAttribute("class", "ksl-ring"), m.setAttribute("width", "62"), m.setAttribute("height", "62"), m.setAttribute("viewBox", "0 0 62 62"), m.setAttribute("aria-hidden", "true");
    const f = document.createElementNS(l, "circle");
    f.setAttribute("cx", "31"), f.setAttribute("cy", "31"), f.setAttribute("r", "29"), m.appendChild(f), d.appendChild(m);
    const g = document.createElement("span");
    g.className = "ksl-time-hint", g.textContent = "~5s", g.setAttribute("aria-hidden", "true"), d.appendChild(g);
    const x = document.createElement("span");
    x.className = "ksl-idle", x.textContent = "watching", x.setAttribute("aria-hidden", "true"), d.appendChild(x), xe.appendChild(d), Ue.set(h.id, { avatarEl: d, accent: p, initials: a, name: h.name, clearBubble: null });
  });
}
function ad(e) {
  Ue.forEach(({ avatarEl: t }) => t.classList.toggle("ksl-thinking", e));
}
function ld(e, t, r) {
  const n = me, i = ke.getBoundingClientRect(), s = i.left + i.width / 2 - 21, c = i.top + i.height / 2 - 48, h = document.createElement("div");
  return h.className = "klav-walker", h.style.left = s + "px", h.style.top = c + "px", h.appendChild(
    Gs({ name: e.name, initials: e.initials, color: e.accent, animate: !1, legs: !0, size: 42 })
  ), n.appendChild(h), Ht.add(h), new Promise((o) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      h.style.left = t + "px", h.style.top = r + "px";
      const p = () => {
        h.remove(), Ht.delete(h), o();
      };
      h.addEventListener("transitionend", p, { once: !0 }), setTimeout(p, 1400);
    }));
  });
}
function cd(e, t, r) {
  const n = qo(), i = r.getBoundingClientRect(), s = `pin_${e.name}_${Date.now()}`, c = document.createElement("div");
  c.className = "klav-halo", c.style.cssText = [
    `left:${i.left - 5}px`,
    `top:${i.top - 5}px`,
    `width:${i.width + 10}px`,
    `height:${i.height + 10}px`,
    `border-color:${e.accent}`,
    `box-shadow:0 0 0 4px ${Ts(e.accent, 0.16)},0 0 24px ${Ts(e.accent, 0.2)}`
  ].join(";"), n.appendChild(c);
  const h = 224, o = 150;
  let p = i.left, a = i.top - o - 14;
  p = Math.max(10, Math.min(window.innerWidth - h - 10, p)), a < 10 && (a = i.bottom + 14);
  const d = document.createElement("div");
  d.className = "klav-pin", d.style.borderLeftColor = e.accent, d.style.left = p + "px", d.style.top = a + "px", d.setAttribute("role", "status"), d.setAttribute("aria-label", `Pinned feedback from ${e.name}`);
  const u = document.createElement("div");
  u.className = "klav-pin-hd";
  const l = document.createElement("div");
  l.className = "klav-pin-av", l.style.background = e.accent, l.textContent = e.initials;
  const m = document.createElement("span");
  if (m.className = "klav-pin-name", m.style.color = e.accent, m.textContent = e.name, u.appendChild(l), u.appendChild(m), t.severity && t.severity !== "none") {
    const w = t.severity === "medium" ? " sev-m" : t.severity === "low" ? " sev-l" : "", S = document.createElement("span");
    S.className = `klav-pin-sev${w}`, S.setAttribute("aria-label", `Severity: ${t.severity}`), S.textContent = t.severity, u.appendChild(S);
  }
  const f = document.createElement("div");
  f.className = "klav-pin-obs", f.textContent = t.text || "";
  const g = document.createElement("div");
  g.className = "klav-pin-actions";
  const x = document.createElement("button");
  x.className = "klav-pin-triage", x.innerHTML = ie("bug") + " Triage as bug", x.setAttribute("aria-label", `Triage observation from ${e.name} as a bug`), x.addEventListener("click", () => {
    var w;
    (w = $t.onTriage) == null || w.call($t, t, e.name);
  });
  const y = document.createElement("button");
  y.className = "klav-pin-dismiss", y.textContent = "Dismiss", y.setAttribute("aria-label", `Dismiss pinned feedback from ${e.name}`), y.addEventListener("click", () => {
    d.classList.add("is-out"), c.style.animation = "klav-pin-out .22s ease-in forwards", setTimeout(() => {
      d.remove(), c.remove(), Vt.delete(s);
    }, 240);
  }), g.appendChild(x), g.appendChild(y), d.appendChild(u), d.appendChild(f), d.appendChild(g), n.appendChild(d), Vt.set(s, { halo: c, bubble: d });
}
async function ud(e, t) {
  if (!me || !ke) return;
  const r = t.region, n = nd(r);
  if (!n) {
    jo(e, [t]);
    return;
  }
  const i = n.getBoundingClientRect(), s = Math.max(8, Math.min(window.innerWidth - 60, i.left + i.width * 0.1 - 21)), c = Math.min(window.innerHeight - 80, i.bottom - 58);
  await ld(e, s, c), cd(e, t, n);
}
function jo(e, t) {
  var l;
  if (!xe || !Re) return;
  (l = e.clearBubble) == null || l.call(e);
  const r = t[0], n = t.length - 1, i = Re.getElementById("ksl-announcer");
  i && (i.textContent = "", requestAnimationFrame(() => {
    if (!Re) return;
    const m = Re.getElementById("ksl-announcer");
    m && (m.textContent = `${e.name}: ${r.text || ""}${n > 0 ? ` and ${n} more` : ""}`);
  }));
  const s = document.createElement("div");
  s.className = "ksl-bubble", s.setAttribute("role", "status"), s.setAttribute("aria-label", `Feedback from ${e.name}`), s.style.borderLeftColor = e.accent;
  const c = document.createElement("button");
  c.className = "ksl-b-close", c.setAttribute("aria-label", `Dismiss feedback from ${e.name}`), c.innerHTML = ie("x", { size: 13 });
  const h = document.createElement("div");
  if (h.className = "ksl-b-tag", h.style.color = e.accent, h.textContent = e.name, r.severity && r.severity !== "none") {
    const m = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", f = document.createElement("span");
    f.className = `ksl-b-sev${m}`.replace("sev-m", "sev-m").replace("sev-l", "sev-l"), f.textContent = r.severity, h.appendChild(f);
  }
  const o = document.createElement("div");
  if (o.className = "ksl-b-obs", o.textContent = r.text || "", s.appendChild(c), s.appendChild(h), s.appendChild(o), n > 0) {
    const m = document.createElement("div");
    m.className = "ksl-b-more", m.textContent = `+${n} more observation${n > 1 ? "s" : ""}`, s.appendChild(m);
  }
  e.avatarEl.appendChild(s), e.avatarEl.classList.add("ksl-has-bubble");
  let p = !1;
  const a = () => {
    var m;
    p || (p = !0, clearTimeout(d), s.classList.add("is-out"), setTimeout(() => {
      var f;
      s.remove(), ((f = Ue.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : f.clearBubble) === u && e.avatarEl.classList.remove("ksl-has-bubble");
    }, 265), ((m = Ue.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : m.clearBubble) === u && (Ue.get(e.avatarEl.dataset.simId ?? "").clearBubble = null));
  }, d = setTimeout(a, 14e3), u = () => {
    clearTimeout(d), a();
  };
  c.addEventListener("click", u), e.clearBubble = u;
}
function dd(e, t, r) {
  if (!xe) return;
  const n = Ue.get(e);
  if (!n) {
    console.warn(`[KlavitySims] renderFeedback: simId "${e}" not in dock`);
    return;
  }
  if (!r.length) return;
  const i = [], s = [];
  for (const c of r)
    c.region && (Wo === "all" || id(c)) ? i.push(c) : s.push(c);
  i.forEach((c, h) => {
    setTimeout(() => void ud(n, c), h * 500);
  }), s.length && jo(n, s);
}
function ut() {
  Ue.forEach((e) => {
    var t;
    (t = e.clearBubble) == null || t.call(e), e.clearBubble = null;
  }), Ue.clear(), ot == null || ot.abort(), ot = null, Ht.forEach((e) => e.remove()), Ht.clear(), Vt.forEach(({ halo: e, bubble: t }) => {
    e.remove(), t.remove();
  }), Vt.clear(), me == null || me.remove(), me = null, xe == null || xe.remove(), xe = null, ke == null || ke.remove(), ke = null, Re = null;
}
const $t = {
  deploy: od,
  setReviewing: ad,
  renderFeedback: dd,
  undeploy: ut,
  onTriage: null
};
function hd() {
  typeof window > "u" || window.KlavitySims || (window.KlavitySims = $t);
}
typeof window < "u" && hd();
const Ns = "klav-ao-css", pd = "klav-ao-overlay";
function fd(e, t, r, n, i, s = 10) {
  const o = !(e.y - r - 14 >= s), p = o ? e.y + e.h + 14 : e.y - r - 14, a = Math.max(s, Math.min(p, i - r - s));
  return { left: Math.max(s, Math.min(e.x, n - t - s)), top: a, below: o };
}
const md = `
  .klav-ao-halo {
    position: fixed;
    border-radius: 8px;
    border-width: 2px;
    border-style: solid;
    pointer-events: none;
    z-index: 2147483640;
    animation: klav-ao-in .38s cubic-bezier(.34,1.36,.64,1) both,
               klav-ao-pulse 2.4s ease-in-out .4s infinite;
  }
  @keyframes klav-ao-in {
    from { transform: scale(.84); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes klav-ao-pulse {
    0%,100% { opacity: .75; }
    50%     { opacity: 1; }
  }

  .klav-ao-pin {
    position: fixed;
    z-index: 2147483642;
    width: 224px;
    background: linear-gradient(168deg, rgba(22,17,12,.98), rgba(14,11,8,.99));
    border: 1px solid #3a332b;
    border-left-width: 3px;
    border-radius: 13px;
    padding: 11px 11px 10px 12px;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 20px 52px rgba(0,0,0,.68), 0 6px 18px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    backdrop-filter: blur(12px) saturate(140%);
    pointer-events: auto;
    animation: klav-ao-pin-in .36s cubic-bezier(.34,1.36,.64,1) both;
  }
  @keyframes klav-ao-pin-in {
    from { transform: scale(.86) translateY(10px); opacity: 0; }
    60%  { transform: scale(1.02) translateY(-2px); opacity: 1; }
    to   { transform: scale(1)   translateY(0);    opacity: 1; }
  }
  .klav-ao-pin.is-out {
    animation: klav-ao-pin-out .22s ease-in forwards;
    pointer-events: none;
  }
  @keyframes klav-ao-pin-out {
    to { transform: scale(.88) translateY(-8px); opacity: 0; }
  }
  /* Tail pointing down toward the halo (default: pin is above the halo) */
  .klav-ao-pin::after  { content:''; position:absolute; bottom:-8px; left:18px; border:7px solid transparent; border-top-color:#3a332b; border-bottom:none; pointer-events:none; }
  .klav-ao-pin::before { content:''; position:absolute; bottom:-6px; left:19px; border:6px solid transparent; border-top-color:#16110c;  border-bottom:none; z-index:1; pointer-events:none; }
  /* Tail flipped to top when the pin is placed below the halo */
  .klav-ao-pin.tail-top::after  { bottom:auto; top:-8px; border-top:none; border-bottom:7px solid #3a332b; }
  .klav-ao-pin.tail-top::before { bottom:auto; top:-6px; border-top:none; border-bottom:6px solid #16110c; z-index:1; }

  .klav-ao-hd   { display:flex; align-items:center; gap:6px; margin-bottom:7px; }
  .klav-ao-lbl  { font-family:ui-monospace,'JetBrains Mono',monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .klav-ao-sev  { font-family:ui-monospace,monospace; font-size:9px; letter-spacing:.05em; text-transform:uppercase; padding:1px 5px; border-radius:4px; background:rgba(233,79,55,.22); color:#e8849a; flex-shrink:0; }
  .klav-ao-sev.sev-m { background:rgba(244,169,60,.2);   color:#e8a24a; }
  .klav-ao-sev.sev-l { background:rgba(127,209,196,.15); color:#7fd1c4; }

  .klav-ao-dismiss {
    background:none; border:1px solid #3a332b; color:#6e6560; font-size:11.5px;
    border-radius:7px; padding:5px 8px; cursor:pointer; font-family:system-ui,sans-serif;
    transition:background .15s,color .15s,border-color .15s; width:100%; margin-top:8px;
  }
  .klav-ao-dismiss:hover { background:rgba(255,255,255,.08); color:#f5f3ee; border-color:#5a5248; }
  .klav-ao-dismiss:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  @media (prefers-reduced-motion:reduce) {
    .klav-ao-halo { animation:none !important; opacity:1; transform:none; }
    .klav-ao-pin,.klav-ao-pin.is-out { animation:none !important; opacity:1; transform:none; }
  }
`;
let He = null, gd = 1;
const Gt = /* @__PURE__ */ new Map();
function _s(e, t) {
  const r = e.replace("#", ""), n = (h) => parseInt(h, 16), [i, s, c] = r.length === 3 ? [n(r[0] + r[0]), n(r[1] + r[1]), n(r[2] + r[2])] : [n(r.slice(0, 2)), n(r.slice(2, 4)), n(r.slice(4, 6))];
  return `rgba(${i},${s},${c},${t})`;
}
function yd() {
  if (He) return He;
  if (!document.getElementById(Ns)) {
    const e = document.createElement("style");
    e.id = Ns, e.textContent = md, document.head.appendChild(e);
  }
  return He = document.createElement("div"), He.id = pd, He.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:visible;z-index:2147483640;", document.body.appendChild(He), He;
}
function Md(e, t, r = {}) {
  const n = yd(), i = r.color ?? "#6366f1", s = `klav-ao-${gd++}`, c = 5, h = document.createElement("div");
  h.className = "klav-ao-halo", h.dataset.aoId = s, h.style.left = e.x - c + "px", h.style.top = e.y - c + "px", h.style.width = e.w + c * 2 + "px", h.style.height = e.h + c * 2 + "px", h.style.borderColor = i, h.style.boxShadow = `0 0 0 4px ${_s(i, 0.14)},0 0 24px ${_s(i, 0.18)}`, n.appendChild(h);
  let o = null;
  if (t) {
    const d = { x: e.x - c, y: e.y - c, w: e.w + c * 2, h: e.h + c * 2 }, { left: u, top: l, below: m } = fd(
      d,
      224,
      96,
      window.innerWidth,
      window.innerHeight
    );
    o = document.createElement("div"), o.className = "klav-ao-pin" + (m ? " tail-top" : ""), o.dataset.aoId = s, o.style.borderLeftColor = i, o.style.left = u + "px", o.style.top = l + "px", o.setAttribute("role", "status"), o.setAttribute("aria-label", `Annotation: ${t}`);
    const f = document.createElement("div");
    f.className = "klav-ao-hd";
    const g = document.createElement("span");
    if (g.className = "klav-ao-lbl", g.style.color = i, g.textContent = t, f.appendChild(g), r.severity) {
      const y = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", w = document.createElement("span");
      w.className = `klav-ao-sev${y}`, w.textContent = r.severity, f.appendChild(w);
    }
    const x = document.createElement("button");
    x.className = "klav-ao-dismiss", x.textContent = "Dismiss", x.addEventListener("click", () => Ho(s)), o.appendChild(f), o.appendChild(x), n.appendChild(o);
  }
  return Gt.set(s, { halo: h, pin: o }), s;
}
function Ho(e) {
  const t = Gt.get(e);
  if (!t) return;
  Gt.delete(e);
  const { halo: r, pin: n } = t;
  n ? (n.classList.add("is-out"), r.style.animation = "klav-ao-pin-out .22s ease-in forwards", setTimeout(() => {
    n.remove(), r.remove();
  }, 240)) : r.remove();
}
function Rd() {
  for (const e of [...Gt.keys()]) Ho(e);
}
let Vo = et;
const Go = { consoleErrors: [], networkFailures: [] };
let Yo, Jo, at = null;
function Xo(e) {
  const t = {};
  for (const [r, n] of Object.entries(e))
    n != null && (t[String(r).slice(0, 64)] = String(n).slice(0, 1e3));
  return t;
}
async function $s() {
  return Xa(document.body, {
    cacheBust: !0,
    pixelRatio: 1,
    skipFonts: !0,
    filter: (e) => {
      if (e.id === "klavity-sdk-host") return !1;
      if (e.nodeName === "IMG") {
        const t = e.src ?? "";
        if (t && !t.startsWith(window.location.origin) && !t.startsWith("data:")) return !1;
      }
      return !0;
    }
  });
}
function bd() {
  return ol(Go, { identity: Yo, metadata: Jo });
}
async function vd(e) {
  return el(
    { type: e.type, description: e.description, context: e.context, screenshots: e.screenshots, replayEvents: e.replayEvents },
    Vo,
    { jira: Rl, linear: Ol, github: Il, plane: Al, backend: Ll }
  );
}
function ji(e = "bug") {
  const t = gl(e, {
    onCaptureFull: $s,
    onSubmit: async (r) => vd({
      type: r.type,
      description: r.description,
      context: bd(),
      screenshots: r.screenshots,
      replayEvents: (at == null ? void 0 : at.getEvents()) ?? []
    })
  });
  setTimeout(async () => {
    try {
      const r = await $s();
      t.addScreenshot(r);
    } catch {
    }
  }, 200);
}
function wd() {
  al(Go, { consoleLevels: !0 });
}
function Ko(e) {
  Yo = e ? Xo(e) : void 0;
}
function Zo(e) {
  Jo = e ? Xo(e) : void 0;
}
function xd() {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 200)}px;top:${Math.min(e.clientY, window.innerHeight - 80)}px;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:4px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:system-ui;`, t.innerHTML = `
      <div data-action="bug" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${ie("bug")} Report a Bug</div>
      <div data-action="feature" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${ie("lightbulb")} Request a Feature</div>
    `, document.body.appendChild(t);
    const r = (n) => {
      (!n || !t.contains(n.target)) && (t.remove(), document.removeEventListener("click", r));
    };
    t.addEventListener("click", (n) => {
      var s;
      const i = (s = n.target.closest("[data-action]")) == null ? void 0 : s.getAttribute("data-action");
      t.remove(), document.removeEventListener("click", r), i && ji(i);
    }), setTimeout(() => document.addEventListener("click", r), 0);
  });
}
function Qo(e = {}) {
  if (Vo = {
    ...et,
    ...e,
    jira: { ...et.jira, ...e.jira },
    linear: { ...et.linear, ...e.linear },
    github: { ...et.github, ...e.github },
    plane: { ...et.plane, ...e.plane }
  }, wd(), xd(), !at)
    try {
      at = Zu(Be);
    } catch {
      at = null;
    }
}
typeof window < "u" && (window.KlavitySnap = { init: Qo, openModal: ji, identify: Ko, setMetadata: Zo });
const Od = { init: Qo, openModal: ji, identify: Ko, setMetadata: Zo };
export {
  $t as KlavitySims,
  $t as SimsLive,
  Ho as clearAnnotation,
  Rd as clearAnnotations,
  Od as default,
  Ko as identify,
  Qo as init,
  hd as installKlavitySims,
  ji as openModal,
  Zo as setMetadata,
  Md as showAnnotation
};
