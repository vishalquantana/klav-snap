var Ko = Object.defineProperty;
var Zo = (e, t, r) => t in e ? Ko(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var yt = (e, t, r) => Zo(e, typeof t != "symbol" ? t + "" : t, r);
function Qo(e, t) {
  if (e.match(/^[a-z]+:\/\//i))
    return e;
  if (e.match(/^\/\//))
    return window.location.protocol + e;
  if (e.match(/^[a-z]+:/i))
    return e;
  const r = document.implementation.createHTMLDocument(), i = r.createElement("base"), n = r.createElement("a");
  return r.head.appendChild(i), r.body.appendChild(n), t && (i.href = t), n.href = e, n.href;
}
const ea = /* @__PURE__ */ (() => {
  let e = 0;
  const t = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => (e += 1, `u${t()}${e}`);
})();
function Ne(e) {
  const t = [];
  for (let r = 0, i = e.length; r < i; r++)
    t.push(e[r]);
  return t;
}
let Ge = null;
function Ps(e = {}) {
  return Ge || (e.includeStyleProperties ? (Ge = e.includeStyleProperties, Ge) : (Ge = Ne(window.getComputedStyle(document.documentElement)), Ge));
}
function Pt(e, t) {
  const i = (e.ownerDocument.defaultView || window).getComputedStyle(e).getPropertyValue(t);
  return i ? parseFloat(i.replace("px", "")) : 0;
}
function ta(e) {
  const t = Pt(e, "border-left-width"), r = Pt(e, "border-right-width");
  return e.clientWidth + t + r;
}
function ra(e) {
  const t = Pt(e, "border-top-width"), r = Pt(e, "border-bottom-width");
  return e.clientHeight + t + r;
}
function Ts(e, t = {}) {
  const r = t.width || ta(e), i = t.height || ra(e);
  return { width: r, height: i };
}
function na() {
  let e, t;
  try {
    t = process;
  } catch {
  }
  const r = t && t.env ? t.env.devicePixelRatio : null;
  return r && (e = parseInt(r, 10), Number.isNaN(e) && (e = 1)), e || window.devicePixelRatio || 1;
}
const be = 16384;
function ia(e) {
  (e.width > be || e.height > be) && (e.width > be && e.height > be ? e.width > e.height ? (e.height *= be / e.width, e.width = be) : (e.width *= be / e.height, e.height = be) : e.width > be ? (e.height *= be / e.width, e.width = be) : (e.width *= be / e.height, e.height = be));
}
function Tt(e) {
  return new Promise((t, r) => {
    const i = new Image();
    i.onload = () => {
      i.decode().then(() => {
        requestAnimationFrame(() => t(i));
      });
    }, i.onerror = r, i.crossOrigin = "anonymous", i.decoding = "async", i.src = e;
  });
}
async function sa(e) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then((t) => `data:image/svg+xml;charset=utf-8,${t}`);
}
async function oa(e, t, r) {
  const i = "http://www.w3.org/2000/svg", n = document.createElementNS(i, "svg"), s = document.createElementNS(i, "foreignObject");
  return n.setAttribute("width", `${t}`), n.setAttribute("height", `${r}`), n.setAttribute("viewBox", `0 0 ${t} ${r}`), s.setAttribute("width", "100%"), s.setAttribute("height", "100%"), s.setAttribute("x", "0"), s.setAttribute("y", "0"), s.setAttribute("externalResourcesRequired", "true"), n.appendChild(s), s.appendChild(e), sa(n);
}
const ge = (e, t) => {
  if (e instanceof t)
    return !0;
  const r = Object.getPrototypeOf(e);
  return r === null ? !1 : r.constructor.name === t.name || ge(r, t);
};
function aa(e) {
  const t = e.getPropertyValue("content");
  return `${e.cssText} content: '${t.replace(/'|"/g, "")}';`;
}
function la(e, t) {
  return Ps(t).map((r) => {
    const i = e.getPropertyValue(r), n = e.getPropertyPriority(r);
    return `${r}: ${i}${n ? " !important" : ""};`;
  }).join(" ");
}
function ca(e, t, r, i) {
  const n = `.${e}:${t}`, s = r.cssText ? aa(r) : la(r, i);
  return document.createTextNode(`${n}{${s}}`);
}
function Hn(e, t, r, i) {
  const n = window.getComputedStyle(e, r), s = n.getPropertyValue("content");
  if (s === "" || s === "none")
    return;
  const c = ea();
  try {
    t.className = `${t.className} ${c}`;
  } catch {
    return;
  }
  const d = document.createElement("style");
  d.appendChild(ca(c, r, n, i)), t.appendChild(d);
}
function ua(e, t, r) {
  Hn(e, t, ":before", r), Hn(e, t, ":after", r);
}
const Vn = "application/font-woff", Gn = "image/jpeg", ha = {
  woff: Vn,
  woff2: Vn,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: Gn,
  jpeg: Gn,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function da(e) {
  const t = /\.([^./]*?)$/g.exec(e);
  return t ? t[1] : "";
}
function wn(e) {
  const t = da(e).toLowerCase();
  return ha[t] || "";
}
function pa(e) {
  return e.split(/,/)[1];
}
function mn(e) {
  return e.search(/^(data:)/) !== -1;
}
function fa(e, t) {
  return `data:${t};base64,${e}`;
}
async function Ns(e, t, r) {
  const i = await fetch(e, t);
  if (i.status === 404)
    throw new Error(`Resource "${i.url}" not found`);
  const n = await i.blob();
  return new Promise((s, c) => {
    const d = new FileReader();
    d.onerror = c, d.onloadend = () => {
      try {
        s(r({ res: i, result: d.result }));
      } catch (o) {
        c(o);
      }
    }, d.readAsDataURL(n);
  });
}
const ir = {};
function ma(e, t, r) {
  let i = e.replace(/\?.*/, "");
  return r && (i = e), /ttf|otf|eot|woff2?/i.test(i) && (i = i.replace(/.*\//, "")), t ? `[${t}]${i}` : i;
}
async function xn(e, t, r) {
  const i = ma(e, t, r.includeQueryParams);
  if (ir[i] != null)
    return ir[i];
  r.cacheBust && (e += (/\?/.test(e) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime());
  let n;
  try {
    const s = await Ns(e, r.fetchRequestInit, ({ res: c, result: d }) => (t || (t = c.headers.get("Content-Type") || ""), pa(d)));
    n = fa(s, t);
  } catch (s) {
    n = r.imagePlaceholder || "";
    let c = `Failed to fetch resource: ${e}`;
    s && (c = typeof s == "string" ? s : s.message), c && console.warn(c);
  }
  return ir[i] = n, n;
}
async function ga(e) {
  const t = e.toDataURL();
  return t === "data:," ? e.cloneNode(!1) : Tt(t);
}
async function ya(e, t) {
  if (e.currentSrc) {
    const s = document.createElement("canvas"), c = s.getContext("2d");
    s.width = e.clientWidth, s.height = e.clientHeight, c == null || c.drawImage(e, 0, 0, s.width, s.height);
    const d = s.toDataURL();
    return Tt(d);
  }
  const r = e.poster, i = wn(r), n = await xn(r, i, t);
  return Tt(n);
}
async function ba(e, t) {
  var r;
  try {
    if (!((r = e == null ? void 0 : e.contentDocument) === null || r === void 0) && r.body)
      return await qt(e.contentDocument.body, t, !0);
  } catch {
  }
  return e.cloneNode(!1);
}
async function va(e, t) {
  return ge(e, HTMLCanvasElement) ? ga(e) : ge(e, HTMLVideoElement) ? ya(e, t) : ge(e, HTMLIFrameElement) ? ba(e, t) : e.cloneNode(_s(e));
}
const wa = (e) => e.tagName != null && e.tagName.toUpperCase() === "SLOT", _s = (e) => e.tagName != null && e.tagName.toUpperCase() === "SVG";
async function xa(e, t, r) {
  var i, n;
  if (_s(t))
    return t;
  let s = [];
  return wa(e) && e.assignedNodes ? s = Ne(e.assignedNodes()) : ge(e, HTMLIFrameElement) && (!((i = e.contentDocument) === null || i === void 0) && i.body) ? s = Ne(e.contentDocument.body.childNodes) : s = Ne(((n = e.shadowRoot) !== null && n !== void 0 ? n : e).childNodes), s.length === 0 || ge(e, HTMLVideoElement) || await s.reduce((c, d) => c.then(() => qt(d, r)).then((o) => {
    o && t.appendChild(o);
  }), Promise.resolve()), t;
}
function ka(e, t, r) {
  const i = t.style;
  if (!i)
    return;
  const n = window.getComputedStyle(e);
  n.cssText ? (i.cssText = n.cssText, i.transformOrigin = n.transformOrigin) : Ps(r).forEach((s) => {
    let c = n.getPropertyValue(s);
    s === "font-size" && c.endsWith("px") && (c = `${Math.floor(parseFloat(c.substring(0, c.length - 2))) - 0.1}px`), ge(e, HTMLIFrameElement) && s === "display" && c === "inline" && (c = "block"), s === "d" && t.getAttribute("d") && (c = `path(${t.getAttribute("d")})`), i.setProperty(s, c, n.getPropertyPriority(s));
  });
}
function Sa(e, t) {
  ge(e, HTMLTextAreaElement) && (t.innerHTML = e.value), ge(e, HTMLInputElement) && t.setAttribute("value", e.value);
}
function Ca(e, t) {
  if (ge(e, HTMLSelectElement)) {
    const i = Array.from(t.children).find((n) => e.value === n.getAttribute("value"));
    i && i.setAttribute("selected", "");
  }
}
function Ea(e, t, r) {
  return ge(t, Element) && (ka(e, t, r), ua(e, t, r), Sa(e, t), Ca(e, t)), t;
}
async function Ma(e, t) {
  const r = e.querySelectorAll ? e.querySelectorAll("use") : [];
  if (r.length === 0)
    return e;
  const i = {};
  for (let s = 0; s < r.length; s++) {
    const d = r[s].getAttribute("xlink:href");
    if (d) {
      const o = e.querySelector(d), p = document.querySelector(d);
      !o && p && !i[d] && (i[d] = await qt(p, t, !0));
    }
  }
  const n = Object.values(i);
  if (n.length) {
    const s = "http://www.w3.org/1999/xhtml", c = document.createElementNS(s, "svg");
    c.setAttribute("xmlns", s), c.style.position = "absolute", c.style.width = "0", c.style.height = "0", c.style.overflow = "hidden", c.style.display = "none";
    const d = document.createElementNS(s, "defs");
    c.appendChild(d);
    for (let o = 0; o < n.length; o++)
      d.appendChild(n[o]);
    e.appendChild(c);
  }
  return e;
}
async function qt(e, t, r) {
  return !r && t.filter && !t.filter(e) ? null : Promise.resolve(e).then((i) => va(i, t)).then((i) => xa(e, i, t)).then((i) => Ea(e, i, t)).then((i) => Ma(i, t));
}
const $s = /url\((['"]?)([^'"]+?)\1\)/g, Ra = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g, Oa = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function Ia(e) {
  const t = e.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`, "g");
}
function Aa(e) {
  const t = [];
  return e.replace($s, (r, i, n) => (t.push(n), r)), t.filter((r) => !mn(r));
}
async function La(e, t, r, i, n) {
  try {
    const s = r ? Qo(t, r) : t, c = wn(t);
    let d;
    return n || (d = await xn(s, c, i)), e.replace(Ia(t), `$1${d}$3`);
  } catch {
  }
  return e;
}
function Pa(e, { preferredFontFormat: t }) {
  return t ? e.replace(Oa, (r) => {
    for (; ; ) {
      const [i, , n] = Ra.exec(r) || [];
      if (!n)
        return "";
      if (n === t)
        return `src: ${i};`;
    }
  }) : e;
}
function Ds(e) {
  return e.search($s) !== -1;
}
async function zs(e, t, r) {
  if (!Ds(e))
    return e;
  const i = Pa(e, r);
  return Aa(i).reduce((s, c) => s.then((d) => La(d, c, t, r)), Promise.resolve(i));
}
async function Ye(e, t, r) {
  var i;
  const n = (i = t.style) === null || i === void 0 ? void 0 : i.getPropertyValue(e);
  if (n) {
    const s = await zs(n, null, r);
    return t.style.setProperty(e, s, t.style.getPropertyPriority(e)), !0;
  }
  return !1;
}
async function Ta(e, t) {
  await Ye("background", e, t) || await Ye("background-image", e, t), await Ye("mask", e, t) || await Ye("-webkit-mask", e, t) || await Ye("mask-image", e, t) || await Ye("-webkit-mask-image", e, t);
}
async function Na(e, t) {
  const r = ge(e, HTMLImageElement);
  if (!(r && !mn(e.src)) && !(ge(e, SVGImageElement) && !mn(e.href.baseVal)))
    return;
  const i = r ? e.src : e.href.baseVal, n = await xn(i, wn(i), t);
  await new Promise((s, c) => {
    e.onload = s, e.onerror = t.onImageErrorHandler ? (...o) => {
      try {
        s(t.onImageErrorHandler(...o));
      } catch (p) {
        c(p);
      }
    } : c;
    const d = e;
    d.decode && (d.decode = s), d.loading === "lazy" && (d.loading = "eager"), r ? (e.srcset = "", e.src = n) : e.href.baseVal = n;
  });
}
async function _a(e, t) {
  const i = Ne(e.childNodes).map((n) => Fs(n, t));
  await Promise.all(i).then(() => e);
}
async function Fs(e, t) {
  ge(e, Element) && (await Ta(e, t), await Na(e, t), await _a(e, t));
}
function $a(e, t) {
  const { style: r } = e;
  t.backgroundColor && (r.backgroundColor = t.backgroundColor), t.width && (r.width = `${t.width}px`), t.height && (r.height = `${t.height}px`);
  const i = t.style;
  return i != null && Object.keys(i).forEach((n) => {
    r[n] = i[n];
  }), e;
}
const Yn = {};
async function Xn(e) {
  let t = Yn[e];
  if (t != null)
    return t;
  const i = await (await fetch(e)).text();
  return t = { url: e, cssText: i }, Yn[e] = t, t;
}
async function Jn(e, t) {
  let r = e.cssText;
  const i = /url\(["']?([^"')]+)["']?\)/g, s = (r.match(/url\([^)]+\)/g) || []).map(async (c) => {
    let d = c.replace(i, "$1");
    return d.startsWith("https://") || (d = new URL(d, e.url).href), Ns(d, t.fetchRequestInit, ({ result: o }) => (r = r.replace(c, `url(${o})`), [c, o]));
  });
  return Promise.all(s).then(() => r);
}
function Kn(e) {
  if (e == null)
    return [];
  const t = [], r = /(\/\*[\s\S]*?\*\/)/gi;
  let i = e.replace(r, "");
  const n = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
  for (; ; ) {
    const o = n.exec(i);
    if (o === null)
      break;
    t.push(o[0]);
  }
  i = i.replace(n, "");
  const s = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi, c = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})", d = new RegExp(c, "gi");
  for (; ; ) {
    let o = s.exec(i);
    if (o === null) {
      if (o = d.exec(i), o === null)
        break;
      s.lastIndex = d.lastIndex;
    } else
      d.lastIndex = s.lastIndex;
    t.push(o[0]);
  }
  return t;
}
async function Da(e, t) {
  const r = [], i = [];
  return e.forEach((n) => {
    if ("cssRules" in n)
      try {
        Ne(n.cssRules || []).forEach((s, c) => {
          if (s.type === CSSRule.IMPORT_RULE) {
            let d = c + 1;
            const o = s.href, p = Xn(o).then((a) => Jn(a, t)).then((a) => Kn(a).forEach((h) => {
              try {
                n.insertRule(h, h.startsWith("@import") ? d += 1 : n.cssRules.length);
              } catch (u) {
                console.error("Error inserting rule from remote css", {
                  rule: h,
                  error: u
                });
              }
            })).catch((a) => {
              console.error("Error loading remote css", a.toString());
            });
            i.push(p);
          }
        });
      } catch (s) {
        const c = e.find((d) => d.href == null) || document.styleSheets[0];
        n.href != null && i.push(Xn(n.href).then((d) => Jn(d, t)).then((d) => Kn(d).forEach((o) => {
          c.insertRule(o, c.cssRules.length);
        })).catch((d) => {
          console.error("Error loading remote stylesheet", d);
        })), console.error("Error inlining remote css file", s);
      }
  }), Promise.all(i).then(() => (e.forEach((n) => {
    if ("cssRules" in n)
      try {
        Ne(n.cssRules || []).forEach((s) => {
          r.push(s);
        });
      } catch (s) {
        console.error(`Error while reading CSS rules from ${n.href}`, s);
      }
  }), r));
}
function za(e) {
  return e.filter((t) => t.type === CSSRule.FONT_FACE_RULE).filter((t) => Ds(t.style.getPropertyValue("src")));
}
async function Fa(e, t) {
  if (e.ownerDocument == null)
    throw new Error("Provided element is not within a Document");
  const r = Ne(e.ownerDocument.styleSheets), i = await Da(r, t);
  return za(i);
}
function Us(e) {
  return e.trim().replace(/["']/g, "");
}
function Ua(e) {
  const t = /* @__PURE__ */ new Set();
  function r(i) {
    (i.style.fontFamily || getComputedStyle(i).fontFamily).split(",").forEach((s) => {
      t.add(Us(s));
    }), Array.from(i.children).forEach((s) => {
      s instanceof HTMLElement && r(s);
    });
  }
  return r(e), t;
}
async function Ba(e, t) {
  const r = await Fa(e, t), i = Ua(e);
  return (await Promise.all(r.filter((s) => i.has(Us(s.style.fontFamily))).map((s) => {
    const c = s.parentStyleSheet ? s.parentStyleSheet.href : null;
    return zs(s.cssText, c, t);
  }))).join(`
`);
}
async function Wa(e, t) {
  const r = t.fontEmbedCSS != null ? t.fontEmbedCSS : t.skipFonts ? null : await Ba(e, t);
  if (r) {
    const i = document.createElement("style"), n = document.createTextNode(r);
    i.appendChild(n), e.firstChild ? e.insertBefore(i, e.firstChild) : e.appendChild(i);
  }
}
async function qa(e, t = {}) {
  const { width: r, height: i } = Ts(e, t), n = await qt(e, t, !0);
  return await Wa(n, t), await Fs(n, t), $a(n, t), await oa(n, r, i);
}
async function ja(e, t = {}) {
  const { width: r, height: i } = Ts(e, t), n = await qa(e, t), s = await Tt(n), c = document.createElement("canvas"), d = c.getContext("2d"), o = t.pixelRatio || na(), p = t.canvasWidth || r, a = t.canvasHeight || i;
  return c.width = p * o, c.height = a * o, t.skipAutoScale || ia(c), c.style.width = `${p}`, c.style.height = `${a}`, t.backgroundColor && (d.fillStyle = t.backgroundColor, d.fillRect(0, 0, c.width, c.height)), d.drawImage(s, 0, 0, c.width, c.height), c;
}
async function Ha(e, t = {}) {
  return (await ja(e, t)).toDataURL();
}
const Va = {
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
function Ga(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function oe(e, t = {}) {
  const r = Va[e];
  if (!r)
    return console.warn("[Klavity] unknown icon: " + e), "";
  const i = t.size ?? 18, n = t.class ? `icon ${t.class}` : "icon", s = t.label ? 'role="img"' : 'aria-hidden="true"', c = t.label ? `<title>${Ga(t.label)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${n}" width="${i}" height="${i}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.125em" ${s}>${c}${r}</svg>`;
}
const Je = {
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
class Ya {
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
      t.clearRect(0, 0, this.canvas.width, this.canvas.height), t.drawImage(r, 0, 0), this.shapes.forEach((i) => this.drawShape(t, i));
    }, r.src = this.imageDataUrl;
  }
  drawShape(t, r) {
    if (t.strokeStyle = r.color, t.fillStyle = r.color, t.lineWidth = this.computeLineWidth(), t.lineCap = "round", r.type === "pen")
      t.beginPath(), r.points.forEach(
        (i, n) => n === 0 ? t.moveTo(i.x, i.y) : t.lineTo(i.x, i.y)
      ), t.stroke();
    else if (r.type === "rect")
      t.strokeRect(r.x, r.y, r.w, r.h);
    else if (r.type === "arrow") {
      const i = Math.atan2(r.y2 - r.y1, r.x2 - r.x1), n = Math.max(12, this.computeLineWidth() * 4);
      t.beginPath(), t.moveTo(r.x1, r.y1), t.lineTo(r.x2, r.y2), t.lineTo(
        r.x2 - n * Math.cos(i - Math.PI / 6),
        r.y2 - n * Math.sin(i - Math.PI / 6)
      ), t.moveTo(r.x2, r.y2), t.lineTo(
        r.x2 - n * Math.cos(i + Math.PI / 6),
        r.y2 - n * Math.sin(i + Math.PI / 6)
      ), t.stroke();
    } else r.type === "circle" ? (t.beginPath(), t.ellipse(r.x, r.y, Math.abs(r.rx), Math.abs(r.ry), 0, 0, Math.PI * 2), t.stroke()) : r.type === "text" && (t.font = `bold ${this.computeFontSize()}px sans-serif`, t.fillText(r.text, r.x, r.y));
  }
  async save() {
    const t = this.canvas.toDataURL("image/png");
    return t.length > 5 * 1024 * 1024 ? this.canvas.toDataURL("image/jpeg", 0.85) : t;
  }
}
async function Xa(e, t, r) {
  const i = {
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
    return r.backend(i);
  }
  const n = r[t.integration];
  if (!n) throw new Error(`No handler for integration: ${t.integration}`);
  return n(i);
}
const Ja = 50, Ka = 2e3, Za = 1e3, Qa = 500, Zn = /^(?:token|access_token|refresh_token|api[_-]?key|apikey|key|secret|password|passwd|pwd|auth|authorization|session|sid|jwt|code|otp)$/i;
function bt(e, t) {
  e.push(t), e.length > Ja && e.shift();
}
function kn(e, t) {
  return e.length <= t ? e : e.slice(0, t) + "…[truncated]";
}
function sr(e) {
  let t = String(e || "");
  try {
    const r = new URL(t, typeof location < "u" ? location.href : "http://localhost");
    let i = !1;
    r.searchParams.forEach((n, s) => {
      Zn.test(s) && (r.searchParams.set(s, "REDACTED"), i = !0);
    }), i && (t = r.toString());
  } catch {
    t = t.replace(/([?&])([^=&]+)=([^&]*)/g, (r, i, n, s) => Zn.test(n) ? `${i}${n}=REDACTED` : r);
  }
  return kn(t, Za);
}
function el(e) {
  if (typeof e == "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return kn(JSON.stringify(e), Qa);
  } catch {
    return String(e);
  }
}
function tl(e, t = {}) {
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
function rl(e, t = {}) {
  if (typeof window > "u") return e;
  const r = window;
  if (r.__klavityCaptureInstalled) return e;
  r.__klavityCaptureInstalled = !0;
  const i = () => t.isContextValid ? t.isContextValid() : !0, n = (o, p, a) => {
    bt(e.consoleErrors, { message: kn(p, Ka), stack: a, timestamp: Date.now(), level: o });
  }, s = window.onerror;
  if (window.onerror = (o, p, a, h, u) => {
    var l;
    if (i()) {
      const m = String(o);
      n("error", m, u == null ? void 0 : u.stack), (l = t.onError) == null || l.call(t, m, u == null ? void 0 : u.stack);
    }
    return typeof s == "function" ? s.call(window, o, p, a, h, u) : !1;
  }, window.addEventListener("unhandledrejection", (o) => {
    var h;
    if (!i()) return;
    const p = o.reason, a = String((p == null ? void 0 : p.message) ?? p);
    n("error", a, p == null ? void 0 : p.stack), (h = t.onError) == null || h.call(t, a, p == null ? void 0 : p.stack);
  }), t.consoleLevels) {
    const o = ["log", "info", "warn", "error"];
    for (const p of o) {
      const a = console[p];
      typeof a == "function" && (console[p] = (...h) => {
        try {
          i() && n(p, h.map(el).join(" "));
        } catch {
        }
        return a.apply(console, h);
      });
    }
  }
  const c = window.fetch;
  window.fetch = async (...o) => {
    var u;
    if (!i()) return c(...o);
    const p = Date.now(), a = typeof o[0] == "string" ? o[0] : o[0] instanceof URL ? o[0].href : o[0].url, h = (typeof o[0] == "object" && o[0] && "method" in o[0] ? o[0].method : (u = o[1]) == null ? void 0 : u.method) || "GET";
    try {
      const l = await c(...o);
      return bt(e.networkFailures, { url: sr(a), status: l.status, method: String(h).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), l;
    } catch (l) {
      throw bt(e.networkFailures, { url: sr(a), status: 0, method: String(h).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), l;
    }
  };
  const d = window.XMLHttpRequest;
  if (d && d.prototype) {
    const o = d.prototype.open, p = d.prototype.send;
    d.prototype.open = function(a, h, ...u) {
      return this.__klav = { method: String(a || "GET").toUpperCase(), url: String(h || "") }, o.call(this, a, h, ...u);
    }, d.prototype.send = function(...a) {
      const h = this.__klav;
      if (h && i()) {
        const u = Date.now();
        this.addEventListener("loadend", () => {
          try {
            bt(e.networkFailures, {
              url: sr(h.url),
              status: Number(this.status) || 0,
              method: h.method,
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
const nl = ["light", "dark", "glass", "neon", "custom", "liquid"], il = /^#[0-9a-fA-F]{3,8}$/, sl = /^[\w \-,'"().]+$/, ol = (e) => typeof e == "object" && e !== null, or = (e) => typeof e == "string" && il.test(e.trim()) ? e.trim() : void 0, al = (e, t) => typeof e == "string" && e.trim() ? e.trim().slice(0, t) : void 0, ll = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().slice(0, 120);
  return t && sl.test(t) ? t : void 0;
}, Qn = {
  // Default = the marketing home surface: warm cream paper with Klavity-purple and amber atmosphere.
  // The panel is intentionally not stark white; chips/inputs are only a step lighter for affordance.
  light: { "--kl-overlay": "rgba(28,22,40,.30)", "--kl-bg": "#f5f3ee", "--kl-fg": "#19140f", "--kl-muted": "#574f45", "--kl-border": "rgba(25,20,15,.12)", "--kl-chip": "#fffdf8", "--kl-input-bg": "#fffdf8", "--kl-accent": "#6366f1", "--kl-on-accent": "#fff", "--kl-accent2": "#d98324", "--kl-radius": "16px", "--kl-shadow": "0 24px 60px rgba(40,28,70,.18), 0 10px 30px rgba(99,102,241,.10)", "--kl-backdrop": "none" },
  dark: { "--kl-overlay": "rgba(0,0,0,.5)", "--kl-bg": "#1e1e2e", "--kl-fg": "#cdd6f4", "--kl-muted": "#a6adc8", "--kl-border": "#45475a", "--kl-chip": "#313244", "--kl-input-bg": "#181825", "--kl-accent": "#89b4fa", "--kl-on-accent": "#1e1e2e", "--kl-accent2": "#fab387", "--kl-radius": "12px", "--kl-shadow": "0 20px 60px rgba(0,0,0,.5)", "--kl-backdrop": "none" },
  glass: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.14)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.28)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.10)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)", "--kl-backdrop": "blur(22px) saturate(180%)" },
  neon: { "--kl-overlay": "rgba(8,4,20,.55)", "--kl-bg": "#0e0b1e", "--kl-fg": "#f4f0ff", "--kl-muted": "#a99fd6", "--kl-border": "#3a2d6b", "--kl-chip": "#1c1640", "--kl-input-bg": "#140f2c", "--kl-accent": "#ff2d95", "--kl-on-accent": "#fff", "--kl-accent2": "#15e0ff", "--kl-radius": "14px", "--kl-shadow": "0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)", "--kl-backdrop": "none" },
  // 'liquid' on a real page can't do clone-refraction; render as frosted glass.
  liquid: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.10)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.4)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.08)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)", "--kl-backdrop": "blur(14px) saturate(170%)" }
};
function ei(e) {
  let t = e.replace("#", "");
  t.length === 3 && (t = t.split("").map((c) => c + c).join(""));
  const r = parseInt(t.slice(0, 6), 16), i = r >> 16 & 255, n = r >> 8 & 255, s = r & 255;
  return 0.299 * i + 0.587 * n + 0.114 * s;
}
function Bs(e) {
  const t = ol(e) ? e : {}, i = { theme: typeof t.theme == "string" && nl.includes(t.theme) ? t.theme : "light" }, n = or(t.primary), s = or(t.secondary), c = or(t.background), d = al(t.thankYou, 140), o = ll(t.font);
  return n && (i.primary = n), s && (i.secondary = s), c && (i.background = c), o && (i.font = o), d && (i.thankYou = d), i;
}
function cl(e) {
  const t = Bs(e), r = t.theme === "custom" ? { ...Qn.light } : { ...Qn[t.theme] };
  if (t.theme === "custom" && (t.primary && (r["--kl-accent"] = t.primary), t.secondary && (r["--kl-accent2"] = t.secondary), t.background)) {
    r["--kl-bg"] = t.background;
    const s = ei(t.background) < 140;
    r["--kl-fg"] = s ? "#f4f4f7" : "#1d1d24", r["--kl-muted"] = s ? "rgba(255,255,255,.6)" : "#706560", r["--kl-border"] = s ? "rgba(255,255,255,.16)" : "#e6e6ec", r["--kl-chip"] = s ? "rgba(255,255,255,.08)" : "#f4f4f7", r["--kl-input-bg"] = s ? "rgba(255,255,255,.05)" : "#fafafb";
  }
  t.font && (r["--kl-font"] = t.font);
  const i = t.theme === "dark" || t.theme === "neon" || t.theme === "glass" || t.theme === "liquid" || t.theme === "custom" && !!t.background && ei(t.background) < 140;
  return r["--kl-img-outline"] = i ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)", r["--kl-glow"] = i ? "radial-gradient(120% 80% at 50% -12%, rgba(139,92,246,.20), transparent 60%), radial-gradient(95% 75% at 108% 112%, rgba(255,170,90,.08), transparent 58%)" : "radial-gradient(120% 80% at 50% -10%, rgba(139,139,245,.10), transparent 60%), radial-gradient(80% 60% at 100% 110%, rgba(232,162,74,.06), transparent 60%)", `:host{${Object.entries(r).map(([s, c]) => `${s}:${c};`).join("")}}`;
}
function ul(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hl(e, t, r = {}) {
  var ue;
  const i = Bs(r), n = document.createElement("div");
  n.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const s = n.attachShadow({ mode: "open" });
  document.body.appendChild(n);
  let c = [], d = [];
  const o = 5, p = 10 * 1024 * 1024, a = {};
  let h = e;
  const u = document.createElement("style");
  u.textContent = `
    ${cl(i)}
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
    /* ── Sharp (i) info: the info affordance lives ON the Sharp button (right side), NOT a separate button.
       Hover/focus/tap reveals the explainer; the (i) stopPropagations so it NEVER triggers the one-click
       capture. Generous full-height hit zone (~34×40) at the right edge so the rest of the button stays a
       one-tap Sharp. Shadow-as-border popover, theme-aware; press scale(0.96), accent hover, focus ring. ── */
    #klavity-sharp{position:relative;flex:1.4;padding-left:30px;padding-right:30px;}
    .klavity-info-wrap{position:absolute;top:0;right:0;bottom:0;width:34px;display:inline-flex;align-items:center;justify-content:center;}
    .klavity-info{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--kl-muted);cursor:help;transition:color .15s ease,background .15s ease;}
    .klavity-info-wrap:hover .klavity-info{color:var(--kl-accent);background:color-mix(in srgb,var(--kl-accent) 16%,transparent);}
    .klavity-info-pop{position:absolute;bottom:calc(100% + 10px);right:0;width:228px;padding:10px 12px;border-radius:10px;background:var(--kl-bg);color:var(--kl-fg);box-shadow:0 0 0 1px var(--kl-border),0 12px 30px rgba(20,16,40,.22);font-size:12px;line-height:1.45;text-align:left;text-wrap:pretty;opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .15s ease,transform .15s ease;z-index:6;pointer-events:none;}
    .klavity-info-pop b{color:var(--kl-fg);font-weight:600;}
    /* Show the explainer on hover (mouse) OR when the Sharp button itself is keyboard-focused — one control. */
    .klavity-info-wrap:hover .klavity-info-pop,#klavity-sharp:focus-visible .klavity-info-pop{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto;}
    @media (max-width:430px){.klavity-lead{flex-direction:column}.klavity-lead button{width:100%;}}
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing,.klavity-modal>*{animation-duration:.01ms!important;}.klavity-modal{--kl-lift:none;--kl-press:none;--kl-bhover:none;--kl-bpress:none;}.klavity-info-pop{transform:none;}.klavity-info{transition:none;}.klavity-actions button.kl-loading{animation:none;}.klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{transition:none;transform:none!important;}}
  `, s.appendChild(u);
  const l = document.createElement("div");
  l.className = "klavity-overlay";
  const m = document.createElement("div");
  m.className = "klavity-modal", m.innerHTML = `
    <button class="klavity-x" id="klavity-x" type="button" aria-label="Close" title="Close (Esc)">${oe("x", { size: 16 })}</button>
    <div class="klavity-toggle">
      <button class="bug ${e === "bug" ? "active" : ""}"><span class="kl-cap-ic">${oe("bug")}</span>Bug</button>
      <button class="feat ${e === "feature" ? "active" : ""}"><span class="kl-cap-ic">${oe("lightbulb")}</span>Feature</button>
    </div>
    <div class="klavity-page">${oe("map-pin")} ${typeof window < "u" ? ul(window.location.pathname) : ""}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      ${t.onCaptureSharp ? `<button id="klavity-sharp" title="Screen — pixel-perfect full page, every image. Shares this tab (asks permission)."><span class="kl-cap-ic">${oe("monitor")}</span><span class="kl-sharp-label">Screen</span><span class="klavity-info-wrap"><span id="klavity-sharp-info" class="klavity-info" role="button" tabindex="0" title="What does Screen do?" aria-label="What does Screen do?"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;pointer-events:none"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span class="klavity-info-pop" role="tooltip">Screen grabs the <b>whole page — every image, pixel-perfect</b> using your browser's screen-share. Your browser will ask you to <b>share this tab</b>.</span></span></button>` : ""}
      <button id="klavity-full" title="Full Page — instant capture; may miss some cross-origin images"><span class="kl-cap-ic">${oe("camera")}</span>Full Page</button>
      <button id="klavity-upload"><span class="kl-cap-ic">${oe("image")}</span>Upload</button>
      ${t.onRegionCapture ? `<button id="klavity-region"><span class="kl-cap-ic">${oe("scissors")}</span>Region</button>` : ""}
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
    ${t.requireEmail ? '<input type="email" class="klavity-remail" id="klavity-remail" placeholder="your@email.com" autocomplete="email">' : ""}
    <button class="klavity-submit" id="klavity-submit" disabled>Submit</button>
    <div class="klavity-progress" id="klavity-progress" role="progressbar" aria-label="Uploading report"><div class="klavity-progress-fill" id="klavity-progress-fill"></div></div>
  `, l.appendChild(m), s.appendChild(l);
  const f = {
    shadowRoot: s,
    addScreenshot: v,
    close: y
  };
  function g() {
    const _ = s.getElementById("klavity-strip"), N = s.getElementById("klavity-counter");
    _.innerHTML = "", c.forEach((z, T) => {
      const q = document.createElement("div");
      q.className = "klavity-thumb";
      const L = document.createElement("img");
      L.src = z, L.title = "Click to mark up", L.addEventListener("load", () => {
        L.naturalHeight > L.naturalWidth * 1.4 && q.classList.add("kl-tall");
      }, { once: !0 }), L.addEventListener("click", () => R(T));
      const $ = document.createElement("button");
      $.className = "klavity-rm", $.innerHTML = oe("x", { size: 13 }), $.title = "Remove", $.addEventListener("click", (F) => {
        F.stopPropagation(), c.splice(T, 1), d.splice(T, 1), g();
      });
      const P = document.createElement("button");
      P.className = "klavity-mk", P.innerHTML = oe("pencil", { size: 13 }), P.title = "Mark up", P.addEventListener("click", (F) => {
        F.stopPropagation(), R(T);
      }), q.append(L, $, P), _.appendChild(q);
    }), N.textContent = `${c.length}/5 images`;
  }
  function x(_) {
    const N = s.getElementById("klavity-err");
    N && (N.textContent = _, N.style.display = "block");
  }
  function b() {
    const _ = s.getElementById("klavity-err");
    _ && (_.style.display = "none");
  }
  function v(_) {
    if (c.length >= o) {
      x(`You can attach up to ${o} images.`);
      return;
    }
    b(), c.push(_), d.push(t.compressImage ? t.compressImage(_) : Promise.resolve(_)), g();
  }
  function S(_) {
    return _.type.startsWith("image/") || /\.(heic|heif|png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(_.name);
  }
  async function w(_) {
    b();
    for (const N of _) {
      if (c.length >= o) {
        x(`You can attach up to ${o} images.`);
        break;
      }
      if (!S(N)) {
        x(`"${N.name}" isn't an image — only image files can be attached.`);
        continue;
      }
      if (N.size > p) {
        x(`"${N.name}" is too large — images must be under ${Math.round(p / 1024 / 1024)} MB.`);
        continue;
      }
      try {
        v(await pl(N));
      } catch {
        x(`Couldn't add "${N.name}". Please try a different image.`);
      }
    }
  }
  function y() {
    document.removeEventListener("keydown", k, { capture: !0 }), document.removeEventListener("paste", E);
    const _ = s.querySelector(".klavity-modal");
    if (!_) {
      n.remove();
      return;
    }
    _.classList.add("kl-closing");
    const N = () => n.remove();
    _.addEventListener("animationend", N, { once: !0 }), setTimeout(N, 700);
  }
  function k(_) {
    _.key === "Escape" && (_.stopPropagation(), y());
  }
  document.addEventListener("keydown", k, { capture: !0 });
  const E = (_) => {
    if (!_.clipboardData) return;
    const N = Array.from(_.clipboardData.items).filter((z) => z.type.startsWith("image/")).map((z) => z.getAsFile()).filter((z) => !!z);
    N.length && w(N);
  };
  document.addEventListener("paste", E);
  const O = m.querySelector(".bug"), M = m.querySelector(".feat");
  O.addEventListener("click", () => {
    h = "bug", O.classList.add("active"), M.classList.remove("active");
  }), M.addEventListener("click", () => {
    h = "feature", M.classList.add("active"), O.classList.remove("active");
  });
  const D = m.querySelector("#klavity-desc"), A = m.querySelector("#klavity-submit"), C = m.querySelector("#klavity-remail"), ye = () => !t.requireEmail || !!C && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(C.value.trim()), ae = () => {
    A.disabled = D.value.trim() === "" || !ye();
  };
  D.addEventListener("input", ae), C == null || C.addEventListener("input", ae), l.addEventListener("click", (_) => {
    _.target === l && y();
  }), (ue = m.querySelector("#klavity-x")) == null || ue.addEventListener("click", () => y());
  const X = () => Array.from(m.querySelectorAll(".klavity-actions button"));
  let W = !1;
  const J = (_) => {
    W = _, X().forEach((N) => {
      N.disabled = _;
    }), _ ? A.disabled = !0 : ae();
  };
  A.addEventListener("click", async () => {
    if (W || A.disabled) return;
    const _ = D.value.trim();
    J(!0), A.textContent = "Uploading…";
    const N = s.getElementById("klavity-err");
    N.style.display = "none";
    const z = s.getElementById("klavity-progress"), T = s.getElementById("klavity-progress-fill");
    z && T && (z.classList.add("show"), T.style.transition = "none", T.style.width = "8%", T.offsetWidth, T.style.transition = "width 10s cubic-bezier(.05,.7,.2,1)", requestAnimationFrame(() => {
      T.style.width = "90%";
    }));
    const q = () => {
      T && (T.style.transition = "width .25s ease", T.style.width = "100%");
    }, L = () => {
      z && T && (z.classList.remove("show"), T.style.transition = "none", T.style.width = "0");
    };
    try {
      const $ = await Promise.all(d), P = await t.onSubmit({ type: h, description: _, screenshots: $, annotations: a[0] ?? null, reporterEmail: (C == null ? void 0 : C.value.trim()) || void 0 });
      if (q(), t.success)
        xe(P.issueKey, t.success);
      else {
        const F = document.createElement("div");
        F.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;";
        const K = document.createElement("div");
        K.style.cssText = "background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);", i.thankYou ? K.textContent = i.thankYou : (K.innerHTML = `${oe("check-circle", { label: "Filed", size: 20 })} Filed as `, K.appendChild(document.createTextNode(P.issueKey))), F.appendChild(K), l.remove(), s.appendChild(F), setTimeout(y, i.thankYou ? 2600 : 1500);
      }
    } catch ($) {
      L(), N.textContent = $.message, N.style.display = "block", A.textContent = "Submit", J(!1);
    }
  });
  const ie = m.querySelector("#klavity-full");
  ie.addEventListener("click", async () => {
    if (!W) {
      J(!0), ie.classList.add("kl-loading");
      try {
        v(await t.onCaptureFull());
      } catch {
      } finally {
        ie.classList.remove("kl-loading"), J(!1);
      }
    }
  });
  const Q = m.querySelector("#klavity-sharp");
  if (Q && t.onCaptureSharp) {
    const _ = Q.querySelector(".kl-sharp-label"), N = async () => {
      if (W) return;
      J(!0), n.style.display = "none";
      const T = _ ?? Q, q = T.textContent;
      T.textContent = "Capturing…";
      try {
        const L = await t.onCaptureSharp();
        L && v(L);
      } catch {
      } finally {
        n.style.display = "", T.textContent = q, J(!1);
      }
    };
    Q.addEventListener("click", () => {
      N();
    });
    const z = Q.querySelector("#klavity-sharp-info");
    z && z.addEventListener("click", (T) => T.stopPropagation());
  }
  const Y = m.querySelector("#klavity-file");
  m.querySelector("#klavity-upload").addEventListener("click", () => {
    if (W || c.length >= o) {
      c.length >= o && x(`You can attach up to ${o} images.`);
      return;
    }
    Y.click();
  }), Y.addEventListener("change", async (_) => {
    const N = _.target, z = N.files ? Array.from(N.files) : [];
    N.value = "", z.length && await w(z);
  });
  const Se = s.getElementById("klavity-region");
  Se && t.onRegionCapture && (Se.onclick = () => {
    W || (J(!0), document.removeEventListener("keydown", k, { capture: !0 }), n.style.display = "none", dl(async (_) => {
      document.addEventListener("keydown", k, { capture: !0 });
      try {
        const N = await t.onRegionCapture(_);
        N && v(N);
      } finally {
        n.style.display = "", J(!1);
      }
    }, () => {
      document.addEventListener("keydown", k, { capture: !0 }), n.style.display = "", J(!1);
    }));
  });
  function R(_) {
    const N = c[_], z = new Image();
    z.onload = () => {
      const T = document.createElement("canvas");
      T.width = z.naturalWidth, T.height = z.naturalHeight;
      const q = new Ya(T, N);
      q.redraw();
      const L = document.createElement("div");
      L.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;pointer-events:all;";
      const $ = document.createElement("div");
      $.className = "kl-edtb", $.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;background:#1e1e2e;flex-wrap:wrap;", $.innerHTML = `
        <button data-tool="pen" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${oe("pencil", { size: 14 })} Pen</button>
        <button data-tool="rect" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${oe("square", { size: 14 })} Rect</button>
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
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${oe("trash-2", { size: 14 })} Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">${oe("check", { label: "Save", size: 14 })} Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${oe("x", { size: 14 })}</button>
      `, T.style.cssText = "cursor:crosshair;display:block;margin:12px auto;touch-action:none;background:#fff;border-radius:4px;outline:1px solid rgba(255,255,255,.12);outline-offset:-1px;box-shadow:0 12px 44px rgba(0,0,0,.55);";
      const P = document.createElement("div");
      P.style.cssText = "flex:1;min-height:0;overflow:auto;display:block;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);", P.appendChild(T);
      const F = document.createElement("style");
      F.textContent = ".kl-edtb button{transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease;will-change:transform;}.kl-edtb button:hover{transform:translateY(-1px) scale(1.02);background:#45475a;}.kl-edtb button[data-color]:hover{transform:scale(1.14);background:initial;}.kl-edtb button:active{transform:scale(.96);}.kl-edtb button:focus-visible{outline:2px solid #89b4fa;outline-offset:2px;}.kl-edtb .kl-zb{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 9px;background:#313244;color:#cdd6f4;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;line-height:1;}.kl-edtb .kl-zb:hover{background:#45475a;}@media (prefers-reduced-motion:reduce){.kl-edtb button{transition:none;}.kl-edtb button:hover,.kl-edtb button:active,.kl-edtb button[data-color]:hover{transform:none;}}", L.append(F, $, P), s.appendChild(L);
      let K = 1;
      const V = (U) => Math.max(0.05, Math.min(5, U || 1));
      function pe(U) {
        K = V(U), T.style.width = Math.round(T.width * K) + "px", T.style.height = Math.round(T.height * K) + "px";
        const Z = $.querySelector("#klavity-zoom-pct");
        Z && (Z.textContent = Math.round(K * 100) + "%");
      }
      const Ve = () => Math.max(1, P.clientWidth - 24) / T.width, Wn = () => Math.min(Math.max(1, P.clientWidth - 24) / T.width, Math.max(1, P.clientHeight - 24) / T.height), Xo = T.height / T.width > Math.max(1, P.clientHeight) / Math.max(1, P.clientWidth);
      pe(Xo ? Ve() : Wn()), $.querySelector("#klavity-zoom-in").addEventListener("click", () => pe(K * 1.25)), $.querySelector("#klavity-zoom-out").addEventListener("click", () => pe(K / 1.25)), $.querySelector("#klavity-fit-width").addEventListener("click", () => pe(Ve())), $.querySelector("#klavity-fit-page").addEventListener("click", () => pe(Wn()));
      let Oe = "rect", Pe = "#ef4444", st = !1, gt = [], De = 0, ze = 0;
      function tr(U) {
        Oe = U, $.querySelectorAll("[data-tool]").forEach((Z) => {
          const le = Z.dataset.tool === U;
          Z.style.background = le ? "#585b70" : "#313244", Z.style.outline = le ? "2px solid #89b4fa" : "none";
        });
      }
      $.querySelectorAll("[data-tool]").forEach((U) => U.addEventListener("click", () => tr(U.dataset.tool))), $.querySelectorAll("[data-color]").forEach((U) => U.addEventListener("click", () => {
        Pe = U.dataset.color;
      })), $.querySelector("#klavity-undo").addEventListener("click", () => q.undo()), $.querySelector("#klavity-clear-ann").addEventListener("click", () => q.clearAll());
      const qn = { p: "pen", r: "rect", c: "circle", a: "arrow", t: "text" };
      function jn(U) {
        const Z = U.target;
        if (Z && (Z.tagName === "INPUT" || Z.tagName === "TEXTAREA" || Z.isContentEditable)) return;
        if (U.key === "Escape") {
          U.stopPropagation(), rr();
          return;
        }
        if ((U.metaKey || U.ctrlKey) && U.key.toLowerCase() === "z") {
          U.preventDefault(), q.undo();
          return;
        }
        if (U.metaKey || U.ctrlKey || U.altKey) return;
        const le = U.key.toLowerCase();
        qn[le] ? (U.preventDefault(), tr(qn[le])) : le === "u" && (U.preventDefault(), q.undo());
      }
      function rr() {
        document.removeEventListener("keydown", jn, { capture: !0 }), L.remove();
      }
      document.addEventListener("keydown", jn, { capture: !0 }), tr(Oe), $.querySelector("#klavity-save-ann").addEventListener("click", async () => {
        q.shapes.length ? (a[_] = { w: T.width, h: T.height, shapes: q.shapes.map((U) => ({ ...U })) }, c[_] = N) : delete a[_], rr(), g();
      }), $.querySelector("#klavity-cancel-ann").addEventListener("click", () => rr());
      function nr(U) {
        const Z = T.getBoundingClientRect();
        return { x: (U.clientX - Z.left) / Z.width * T.width, y: (U.clientY - Z.top) / Z.height * T.height };
      }
      T.addEventListener("pointerdown", (U) => {
        st = !0;
        const Z = nr(U);
        if ({ x: De, y: ze } = Z, Oe === "pen" && (gt = [Z]), Oe === "text") {
          st = !1;
          const le = document.createElement("input");
          le.style.cssText = `position:fixed;left:${U.clientX}px;top:${U.clientY}px;background:transparent;border:1px dashed ${Pe};color:${Pe};font-size:16px;outline:none;z-index:9999999;min-width:80px;`, document.body.appendChild(le), le.focus(), le.addEventListener("blur", () => {
            le.value.trim() && q.addShape({ type: "text", color: Pe, x: De, y: ze, text: le.value.trim() }), le.remove();
          }, { once: !0 }), le.addEventListener("keydown", (Jo) => {
            Jo.key === "Enter" && le.blur();
          });
        }
      }), T.addEventListener("pointermove", (U) => {
        st && Oe === "pen" && gt.push(nr(U));
      }), T.addEventListener("pointerup", (U) => {
        if (!st) return;
        st = !1;
        const Z = nr(U);
        Oe === "pen" && gt.length > 1 ? q.addShape({ type: "pen", color: Pe, points: gt }) : Oe === "rect" ? q.addShape({ type: "rect", color: Pe, x: Math.min(De, Z.x), y: Math.min(ze, Z.y), w: Math.abs(Z.x - De), h: Math.abs(Z.y - ze) }) : Oe === "circle" ? q.addShape({ type: "circle", color: Pe, x: (De + Z.x) / 2, y: (ze + Z.y) / 2, rx: Math.abs(Z.x - De) / 2, ry: Math.abs(Z.y - ze) / 2 }) : Oe === "arrow" && q.addShape({ type: "arrow", color: Pe, x1: De, y1: ze, x2: Z.x, y2: Z.y });
      });
    }, z.src = N;
  }
  function xe(_, N) {
    const { copy: z, onLead: T } = N;
    m.innerHTML = "";
    const q = document.createElement("div");
    q.className = "klavity-success";
    const L = document.createElement("h2");
    if (L.innerHTML = z.headline, q.appendChild(L), z.body) {
      const P = document.createElement("p");
      P.textContent = z.body, q.appendChild(P);
    }
    if (z.showEmail) {
      const P = document.createElement("div");
      P.className = "klavity-lead";
      const F = document.createElement("input");
      F.type = "email", F.placeholder = "you@company.com";
      const K = document.createElement("button");
      K.textContent = z.emailLabel;
      const V = async () => {
        const pe = F.value.trim();
        if (!pe) return;
        K.disabled = !0;
        try {
          T && await T(_, pe);
        } catch {
        }
        const Ve = document.createElement("div");
        Ve.className = "klavity-thanks", Ve.textContent = "Thanks — we'll be in touch.", P.replaceWith(Ve);
      };
      K.addEventListener("click", V), F.addEventListener("keydown", (pe) => {
        pe.key === "Enter" && V();
      }), P.append(F, K), q.appendChild(P);
    }
    if (z.showCta && z.ctaUrl) {
      const P = document.createElement("a");
      P.className = "klavity-cta", P.href = z.ctaUrl, P.target = "_blank", P.rel = "noopener", P.textContent = z.ctaText, q.appendChild(P);
    }
    m.appendChild(q);
    const $ = document.createElement("div");
    $.className = "klavity-pb", $.innerHTML = 'Powered by <a href="https://klavity.quantana.top" target="_blank" rel="noopener">Klavity</a>', m.appendChild($);
  }
  return t.autoCaptureOnOpen && setTimeout(() => {
    t.onCaptureFull().then(v).catch(() => {
    });
  }, 200), f;
}
function dl(e, t) {
  const r = document.createElement("div");
  r.style.cssText = "position:fixed;inset:0;cursor:crosshair;z-index:2147483646;user-select:none;", r.setAttribute("data-klavity-region-overlay", ""), document.body.appendChild(r);
  const i = document.createElement("div");
  i.textContent = "Drag to select an area · Esc to cancel", i.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:system-ui;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:2147483647;", document.body.appendChild(i);
  let n = 0, s = 0, c = !1;
  function d() {
    document.removeEventListener("keydown", o, { capture: !0 }), r.remove(), i.remove();
  }
  function o(p) {
    p.key === "Escape" && (p.stopPropagation(), d(), t());
  }
  document.addEventListener("keydown", o, { capture: !0 }), r.addEventListener("pointerdown", (p) => {
    c = !0, n = p.clientX, s = p.clientY, i.remove();
  }), r.addEventListener("pointermove", (p) => {
    if (!c) return;
    const a = Math.min(p.clientX, n), h = Math.min(p.clientY, s), u = Math.abs(p.clientX - n), l = Math.abs(p.clientY - s);
    r.style.background = `
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) 0 0/${a}px 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a + u}px 0/calc(100% - ${a + u}px) 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px 0/${u}px ${h}px,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px ${h + l}px/${u}px calc(100% - ${h + l}px)
    `, r.style.backgroundRepeat = "no-repeat";
  }), r.addEventListener("pointerup", (p) => {
    if (!c) return;
    c = !1;
    const a = Math.abs(p.clientX - n), h = Math.abs(p.clientY - s);
    if (a < 8 || h < 8) {
      d(), t();
      return;
    }
    const u = { x: Math.min(p.clientX, n), y: Math.min(p.clientY, s), w: a, h };
    d(), e(u);
  });
}
async function pl(e) {
  if (e.type === "image/heic" || e.type === "image/heif" || e.name.endsWith(".heic") || e.name.endsWith(".heif"))
    try {
      const t = (await import("./heic2any-D6xzzX7R.js").then((i) => i.h)).default, r = await t({ blob: e, toType: "image/jpeg", quality: 0.85 });
      return ti(r);
    } catch {
    }
  return ti(e);
}
function ti(e) {
  return new Promise((t, r) => {
    const i = new FileReader();
    i.onload = () => t(i.result), i.onerror = r, i.readAsDataURL(e);
  });
}
const fl = {
  frustrated: { accent: "#e8849a", mark: "vein", label: "Frustrated" },
  confused: { accent: "#e8a24a", mark: "q", label: "Confused" },
  satisfied: { accent: "#7fd1c4", mark: "check", label: "Satisfied" },
  delighted: { accent: "#9fd6a0", mark: "spark", label: "Delighted" },
  neutral: { accent: "#8a8276", mark: "dots", label: "Neutral" },
  inspired: { accent: "#8b8bf5", mark: "bulb", label: "Inspired" },
  alarmed: { accent: "#ef6b6b", mark: "bang", label: "Alarmed" }
};
function ml(e) {
  const t = (e || "").trim().split(/\s+/).filter(Boolean);
  return t.length === 0 ? "?" : t.length === 1 ? t[0].slice(0, 2).toUpperCase() : (t[0][0] + t[t.length - 1][0]).toUpperCase();
}
function gl(e) {
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
const yl = {
  vein: "ksim-m-vein",
  spark: "ksim-m-spark",
  bulb: "ksim-m-bulb",
  bang: "ksim-m-bang",
  q: "ksim-m-q",
  dots: "ksim-m-dots",
  check: "ksim-m-check"
};
function Fe(e) {
  return String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function bl(e) {
  const {
    name: t,
    photoUrl: r,
    color: i = "#6f6cf2",
    emotion: n = "none",
    size: s = 58,
    eyes: c = !0,
    legs: d = !0,
    animate: o = !0,
    className: p = ""
  } = e, a = Fe(e.initials || ml(t)), h = n !== "none" ? fl[n] : null, u = h ? `<span class="ksim-mark ${o ? yl[h.mark] : ""}" style="color:${Fe(h.accent)}">${gl(h.mark)}</span>` : "", m = r ? `<span class="ksim-head ksim-photo"><img src="${Fe(r)}" alt="${Fe(t)}" loading="lazy" onerror="this.style.display='none';this.parentNode.classList.add('ksim-fallback')"><span class="ksim-ini">${a}</span></span>` : `<span class="ksim-head ksim-mono"><span class="ksim-ini">${a}</span>${c ? '<span class="ksim-eyes"><i></i><i></i></span>' : ""}</span>`, f = d ? '<span class="ksim-legs"><i></i><i></i></span>' : "", g = ["ksim", o ? "is-animated" : "", p].filter(Boolean).join(" "), x = `--ksim-persona:${Fe(i)};--ksim-size:${s}px;` + (h ? `--ksim-accent:${Fe(h.accent)};` : "");
  return `<span class="${g}" style="${x}" data-emotion="${n}" title="${Fe(t)}">${u}${m}${f}</span>`;
}
function Ws(e) {
  const t = document.createElement("template");
  return t.innerHTML = bl(e).trim(), t.content.firstElementChild;
}
const vl = `
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
function wl(e = document) {
  var i;
  const t = e.head ?? e ?? null;
  if (!t || (i = t.querySelector) != null && i.call(t, "style[data-ksim]")) return;
  const r = document.createElement("style");
  r.setAttribute("data-ksim", ""), r.textContent = vl, t.appendChild(r);
}
function xl(e) {
  const { context: t, description: r } = e, i = t.consoleErrors.map((o) => `- [${o.level ?? "error"}] \`${o.message}\``).join(`
`) || "_none_", n = t.networkFailures.map((o) => `- ${o.method} ${o.url} → ${o.status}${o.durationMs != null ? ` (${o.durationMs}ms)` : ""}`).join(`
`) || "_none_", s = [
    `*Page:* ${t.pageUrl}`,
    `*Browser:* ${t.userAgent}`,
    `*Screen:* ${t.screenSize}  |  *Viewport:* ${t.viewportSize}`
  ], c = t.identity ? Object.entries(t.identity).filter(([, o]) => o != null) : [], d = t.metadata ? Object.entries(t.metadata) : [];
  return (c.length || d.length) && s.push(`*User / metadata:* ${[...c, ...d].map(([o, p]) => `${o}=${p}`).join(", ")}`), [
    ...s,
    "",
    "----",
    r,
    "",
    "*Console:*",
    i,
    "",
    "*Network:*",
    n
  ].join(`
`);
}
async function kl(e) {
  const { settings: t, type: r, description: i } = e, { baseUrl: n, email: s, token: c, projectKey: d } = t.jira, o = btoa(`${s}:${c}`), p = r === "bug" ? "Bug" : "Story", a = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], h = `[Klavity] ${i.slice(0, 180)}`, u = await fetch(`${n}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${o}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      fields: {
        project: { key: d },
        summary: h,
        description: { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: xl(e) }] }] },
        issuetype: { name: p },
        labels: a
      }
    })
  });
  if (!u.ok) {
    const g = await u.text();
    throw new Error(`Jira API error ${u.status}: ${g}`);
  }
  const m = (await u.json()).key, f = `${n}/browse/${m}`;
  for (const g of e.screenshots) {
    const x = await (await fetch(g)).blob(), b = new FormData();
    b.append("file", x, `klavity-screenshot-${Date.now()}.png`), await fetch(`${n}/rest/api/3/issue/${m}/attachments`, {
      method: "POST",
      headers: { Authorization: `Basic ${o}`, "X-Atlassian-Token": "no-check" },
      body: b
    });
  }
  return { issueKey: m, issueUrl: f };
}
async function Sl(e) {
  var h, u, l;
  const { settings: t, type: r, description: i, context: n } = e, { apiKey: s, teamId: c } = t.linear, d = [
    i,
    "",
    `**Page:** ${n.pageUrl}`,
    `**Browser:** ${n.userAgent}`
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
          title: `[Klavity] ${i.slice(0, 180)}`,
          description: d,
          labelNames: r === "bug" ? ["Bug"] : []
        }
      }
    })
  })).json();
  if ((h = p.errors) != null && h.length)
    throw new Error(`Linear API error: ${p.errors[0].message}`);
  const a = (l = (u = p.data) == null ? void 0 : u.issueCreate) == null ? void 0 : l.issue;
  if (!a) throw new Error("Linear: no issue returned");
  return { issueKey: a.identifier, issueUrl: a.url };
}
async function Cl(e) {
  const { settings: t, type: r, description: i, context: n, screenshots: s } = e, { token: c, repo: d } = t.github, o = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], p = s.length ? `

<details><summary>Screenshots (${s.length})</summary>

${s.map((l, m) => `![screenshot-${m + 1}](${l})`).join(`
`)}

</details>` : "", a = [
    i,
    "",
    `**Page:** ${n.pageUrl}`,
    `**Browser:** ${n.userAgent}`,
    `**Screen:** ${n.screenSize} | **Viewport:** ${n.viewportSize}`,
    p
  ].join(`
`), h = await fetch(`https://api.github.com/repos/${d}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: `[Klavity] ${i.slice(0, 180)}`,
      body: a,
      labels: o
    })
  });
  if (!h.ok)
    throw new Error(`GitHub API error ${h.status}: ${await h.text()}`);
  const u = await h.json();
  return { issueKey: `#${u.number}`, issueUrl: u.html_url };
}
async function El(e) {
  const { settings: t, description: r, context: i } = e, { token: n, workspace: s, projectId: c } = t.plane, d = (t.plane.host || "https://api.plane.so").replace(/\/+$/, ""), o = d === "https://api.plane.so" ? "https://app.plane.so" : d, p = await fetch(
    `${d}/api/v1/workspaces/${s}/projects/${c}/issues/`,
    {
      method: "POST",
      headers: { "X-API-Key": n, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `[Klavity] ${r.slice(0, 180)}`,
        description_html: `<p>${r}</p><p><strong>Page:</strong> ${i.pageUrl}</p>`
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
async function Ml(e) {
  const { settings: t, type: r, description: i, context: n, screenshots: s, projectId: c, replayEvents: d } = e, o = new FormData();
  o.append("type", r), o.append("description", i), o.append("page_url", n.pageUrl), o.append("context", JSON.stringify(n)), c && o.append("project_id", c), d && d.length && o.append("replay_events", JSON.stringify(d));
  const p = t.connectionMode === "klavity" && !!t.klavToken;
  if (!p) {
    const { plane: l } = t;
    o.append("plane_token", l.token), o.append("plane_workspace", l.workspace), o.append("plane_project_id", l.projectId), o.append("plane_host", l.host);
  }
  for (let l = 0; l < s.length; l++) {
    const m = await (await fetch(s[l])).blob();
    o.append("screenshots", m, `screenshot-${l}.png`);
  }
  const a = p ? { Authorization: `Bearer ${t.klavToken}` } : {}, h = await fetch(`${t.backendUrl}/api/feedback`, { method: "POST", headers: a, body: o });
  if (!h.ok) throw new Error(`Klavity backend error ${h.status}: ${await h.text()}`);
  const u = await h.json();
  return {
    issueKey: u.jira_key ?? u.id,
    issueUrl: u.issue_url ?? t.backendUrl
  };
}
var Rl = Object.defineProperty, Ol = (e, t, r) => t in e ? Rl(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, I = (e, t, r) => Ol(e, typeof t != "symbol" ? t + "" : t, r), ri, Il = Object.defineProperty, Al = (e, t, r) => t in e ? Il(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, ni = (e, t, r) => Al(e, typeof t != "symbol" ? t + "" : t, r), se = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(se || {});
const ii = {
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
}, si = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, vt = {}, qs = {}, Ll = () => !!globalThis.Zone;
function Sn(e) {
  if (vt[e])
    return vt[e];
  const t = globalThis[e], r = t.prototype, i = e in ii ? ii[e] : void 0, n = !!(i && // @ts-expect-error 2345
  i.every(
    (d) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, d)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in si ? si[e] : void 0, c = !!(s && s.every(
    // @ts-expect-error 2345
    (d) => {
      var o;
      return typeof r[d] == "function" && ((o = r[d]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (n && c && !Ll())
    return vt[e] = t.prototype, t.prototype;
  try {
    const d = document.createElement("iframe");
    d.style.display = "none", document.body.appendChild(d);
    const o = d.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return d.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (d.classList.add("rr-block"), d.setAttribute("__rrwebUntaintedMutationObserver", ""), qs[e] = () => d.remove()) : d.remove(), vt[e] = p;
  } catch {
    return r;
  }
}
const ar = {};
function Ae(e, t, r) {
  var i;
  const n = `${e}.${String(r)}`;
  if (ar[n])
    return ar[n].call(
      t
    );
  const s = Sn(e), c = (i = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : i.get;
  return c ? (ar[n] = c, c.call(t)) : t[r];
}
const lr = {};
function js(e, t, r) {
  const i = `${e}.${String(r)}`;
  if (lr[i])
    return lr[i].bind(
      t
    );
  const s = Sn(e)[r];
  return typeof s != "function" ? t[r] : (lr[i] = s, s.bind(t));
}
function Pl(e) {
  return Ae("Node", e, "ownerDocument");
}
function Tl(e) {
  return Ae("Node", e, "childNodes");
}
function Nl(e) {
  return Ae("Node", e, "parentNode");
}
function _l(e) {
  return Ae("Node", e, "parentElement");
}
function $l(e) {
  return Ae("Node", e, "textContent");
}
function Dl(e, t) {
  return js("Node", e, "contains")(t);
}
function zl(e) {
  return js("Node", e, "getRootNode")();
}
function Fl(e) {
  return !e || !("host" in e) ? null : Ae("ShadowRoot", e, "host");
}
function Ul(e) {
  return e.styleSheets;
}
function Bl(e) {
  return !e || !("shadowRoot" in e) ? null : Ae("Element", e, "shadowRoot");
}
function Wl(e, t) {
  return Ae("Element", e, "querySelector")(t);
}
function ql(e, t) {
  return Ae("Element", e, "querySelectorAll")(t);
}
function jl() {
  return [
    Sn("MutationObserver").constructor,
    qs.MutationObserver ?? (() => {
    })
  ];
}
let Hs = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (Hs = () => (/* @__PURE__ */ new Date()).getTime());
function Hl(e, t, r) {
  try {
    if (!(t in e))
      return () => {
      };
    const i = e[t], n = r(i);
    return typeof n == "function" && (n.prototype = n.prototype || {}, Object.defineProperties(n, {
      __rrweb_original__: {
        enumerable: !1,
        value: i
      }
    })), e[t] = n, () => {
      e[t] = i;
    };
  } catch {
    return () => {
    };
  }
}
const ce = {
  ownerDocument: Pl,
  childNodes: Tl,
  parentNode: Nl,
  parentElement: _l,
  textContent: $l,
  contains: Dl,
  getRootNode: zl,
  host: Fl,
  styleSheets: Ul,
  shadowRoot: Bl,
  querySelector: Wl,
  querySelectorAll: ql,
  nowTimestamp: Hs,
  mutationObserverCtor: jl,
  patch: Hl
};
function Vs(e) {
  return e.nodeType === e.ELEMENT_NODE;
}
function at(e) {
  const t = (
    // anchor and textarea elements also have a `host` property
    // but only shadow roots have a `mode` property
    e && "host" in e && "mode" in e && ce.host(e) || null
  );
  return !!(t && "shadowRoot" in t && ce.shadowRoot(t) === e);
}
function lt(e) {
  return Object.prototype.toString.call(e) === "[object ShadowRoot]";
}
function Vl(e) {
  return e.includes(" background-clip: text;") && !e.includes(" -webkit-background-clip: text;") && (e = e.replace(
    /\sbackground-clip:\s*text;/g,
    " -webkit-background-clip: text; background-clip: text;"
  )), e;
}
function Gl(e) {
  const { cssText: t } = e;
  if (t.split('"').length < 3) return t;
  const r = ["@import", `url(${JSON.stringify(e.href)})`];
  return e.layerName === "" ? r.push("layer") : e.layerName && r.push(`layer(${e.layerName})`), e.supportsText && r.push(`supports(${e.supportsText})`), e.media.length && r.push(e.media.mediaText), r.join(" ") + ";";
}
function gn(e) {
  try {
    const t = e.rules || e.cssRules;
    if (!t)
      return null;
    let r = e.href;
    !r && e.ownerNode && (r = e.ownerNode.baseURI);
    const i = Array.from(
      t,
      (n) => Gs(n, r)
    ).join("");
    return Vl(i);
  } catch {
    return null;
  }
}
function Gs(e, t) {
  if (Xl(e)) {
    let r;
    try {
      r = // for same-origin stylesheets,
      // we can access the imported stylesheet rules directly
      gn(e.styleSheet) || // work around browser issues with the raw string `@import url(...)` statement
      Gl(e);
    } catch {
      r = e.cssText;
    }
    return e.styleSheet.href ? $t(r, e.styleSheet.href) : r;
  } else {
    let r = e.cssText;
    return Jl(e) && e.selectorText.includes(":") && (r = Yl(r)), t ? $t(r, t) : r;
  }
}
function Yl(e) {
  const t = /(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm;
  return e.replace(t, "$1\\$2");
}
function Xl(e) {
  return "styleSheet" in e;
}
function Jl(e) {
  return "selectorText" in e;
}
class Ys {
  constructor() {
    ni(this, "idNodeMap", /* @__PURE__ */ new Map()), ni(this, "nodeMetaMap", /* @__PURE__ */ new WeakMap());
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
      (i) => this.removeNodeFromMap(i)
    );
  }
  has(t) {
    return this.idNodeMap.has(t);
  }
  hasNode(t) {
    return this.nodeMetaMap.has(t);
  }
  add(t, r) {
    const i = r.id;
    this.idNodeMap.set(i, t), this.nodeMetaMap.set(t, r);
  }
  replace(t, r) {
    const i = this.getNode(t);
    if (i) {
      const n = this.nodeMetaMap.get(i);
      n && this.nodeMetaMap.set(r, n);
    }
    this.idNodeMap.set(t, r);
  }
  reset() {
    this.idNodeMap = /* @__PURE__ */ new Map(), this.nodeMetaMap = /* @__PURE__ */ new WeakMap();
  }
}
function Kl() {
  return new Ys();
}
function Nt({
  element: e,
  maskInputOptions: t,
  tagName: r,
  type: i,
  value: n,
  maskInputFn: s
}) {
  let c = n || "";
  const d = i && We(i);
  return (t[r.toLowerCase()] || d && t[d]) && (s ? c = s(c, e) : c = "*".repeat(c.length)), c;
}
function We(e) {
  return e.toLowerCase();
}
const oi = "__rrweb_original__";
function Zl(e) {
  const t = e.getContext("2d");
  if (!t) return !0;
  const r = 50;
  for (let i = 0; i < e.width; i += r)
    for (let n = 0; n < e.height; n += r) {
      const s = t.getImageData, c = oi in s ? s[oi] : s;
      if (new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        c.call(
          t,
          i,
          n,
          Math.min(r, e.width - i),
          Math.min(r, e.height - n)
        ).data.buffer
      ).some((o) => o !== 0)) return !1;
    }
  return !0;
}
function _t(e) {
  const t = e.type;
  return e.hasAttribute("data-rr-is-password") ? "password" : t ? (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    We(t)
  ) : null;
}
function Xs(e, t) {
  let r;
  try {
    r = new URL(e, t ?? window.location.href);
  } catch {
    return null;
  }
  const i = /\.([0-9a-z]+)(?:$)/i, n = r.pathname.match(i);
  return (n == null ? void 0 : n[1]) ?? null;
}
function Ql(e) {
  let t = "";
  return e.indexOf("//") > -1 ? t = e.split("/").slice(0, 3).join("/") : t = e.split("/")[0], t = t.split("?")[0], t;
}
const ec = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm, tc = /^(?:[a-z+]+:)?\/\//i, rc = /^www\..*/i, nc = /^(data:)([^,]*),(.*)/i;
function $t(e, t) {
  return (e || "").replace(
    ec,
    (r, i, n, s, c, d) => {
      const o = n || c || d, p = i || s || "";
      if (!o)
        return r;
      if (tc.test(o) || rc.test(o))
        return `url(${p}${o}${p})`;
      if (nc.test(o))
        return `url(${p}${o}${p})`;
      if (o[0] === "/")
        return `url(${p}${Ql(t) + o}${p})`;
      const a = t.split("/"), h = o.split("/");
      a.pop();
      for (const u of h)
        u !== "." && (u === ".." ? a.pop() : a.push(u));
      return `url(${p}${a.join("/")}${p})`;
    }
  );
}
function wt(e, t = !1) {
  return t ? e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "") : e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "").replace(/0px/g, "0");
}
function ic(e, t, r = !1) {
  const i = Array.from(t.childNodes), n = [];
  let s = 0;
  if (i.length > 1 && e && typeof e == "string") {
    let c = wt(e, r);
    const d = c.length / e.length;
    for (let o = 1; o < i.length; o++)
      if (i[o].textContent && typeof i[o].textContent == "string") {
        const p = wt(
          i[o].textContent,
          r
        ), a = 100;
        let h = 3;
        for (; h < p.length && // keep consuming css identifiers (to get a decent chunk more quickly)
        (p[h].match(/[a-zA-Z0-9]/) || // substring needs to be unique to this section
        p.indexOf(p.substring(0, h), 1) !== -1); h++)
          ;
        for (; h < p.length; h++) {
          let u = p.substring(0, h), l = c.split(u), m = -1;
          if (l.length === 2)
            m = l[0].length;
          else if (l.length > 2 && l[0] === "" && i[o - 1].textContent !== "")
            m = c.indexOf(u, 1);
          else if (l.length === 1) {
            if (u = u.substring(
              0,
              u.length - 1
            ), l = c.split(u), l.length <= 1)
              return n.push(e), n;
            h = a + 1;
          } else h === p.length - 1 && (m = c.indexOf(u));
          if (l.length >= 2 && h > a) {
            const f = i[o - 1].textContent;
            if (f && typeof f == "string") {
              const g = wt(f).length;
              m = c.indexOf(u, g);
            }
            m === -1 && (m = l[0].length);
          }
          if (m !== -1) {
            let f = Math.floor(m / d);
            for (; f > 0 && f < e.length; ) {
              if (s += 1, s > 50 * i.length)
                return n.push(e), n;
              const g = wt(
                e.substring(0, f),
                r
              );
              if (g.length === m) {
                n.push(e.substring(0, f)), e = e.substring(f), c = c.substring(m);
                break;
              } else g.length < m ? f += Math.max(
                1,
                Math.floor((m - g.length) / d)
              ) : f -= Math.max(
                1,
                Math.floor((g.length - m) * d)
              );
            }
            break;
          }
        }
      }
  }
  return n.push(e), n;
}
function sc(e, t) {
  return ic(e, t).join("/* rr_split */");
}
let oc = 1;
const ac = new RegExp("[^a-z0-9-_:]"), ut = -2;
function Js() {
  return oc++;
}
function lc(e) {
  if (e instanceof HTMLFormElement)
    return "form";
  const t = We(e.tagName);
  return ac.test(t) ? "div" : t;
}
let Xe, ai;
const cc = /^[^ \t\n\r\u000c]+/, uc = /^[, \t\n\r\u000c]+/;
function hc(e, t) {
  if (t.trim() === "")
    return t;
  let r = 0;
  function i(s) {
    let c;
    const d = s.exec(t.substring(r));
    return d ? (c = d[0], r += c.length, c) : "";
  }
  const n = [];
  for (; i(uc), !(r >= t.length); ) {
    let s = i(cc);
    if (s.slice(-1) === ",")
      s = Qe(e, s.substring(0, s.length - 1)), n.push(s);
    else {
      let c = "";
      s = Qe(e, s);
      let d = !1;
      for (; ; ) {
        const o = t.charAt(r);
        if (o === "") {
          n.push((s + c).trim());
          break;
        } else if (d)
          o === ")" && (d = !1);
        else if (o === ",") {
          r += 1, n.push((s + c).trim());
          break;
        } else o === "(" && (d = !0);
        c += o, r += 1;
      }
    }
  }
  return n.join(", ");
}
const li = /* @__PURE__ */ new WeakMap();
function Qe(e, t) {
  return !t || t.trim() === "" ? t : Cn(e, t);
}
function dc(e) {
  return !!(e.tagName === "svg" || e.ownerSVGElement);
}
function Cn(e, t) {
  let r = li.get(e);
  if (r || (r = e.createElement("a"), li.set(e, r)), !t)
    t = "";
  else if (t.startsWith("blob:") || t.startsWith("data:"))
    return t;
  return r.setAttribute("href", t), r.href;
}
function Ks(e, t, r, i) {
  return i && (r === "src" || r === "href" && !(t === "use" && i[0] === "#") || r === "xlink:href" && i[0] !== "#" || r === "background" && ["table", "td", "th"].includes(t) ? Qe(e, i) : r === "srcset" ? hc(e, i) : r === "style" ? $t(i, Cn(e)) : t === "object" && r === "data" ? Qe(e, i) : i);
}
function Zs(e, t, r) {
  return ["video", "audio"].includes(e) && t === "autoplay";
}
function pc(e, t, r) {
  try {
    if (typeof t == "string") {
      if (e.classList.contains(t))
        return !0;
    } else
      for (let i = e.classList.length; i--; ) {
        const n = e.classList[i];
        if (t.test(n))
          return !0;
      }
    if (r)
      return e.matches(r);
  } catch {
  }
  return !1;
}
function Dt(e, t, r) {
  if (!e) return !1;
  if (e.nodeType !== e.ELEMENT_NODE)
    return r ? Dt(ce.parentNode(e), t, r) : !1;
  for (let i = e.classList.length; i--; ) {
    const n = e.classList[i];
    if (t.test(n))
      return !0;
  }
  return r ? Dt(ce.parentNode(e), t, r) : !1;
}
function Qs(e, t, r, i) {
  let n;
  if (Vs(e)) {
    if (n = e, !ce.childNodes(n).length)
      return !1;
  } else {
    if (ce.parentElement(e) === null)
      return !1;
    n = ce.parentElement(e);
  }
  try {
    if (typeof t == "string") {
      if (i) {
        if (n.closest(`.${t}`)) return !0;
      } else if (n.classList.contains(t)) return !0;
    } else if (Dt(n, t, i)) return !0;
    if (r) {
      if (i) {
        if (n.closest(r)) return !0;
      } else if (n.matches(r)) return !0;
    }
  } catch {
  }
  return !1;
}
function fc(e, t, r) {
  const i = e.contentWindow;
  if (!i)
    return;
  let n = !1, s;
  try {
    s = i.document.readyState;
  } catch {
    return;
  }
  if (s !== "complete") {
    const d = setTimeout(() => {
      n || (t(), n = !0);
    }, r);
    e.addEventListener("load", () => {
      clearTimeout(d), n = !0, t();
    });
    return;
  }
  const c = "about:blank";
  if (i.location.href !== c || e.src === c || e.src === "")
    return setTimeout(t, 0), e.addEventListener("load", t);
  e.addEventListener("load", t);
}
function mc(e, t, r) {
  let i = !1, n;
  try {
    n = e.sheet;
  } catch {
    return;
  }
  if (n) return;
  const s = setTimeout(() => {
    i || (t(), i = !0);
  }, r);
  e.addEventListener("load", () => {
    clearTimeout(s), i = !0, t();
  });
}
function gc(e, t) {
  const {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    needsMask: c,
    inlineStylesheet: d,
    maskInputOptions: o = {},
    maskTextFn: p,
    maskInputFn: a,
    dataURLOptions: h = {},
    inlineImages: u,
    recordCanvas: l,
    keepIframeSrcFn: m,
    newlyAddedElement: f = !1,
    cssCaptured: g = !1
  } = t, x = yc(r, i);
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
      return vc(e, {
        doc: r,
        blockClass: n,
        blockSelector: s,
        inlineStylesheet: d,
        maskInputOptions: o,
        maskInputFn: a,
        dataURLOptions: h,
        inlineImages: u,
        recordCanvas: l,
        keepIframeSrcFn: m,
        newlyAddedElement: f,
        rootId: x
      });
    case e.TEXT_NODE:
      return bc(e, {
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
        textContent: ce.textContent(e) || "",
        rootId: x
      };
    default:
      return !1;
  }
}
function yc(e, t) {
  if (!t.hasNode(e)) return;
  const r = t.getId(e);
  return r === 1 ? void 0 : r;
}
function bc(e, t) {
  const { needsMask: r, maskTextFn: i, rootId: n, cssCaptured: s } = t, c = ce.parentNode(e), d = c && c.tagName;
  let o = "";
  const p = d === "STYLE" ? !0 : void 0, a = d === "SCRIPT" ? !0 : void 0;
  return a ? o = "SCRIPT_PLACEHOLDER" : s || (o = ce.textContent(e), p && o && (o = $t(o, Cn(t.doc)))), !p && !a && o && r && (o = i ? i(o, ce.parentElement(e)) : o.replace(/[\S]/g, "*")), {
    type: se.Text,
    textContent: o || "",
    rootId: n
  };
}
function vc(e, t) {
  const {
    doc: r,
    blockClass: i,
    blockSelector: n,
    inlineStylesheet: s,
    maskInputOptions: c = {},
    maskInputFn: d,
    dataURLOptions: o = {},
    inlineImages: p,
    recordCanvas: a,
    keepIframeSrcFn: h,
    newlyAddedElement: u = !1,
    rootId: l
  } = t, m = pc(e, i, n), f = lc(e);
  let g = {};
  const x = e.attributes.length;
  for (let v = 0; v < x; v++) {
    const S = e.attributes[v];
    Zs(f, S.name, S.value) || (g[S.name] = Ks(
      r,
      f,
      We(S.name),
      S.value
    ));
  }
  if (f === "link" && s) {
    const v = Array.from(r.styleSheets).find((w) => w.href === e.href);
    let S = null;
    v && (S = gn(v)), S && (delete g.rel, delete g.href, g._cssText = S);
  }
  if (f === "style" && e.sheet) {
    let v = gn(
      e.sheet
    );
    v && (e.childNodes.length > 1 && (v = sc(v, e)), g._cssText = v);
  }
  if (["input", "textarea", "select"].includes(f)) {
    const v = e.value, S = e.checked;
    g.type !== "radio" && g.type !== "checkbox" && g.type !== "submit" && g.type !== "button" && v ? g.value = Nt({
      element: e,
      type: _t(e),
      tagName: f,
      value: v,
      maskInputOptions: c,
      maskInputFn: d
    }) : S && (g.checked = S);
  }
  if (f === "option" && (e.selected && !c.select ? g.selected = !0 : delete g.selected), f === "dialog" && e.open && (g.rr_open_mode = e.matches("dialog:modal") ? "modal" : "non-modal"), f === "canvas" && a) {
    if (e.__context === "2d")
      Zl(e) || (g.rr_dataURL = e.toDataURL(
        o.type,
        o.quality
      ));
    else if (!("__context" in e)) {
      const v = e.toDataURL(
        o.type,
        o.quality
      ), S = r.createElement("canvas");
      S.width = e.width, S.height = e.height;
      const w = S.toDataURL(
        o.type,
        o.quality
      );
      v !== w && (g.rr_dataURL = v);
    }
  }
  if (f === "img" && p) {
    Xe || (Xe = r.createElement("canvas"), ai = Xe.getContext("2d"));
    const v = e, S = v.currentSrc || v.getAttribute("src") || "<unknown-src>", w = v.crossOrigin, y = () => {
      v.removeEventListener("load", y);
      try {
        Xe.width = v.naturalWidth, Xe.height = v.naturalHeight, ai.drawImage(v, 0, 0), g.rr_dataURL = Xe.toDataURL(
          o.type,
          o.quality
        );
      } catch (k) {
        if (v.crossOrigin !== "anonymous") {
          v.crossOrigin = "anonymous", v.complete && v.naturalWidth !== 0 ? y() : v.addEventListener("load", y);
          return;
        } else
          console.warn(
            `Cannot inline img src=${S}! Error: ${k}`
          );
      }
      v.crossOrigin === "anonymous" && (w ? g.crossOrigin = w : v.removeAttribute("crossorigin"));
    };
    v.complete && v.naturalWidth !== 0 ? y() : v.addEventListener("load", y);
  }
  if (["audio", "video"].includes(f)) {
    const v = g;
    v.rr_mediaState = e.paused ? "paused" : "played", v.rr_mediaCurrentTime = e.currentTime, v.rr_mediaPlaybackRate = e.playbackRate, v.rr_mediaMuted = e.muted, v.rr_mediaLoop = e.loop, v.rr_mediaVolume = e.volume;
  }
  if (u || (e.scrollLeft && (g.rr_scrollLeft = e.scrollLeft), e.scrollTop && (g.rr_scrollTop = e.scrollTop)), m) {
    const { width: v, height: S } = e.getBoundingClientRect();
    g = {
      class: g.class,
      rr_width: `${v}px`,
      rr_height: `${S}px`
    };
  }
  f === "iframe" && !h(g.src) && (e.contentDocument || (g.rr_src = g.src), delete g.src);
  let b;
  try {
    customElements.get(f) && (b = !0);
  } catch {
  }
  return {
    type: se.Element,
    tagName: f,
    attributes: g,
    childNodes: [],
    isSVG: dc(e) || void 0,
    needBlock: m,
    rootId: l,
    isCustom: b
  };
}
function ee(e) {
  return e == null ? "" : e.toLowerCase();
}
function eo(e) {
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
function wc(e, t) {
  if (t.comment && e.type === se.Comment)
    return !0;
  if (e.type === se.Element) {
    if (t.script && // script tag
    (e.tagName === "script" || // (module)preload link
    e.tagName === "link" && (e.attributes.rel === "preload" && e.attributes.as === "script" || e.attributes.rel === "modulepreload") || // prefetch link
    e.tagName === "link" && e.attributes.rel === "prefetch" && typeof e.attributes.href == "string" && Xs(e.attributes.href) === "js"))
      return !0;
    if (t.headFavicon && (e.tagName === "link" && e.attributes.rel === "shortcut icon" || e.tagName === "meta" && (ee(e.attributes.name).match(
      /^msapplication-tile(image|color)$/
    ) || ee(e.attributes.name) === "application-name" || ee(e.attributes.rel) === "icon" || ee(e.attributes.rel) === "apple-touch-icon" || ee(e.attributes.rel) === "shortcut icon")))
      return !0;
    if (e.tagName === "meta") {
      if (t.headMetaDescKeywords && ee(e.attributes.name).match(/^description|keywords$/))
        return !0;
      if (t.headMetaSocial && (ee(e.attributes.property).match(/^(og|twitter|fb):/) || // og = opengraph (facebook)
      ee(e.attributes.name).match(/^(og|twitter):/) || ee(e.attributes.name) === "pinterest"))
        return !0;
      if (t.headMetaRobots && (ee(e.attributes.name) === "robots" || ee(e.attributes.name) === "googlebot" || ee(e.attributes.name) === "bingbot"))
        return !0;
      if (t.headMetaHttpEquiv && e.attributes["http-equiv"] !== void 0)
        return !0;
      if (t.headMetaAuthorship && (ee(e.attributes.name) === "author" || ee(e.attributes.name) === "generator" || ee(e.attributes.name) === "framework" || ee(e.attributes.name) === "publisher" || ee(e.attributes.name) === "progid" || ee(e.attributes.property).match(/^article:/) || ee(e.attributes.property).match(/^product:/)))
        return !0;
      if (t.headMetaVerification && (ee(e.attributes.name) === "google-site-verification" || ee(e.attributes.name) === "yandex-verification" || ee(e.attributes.name) === "csrf-token" || ee(e.attributes.name) === "p:domain_verify" || ee(e.attributes.name) === "verify-v1" || ee(e.attributes.name) === "verification" || ee(e.attributes.name) === "shopify-checkout-api-token"))
        return !0;
    }
  }
  return !1;
}
function et(e, t) {
  const {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    maskTextClass: c,
    maskTextSelector: d,
    skipChild: o = !1,
    inlineStylesheet: p = !0,
    maskInputOptions: a = {},
    maskTextFn: h,
    maskInputFn: u,
    slimDOMOptions: l,
    dataURLOptions: m = {},
    inlineImages: f = !1,
    recordCanvas: g = !1,
    onSerialize: x,
    onIframeLoad: b,
    iframeLoadTimeout: v = 5e3,
    onStylesheetLoad: S,
    stylesheetLoadTimeout: w = 5e3,
    keepIframeSrcFn: y = () => !1,
    newlyAddedElement: k = !1,
    cssCaptured: E = !1
  } = t;
  let { needsMask: O } = t, { preserveWhiteSpace: M = !0 } = t;
  O || (O = Qs(
    e,
    c,
    d,
    O === void 0
  ));
  const D = gc(e, {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    needsMask: O,
    inlineStylesheet: p,
    maskInputOptions: a,
    maskTextFn: h,
    maskInputFn: u,
    dataURLOptions: m,
    inlineImages: f,
    recordCanvas: g,
    keepIframeSrcFn: y,
    newlyAddedElement: k,
    cssCaptured: E
  });
  if (!D)
    return console.warn(e, "not serialized"), null;
  let A;
  i.hasNode(e) ? A = i.getId(e) : wc(D, l) || !M && D.type === se.Text && !D.textContent.replace(/^\s+|\s+$/gm, "").length ? A = ut : A = Js();
  const C = Object.assign(D, { id: A });
  if (i.add(e, C), A === ut)
    return null;
  x && x(e);
  let ye = !o;
  if (C.type === se.Element) {
    ye = ye && !C.needBlock, delete C.needBlock;
    const X = ce.shadowRoot(e);
    X && lt(X) && (C.isShadowHost = !0);
  }
  if ((C.type === se.Document || C.type === se.Element) && ye) {
    l.headWhitespace && C.type === se.Element && C.tagName === "head" && (M = !1);
    const X = {
      doc: r,
      mirror: i,
      blockClass: n,
      blockSelector: s,
      needsMask: O,
      maskTextClass: c,
      maskTextSelector: d,
      skipChild: o,
      inlineStylesheet: p,
      maskInputOptions: a,
      maskTextFn: h,
      maskInputFn: u,
      slimDOMOptions: l,
      dataURLOptions: m,
      inlineImages: f,
      recordCanvas: g,
      preserveWhiteSpace: M,
      onSerialize: x,
      onIframeLoad: b,
      iframeLoadTimeout: v,
      onStylesheetLoad: S,
      stylesheetLoadTimeout: w,
      keepIframeSrcFn: y,
      cssCaptured: !1
    };
    if (!(C.type === se.Element && C.tagName === "textarea" && C.attributes.value !== void 0)) {
      C.type === se.Element && C.attributes._cssText !== void 0 && typeof C.attributes._cssText == "string" && (X.cssCaptured = !0);
      for (const J of Array.from(ce.childNodes(e))) {
        const ie = et(J, X);
        ie && C.childNodes.push(ie);
      }
    }
    let W = null;
    if (Vs(e) && (W = ce.shadowRoot(e)))
      for (const J of Array.from(ce.childNodes(W))) {
        const ie = et(J, X);
        ie && (lt(W) && (ie.isShadow = !0), C.childNodes.push(ie));
      }
  }
  const ae = ce.parentNode(e);
  return ae && at(ae) && lt(ae) && (C.isShadow = !0), C.type === se.Element && C.tagName === "iframe" && fc(
    e,
    () => {
      const X = e.contentDocument;
      if (X && b) {
        const W = et(X, {
          doc: X,
          mirror: i,
          blockClass: n,
          blockSelector: s,
          needsMask: O,
          maskTextClass: c,
          maskTextSelector: d,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: h,
          maskInputFn: u,
          slimDOMOptions: l,
          dataURLOptions: m,
          inlineImages: f,
          recordCanvas: g,
          preserveWhiteSpace: M,
          onSerialize: x,
          onIframeLoad: b,
          iframeLoadTimeout: v,
          onStylesheetLoad: S,
          stylesheetLoadTimeout: w,
          keepIframeSrcFn: y
        });
        W && b(
          e,
          W
        );
      }
    },
    v
  ), C.type === se.Element && C.tagName === "link" && typeof C.attributes.rel == "string" && (C.attributes.rel === "stylesheet" || C.attributes.rel === "preload" && typeof C.attributes.href == "string" && Xs(C.attributes.href) === "css") && mc(
    e,
    () => {
      if (S) {
        const X = et(e, {
          doc: r,
          mirror: i,
          blockClass: n,
          blockSelector: s,
          needsMask: O,
          maskTextClass: c,
          maskTextSelector: d,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: h,
          maskInputFn: u,
          slimDOMOptions: l,
          dataURLOptions: m,
          inlineImages: f,
          recordCanvas: g,
          preserveWhiteSpace: M,
          onSerialize: x,
          onIframeLoad: b,
          iframeLoadTimeout: v,
          onStylesheetLoad: S,
          stylesheetLoadTimeout: w,
          keepIframeSrcFn: y
        });
        X && S(
          e,
          X
        );
      }
    },
    w
  ), C;
}
function xc(e, t) {
  const {
    mirror: r = new Ys(),
    blockClass: i = "rr-block",
    blockSelector: n = null,
    maskTextClass: s = "rr-mask",
    maskTextSelector: c = null,
    inlineStylesheet: d = !0,
    inlineImages: o = !1,
    recordCanvas: p = !1,
    maskAllInputs: a = !1,
    maskTextFn: h,
    maskInputFn: u,
    slimDOM: l = !1,
    dataURLOptions: m,
    preserveWhiteSpace: f,
    onSerialize: g,
    onIframeLoad: x,
    iframeLoadTimeout: b,
    onStylesheetLoad: v,
    stylesheetLoadTimeout: S,
    keepIframeSrcFn: w = () => !1
  } = t, y = a === !0 ? {
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
  } : a, k = eo(l);
  return et(e, {
    doc: e,
    mirror: r,
    blockClass: i,
    blockSelector: n,
    maskTextClass: s,
    maskTextSelector: c,
    skipChild: !1,
    inlineStylesheet: d,
    maskInputOptions: y,
    maskTextFn: h,
    maskInputFn: u,
    slimDOMOptions: k,
    dataURLOptions: m,
    inlineImages: o,
    recordCanvas: p,
    preserveWhiteSpace: f,
    onSerialize: g,
    onIframeLoad: x,
    iframeLoadTimeout: b,
    onStylesheetLoad: v,
    stylesheetLoadTimeout: S,
    keepIframeSrcFn: w,
    newlyAddedElement: !1
  });
}
function kc(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function Sc(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var r = function i() {
      return this instanceof i ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    r.prototype = t.prototype;
  } else r = {};
  return Object.defineProperty(r, "__esModule", { value: !0 }), Object.keys(e).forEach(function(i) {
    var n = Object.getOwnPropertyDescriptor(e, i);
    Object.defineProperty(r, i, n.get ? n : {
      enumerable: !0,
      get: function() {
        return e[i];
      }
    });
  }), r;
}
var xt = { exports: {} }, ci;
function Cc() {
  if (ci) return xt.exports;
  ci = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return xt.exports = t(), xt.exports.createColors = t, xt.exports;
}
const Ec = {}, Mc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Ec
}, Symbol.toStringTag, { value: "Module" })), Me = /* @__PURE__ */ Sc(Mc);
var cr, ui;
function En() {
  if (ui) return cr;
  ui = 1;
  let e = /* @__PURE__ */ Cc(), t = Me;
  class r extends Error {
    constructor(n, s, c, d, o, p) {
      super(n), this.name = "CssSyntaxError", this.reason = n, o && (this.file = o), d && (this.source = d), p && (this.plugin = p), typeof s < "u" && typeof c < "u" && (typeof s == "number" ? (this.line = s, this.column = c) : (this.line = s.line, this.column = s.column, this.endLine = c.line, this.endColumn = c.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(n) {
      if (!this.source) return "";
      let s = this.source;
      n == null && (n = e.isColorSupported), t && n && (s = t(s));
      let c = s.split(/\r?\n/), d = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, c.length), p = String(o).length, a, h;
      if (n) {
        let { bold: u, gray: l, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), h = (f) => l(f);
      } else
        a = h = (u) => u;
      return c.slice(d, o).map((u, l) => {
        let m = d + 1 + l, f = " " + (" " + m).slice(-p) + " | ";
        if (m === this.line) {
          let g = h(f.replace(/\d/g, " ")) + u.slice(0, this.column - 1).replace(/[^\t]/g, " ");
          return a(">") + h(f) + u + `
 ` + g + a("^");
        }
        return " " + h(f) + u;
      }).join(`
`);
    }
    toString() {
      let n = this.showSourceCode();
      return n && (n = `

` + n + `
`), this.name + ": " + this.message + n;
    }
  }
  return cr = r, r.default = r, cr;
}
var kt = {}, hi;
function Mn() {
  return hi || (hi = 1, kt.isClean = Symbol("isClean"), kt.my = Symbol("my")), kt;
}
var ur, di;
function to() {
  if (di) return ur;
  di = 1;
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
  function t(i) {
    return i[0].toUpperCase() + i.slice(1);
  }
  class r {
    constructor(n) {
      this.builder = n;
    }
    atrule(n, s) {
      let c = "@" + n.name, d = n.params ? this.rawValue(n, "params") : "";
      if (typeof n.raws.afterName < "u" ? c += n.raws.afterName : d && (c += " "), n.nodes)
        this.block(n, c + d);
      else {
        let o = (n.raws.between || "") + (s ? ";" : "");
        this.builder(c + d + o, n);
      }
    }
    beforeAfter(n, s) {
      let c;
      n.type === "decl" ? c = this.raw(n, null, "beforeDecl") : n.type === "comment" ? c = this.raw(n, null, "beforeComment") : s === "before" ? c = this.raw(n, null, "beforeRule") : c = this.raw(n, null, "beforeClose");
      let d = n.parent, o = 0;
      for (; d && d.type !== "root"; )
        o += 1, d = d.parent;
      if (c.includes(`
`)) {
        let p = this.raw(n, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) c += p;
      }
      return c;
    }
    block(n, s) {
      let c = this.raw(n, "between", "beforeOpen");
      this.builder(s + c + "{", n, "start");
      let d;
      n.nodes && n.nodes.length ? (this.body(n), d = this.raw(n, "after")) : d = this.raw(n, "after", "emptyBody"), d && this.builder(d), this.builder("}", n, "end");
    }
    body(n) {
      let s = n.nodes.length - 1;
      for (; s > 0 && n.nodes[s].type === "comment"; )
        s -= 1;
      let c = this.raw(n, "semicolon");
      for (let d = 0; d < n.nodes.length; d++) {
        let o = n.nodes[d], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== d || c);
      }
    }
    comment(n) {
      let s = this.raw(n, "left", "commentLeft"), c = this.raw(n, "right", "commentRight");
      this.builder("/*" + s + n.text + c + "*/", n);
    }
    decl(n, s) {
      let c = this.raw(n, "between", "colon"), d = n.prop + c + this.rawValue(n, "value");
      n.important && (d += n.raws.important || " !important"), s && (d += ";"), this.builder(d, n);
    }
    document(n) {
      this.body(n);
    }
    raw(n, s, c) {
      let d;
      if (c || (c = s), s && (d = n.raws[s], typeof d < "u"))
        return d;
      let o = n.parent;
      if (c === "before" && (!o || o.type === "root" && o.first === n || o && o.type === "document"))
        return "";
      if (!o) return e[c];
      let p = n.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[c] < "u")
        return p.rawCache[c];
      if (c === "before" || c === "after")
        return this.beforeAfter(n, c);
      {
        let a = "raw" + t(c);
        this[a] ? d = this[a](p, n) : p.walk((h) => {
          if (d = h.raws[s], typeof d < "u") return !1;
        });
      }
      return typeof d > "u" && (d = e[c]), p.rawCache[c] = d, d;
    }
    rawBeforeClose(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length > 0 && typeof c.raws.after < "u")
          return s = c.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(n, s) {
      let c;
      return n.walkComments((d) => {
        if (typeof d.raws.before < "u")
          return c = d.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeDecl") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeDecl(n, s) {
      let c;
      return n.walkDecls((d) => {
        if (typeof d.raws.before < "u")
          return c = d.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeRule") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeOpen(n) {
      let s;
      return n.walk((c) => {
        if (c.type !== "decl" && (s = c.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && (c.parent !== n || n.first !== c) && typeof c.raws.before < "u")
          return s = c.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(n) {
      let s;
      return n.walkDecls((c) => {
        if (typeof c.raws.between < "u")
          return s = c.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length === 0 && (s = c.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(n) {
      if (n.raws.indent) return n.raws.indent;
      let s;
      return n.walk((c) => {
        let d = c.parent;
        if (d && d !== n && d.parent && d.parent === n && typeof c.raws.before < "u") {
          let o = c.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length && c.last.type === "decl" && (s = c.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(n, s) {
      let c = n[s], d = n.raws[s];
      return d && d.value === c ? d.raw : c;
    }
    root(n) {
      this.body(n), n.raws.after && this.builder(n.raws.after);
    }
    rule(n) {
      this.block(n, this.rawValue(n, "selector")), n.raws.ownSemicolon && this.builder(n.raws.ownSemicolon, n, "end");
    }
    stringify(n, s) {
      if (!this[n.type])
        throw new Error(
          "Unknown AST node type " + n.type + ". Maybe you need to change PostCSS stringifier."
        );
      this[n.type](n, s);
    }
  }
  return ur = r, r.default = r, ur;
}
var hr, pi;
function jt() {
  if (pi) return hr;
  pi = 1;
  let e = to();
  function t(r, i) {
    new e(i).stringify(r);
  }
  return hr = t, t.default = t, hr;
}
var dr, fi;
function Ht() {
  if (fi) return dr;
  fi = 1;
  let { isClean: e, my: t } = Mn(), r = En(), i = to(), n = jt();
  function s(d, o) {
    let p = new d.constructor();
    for (let a in d) {
      if (!Object.prototype.hasOwnProperty.call(d, a) || a === "proxyCache") continue;
      let h = d[a], u = typeof h;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = h : Array.isArray(h) ? p[a] = h.map((l) => s(l, p)) : (u === "object" && h !== null && (h = s(h)), p[a] = h);
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
        let { end: a, start: h } = this.rangeBy(p);
        return this.source.input.error(
          o,
          { column: h.column, line: h.line },
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
        let h = p.indexOf(o.word);
        h !== -1 && (a = this.positionInside(h, p));
      }
      return a;
    }
    positionInside(o, p) {
      let a = p || this.toString(), h = this.source.start.column, u = this.source.start.line;
      for (let l = 0; l < o; l++)
        a[l] === `
` ? (h = 1, u += 1) : h += 1;
      return { column: h, line: u };
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
        let h = this.toString(), u = h.indexOf(o.word);
        u !== -1 && (p = this.positionInside(u, h), a = this.positionInside(u + o.word.length, h));
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
      return new i().raw(this, o, p);
    }
    remove() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }
    replaceWith(...o) {
      if (this.parent) {
        let p = this, a = !1;
        for (let h of o)
          h === this ? a = !0 : a ? (this.parent.insertAfter(p, h), p = h) : this.parent.insertBefore(p, h);
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
      let a = {}, h = p == null;
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
      return h && (a.inputs = [...p.keys()].map((l) => l.toJSON())), a;
    }
    toProxy() {
      return this.proxyCache || (this.proxyCache = new Proxy(this, this.getProxyProcessor())), this.proxyCache;
    }
    toString(o = n) {
      o.stringify && (o = o.stringify);
      let p = "";
      return o(this, (a) => {
        p += a;
      }), p;
    }
    warn(o, p, a) {
      let h = { node: this };
      for (let u in a) h[u] = a[u];
      return o.warn(p, h);
    }
    get proxyOf() {
      return this;
    }
  }
  return dr = c, c.default = c, dr;
}
var pr, mi;
function Vt() {
  if (mi) return pr;
  mi = 1;
  let e = Ht();
  class t extends e {
    constructor(i) {
      i && typeof i.value < "u" && typeof i.value != "string" && (i = { ...i, value: String(i.value) }), super(i), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return pr = t, t.default = t, pr;
}
var fr, gi;
function Rc() {
  if (gi) return fr;
  gi = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return fr = { nanoid: (i = 21) => {
    let n = "", s = i;
    for (; s--; )
      n += e[Math.random() * 64 | 0];
    return n;
  }, customAlphabet: (i, n = 21) => (s = n) => {
    let c = "", d = s;
    for (; d--; )
      c += i[Math.random() * i.length | 0];
    return c;
  } }, fr;
}
var mr, yi;
function ro() {
  if (yi) return mr;
  yi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Me, { existsSync: r, readFileSync: i } = Me, { dirname: n, join: s } = Me;
  function c(o) {
    return Buffer ? Buffer.from(o, "base64").toString() : window.atob(o);
  }
  class d {
    constructor(p, a) {
      if (a.map === !1) return;
      this.loadAnnotation(p), this.inline = this.startWith(this.annotation, "data:");
      let h = a.map ? a.map.prev : void 0, u = this.loadMap(a.from, h);
      !this.mapFile && a.from && (this.mapFile = a.from), this.mapFile && (this.root = n(this.mapFile)), u && (this.text = u);
    }
    consumer() {
      return this.consumerCache || (this.consumerCache = new e(this.text)), this.consumerCache;
    }
    decodeInline(p) {
      let a = /^data:application\/json;charset=utf-?8;base64,/, h = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, l = /^data:application\/json,/;
      if (u.test(p) || l.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || h.test(p))
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
      let h = p.lastIndexOf(a.pop()), u = p.indexOf("*/", h);
      h > -1 && u > -1 && (this.annotation = this.getAnnotationURL(p.substring(h, u)));
    }
    loadFile(p) {
      if (this.root = n(p), r(p))
        return this.mapFile = p, i(p, "utf-8").toString().trim();
    }
    loadMap(p, a) {
      if (a === !1) return !1;
      if (a) {
        if (typeof a == "string")
          return a;
        if (typeof a == "function") {
          let h = a(p);
          if (h) {
            let u = this.loadFile(h);
            if (!u)
              throw new Error(
                "Unable to load previous source map: " + h.toString()
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
          let h = this.annotation;
          return p && (h = s(n(p), h)), this.loadFile(h);
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
  return mr = d, d.default = d, mr;
}
var gr, bi;
function Gt() {
  if (bi) return gr;
  bi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Me, { fileURLToPath: r, pathToFileURL: i } = Me, { isAbsolute: n, resolve: s } = Me, { nanoid: c } = /* @__PURE__ */ Rc(), d = Me, o = En(), p = ro(), a = Symbol("fromOffsetCache"), h = !!(e && t), u = !!(s && n);
  class l {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || n(g.from) ? this.file = g.from : this.file = s(g.from)), u && h) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let b = x.consumer().file;
          !this.file && b && (this.file = this.mapResolve(b));
        }
      }
      this.file || (this.id = "<input css " + c(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, b = {}) {
      let v, S, w;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let O = this.fromOffset(k.offset);
          g = O.line, x = O.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let O = this.fromOffset(E.offset);
          S = O.line, w = O.col;
        } else
          S = E.line, w = E.column;
      } else if (!x) {
        let k = this.fromOffset(g);
        g = k.line, x = k.col;
      }
      let y = this.origin(g, x, S, w);
      return y ? v = new o(
        f,
        y.endLine === void 0 ? y.line : { column: y.column, line: y.line },
        y.endLine === void 0 ? y.column : { column: y.endColumn, line: y.endLine },
        y.source,
        y.file,
        b.plugin
      ) : v = new o(
        f,
        S === void 0 ? g : { column: x, line: g },
        S === void 0 ? x : { column: w, line: S },
        this.css,
        this.file,
        b.plugin
      ), v.input = { column: x, endColumn: w, endLine: S, line: g, source: this.css }, this.file && (i && (v.input.url = i(this.file).toString()), v.input.file = this.file), v;
    }
    fromOffset(f) {
      let g, x;
      if (this[a])
        x = this[a];
      else {
        let v = this.css.split(`
`);
        x = new Array(v.length);
        let S = 0;
        for (let w = 0, y = v.length; w < y; w++)
          x[w] = S, S += v[w].length + 1;
        this[a] = x;
      }
      g = x[x.length - 1];
      let b = 0;
      if (f >= g)
        b = x.length - 1;
      else {
        let v = x.length - 2, S;
        for (; b < v; )
          if (S = b + (v - b >> 1), f < x[S])
            v = S - 1;
          else if (f >= x[S + 1])
            b = S + 1;
          else {
            b = S;
            break;
          }
      }
      return {
        col: f - x[b] + 1,
        line: b + 1
      };
    }
    mapResolve(f) {
      return /^\w+:\/\//.test(f) ? f : s(this.map.consumer().sourceRoot || this.map.root || ".", f);
    }
    origin(f, g, x, b) {
      if (!this.map) return !1;
      let v = this.map.consumer(), S = v.originalPositionFor({ column: g, line: f });
      if (!S.source) return !1;
      let w;
      typeof x == "number" && (w = v.originalPositionFor({ column: b, line: x }));
      let y;
      n(S.source) ? y = i(S.source) : y = new URL(
        S.source,
        this.map.consumer().sourceRoot || i(this.map.mapFile)
      );
      let k = {
        column: S.column,
        endColumn: w && w.column,
        endLine: w && w.line,
        line: S.line,
        url: y.toString()
      };
      if (y.protocol === "file:")
        if (r)
          k.file = r(y);
        else
          throw new Error("file: protocol is not available in this PostCSS build");
      let E = v.sourceContentFor(S.source);
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
  return gr = l, l.default = l, d && d.registerInput && d.registerInput(l), gr;
}
var yr, vi;
function no() {
  if (vi) return yr;
  vi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Me, { dirname: r, relative: i, resolve: n, sep: s } = Me, { pathToFileURL: c } = Me, d = Gt(), o = !!(e && t), p = !!(r && n && i && s);
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
      this.stringify(this.root, (b, v, S) => {
        if (this.css += b, v && S !== "end" && (f.generated.line = u, f.generated.column = l - 1, v.source && v.source.start ? (f.source = this.sourcePath(v), f.original.line = v.source.start.line, f.original.column = v.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = b.match(/\n/g), g ? (u += g.length, x = b.lastIndexOf(`
`), l = b.length - x) : l += b.length, v && S !== "start") {
          let w = v.parent || { raws: {} };
          (!(v.type === "decl" || v.type === "atrule" && !v.nodes) || v !== w.last || w.raws.semicolon) && (v.source && v.source.end ? (f.source = this.sourcePath(v), f.original.line = v.source.end.line, f.original.column = v.source.end.column - 1, f.generated.line = u, f.generated.column = l - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = l - 1, this.map.addMapping(f)));
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
      typeof this.mapOpts.annotation == "string" && (m = r(n(m, this.mapOpts.annotation)));
      let f = i(m, u);
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
          let u = new d(this.originalCSS, this.opts);
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
  return yr = a, yr;
}
var br, wi;
function Yt() {
  if (wi) return br;
  wi = 1;
  let e = Ht();
  class t extends e {
    constructor(i) {
      super(i), this.type = "comment";
    }
  }
  return br = t, t.default = t, br;
}
var vr, xi;
function qe() {
  if (xi) return vr;
  xi = 1;
  let { isClean: e, my: t } = Mn(), r = Vt(), i = Yt(), n = Ht(), s, c, d, o;
  function p(u) {
    return u.map((l) => (l.nodes && (l.nodes = p(l.nodes)), delete l.source, l));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let l of u.proxyOf.nodes)
        a(l);
  }
  class h extends n {
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
            ...f.map((g) => typeof g == "function" ? (x, b) => g(x.toProxy(), b) : g)
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
      for (let b of g) this.proxyOf.nodes.splice(f + 1, 0, b);
      let x;
      for (let b in this.indexes)
        x = this.indexes[b], f < x && (this.indexes[b] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(l, m) {
      let f = this.index(l), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(l);
      for (let v of x) this.proxyOf.nodes.splice(f, 0, v);
      let b;
      for (let v in this.indexes)
        b = this.indexes[v], f <= b && (this.indexes[v] = b + x.length);
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
        l = [new d(l)];
      else if (l.text)
        l = [new i(l)];
      else
        throw new Error("Unknown node type in node creation");
      return l.map((g) => (g[t] || h.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
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
  return h.registerParse = (u) => {
    s = u;
  }, h.registerRule = (u) => {
    c = u;
  }, h.registerAtRule = (u) => {
    d = u;
  }, h.registerRoot = (u) => {
    o = u;
  }, vr = h, h.default = h, h.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, d.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, c.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, i.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((l) => {
      h.rebuild(l);
    });
  }, vr;
}
var wr, ki;
function Rn() {
  if (ki) return wr;
  ki = 1;
  let e = qe(), t, r;
  class i extends e {
    constructor(s) {
      super({ type: "document", ...s }), this.nodes || (this.nodes = []);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, wr = i, i.default = i, wr;
}
var xr, Si;
function io() {
  if (Si) return xr;
  Si = 1;
  let e = {};
  return xr = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, xr;
}
var kr, Ci;
function so() {
  if (Ci) return kr;
  Ci = 1;
  class e {
    constructor(r, i = {}) {
      if (this.type = "warning", this.text = r, i.node && i.node.source) {
        let n = i.node.rangeBy(i);
        this.line = n.start.line, this.column = n.start.column, this.endLine = n.end.line, this.endColumn = n.end.column;
      }
      for (let n in i) this[n] = i[n];
    }
    toString() {
      return this.node ? this.node.error(this.text, {
        index: this.index,
        plugin: this.plugin,
        word: this.word
      }).message : this.plugin ? this.plugin + ": " + this.text : this.text;
    }
  }
  return kr = e, e.default = e, kr;
}
var Sr, Ei;
function On() {
  if (Ei) return Sr;
  Ei = 1;
  let e = so();
  class t {
    constructor(i, n, s) {
      this.processor = i, this.messages = [], this.root = n, this.opts = s, this.css = void 0, this.map = void 0;
    }
    toString() {
      return this.css;
    }
    warn(i, n = {}) {
      n.plugin || this.lastPlugin && this.lastPlugin.postcssPlugin && (n.plugin = this.lastPlugin.postcssPlugin);
      let s = new e(i, n);
      return this.messages.push(s), s;
    }
    warnings() {
      return this.messages.filter((i) => i.type === "warning");
    }
    get content() {
      return this.css;
    }
  }
  return Sr = t, t.default = t, Sr;
}
var Cr, Mi;
function Oc() {
  if (Mi) return Cr;
  Mi = 1;
  const e = 39, t = 34, r = 92, i = 47, n = 10, s = 32, c = 12, d = 9, o = 13, p = 91, a = 93, h = 40, u = 41, l = 123, m = 125, f = 59, g = 42, x = 58, b = 64, v = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, w = /.[\r\n"'(/\\]/, y = /[\da-f]/i;
  return Cr = function(E, O = {}) {
    let M = E.css.valueOf(), D = O.ignoreErrors, A, C, ye, ae, X, W, J, ie, Q, Y, Se = M.length, R = 0, xe = [], ue = [];
    function _() {
      return R;
    }
    function N(L) {
      throw E.error("Unclosed " + L, R);
    }
    function z() {
      return ue.length === 0 && R >= Se;
    }
    function T(L) {
      if (ue.length) return ue.pop();
      if (R >= Se) return;
      let $ = L ? L.ignoreUnclosed : !1;
      switch (A = M.charCodeAt(R), A) {
        case n:
        case s:
        case d:
        case o:
        case c: {
          C = R;
          do
            C += 1, A = M.charCodeAt(C);
          while (A === s || A === n || A === d || A === o || A === c);
          Y = ["space", M.slice(R, C)], R = C - 1;
          break;
        }
        case p:
        case a:
        case l:
        case m:
        case x:
        case f:
        case u: {
          let P = String.fromCharCode(A);
          Y = [P, P, R];
          break;
        }
        case h: {
          if (ie = xe.length ? xe.pop()[1] : "", Q = M.charCodeAt(R + 1), ie === "url" && Q !== e && Q !== t && Q !== s && Q !== n && Q !== d && Q !== c && Q !== o) {
            C = R;
            do {
              if (W = !1, C = M.indexOf(")", C + 1), C === -1)
                if (D || $) {
                  C = R;
                  break;
                } else
                  N("bracket");
              for (J = C; M.charCodeAt(J - 1) === r; )
                J -= 1, W = !W;
            } while (W);
            Y = ["brackets", M.slice(R, C + 1), R, C], R = C;
          } else
            C = M.indexOf(")", R + 1), ae = M.slice(R, C + 1), C === -1 || w.test(ae) ? Y = ["(", "(", R] : (Y = ["brackets", ae, R, C], R = C);
          break;
        }
        case e:
        case t: {
          ye = A === e ? "'" : '"', C = R;
          do {
            if (W = !1, C = M.indexOf(ye, C + 1), C === -1)
              if (D || $) {
                C = R + 1;
                break;
              } else
                N("string");
            for (J = C; M.charCodeAt(J - 1) === r; )
              J -= 1, W = !W;
          } while (W);
          Y = ["string", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case b: {
          v.lastIndex = R + 1, v.test(M), v.lastIndex === 0 ? C = M.length - 1 : C = v.lastIndex - 2, Y = ["at-word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case r: {
          for (C = R, X = !0; M.charCodeAt(C + 1) === r; )
            C += 1, X = !X;
          if (A = M.charCodeAt(C + 1), X && A !== i && A !== s && A !== n && A !== d && A !== o && A !== c && (C += 1, y.test(M.charAt(C)))) {
            for (; y.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          Y = ["word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        default: {
          A === i && M.charCodeAt(R + 1) === g ? (C = M.indexOf("*/", R + 2) + 1, C === 0 && (D || $ ? C = M.length : N("comment")), Y = ["comment", M.slice(R, C + 1), R, C], R = C) : (S.lastIndex = R + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, Y = ["word", M.slice(R, C + 1), R, C], xe.push(Y), R = C);
          break;
        }
      }
      return R++, Y;
    }
    function q(L) {
      ue.push(L);
    }
    return {
      back: q,
      endOfFile: z,
      nextToken: T,
      position: _
    };
  }, Cr;
}
var Er, Ri;
function In() {
  if (Ri) return Er;
  Ri = 1;
  let e = qe();
  class t extends e {
    constructor(i) {
      super(i), this.type = "atrule";
    }
    append(...i) {
      return this.proxyOf.nodes || (this.nodes = []), super.append(...i);
    }
    prepend(...i) {
      return this.proxyOf.nodes || (this.nodes = []), super.prepend(...i);
    }
  }
  return Er = t, t.default = t, e.registerAtRule(t), Er;
}
var Mr, Oi;
function pt() {
  if (Oi) return Mr;
  Oi = 1;
  let e = qe(), t, r;
  class i extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, c, d) {
      let o = super.normalize(s);
      if (c) {
        if (d === "prepend")
          this.nodes.length > 1 ? c.raws.before = this.nodes[1].raws.before : delete c.raws.before;
        else if (this.first !== c)
          for (let p of o)
            p.raws.before = c.raws.before;
      }
      return o;
    }
    removeChild(s, c) {
      let d = this.index(s);
      return !c && d === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[d].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, Mr = i, i.default = i, e.registerRoot(i), Mr;
}
var Rr, Ii;
function oo() {
  if (Ii) return Rr;
  Ii = 1;
  let e = {
    comma(t) {
      return e.split(t, [","], !0);
    },
    space(t) {
      let r = [" ", `
`, "	"];
      return e.split(t, r);
    },
    split(t, r, i) {
      let n = [], s = "", c = !1, d = 0, o = !1, p = "", a = !1;
      for (let h of t)
        a ? a = !1 : h === "\\" ? a = !0 : o ? h === p && (o = !1) : h === '"' || h === "'" ? (o = !0, p = h) : h === "(" ? d += 1 : h === ")" ? d > 0 && (d -= 1) : d === 0 && r.includes(h) && (c = !0), c ? (s !== "" && n.push(s.trim()), s = "", c = !1) : s += h;
      return (i || s !== "") && n.push(s.trim()), n;
    }
  };
  return Rr = e, e.default = e, Rr;
}
var Or, Ai;
function An() {
  if (Ai) return Or;
  Ai = 1;
  let e = qe(), t = oo();
  class r extends e {
    constructor(n) {
      super(n), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(n) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, c = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = n.join(c);
    }
  }
  return Or = r, r.default = r, e.registerRule(r), Or;
}
var Ir, Li;
function Ic() {
  if (Li) return Ir;
  Li = 1;
  let e = Vt(), t = Oc(), r = Yt(), i = In(), n = pt(), s = An();
  const c = {
    empty: !0,
    space: !0
  };
  function d(p) {
    for (let a = p.length - 1; a >= 0; a--) {
      let h = p[a], u = h[3] || h[2];
      if (u) return u;
    }
  }
  class o {
    constructor(a) {
      this.input = a, this.root = new n(), this.current = this.root, this.spaces = "", this.semicolon = !1, this.createTokenizer(), this.root.source = { input: a, start: { column: 1, line: 1, offset: 0 } };
    }
    atrule(a) {
      let h = new i();
      h.name = a[1].slice(1), h.name === "" && this.unnamedAtrule(h, a), this.init(h, a[2]);
      let u, l, m, f = !1, g = !1, x = [], b = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? b.push(u === "(" ? ")" : "]") : u === "{" && b.length > 0 ? b.push("}") : u === b[b.length - 1] && b.pop(), b.length === 0)
          if (u === ";") {
            h.source.end = this.getPosition(a[2]), h.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, l = x[m]; l && l[0] === "space"; )
                l = x[--m];
              l && (h.source.end = this.getPosition(l[3] || l[2]), h.source.end.offset++);
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
      h.raws.between = this.spacesAndCommentsFromEnd(x), x.length ? (h.raws.afterName = this.spacesAndCommentsFromStart(x), this.raw(h, "params", x), f && (a = x[x.length - 1], h.source.end = this.getPosition(a[3] || a[2]), h.source.end.offset++, this.spaces = h.raws.between, h.raws.between = "")) : (h.raws.afterName = "", h.params = ""), g && (h.nodes = [], this.current = h);
    }
    checkMissedSemicolon(a) {
      let h = this.colon(a);
      if (h === !1) return;
      let u = 0, l;
      for (let m = h - 1; m >= 0 && (l = a[m], !(l[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        l[0] === "word" ? l[3] + 1 : l[2]
      );
    }
    colon(a) {
      let h = 0, u, l, m;
      for (let [f, g] of a.entries()) {
        if (u = g, l = u[0], l === "(" && (h += 1), l === ")" && (h -= 1), h === 0 && l === ":")
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
      let h = new r();
      this.init(h, a[2]), h.source.end = this.getPosition(a[3] || a[2]), h.source.end.offset++;
      let u = a[1].slice(2, -2);
      if (/^\s*$/.test(u))
        h.text = "", h.raws.left = u, h.raws.right = "";
      else {
        let l = u.match(/^(\s*)([^]*\S)(\s*)$/);
        h.text = l[2], h.raws.left = l[1], h.raws.right = l[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, h) {
      let u = new e();
      this.init(u, a[0][2]);
      let l = a[a.length - 1];
      for (l[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        l[3] || l[2] || d(a)
      ), u.source.end.offset++; a[0][0] !== "word"; )
        a.length === 1 && this.unknownWord(a), u.raws.before += a.shift()[1];
      for (u.source.start = this.getPosition(a[0][2]), u.prop = ""; a.length; ) {
        let b = a[0][0];
        if (b === ":" || b === "space" || b === "comment")
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
      for (let b = a.length - 1; b >= 0; b--) {
        if (m = a[b], m[1].toLowerCase() === "!important") {
          u.important = !0;
          let v = this.stringFrom(a, b);
          v = this.spacesFromEnd(a) + v, v !== " !important" && (u.raws.important = v);
          break;
        } else if (m[1].toLowerCase() === "important") {
          let v = a.slice(0), S = "";
          for (let w = b; w > 0; w--) {
            let y = v[w][0];
            if (S.trim().indexOf("!") === 0 && y !== "space")
              break;
            S = v.pop()[1] + S;
          }
          S.trim().indexOf("!") === 0 && (u.important = !0, u.raws.important = S, a = v);
        }
        if (m[0] !== "space" && m[0] !== "comment")
          break;
      }
      a.some((b) => b[0] !== "space" && b[0] !== "comment") && (u.raws.between += f.map((b) => b[1]).join(""), f = []), this.raw(u, "value", f.concat(a), h), u.value.includes(":") && !h && this.checkMissedSemicolon(a);
    }
    doubleColon(a) {
      throw this.input.error(
        "Double colon",
        { offset: a[2] },
        { offset: a[2] + a[1].length }
      );
    }
    emptyRule(a) {
      let h = new s();
      this.init(h, a[2]), h.selector = "", h.raws.between = "", this.current = h;
    }
    end(a) {
      this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.semicolon = !1, this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.spaces = "", this.current.parent ? (this.current.source.end = this.getPosition(a[2]), this.current.source.end.offset++, this.current = this.current.parent) : this.unexpectedClose(a);
    }
    endFile() {
      this.current.parent && this.unclosedBlock(), this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.root.source.end = this.getPosition(this.tokenizer.position());
    }
    freeSemicolon(a) {
      if (this.spaces += a[1], this.current.nodes) {
        let h = this.current.nodes[this.current.nodes.length - 1];
        h && h.type === "rule" && !h.raws.ownSemicolon && (h.raws.ownSemicolon = this.spaces, this.spaces = "");
      }
    }
    // Helpers
    getPosition(a) {
      let h = this.input.fromOffset(a);
      return {
        column: h.col,
        line: h.line,
        offset: a
      };
    }
    init(a, h) {
      this.current.push(a), a.source = {
        input: this.input,
        start: this.getPosition(h)
      }, a.raws.before = this.spaces, this.spaces = "", a.type !== "comment" && (this.semicolon = !1);
    }
    other(a) {
      let h = !1, u = null, l = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], b = a;
      for (; b; ) {
        if (u = b[0], x.push(b), u === "(" || u === "[")
          m || (m = b), f.push(u === "(" ? ")" : "]");
        else if (g && l && u === "{")
          m || (m = b), f.push("}");
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
            this.tokenizer.back(x.pop()), h = !0;
            break;
          } else u === ":" && (l = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        b = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (h = !0), f.length > 0 && this.unclosedBracket(m), h && l) {
        if (!g)
          for (; x.length && (b = x[x.length - 1][0], !(b !== "space" && b !== "comment")); )
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
    raw(a, h, u, l) {
      let m, f, g = u.length, x = "", b = !0, v, S;
      for (let w = 0; w < g; w += 1)
        m = u[w], f = m[0], f === "space" && w === g - 1 && !l ? b = !1 : f === "comment" ? (S = u[w - 1] ? u[w - 1][0] : "empty", v = u[w + 1] ? u[w + 1][0] : "empty", !c[S] && !c[v] ? x.slice(-1) === "," ? b = !1 : x += m[1] : b = !1) : x += m[1];
      if (!b) {
        let w = u.reduce((y, k) => y + k[1], "");
        a.raws[h] = { raw: w, value: x };
      }
      a[h] = x;
    }
    rule(a) {
      a.pop();
      let h = new s();
      this.init(h, a[0][2]), h.raws.between = this.spacesAndCommentsFromEnd(a), this.raw(h, "selector", a), this.current = h;
    }
    spacesAndCommentsFromEnd(a) {
      let h, u = "";
      for (; a.length && (h = a[a.length - 1][0], !(h !== "space" && h !== "comment")); )
        u = a.pop()[1] + u;
      return u;
    }
    // Errors
    spacesAndCommentsFromStart(a) {
      let h, u = "";
      for (; a.length && (h = a[0][0], !(h !== "space" && h !== "comment")); )
        u += a.shift()[1];
      return u;
    }
    spacesFromEnd(a) {
      let h, u = "";
      for (; a.length && (h = a[a.length - 1][0], h === "space"); )
        u = a.pop()[1] + u;
      return u;
    }
    stringFrom(a, h) {
      let u = "";
      for (let l = h; l < a.length; l++)
        u += a[l][1];
      return a.splice(h, a.length - h), u;
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
    unnamedAtrule(a, h) {
      throw this.input.error(
        "At-rule without name",
        { offset: h[2] },
        { offset: h[2] + h[1].length }
      );
    }
  }
  return Ir = o, Ir;
}
var Ar, Pi;
function Ln() {
  if (Pi) return Ar;
  Pi = 1;
  let e = qe(), t = Ic(), r = Gt();
  function i(n, s) {
    let c = new r(n, s), d = new t(c);
    try {
      d.parse();
    } catch (o) {
      throw process.env.NODE_ENV !== "production" && o.name === "CssSyntaxError" && s && s.from && (/\.scss$/i.test(s.from) ? o.message += `
You tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser` : /\.sass/i.test(s.from) ? o.message += `
You tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser` : /\.less$/i.test(s.from) && (o.message += `
You tried to parse Less with the standard CSS parser; try again with the postcss-less parser`)), o;
    }
    return d.root;
  }
  return Ar = i, i.default = i, e.registerParse(i), Ar;
}
var Lr, Ti;
function ao() {
  if (Ti) return Lr;
  Ti = 1;
  let { isClean: e, my: t } = Mn(), r = no(), i = jt(), n = qe(), s = Rn(), c = io(), d = On(), o = Ln(), p = pt();
  const a = {
    atrule: "AtRule",
    comment: "Comment",
    decl: "Declaration",
    document: "Document",
    root: "Root",
    rule: "Rule"
  }, h = {
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
    let w = !1, y = a[S.type];
    return S.type === "decl" ? w = S.prop.toLowerCase() : S.type === "atrule" && (w = S.name.toLowerCase()), w && S.append ? [
      y,
      y + "-" + w,
      l,
      y + "Exit",
      y + "Exit-" + w
    ] : w ? [y, y + "-" + w, y + "Exit", y + "Exit-" + w] : S.append ? [y, l, y + "Exit"] : [y, y + "Exit"];
  }
  function g(S) {
    let w;
    return S.type === "document" ? w = ["Document", l, "DocumentExit"] : S.type === "root" ? w = ["Root", l, "RootExit"] : w = f(S), {
      eventIndex: 0,
      events: w,
      iterator: 0,
      node: S,
      visitorIndex: 0,
      visitors: []
    };
  }
  function x(S) {
    return S[e] = !1, S.nodes && S.nodes.forEach((w) => x(w)), S;
  }
  let b = {};
  class v {
    constructor(w, y, k) {
      this.stringified = !1, this.processed = !1;
      let E;
      if (typeof y == "object" && y !== null && (y.type === "root" || y.type === "document"))
        E = x(y);
      else if (y instanceof v || y instanceof d)
        E = x(y.root), y.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = y.map);
      else {
        let O = o;
        k.syntax && (O = k.syntax.parse), k.parser && (O = k.parser), O.parse && (O = O.parse);
        try {
          E = O(y, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && n.rebuild(E);
      }
      this.result = new d(w, E, k), this.helpers = { ...b, postcss: b, result: this.result }, this.plugins = this.processor.plugins.map((O) => typeof O == "object" && O.prepare ? { ...O, ...O.prepare(this.result) } : O);
    }
    async() {
      return this.error ? Promise.reject(this.error) : this.processed ? Promise.resolve(this.result) : (this.processing || (this.processing = this.runAsync()), this.processing);
    }
    catch(w) {
      return this.async().catch(w);
    }
    finally(w) {
      return this.async().then(w, w);
    }
    getAsyncError() {
      throw new Error("Use process(css).then(cb) to work with async plugins");
    }
    handleError(w, y) {
      let k = this.result.lastPlugin;
      try {
        if (y && y.addToError(w), this.error = w, w.name === "CssSyntaxError" && !w.plugin)
          w.plugin = k.postcssPlugin, w.setMessage();
        else if (k.postcssVersion && process.env.NODE_ENV !== "production") {
          let E = k.postcssPlugin, O = k.postcssVersion, M = this.result.processor.version, D = O.split("."), A = M.split(".");
          (D[0] !== A[0] || parseInt(D[1]) > parseInt(A[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + O + ". Perhaps this is the source of the error below."
          );
        }
      } catch (E) {
        console && console.error && console.error(E);
      }
      return w;
    }
    prepareVisitors() {
      this.listeners = {};
      let w = (y, k, E) => {
        this.listeners[k] || (this.listeners[k] = []), this.listeners[k].push([y, E]);
      };
      for (let y of this.plugins)
        if (typeof y == "object")
          for (let k in y) {
            if (!h[k] && /^[A-Z]/.test(k))
              throw new Error(
                `Unknown event ${k} in ${y.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
              );
            if (!u[k])
              if (typeof y[k] == "object")
                for (let E in y[k])
                  E === "*" ? w(y, k, y[k][E]) : w(
                    y,
                    k + "-" + E.toLowerCase(),
                    y[k][E]
                  );
              else typeof y[k] == "function" && w(y, k, y[k]);
          }
      this.hasListener = Object.keys(this.listeners).length > 0;
    }
    async runAsync() {
      this.plugin = 0;
      for (let w = 0; w < this.plugins.length; w++) {
        let y = this.plugins[w], k = this.runOnRoot(y);
        if (m(k))
          try {
            await k;
          } catch (E) {
            throw this.handleError(E);
          }
      }
      if (this.prepareVisitors(), this.hasListener) {
        let w = this.result.root;
        for (; !w[e]; ) {
          w[e] = !0;
          let y = [g(w)];
          for (; y.length > 0; ) {
            let k = this.visitTick(y);
            if (m(k))
              try {
                await k;
              } catch (E) {
                let O = y[y.length - 1].node;
                throw this.handleError(E, O);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [y, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = y;
            try {
              if (w.type === "document") {
                let E = w.nodes.map(
                  (O) => k(O, this.helpers)
                );
                await Promise.all(E);
              } else
                await k(w, this.helpers);
            } catch (E) {
              throw this.handleError(E);
            }
          }
      }
      return this.processed = !0, this.stringify();
    }
    runOnRoot(w) {
      this.result.lastPlugin = w;
      try {
        if (typeof w == "object" && w.Once) {
          if (this.result.root.type === "document") {
            let y = this.result.root.nodes.map(
              (k) => w.Once(k, this.helpers)
            );
            return m(y[0]) ? Promise.all(y) : y;
          }
          return w.Once(this.result.root, this.helpers);
        } else if (typeof w == "function")
          return w(this.result.root, this.result);
      } catch (y) {
        throw this.handleError(y);
      }
    }
    stringify() {
      if (this.error) throw this.error;
      if (this.stringified) return this.result;
      this.stringified = !0, this.sync();
      let w = this.result.opts, y = i;
      w.syntax && (y = w.syntax.stringify), w.stringifier && (y = w.stringifier), y.stringify && (y = y.stringify);
      let E = new r(y, this.result.root, this.result.opts).generate();
      return this.result.css = E[0], this.result.map = E[1], this.result;
    }
    sync() {
      if (this.error) throw this.error;
      if (this.processed) return this.result;
      if (this.processed = !0, this.processing)
        throw this.getAsyncError();
      for (let w of this.plugins) {
        let y = this.runOnRoot(w);
        if (m(y))
          throw this.getAsyncError();
      }
      if (this.prepareVisitors(), this.hasListener) {
        let w = this.result.root;
        for (; !w[e]; )
          w[e] = !0, this.walkSync(w);
        if (this.listeners.OnceExit)
          if (w.type === "document")
            for (let y of w.nodes)
              this.visitSync(this.listeners.OnceExit, y);
          else
            this.visitSync(this.listeners.OnceExit, w);
      }
      return this.result;
    }
    then(w, y) {
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || c(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(w, y);
    }
    toString() {
      return this.css;
    }
    visitSync(w, y) {
      for (let [k, E] of w) {
        this.result.lastPlugin = k;
        let O;
        try {
          O = E(y, this.helpers);
        } catch (M) {
          throw this.handleError(M, y.proxyOf);
        }
        if (y.type !== "root" && y.type !== "document" && !y.parent)
          return !0;
        if (m(O))
          throw this.getAsyncError();
      }
    }
    visitTick(w) {
      let y = w[w.length - 1], { node: k, visitors: E } = y;
      if (k.type !== "root" && k.type !== "document" && !k.parent) {
        w.pop();
        return;
      }
      if (E.length > 0 && y.visitorIndex < E.length) {
        let [M, D] = E[y.visitorIndex];
        y.visitorIndex += 1, y.visitorIndex === E.length && (y.visitors = [], y.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return D(k.toProxy(), this.helpers);
        } catch (A) {
          throw this.handleError(A, k);
        }
      }
      if (y.iterator !== 0) {
        let M = y.iterator, D;
        for (; D = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !D[e]) {
            D[e] = !0, w.push(g(D));
            return;
          }
        y.iterator = 0, delete k.indexes[M];
      }
      let O = y.events;
      for (; y.eventIndex < O.length; ) {
        let M = O[y.eventIndex];
        if (y.eventIndex += 1, M === l) {
          k.nodes && k.nodes.length && (k[e] = !0, y.iterator = k.getIterator());
          return;
        } else if (this.listeners[M]) {
          y.visitors = this.listeners[M];
          return;
        }
      }
      w.pop();
    }
    walkSync(w) {
      w[e] = !0;
      let y = f(w);
      for (let k of y)
        if (k === l)
          w.nodes && w.each((E) => {
            E[e] || this.walkSync(E);
          });
        else {
          let E = this.listeners[k];
          if (E && this.visitSync(E, w.toProxy()))
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
  return v.registerPostcss = (S) => {
    b = S;
  }, Lr = v, v.default = v, p.registerLazyResult(v), s.registerLazyResult(v), Lr;
}
var Pr, Ni;
function Ac() {
  if (Ni) return Pr;
  Ni = 1;
  let e = no(), t = jt(), r = io(), i = Ln();
  const n = On();
  class s {
    constructor(d, o, p) {
      o = o.toString(), this.stringified = !1, this._processor = d, this._css = o, this._opts = p, this._map = void 0;
      let a, h = t;
      this.result = new n(this._processor, a, this._opts), this.result.css = o;
      let u = this;
      Object.defineProperty(this.result, "root", {
        get() {
          return u.root;
        }
      });
      let l = new e(h, a, this._opts, o);
      if (l.isMap()) {
        let [m, f] = l.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        l.clearAnnotation(), this.result.css = l.css;
    }
    async() {
      return this.error ? Promise.reject(this.error) : Promise.resolve(this.result);
    }
    catch(d) {
      return this.async().catch(d);
    }
    finally(d) {
      return this.async().then(d, d);
    }
    sync() {
      if (this.error) throw this.error;
      return this.result;
    }
    then(d, o) {
      return process.env.NODE_ENV !== "production" && ("from" in this._opts || r(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(d, o);
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
      let d, o = i;
      try {
        d = o(this._css, this._opts);
      } catch (p) {
        this.error = p;
      }
      if (this.error)
        throw this.error;
      return this._root = d, d;
    }
    get [Symbol.toStringTag]() {
      return "NoWorkResult";
    }
  }
  return Pr = s, s.default = s, Pr;
}
var Tr, _i;
function Lc() {
  if (_i) return Tr;
  _i = 1;
  let e = Ac(), t = ao(), r = Rn(), i = pt();
  class n {
    constructor(c = []) {
      this.version = "8.4.38", this.plugins = this.normalize(c);
    }
    normalize(c) {
      let d = [];
      for (let o of c)
        if (o.postcss === !0 ? o = o() : o.postcss && (o = o.postcss), typeof o == "object" && Array.isArray(o.plugins))
          d = d.concat(o.plugins);
        else if (typeof o == "object" && o.postcssPlugin)
          d.push(o);
        else if (typeof o == "function")
          d.push(o);
        else if (typeof o == "object" && (o.parse || o.stringify)) {
          if (process.env.NODE_ENV !== "production")
            throw new Error(
              "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
            );
        } else
          throw new Error(o + " is not a PostCSS plugin");
      return d;
    }
    process(c, d = {}) {
      return !this.plugins.length && !d.parser && !d.stringifier && !d.syntax ? new e(this, c, d) : new t(this, c, d);
    }
    use(c) {
      return this.plugins = this.plugins.concat(this.normalize([c])), this;
    }
  }
  return Tr = n, n.default = n, i.registerProcessor(n), r.registerProcessor(n), Tr;
}
var Nr, $i;
function Pc() {
  if ($i) return Nr;
  $i = 1;
  let e = Vt(), t = ro(), r = Yt(), i = In(), n = Gt(), s = pt(), c = An();
  function d(o, p) {
    if (Array.isArray(o)) return o.map((u) => d(u));
    let { inputs: a, ...h } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let l = { ...u, __proto__: n.prototype };
        l.map && (l.map = {
          ...l.map,
          __proto__: t.prototype
        }), p.push(l);
      }
    }
    if (h.nodes && (h.nodes = o.nodes.map((u) => d(u, p))), h.source) {
      let { inputId: u, ...l } = h.source;
      h.source = l, u != null && (h.source.input = p[u]);
    }
    if (h.type === "root")
      return new s(h);
    if (h.type === "decl")
      return new e(h);
    if (h.type === "rule")
      return new c(h);
    if (h.type === "comment")
      return new r(h);
    if (h.type === "atrule")
      return new i(h);
    throw new Error("Unknown node type: " + o.type);
  }
  return Nr = d, d.default = d, Nr;
}
var _r, Di;
function Tc() {
  if (Di) return _r;
  Di = 1;
  let e = En(), t = Vt(), r = ao(), i = qe(), n = Lc(), s = jt(), c = Pc(), d = Rn(), o = so(), p = Yt(), a = In(), h = On(), u = Gt(), l = Ln(), m = oo(), f = An(), g = pt(), x = Ht();
  function b(...v) {
    return v.length === 1 && Array.isArray(v[0]) && (v = v[0]), new n(v);
  }
  return b.plugin = function(S, w) {
    let y = !1;
    function k(...O) {
      console && console.warn && !y && (y = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = w(...O);
      return M.postcssPlugin = S, M.postcssVersion = new n().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(O, M, D) {
      return b([k(D)]).process(O, M);
    }, k;
  }, b.stringify = s, b.parse = l, b.fromJSON = c, b.list = m, b.comment = (v) => new p(v), b.atRule = (v) => new a(v), b.decl = (v) => new t(v), b.rule = (v) => new f(v), b.root = (v) => new g(v), b.document = (v) => new d(v), b.CssSyntaxError = e, b.Declaration = t, b.Container = i, b.Processor = n, b.Document = d, b.Comment = p, b.Warning = o, b.AtRule = a, b.Result = h, b.Input = u, b.Rule = f, b.Root = g, b.Node = x, r.registerPostcss(b), _r = b, b.default = b, _r;
}
var Nc = Tc();
const te = /* @__PURE__ */ kc(Nc);
te.stringify;
te.fromJSON;
te.plugin;
te.parse;
te.list;
te.document;
te.comment;
te.atRule;
te.rule;
te.decl;
te.root;
te.CssSyntaxError;
te.Declaration;
te.Container;
te.Processor;
te.Document;
te.Comment;
te.Warning;
te.AtRule;
te.Result;
te.Input;
te.Rule;
te.Root;
te.Node;
var _c = Object.defineProperty, $c = (e, t, r) => t in e ? _c(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, ke = (e, t, r) => $c(e, typeof t != "symbol" ? t + "" : t, r);
Date.now().toString();
function Dc(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function zc(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var r = function i() {
      return this instanceof i ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    r.prototype = t.prototype;
  } else r = {};
  return Object.defineProperty(r, "__esModule", { value: !0 }), Object.keys(e).forEach(function(i) {
    var n = Object.getOwnPropertyDescriptor(e, i);
    Object.defineProperty(r, i, n.get ? n : {
      enumerable: !0,
      get: function() {
        return e[i];
      }
    });
  }), r;
}
var St = { exports: {} }, zi;
function Fc() {
  if (zi) return St.exports;
  zi = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return St.exports = t(), St.exports.createColors = t, St.exports;
}
const Uc = {}, Bc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Uc
}, Symbol.toStringTag, { value: "Module" })), Re = /* @__PURE__ */ zc(Bc);
var $r, Fi;
function Pn() {
  if (Fi) return $r;
  Fi = 1;
  let e = /* @__PURE__ */ Fc(), t = Re;
  class r extends Error {
    constructor(n, s, c, d, o, p) {
      super(n), this.name = "CssSyntaxError", this.reason = n, o && (this.file = o), d && (this.source = d), p && (this.plugin = p), typeof s < "u" && typeof c < "u" && (typeof s == "number" ? (this.line = s, this.column = c) : (this.line = s.line, this.column = s.column, this.endLine = c.line, this.endColumn = c.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(n) {
      if (!this.source) return "";
      let s = this.source;
      n == null && (n = e.isColorSupported), t && n && (s = t(s));
      let c = s.split(/\r?\n/), d = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, c.length), p = String(o).length, a, h;
      if (n) {
        let { bold: u, gray: l, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), h = (f) => l(f);
      } else
        a = h = (u) => u;
      return c.slice(d, o).map((u, l) => {
        let m = d + 1 + l, f = " " + (" " + m).slice(-p) + " | ";
        if (m === this.line) {
          let g = h(f.replace(/\d/g, " ")) + u.slice(0, this.column - 1).replace(/[^\t]/g, " ");
          return a(">") + h(f) + u + `
 ` + g + a("^");
        }
        return " " + h(f) + u;
      }).join(`
`);
    }
    toString() {
      let n = this.showSourceCode();
      return n && (n = `

` + n + `
`), this.name + ": " + this.message + n;
    }
  }
  return $r = r, r.default = r, $r;
}
var Ct = {}, Ui;
function Tn() {
  return Ui || (Ui = 1, Ct.isClean = Symbol("isClean"), Ct.my = Symbol("my")), Ct;
}
var Dr, Bi;
function lo() {
  if (Bi) return Dr;
  Bi = 1;
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
  function t(i) {
    return i[0].toUpperCase() + i.slice(1);
  }
  class r {
    constructor(n) {
      this.builder = n;
    }
    atrule(n, s) {
      let c = "@" + n.name, d = n.params ? this.rawValue(n, "params") : "";
      if (typeof n.raws.afterName < "u" ? c += n.raws.afterName : d && (c += " "), n.nodes)
        this.block(n, c + d);
      else {
        let o = (n.raws.between || "") + (s ? ";" : "");
        this.builder(c + d + o, n);
      }
    }
    beforeAfter(n, s) {
      let c;
      n.type === "decl" ? c = this.raw(n, null, "beforeDecl") : n.type === "comment" ? c = this.raw(n, null, "beforeComment") : s === "before" ? c = this.raw(n, null, "beforeRule") : c = this.raw(n, null, "beforeClose");
      let d = n.parent, o = 0;
      for (; d && d.type !== "root"; )
        o += 1, d = d.parent;
      if (c.includes(`
`)) {
        let p = this.raw(n, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) c += p;
      }
      return c;
    }
    block(n, s) {
      let c = this.raw(n, "between", "beforeOpen");
      this.builder(s + c + "{", n, "start");
      let d;
      n.nodes && n.nodes.length ? (this.body(n), d = this.raw(n, "after")) : d = this.raw(n, "after", "emptyBody"), d && this.builder(d), this.builder("}", n, "end");
    }
    body(n) {
      let s = n.nodes.length - 1;
      for (; s > 0 && n.nodes[s].type === "comment"; )
        s -= 1;
      let c = this.raw(n, "semicolon");
      for (let d = 0; d < n.nodes.length; d++) {
        let o = n.nodes[d], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== d || c);
      }
    }
    comment(n) {
      let s = this.raw(n, "left", "commentLeft"), c = this.raw(n, "right", "commentRight");
      this.builder("/*" + s + n.text + c + "*/", n);
    }
    decl(n, s) {
      let c = this.raw(n, "between", "colon"), d = n.prop + c + this.rawValue(n, "value");
      n.important && (d += n.raws.important || " !important"), s && (d += ";"), this.builder(d, n);
    }
    document(n) {
      this.body(n);
    }
    raw(n, s, c) {
      let d;
      if (c || (c = s), s && (d = n.raws[s], typeof d < "u"))
        return d;
      let o = n.parent;
      if (c === "before" && (!o || o.type === "root" && o.first === n || o && o.type === "document"))
        return "";
      if (!o) return e[c];
      let p = n.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[c] < "u")
        return p.rawCache[c];
      if (c === "before" || c === "after")
        return this.beforeAfter(n, c);
      {
        let a = "raw" + t(c);
        this[a] ? d = this[a](p, n) : p.walk((h) => {
          if (d = h.raws[s], typeof d < "u") return !1;
        });
      }
      return typeof d > "u" && (d = e[c]), p.rawCache[c] = d, d;
    }
    rawBeforeClose(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length > 0 && typeof c.raws.after < "u")
          return s = c.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(n, s) {
      let c;
      return n.walkComments((d) => {
        if (typeof d.raws.before < "u")
          return c = d.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeDecl") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeDecl(n, s) {
      let c;
      return n.walkDecls((d) => {
        if (typeof d.raws.before < "u")
          return c = d.raws.before, c.includes(`
`) && (c = c.replace(/[^\n]+$/, "")), !1;
      }), typeof c > "u" ? c = this.raw(s, null, "beforeRule") : c && (c = c.replace(/\S/g, "")), c;
    }
    rawBeforeOpen(n) {
      let s;
      return n.walk((c) => {
        if (c.type !== "decl" && (s = c.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && (c.parent !== n || n.first !== c) && typeof c.raws.before < "u")
          return s = c.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(n) {
      let s;
      return n.walkDecls((c) => {
        if (typeof c.raws.between < "u")
          return s = c.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length === 0 && (s = c.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(n) {
      if (n.raws.indent) return n.raws.indent;
      let s;
      return n.walk((c) => {
        let d = c.parent;
        if (d && d !== n && d.parent && d.parent === n && typeof c.raws.before < "u") {
          let o = c.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(n) {
      let s;
      return n.walk((c) => {
        if (c.nodes && c.nodes.length && c.last.type === "decl" && (s = c.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(n, s) {
      let c = n[s], d = n.raws[s];
      return d && d.value === c ? d.raw : c;
    }
    root(n) {
      this.body(n), n.raws.after && this.builder(n.raws.after);
    }
    rule(n) {
      this.block(n, this.rawValue(n, "selector")), n.raws.ownSemicolon && this.builder(n.raws.ownSemicolon, n, "end");
    }
    stringify(n, s) {
      if (!this[n.type])
        throw new Error(
          "Unknown AST node type " + n.type + ". Maybe you need to change PostCSS stringifier."
        );
      this[n.type](n, s);
    }
  }
  return Dr = r, r.default = r, Dr;
}
var zr, Wi;
function Xt() {
  if (Wi) return zr;
  Wi = 1;
  let e = lo();
  function t(r, i) {
    new e(i).stringify(r);
  }
  return zr = t, t.default = t, zr;
}
var Fr, qi;
function Jt() {
  if (qi) return Fr;
  qi = 1;
  let { isClean: e, my: t } = Tn(), r = Pn(), i = lo(), n = Xt();
  function s(d, o) {
    let p = new d.constructor();
    for (let a in d) {
      if (!Object.prototype.hasOwnProperty.call(d, a) || a === "proxyCache") continue;
      let h = d[a], u = typeof h;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = h : Array.isArray(h) ? p[a] = h.map((l) => s(l, p)) : (u === "object" && h !== null && (h = s(h)), p[a] = h);
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
        let { end: a, start: h } = this.rangeBy(p);
        return this.source.input.error(
          o,
          { column: h.column, line: h.line },
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
        let h = p.indexOf(o.word);
        h !== -1 && (a = this.positionInside(h, p));
      }
      return a;
    }
    positionInside(o, p) {
      let a = p || this.toString(), h = this.source.start.column, u = this.source.start.line;
      for (let l = 0; l < o; l++)
        a[l] === `
` ? (h = 1, u += 1) : h += 1;
      return { column: h, line: u };
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
        let h = this.toString(), u = h.indexOf(o.word);
        u !== -1 && (p = this.positionInside(u, h), a = this.positionInside(u + o.word.length, h));
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
      return new i().raw(this, o, p);
    }
    remove() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }
    replaceWith(...o) {
      if (this.parent) {
        let p = this, a = !1;
        for (let h of o)
          h === this ? a = !0 : a ? (this.parent.insertAfter(p, h), p = h) : this.parent.insertBefore(p, h);
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
      let a = {}, h = p == null;
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
      return h && (a.inputs = [...p.keys()].map((l) => l.toJSON())), a;
    }
    toProxy() {
      return this.proxyCache || (this.proxyCache = new Proxy(this, this.getProxyProcessor())), this.proxyCache;
    }
    toString(o = n) {
      o.stringify && (o = o.stringify);
      let p = "";
      return o(this, (a) => {
        p += a;
      }), p;
    }
    warn(o, p, a) {
      let h = { node: this };
      for (let u in a) h[u] = a[u];
      return o.warn(p, h);
    }
    get proxyOf() {
      return this;
    }
  }
  return Fr = c, c.default = c, Fr;
}
var Ur, ji;
function Kt() {
  if (ji) return Ur;
  ji = 1;
  let e = Jt();
  class t extends e {
    constructor(i) {
      i && typeof i.value < "u" && typeof i.value != "string" && (i = { ...i, value: String(i.value) }), super(i), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return Ur = t, t.default = t, Ur;
}
var Br, Hi;
function Wc() {
  if (Hi) return Br;
  Hi = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return Br = { nanoid: (i = 21) => {
    let n = "", s = i;
    for (; s--; )
      n += e[Math.random() * 64 | 0];
    return n;
  }, customAlphabet: (i, n = 21) => (s = n) => {
    let c = "", d = s;
    for (; d--; )
      c += i[Math.random() * i.length | 0];
    return c;
  } }, Br;
}
var Wr, Vi;
function co() {
  if (Vi) return Wr;
  Vi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Re, { existsSync: r, readFileSync: i } = Re, { dirname: n, join: s } = Re;
  function c(o) {
    return Buffer ? Buffer.from(o, "base64").toString() : window.atob(o);
  }
  class d {
    constructor(p, a) {
      if (a.map === !1) return;
      this.loadAnnotation(p), this.inline = this.startWith(this.annotation, "data:");
      let h = a.map ? a.map.prev : void 0, u = this.loadMap(a.from, h);
      !this.mapFile && a.from && (this.mapFile = a.from), this.mapFile && (this.root = n(this.mapFile)), u && (this.text = u);
    }
    consumer() {
      return this.consumerCache || (this.consumerCache = new e(this.text)), this.consumerCache;
    }
    decodeInline(p) {
      let a = /^data:application\/json;charset=utf-?8;base64,/, h = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, l = /^data:application\/json,/;
      if (u.test(p) || l.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || h.test(p))
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
      let h = p.lastIndexOf(a.pop()), u = p.indexOf("*/", h);
      h > -1 && u > -1 && (this.annotation = this.getAnnotationURL(p.substring(h, u)));
    }
    loadFile(p) {
      if (this.root = n(p), r(p))
        return this.mapFile = p, i(p, "utf-8").toString().trim();
    }
    loadMap(p, a) {
      if (a === !1) return !1;
      if (a) {
        if (typeof a == "string")
          return a;
        if (typeof a == "function") {
          let h = a(p);
          if (h) {
            let u = this.loadFile(h);
            if (!u)
              throw new Error(
                "Unable to load previous source map: " + h.toString()
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
          let h = this.annotation;
          return p && (h = s(n(p), h)), this.loadFile(h);
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
  return Wr = d, d.default = d, Wr;
}
var qr, Gi;
function Zt() {
  if (Gi) return qr;
  Gi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Re, { fileURLToPath: r, pathToFileURL: i } = Re, { isAbsolute: n, resolve: s } = Re, { nanoid: c } = /* @__PURE__ */ Wc(), d = Re, o = Pn(), p = co(), a = Symbol("fromOffsetCache"), h = !!(e && t), u = !!(s && n);
  class l {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || n(g.from) ? this.file = g.from : this.file = s(g.from)), u && h) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let b = x.consumer().file;
          !this.file && b && (this.file = this.mapResolve(b));
        }
      }
      this.file || (this.id = "<input css " + c(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, b = {}) {
      let v, S, w;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let O = this.fromOffset(k.offset);
          g = O.line, x = O.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let O = this.fromOffset(E.offset);
          S = O.line, w = O.col;
        } else
          S = E.line, w = E.column;
      } else if (!x) {
        let k = this.fromOffset(g);
        g = k.line, x = k.col;
      }
      let y = this.origin(g, x, S, w);
      return y ? v = new o(
        f,
        y.endLine === void 0 ? y.line : { column: y.column, line: y.line },
        y.endLine === void 0 ? y.column : { column: y.endColumn, line: y.endLine },
        y.source,
        y.file,
        b.plugin
      ) : v = new o(
        f,
        S === void 0 ? g : { column: x, line: g },
        S === void 0 ? x : { column: w, line: S },
        this.css,
        this.file,
        b.plugin
      ), v.input = { column: x, endColumn: w, endLine: S, line: g, source: this.css }, this.file && (i && (v.input.url = i(this.file).toString()), v.input.file = this.file), v;
    }
    fromOffset(f) {
      let g, x;
      if (this[a])
        x = this[a];
      else {
        let v = this.css.split(`
`);
        x = new Array(v.length);
        let S = 0;
        for (let w = 0, y = v.length; w < y; w++)
          x[w] = S, S += v[w].length + 1;
        this[a] = x;
      }
      g = x[x.length - 1];
      let b = 0;
      if (f >= g)
        b = x.length - 1;
      else {
        let v = x.length - 2, S;
        for (; b < v; )
          if (S = b + (v - b >> 1), f < x[S])
            v = S - 1;
          else if (f >= x[S + 1])
            b = S + 1;
          else {
            b = S;
            break;
          }
      }
      return {
        col: f - x[b] + 1,
        line: b + 1
      };
    }
    mapResolve(f) {
      return /^\w+:\/\//.test(f) ? f : s(this.map.consumer().sourceRoot || this.map.root || ".", f);
    }
    origin(f, g, x, b) {
      if (!this.map) return !1;
      let v = this.map.consumer(), S = v.originalPositionFor({ column: g, line: f });
      if (!S.source) return !1;
      let w;
      typeof x == "number" && (w = v.originalPositionFor({ column: b, line: x }));
      let y;
      n(S.source) ? y = i(S.source) : y = new URL(
        S.source,
        this.map.consumer().sourceRoot || i(this.map.mapFile)
      );
      let k = {
        column: S.column,
        endColumn: w && w.column,
        endLine: w && w.line,
        line: S.line,
        url: y.toString()
      };
      if (y.protocol === "file:")
        if (r)
          k.file = r(y);
        else
          throw new Error("file: protocol is not available in this PostCSS build");
      let E = v.sourceContentFor(S.source);
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
  return qr = l, l.default = l, d && d.registerInput && d.registerInput(l), qr;
}
var jr, Yi;
function uo() {
  if (Yi) return jr;
  Yi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = Re, { dirname: r, relative: i, resolve: n, sep: s } = Re, { pathToFileURL: c } = Re, d = Zt(), o = !!(e && t), p = !!(r && n && i && s);
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
      this.stringify(this.root, (b, v, S) => {
        if (this.css += b, v && S !== "end" && (f.generated.line = u, f.generated.column = l - 1, v.source && v.source.start ? (f.source = this.sourcePath(v), f.original.line = v.source.start.line, f.original.column = v.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = b.match(/\n/g), g ? (u += g.length, x = b.lastIndexOf(`
`), l = b.length - x) : l += b.length, v && S !== "start") {
          let w = v.parent || { raws: {} };
          (!(v.type === "decl" || v.type === "atrule" && !v.nodes) || v !== w.last || w.raws.semicolon) && (v.source && v.source.end ? (f.source = this.sourcePath(v), f.original.line = v.source.end.line, f.original.column = v.source.end.column - 1, f.generated.line = u, f.generated.column = l - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = l - 1, this.map.addMapping(f)));
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
      typeof this.mapOpts.annotation == "string" && (m = r(n(m, this.mapOpts.annotation)));
      let f = i(m, u);
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
          let u = new d(this.originalCSS, this.opts);
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
  return jr = a, jr;
}
var Hr, Xi;
function Qt() {
  if (Xi) return Hr;
  Xi = 1;
  let e = Jt();
  class t extends e {
    constructor(i) {
      super(i), this.type = "comment";
    }
  }
  return Hr = t, t.default = t, Hr;
}
var Vr, Ji;
function je() {
  if (Ji) return Vr;
  Ji = 1;
  let { isClean: e, my: t } = Tn(), r = Kt(), i = Qt(), n = Jt(), s, c, d, o;
  function p(u) {
    return u.map((l) => (l.nodes && (l.nodes = p(l.nodes)), delete l.source, l));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let l of u.proxyOf.nodes)
        a(l);
  }
  class h extends n {
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
            ...f.map((g) => typeof g == "function" ? (x, b) => g(x.toProxy(), b) : g)
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
      for (let b of g) this.proxyOf.nodes.splice(f + 1, 0, b);
      let x;
      for (let b in this.indexes)
        x = this.indexes[b], f < x && (this.indexes[b] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(l, m) {
      let f = this.index(l), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(l);
      for (let v of x) this.proxyOf.nodes.splice(f, 0, v);
      let b;
      for (let v in this.indexes)
        b = this.indexes[v], f <= b && (this.indexes[v] = b + x.length);
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
        l = [new d(l)];
      else if (l.text)
        l = [new i(l)];
      else
        throw new Error("Unknown node type in node creation");
      return l.map((g) => (g[t] || h.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
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
  return h.registerParse = (u) => {
    s = u;
  }, h.registerRule = (u) => {
    c = u;
  }, h.registerAtRule = (u) => {
    d = u;
  }, h.registerRoot = (u) => {
    o = u;
  }, Vr = h, h.default = h, h.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, d.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, c.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, i.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((l) => {
      h.rebuild(l);
    });
  }, Vr;
}
var Gr, Ki;
function Nn() {
  if (Ki) return Gr;
  Ki = 1;
  let e = je(), t, r;
  class i extends e {
    constructor(s) {
      super({ type: "document", ...s }), this.nodes || (this.nodes = []);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, Gr = i, i.default = i, Gr;
}
var Yr, Zi;
function ho() {
  if (Zi) return Yr;
  Zi = 1;
  let e = {};
  return Yr = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, Yr;
}
var Xr, Qi;
function po() {
  if (Qi) return Xr;
  Qi = 1;
  class e {
    constructor(r, i = {}) {
      if (this.type = "warning", this.text = r, i.node && i.node.source) {
        let n = i.node.rangeBy(i);
        this.line = n.start.line, this.column = n.start.column, this.endLine = n.end.line, this.endColumn = n.end.column;
      }
      for (let n in i) this[n] = i[n];
    }
    toString() {
      return this.node ? this.node.error(this.text, {
        index: this.index,
        plugin: this.plugin,
        word: this.word
      }).message : this.plugin ? this.plugin + ": " + this.text : this.text;
    }
  }
  return Xr = e, e.default = e, Xr;
}
var Jr, es;
function _n() {
  if (es) return Jr;
  es = 1;
  let e = po();
  class t {
    constructor(i, n, s) {
      this.processor = i, this.messages = [], this.root = n, this.opts = s, this.css = void 0, this.map = void 0;
    }
    toString() {
      return this.css;
    }
    warn(i, n = {}) {
      n.plugin || this.lastPlugin && this.lastPlugin.postcssPlugin && (n.plugin = this.lastPlugin.postcssPlugin);
      let s = new e(i, n);
      return this.messages.push(s), s;
    }
    warnings() {
      return this.messages.filter((i) => i.type === "warning");
    }
    get content() {
      return this.css;
    }
  }
  return Jr = t, t.default = t, Jr;
}
var Kr, ts;
function qc() {
  if (ts) return Kr;
  ts = 1;
  const e = 39, t = 34, r = 92, i = 47, n = 10, s = 32, c = 12, d = 9, o = 13, p = 91, a = 93, h = 40, u = 41, l = 123, m = 125, f = 59, g = 42, x = 58, b = 64, v = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, w = /.[\r\n"'(/\\]/, y = /[\da-f]/i;
  return Kr = function(E, O = {}) {
    let M = E.css.valueOf(), D = O.ignoreErrors, A, C, ye, ae, X, W, J, ie, Q, Y, Se = M.length, R = 0, xe = [], ue = [];
    function _() {
      return R;
    }
    function N(L) {
      throw E.error("Unclosed " + L, R);
    }
    function z() {
      return ue.length === 0 && R >= Se;
    }
    function T(L) {
      if (ue.length) return ue.pop();
      if (R >= Se) return;
      let $ = L ? L.ignoreUnclosed : !1;
      switch (A = M.charCodeAt(R), A) {
        case n:
        case s:
        case d:
        case o:
        case c: {
          C = R;
          do
            C += 1, A = M.charCodeAt(C);
          while (A === s || A === n || A === d || A === o || A === c);
          Y = ["space", M.slice(R, C)], R = C - 1;
          break;
        }
        case p:
        case a:
        case l:
        case m:
        case x:
        case f:
        case u: {
          let P = String.fromCharCode(A);
          Y = [P, P, R];
          break;
        }
        case h: {
          if (ie = xe.length ? xe.pop()[1] : "", Q = M.charCodeAt(R + 1), ie === "url" && Q !== e && Q !== t && Q !== s && Q !== n && Q !== d && Q !== c && Q !== o) {
            C = R;
            do {
              if (W = !1, C = M.indexOf(")", C + 1), C === -1)
                if (D || $) {
                  C = R;
                  break;
                } else
                  N("bracket");
              for (J = C; M.charCodeAt(J - 1) === r; )
                J -= 1, W = !W;
            } while (W);
            Y = ["brackets", M.slice(R, C + 1), R, C], R = C;
          } else
            C = M.indexOf(")", R + 1), ae = M.slice(R, C + 1), C === -1 || w.test(ae) ? Y = ["(", "(", R] : (Y = ["brackets", ae, R, C], R = C);
          break;
        }
        case e:
        case t: {
          ye = A === e ? "'" : '"', C = R;
          do {
            if (W = !1, C = M.indexOf(ye, C + 1), C === -1)
              if (D || $) {
                C = R + 1;
                break;
              } else
                N("string");
            for (J = C; M.charCodeAt(J - 1) === r; )
              J -= 1, W = !W;
          } while (W);
          Y = ["string", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case b: {
          v.lastIndex = R + 1, v.test(M), v.lastIndex === 0 ? C = M.length - 1 : C = v.lastIndex - 2, Y = ["at-word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        case r: {
          for (C = R, X = !0; M.charCodeAt(C + 1) === r; )
            C += 1, X = !X;
          if (A = M.charCodeAt(C + 1), X && A !== i && A !== s && A !== n && A !== d && A !== o && A !== c && (C += 1, y.test(M.charAt(C)))) {
            for (; y.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          Y = ["word", M.slice(R, C + 1), R, C], R = C;
          break;
        }
        default: {
          A === i && M.charCodeAt(R + 1) === g ? (C = M.indexOf("*/", R + 2) + 1, C === 0 && (D || $ ? C = M.length : N("comment")), Y = ["comment", M.slice(R, C + 1), R, C], R = C) : (S.lastIndex = R + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, Y = ["word", M.slice(R, C + 1), R, C], xe.push(Y), R = C);
          break;
        }
      }
      return R++, Y;
    }
    function q(L) {
      ue.push(L);
    }
    return {
      back: q,
      endOfFile: z,
      nextToken: T,
      position: _
    };
  }, Kr;
}
var Zr, rs;
function $n() {
  if (rs) return Zr;
  rs = 1;
  let e = je();
  class t extends e {
    constructor(i) {
      super(i), this.type = "atrule";
    }
    append(...i) {
      return this.proxyOf.nodes || (this.nodes = []), super.append(...i);
    }
    prepend(...i) {
      return this.proxyOf.nodes || (this.nodes = []), super.prepend(...i);
    }
  }
  return Zr = t, t.default = t, e.registerAtRule(t), Zr;
}
var Qr, ns;
function ft() {
  if (ns) return Qr;
  ns = 1;
  let e = je(), t, r;
  class i extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, c, d) {
      let o = super.normalize(s);
      if (c) {
        if (d === "prepend")
          this.nodes.length > 1 ? c.raws.before = this.nodes[1].raws.before : delete c.raws.before;
        else if (this.first !== c)
          for (let p of o)
            p.raws.before = c.raws.before;
      }
      return o;
    }
    removeChild(s, c) {
      let d = this.index(s);
      return !c && d === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[d].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, Qr = i, i.default = i, e.registerRoot(i), Qr;
}
var en, is;
function fo() {
  if (is) return en;
  is = 1;
  let e = {
    comma(t) {
      return e.split(t, [","], !0);
    },
    space(t) {
      let r = [" ", `
`, "	"];
      return e.split(t, r);
    },
    split(t, r, i) {
      let n = [], s = "", c = !1, d = 0, o = !1, p = "", a = !1;
      for (let h of t)
        a ? a = !1 : h === "\\" ? a = !0 : o ? h === p && (o = !1) : h === '"' || h === "'" ? (o = !0, p = h) : h === "(" ? d += 1 : h === ")" ? d > 0 && (d -= 1) : d === 0 && r.includes(h) && (c = !0), c ? (s !== "" && n.push(s.trim()), s = "", c = !1) : s += h;
      return (i || s !== "") && n.push(s.trim()), n;
    }
  };
  return en = e, e.default = e, en;
}
var tn, ss;
function Dn() {
  if (ss) return tn;
  ss = 1;
  let e = je(), t = fo();
  class r extends e {
    constructor(n) {
      super(n), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(n) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, c = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = n.join(c);
    }
  }
  return tn = r, r.default = r, e.registerRule(r), tn;
}
var rn, os;
function jc() {
  if (os) return rn;
  os = 1;
  let e = Kt(), t = qc(), r = Qt(), i = $n(), n = ft(), s = Dn();
  const c = {
    empty: !0,
    space: !0
  };
  function d(p) {
    for (let a = p.length - 1; a >= 0; a--) {
      let h = p[a], u = h[3] || h[2];
      if (u) return u;
    }
  }
  class o {
    constructor(a) {
      this.input = a, this.root = new n(), this.current = this.root, this.spaces = "", this.semicolon = !1, this.createTokenizer(), this.root.source = { input: a, start: { column: 1, line: 1, offset: 0 } };
    }
    atrule(a) {
      let h = new i();
      h.name = a[1].slice(1), h.name === "" && this.unnamedAtrule(h, a), this.init(h, a[2]);
      let u, l, m, f = !1, g = !1, x = [], b = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? b.push(u === "(" ? ")" : "]") : u === "{" && b.length > 0 ? b.push("}") : u === b[b.length - 1] && b.pop(), b.length === 0)
          if (u === ";") {
            h.source.end = this.getPosition(a[2]), h.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, l = x[m]; l && l[0] === "space"; )
                l = x[--m];
              l && (h.source.end = this.getPosition(l[3] || l[2]), h.source.end.offset++);
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
      h.raws.between = this.spacesAndCommentsFromEnd(x), x.length ? (h.raws.afterName = this.spacesAndCommentsFromStart(x), this.raw(h, "params", x), f && (a = x[x.length - 1], h.source.end = this.getPosition(a[3] || a[2]), h.source.end.offset++, this.spaces = h.raws.between, h.raws.between = "")) : (h.raws.afterName = "", h.params = ""), g && (h.nodes = [], this.current = h);
    }
    checkMissedSemicolon(a) {
      let h = this.colon(a);
      if (h === !1) return;
      let u = 0, l;
      for (let m = h - 1; m >= 0 && (l = a[m], !(l[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        l[0] === "word" ? l[3] + 1 : l[2]
      );
    }
    colon(a) {
      let h = 0, u, l, m;
      for (let [f, g] of a.entries()) {
        if (u = g, l = u[0], l === "(" && (h += 1), l === ")" && (h -= 1), h === 0 && l === ":")
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
      let h = new r();
      this.init(h, a[2]), h.source.end = this.getPosition(a[3] || a[2]), h.source.end.offset++;
      let u = a[1].slice(2, -2);
      if (/^\s*$/.test(u))
        h.text = "", h.raws.left = u, h.raws.right = "";
      else {
        let l = u.match(/^(\s*)([^]*\S)(\s*)$/);
        h.text = l[2], h.raws.left = l[1], h.raws.right = l[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, h) {
      let u = new e();
      this.init(u, a[0][2]);
      let l = a[a.length - 1];
      for (l[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        l[3] || l[2] || d(a)
      ), u.source.end.offset++; a[0][0] !== "word"; )
        a.length === 1 && this.unknownWord(a), u.raws.before += a.shift()[1];
      for (u.source.start = this.getPosition(a[0][2]), u.prop = ""; a.length; ) {
        let b = a[0][0];
        if (b === ":" || b === "space" || b === "comment")
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
      for (let b = a.length - 1; b >= 0; b--) {
        if (m = a[b], m[1].toLowerCase() === "!important") {
          u.important = !0;
          let v = this.stringFrom(a, b);
          v = this.spacesFromEnd(a) + v, v !== " !important" && (u.raws.important = v);
          break;
        } else if (m[1].toLowerCase() === "important") {
          let v = a.slice(0), S = "";
          for (let w = b; w > 0; w--) {
            let y = v[w][0];
            if (S.trim().indexOf("!") === 0 && y !== "space")
              break;
            S = v.pop()[1] + S;
          }
          S.trim().indexOf("!") === 0 && (u.important = !0, u.raws.important = S, a = v);
        }
        if (m[0] !== "space" && m[0] !== "comment")
          break;
      }
      a.some((b) => b[0] !== "space" && b[0] !== "comment") && (u.raws.between += f.map((b) => b[1]).join(""), f = []), this.raw(u, "value", f.concat(a), h), u.value.includes(":") && !h && this.checkMissedSemicolon(a);
    }
    doubleColon(a) {
      throw this.input.error(
        "Double colon",
        { offset: a[2] },
        { offset: a[2] + a[1].length }
      );
    }
    emptyRule(a) {
      let h = new s();
      this.init(h, a[2]), h.selector = "", h.raws.between = "", this.current = h;
    }
    end(a) {
      this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.semicolon = !1, this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.spaces = "", this.current.parent ? (this.current.source.end = this.getPosition(a[2]), this.current.source.end.offset++, this.current = this.current.parent) : this.unexpectedClose(a);
    }
    endFile() {
      this.current.parent && this.unclosedBlock(), this.current.nodes && this.current.nodes.length && (this.current.raws.semicolon = this.semicolon), this.current.raws.after = (this.current.raws.after || "") + this.spaces, this.root.source.end = this.getPosition(this.tokenizer.position());
    }
    freeSemicolon(a) {
      if (this.spaces += a[1], this.current.nodes) {
        let h = this.current.nodes[this.current.nodes.length - 1];
        h && h.type === "rule" && !h.raws.ownSemicolon && (h.raws.ownSemicolon = this.spaces, this.spaces = "");
      }
    }
    // Helpers
    getPosition(a) {
      let h = this.input.fromOffset(a);
      return {
        column: h.col,
        line: h.line,
        offset: a
      };
    }
    init(a, h) {
      this.current.push(a), a.source = {
        input: this.input,
        start: this.getPosition(h)
      }, a.raws.before = this.spaces, this.spaces = "", a.type !== "comment" && (this.semicolon = !1);
    }
    other(a) {
      let h = !1, u = null, l = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], b = a;
      for (; b; ) {
        if (u = b[0], x.push(b), u === "(" || u === "[")
          m || (m = b), f.push(u === "(" ? ")" : "]");
        else if (g && l && u === "{")
          m || (m = b), f.push("}");
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
            this.tokenizer.back(x.pop()), h = !0;
            break;
          } else u === ":" && (l = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        b = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (h = !0), f.length > 0 && this.unclosedBracket(m), h && l) {
        if (!g)
          for (; x.length && (b = x[x.length - 1][0], !(b !== "space" && b !== "comment")); )
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
    raw(a, h, u, l) {
      let m, f, g = u.length, x = "", b = !0, v, S;
      for (let w = 0; w < g; w += 1)
        m = u[w], f = m[0], f === "space" && w === g - 1 && !l ? b = !1 : f === "comment" ? (S = u[w - 1] ? u[w - 1][0] : "empty", v = u[w + 1] ? u[w + 1][0] : "empty", !c[S] && !c[v] ? x.slice(-1) === "," ? b = !1 : x += m[1] : b = !1) : x += m[1];
      if (!b) {
        let w = u.reduce((y, k) => y + k[1], "");
        a.raws[h] = { raw: w, value: x };
      }
      a[h] = x;
    }
    rule(a) {
      a.pop();
      let h = new s();
      this.init(h, a[0][2]), h.raws.between = this.spacesAndCommentsFromEnd(a), this.raw(h, "selector", a), this.current = h;
    }
    spacesAndCommentsFromEnd(a) {
      let h, u = "";
      for (; a.length && (h = a[a.length - 1][0], !(h !== "space" && h !== "comment")); )
        u = a.pop()[1] + u;
      return u;
    }
    // Errors
    spacesAndCommentsFromStart(a) {
      let h, u = "";
      for (; a.length && (h = a[0][0], !(h !== "space" && h !== "comment")); )
        u += a.shift()[1];
      return u;
    }
    spacesFromEnd(a) {
      let h, u = "";
      for (; a.length && (h = a[a.length - 1][0], h === "space"); )
        u = a.pop()[1] + u;
      return u;
    }
    stringFrom(a, h) {
      let u = "";
      for (let l = h; l < a.length; l++)
        u += a[l][1];
      return a.splice(h, a.length - h), u;
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
    unnamedAtrule(a, h) {
      throw this.input.error(
        "At-rule without name",
        { offset: h[2] },
        { offset: h[2] + h[1].length }
      );
    }
  }
  return rn = o, rn;
}
var nn, as;
function zn() {
  if (as) return nn;
  as = 1;
  let e = je(), t = jc(), r = Zt();
  function i(n, s) {
    let c = new r(n, s), d = new t(c);
    try {
      d.parse();
    } catch (o) {
      throw process.env.NODE_ENV !== "production" && o.name === "CssSyntaxError" && s && s.from && (/\.scss$/i.test(s.from) ? o.message += `
You tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser` : /\.sass/i.test(s.from) ? o.message += `
You tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser` : /\.less$/i.test(s.from) && (o.message += `
You tried to parse Less with the standard CSS parser; try again with the postcss-less parser`)), o;
    }
    return d.root;
  }
  return nn = i, i.default = i, e.registerParse(i), nn;
}
var sn, ls;
function mo() {
  if (ls) return sn;
  ls = 1;
  let { isClean: e, my: t } = Tn(), r = uo(), i = Xt(), n = je(), s = Nn(), c = ho(), d = _n(), o = zn(), p = ft();
  const a = {
    atrule: "AtRule",
    comment: "Comment",
    decl: "Declaration",
    document: "Document",
    root: "Root",
    rule: "Rule"
  }, h = {
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
    let w = !1, y = a[S.type];
    return S.type === "decl" ? w = S.prop.toLowerCase() : S.type === "atrule" && (w = S.name.toLowerCase()), w && S.append ? [
      y,
      y + "-" + w,
      l,
      y + "Exit",
      y + "Exit-" + w
    ] : w ? [y, y + "-" + w, y + "Exit", y + "Exit-" + w] : S.append ? [y, l, y + "Exit"] : [y, y + "Exit"];
  }
  function g(S) {
    let w;
    return S.type === "document" ? w = ["Document", l, "DocumentExit"] : S.type === "root" ? w = ["Root", l, "RootExit"] : w = f(S), {
      eventIndex: 0,
      events: w,
      iterator: 0,
      node: S,
      visitorIndex: 0,
      visitors: []
    };
  }
  function x(S) {
    return S[e] = !1, S.nodes && S.nodes.forEach((w) => x(w)), S;
  }
  let b = {};
  class v {
    constructor(w, y, k) {
      this.stringified = !1, this.processed = !1;
      let E;
      if (typeof y == "object" && y !== null && (y.type === "root" || y.type === "document"))
        E = x(y);
      else if (y instanceof v || y instanceof d)
        E = x(y.root), y.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = y.map);
      else {
        let O = o;
        k.syntax && (O = k.syntax.parse), k.parser && (O = k.parser), O.parse && (O = O.parse);
        try {
          E = O(y, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && n.rebuild(E);
      }
      this.result = new d(w, E, k), this.helpers = { ...b, postcss: b, result: this.result }, this.plugins = this.processor.plugins.map((O) => typeof O == "object" && O.prepare ? { ...O, ...O.prepare(this.result) } : O);
    }
    async() {
      return this.error ? Promise.reject(this.error) : this.processed ? Promise.resolve(this.result) : (this.processing || (this.processing = this.runAsync()), this.processing);
    }
    catch(w) {
      return this.async().catch(w);
    }
    finally(w) {
      return this.async().then(w, w);
    }
    getAsyncError() {
      throw new Error("Use process(css).then(cb) to work with async plugins");
    }
    handleError(w, y) {
      let k = this.result.lastPlugin;
      try {
        if (y && y.addToError(w), this.error = w, w.name === "CssSyntaxError" && !w.plugin)
          w.plugin = k.postcssPlugin, w.setMessage();
        else if (k.postcssVersion && process.env.NODE_ENV !== "production") {
          let E = k.postcssPlugin, O = k.postcssVersion, M = this.result.processor.version, D = O.split("."), A = M.split(".");
          (D[0] !== A[0] || parseInt(D[1]) > parseInt(A[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + O + ". Perhaps this is the source of the error below."
          );
        }
      } catch (E) {
        console && console.error && console.error(E);
      }
      return w;
    }
    prepareVisitors() {
      this.listeners = {};
      let w = (y, k, E) => {
        this.listeners[k] || (this.listeners[k] = []), this.listeners[k].push([y, E]);
      };
      for (let y of this.plugins)
        if (typeof y == "object")
          for (let k in y) {
            if (!h[k] && /^[A-Z]/.test(k))
              throw new Error(
                `Unknown event ${k} in ${y.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
              );
            if (!u[k])
              if (typeof y[k] == "object")
                for (let E in y[k])
                  E === "*" ? w(y, k, y[k][E]) : w(
                    y,
                    k + "-" + E.toLowerCase(),
                    y[k][E]
                  );
              else typeof y[k] == "function" && w(y, k, y[k]);
          }
      this.hasListener = Object.keys(this.listeners).length > 0;
    }
    async runAsync() {
      this.plugin = 0;
      for (let w = 0; w < this.plugins.length; w++) {
        let y = this.plugins[w], k = this.runOnRoot(y);
        if (m(k))
          try {
            await k;
          } catch (E) {
            throw this.handleError(E);
          }
      }
      if (this.prepareVisitors(), this.hasListener) {
        let w = this.result.root;
        for (; !w[e]; ) {
          w[e] = !0;
          let y = [g(w)];
          for (; y.length > 0; ) {
            let k = this.visitTick(y);
            if (m(k))
              try {
                await k;
              } catch (E) {
                let O = y[y.length - 1].node;
                throw this.handleError(E, O);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [y, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = y;
            try {
              if (w.type === "document") {
                let E = w.nodes.map(
                  (O) => k(O, this.helpers)
                );
                await Promise.all(E);
              } else
                await k(w, this.helpers);
            } catch (E) {
              throw this.handleError(E);
            }
          }
      }
      return this.processed = !0, this.stringify();
    }
    runOnRoot(w) {
      this.result.lastPlugin = w;
      try {
        if (typeof w == "object" && w.Once) {
          if (this.result.root.type === "document") {
            let y = this.result.root.nodes.map(
              (k) => w.Once(k, this.helpers)
            );
            return m(y[0]) ? Promise.all(y) : y;
          }
          return w.Once(this.result.root, this.helpers);
        } else if (typeof w == "function")
          return w(this.result.root, this.result);
      } catch (y) {
        throw this.handleError(y);
      }
    }
    stringify() {
      if (this.error) throw this.error;
      if (this.stringified) return this.result;
      this.stringified = !0, this.sync();
      let w = this.result.opts, y = i;
      w.syntax && (y = w.syntax.stringify), w.stringifier && (y = w.stringifier), y.stringify && (y = y.stringify);
      let E = new r(y, this.result.root, this.result.opts).generate();
      return this.result.css = E[0], this.result.map = E[1], this.result;
    }
    sync() {
      if (this.error) throw this.error;
      if (this.processed) return this.result;
      if (this.processed = !0, this.processing)
        throw this.getAsyncError();
      for (let w of this.plugins) {
        let y = this.runOnRoot(w);
        if (m(y))
          throw this.getAsyncError();
      }
      if (this.prepareVisitors(), this.hasListener) {
        let w = this.result.root;
        for (; !w[e]; )
          w[e] = !0, this.walkSync(w);
        if (this.listeners.OnceExit)
          if (w.type === "document")
            for (let y of w.nodes)
              this.visitSync(this.listeners.OnceExit, y);
          else
            this.visitSync(this.listeners.OnceExit, w);
      }
      return this.result;
    }
    then(w, y) {
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || c(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(w, y);
    }
    toString() {
      return this.css;
    }
    visitSync(w, y) {
      for (let [k, E] of w) {
        this.result.lastPlugin = k;
        let O;
        try {
          O = E(y, this.helpers);
        } catch (M) {
          throw this.handleError(M, y.proxyOf);
        }
        if (y.type !== "root" && y.type !== "document" && !y.parent)
          return !0;
        if (m(O))
          throw this.getAsyncError();
      }
    }
    visitTick(w) {
      let y = w[w.length - 1], { node: k, visitors: E } = y;
      if (k.type !== "root" && k.type !== "document" && !k.parent) {
        w.pop();
        return;
      }
      if (E.length > 0 && y.visitorIndex < E.length) {
        let [M, D] = E[y.visitorIndex];
        y.visitorIndex += 1, y.visitorIndex === E.length && (y.visitors = [], y.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return D(k.toProxy(), this.helpers);
        } catch (A) {
          throw this.handleError(A, k);
        }
      }
      if (y.iterator !== 0) {
        let M = y.iterator, D;
        for (; D = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !D[e]) {
            D[e] = !0, w.push(g(D));
            return;
          }
        y.iterator = 0, delete k.indexes[M];
      }
      let O = y.events;
      for (; y.eventIndex < O.length; ) {
        let M = O[y.eventIndex];
        if (y.eventIndex += 1, M === l) {
          k.nodes && k.nodes.length && (k[e] = !0, y.iterator = k.getIterator());
          return;
        } else if (this.listeners[M]) {
          y.visitors = this.listeners[M];
          return;
        }
      }
      w.pop();
    }
    walkSync(w) {
      w[e] = !0;
      let y = f(w);
      for (let k of y)
        if (k === l)
          w.nodes && w.each((E) => {
            E[e] || this.walkSync(E);
          });
        else {
          let E = this.listeners[k];
          if (E && this.visitSync(E, w.toProxy()))
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
  return v.registerPostcss = (S) => {
    b = S;
  }, sn = v, v.default = v, p.registerLazyResult(v), s.registerLazyResult(v), sn;
}
var on, cs;
function Hc() {
  if (cs) return on;
  cs = 1;
  let e = uo(), t = Xt(), r = ho(), i = zn();
  const n = _n();
  class s {
    constructor(d, o, p) {
      o = o.toString(), this.stringified = !1, this._processor = d, this._css = o, this._opts = p, this._map = void 0;
      let a, h = t;
      this.result = new n(this._processor, a, this._opts), this.result.css = o;
      let u = this;
      Object.defineProperty(this.result, "root", {
        get() {
          return u.root;
        }
      });
      let l = new e(h, a, this._opts, o);
      if (l.isMap()) {
        let [m, f] = l.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        l.clearAnnotation(), this.result.css = l.css;
    }
    async() {
      return this.error ? Promise.reject(this.error) : Promise.resolve(this.result);
    }
    catch(d) {
      return this.async().catch(d);
    }
    finally(d) {
      return this.async().then(d, d);
    }
    sync() {
      if (this.error) throw this.error;
      return this.result;
    }
    then(d, o) {
      return process.env.NODE_ENV !== "production" && ("from" in this._opts || r(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(d, o);
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
      let d, o = i;
      try {
        d = o(this._css, this._opts);
      } catch (p) {
        this.error = p;
      }
      if (this.error)
        throw this.error;
      return this._root = d, d;
    }
    get [Symbol.toStringTag]() {
      return "NoWorkResult";
    }
  }
  return on = s, s.default = s, on;
}
var an, us;
function Vc() {
  if (us) return an;
  us = 1;
  let e = Hc(), t = mo(), r = Nn(), i = ft();
  class n {
    constructor(c = []) {
      this.version = "8.4.38", this.plugins = this.normalize(c);
    }
    normalize(c) {
      let d = [];
      for (let o of c)
        if (o.postcss === !0 ? o = o() : o.postcss && (o = o.postcss), typeof o == "object" && Array.isArray(o.plugins))
          d = d.concat(o.plugins);
        else if (typeof o == "object" && o.postcssPlugin)
          d.push(o);
        else if (typeof o == "function")
          d.push(o);
        else if (typeof o == "object" && (o.parse || o.stringify)) {
          if (process.env.NODE_ENV !== "production")
            throw new Error(
              "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
            );
        } else
          throw new Error(o + " is not a PostCSS plugin");
      return d;
    }
    process(c, d = {}) {
      return !this.plugins.length && !d.parser && !d.stringifier && !d.syntax ? new e(this, c, d) : new t(this, c, d);
    }
    use(c) {
      return this.plugins = this.plugins.concat(this.normalize([c])), this;
    }
  }
  return an = n, n.default = n, i.registerProcessor(n), r.registerProcessor(n), an;
}
var ln, hs;
function Gc() {
  if (hs) return ln;
  hs = 1;
  let e = Kt(), t = co(), r = Qt(), i = $n(), n = Zt(), s = ft(), c = Dn();
  function d(o, p) {
    if (Array.isArray(o)) return o.map((u) => d(u));
    let { inputs: a, ...h } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let l = { ...u, __proto__: n.prototype };
        l.map && (l.map = {
          ...l.map,
          __proto__: t.prototype
        }), p.push(l);
      }
    }
    if (h.nodes && (h.nodes = o.nodes.map((u) => d(u, p))), h.source) {
      let { inputId: u, ...l } = h.source;
      h.source = l, u != null && (h.source.input = p[u]);
    }
    if (h.type === "root")
      return new s(h);
    if (h.type === "decl")
      return new e(h);
    if (h.type === "rule")
      return new c(h);
    if (h.type === "comment")
      return new r(h);
    if (h.type === "atrule")
      return new i(h);
    throw new Error("Unknown node type: " + o.type);
  }
  return ln = d, d.default = d, ln;
}
var cn, ds;
function Yc() {
  if (ds) return cn;
  ds = 1;
  let e = Pn(), t = Kt(), r = mo(), i = je(), n = Vc(), s = Xt(), c = Gc(), d = Nn(), o = po(), p = Qt(), a = $n(), h = _n(), u = Zt(), l = zn(), m = fo(), f = Dn(), g = ft(), x = Jt();
  function b(...v) {
    return v.length === 1 && Array.isArray(v[0]) && (v = v[0]), new n(v);
  }
  return b.plugin = function(S, w) {
    let y = !1;
    function k(...O) {
      console && console.warn && !y && (y = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = w(...O);
      return M.postcssPlugin = S, M.postcssVersion = new n().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(O, M, D) {
      return b([k(D)]).process(O, M);
    }, k;
  }, b.stringify = s, b.parse = l, b.fromJSON = c, b.list = m, b.comment = (v) => new p(v), b.atRule = (v) => new a(v), b.decl = (v) => new t(v), b.rule = (v) => new f(v), b.root = (v) => new g(v), b.document = (v) => new d(v), b.CssSyntaxError = e, b.Declaration = t, b.Container = i, b.Processor = n, b.Document = d, b.Comment = p, b.Warning = o, b.AtRule = a, b.Result = h, b.Input = u, b.Rule = f, b.Root = g, b.Node = x, r.registerPostcss(b), cn = b, b.default = b, cn;
}
var Xc = Yc();
const re = /* @__PURE__ */ Dc(Xc);
re.stringify;
re.fromJSON;
re.plugin;
re.parse;
re.list;
re.document;
re.comment;
re.atRule;
re.rule;
re.decl;
re.root;
re.CssSyntaxError;
re.Declaration;
re.Container;
re.Processor;
re.Document;
re.Comment;
re.Warning;
re.AtRule;
re.Result;
re.Input;
re.Rule;
re.Root;
re.Node;
class Fn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  constructor(...t) {
    ke(this, "parentElement", null), ke(this, "parentNode", null), ke(this, "ownerDocument"), ke(this, "firstChild", null), ke(this, "lastChild", null), ke(this, "previousSibling", null), ke(this, "nextSibling", null), ke(this, "ELEMENT_NODE", 1), ke(this, "TEXT_NODE", 3), ke(this, "nodeType"), ke(this, "nodeName"), ke(this, "RRNodeType");
  }
  get childNodes() {
    const t = [];
    let r = this.firstChild;
    for (; r; )
      t.push(r), r = r.nextSibling;
    return t;
  }
  contains(t) {
    if (t instanceof Fn) {
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
const ps = {
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
}, fs = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, Et = {}, go = {}, Jc = () => !!globalThis.Zone;
function Un(e) {
  if (Et[e])
    return Et[e];
  const t = globalThis[e], r = t.prototype, i = e in ps ? ps[e] : void 0, n = !!(i && // @ts-expect-error 2345
  i.every(
    (d) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, d)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in fs ? fs[e] : void 0, c = !!(s && s.every(
    // @ts-expect-error 2345
    (d) => {
      var o;
      return typeof r[d] == "function" && ((o = r[d]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (n && c && !Jc())
    return Et[e] = t.prototype, t.prototype;
  try {
    const d = document.createElement("iframe");
    d.style.display = "none", document.body.appendChild(d);
    const o = d.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return d.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (d.classList.add("rr-block"), d.setAttribute("__rrwebUntaintedMutationObserver", ""), go[e] = () => d.remove()) : d.remove(), Et[e] = p;
  } catch {
    return r;
  }
}
const un = {};
function Le(e, t, r) {
  var i;
  const n = `${e}.${String(r)}`;
  if (un[n])
    return un[n].call(
      t
    );
  const s = Un(e), c = (i = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : i.get;
  return c ? (un[n] = c, c.call(t)) : t[r];
}
const hn = {};
function yo(e, t, r) {
  const i = `${e}.${String(r)}`;
  if (hn[i])
    return hn[i].bind(
      t
    );
  const s = Un(e)[r];
  return typeof s != "function" ? t[r] : (hn[i] = s, s.bind(t));
}
function Kc(e) {
  return Le("Node", e, "ownerDocument");
}
function Zc(e) {
  return Le("Node", e, "childNodes");
}
function Qc(e) {
  return Le("Node", e, "parentNode");
}
function eu(e) {
  return Le("Node", e, "parentElement");
}
function tu(e) {
  return Le("Node", e, "textContent");
}
function ru(e, t) {
  return yo("Node", e, "contains")(t);
}
function nu(e) {
  return yo("Node", e, "getRootNode")();
}
function iu(e) {
  return !e || !("host" in e) ? null : Le("ShadowRoot", e, "host");
}
function su(e) {
  return e.styleSheets;
}
function ou(e) {
  return !e || !("shadowRoot" in e) ? null : Le("Element", e, "shadowRoot");
}
function au(e, t) {
  return Le("Element", e, "querySelector")(t);
}
function lu(e, t) {
  return Le("Element", e, "querySelectorAll")(t);
}
function bo() {
  return [
    Un("MutationObserver").constructor,
    go.MutationObserver ?? (() => {
    })
  ];
}
let ht = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (ht = () => (/* @__PURE__ */ new Date()).getTime());
function He(e, t, r) {
  try {
    if (!(t in e))
      return () => {
      };
    const i = e[t], n = r(i);
    return typeof n == "function" && (n.prototype = n.prototype || {}, Object.defineProperties(n, {
      __rrweb_original__: {
        enumerable: !1,
        value: i
      }
    })), e[t] = n, () => {
      e[t] = i;
    };
  } catch {
    return () => {
    };
  }
}
const B = {
  ownerDocument: Kc,
  childNodes: Zc,
  parentNode: Qc,
  parentElement: eu,
  textContent: tu,
  contains: ru,
  getRootNode: nu,
  host: iu,
  styleSheets: su,
  shadowRoot: ou,
  querySelector: au,
  querySelectorAll: lu,
  nowTimestamp: ht,
  mutationObserverCtor: bo,
  patch: He
};
function he(e, t, r = document) {
  const i = { capture: !0, passive: !0 };
  return r.addEventListener(e, t, i), () => r.removeEventListener(e, t, i);
}
const Ke = `Please stop import mirror directly. Instead of that,\r
now you can use replayer.getMirror() to access the mirror instance of a replayer,\r
or you can use record.mirror to access the mirror instance during recording.`;
let ms = {
  map: {},
  getId() {
    return console.error(Ke), -1;
  },
  getNode() {
    return console.error(Ke), null;
  },
  removeNodeFromMap() {
    console.error(Ke);
  },
  has() {
    return console.error(Ke), !1;
  },
  reset() {
    console.error(Ke);
  }
};
typeof window < "u" && window.Proxy && window.Reflect && (ms = new Proxy(ms, {
  get(e, t, r) {
    return t === "map" && console.error(Ke), Reflect.get(e, t, r);
  }
}));
function dt(e, t, r = {}) {
  let i = null, n = 0;
  return function(...s) {
    const c = Date.now();
    !n && r.leading === !1 && (n = c);
    const d = t - (c - n), o = this;
    d <= 0 || d > t ? (i && (clearTimeout(i), i = null), n = c, e.apply(o, s)) : !i && r.trailing !== !1 && (i = setTimeout(() => {
      n = r.leading === !1 ? 0 : Date.now(), i = null, e.apply(o, s);
    }, d));
  };
}
function er(e, t, r, i, n = window) {
  const s = n.Object.getOwnPropertyDescriptor(e, t);
  return n.Object.defineProperty(
    e,
    t,
    i ? r : {
      set(c) {
        setTimeout(() => {
          r.set.call(this, c);
        }, 0), s && s.set && s.set.call(this, c);
      }
    }
  ), () => er(e, t, s || {}, !0);
}
function vo(e) {
  var t, r, i, n;
  const s = e.document;
  return {
    left: s.scrollingElement ? s.scrollingElement.scrollLeft : e.pageXOffset !== void 0 ? e.pageXOffset : s.documentElement.scrollLeft || (s == null ? void 0 : s.body) && ((t = B.parentElement(s.body)) == null ? void 0 : t.scrollLeft) || ((r = s == null ? void 0 : s.body) == null ? void 0 : r.scrollLeft) || 0,
    top: s.scrollingElement ? s.scrollingElement.scrollTop : e.pageYOffset !== void 0 ? e.pageYOffset : (s == null ? void 0 : s.documentElement.scrollTop) || (s == null ? void 0 : s.body) && ((i = B.parentElement(s.body)) == null ? void 0 : i.scrollTop) || ((n = s == null ? void 0 : s.body) == null ? void 0 : n.scrollTop) || 0
  };
}
function wo() {
  return window.innerHeight || document.documentElement && document.documentElement.clientHeight || document.body && document.body.clientHeight;
}
function xo() {
  return window.innerWidth || document.documentElement && document.documentElement.clientWidth || document.body && document.body.clientWidth;
}
function ko(e) {
  return e ? e.nodeType === e.ELEMENT_NODE ? e : B.parentElement(e) : null;
}
function de(e, t, r, i) {
  if (!e)
    return !1;
  const n = ko(e);
  if (!n)
    return !1;
  try {
    if (typeof t == "string") {
      if (n.classList.contains(t) || i && n.closest("." + t) !== null) return !0;
    } else if (Dt(n, t, i)) return !0;
  } catch {
  }
  return !!(r && (n.matches(r) || i && n.closest(r) !== null));
}
function cu(e, t) {
  return t.getId(e) !== -1;
}
function dn(e, t, r) {
  return e.tagName === "TITLE" && r.headTitleMutations ? !0 : t.getId(e) === ut;
}
function So(e, t) {
  if (at(e))
    return !1;
  const r = t.getId(e);
  if (!t.has(r))
    return !0;
  const i = B.parentNode(e);
  return i && i.nodeType === e.DOCUMENT_NODE ? !1 : i ? So(i, t) : !0;
}
function yn(e) {
  return !!e.changedTouches;
}
function uu(e = window) {
  "NodeList" in e && !e.NodeList.prototype.forEach && (e.NodeList.prototype.forEach = Array.prototype.forEach), "DOMTokenList" in e && !e.DOMTokenList.prototype.forEach && (e.DOMTokenList.prototype.forEach = Array.prototype.forEach);
}
function Co(e, t) {
  return !!(e.nodeName === "IFRAME" && t.getMeta(e));
}
function Eo(e, t) {
  return !!(e.nodeName === "LINK" && e.nodeType === e.ELEMENT_NODE && e.getAttribute && e.getAttribute("rel") === "stylesheet" && t.getMeta(e));
}
function bn(e) {
  return e ? e instanceof Fn && "shadowRoot" in e ? !!e.shadowRoot : !!B.shadowRoot(e) : !1;
}
class hu {
  constructor() {
    I(this, "id", 1), I(this, "styleIDMap", /* @__PURE__ */ new WeakMap()), I(this, "idStyleMap", /* @__PURE__ */ new Map());
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
    let i;
    return r === void 0 ? i = this.id++ : i = r, this.styleIDMap.set(t, i), this.idStyleMap.set(i, t), i;
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
function Mo(e) {
  var t;
  let r = null;
  return "getRootNode" in e && ((t = B.getRootNode(e)) == null ? void 0 : t.nodeType) === Node.DOCUMENT_FRAGMENT_NODE && B.host(B.getRootNode(e)) && (r = B.host(B.getRootNode(e))), r;
}
function du(e) {
  let t = e, r;
  for (; r = Mo(t); )
    t = r;
  return t;
}
function pu(e) {
  const t = B.ownerDocument(e);
  if (!t) return !1;
  const r = du(e);
  return B.contains(t, r);
}
function Ro(e) {
  const t = B.ownerDocument(e);
  return t ? B.contains(t, e) || pu(e) : !1;
}
var G = /* @__PURE__ */ ((e) => (e[e.DomContentLoaded = 0] = "DomContentLoaded", e[e.Load = 1] = "Load", e[e.FullSnapshot = 2] = "FullSnapshot", e[e.IncrementalSnapshot = 3] = "IncrementalSnapshot", e[e.Meta = 4] = "Meta", e[e.Custom = 5] = "Custom", e[e.Plugin = 6] = "Plugin", e[e.Asset = 7] = "Asset", e))(G || {}), j = /* @__PURE__ */ ((e) => (e[e.Mutation = 0] = "Mutation", e[e.MouseMove = 1] = "MouseMove", e[e.MouseInteraction = 2] = "MouseInteraction", e[e.Scroll = 3] = "Scroll", e[e.ViewportResize = 4] = "ViewportResize", e[e.Input = 5] = "Input", e[e.TouchMove = 6] = "TouchMove", e[e.MediaInteraction = 7] = "MediaInteraction", e[e.StyleSheetRule = 8] = "StyleSheetRule", e[e.CanvasMutation = 9] = "CanvasMutation", e[e.Font = 10] = "Font", e[e.Log = 11] = "Log", e[e.Drag = 12] = "Drag", e[e.StyleDeclaration = 13] = "StyleDeclaration", e[e.Selection = 14] = "Selection", e[e.AdoptedStyleSheet = 15] = "AdoptedStyleSheet", e[e.CustomElement = 16] = "CustomElement", e))(j || {}), fe = /* @__PURE__ */ ((e) => (e[e.MouseUp = 0] = "MouseUp", e[e.MouseDown = 1] = "MouseDown", e[e.Click = 2] = "Click", e[e.ContextMenu = 3] = "ContextMenu", e[e.DblClick = 4] = "DblClick", e[e.Focus = 5] = "Focus", e[e.Blur = 6] = "Blur", e[e.TouchStart = 7] = "TouchStart", e[e.TouchMove_Departed = 8] = "TouchMove_Departed", e[e.TouchEnd = 9] = "TouchEnd", e[e.TouchCancel = 10] = "TouchCancel", e))(fe || {}), Ie = /* @__PURE__ */ ((e) => (e[e.Mouse = 0] = "Mouse", e[e.Pen = 1] = "Pen", e[e.Touch = 2] = "Touch", e))(Ie || {}), it = /* @__PURE__ */ ((e) => (e[e["2D"] = 0] = "2D", e[e.WebGL = 1] = "WebGL", e[e.WebGL2 = 2] = "WebGL2", e))(it || {}), Ze = /* @__PURE__ */ ((e) => (e[e.Play = 0] = "Play", e[e.Pause = 1] = "Pause", e[e.Seeked = 2] = "Seeked", e[e.VolumeChange = 3] = "VolumeChange", e[e.RateChange = 4] = "RateChange", e))(Ze || {}), Oo = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(Oo || {});
function gs(e) {
  return "__ln" in e;
}
class fu {
  constructor() {
    I(this, "length", 0), I(this, "head", null), I(this, "tail", null);
  }
  get(t) {
    if (t >= this.length)
      throw new Error("Position outside of list range");
    let r = this.head;
    for (let i = 0; i < t; i++)
      r = (r == null ? void 0 : r.next) || null;
    return r;
  }
  addNode(t) {
    const r = {
      value: t,
      previous: null,
      next: null
    };
    if (t.__ln = r, t.previousSibling && gs(t.previousSibling)) {
      const i = t.previousSibling.__ln.next;
      r.next = i, r.previous = t.previousSibling.__ln, t.previousSibling.__ln.next = r, i && (i.previous = r);
    } else if (t.nextSibling && gs(t.nextSibling) && t.nextSibling.__ln.previous) {
      const i = t.nextSibling.__ln.previous;
      r.previous = i, r.next = t.nextSibling.__ln, t.nextSibling.__ln.previous = r, i && (i.next = r);
    } else
      this.head && (this.head.previous = r), r.next = this.head, this.head = r;
    r.next === null && (this.tail = r), this.length++;
  }
  removeNode(t) {
    const r = t.__ln;
    this.head && (r.previous ? (r.previous.next = r.next, r.next ? r.next.previous = r.previous : this.tail = r.previous) : (this.head = r.next, this.head ? this.head.previous = null : this.tail = null), t.__ln && delete t.__ln, this.length--);
  }
}
const ys = (e, t) => `${e}@${t}`;
class mu {
  constructor() {
    I(this, "frozen", !1), I(this, "locked", !1), I(this, "texts", []), I(this, "attributes", []), I(this, "attributeMap", /* @__PURE__ */ new WeakMap()), I(this, "removes", []), I(this, "mapRemoves", []), I(this, "movedMap", {}), I(this, "addedSet", /* @__PURE__ */ new Set()), I(this, "movedSet", /* @__PURE__ */ new Set()), I(this, "droppedSet", /* @__PURE__ */ new Set()), I(this, "removesSubTreeCache", /* @__PURE__ */ new Set()), I(this, "mutationCb"), I(this, "blockClass"), I(this, "blockSelector"), I(this, "maskTextClass"), I(this, "maskTextSelector"), I(this, "inlineStylesheet"), I(this, "maskInputOptions"), I(this, "maskTextFn"), I(this, "maskInputFn"), I(this, "keepIframeSrcFn"), I(this, "recordCanvas"), I(this, "inlineImages"), I(this, "slimDOMOptions"), I(this, "dataURLOptions"), I(this, "doc"), I(this, "mirror"), I(this, "iframeManager"), I(this, "stylesheetManager"), I(this, "shadowDomManager"), I(this, "canvasManager"), I(this, "processedNodeManager"), I(this, "unattachedDoc"), I(this, "processMutations", (t) => {
      t.forEach(this.processMutation), this.emit();
    }), I(this, "emit", () => {
      if (this.frozen || this.locked)
        return;
      const t = [], r = /* @__PURE__ */ new Set(), i = new fu(), n = (o) => {
        let p = o, a = ut;
        for (; a === ut; )
          p = p && p.nextSibling, a = p && this.mirror.getId(p);
        return a;
      }, s = (o) => {
        const p = B.parentNode(o);
        if (!p || !Ro(o))
          return;
        let a = !1;
        if (o.nodeType === Node.TEXT_NODE) {
          const m = p.tagName;
          if (m === "TEXTAREA")
            return;
          m === "STYLE" && this.addedSet.has(p) && (a = !0);
        }
        const h = at(p) ? this.mirror.getId(Mo(o)) : this.mirror.getId(p), u = n(o);
        if (h === -1 || u === -1)
          return i.addNode(o);
        const l = et(o, {
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
            Co(m, this.mirror) && this.iframeManager.addIframe(m), Eo(m, this.mirror) && this.stylesheetManager.trackLinkElement(
              m
            ), bn(o) && this.shadowDomManager.addShadowRoot(B.shadowRoot(o), this.doc);
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
          parentId: h,
          nextId: u,
          node: l
        }), r.add(l.id));
      };
      for (; this.mapRemoves.length; )
        this.mirror.removeNodeFromMap(this.mapRemoves.shift());
      for (const o of this.movedSet)
        bs(this.removesSubTreeCache, o, this.mirror) && !this.movedSet.has(B.parentNode(o)) || s(o);
      for (const o of this.addedSet)
        !vs(this.droppedSet, o) && !bs(this.removesSubTreeCache, o, this.mirror) || vs(this.movedSet, o) ? s(o) : this.droppedSet.add(o);
      let c = null;
      for (; i.length; ) {
        let o = null;
        if (c) {
          const p = this.mirror.getId(B.parentNode(c.value)), a = n(c.value);
          p !== -1 && a !== -1 && (o = c);
        }
        if (!o) {
          let p = i.tail;
          for (; p; ) {
            const a = p;
            if (p = p.previous, a) {
              const h = this.mirror.getId(B.parentNode(a.value));
              if (n(a.value) === -1) continue;
              if (h !== -1) {
                o = a;
                break;
              } else {
                const l = a.value, m = B.parentNode(l);
                if (m && m.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                  const f = B.host(m);
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
          for (; i.head; )
            i.removeNode(i.head.value);
          break;
        }
        c = o.previous, i.removeNode(o.value), s(o.value);
      }
      const d = {
        texts: this.texts.map((o) => {
          const p = o.node, a = B.parentNode(p);
          return a && a.tagName === "TEXTAREA" && this.genTextAreaValueMutation(a), {
            id: this.mirror.getId(p),
            value: o.value
          };
        }).filter((o) => !r.has(o.id)).filter((o) => this.mirror.has(o.id)),
        attributes: this.attributes.map((o) => {
          const { attributes: p } = o;
          if (typeof p.style == "string") {
            const a = JSON.stringify(o.styleDiff), h = JSON.stringify(o._unchangedStyles);
            a.length < p.style.length && (a + h).split("var(").length === p.style.split("var(").length && (p.style = o.styleDiff);
          }
          return {
            id: this.mirror.getId(o.node),
            attributes: p
          };
        }).filter((o) => !r.has(o.id)).filter((o) => this.mirror.has(o.id)),
        removes: this.removes,
        adds: t
      };
      !d.texts.length && !d.attributes.length && !d.removes.length && !d.adds.length || (this.texts = [], this.attributes = [], this.attributeMap = /* @__PURE__ */ new WeakMap(), this.removes = [], this.addedSet = /* @__PURE__ */ new Set(), this.movedSet = /* @__PURE__ */ new Set(), this.droppedSet = /* @__PURE__ */ new Set(), this.removesSubTreeCache = /* @__PURE__ */ new Set(), this.movedMap = {}, this.mutationCb(d));
    }), I(this, "genTextAreaValueMutation", (t) => {
      let r = this.attributeMap.get(t);
      r || (r = {
        node: t,
        attributes: {},
        styleDiff: {},
        _unchangedStyles: {}
      }, this.attributes.push(r), this.attributeMap.set(t, r));
      const i = Array.from(
        B.childNodes(t),
        (n) => B.textContent(n) || ""
      ).join("");
      r.attributes.value = Nt({
        element: t,
        maskInputOptions: this.maskInputOptions,
        tagName: t.tagName,
        type: _t(t),
        value: i,
        maskInputFn: this.maskInputFn
      });
    }), I(this, "processMutation", (t) => {
      if (!dn(t.target, this.mirror, this.slimDOMOptions))
        switch (t.type) {
          case "characterData": {
            const r = B.textContent(t.target);
            !de(t.target, this.blockClass, this.blockSelector, !1) && r !== t.oldValue && this.texts.push({
              value: Qs(
                t.target,
                this.maskTextClass,
                this.maskTextSelector,
                !0
                // checkAncestors
              ) && r ? this.maskTextFn ? this.maskTextFn(r, ko(t.target)) : r.replace(/[\S]/g, "*") : r,
              node: t.target
            });
            break;
          }
          case "attributes": {
            const r = t.target;
            let i = t.attributeName, n = t.target.getAttribute(i);
            if (i === "value") {
              const c = _t(r);
              n = Nt({
                element: r,
                maskInputOptions: this.maskInputOptions,
                tagName: r.tagName,
                type: c,
                value: n,
                maskInputFn: this.maskInputFn
              });
            }
            if (de(t.target, this.blockClass, this.blockSelector, !1) || n === t.oldValue)
              return;
            let s = this.attributeMap.get(t.target);
            if (r.tagName === "IFRAME" && i === "src" && !this.keepIframeSrcFn(n))
              if (!r.contentDocument)
                i = "rr_src";
              else
                return;
            if (s || (s = {
              node: t.target,
              attributes: {},
              styleDiff: {},
              _unchangedStyles: {}
            }, this.attributes.push(s), this.attributeMap.set(t.target, s)), i === "type" && r.tagName === "INPUT" && (t.oldValue || "").toLowerCase() === "password" && r.setAttribute("data-rr-is-password", "true"), !Zs(r.tagName, i))
              if (s.attributes[i] = Ks(
                this.doc,
                We(r.tagName),
                We(i),
                n
              ), i === "style") {
                if (!this.unattachedDoc)
                  try {
                    this.unattachedDoc = document.implementation.createHTMLDocument();
                  } catch {
                    this.unattachedDoc = this.doc;
                  }
                const c = this.unattachedDoc.createElement("span");
                t.oldValue && c.setAttribute("style", t.oldValue);
                for (const d of Array.from(r.style)) {
                  const o = r.style.getPropertyValue(d), p = r.style.getPropertyPriority(d);
                  o !== c.style.getPropertyValue(d) || p !== c.style.getPropertyPriority(d) ? p === "" ? s.styleDiff[d] = o : s.styleDiff[d] = [o, p] : s._unchangedStyles[d] = [o, p];
                }
                for (const d of Array.from(c.style))
                  r.style.getPropertyValue(d) === "" && (s.styleDiff[d] = !1);
              } else i === "open" && r.tagName === "DIALOG" && (r.matches("dialog:modal") ? s.attributes.rr_open_mode = "modal" : s.attributes.rr_open_mode = "non-modal");
            break;
          }
          case "childList": {
            if (de(t.target, this.blockClass, this.blockSelector, !0))
              return;
            if (t.target.tagName === "TEXTAREA") {
              this.genTextAreaValueMutation(t.target);
              return;
            }
            t.addedNodes.forEach((r) => this.genAdds(r, t.target)), t.removedNodes.forEach((r) => {
              const i = this.mirror.getId(r), n = at(t.target) ? this.mirror.getId(B.host(t.target)) : this.mirror.getId(t.target);
              de(t.target, this.blockClass, this.blockSelector, !1) || dn(r, this.mirror, this.slimDOMOptions) || !cu(r, this.mirror) || (this.addedSet.has(r) ? (vn(this.addedSet, r), this.droppedSet.add(r)) : this.addedSet.has(t.target) && i === -1 || So(t.target, this.mirror) || (this.movedSet.has(r) && this.movedMap[ys(i, n)] ? vn(this.movedSet, r) : (this.removes.push({
                parentId: n,
                id: i,
                isShadow: at(t.target) && lt(t.target) ? !0 : void 0
              }), gu(r, this.removesSubTreeCache))), this.mapRemoves.push(r));
            });
            break;
          }
        }
    }), I(this, "genAdds", (t, r) => {
      if (!this.processedNodeManager.inOtherBuffer(t, this) && !(this.addedSet.has(t) || this.movedSet.has(t))) {
        if (this.mirror.hasNode(t)) {
          if (dn(t, this.mirror, this.slimDOMOptions))
            return;
          this.movedSet.add(t);
          let i = null;
          r && this.mirror.hasNode(r) && (i = this.mirror.getId(r)), i && i !== -1 && (this.movedMap[ys(this.mirror.getId(t), i)] = !0);
        } else
          this.addedSet.add(t), this.droppedSet.delete(t);
        de(t, this.blockClass, this.blockSelector, !1) || (B.childNodes(t).forEach((i) => this.genAdds(i)), bn(t) && B.childNodes(B.shadowRoot(t)).forEach((i) => {
          this.processedNodeManager.add(i, this), this.genAdds(i, t);
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
function vn(e, t) {
  e.delete(t), B.childNodes(t).forEach((r) => vn(e, r));
}
function gu(e, t) {
  const r = [e];
  for (; r.length; ) {
    const i = r.pop();
    t.has(i) || (t.add(i), B.childNodes(i).forEach((n) => r.push(n)));
  }
}
function bs(e, t, r) {
  return e.size === 0 ? !1 : yu(e, t);
}
function yu(e, t, r) {
  const i = B.parentNode(t);
  return i ? e.has(i) : !1;
}
function vs(e, t) {
  return e.size === 0 ? !1 : Io(e, t);
}
function Io(e, t) {
  const r = B.parentNode(t);
  return r ? e.has(r) ? !0 : Io(e, r) : !1;
}
let ct;
function bu(e) {
  ct = e;
}
function vu() {
  ct = void 0;
}
const H = (e) => ct ? (...r) => {
  try {
    return e(...r);
  } catch (i) {
    if (ct && ct(i) === !0)
      return;
    throw i;
  }
} : e, Be = [];
function mt(e) {
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
function Ao(e, t) {
  const r = new mu();
  Be.push(r), r.init(e);
  const [i, n] = bo(), s = new i(
    H(r.processMutations.bind(r))
  );
  return s.observe(t, {
    attributes: !0,
    attributeOldValue: !0,
    characterData: !0,
    characterDataOldValue: !0,
    childList: !0,
    subtree: !0
  }), [s, n];
}
function wu({
  mousemoveCb: e,
  sampling: t,
  doc: r,
  mirror: i
}) {
  if (t.mousemove === !1)
    return () => {
    };
  const n = typeof t.mousemove == "number" ? t.mousemove : 50, s = typeof t.mousemoveCallback == "number" ? t.mousemoveCallback : 500;
  let c = [], d;
  const o = dt(
    H(
      (h) => {
        const u = Date.now() - d;
        e(
          c.map((l) => (l.timeOffset -= u, l)),
          h
        ), c = [], d = null;
      }
    ),
    s
  ), p = H(
    dt(
      H((h) => {
        const u = mt(h), { clientX: l, clientY: m } = yn(h) ? h.changedTouches[0] : h;
        d || (d = ht()), c.push({
          x: l,
          y: m,
          id: i.getId(u),
          timeOffset: ht() - d
        }), o(
          typeof DragEvent < "u" && h instanceof DragEvent ? j.Drag : h instanceof MouseEvent ? j.MouseMove : j.TouchMove
        );
      }),
      n,
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
    a.forEach((h) => h());
  });
}
function xu({
  mouseInteractionCb: e,
  doc: t,
  mirror: r,
  blockClass: i,
  blockSelector: n,
  sampling: s
}) {
  if (s.mouseInteraction === !1)
    return () => {
    };
  const c = s.mouseInteraction === !0 || s.mouseInteraction === void 0 ? {} : s.mouseInteraction, d = [];
  let o = null;
  const p = (a) => (h) => {
    const u = mt(h);
    if (de(u, i, n, !0))
      return;
    let l = null, m = a;
    if ("pointerType" in h) {
      switch (h.pointerType) {
        case "mouse":
          l = Ie.Mouse;
          break;
        case "touch":
          l = Ie.Touch;
          break;
        case "pen":
          l = Ie.Pen;
          break;
      }
      l === Ie.Touch ? fe[a] === fe.MouseDown ? m = "TouchStart" : fe[a] === fe.MouseUp && (m = "TouchEnd") : Ie.Pen;
    } else yn(h) && (l = Ie.Touch);
    l !== null ? (o = l, (m.startsWith("Touch") && l === Ie.Touch || m.startsWith("Mouse") && l === Ie.Mouse) && (l = null)) : fe[a] === fe.Click && (l = o, o = null);
    const f = yn(h) ? h.changedTouches[0] : h;
    if (!f)
      return;
    const g = r.getId(u), { clientX: x, clientY: b } = f;
    H(e)({
      type: fe[m],
      id: g,
      x,
      y: b,
      ...l !== null && { pointerType: l }
    });
  };
  return Object.keys(fe).filter(
    (a) => Number.isNaN(Number(a)) && !a.endsWith("_Departed") && c[a] !== !1
  ).forEach((a) => {
    let h = We(a);
    const u = p(a);
    if (window.PointerEvent)
      switch (fe[a]) {
        case fe.MouseDown:
        case fe.MouseUp:
          h = h.replace(
            "mouse",
            "pointer"
          );
          break;
        case fe.TouchStart:
        case fe.TouchEnd:
          return;
      }
    d.push(he(h, u, t));
  }), H(() => {
    d.forEach((a) => a());
  });
}
function Lo({
  scrollCb: e,
  doc: t,
  mirror: r,
  blockClass: i,
  blockSelector: n,
  sampling: s
}) {
  const c = H(
    dt(
      H((d) => {
        const o = mt(d);
        if (!o || de(o, i, n, !0))
          return;
        const p = r.getId(o);
        if (o === t && t.defaultView) {
          const a = vo(t.defaultView);
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
function ku({ viewportResizeCb: e }, { win: t }) {
  let r = -1, i = -1;
  const n = H(
    dt(
      H(() => {
        const s = wo(), c = xo();
        (r !== s || i !== c) && (e({
          width: Number(c),
          height: Number(s)
        }), r = s, i = c);
      }),
      200
    )
  );
  return he("resize", n, t);
}
const Su = ["INPUT", "TEXTAREA", "SELECT"], ws = /* @__PURE__ */ new WeakMap();
function Cu({
  inputCb: e,
  doc: t,
  mirror: r,
  blockClass: i,
  blockSelector: n,
  ignoreClass: s,
  ignoreSelector: c,
  maskInputOptions: d,
  maskInputFn: o,
  sampling: p,
  userTriggeredOnInput: a
}) {
  function h(b) {
    let v = mt(b);
    const S = b.isTrusted, w = v && v.tagName;
    if (v && w === "OPTION" && (v = B.parentElement(v)), !v || !w || Su.indexOf(w) < 0 || de(v, i, n, !0) || v.classList.contains(s) || c && v.matches(c))
      return;
    let y = v.value, k = !1;
    const E = _t(v) || "";
    E === "radio" || E === "checkbox" ? k = v.checked : (d[w.toLowerCase()] || d[E]) && (y = Nt({
      element: v,
      maskInputOptions: d,
      tagName: w,
      type: E,
      value: y,
      maskInputFn: o
    })), u(
      v,
      a ? { text: y, isChecked: k, userTriggered: S } : { text: y, isChecked: k }
    );
    const O = v.name;
    E === "radio" && O && k && t.querySelectorAll(`input[type="radio"][name="${O}"]`).forEach((M) => {
      if (M !== v) {
        const D = M.value;
        u(
          M,
          a ? { text: D, isChecked: !k, userTriggered: !1 } : { text: D, isChecked: !k }
        );
      }
    });
  }
  function u(b, v) {
    const S = ws.get(b);
    if (!S || S.text !== v.text || S.isChecked !== v.isChecked) {
      ws.set(b, v);
      const w = r.getId(b);
      H(e)({
        ...v,
        id: w
      });
    }
  }
  const m = (p.input === "last" ? ["change"] : ["input", "change"]).map(
    (b) => he(b, H(h), t)
  ), f = t.defaultView;
  if (!f)
    return () => {
      m.forEach((b) => b());
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
      (b) => er(
        b[0],
        b[1],
        {
          set() {
            H(h)({
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
    m.forEach((b) => b());
  });
}
function zt(e) {
  const t = [];
  function r(i, n) {
    if (Mt("CSSGroupingRule") && i.parentRule instanceof CSSGroupingRule || Mt("CSSMediaRule") && i.parentRule instanceof CSSMediaRule || Mt("CSSSupportsRule") && i.parentRule instanceof CSSSupportsRule || Mt("CSSConditionRule") && i.parentRule instanceof CSSConditionRule) {
      const c = Array.from(
        i.parentRule.cssRules
      ).indexOf(i);
      return n.unshift(c), r(i.parentRule, n);
    } else if (i.parentStyleSheet) {
      const c = Array.from(i.parentStyleSheet.cssRules).indexOf(i);
      n.unshift(c);
    }
    return n;
  }
  return r(e, t);
}
function Te(e, t, r) {
  let i, n;
  return e ? (e.ownerNode ? i = t.getId(e.ownerNode) : n = r.getId(e), {
    styleId: n,
    id: i
  }) : {};
}
function Eu({ styleSheetRuleCb: e, mirror: t, stylesheetManager: r }, { win: i }) {
  if (!i.CSSStyleSheet || !i.CSSStyleSheet.prototype)
    return () => {
    };
  const n = i.CSSStyleSheet.prototype.insertRule;
  i.CSSStyleSheet.prototype.insertRule = new Proxy(n, {
    apply: H(
      (a, h, u) => {
        const [l, m] = u, { id: f, styleId: g } = Te(
          h,
          t,
          r.styleMirror
        );
        return (f && f !== -1 || g && g !== -1) && e({
          id: f,
          styleId: g,
          adds: [{ rule: l, index: m }]
        }), a.apply(h, u);
      }
    )
  }), i.CSSStyleSheet.prototype.addRule = function(a, h, u = this.cssRules.length) {
    const l = `${a} { ${h} }`;
    return i.CSSStyleSheet.prototype.insertRule.apply(this, [l, u]);
  };
  const s = i.CSSStyleSheet.prototype.deleteRule;
  i.CSSStyleSheet.prototype.deleteRule = new Proxy(s, {
    apply: H(
      (a, h, u) => {
        const [l] = u, { id: m, styleId: f } = Te(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          removes: [{ index: l }]
        }), a.apply(h, u);
      }
    )
  }), i.CSSStyleSheet.prototype.removeRule = function(a) {
    return i.CSSStyleSheet.prototype.deleteRule.apply(this, [a]);
  };
  let c;
  i.CSSStyleSheet.prototype.replace && (c = i.CSSStyleSheet.prototype.replace, i.CSSStyleSheet.prototype.replace = new Proxy(c, {
    apply: H(
      (a, h, u) => {
        const [l] = u, { id: m, styleId: f } = Te(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replace: l
        }), a.apply(h, u);
      }
    )
  }));
  let d;
  i.CSSStyleSheet.prototype.replaceSync && (d = i.CSSStyleSheet.prototype.replaceSync, i.CSSStyleSheet.prototype.replaceSync = new Proxy(d, {
    apply: H(
      (a, h, u) => {
        const [l] = u, { id: m, styleId: f } = Te(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replaceSync: l
        }), a.apply(h, u);
      }
    )
  }));
  const o = {};
  Rt("CSSGroupingRule") ? o.CSSGroupingRule = i.CSSGroupingRule : (Rt("CSSMediaRule") && (o.CSSMediaRule = i.CSSMediaRule), Rt("CSSConditionRule") && (o.CSSConditionRule = i.CSSConditionRule), Rt("CSSSupportsRule") && (o.CSSSupportsRule = i.CSSSupportsRule));
  const p = {};
  return Object.entries(o).forEach(([a, h]) => {
    p[a] = {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      insertRule: h.prototype.insertRule,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      deleteRule: h.prototype.deleteRule
    }, h.prototype.insertRule = new Proxy(
      p[a].insertRule,
      {
        apply: H(
          (u, l, m) => {
            const [f, g] = m, { id: x, styleId: b } = Te(
              l.parentStyleSheet,
              t,
              r.styleMirror
            );
            return (x && x !== -1 || b && b !== -1) && e({
              id: x,
              styleId: b,
              adds: [
                {
                  rule: f,
                  index: [
                    ...zt(l),
                    g || 0
                    // defaults to 0
                  ]
                }
              ]
            }), u.apply(l, m);
          }
        )
      }
    ), h.prototype.deleteRule = new Proxy(
      p[a].deleteRule,
      {
        apply: H(
          (u, l, m) => {
            const [f] = m, { id: g, styleId: x } = Te(
              l.parentStyleSheet,
              t,
              r.styleMirror
            );
            return (g && g !== -1 || x && x !== -1) && e({
              id: g,
              styleId: x,
              removes: [
                { index: [...zt(l), f] }
              ]
            }), u.apply(l, m);
          }
        )
      }
    );
  }), H(() => {
    i.CSSStyleSheet.prototype.insertRule = n, i.CSSStyleSheet.prototype.deleteRule = s, c && (i.CSSStyleSheet.prototype.replace = c), d && (i.CSSStyleSheet.prototype.replaceSync = d), Object.entries(o).forEach(([a, h]) => {
      h.prototype.insertRule = p[a].insertRule, h.prototype.deleteRule = p[a].deleteRule;
    });
  });
}
function Po({
  mirror: e,
  stylesheetManager: t
}, r) {
  var i, n, s;
  let c = null;
  r.nodeName === "#document" ? c = e.getId(r) : c = e.getId(B.host(r));
  const d = r.nodeName === "#document" ? (i = r.defaultView) == null ? void 0 : i.Document : (s = (n = r.ownerDocument) == null ? void 0 : n.defaultView) == null ? void 0 : s.ShadowRoot, o = d != null && d.prototype ? Object.getOwnPropertyDescriptor(
    d == null ? void 0 : d.prototype,
    "adoptedStyleSheets"
  ) : void 0;
  return c === null || c === -1 || !d || !o ? () => {
  } : (Object.defineProperty(r, "adoptedStyleSheets", {
    configurable: o.configurable,
    enumerable: o.enumerable,
    get() {
      var p;
      return (p = o.get) == null ? void 0 : p.call(this);
    },
    set(p) {
      var a;
      const h = (a = o.set) == null ? void 0 : a.call(this, p);
      if (c !== null && c !== -1)
        try {
          t.adoptStyleSheets(p, c);
        } catch {
        }
      return h;
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
function Mu({
  styleDeclarationCb: e,
  mirror: t,
  ignoreCSSAttributes: r,
  stylesheetManager: i
}, { win: n }) {
  const s = n.CSSStyleDeclaration.prototype.setProperty;
  n.CSSStyleDeclaration.prototype.setProperty = new Proxy(s, {
    apply: H(
      (d, o, p) => {
        var a;
        const [h, u, l] = p;
        if (r.has(h))
          return s.apply(o, [h, u, l]);
        const { id: m, styleId: f } = Te(
          (a = o.parentRule) == null ? void 0 : a.parentStyleSheet,
          t,
          i.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          set: {
            property: h,
            value: u,
            priority: l
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: zt(o.parentRule)
        }), d.apply(o, p);
      }
    )
  });
  const c = n.CSSStyleDeclaration.prototype.removeProperty;
  return n.CSSStyleDeclaration.prototype.removeProperty = new Proxy(c, {
    apply: H(
      (d, o, p) => {
        var a;
        const [h] = p;
        if (r.has(h))
          return c.apply(o, [h]);
        const { id: u, styleId: l } = Te(
          (a = o.parentRule) == null ? void 0 : a.parentStyleSheet,
          t,
          i.styleMirror
        );
        return (u && u !== -1 || l && l !== -1) && e({
          id: u,
          styleId: l,
          remove: {
            property: h
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: zt(o.parentRule)
        }), d.apply(o, p);
      }
    )
  }), H(() => {
    n.CSSStyleDeclaration.prototype.setProperty = s, n.CSSStyleDeclaration.prototype.removeProperty = c;
  });
}
function Ru({
  mediaInteractionCb: e,
  blockClass: t,
  blockSelector: r,
  mirror: i,
  sampling: n,
  doc: s
}) {
  const c = H(
    (o) => dt(
      H((p) => {
        const a = mt(p);
        if (!a || de(a, t, r, !0))
          return;
        const { currentTime: h, volume: u, muted: l, playbackRate: m, loop: f } = a;
        e({
          type: o,
          id: i.getId(a),
          currentTime: h,
          volume: u,
          muted: l,
          playbackRate: m,
          loop: f
        });
      }),
      n.media || 500
    )
  ), d = [
    he("play", c(Ze.Play), s),
    he("pause", c(Ze.Pause), s),
    he("seeked", c(Ze.Seeked), s),
    he("volumechange", c(Ze.VolumeChange), s),
    he("ratechange", c(Ze.RateChange), s)
  ];
  return H(() => {
    d.forEach((o) => o());
  });
}
function Ou({ fontCb: e, doc: t }) {
  const r = t.defaultView;
  if (!r)
    return () => {
    };
  const i = [], n = /* @__PURE__ */ new WeakMap(), s = r.FontFace;
  r.FontFace = function(o, p, a) {
    const h = new s(o, p, a);
    return n.set(h, {
      family: o,
      buffer: typeof p != "string",
      descriptors: a,
      fontSource: typeof p == "string" ? p : JSON.stringify(Array.from(new Uint8Array(p)))
    }), h;
  };
  const c = He(
    t.fonts,
    "add",
    function(d) {
      return function(o) {
        return setTimeout(
          H(() => {
            const p = n.get(o);
            p && (e(p), n.delete(o));
          }),
          0
        ), d.apply(this, [o]);
      };
    }
  );
  return i.push(() => {
    r.FontFace = s;
  }), i.push(c), H(() => {
    i.forEach((d) => d());
  });
}
function Iu(e) {
  const { doc: t, mirror: r, blockClass: i, blockSelector: n, selectionCb: s } = e;
  let c = !0;
  const d = H(() => {
    const o = t.getSelection();
    if (!o || c && (o != null && o.isCollapsed)) return;
    c = o.isCollapsed || !1;
    const p = [], a = o.rangeCount || 0;
    for (let h = 0; h < a; h++) {
      const u = o.getRangeAt(h), { startContainer: l, startOffset: m, endContainer: f, endOffset: g } = u;
      de(l, i, n, !0) || de(f, i, n, !0) || p.push({
        start: r.getId(l),
        startOffset: m,
        end: r.getId(f),
        endOffset: g
      });
    }
    s({ ranges: p });
  });
  return d(), he("selectionchange", d);
}
function Au({
  doc: e,
  customElementCb: t
}) {
  const r = e.defaultView;
  return !r || !r.customElements ? () => {
  } : He(
    r.customElements,
    "define",
    function(n) {
      return function(s, c, d) {
        try {
          t({
            define: {
              name: s
            }
          });
        } catch {
          console.warn(`Custom element callback failed for ${s}`);
        }
        return n.apply(this, [s, c, d]);
      };
    }
  );
}
function Lu(e, t) {
  const {
    mutationCb: r,
    mousemoveCb: i,
    mouseInteractionCb: n,
    scrollCb: s,
    viewportResizeCb: c,
    inputCb: d,
    mediaInteractionCb: o,
    styleSheetRuleCb: p,
    styleDeclarationCb: a,
    canvasMutationCb: h,
    fontCb: u,
    selectionCb: l,
    customElementCb: m
  } = e;
  e.mutationCb = (...f) => {
    t.mutation && t.mutation(...f), r(...f);
  }, e.mousemoveCb = (...f) => {
    t.mousemove && t.mousemove(...f), i(...f);
  }, e.mouseInteractionCb = (...f) => {
    t.mouseInteraction && t.mouseInteraction(...f), n(...f);
  }, e.scrollCb = (...f) => {
    t.scroll && t.scroll(...f), s(...f);
  }, e.viewportResizeCb = (...f) => {
    t.viewportResize && t.viewportResize(...f), c(...f);
  }, e.inputCb = (...f) => {
    t.input && t.input(...f), d(...f);
  }, e.mediaInteractionCb = (...f) => {
    t.mediaInteaction && t.mediaInteaction(...f), o(...f);
  }, e.styleSheetRuleCb = (...f) => {
    t.styleSheetRule && t.styleSheetRule(...f), p(...f);
  }, e.styleDeclarationCb = (...f) => {
    t.styleDeclaration && t.styleDeclaration(...f), a(...f);
  }, e.canvasMutationCb = (...f) => {
    t.canvasMutation && t.canvasMutation(...f), h(...f);
  }, e.fontCb = (...f) => {
    t.font && t.font(...f), u(...f);
  }, e.selectionCb = (...f) => {
    t.selection && t.selection(...f), l(...f);
  }, e.customElementCb = (...f) => {
    t.customElement && t.customElement(...f), m(...f);
  };
}
function Pu(e, t = {}) {
  const r = e.doc.defaultView;
  if (!r)
    return () => {
    };
  Lu(e, t);
  let i, n = () => {
  };
  e.recordDOM && ([i, n] = Ao(e, e.doc));
  const s = wu(e), c = xu(e), d = Lo(e), o = ku(e, {
    win: r
  }), p = Cu(e), a = Ru(e);
  let h = () => {
  }, u = () => {
  }, l = () => {
  }, m = () => {
  };
  e.recordDOM && (h = Eu(e, { win: r }), u = Po(e, e.doc), l = Mu(e, {
    win: r
  }), e.collectFonts && (m = Ou(e)));
  const f = Iu(e), g = Au(e), x = [];
  for (const b of e.plugins)
    x.push(
      b.observer(b.callback, r, b.options)
    );
  return H(() => {
    Be.forEach((b) => b.reset()), i == null || i.disconnect(), n(), s(), c(), d(), o(), p(), a(), h(), u(), l(), m(), f(), g(), x.forEach((b) => b());
  });
}
function Mt(e) {
  return typeof window[e] < "u";
}
function Rt(e) {
  return !!(typeof window[e] < "u" && // Note: Generally, this check _shouldn't_ be necessary
  // However, in some scenarios (e.g. jsdom) this can sometimes fail, so we check for it here
  window[e].prototype && "insertRule" in window[e].prototype && "deleteRule" in window[e].prototype);
}
class xs {
  constructor(t) {
    I(this, "iframeIdToRemoteIdMap", /* @__PURE__ */ new WeakMap()), I(this, "iframeRemoteIdToIdMap", /* @__PURE__ */ new WeakMap()), this.generateIdFn = t;
  }
  getId(t, r, i, n) {
    const s = i || this.getIdToRemoteIdMap(t), c = n || this.getRemoteIdToIdMap(t);
    let d = s.get(r);
    return d || (d = this.generateIdFn(), s.set(r, d), c.set(d, r)), d;
  }
  getIds(t, r) {
    const i = this.getIdToRemoteIdMap(t), n = this.getRemoteIdToIdMap(t);
    return r.map(
      (s) => this.getId(t, s, i, n)
    );
  }
  getRemoteId(t, r, i) {
    const n = i || this.getRemoteIdToIdMap(t);
    if (typeof r != "number") return r;
    const s = n.get(r);
    return s || -1;
  }
  getRemoteIds(t, r) {
    const i = this.getRemoteIdToIdMap(t);
    return r.map((n) => this.getRemoteId(t, n, i));
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
class Tu {
  constructor(t) {
    I(this, "iframes", /* @__PURE__ */ new WeakMap()), I(this, "crossOriginIframeMap", /* @__PURE__ */ new WeakMap()), I(this, "crossOriginIframeMirror", new xs(Js)), I(this, "crossOriginIframeStyleMirror"), I(this, "crossOriginIframeRootIdMap", /* @__PURE__ */ new WeakMap()), I(this, "mirror"), I(this, "mutationCb"), I(this, "wrappedEmit"), I(this, "loadListener"), I(this, "stylesheetManager"), I(this, "recordCrossOriginIframes"), this.mutationCb = t.mutationCb, this.wrappedEmit = t.wrappedEmit, this.stylesheetManager = t.stylesheetManager, this.recordCrossOriginIframes = t.recordCrossOriginIframes, this.crossOriginIframeStyleMirror = new xs(
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
    var i, n;
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
    }), this.recordCrossOriginIframes && ((i = t.contentWindow) == null || i.addEventListener(
      "message",
      this.handleMessage.bind(this)
    )), (n = this.loadListener) == null || n.call(this, t), t.contentDocument && t.contentDocument.adoptedStyleSheets && t.contentDocument.adoptedStyleSheets.length > 0 && this.stylesheetManager.adoptStyleSheets(
      t.contentDocument.adoptedStyleSheets,
      this.mirror.getId(t.contentDocument)
    );
  }
  handleMessage(t) {
    const r = t;
    if (r.data.type !== "rrweb" || // To filter out the rrweb messages which are forwarded by some sites.
    r.origin !== r.data.origin || !t.source) return;
    const n = this.crossOriginIframeMap.get(t.source);
    if (!n) return;
    const s = this.transformCrossOriginEvent(
      n,
      r.data.event
    );
    s && this.wrappedEmit(
      s,
      r.data.isCheckout
    );
  }
  transformCrossOriginEvent(t, r) {
    var i;
    switch (r.type) {
      case G.FullSnapshot: {
        this.crossOriginIframeMirror.reset(t), this.crossOriginIframeStyleMirror.reset(t), this.replaceIdOnNode(r.data.node, t);
        const n = r.data.node.id;
        return this.crossOriginIframeRootIdMap.set(t, n), this.patchRootIdOnNode(r.data.node, n), {
          timestamp: r.timestamp,
          type: G.IncrementalSnapshot,
          data: {
            source: j.Mutation,
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
      case G.Meta:
      case G.Load:
      case G.DomContentLoaded:
        return !1;
      case G.Plugin:
        return r;
      case G.Custom:
        return this.replaceIds(
          r.data.payload,
          t,
          ["id", "parentId", "previousId", "nextId"]
        ), r;
      case G.IncrementalSnapshot:
        switch (r.data.source) {
          case j.Mutation:
            return r.data.adds.forEach((n) => {
              this.replaceIds(n, t, [
                "parentId",
                "nextId",
                "previousId"
              ]), this.replaceIdOnNode(n.node, t);
              const s = this.crossOriginIframeRootIdMap.get(t);
              s && this.patchRootIdOnNode(n.node, s);
            }), r.data.removes.forEach((n) => {
              this.replaceIds(n, t, ["parentId", "id"]);
            }), r.data.attributes.forEach((n) => {
              this.replaceIds(n, t, ["id"]);
            }), r.data.texts.forEach((n) => {
              this.replaceIds(n, t, ["id"]);
            }), r;
          case j.Drag:
          case j.TouchMove:
          case j.MouseMove:
            return r.data.positions.forEach((n) => {
              this.replaceIds(n, t, ["id"]);
            }), r;
          case j.ViewportResize:
            return !1;
          case j.MediaInteraction:
          case j.MouseInteraction:
          case j.Scroll:
          case j.CanvasMutation:
          case j.Input:
            return this.replaceIds(r.data, t, ["id"]), r;
          case j.StyleSheetRule:
          case j.StyleDeclaration:
            return this.replaceIds(r.data, t, ["id"]), this.replaceStyleIds(r.data, t, ["styleId"]), r;
          case j.Font:
            return r;
          case j.Selection:
            return r.data.ranges.forEach((n) => {
              this.replaceIds(n, t, ["start", "end"]);
            }), r;
          case j.AdoptedStyleSheet:
            return this.replaceIds(r.data, t, ["id"]), this.replaceStyleIds(r.data, t, ["styleIds"]), (i = r.data.styles) == null || i.forEach((n) => {
              this.replaceStyleIds(n, t, ["styleId"]);
            }), r;
        }
    }
    return !1;
  }
  replace(t, r, i, n) {
    for (const s of n)
      !Array.isArray(r[s]) && typeof r[s] != "number" || (Array.isArray(r[s]) ? r[s] = t.getIds(
        i,
        r[s]
      ) : r[s] = t.getId(i, r[s]));
    return r;
  }
  replaceIds(t, r, i) {
    return this.replace(this.crossOriginIframeMirror, t, r, i);
  }
  replaceStyleIds(t, r, i) {
    return this.replace(this.crossOriginIframeStyleMirror, t, r, i);
  }
  replaceIdOnNode(t, r) {
    this.replaceIds(t, r, ["id", "rootId"]), "childNodes" in t && t.childNodes.forEach((i) => {
      this.replaceIdOnNode(i, r);
    });
  }
  patchRootIdOnNode(t, r) {
    t.type !== Oo.Document && !t.rootId && (t.rootId = r), "childNodes" in t && t.childNodes.forEach((i) => {
      this.patchRootIdOnNode(i, r);
    });
  }
}
class Nu {
  constructor(t) {
    I(this, "shadowDoms", /* @__PURE__ */ new WeakSet()), I(this, "mutationCb"), I(this, "scrollCb"), I(this, "bypassOptions"), I(this, "mirror"), I(this, "restoreHandlers", []), this.mutationCb = t.mutationCb, this.scrollCb = t.scrollCb, this.bypassOptions = t.bypassOptions, this.mirror = t.mirror, this.init();
  }
  init() {
    this.reset(), this.patchAttachShadow(Element, document);
  }
  addShadowRoot(t, r) {
    if (!lt(t) || this.shadowDoms.has(t)) return;
    this.shadowDoms.add(t);
    const [i] = Ao(
      {
        ...this.bypassOptions,
        doc: r,
        mutationCb: this.mutationCb,
        mirror: this.mirror,
        shadowDomManager: this
      },
      t
    );
    this.restoreHandlers.push(() => i.disconnect()), this.restoreHandlers.push(
      Lo({
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
        this.mirror.getId(B.host(t))
      ), this.restoreHandlers.push(
        Po(
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
    const i = this;
    this.restoreHandlers.push(
      He(
        t.prototype,
        "attachShadow",
        function(n) {
          return function(s) {
            const c = n.call(this, s), d = B.shadowRoot(this);
            return d && Ro(this) && i.addShadowRoot(d, r), c;
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
var tt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", _u = typeof Uint8Array > "u" ? [] : new Uint8Array(256);
for (var Ot = 0; Ot < tt.length; Ot++)
  _u[tt.charCodeAt(Ot)] = Ot;
var $u = function(e) {
  var t = new Uint8Array(e), r, i = t.length, n = "";
  for (r = 0; r < i; r += 3)
    n += tt[t[r] >> 2], n += tt[(t[r] & 3) << 4 | t[r + 1] >> 4], n += tt[(t[r + 1] & 15) << 2 | t[r + 2] >> 6], n += tt[t[r + 2] & 63];
  return i % 3 === 2 ? n = n.substring(0, n.length - 1) + "=" : i % 3 === 1 && (n = n.substring(0, n.length - 2) + "=="), n;
};
const ks = /* @__PURE__ */ new Map();
function Du(e, t) {
  let r = ks.get(e);
  return r || (r = /* @__PURE__ */ new Map(), ks.set(e, r)), r.has(t) || r.set(t, []), r.get(t);
}
const To = (e, t, r) => {
  if (!e || !(_o(e, t) || typeof e == "object"))
    return;
  const i = e.constructor.name, n = Du(r, i);
  let s = n.indexOf(e);
  return s === -1 && (s = n.length, n.push(e)), s;
};
function It(e, t, r) {
  if (e instanceof Array)
    return e.map((i) => It(i, t, r));
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
    const i = e.constructor.name, n = $u(e);
    return {
      rr_type: i,
      base64: n
    };
  } else {
    if (e instanceof DataView)
      return {
        rr_type: e.constructor.name,
        args: [
          It(e.buffer, t, r),
          e.byteOffset,
          e.byteLength
        ]
      };
    if (e instanceof HTMLImageElement) {
      const i = e.constructor.name, { src: n } = e;
      return {
        rr_type: i,
        src: n
      };
    } else if (e instanceof HTMLCanvasElement) {
      const i = "HTMLImageElement", n = e.toDataURL();
      return {
        rr_type: i,
        src: n
      };
    } else {
      if (e instanceof ImageData)
        return {
          rr_type: e.constructor.name,
          args: [It(e.data, t, r), e.width, e.height]
        };
      if (_o(e, t) || typeof e == "object") {
        const i = e.constructor.name, n = To(e, t, r);
        return {
          rr_type: i,
          index: n
        };
      }
    }
  }
  return e;
}
const No = (e, t, r) => e.map((i) => It(i, t, r)), _o = (e, t) => !![
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
  (n) => typeof t[n] == "function"
).find(
  (n) => e instanceof t[n]
);
function zu(e, t, r, i) {
  const n = [], s = Object.getOwnPropertyNames(
    t.CanvasRenderingContext2D.prototype
  );
  for (const c of s)
    try {
      if (typeof t.CanvasRenderingContext2D.prototype[c] != "function")
        continue;
      const d = He(
        t.CanvasRenderingContext2D.prototype,
        c,
        function(o) {
          return function(...p) {
            return de(this.canvas, r, i, !0) || setTimeout(() => {
              const a = No(p, t, this);
              e(this.canvas, {
                type: it["2D"],
                property: c,
                args: a
              });
            }, 0), o.apply(this, p);
          };
        }
      );
      n.push(d);
    } catch {
      const d = er(
        t.CanvasRenderingContext2D.prototype,
        c,
        {
          set(o) {
            e(this.canvas, {
              type: it["2D"],
              property: c,
              args: [o],
              setter: !0
            });
          }
        }
      );
      n.push(d);
    }
  return () => {
    n.forEach((c) => c());
  };
}
function Fu(e) {
  return e === "experimental-webgl" ? "webgl" : e;
}
function Ss(e, t, r, i) {
  const n = [];
  try {
    const s = He(
      e.HTMLCanvasElement.prototype,
      "getContext",
      function(c) {
        return function(d, ...o) {
          if (!de(this, t, r, !0)) {
            const p = Fu(d);
            if ("__context" in this || (this.__context = p), i && ["webgl", "webgl2"].includes(p))
              if (o[0] && typeof o[0] == "object") {
                const a = o[0];
                a.preserveDrawingBuffer || (a.preserveDrawingBuffer = !0);
              } else
                o.splice(0, 1, {
                  preserveDrawingBuffer: !0
                });
          }
          return c.apply(this, [d, ...o]);
        };
      }
    );
    n.push(s);
  } catch {
    console.error("failed to patch HTMLCanvasElement.prototype.getContext");
  }
  return () => {
    n.forEach((s) => s());
  };
}
function Cs(e, t, r, i, n, s) {
  const c = [], d = Object.getOwnPropertyNames(e);
  for (const o of d)
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
        const p = He(
          e,
          o,
          function(a) {
            return function(...h) {
              const u = a.apply(this, h);
              if (To(u, s, this), "tagName" in this.canvas && !de(this.canvas, i, n, !0)) {
                const l = No(h, s, this), m = {
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
        const p = er(e, o, {
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
function Uu(e, t, r, i) {
  const n = [];
  return typeof t.WebGLRenderingContext < "u" && n.push(
    ...Cs(
      t.WebGLRenderingContext.prototype,
      it.WebGL,
      e,
      r,
      i,
      t
    )
  ), typeof t.WebGL2RenderingContext < "u" && n.push(
    ...Cs(
      t.WebGL2RenderingContext.prototype,
      it.WebGL2,
      e,
      r,
      i,
      t
    )
  ), () => {
    n.forEach((s) => s());
  };
}
const $o = `(function() {
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
`, Es = typeof self < "u" && self.Blob && new Blob([$o], { type: "text/javascript;charset=utf-8" });
function Bu(e) {
  let t;
  try {
    if (t = Es && (self.URL || self.webkitURL).createObjectURL(Es), !t) throw "";
    const r = new Worker(t, {
      name: e == null ? void 0 : e.name
    });
    return r.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(t);
    }), r;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent($o),
      {
        name: e == null ? void 0 : e.name
      }
    );
  } finally {
    t && (self.URL || self.webkitURL).revokeObjectURL(t);
  }
}
class Wu {
  constructor(t) {
    I(this, "pendingCanvasMutations", /* @__PURE__ */ new Map()), I(this, "rafStamps", { latestId: 0, invokeId: null }), I(this, "mirror"), I(this, "mutationCb"), I(this, "resetObservers"), I(this, "frozen", !1), I(this, "locked", !1), I(this, "processMutation", (o, p) => {
      (this.rafStamps.invokeId && this.rafStamps.latestId !== this.rafStamps.invokeId || !this.rafStamps.invokeId) && (this.rafStamps.invokeId = this.rafStamps.latestId), this.pendingCanvasMutations.has(o) || this.pendingCanvasMutations.set(o, []), this.pendingCanvasMutations.get(o).push(p);
    });
    const {
      sampling: r = "all",
      win: i,
      blockClass: n,
      blockSelector: s,
      recordCanvas: c,
      dataURLOptions: d
    } = t;
    this.mutationCb = t.mutationCb, this.mirror = t.mirror, c && r === "all" && this.initCanvasMutationObserver(i, n, s), c && typeof r == "number" && this.initCanvasFPSObserver(r, i, n, s, {
      dataURLOptions: d
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
  initCanvasFPSObserver(t, r, i, n, s) {
    const c = Ss(
      r,
      i,
      n,
      !0
    ), d = /* @__PURE__ */ new Map(), o = new Bu();
    o.onmessage = (m) => {
      const { id: f } = m.data;
      if (d.set(f, !1), !("base64" in m.data)) return;
      const { base64: g, type: x, width: b, height: v } = m.data;
      this.mutationCb({
        id: f,
        type: it["2D"],
        commands: [
          {
            property: "clearRect",
            // wipe canvas
            args: [0, 0, b, v]
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
    let a = 0, h;
    const u = () => {
      const m = [];
      return r.document.querySelectorAll("canvas").forEach((f) => {
        de(f, i, n, !0) || m.push(f);
      }), m;
    }, l = (m) => {
      if (a && m - a < p) {
        h = requestAnimationFrame(l);
        return;
      }
      a = m, u().forEach(async (f) => {
        var g;
        const x = this.mirror.getId(f);
        if (d.get(x) || f.width === 0 || f.height === 0) return;
        if (d.set(x, !0), ["webgl", "webgl2"].includes(f.__context)) {
          const v = f.getContext(f.__context);
          ((g = v == null ? void 0 : v.getContextAttributes()) == null ? void 0 : g.preserveDrawingBuffer) === !1 && v.clear(v.COLOR_BUFFER_BIT);
        }
        const b = await createImageBitmap(f);
        o.postMessage(
          {
            id: x,
            bitmap: b,
            width: f.width,
            height: f.height,
            dataURLOptions: s.dataURLOptions
          },
          [b]
        );
      }), h = requestAnimationFrame(l);
    };
    h = requestAnimationFrame(l), this.resetObservers = () => {
      c(), cancelAnimationFrame(h);
    };
  }
  initCanvasMutationObserver(t, r, i) {
    this.startRAFTimestamping(), this.startPendingCanvasMutationFlusher();
    const n = Ss(
      t,
      r,
      i,
      !1
    ), s = zu(
      this.processMutation.bind(this),
      t,
      r,
      i
    ), c = Uu(
      this.processMutation.bind(this),
      t,
      r,
      i
    );
    this.resetObservers = () => {
      n(), s(), c();
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
        const i = this.mirror.getId(r);
        this.flushPendingCanvasMutationFor(r, i);
      }
    ), requestAnimationFrame(() => this.flushPendingCanvasMutations());
  }
  flushPendingCanvasMutationFor(t, r) {
    if (this.frozen || this.locked)
      return;
    const i = this.pendingCanvasMutations.get(t);
    if (!i || r === -1) return;
    const n = i.map((c) => {
      const { type: d, ...o } = c;
      return o;
    }), { type: s } = i[0];
    this.mutationCb({ id: r, type: s, commands: n }), this.pendingCanvasMutations.delete(t);
  }
}
class qu {
  constructor(t) {
    I(this, "trackedLinkElements", /* @__PURE__ */ new WeakSet()), I(this, "mutationCb"), I(this, "adoptedStyleSheetCb"), I(this, "styleMirror", new hu()), this.mutationCb = t.mutationCb, this.adoptedStyleSheetCb = t.adoptedStyleSheetCb;
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
    const i = {
      id: r,
      styleIds: []
    }, n = [];
    for (const s of t) {
      let c;
      this.styleMirror.has(s) ? c = this.styleMirror.getId(s) : (c = this.styleMirror.add(s), n.push({
        styleId: c,
        rules: Array.from(s.rules || CSSRule, (d, o) => ({
          rule: Gs(d, s.href),
          index: o
        }))
      })), i.styleIds.push(c);
    }
    n.length > 0 && (i.styles = n), this.adoptedStyleSheetCb(i);
  }
  reset() {
    this.styleMirror.reset(), this.trackedLinkElements = /* @__PURE__ */ new WeakSet();
  }
  // TODO: take snapshot on stylesheet reload by applying event listener
  trackStylesheetInLinkElement(t) {
  }
}
class ju {
  constructor() {
    I(this, "nodeMap", /* @__PURE__ */ new WeakMap()), I(this, "active", !1);
  }
  inOtherBuffer(t, r) {
    const i = this.nodeMap.get(t);
    return i && Array.from(i).some((n) => n !== r);
  }
  add(t, r) {
    this.active || (this.active = !0, requestAnimationFrame(() => {
      this.nodeMap = /* @__PURE__ */ new WeakMap(), this.active = !1;
    })), this.nodeMap.set(t, (this.nodeMap.get(t) || /* @__PURE__ */ new Set()).add(r));
  }
  destroy() {
  }
}
let ne, At, pn, Ft = !1;
try {
  if (Array.from([1], (e) => e * 2)[0] !== 2) {
    const e = document.createElement("iframe");
    document.body.appendChild(e), Array.from = ((ri = e.contentWindow) == null ? void 0 : ri.Array.from) || Array.from, document.body.removeChild(e);
  }
} catch (e) {
  console.debug("Unable to override Array.from", e);
}
const Ce = Kl();
function $e(e = {}) {
  const {
    emit: t,
    checkoutEveryNms: r,
    checkoutEveryNth: i,
    blockClass: n = "rr-block",
    blockSelector: s = null,
    ignoreClass: c = "rr-ignore",
    ignoreSelector: d = null,
    maskTextClass: o = "rr-mask",
    maskTextSelector: p = null,
    inlineStylesheet: a = !0,
    maskAllInputs: h,
    maskInputOptions: u,
    slimDOMOptions: l,
    maskInputFn: m,
    maskTextFn: f,
    hooks: g,
    packFn: x,
    sampling: b = {},
    dataURLOptions: v = {},
    mousemoveWait: S,
    recordDOM: w = !0,
    recordCanvas: y = !1,
    recordCrossOriginIframes: k = !1,
    recordAfter: E = e.recordAfter === "DOMContentLoaded" ? e.recordAfter : "load",
    userTriggeredOnInput: O = !1,
    collectFonts: M = !1,
    inlineImages: D = !1,
    plugins: A,
    keepIframeSrcFn: C = () => !1,
    ignoreCSSAttributes: ye = /* @__PURE__ */ new Set([]),
    errorHandler: ae
  } = e;
  bu(ae);
  const X = k ? window.parent === window : !0;
  let W = !1;
  if (!X)
    try {
      window.parent.document && (W = !1);
    } catch {
      W = !0;
    }
  if (X && !t)
    throw new Error("emit function is required");
  if (!X && !W)
    return () => {
    };
  S !== void 0 && b.mousemove === void 0 && (b.mousemove = S), Ce.reset();
  const J = h === !0 ? {
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
  } : u !== void 0 ? u : { password: !0 }, ie = eo(l);
  uu();
  let Q, Y = 0;
  const Se = (L) => {
    for (const $ of A || [])
      $.eventProcessor && (L = $.eventProcessor(L));
    return x && // Disable packing events which will be emitted to parent frames.
    !W && (L = x(L)), L;
  };
  ne = (L, $) => {
    var P;
    const F = L;
    if (F.timestamp = ht(), (P = Be[0]) != null && P.isFrozen() && F.type !== G.FullSnapshot && !(F.type === G.IncrementalSnapshot && F.data.source === j.Mutation) && Be.forEach((K) => K.unfreeze()), X)
      t == null || t(Se(F), $);
    else if (W) {
      const K = {
        type: "rrweb",
        event: Se(F),
        origin: window.location.origin,
        isCheckout: $
      };
      window.parent.postMessage(K, "*");
    }
    if (F.type === G.FullSnapshot)
      Q = F, Y = 0;
    else if (F.type === G.IncrementalSnapshot) {
      if (F.data.source === j.Mutation && F.data.isAttachIframe)
        return;
      Y++;
      const K = i && Y >= i, V = r && F.timestamp - Q.timestamp > r;
      (K || V) && At(!0);
    }
  };
  const R = (L) => {
    ne({
      type: G.IncrementalSnapshot,
      data: {
        source: j.Mutation,
        ...L
      }
    });
  }, xe = (L) => ne({
    type: G.IncrementalSnapshot,
    data: {
      source: j.Scroll,
      ...L
    }
  }), ue = (L) => ne({
    type: G.IncrementalSnapshot,
    data: {
      source: j.CanvasMutation,
      ...L
    }
  }), _ = (L) => ne({
    type: G.IncrementalSnapshot,
    data: {
      source: j.AdoptedStyleSheet,
      ...L
    }
  }), N = new qu({
    mutationCb: R,
    adoptedStyleSheetCb: _
  }), z = new Tu({
    mirror: Ce,
    mutationCb: R,
    stylesheetManager: N,
    recordCrossOriginIframes: k,
    wrappedEmit: ne
  });
  for (const L of A || [])
    L.getMirror && L.getMirror({
      nodeMirror: Ce,
      crossOriginIframeMirror: z.crossOriginIframeMirror,
      crossOriginIframeStyleMirror: z.crossOriginIframeStyleMirror
    });
  const T = new ju();
  pn = new Wu({
    recordCanvas: y,
    mutationCb: ue,
    win: window,
    blockClass: n,
    blockSelector: s,
    mirror: Ce,
    sampling: b.canvas,
    dataURLOptions: v
  });
  const q = new Nu({
    mutationCb: R,
    scrollCb: xe,
    bypassOptions: {
      blockClass: n,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskInputOptions: J,
      dataURLOptions: v,
      maskTextFn: f,
      maskInputFn: m,
      recordCanvas: y,
      inlineImages: D,
      sampling: b,
      slimDOMOptions: ie,
      iframeManager: z,
      stylesheetManager: N,
      canvasManager: pn,
      keepIframeSrcFn: C,
      processedNodeManager: T
    },
    mirror: Ce
  });
  At = (L = !1) => {
    if (!w)
      return;
    ne(
      {
        type: G.Meta,
        data: {
          href: window.location.href,
          width: xo(),
          height: wo()
        }
      },
      L
    ), N.reset(), q.init(), Be.forEach((P) => P.lock());
    const $ = xc(document, {
      mirror: Ce,
      blockClass: n,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskAllInputs: J,
      maskTextFn: f,
      maskInputFn: m,
      slimDOM: ie,
      dataURLOptions: v,
      recordCanvas: y,
      inlineImages: D,
      onSerialize: (P) => {
        Co(P, Ce) && z.addIframe(P), Eo(P, Ce) && N.trackLinkElement(P), bn(P) && q.addShadowRoot(B.shadowRoot(P), document);
      },
      onIframeLoad: (P, F) => {
        z.attachIframe(P, F), q.observeAttachShadow(P);
      },
      onStylesheetLoad: (P, F) => {
        N.attachLinkElement(P, F);
      },
      keepIframeSrcFn: C
    });
    if (!$)
      return console.warn("Failed to snapshot the document");
    ne(
      {
        type: G.FullSnapshot,
        data: {
          node: $,
          initialOffset: vo(window)
        }
      },
      L
    ), Be.forEach((P) => P.unlock()), document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0 && N.adoptStyleSheets(
      document.adoptedStyleSheets,
      Ce.getId(document)
    );
  };
  try {
    const L = [], $ = (F) => {
      var K;
      return H(Pu)(
        {
          mutationCb: R,
          mousemoveCb: (V, pe) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: pe,
              positions: V
            }
          }),
          mouseInteractionCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.MouseInteraction,
              ...V
            }
          }),
          scrollCb: xe,
          viewportResizeCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.ViewportResize,
              ...V
            }
          }),
          inputCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.Input,
              ...V
            }
          }),
          mediaInteractionCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.MediaInteraction,
              ...V
            }
          }),
          styleSheetRuleCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.StyleSheetRule,
              ...V
            }
          }),
          styleDeclarationCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.StyleDeclaration,
              ...V
            }
          }),
          canvasMutationCb: ue,
          fontCb: (V) => ne({
            type: G.IncrementalSnapshot,
            data: {
              source: j.Font,
              ...V
            }
          }),
          selectionCb: (V) => {
            ne({
              type: G.IncrementalSnapshot,
              data: {
                source: j.Selection,
                ...V
              }
            });
          },
          customElementCb: (V) => {
            ne({
              type: G.IncrementalSnapshot,
              data: {
                source: j.CustomElement,
                ...V
              }
            });
          },
          blockClass: n,
          ignoreClass: c,
          ignoreSelector: d,
          maskTextClass: o,
          maskTextSelector: p,
          maskInputOptions: J,
          inlineStylesheet: a,
          sampling: b,
          recordDOM: w,
          recordCanvas: y,
          inlineImages: D,
          userTriggeredOnInput: O,
          collectFonts: M,
          doc: F,
          maskInputFn: m,
          maskTextFn: f,
          keepIframeSrcFn: C,
          blockSelector: s,
          slimDOMOptions: ie,
          dataURLOptions: v,
          mirror: Ce,
          iframeManager: z,
          stylesheetManager: N,
          shadowDomManager: q,
          processedNodeManager: T,
          canvasManager: pn,
          ignoreCSSAttributes: ye,
          plugins: ((K = A == null ? void 0 : A.filter((V) => V.observer)) == null ? void 0 : K.map((V) => ({
            observer: V.observer,
            options: V.options,
            callback: (pe) => ne({
              type: G.Plugin,
              data: {
                plugin: V.name,
                payload: pe
              }
            })
          }))) || []
        },
        g
      );
    };
    z.addLoadListener((F) => {
      try {
        L.push($(F.contentDocument));
      } catch (K) {
        console.warn(K);
      }
    });
    const P = () => {
      At(), L.push($(document)), Ft = !0;
    };
    return ["interactive", "complete"].includes(document.readyState) ? P() : (L.push(
      he("DOMContentLoaded", () => {
        ne({
          type: G.DomContentLoaded,
          data: {}
        }), E === "DOMContentLoaded" && P();
      })
    ), L.push(
      he(
        "load",
        () => {
          ne({
            type: G.Load,
            data: {}
          }), E === "load" && P();
        },
        window
      )
    )), () => {
      L.forEach((F) => {
        try {
          F();
        } catch (K) {
          String(K).toLowerCase().includes("cross-origin") || console.warn(K);
        }
      }), T.destroy(), Ft = !1, vu();
    };
  } catch (L) {
    console.warn(L);
  }
}
$e.addCustomEvent = (e, t) => {
  if (!Ft)
    throw new Error("please add custom event after start recording");
  ne({
    type: G.Custom,
    data: {
      tag: e,
      payload: t
    }
  });
};
$e.freezePage = () => {
  Be.forEach((e) => e.freeze());
};
$e.takeFullSnapshot = (e) => {
  if (!Ft)
    throw new Error("please take full snapshot after start recording");
  At(e);
};
$e.mirror = Ce;
var Ms;
(function(e) {
  e[e.NotStarted = 0] = "NotStarted", e[e.Running = 1] = "Running", e[e.Stopped = 2] = "Stopped";
})(Ms || (Ms = {}));
const { addCustomEvent: bh } = $e, { freezePage: vh } = $e, { takeFullSnapshot: wh } = $e, fn = 2, Hu = 4;
class Vu {
  constructor(t) {
    yt(this, "events", []);
    yt(this, "lastMeta", null);
    yt(this, "lastFull", null);
    this.opts = t;
  }
  push(t) {
    t.type === Hu && (this.lastMeta = t), t.type === fn && (this.lastFull = t, this.events = []), this.events.push(t), this.prune();
  }
  prune() {
    if (!this.events.length) return;
    const r = this.events[this.events.length - 1].timestamp - this.opts.windowMs;
    let i = 0;
    for (; i < this.events.length && this.events[i].timestamp < r; ) i++;
    i > 0 && (this.events = this.events.slice(i)), this.events.length > this.opts.maxEvents && (this.events = this.events.slice(this.events.length - this.opts.maxEvents));
  }
  /** A playable, head-anchored copy: [meta?, fullSnapshot, ...trailing incrementals]. */
  snapshot() {
    const t = [];
    return !this.events.some((i) => i.type === fn) && this.lastFull && (this.lastMeta && t.push(this.lastMeta), t.push(this.lastFull)), [...t, ...this.events];
  }
  /** True when the buffer can produce a scrubbable replay (a full snapshot + at least one more event). */
  isPlayable() {
    const t = this.snapshot();
    return t.some((i) => i.type === fn) && t.length >= 2;
  }
  clear() {
    this.events = [], this.lastMeta = null, this.lastFull = null;
  }
}
function Gu(e, t = {}) {
  const r = new Vu({
    windowMs: t.windowMs ?? 45e3,
    maxEvents: t.maxEvents ?? 2e3
  }), i = t.maskAllInputs !== !1, n = t.maskText !== !1;
  let s;
  try {
    s = e({
      emit(c) {
        try {
          r.push(c);
        } catch {
        }
      },
      maskAllInputs: i,
      // Mask every text node by default. rrweb calls maskTextFn(text) per node; '*' keeps layout.
      maskTextFn: n ? (c) => "*".repeat(c.length) : void 0,
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
const Yu = "klav-sims-live", Xu = "klav-sims-overlay", Rs = "klav-sims-ext-css";
let we = null, Ee = null, ve = null, me = null, rt = null, Do = "critical";
const _e = /* @__PURE__ */ new Map(), Ut = /* @__PURE__ */ new Set(), Bt = /* @__PURE__ */ new Map(), Ju = `
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
`, Ku = `
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
function Os(e, t) {
  const r = e.replace("#", ""), i = (d) => parseInt(d, 16), [n, s, c] = r.length === 3 ? [i(r[0] + r[0]), i(r[1] + r[1]), i(r[2] + r[2])] : [i(r.slice(0, 2)), i(r.slice(2, 4)), i(r.slice(4, 6))];
  return `rgba(${n},${s},${c},${t})`;
}
function Zu(e) {
  if (e.severity === "high" || e.severity === "critical") return !0;
  const t = /* @__PURE__ */ new Set(["frustrated", "confused", "alarmed", "negative", "blocked", "stuck"]);
  return !!(e.sentiment && t.has(e.sentiment.toLowerCase()));
}
function Qu(e) {
  const t = Math.round((e.x + e.w / 2) * window.innerWidth), r = Math.round((e.y + e.h / 2) * window.innerHeight), i = [];
  for (const s of [me, we])
    s && (i.push({ el: s, vis: s.style.visibility }), s.style.visibility = "hidden");
  const n = document.elementFromPoint(t, r);
  for (const { el: s, vis: c } of i) s.style.visibility = c;
  return !n || n === document.body || n === document.documentElement ? null : n;
}
function eh() {
  if (we && Ee) return Ee;
  we = document.createElement("div"), we.id = Yu, we.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;", Ee = we.attachShadow({ mode: "open" }), wl(Ee);
  const e = document.createElement("style");
  return e.textContent = Ju, Ee.appendChild(e), document.body.appendChild(we), Ee;
}
function zo() {
  if (me) return me;
  if (!document.getElementById(Rs)) {
    const e = document.createElement("style");
    e.id = Rs, e.textContent = Ku, document.head.appendChild(e);
  }
  return me = document.createElement("div"), me.id = Xu, me.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483640;pointer-events:none;overflow:visible;", document.body.appendChild(me), me;
}
function th(e, t = [], r = {}) {
  if (typeof document > "u") return;
  ot(), Do = r.mode ?? "critical";
  const i = eh();
  zo(), rt = new AbortController(), document.addEventListener(
    "keydown",
    (d) => {
      d.key === "Escape" && ot();
    },
    { signal: rt.signal }
  );
  const n = document.createElement("div");
  n.className = "ksl-sr", n.id = "ksl-announcer", n.setAttribute("aria-live", "polite"), n.setAttribute("aria-atomic", "true"), i.appendChild(n), ve = document.createElement("div"), ve.className = "ksl-dock", ve.setAttribute("role", "region"), ve.setAttribute("aria-label", "Sims — live feedback"), i.appendChild(ve);
  const s = document.createElement("button");
  s.className = "ksl-close-all", s.setAttribute("aria-label", "Stop all Sim reviews"), s.title = "Stop Sim reviews", s.textContent = "✕", s.addEventListener("click", ot), ve.appendChild(s);
  const c = e === "all" ? t : t.filter((d) => e.includes(d.id));
  if (!c.length) {
    console.warn("[KlavitySims] deploy(): no matching Sims — dock not mounted."), ot();
    return;
  }
  c.slice(0, 8).forEach((d, o) => {
    const p = d.accent || "#6366f1", a = d.initials || d.name.slice(0, 2).toUpperCase(), h = document.createElement("div");
    h.className = "ksl-slot", h.dataset.simId = d.id, h.setAttribute("aria-label", d.name), h.style.setProperty("--ksl-idx", String(o)), h.style.setProperty("--ksl-accent", p);
    const u = window.innerWidth <= 480 ? 38 : 46;
    h.appendChild(Ws({ name: d.name, initials: a, photoUrl: d.photoUrl, color: p, animate: !0, legs: !0, size: u }));
    const l = "http://www.w3.org/2000/svg", m = document.createElementNS(l, "svg");
    m.setAttribute("class", "ksl-ring"), m.setAttribute("width", "62"), m.setAttribute("height", "62"), m.setAttribute("viewBox", "0 0 62 62"), m.setAttribute("aria-hidden", "true");
    const f = document.createElementNS(l, "circle");
    f.setAttribute("cx", "31"), f.setAttribute("cy", "31"), f.setAttribute("r", "29"), m.appendChild(f), h.appendChild(m);
    const g = document.createElement("span");
    g.className = "ksl-time-hint", g.textContent = "~5s", g.setAttribute("aria-hidden", "true"), h.appendChild(g);
    const x = document.createElement("span");
    x.className = "ksl-idle", x.textContent = "watching", x.setAttribute("aria-hidden", "true"), h.appendChild(x), ve.appendChild(h), _e.set(d.id, { avatarEl: h, accent: p, initials: a, name: d.name, clearBubble: null });
  });
}
function rh(e) {
  _e.forEach(({ avatarEl: t }) => t.classList.toggle("ksl-thinking", e));
}
function nh(e, t, r) {
  const i = me, n = we.getBoundingClientRect(), s = n.left + n.width / 2 - 21, c = n.top + n.height / 2 - 48, d = document.createElement("div");
  return d.className = "klav-walker", d.style.left = s + "px", d.style.top = c + "px", d.appendChild(
    Ws({ name: e.name, initials: e.initials, color: e.accent, animate: !1, legs: !0, size: 42 })
  ), i.appendChild(d), Ut.add(d), new Promise((o) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.style.left = t + "px", d.style.top = r + "px";
      const p = () => {
        d.remove(), Ut.delete(d), o();
      };
      d.addEventListener("transitionend", p, { once: !0 }), setTimeout(p, 1400);
    }));
  });
}
function ih(e, t, r) {
  const i = zo(), n = r.getBoundingClientRect(), s = `pin_${e.name}_${Date.now()}`, c = document.createElement("div");
  c.className = "klav-halo", c.style.cssText = [
    `left:${n.left - 5}px`,
    `top:${n.top - 5}px`,
    `width:${n.width + 10}px`,
    `height:${n.height + 10}px`,
    `border-color:${e.accent}`,
    `box-shadow:0 0 0 4px ${Os(e.accent, 0.16)},0 0 24px ${Os(e.accent, 0.2)}`
  ].join(";"), i.appendChild(c);
  const d = 224, o = 150;
  let p = n.left, a = n.top - o - 14;
  p = Math.max(10, Math.min(window.innerWidth - d - 10, p)), a < 10 && (a = n.bottom + 14);
  const h = document.createElement("div");
  h.className = "klav-pin", h.style.borderLeftColor = e.accent, h.style.left = p + "px", h.style.top = a + "px", h.setAttribute("role", "status"), h.setAttribute("aria-label", `Pinned feedback from ${e.name}`);
  const u = document.createElement("div");
  u.className = "klav-pin-hd";
  const l = document.createElement("div");
  l.className = "klav-pin-av", l.style.background = e.accent, l.textContent = e.initials;
  const m = document.createElement("span");
  if (m.className = "klav-pin-name", m.style.color = e.accent, m.textContent = e.name, u.appendChild(l), u.appendChild(m), t.severity && t.severity !== "none") {
    const v = t.severity === "medium" ? " sev-m" : t.severity === "low" ? " sev-l" : "", S = document.createElement("span");
    S.className = `klav-pin-sev${v}`, S.setAttribute("aria-label", `Severity: ${t.severity}`), S.textContent = t.severity, u.appendChild(S);
  }
  const f = document.createElement("div");
  f.className = "klav-pin-obs", f.textContent = t.text || "";
  const g = document.createElement("div");
  g.className = "klav-pin-actions";
  const x = document.createElement("button");
  x.className = "klav-pin-triage", x.textContent = "🐛 Triage as bug", x.setAttribute("aria-label", `Triage observation from ${e.name} as a bug`), x.addEventListener("click", () => {
    var v;
    (v = Lt.onTriage) == null || v.call(Lt, t, e.name);
  });
  const b = document.createElement("button");
  b.className = "klav-pin-dismiss", b.textContent = "Dismiss", b.setAttribute("aria-label", `Dismiss pinned feedback from ${e.name}`), b.addEventListener("click", () => {
    h.classList.add("is-out"), c.style.animation = "klav-pin-out .22s ease-in forwards", setTimeout(() => {
      h.remove(), c.remove(), Bt.delete(s);
    }, 240);
  }), g.appendChild(x), g.appendChild(b), h.appendChild(u), h.appendChild(f), h.appendChild(g), i.appendChild(h), Bt.set(s, { halo: c, bubble: h });
}
async function sh(e, t) {
  if (!me || !we) return;
  const r = t.region, i = Qu(r);
  if (!i) {
    Fo(e, [t]);
    return;
  }
  const n = i.getBoundingClientRect(), s = Math.max(8, Math.min(window.innerWidth - 60, n.left + n.width * 0.1 - 21)), c = Math.min(window.innerHeight - 80, n.bottom - 58);
  await nh(e, s, c), ih(e, t, i);
}
function Fo(e, t) {
  var l;
  if (!ve || !Ee) return;
  (l = e.clearBubble) == null || l.call(e);
  const r = t[0], i = t.length - 1, n = Ee.getElementById("ksl-announcer");
  n && (n.textContent = "", requestAnimationFrame(() => {
    if (!Ee) return;
    const m = Ee.getElementById("ksl-announcer");
    m && (m.textContent = `${e.name}: ${r.text || ""}${i > 0 ? ` and ${i} more` : ""}`);
  }));
  const s = document.createElement("div");
  s.className = "ksl-bubble", s.setAttribute("role", "status"), s.setAttribute("aria-label", `Feedback from ${e.name}`), s.style.borderLeftColor = e.accent;
  const c = document.createElement("button");
  c.className = "ksl-b-close", c.setAttribute("aria-label", `Dismiss feedback from ${e.name}`), c.textContent = "✕";
  const d = document.createElement("div");
  if (d.className = "ksl-b-tag", d.style.color = e.accent, d.textContent = e.name, r.severity && r.severity !== "none") {
    const m = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", f = document.createElement("span");
    f.className = `ksl-b-sev${m}`.replace("sev-m", "sev-m").replace("sev-l", "sev-l"), f.textContent = r.severity, d.appendChild(f);
  }
  const o = document.createElement("div");
  if (o.className = "ksl-b-obs", o.textContent = r.text || "", s.appendChild(c), s.appendChild(d), s.appendChild(o), i > 0) {
    const m = document.createElement("div");
    m.className = "ksl-b-more", m.textContent = `+${i} more observation${i > 1 ? "s" : ""}`, s.appendChild(m);
  }
  e.avatarEl.appendChild(s), e.avatarEl.classList.add("ksl-has-bubble");
  let p = !1;
  const a = () => {
    var m;
    p || (p = !0, clearTimeout(h), s.classList.add("is-out"), setTimeout(() => {
      var f;
      s.remove(), ((f = _e.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : f.clearBubble) === u && e.avatarEl.classList.remove("ksl-has-bubble");
    }, 265), ((m = _e.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : m.clearBubble) === u && (_e.get(e.avatarEl.dataset.simId ?? "").clearBubble = null));
  }, h = setTimeout(a, 14e3), u = () => {
    clearTimeout(h), a();
  };
  c.addEventListener("click", u), e.clearBubble = u;
}
function oh(e, t, r) {
  if (!ve) return;
  const i = _e.get(e);
  if (!i) {
    console.warn(`[KlavitySims] renderFeedback: simId "${e}" not in dock`);
    return;
  }
  if (!r.length) return;
  const n = [], s = [];
  for (const c of r)
    c.region && (Do === "all" || Zu(c)) ? n.push(c) : s.push(c);
  n.forEach((c, d) => {
    setTimeout(() => void sh(i, c), d * 500);
  }), s.length && Fo(i, s);
}
function ot() {
  _e.forEach((e) => {
    var t;
    (t = e.clearBubble) == null || t.call(e), e.clearBubble = null;
  }), _e.clear(), rt == null || rt.abort(), rt = null, Ut.forEach((e) => e.remove()), Ut.clear(), Bt.forEach(({ halo: e, bubble: t }) => {
    e.remove(), t.remove();
  }), Bt.clear(), me == null || me.remove(), me = null, ve == null || ve.remove(), ve = null, we == null || we.remove(), we = null, Ee = null;
}
const Lt = {
  deploy: th,
  setReviewing: rh,
  renderFeedback: oh,
  undeploy: ot,
  onTriage: null
};
function ah() {
  typeof window > "u" || window.KlavitySims || (window.KlavitySims = Lt);
}
typeof window < "u" && ah();
const Is = "klav-ao-css", lh = "klav-ao-overlay";
function ch(e, t, r, i, n, s = 10) {
  const o = !(e.y - r - 14 >= s), p = o ? e.y + e.h + 14 : e.y - r - 14, a = Math.max(s, Math.min(p, n - r - s));
  return { left: Math.max(s, Math.min(e.x, i - t - s)), top: a, below: o };
}
const uh = `
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
let Ue = null, hh = 1;
const Wt = /* @__PURE__ */ new Map();
function As(e, t) {
  const r = e.replace("#", ""), i = (d) => parseInt(d, 16), [n, s, c] = r.length === 3 ? [i(r[0] + r[0]), i(r[1] + r[1]), i(r[2] + r[2])] : [i(r.slice(0, 2)), i(r.slice(2, 4)), i(r.slice(4, 6))];
  return `rgba(${n},${s},${c},${t})`;
}
function dh() {
  if (Ue) return Ue;
  if (!document.getElementById(Is)) {
    const e = document.createElement("style");
    e.id = Is, e.textContent = uh, document.head.appendChild(e);
  }
  return Ue = document.createElement("div"), Ue.id = lh, Ue.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:visible;z-index:2147483640;", document.body.appendChild(Ue), Ue;
}
function xh(e, t, r = {}) {
  const i = dh(), n = r.color ?? "#6366f1", s = `klav-ao-${hh++}`, c = 5, d = document.createElement("div");
  d.className = "klav-ao-halo", d.dataset.aoId = s, d.style.left = e.x - c + "px", d.style.top = e.y - c + "px", d.style.width = e.w + c * 2 + "px", d.style.height = e.h + c * 2 + "px", d.style.borderColor = n, d.style.boxShadow = `0 0 0 4px ${As(n, 0.14)},0 0 24px ${As(n, 0.18)}`, i.appendChild(d);
  let o = null;
  if (t) {
    const h = { x: e.x - c, y: e.y - c, w: e.w + c * 2, h: e.h + c * 2 }, { left: u, top: l, below: m } = ch(
      h,
      224,
      96,
      window.innerWidth,
      window.innerHeight
    );
    o = document.createElement("div"), o.className = "klav-ao-pin" + (m ? " tail-top" : ""), o.dataset.aoId = s, o.style.borderLeftColor = n, o.style.left = u + "px", o.style.top = l + "px", o.setAttribute("role", "status"), o.setAttribute("aria-label", `Annotation: ${t}`);
    const f = document.createElement("div");
    f.className = "klav-ao-hd";
    const g = document.createElement("span");
    if (g.className = "klav-ao-lbl", g.style.color = n, g.textContent = t, f.appendChild(g), r.severity) {
      const b = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", v = document.createElement("span");
      v.className = `klav-ao-sev${b}`, v.textContent = r.severity, f.appendChild(v);
    }
    const x = document.createElement("button");
    x.className = "klav-ao-dismiss", x.textContent = "Dismiss", x.addEventListener("click", () => Uo(s)), o.appendChild(f), o.appendChild(x), i.appendChild(o);
  }
  return Wt.set(s, { halo: d, pin: o }), s;
}
function Uo(e) {
  const t = Wt.get(e);
  if (!t) return;
  Wt.delete(e);
  const { halo: r, pin: i } = t;
  i ? (i.classList.add("is-out"), r.style.animation = "klav-ao-pin-out .22s ease-in forwards", setTimeout(() => {
    i.remove(), r.remove();
  }, 240)) : r.remove();
}
function kh() {
  for (const e of [...Wt.keys()]) Uo(e);
}
let Bo = Je;
const Wo = { consoleErrors: [], networkFailures: [] };
let qo, jo, nt = null;
function Ho(e) {
  const t = {};
  for (const [r, i] of Object.entries(e))
    i != null && (t[String(r).slice(0, 64)] = String(i).slice(0, 1e3));
  return t;
}
async function Ls() {
  return Ha(document.body, {
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
function ph() {
  return tl(Wo, { identity: qo, metadata: jo });
}
async function fh(e) {
  return Xa(
    { type: e.type, description: e.description, context: e.context, screenshots: e.screenshots, replayEvents: e.replayEvents },
    Bo,
    { jira: kl, linear: Sl, github: Cl, plane: El, backend: Ml }
  );
}
function Bn(e = "bug") {
  const t = hl(e, {
    onCaptureFull: Ls,
    onSubmit: async (r) => fh({
      type: r.type,
      description: r.description,
      context: ph(),
      screenshots: r.screenshots,
      replayEvents: (nt == null ? void 0 : nt.getEvents()) ?? []
    })
  });
  setTimeout(async () => {
    try {
      const r = await Ls();
      t.addScreenshot(r);
    } catch {
    }
  }, 200);
}
function mh() {
  rl(Wo, { consoleLevels: !0 });
}
function Vo(e) {
  qo = e ? Ho(e) : void 0;
}
function Go(e) {
  jo = e ? Ho(e) : void 0;
}
function gh() {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 200)}px;top:${Math.min(e.clientY, window.innerHeight - 80)}px;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:4px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:system-ui;`, t.innerHTML = `
      <div data-action="bug" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${oe("bug")} Report a Bug</div>
      <div data-action="feature" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${oe("lightbulb")} Request a Feature</div>
    `, document.body.appendChild(t);
    const r = (i) => {
      (!i || !t.contains(i.target)) && (t.remove(), document.removeEventListener("click", r));
    };
    t.addEventListener("click", (i) => {
      var s;
      const n = (s = i.target.closest("[data-action]")) == null ? void 0 : s.getAttribute("data-action");
      t.remove(), document.removeEventListener("click", r), n && Bn(n);
    }), setTimeout(() => document.addEventListener("click", r), 0);
  });
}
function Yo(e = {}) {
  if (Bo = {
    ...Je,
    ...e,
    jira: { ...Je.jira, ...e.jira },
    linear: { ...Je.linear, ...e.linear },
    github: { ...Je.github, ...e.github },
    plane: { ...Je.plane, ...e.plane }
  }, mh(), gh(), !nt)
    try {
      nt = Gu($e);
    } catch {
      nt = null;
    }
}
typeof window < "u" && (window.KlavitySnap = { init: Yo, openModal: Bn, identify: Vo, setMetadata: Go });
const Sh = { init: Yo, openModal: Bn, identify: Vo, setMetadata: Go };
export {
  Lt as KlavitySims,
  Lt as SimsLive,
  Uo as clearAnnotation,
  kh as clearAnnotations,
  Sh as default,
  Vo as identify,
  Yo as init,
  ah as installKlavitySims,
  Bn as openModal,
  Go as setMetadata,
  xh as showAnnotation
};
