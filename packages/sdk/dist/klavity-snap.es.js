var Ha = Object.defineProperty;
var Va = (e, t, r) => t in e ? Ha(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var Wt = (e, t, r) => Va(e, typeof t != "symbol" ? t + "" : t, r);
function Ya(e, t) {
  if (e.match(/^[a-z]+:\/\//i))
    return e;
  if (e.match(/^\/\//))
    return window.location.protocol + e;
  if (e.match(/^[a-z]+:/i))
    return e;
  const r = document.implementation.createHTMLDocument(), i = r.createElement("base"), n = r.createElement("a");
  return r.head.appendChild(i), r.body.appendChild(n), t && (i.href = t), n.href = e, n.href;
}
const Ga = /* @__PURE__ */ (() => {
  let e = 0;
  const t = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => (e += 1, `u${t()}${e}`);
})();
function Qe(e) {
  const t = [];
  for (let r = 0, i = e.length; r < i; r++)
    t.push(e[r]);
  return t;
}
let pt = null;
function bo(e = {}) {
  return pt || (e.includeStyleProperties ? (pt = e.includeStyleProperties, pt) : (pt = Qe(window.getComputedStyle(document.documentElement)), pt));
}
function ar(e, t) {
  const i = (e.ownerDocument.defaultView || window).getComputedStyle(e).getPropertyValue(t);
  return i ? parseFloat(i.replace("px", "")) : 0;
}
function Xa(e) {
  const t = ar(e, "border-left-width"), r = ar(e, "border-right-width");
  return e.clientWidth + t + r;
}
function Ja(e) {
  const t = ar(e, "border-top-width"), r = ar(e, "border-bottom-width");
  return e.clientHeight + t + r;
}
function vo(e, t = {}) {
  const r = t.width || Xa(e), i = t.height || Ja(e);
  return { width: r, height: i };
}
function Ka() {
  let e, t;
  try {
    t = process;
  } catch {
  }
  const r = t && t.env ? t.env.devicePixelRatio : null;
  return r && (e = parseInt(r, 10), Number.isNaN(e) && (e = 1)), e || window.devicePixelRatio || 1;
}
const Me = 16384;
function Za(e) {
  (e.width > Me || e.height > Me) && (e.width > Me && e.height > Me ? e.width > e.height ? (e.height *= Me / e.width, e.width = Me) : (e.width *= Me / e.height, e.height = Me) : e.width > Me ? (e.height *= Me / e.width, e.width = Me) : (e.width *= Me / e.height, e.height = Me));
}
function lr(e) {
  return new Promise((t, r) => {
    const i = new Image();
    i.onload = () => {
      i.decode().then(() => {
        requestAnimationFrame(() => t(i));
      });
    }, i.onerror = r, i.crossOrigin = "anonymous", i.decoding = "async", i.src = e;
  });
}
async function Qa(e) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then((t) => `data:image/svg+xml;charset=utf-8,${t}`);
}
async function el(e, t, r) {
  const i = "http://www.w3.org/2000/svg", n = document.createElementNS(i, "svg"), s = document.createElementNS(i, "foreignObject");
  return n.setAttribute("width", `${t}`), n.setAttribute("height", `${r}`), n.setAttribute("viewBox", `0 0 ${t} ${r}`), s.setAttribute("width", "100%"), s.setAttribute("height", "100%"), s.setAttribute("x", "0"), s.setAttribute("y", "0"), s.setAttribute("externalResourcesRequired", "true"), n.appendChild(s), s.appendChild(e), Qa(n);
}
const Se = (e, t) => {
  if (e instanceof t)
    return !0;
  const r = Object.getPrototypeOf(e);
  return r === null ? !1 : r.constructor.name === t.name || Se(r, t);
};
function tl(e) {
  const t = e.getPropertyValue("content");
  return `${e.cssText} content: '${t.replace(/'|"/g, "")}';`;
}
function rl(e, t) {
  return bo(t).map((r) => {
    const i = e.getPropertyValue(r), n = e.getPropertyPriority(r);
    return `${r}: ${i}${n ? " !important" : ""};`;
  }).join(" ");
}
function nl(e, t, r, i) {
  const n = `.${e}:${t}`, s = r.cssText ? tl(r) : rl(r, i);
  return document.createTextNode(`${n}{${s}}`);
}
function Mi(e, t, r, i) {
  const n = window.getComputedStyle(e, r), s = n.getPropertyValue("content");
  if (s === "" || s === "none")
    return;
  const l = Ga();
  try {
    t.className = `${t.className} ${l}`;
  } catch {
    return;
  }
  const d = document.createElement("style");
  d.appendChild(nl(l, r, n, i)), t.appendChild(d);
}
function il(e, t, r) {
  Mi(e, t, ":before", r), Mi(e, t, ":after", r);
}
const Ri = "application/font-woff", Oi = "image/jpeg", sl = {
  woff: Ri,
  woff2: Ri,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: Oi,
  jpeg: Oi,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function ol(e) {
  const t = /\.([^./]*?)$/g.exec(e);
  return t ? t[1] : "";
}
function Zn(e) {
  const t = ol(e).toLowerCase();
  return sl[t] || "";
}
function al(e) {
  return e.split(/,/)[1];
}
function Hn(e) {
  return e.search(/^(data:)/) !== -1;
}
function ll(e, t) {
  return `data:${t};base64,${e}`;
}
async function wo(e, t, r) {
  const i = await fetch(e, t);
  if (i.status === 404)
    throw new Error(`Resource "${i.url}" not found`);
  const n = await i.blob();
  return new Promise((s, l) => {
    const d = new FileReader();
    d.onerror = l, d.onloadend = () => {
      try {
        s(r({ res: i, result: d.result }));
      } catch (o) {
        l(o);
      }
    }, d.readAsDataURL(n);
  });
}
const _r = {};
function cl(e, t, r) {
  let i = e.replace(/\?.*/, "");
  return r && (i = e), /ttf|otf|eot|woff2?/i.test(i) && (i = i.replace(/.*\//, "")), t ? `[${t}]${i}` : i;
}
async function Qn(e, t, r) {
  const i = cl(e, t, r.includeQueryParams);
  if (_r[i] != null)
    return _r[i];
  r.cacheBust && (e += (/\?/.test(e) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime());
  let n;
  try {
    const s = await wo(e, r.fetchRequestInit, ({ res: l, result: d }) => (t || (t = l.headers.get("Content-Type") || ""), al(d)));
    n = ll(s, t);
  } catch (s) {
    n = r.imagePlaceholder || "";
    let l = `Failed to fetch resource: ${e}`;
    s && (l = typeof s == "string" ? s : s.message), l && console.warn(l);
  }
  return _r[i] = n, n;
}
async function ul(e) {
  const t = e.toDataURL();
  return t === "data:," ? e.cloneNode(!1) : lr(t);
}
async function dl(e, t) {
  if (e.currentSrc) {
    const s = document.createElement("canvas"), l = s.getContext("2d");
    s.width = e.clientWidth, s.height = e.clientHeight, l == null || l.drawImage(e, 0, 0, s.width, s.height);
    const d = s.toDataURL();
    return lr(d);
  }
  const r = e.poster, i = Zn(r), n = await Qn(r, i, t);
  return lr(n);
}
async function hl(e, t) {
  var r;
  try {
    if (!((r = e == null ? void 0 : e.contentDocument) === null || r === void 0) && r.body)
      return await vr(e.contentDocument.body, t, !0);
  } catch {
  }
  return e.cloneNode(!1);
}
async function pl(e, t) {
  return Se(e, HTMLCanvasElement) ? ul(e) : Se(e, HTMLVideoElement) ? dl(e, t) : Se(e, HTMLIFrameElement) ? hl(e, t) : e.cloneNode(xo(e));
}
const fl = (e) => e.tagName != null && e.tagName.toUpperCase() === "SLOT", xo = (e) => e.tagName != null && e.tagName.toUpperCase() === "SVG";
async function ml(e, t, r) {
  var i, n;
  if (xo(t))
    return t;
  let s = [];
  return fl(e) && e.assignedNodes ? s = Qe(e.assignedNodes()) : Se(e, HTMLIFrameElement) && (!((i = e.contentDocument) === null || i === void 0) && i.body) ? s = Qe(e.contentDocument.body.childNodes) : s = Qe(((n = e.shadowRoot) !== null && n !== void 0 ? n : e).childNodes), s.length === 0 || Se(e, HTMLVideoElement) || await s.reduce((l, d) => l.then(() => vr(d, r)).then((o) => {
    o && t.appendChild(o);
  }), Promise.resolve()), t;
}
function gl(e, t, r) {
  const i = t.style;
  if (!i)
    return;
  const n = window.getComputedStyle(e);
  n.cssText ? (i.cssText = n.cssText, i.transformOrigin = n.transformOrigin) : bo(r).forEach((s) => {
    let l = n.getPropertyValue(s);
    s === "font-size" && l.endsWith("px") && (l = `${Math.floor(parseFloat(l.substring(0, l.length - 2))) - 0.1}px`), Se(e, HTMLIFrameElement) && s === "display" && l === "inline" && (l = "block"), s === "d" && t.getAttribute("d") && (l = `path(${t.getAttribute("d")})`), i.setProperty(s, l, n.getPropertyPriority(s));
  });
}
function yl(e, t) {
  Se(e, HTMLTextAreaElement) && (t.innerHTML = e.value), Se(e, HTMLInputElement) && t.setAttribute("value", e.value);
}
function bl(e, t) {
  if (Se(e, HTMLSelectElement)) {
    const i = Array.from(t.children).find((n) => e.value === n.getAttribute("value"));
    i && i.setAttribute("selected", "");
  }
}
function vl(e, t, r) {
  return Se(t, Element) && (gl(e, t, r), il(e, t, r), yl(e, t), bl(e, t)), t;
}
async function wl(e, t) {
  const r = e.querySelectorAll ? e.querySelectorAll("use") : [];
  if (r.length === 0)
    return e;
  const i = {};
  for (let s = 0; s < r.length; s++) {
    const d = r[s].getAttribute("xlink:href");
    if (d) {
      const o = e.querySelector(d), p = document.querySelector(d);
      !o && p && !i[d] && (i[d] = await vr(p, t, !0));
    }
  }
  const n = Object.values(i);
  if (n.length) {
    const s = "http://www.w3.org/1999/xhtml", l = document.createElementNS(s, "svg");
    l.setAttribute("xmlns", s), l.style.position = "absolute", l.style.width = "0", l.style.height = "0", l.style.overflow = "hidden", l.style.display = "none";
    const d = document.createElementNS(s, "defs");
    l.appendChild(d);
    for (let o = 0; o < n.length; o++)
      d.appendChild(n[o]);
    e.appendChild(l);
  }
  return e;
}
async function vr(e, t, r) {
  return !r && t.filter && !t.filter(e) ? null : Promise.resolve(e).then((i) => pl(i, t)).then((i) => ml(e, i, t)).then((i) => vl(e, i, t)).then((i) => wl(i, t));
}
const ko = /url\((['"]?)([^'"]+?)\1\)/g, xl = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g, kl = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function Sl(e) {
  const t = e.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`, "g");
}
function Cl(e) {
  const t = [];
  return e.replace(ko, (r, i, n) => (t.push(n), r)), t.filter((r) => !Hn(r));
}
async function El(e, t, r, i, n) {
  try {
    const s = r ? Ya(t, r) : t, l = Zn(t);
    let d;
    return n || (d = await Qn(s, l, i)), e.replace(Sl(t), `$1${d}$3`);
  } catch {
  }
  return e;
}
function Ml(e, { preferredFontFormat: t }) {
  return t ? e.replace(kl, (r) => {
    for (; ; ) {
      const [i, , n] = xl.exec(r) || [];
      if (!n)
        return "";
      if (n === t)
        return `src: ${i};`;
    }
  }) : e;
}
function So(e) {
  return e.search(ko) !== -1;
}
async function Co(e, t, r) {
  if (!So(e))
    return e;
  const i = Ml(e, r);
  return Cl(i).reduce((s, l) => s.then((d) => El(d, l, t, r)), Promise.resolve(i));
}
async function ft(e, t, r) {
  var i;
  const n = (i = t.style) === null || i === void 0 ? void 0 : i.getPropertyValue(e);
  if (n) {
    const s = await Co(n, null, r);
    return t.style.setProperty(e, s, t.style.getPropertyPriority(e)), !0;
  }
  return !1;
}
async function Rl(e, t) {
  await ft("background", e, t) || await ft("background-image", e, t), await ft("mask", e, t) || await ft("-webkit-mask", e, t) || await ft("mask-image", e, t) || await ft("-webkit-mask-image", e, t);
}
async function Ol(e, t) {
  const r = Se(e, HTMLImageElement);
  if (!(r && !Hn(e.src)) && !(Se(e, SVGImageElement) && !Hn(e.href.baseVal)))
    return;
  const i = r ? e.src : e.href.baseVal, n = await Qn(i, Zn(i), t);
  await new Promise((s, l) => {
    e.onload = s, e.onerror = t.onImageErrorHandler ? (...o) => {
      try {
        s(t.onImageErrorHandler(...o));
      } catch (p) {
        l(p);
      }
    } : l;
    const d = e;
    d.decode && (d.decode = s), d.loading === "lazy" && (d.loading = "eager"), r ? (e.srcset = "", e.src = n) : e.href.baseVal = n;
  });
}
async function Il(e, t) {
  const i = Qe(e.childNodes).map((n) => Eo(n, t));
  await Promise.all(i).then(() => e);
}
async function Eo(e, t) {
  Se(e, Element) && (await Rl(e, t), await Ol(e, t), await Il(e, t));
}
function Al(e, t) {
  const { style: r } = e;
  t.backgroundColor && (r.backgroundColor = t.backgroundColor), t.width && (r.width = `${t.width}px`), t.height && (r.height = `${t.height}px`);
  const i = t.style;
  return i != null && Object.keys(i).forEach((n) => {
    r[n] = i[n];
  }), e;
}
const Ii = {};
async function Ai(e) {
  let t = Ii[e];
  if (t != null)
    return t;
  const i = await (await fetch(e)).text();
  return t = { url: e, cssText: i }, Ii[e] = t, t;
}
async function Li(e, t) {
  let r = e.cssText;
  const i = /url\(["']?([^"')]+)["']?\)/g, s = (r.match(/url\([^)]+\)/g) || []).map(async (l) => {
    let d = l.replace(i, "$1");
    return d.startsWith("https://") || (d = new URL(d, e.url).href), wo(d, t.fetchRequestInit, ({ result: o }) => (r = r.replace(l, `url(${o})`), [l, o]));
  });
  return Promise.all(s).then(() => r);
}
function Pi(e) {
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
  const s = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi, l = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})", d = new RegExp(l, "gi");
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
async function Ll(e, t) {
  const r = [], i = [];
  return e.forEach((n) => {
    if ("cssRules" in n)
      try {
        Qe(n.cssRules || []).forEach((s, l) => {
          if (s.type === CSSRule.IMPORT_RULE) {
            let d = l + 1;
            const o = s.href, p = Ai(o).then((a) => Li(a, t)).then((a) => Pi(a).forEach((h) => {
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
        const l = e.find((d) => d.href == null) || document.styleSheets[0];
        n.href != null && i.push(Ai(n.href).then((d) => Li(d, t)).then((d) => Pi(d).forEach((o) => {
          l.insertRule(o, l.cssRules.length);
        })).catch((d) => {
          console.error("Error loading remote stylesheet", d);
        })), console.error("Error inlining remote css file", s);
      }
  }), Promise.all(i).then(() => (e.forEach((n) => {
    if ("cssRules" in n)
      try {
        Qe(n.cssRules || []).forEach((s) => {
          r.push(s);
        });
      } catch (s) {
        console.error(`Error while reading CSS rules from ${n.href}`, s);
      }
  }), r));
}
function Pl(e) {
  return e.filter((t) => t.type === CSSRule.FONT_FACE_RULE).filter((t) => So(t.style.getPropertyValue("src")));
}
async function Tl(e, t) {
  if (e.ownerDocument == null)
    throw new Error("Provided element is not within a Document");
  const r = Qe(e.ownerDocument.styleSheets), i = await Ll(r, t);
  return Pl(i);
}
function Mo(e) {
  return e.trim().replace(/["']/g, "");
}
function Nl(e) {
  const t = /* @__PURE__ */ new Set();
  function r(i) {
    (i.style.fontFamily || getComputedStyle(i).fontFamily).split(",").forEach((s) => {
      t.add(Mo(s));
    }), Array.from(i.children).forEach((s) => {
      s instanceof HTMLElement && r(s);
    });
  }
  return r(e), t;
}
async function _l(e, t) {
  const r = await Tl(e, t), i = Nl(e);
  return (await Promise.all(r.filter((s) => i.has(Mo(s.style.fontFamily))).map((s) => {
    const l = s.parentStyleSheet ? s.parentStyleSheet.href : null;
    return Co(s.cssText, l, t);
  }))).join(`
`);
}
async function $l(e, t) {
  const r = t.fontEmbedCSS != null ? t.fontEmbedCSS : t.skipFonts ? null : await _l(e, t);
  if (r) {
    const i = document.createElement("style"), n = document.createTextNode(r);
    i.appendChild(n), e.firstChild ? e.insertBefore(i, e.firstChild) : e.appendChild(i);
  }
}
async function Dl(e, t = {}) {
  const { width: r, height: i } = vo(e, t), n = await vr(e, t, !0);
  return await $l(n, t), await Eo(n, t), Al(n, t), await el(n, r, i);
}
async function zl(e, t = {}) {
  const { width: r, height: i } = vo(e, t), n = await Dl(e, t), s = await lr(n), l = document.createElement("canvas"), d = l.getContext("2d"), o = t.pixelRatio || Ka(), p = t.canvasWidth || r, a = t.canvasHeight || i;
  return l.width = p * o, l.height = a * o, t.skipAutoScale || Za(l), l.style.width = `${p}`, l.style.height = `${a}`, t.backgroundColor && (d.fillStyle = t.backgroundColor, d.fillRect(0, 0, l.width, l.height)), d.drawImage(s, 0, 0, l.width, l.height), l;
}
async function Fl(e, t = {}) {
  return (await zl(e, t)).toDataURL();
}
const Ul = {
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
function Bl(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function K(e, t = {}) {
  const r = Ul[e];
  if (!r)
    return console.warn("[Klavity] unknown icon: " + e), "";
  const i = t.size ?? 18, n = t.class ? `icon ${t.class}` : "icon", s = t.label ? 'role="img"' : 'aria-hidden="true"', l = t.label ? `<title>${Bl(t.label)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${n}" width="${i}" height="${i}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.125em" ${s}>${l}${r}</svg>`;
}
const gt = {
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
class Wl {
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
async function ql(e, t, r) {
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
const jl = 50, Hl = 2e3, Vl = 1e3, Yl = 500, Ti = /^(?:token|access_token|refresh_token|api[_-]?key|apikey|key|secret|password|passwd|pwd|auth|authorization|session|sid|jwt|code|otp)$/i;
function qt(e, t) {
  e.push(t), e.length > jl && e.shift();
}
function ei(e, t) {
  return e.length <= t ? e : e.slice(0, t) + "…[truncated]";
}
function $r(e) {
  let t = String(e || "");
  try {
    const r = new URL(t, typeof location < "u" ? location.href : "http://localhost");
    let i = !1;
    r.searchParams.forEach((n, s) => {
      Ti.test(s) && (r.searchParams.set(s, "REDACTED"), i = !0);
    }), i && (t = r.toString());
  } catch {
    t = t.replace(/([?&])([^=&]+)=([^&]*)/g, (r, i, n, s) => Ti.test(n) ? `${i}${n}=REDACTED` : r);
  }
  return ei(t, Vl);
}
function Gl(e) {
  if (typeof e == "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return ei(JSON.stringify(e), Yl);
  } catch {
    return String(e);
  }
}
function Xl(e, t = {}) {
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
function Jl(e, t = {}) {
  if (typeof window > "u") return e;
  const r = window;
  if (r.__klavityCaptureInstalled) return e;
  r.__klavityCaptureInstalled = !0;
  const i = () => t.isContextValid ? t.isContextValid() : !0, n = (o, p, a) => {
    qt(e.consoleErrors, { message: ei(p, Hl), stack: a, timestamp: Date.now(), level: o });
  }, s = window.onerror;
  if (window.onerror = (o, p, a, h, u) => {
    var c;
    if (i()) {
      const m = String(o);
      n("error", m, u == null ? void 0 : u.stack), (c = t.onError) == null || c.call(t, m, u == null ? void 0 : u.stack);
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
          i() && n(p, h.map(Gl).join(" "));
        } catch {
        }
        return a.apply(console, h);
      });
    }
  }
  const l = window.fetch;
  window.fetch = async (...o) => {
    var u;
    if (!i()) return l(...o);
    const p = Date.now(), a = typeof o[0] == "string" ? o[0] : o[0] instanceof URL ? o[0].href : o[0].url, h = (typeof o[0] == "object" && o[0] && "method" in o[0] ? o[0].method : (u = o[1]) == null ? void 0 : u.method) || "GET";
    try {
      const c = await l(...o);
      return qt(e.networkFailures, { url: $r(a), status: c.status, method: String(h).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), c;
    } catch (c) {
      throw qt(e.networkFailures, { url: $r(a), status: 0, method: String(h).toUpperCase(), timestamp: p, durationMs: Date.now() - p }), c;
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
            qt(e.networkFailures, {
              url: $r(h.url),
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
const Kl = ["light", "dark", "glass", "neon", "custom", "liquid"], Zl = ["hidden", "icon", "full", "custom"], Ql = /^#[0-9a-fA-F]{3,8}$/, ec = /^[\w \-,'"().]+$/, tc = (e) => typeof e == "object" && e !== null, jt = (e) => typeof e == "string" && Ql.test(e.trim()) ? e.trim() : void 0, Ni = (e, t) => typeof e == "string" && e.trim() ? e.trim().slice(0, t) : void 0, rc = (e) => {
  if (typeof e != "string") return;
  const t = e.trim().slice(0, 120);
  return t && ec.test(t) ? t : void 0;
}, _i = {
  // Default = the marketing home surface: warm cream paper with Klavity-purple and amber atmosphere.
  // The panel is intentionally not stark white; chips/inputs are only a step lighter for affordance.
  light: { "--kl-overlay": "rgba(28,22,40,.30)", "--kl-bg": "#f5f3ee", "--kl-fg": "#19140f", "--kl-muted": "#574f45", "--kl-border": "rgba(25,20,15,.12)", "--kl-chip": "#fffdf8", "--kl-input-bg": "#fffdf8", "--kl-accent": "#6366f1", "--kl-on-accent": "#fff", "--kl-accent2": "#d98324", "--kl-radius": "16px", "--kl-shadow": "0 24px 60px rgba(40,28,70,.18), 0 10px 30px rgba(99,102,241,.10)", "--kl-backdrop": "none" },
  dark: { "--kl-overlay": "rgba(0,0,0,.5)", "--kl-bg": "#1e1e2e", "--kl-fg": "#cdd6f4", "--kl-muted": "#a6adc8", "--kl-border": "#45475a", "--kl-chip": "#313244", "--kl-input-bg": "#181825", "--kl-accent": "#89b4fa", "--kl-on-accent": "#1e1e2e", "--kl-accent2": "#fab387", "--kl-radius": "12px", "--kl-shadow": "0 20px 60px rgba(0,0,0,.5)", "--kl-backdrop": "none" },
  glass: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.14)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.28)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.10)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)", "--kl-backdrop": "blur(22px) saturate(180%)" },
  neon: { "--kl-overlay": "rgba(8,4,20,.55)", "--kl-bg": "#0e0b1e", "--kl-fg": "#f4f0ff", "--kl-muted": "#a99fd6", "--kl-border": "#3a2d6b", "--kl-chip": "#1c1640", "--kl-input-bg": "#140f2c", "--kl-accent": "#ff2d95", "--kl-on-accent": "#fff", "--kl-accent2": "#15e0ff", "--kl-radius": "14px", "--kl-shadow": "0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)", "--kl-backdrop": "none" },
  // 'liquid' on a real page can't do clone-refraction; render as frosted glass.
  liquid: { "--kl-overlay": "rgba(10,10,18,.25)", "--kl-bg": "rgba(255,255,255,.10)", "--kl-fg": "#fff", "--kl-muted": "rgba(255,255,255,.7)", "--kl-border": "rgba(255,255,255,.4)", "--kl-chip": "rgba(255,255,255,.16)", "--kl-input-bg": "rgba(255,255,255,.08)", "--kl-accent": "rgba(255,255,255,.92)", "--kl-on-accent": "#15121d", "--kl-accent2": "rgba(255,255,255,.55)", "--kl-radius": "22px", "--kl-shadow": "0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)", "--kl-backdrop": "blur(14px) saturate(170%)" }
};
function $i(e) {
  let t = e.replace("#", "");
  t.length === 3 && (t = t.split("").map((l) => l + l).join(""));
  const r = parseInt(t.slice(0, 6), 16), i = r >> 16 & 255, n = r >> 8 & 255, s = r & 255;
  return 0.299 * i + 0.587 * n + 0.114 * s;
}
function Ro(e) {
  const t = tc(e) ? e : {}, i = { theme: typeof t.theme == "string" && Kl.includes(t.theme) ? t.theme : "light" }, n = jt(t.primary), s = jt(t.secondary), l = jt(t.background), d = Ni(t.thankYou, 140), o = rc(t.font);
  n && (i.primary = n), s && (i.secondary = s), l && (i.background = l), o && (i.font = o), d && (i.thankYou = d), typeof t.launcherMode == "string" && Zl.includes(t.launcherMode) && (i.launcherMode = t.launcherMode);
  const p = Ni(t.launcherText, 60);
  p && (i.launcherText = p);
  const a = jt(t.launcherIconColor);
  return a && (i.launcherIconColor = a), i;
}
function nc(e) {
  const t = Ro(e), r = t.theme === "custom" ? { ..._i.light } : { ..._i[t.theme] };
  if (t.theme === "custom" && (t.primary && (r["--kl-accent"] = t.primary), t.secondary && (r["--kl-accent2"] = t.secondary), t.background)) {
    r["--kl-bg"] = t.background;
    const s = $i(t.background) < 140;
    r["--kl-fg"] = s ? "#f4f4f7" : "#1d1d24", r["--kl-muted"] = s ? "rgba(255,255,255,.6)" : "#706560", r["--kl-border"] = s ? "rgba(255,255,255,.16)" : "#e6e6ec", r["--kl-chip"] = s ? "rgba(255,255,255,.08)" : "#f4f4f7", r["--kl-input-bg"] = s ? "rgba(255,255,255,.05)" : "#fafafb";
  }
  t.font && (r["--kl-font"] = t.font);
  const i = t.theme === "dark" || t.theme === "neon" || t.theme === "glass" || t.theme === "liquid" || t.theme === "custom" && !!t.background && $i(t.background) < 140;
  return r["--kl-img-outline"] = i ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)", r["--kl-glow"] = i ? "radial-gradient(120% 80% at 50% -12%, rgba(139,92,246,.20), transparent 60%), radial-gradient(95% 75% at 108% 112%, rgba(255,170,90,.08), transparent 58%)" : "radial-gradient(120% 80% at 50% -10%, rgba(139,139,245,.10), transparent 60%), radial-gradient(80% 60% at 100% 110%, rgba(232,162,74,.06), transparent 60%)", `:host{${Object.entries(r).map(([s, l]) => `${s}:${l};`).join("")}}`;
}
function ic(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function sc(e, t, r = {}) {
  var Ae;
  const i = Ro(r), n = document.createElement("div");
  n.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const s = n.attachShadow({ mode: "open" });
  document.body.appendChild(n);
  let l = [], d = [];
  const o = 5, p = 10 * 1024 * 1024, a = {};
  let h = e, u = null;
  const c = document.createElement("style");
  c.textContent = `
    ${nc(i)}
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
    .klavity-toast-progress{position:absolute;top:0;left:0;height:3px;background:var(--kl-accent);width:100%;transform-origin:left;animation:kl-toast-decay 5s linear forwards;z-index:10;}
    @keyframes kl-toast-decay{from{transform:scaleX(1)}to{transform:scaleX(0)}}
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
    @media (prefers-reduced-motion: reduce){.klavity-overlay,.klavity-modal,.klavity-modal.kl-closing,.klavity-modal>*, .klavity-toast-progress{animation-duration:.01ms!important;}.klavity-modal{--kl-lift:none;--kl-press:none;--kl-bhover:none;--kl-bpress:none;}.klavity-info{transition:none;}.klavity-actions button.kl-loading{animation:none;}.klavity-actions .kl-cap-ic,.klavity-toggle .kl-cap-ic{transition:none;transform:none!important;}}
  `, s.appendChild(c);
  const m = document.createElement("div");
  m.className = "klavity-overlay";
  const f = document.createElement("div");
  f.className = "klavity-modal", f.innerHTML = `
    <button class="klavity-x" id="klavity-x" type="button" aria-label="Close" title="Close (Esc)">${K("x", { size: 16 })}</button>
    <div class="klavity-toggle">
      <button class="bug ${e === "bug" ? "active" : ""}"><span class="kl-cap-ic">${K("bug")}</span>Bug</button>
      <button class="feat ${e === "feature" ? "active" : ""}"><span class="kl-cap-ic">${K("lightbulb")}</span>Feature</button>
    </div>
    <div class="klavity-page">${K("map-pin")} ${typeof window < "u" ? ic(window.location.pathname) : ""}</div>
    <div class="klavity-strip" id="klavity-strip"></div>
    <div class="klavity-actions">
      ${t.onCaptureSharp ? `<button id="klavity-sharp" title="Screen — pixel-perfect full page, every image. Shares this tab (asks permission)."><span class="kl-cap-ic">${K("monitor")}</span><span class="kl-sharp-label">Screen</span><span class="klavity-info-wrap"><span id="klavity-sharp-info" class="klavity-info" role="button" tabindex="0" title="What does Screen do?" aria-label="What does Screen do?"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;pointer-events:none"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span class="klavity-info-pop" role="tooltip">Screen grabs the <b>whole page — every image, pixel-perfect</b> using your browser's screen-share. Your browser will ask you to <b>share this tab</b>.</span></span></button>` : ""}
      <button id="klavity-full" title="Full Page — instant capture; may miss some cross-origin images"><span class="kl-cap-ic">${K("camera")}</span>Full Page</button>
      <button id="klavity-upload"><span class="kl-cap-ic">${K("image")}</span>Upload</button>
      ${t.onRegionCapture ? `<button id="klavity-region"><span class="kl-cap-ic">${K("scissors")}</span>Region</button>` : ""}
    </div>
    <input type="file" id="klavity-file" accept="image/*,.heic,.heif" multiple style="display:none">
    <div class="klavity-counter" id="klavity-counter">0/5 images</div>
    <div class="klavity-error" id="klavity-err"></div>
    <textarea class="klavity-desc" id="klavity-desc" placeholder="Describe the bug..."></textarea>
    ${t.requireEmail ? '<input type="email" class="klavity-remail" id="klavity-remail" placeholder="your@email.com" autocomplete="email">' : ""}
    <button class="klavity-submit" id="klavity-submit" disabled>Submit</button>
    <div class="klavity-progress" id="klavity-progress" role="progressbar" aria-label="Uploading report"><div class="klavity-progress-fill" id="klavity-progress-fill"></div></div>
  `, m.appendChild(f), s.appendChild(m);
  const g = s.querySelector(".klavity-info-wrap"), x = s.querySelector(".klavity-info-pop");
  if (g && x) {
    const R = document.createElement("div");
    R.className = "kl-float-tip", R.setAttribute("role", "tooltip"), R.innerHTML = x.innerHTML, s.appendChild(R);
    const T = () => {
      const D = g.getBoundingClientRect(), _ = Math.min(228, window.innerWidth - 16), z = 8, te = window.innerWidth, Y = window.innerHeight, ie = Math.max(z, Math.min(D.right - _, te - _ - z));
      R.style.left = ie + "px", R.style.top = "-9999px", R.style.visibility = "hidden", R.style.display = "block";
      const Ue = R.offsetHeight;
      R.style.display = "", R.style.visibility = "";
      const Be = D.top - z;
      let Ee = D.top - Ue - 10;
      (Ee < z || Be < Ue) && (Ee = D.bottom + 10), Ee = Math.max(z, Math.min(Ee, Y - Ue - z)), R.style.top = Ee + "px", R.classList.add("kl-show");
    }, P = () => R.classList.remove("kl-show");
    g.addEventListener("mouseenter", T), g.addEventListener("mouseleave", P), g.addEventListener("focusin", T), g.addEventListener("focusout", P);
    const A = s.getElementById("klavity-sharp");
    A && (A.addEventListener("focus", T), A.addEventListener("blur", P));
  }
  const y = {
    shadowRoot: s,
    addScreenshot: b,
    close: I
  };
  function w() {
    const R = s.getElementById("klavity-strip"), T = s.getElementById("klavity-counter");
    R.innerHTML = "", l.forEach((P, A) => {
      const D = document.createElement("div");
      D.className = "klavity-thumb";
      const _ = document.createElement("img");
      _.src = P, _.title = "Click to mark up", _.addEventListener("load", () => {
        _.naturalHeight > _.naturalWidth * 1.4 && D.classList.add("kl-tall");
      }, { once: !0 }), _.addEventListener("click", () => we(A));
      const z = document.createElement("button");
      z.className = "klavity-rm", z.innerHTML = K("x", { size: 13 }), z.title = "Remove", z.addEventListener("click", (Y) => {
        Y.stopPropagation(), l.splice(A, 1), d.splice(A, 1), w();
      });
      const te = document.createElement("button");
      te.className = "klavity-mk", te.innerHTML = K("pencil", { size: 13 }), te.title = "Mark up", te.addEventListener("click", (Y) => {
        Y.stopPropagation(), we(A);
      }), D.append(_, z, te), R.appendChild(D);
    }), T.textContent = `${l.length}/5 images`;
  }
  function S(R) {
    const T = s.getElementById("klavity-err");
    T && (T.textContent = R, T.style.display = "block");
  }
  function v() {
    const R = s.getElementById("klavity-err");
    R && (R.style.display = "none");
  }
  function b(R) {
    if (l.length >= o) {
      S(`You can attach up to ${o} images.`);
      return;
    }
    v(), l.push(R), d.push(t.compressImage ? t.compressImage(R) : Promise.resolve(R)), w();
  }
  function k(R) {
    return R.type.startsWith("image/") || /\.(heic|heif|png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(R.name);
  }
  async function E(R) {
    v();
    for (const T of R) {
      if (l.length >= o) {
        S(`You can attach up to ${o} images.`);
        break;
      }
      if (!k(T)) {
        S(`"${T.name}" isn't an image — only image files can be attached.`);
        continue;
      }
      if (T.size > p) {
        S(`"${T.name}" is too large — images must be under ${Math.round(p / 1024 / 1024)} MB.`);
        continue;
      }
      try {
        b(await ac(T));
      } catch {
        S(`Couldn't add "${T.name}". Please try a different image.`);
      }
    }
  }
  function I() {
    var P;
    u && (clearTimeout(u), u = null), document.removeEventListener("keydown", M, { capture: !0 }), document.removeEventListener("paste", $);
    try {
      (P = t.onClose) == null || P.call(t);
    } catch {
    }
    const R = s.querySelector(".klavity-modal");
    if (!R) {
      n.remove();
      return;
    }
    R.classList.add("kl-closing");
    const T = () => n.remove();
    R.addEventListener("animationend", T, { once: !0 }), setTimeout(T, 700);
  }
  function M(R) {
    R.key === "Escape" && (R.stopPropagation(), I());
  }
  document.addEventListener("keydown", M, { capture: !0 });
  const $ = (R) => {
    if (!R.clipboardData) return;
    const T = Array.from(R.clipboardData.items).filter((P) => P.type.startsWith("image/")).map((P) => P.getAsFile()).filter((P) => !!P);
    T.length && E(T);
  };
  document.addEventListener("paste", $);
  const N = f.querySelector(".bug"), C = f.querySelector(".feat");
  N.addEventListener("click", () => {
    h = "bug", N.classList.add("active"), C.classList.remove("active");
  }), C.addEventListener("click", () => {
    h = "feature", C.classList.add("active"), N.classList.remove("active");
  });
  const he = f.querySelector("#klavity-desc"), ne = f.querySelector("#klavity-submit"), B = f.querySelector("#klavity-remail"), V = () => !t.requireEmail || !!B && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(B.value.trim()), Z = () => {
    ne.disabled = he.value.trim() === "" || !V();
  };
  he.addEventListener("input", Z), B == null || B.addEventListener("input", Z), m.addEventListener("click", (R) => {
    R.target === m && I();
  }), (Ae = f.querySelector("#klavity-x")) == null || Ae.addEventListener("click", () => I());
  const se = () => Array.from(f.querySelectorAll(".klavity-actions button"));
  let X = !1;
  const F = (R) => {
    X = R, se().forEach((T) => {
      T.disabled = R;
    }), R ? ne.disabled = !0 : Z();
  }, Ce = (R) => {
    se().forEach((T) => {
      T.classList.remove("kl-active"), T.removeAttribute("aria-pressed");
    }), R && (R.classList.add("kl-active"), R.setAttribute("aria-pressed", "true"));
  };
  ne.addEventListener("click", async () => {
    if (X || ne.disabled) return;
    const R = he.value.trim();
    F(!0), ne.textContent = "Uploading…";
    const T = s.getElementById("klavity-err");
    T.style.display = "none";
    const P = s.getElementById("klavity-progress"), A = s.getElementById("klavity-progress-fill");
    P && A && (P.classList.add("show"), A.style.transition = "none", A.style.width = "8%", A.offsetWidth, A.style.transition = "width 10s cubic-bezier(.05,.7,.2,1)", requestAnimationFrame(() => {
      A.style.width = "90%";
    }));
    const D = () => {
      A && (A.style.transition = "width .25s ease", A.style.width = "100%");
    }, _ = () => {
      P && A && (P.classList.remove("show"), A.style.transition = "none", A.style.width = "0");
    };
    try {
      const z = await Promise.all(d), te = await t.onSubmit({ type: h, description: R, screenshots: z, annotations: a[0] ?? null, reporterEmail: (B == null ? void 0 : B.value.trim()) || void 0 });
      if (D(), t.success)
        We(te.issueKey, t.success);
      else {
        const Y = document.createElement("div");
        Y.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:all;";
        const ie = document.createElement("div");
        ie.style.cssText = "background:var(--kl-bg);color:var(--kl-fg);border:1px solid var(--kl-border);border-radius:var(--kl-radius);padding:32px;font-family:var(--kl-font,system-ui),sans-serif;font-size:16px;text-align:center;box-shadow:var(--kl-shadow);", i.thankYou ? ie.textContent = i.thankYou : (ie.innerHTML = `${K("check-circle", { label: "Filed", size: 20 })} Filed as `, ie.appendChild(document.createTextNode(te.issueKey))), Y.appendChild(ie), m.remove(), s.appendChild(Y), setTimeout(I, i.thankYou ? 2600 : 1500);
      }
    } catch (z) {
      _(), T.textContent = z.message, T.style.display = "block", ne.textContent = "Submit", F(!1);
    }
  });
  const O = f.querySelector("#klavity-full");
  O.addEventListener("click", async () => {
    if (!X) {
      F(!0), O.classList.add("kl-loading");
      try {
        b(await t.onCaptureFull()), Ce(O);
      } catch {
      } finally {
        O.classList.remove("kl-loading"), F(!1);
      }
    }
  });
  const le = f.querySelector("#klavity-sharp");
  if (le && t.onCaptureSharp) {
    const R = le.querySelector(".kl-sharp-label"), T = async () => {
      if (X) return;
      F(!0), n.style.display = "none";
      const A = R ?? le, D = A.textContent;
      A.textContent = "Capturing…";
      try {
        const _ = await t.onCaptureSharp();
        _ && (b(_), Ce(le));
      } catch {
      } finally {
        n.style.display = "", A.textContent = D, F(!1);
      }
    };
    le.addEventListener("click", () => {
      T();
    });
    const P = le.querySelector("#klavity-sharp-info");
    P && P.addEventListener("click", (A) => A.stopPropagation());
  }
  const pe = f.querySelector("#klavity-file"), Xe = f.querySelector("#klavity-upload");
  Xe.addEventListener("click", () => {
    if (X || l.length >= o) {
      l.length >= o && S(`You can attach up to ${o} images.`);
      return;
    }
    pe.click();
  }), pe.addEventListener("change", async (R) => {
    const T = R.target, P = T.files ? Array.from(T.files) : [];
    if (T.value = "", P.length) {
      const A = l.length;
      await E(P), l.length > A && Ce(Xe);
    }
  });
  const oe = s.getElementById("klavity-region");
  oe && t.onRegionCapture && (oe.onclick = () => {
    X || (F(!0), document.removeEventListener("keydown", M, { capture: !0 }), n.style.display = "none", oc(async (R) => {
      document.addEventListener("keydown", M, { capture: !0 });
      try {
        const T = await t.onRegionCapture(R);
        T && (b(T), Ce(oe));
      } finally {
        n.style.display = "", F(!1);
      }
    }, () => {
      document.addEventListener("keydown", M, { capture: !0 }), n.style.display = "", F(!1);
    }));
  });
  function we(R) {
    const T = l[R], P = new Image();
    P.onload = () => {
      const A = document.createElement("canvas");
      A.width = P.naturalWidth, A.height = P.naturalHeight;
      const D = new Wl(A, T);
      D.redraw();
      const _ = document.createElement("div");
      _.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;pointer-events:all;";
      const z = document.createElement("div");
      z.className = "kl-edtb", z.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;background:#1e1e2e;flex-wrap:wrap;", z.innerHTML = `
        <button data-tool="pen" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${K("pencil", { size: 14 })} Pen</button>
        <button data-tool="rect" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${K("square", { size: 14 })} Rect</button>
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
        <button id="klavity-clear-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${K("trash-2", { size: 14 })} Clear</button>
        <button id="klavity-save-ann" style="padding:6px 10px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-weight:700;">${K("check", { label: "Save", size: 14 })} Save</button>
        <button id="klavity-cancel-ann" style="padding:6px 10px;background:#313244;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;">${K("x", { size: 14 })}</button>
      `, A.style.cssText = "cursor:crosshair;display:block;margin:12px auto;touch-action:none;background:#fff;border-radius:4px;outline:1px solid rgba(255,255,255,.12);outline-offset:-1px;box-shadow:0 12px 44px rgba(0,0,0,.55);";
      const te = document.createElement("div");
      te.style.cssText = "flex:1;min-height:0;overflow:auto;display:block;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);", te.appendChild(A);
      const Y = document.createElement("style");
      Y.textContent = ".kl-edtb button{transition:transform .15s cubic-bezier(.34,1.56,.64,1),background .15s ease;will-change:transform;}.kl-edtb button:hover{transform:translateY(-1px) scale(1.02);background:#45475a;}.kl-edtb button[data-color]:hover{transform:scale(1.14);background:initial;}.kl-edtb button:active{transform:scale(.96);}.kl-edtb button:focus-visible{outline:2px solid #89b4fa;outline-offset:2px;}.kl-edtb .kl-zb{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 9px;background:#313244;color:#cdd6f4;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;line-height:1;}.kl-edtb .kl-zb:hover{background:#45475a;}@media (prefers-reduced-motion:reduce){.kl-edtb button{transition:none;}.kl-edtb button:hover,.kl-edtb button:active,.kl-edtb button[data-color]:hover{transform:none;}}", _.append(Y, z, te), s.appendChild(_);
      let ie = 1;
      const Ue = (U) => Math.max(0.05, Math.min(5, U || 1));
      function Be(U) {
        ie = Ue(U), A.style.width = Math.round(A.width * ie) + "px", A.style.height = Math.round(A.height * ie) + "px";
        const G = z.querySelector("#klavity-zoom-pct");
        G && (G.textContent = Math.round(ie * 100) + "%");
      }
      const Ee = () => Math.max(1, te.clientWidth - 24) / A.width, ht = () => Math.min(Math.max(1, te.clientWidth - 24) / A.width, Math.max(1, te.clientHeight - 24) / A.height), qa = A.height / A.width > Math.max(1, te.clientHeight) / Math.max(1, te.clientWidth);
      Be(qa ? Ee() : ht()), z.querySelector("#klavity-zoom-in").addEventListener("click", () => Be(ie * 1.25)), z.querySelector("#klavity-zoom-out").addEventListener("click", () => Be(ie / 1.25)), z.querySelector("#klavity-fit-width").addEventListener("click", () => Be(Ee())), z.querySelector("#klavity-fit-page").addEventListener("click", () => Be(ht()));
      let qe = "rect", Je = "#ef4444", Mt = !1, Bt = [], tt = 0, rt = 0;
      function Pr(U) {
        qe = U, z.querySelectorAll("[data-tool]").forEach((G) => {
          const ce = G.dataset.tool === U;
          G.style.background = ce ? "#585b70" : "#313244", G.style.outline = ce ? "2px solid #89b4fa" : "none";
        });
      }
      z.querySelectorAll("[data-tool]").forEach((U) => U.addEventListener("click", () => Pr(U.dataset.tool))), z.querySelectorAll("[data-color]").forEach((U) => U.addEventListener("click", () => {
        Je = U.dataset.color;
      })), z.querySelector("#klavity-undo").addEventListener("click", () => D.undo()), z.querySelector("#klavity-clear-ann").addEventListener("click", () => D.clearAll());
      const Ci = { p: "pen", r: "rect", c: "circle", a: "arrow", t: "text" };
      function Ei(U) {
        const G = U.target;
        if (G && (G.tagName === "INPUT" || G.tagName === "TEXTAREA" || G.isContentEditable)) return;
        if (U.key === "Escape") {
          U.stopPropagation(), Tr();
          return;
        }
        if ((U.metaKey || U.ctrlKey) && U.key.toLowerCase() === "z") {
          U.preventDefault(), D.undo();
          return;
        }
        if (U.metaKey || U.ctrlKey || U.altKey) return;
        const ce = U.key.toLowerCase();
        Ci[ce] ? (U.preventDefault(), Pr(Ci[ce])) : ce === "u" && (U.preventDefault(), D.undo());
      }
      function Tr() {
        document.removeEventListener("keydown", Ei, { capture: !0 }), _.remove();
      }
      document.addEventListener("keydown", Ei, { capture: !0 }), Pr(qe), z.querySelector("#klavity-save-ann").addEventListener("click", async () => {
        D.shapes.length ? (a[R] = { w: A.width, h: A.height, shapes: D.shapes.map((U) => ({ ...U })) }, l[R] = T) : delete a[R], Tr(), w();
      }), z.querySelector("#klavity-cancel-ann").addEventListener("click", () => Tr());
      function Nr(U) {
        const G = A.getBoundingClientRect();
        return { x: (U.clientX - G.left) / G.width * A.width, y: (U.clientY - G.top) / G.height * A.height };
      }
      A.addEventListener("pointerdown", (U) => {
        Mt = !0;
        const G = Nr(U);
        if ({ x: tt, y: rt } = G, qe === "pen" && (Bt = [G]), qe === "text") {
          Mt = !1;
          const ce = document.createElement("input");
          ce.style.cssText = `position:fixed;left:${U.clientX}px;top:${U.clientY}px;background:transparent;border:1px dashed ${Je};color:${Je};font-size:16px;outline:none;z-index:9999999;min-width:80px;`, document.body.appendChild(ce), ce.focus(), ce.addEventListener("blur", () => {
            ce.value.trim() && D.addShape({ type: "text", color: Je, x: tt, y: rt, text: ce.value.trim() }), ce.remove();
          }, { once: !0 }), ce.addEventListener("keydown", (ja) => {
            ja.key === "Enter" && ce.blur();
          });
        }
      }), A.addEventListener("pointermove", (U) => {
        Mt && qe === "pen" && Bt.push(Nr(U));
      }), A.addEventListener("pointerup", (U) => {
        if (!Mt) return;
        Mt = !1;
        const G = Nr(U);
        qe === "pen" && Bt.length > 1 ? D.addShape({ type: "pen", color: Je, points: Bt }) : qe === "rect" ? D.addShape({ type: "rect", color: Je, x: Math.min(tt, G.x), y: Math.min(rt, G.y), w: Math.abs(G.x - tt), h: Math.abs(G.y - rt) }) : qe === "circle" ? D.addShape({ type: "circle", color: Je, x: (tt + G.x) / 2, y: (rt + G.y) / 2, rx: Math.abs(G.x - tt) / 2, ry: Math.abs(G.y - rt) / 2 }) : qe === "arrow" && D.addShape({ type: "arrow", color: Je, x1: tt, y1: rt, x2: G.x, y2: G.y });
      });
    }, P.src = T;
  }
  function We(R, T) {
    const { copy: P, onLead: A } = T;
    f.innerHTML = "";
    const D = document.createElement("div");
    D.className = "klavity-success";
    const _ = document.createElement("h2");
    if (_.innerHTML = P.headline, D.appendChild(_), P.body) {
      const Y = document.createElement("p");
      Y.textContent = P.body, D.appendChild(Y);
    }
    const z = () => {
      if (u) return;
      const Y = document.createElement("div");
      Y.className = "klavity-toast-progress", f.appendChild(Y), u = setTimeout(() => {
        I();
      }, 5e3);
    };
    if (P.showEmail) {
      const Y = document.createElement("div");
      Y.className = "klavity-lead";
      const ie = document.createElement("input");
      ie.type = "email", ie.placeholder = "you@company.com";
      const Ue = document.createElement("button");
      Ue.textContent = P.emailLabel;
      const Be = async () => {
        const Ee = ie.value.trim();
        if (!Ee) return;
        Ue.disabled = !0;
        try {
          A && await A(R, Ee);
        } catch {
        }
        const ht = document.createElement("div");
        ht.className = "klavity-thanks", ht.textContent = "Thanks — we'll be in touch.", Y.replaceWith(ht), P.showCta || z();
      };
      Ue.addEventListener("click", Be), ie.addEventListener("keydown", (Ee) => {
        Ee.key === "Enter" && Be();
      }), Y.append(ie, Ue), D.appendChild(Y);
    }
    if (P.showCta && P.ctaUrl) {
      const Y = document.createElement("a");
      Y.className = "klavity-cta", Y.href = P.ctaUrl, Y.target = "_blank", Y.rel = "noopener", Y.textContent = P.ctaText, D.appendChild(Y);
    }
    f.appendChild(D);
    const te = document.createElement("div");
    te.className = "klavity-pb", te.innerHTML = 'Powered by <a href="https://klavity.quantana.top" target="_blank" rel="noopener">Klavity</a>', f.appendChild(te), !P.showEmail && !P.showCta && z();
  }
  return t.autoCaptureOnOpen && setTimeout(() => {
    t.onCaptureFull().then(b).catch(() => {
    });
  }, 200), y;
}
function oc(e, t) {
  const r = document.createElement("div");
  r.style.cssText = "position:fixed;inset:0;cursor:crosshair;z-index:2147483646;user-select:none;", r.setAttribute("data-klavity-region-overlay", ""), document.body.appendChild(r);
  const i = document.createElement("div");
  i.textContent = "Drag to select an area · Esc to cancel", i.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-family:system-ui;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:6px;pointer-events:none;z-index:2147483647;", document.body.appendChild(i);
  let n = 0, s = 0, l = !1;
  function d() {
    document.removeEventListener("keydown", o, { capture: !0 }), r.remove(), i.remove();
  }
  function o(p) {
    p.key === "Escape" && (p.stopPropagation(), d(), t());
  }
  document.addEventListener("keydown", o, { capture: !0 }), r.addEventListener("pointerdown", (p) => {
    l = !0, n = p.clientX, s = p.clientY, i.remove();
  }), r.addEventListener("pointermove", (p) => {
    if (!l) return;
    const a = Math.min(p.clientX, n), h = Math.min(p.clientY, s), u = Math.abs(p.clientX - n), c = Math.abs(p.clientY - s);
    r.style.background = `
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) 0 0/${a}px 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a + u}px 0/calc(100% - ${a + u}px) 100%,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px 0/${u}px ${h}px,
      linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)) ${a}px ${h + c}px/${u}px calc(100% - ${h + c}px)
    `, r.style.backgroundRepeat = "no-repeat";
  }), r.addEventListener("pointerup", (p) => {
    if (!l) return;
    l = !1;
    const a = Math.abs(p.clientX - n), h = Math.abs(p.clientY - s);
    if (a < 8 || h < 8) {
      d(), t();
      return;
    }
    const u = { x: Math.min(p.clientX, n), y: Math.min(p.clientY, s), w: a, h };
    d(), e(u);
  });
}
async function ac(e) {
  if (e.type === "image/heic" || e.type === "image/heif" || e.name.endsWith(".heic") || e.name.endsWith(".heif"))
    try {
      const t = (await import("./heic2any-D6xzzX7R.js").then((i) => i.h)).default, r = await t({ blob: e, toType: "image/jpeg", quality: 0.85 });
      return Di(r);
    } catch {
    }
  return Di(e);
}
function Di(e) {
  return new Promise((t, r) => {
    const i = new FileReader();
    i.onload = () => t(i.result), i.onerror = r, i.readAsDataURL(e);
  });
}
const lc = {
  frustrated: { accent: "#e8849a", mark: "vein", label: "Frustrated" },
  confused: { accent: "#e8a24a", mark: "q", label: "Confused" },
  satisfied: { accent: "#7fd1c4", mark: "check", label: "Satisfied" },
  delighted: { accent: "#9fd6a0", mark: "spark", label: "Delighted" },
  neutral: { accent: "#8a8276", mark: "dots", label: "Neutral" },
  inspired: { accent: "#8b8bf5", mark: "bulb", label: "Inspired" },
  alarmed: { accent: "#ef6b6b", mark: "bang", label: "Alarmed" }
};
function cc(e) {
  const t = (e || "").trim().split(/\s+/).filter(Boolean);
  return t.length === 0 ? "?" : t.length === 1 ? t[0].slice(0, 2).toUpperCase() : (t[0][0] + t[t.length - 1][0]).toUpperCase();
}
function uc(e) {
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
const dc = {
  vein: "ksim-m-vein",
  spark: "ksim-m-spark",
  bulb: "ksim-m-bulb",
  bang: "ksim-m-bang",
  q: "ksim-m-q",
  dots: "ksim-m-dots",
  check: "ksim-m-check"
};
function nt(e) {
  return String(e).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hc(e) {
  const {
    name: t,
    photoUrl: r,
    color: i = "#6f6cf2",
    emotion: n = "none",
    size: s = 58,
    eyes: l = !0,
    legs: d = !0,
    animate: o = !0,
    className: p = ""
  } = e, a = nt(e.initials || cc(t)), h = n !== "none" ? lc[n] : null, u = h ? `<span class="ksim-mark ${o ? dc[h.mark] : ""}" style="color:${nt(h.accent)}">${uc(h.mark)}</span>` : "", m = r ? `<span class="ksim-head ksim-photo"><img src="${nt(r)}" alt="${nt(t)}" loading="lazy" onerror="this.style.display='none';this.parentNode.classList.add('ksim-fallback')"><span class="ksim-ini">${a}</span></span>` : `<span class="ksim-head ksim-mono"><span class="ksim-ini">${a}</span>${l ? '<span class="ksim-eyes"><i></i><i></i></span>' : ""}</span>`, f = d ? '<span class="ksim-legs"><i></i><i></i></span>' : "", g = ["ksim", o ? "is-animated" : "", p].filter(Boolean).join(" "), x = `--ksim-persona:${nt(i)};--ksim-size:${s}px;` + (h ? `--ksim-accent:${nt(h.accent)};` : "");
  return `<span class="${g}" style="${x}" data-emotion="${n}" title="${nt(t)}">${u}${m}${f}</span>`;
}
function Oo(e) {
  const t = document.createElement("template");
  return t.innerHTML = hc(e).trim(), t.content.firstElementChild;
}
const pc = `
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
function fc(e = document) {
  var i;
  const t = e.head ?? e ?? null;
  if (!t || (i = t.querySelector) != null && i.call(t, "style[data-ksim]")) return;
  const r = document.createElement("style");
  r.setAttribute("data-ksim", ""), r.textContent = pc, t.appendChild(r);
}
function mc(e) {
  const { context: t, description: r } = e, i = t.consoleErrors.map((o) => `- [${o.level ?? "error"}] \`${o.message}\``).join(`
`) || "_none_", n = t.networkFailures.map((o) => `- ${o.method} ${o.url} → ${o.status}${o.durationMs != null ? ` (${o.durationMs}ms)` : ""}`).join(`
`) || "_none_", s = [
    `*Page:* ${t.pageUrl}`,
    `*Browser:* ${t.userAgent}`,
    `*Screen:* ${t.screenSize}  |  *Viewport:* ${t.viewportSize}`
  ], l = t.identity ? Object.entries(t.identity).filter(([, o]) => o != null) : [], d = t.metadata ? Object.entries(t.metadata) : [];
  return (l.length || d.length) && s.push(`*User / metadata:* ${[...l, ...d].map(([o, p]) => `${o}=${p}`).join(", ")}`), [
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
async function gc(e) {
  const { settings: t, type: r, description: i } = e, { baseUrl: n, email: s, token: l, projectKey: d } = t.jira, o = btoa(`${s}:${l}`), p = r === "bug" ? "Bug" : "Story", a = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], h = `[Klavity] ${i.slice(0, 180)}`, u = await fetch(`${n}/rest/api/3/issue`, {
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
        description: { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: mc(e) }] }] },
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
    const x = await (await fetch(g)).blob(), y = new FormData();
    y.append("file", x, `klavity-screenshot-${Date.now()}.png`), await fetch(`${n}/rest/api/3/issue/${m}/attachments`, {
      method: "POST",
      headers: { Authorization: `Basic ${o}`, "X-Atlassian-Token": "no-check" },
      body: y
    });
  }
  return { issueKey: m, issueUrl: f };
}
async function yc(e) {
  var h, u, c;
  const { settings: t, type: r, description: i, context: n } = e, { apiKey: s, teamId: l } = t.linear, d = [
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
          teamId: l,
          title: `[Klavity] ${i.slice(0, 180)}`,
          description: d,
          labelNames: r === "bug" ? ["Bug"] : []
        }
      }
    })
  })).json();
  if ((h = p.errors) != null && h.length)
    throw new Error(`Linear API error: ${p.errors[0].message}`);
  const a = (c = (u = p.data) == null ? void 0 : u.issueCreate) == null ? void 0 : c.issue;
  if (!a) throw new Error("Linear: no issue returned");
  return { issueKey: a.identifier, issueUrl: a.url };
}
async function bc(e) {
  const { settings: t, type: r, description: i, context: n, screenshots: s } = e, { token: l, repo: d } = t.github, o = r === "bug" ? ["klavity", "klavity-bug"] : ["klavity", "klavity-feature"], p = s.length ? `

<details><summary>Screenshots (${s.length})</summary>

${s.map((c, m) => `![screenshot-${m + 1}](${c})`).join(`
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
      Authorization: `Bearer ${l}`,
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
async function vc(e) {
  const { settings: t, description: r, context: i } = e, { token: n, workspace: s, projectId: l } = t.plane, d = (t.plane.host || "https://api.plane.so").replace(/\/+$/, ""), o = d === "https://api.plane.so" ? "https://app.plane.so" : d, p = await fetch(
    `${d}/api/v1/workspaces/${s}/projects/${l}/issues/`,
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
    issueUrl: `${o}/${s}/projects/${l}/issues/`
  };
}
async function wc(e) {
  const { settings: t, type: r, description: i, context: n, screenshots: s, projectId: l, replayEvents: d } = e, o = new FormData();
  o.append("type", r), o.append("description", i), o.append("page_url", n.pageUrl), o.append("context", JSON.stringify(n)), l && o.append("project_id", l), d && d.length && o.append("replay_events", JSON.stringify(d));
  const p = t.connectionMode === "klavity" && !!t.klavToken;
  if (!p) {
    const { plane: c } = t;
    o.append("plane_token", c.token), o.append("plane_workspace", c.workspace), o.append("plane_project_id", c.projectId), o.append("plane_host", c.host);
  }
  for (let c = 0; c < s.length; c++) {
    const m = await (await fetch(s[c])).blob();
    o.append("screenshots", m, `screenshot-${c}.png`);
  }
  const a = p ? { Authorization: `Bearer ${t.klavToken}` } : {}, h = await fetch(`${t.backendUrl}/api/feedback`, { method: "POST", headers: a, body: o });
  if (!h.ok) throw new Error(`Klavity backend error ${h.status}: ${await h.text()}`);
  const u = await h.json();
  return {
    issueKey: u.jira_key ?? u.id,
    issueUrl: u.issue_url ?? t.backendUrl
  };
}
var xc = Object.defineProperty, kc = (e, t, r) => t in e ? xc(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, L = (e, t, r) => kc(e, typeof t != "symbol" ? t + "" : t, r), zi, Sc = Object.defineProperty, Cc = (e, t, r) => t in e ? Sc(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, Fi = (e, t, r) => Cc(e, typeof t != "symbol" ? t + "" : t, r), ae = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(ae || {});
const Ui = {
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
}, Bi = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, Ht = {}, Io = {}, Ec = () => !!globalThis.Zone;
function ti(e) {
  if (Ht[e])
    return Ht[e];
  const t = globalThis[e], r = t.prototype, i = e in Ui ? Ui[e] : void 0, n = !!(i && // @ts-expect-error 2345
  i.every(
    (d) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, d)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in Bi ? Bi[e] : void 0, l = !!(s && s.every(
    // @ts-expect-error 2345
    (d) => {
      var o;
      return typeof r[d] == "function" && ((o = r[d]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (n && l && !Ec())
    return Ht[e] = t.prototype, t.prototype;
  try {
    const d = document.createElement("iframe");
    d.style.display = "none", document.body.appendChild(d);
    const o = d.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return d.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (d.classList.add("rr-block"), d.setAttribute("__rrwebUntaintedMutationObserver", ""), Io[e] = () => d.remove()) : d.remove(), Ht[e] = p;
  } catch {
    return r;
  }
}
const Dr = {};
function Ye(e, t, r) {
  var i;
  const n = `${e}.${String(r)}`;
  if (Dr[n])
    return Dr[n].call(
      t
    );
  const s = ti(e), l = (i = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : i.get;
  return l ? (Dr[n] = l, l.call(t)) : t[r];
}
const zr = {};
function Ao(e, t, r) {
  const i = `${e}.${String(r)}`;
  if (zr[i])
    return zr[i].bind(
      t
    );
  const s = ti(e)[r];
  return typeof s != "function" ? t[r] : (zr[i] = s, s.bind(t));
}
function Mc(e) {
  return Ye("Node", e, "ownerDocument");
}
function Rc(e) {
  return Ye("Node", e, "childNodes");
}
function Oc(e) {
  return Ye("Node", e, "parentNode");
}
function Ic(e) {
  return Ye("Node", e, "parentElement");
}
function Ac(e) {
  return Ye("Node", e, "textContent");
}
function Lc(e, t) {
  return Ao("Node", e, "contains")(t);
}
function Pc(e) {
  return Ao("Node", e, "getRootNode")();
}
function Tc(e) {
  return !e || !("host" in e) ? null : Ye("ShadowRoot", e, "host");
}
function Nc(e) {
  return e.styleSheets;
}
function _c(e) {
  return !e || !("shadowRoot" in e) ? null : Ye("Element", e, "shadowRoot");
}
function $c(e, t) {
  return Ye("Element", e, "querySelector")(t);
}
function Dc(e, t) {
  return Ye("Element", e, "querySelectorAll")(t);
}
function zc() {
  return [
    ti("MutationObserver").constructor,
    Io.MutationObserver ?? (() => {
    })
  ];
}
let Lo = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (Lo = () => (/* @__PURE__ */ new Date()).getTime());
function Fc(e, t, r) {
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
const ue = {
  ownerDocument: Mc,
  childNodes: Rc,
  parentNode: Oc,
  parentElement: Ic,
  textContent: Ac,
  contains: Lc,
  getRootNode: Pc,
  host: Tc,
  styleSheets: Nc,
  shadowRoot: _c,
  querySelector: $c,
  querySelectorAll: Dc,
  nowTimestamp: Lo,
  mutationObserverCtor: zc,
  patch: Fc
};
function Po(e) {
  return e.nodeType === e.ELEMENT_NODE;
}
function Rt(e) {
  const t = (
    // anchor and textarea elements also have a `host` property
    // but only shadow roots have a `mode` property
    e && "host" in e && "mode" in e && ue.host(e) || null
  );
  return !!(t && "shadowRoot" in t && ue.shadowRoot(t) === e);
}
function Ot(e) {
  return Object.prototype.toString.call(e) === "[object ShadowRoot]";
}
function Uc(e) {
  return e.includes(" background-clip: text;") && !e.includes(" -webkit-background-clip: text;") && (e = e.replace(
    /\sbackground-clip:\s*text;/g,
    " -webkit-background-clip: text; background-clip: text;"
  )), e;
}
function Bc(e) {
  const { cssText: t } = e;
  if (t.split('"').length < 3) return t;
  const r = ["@import", `url(${JSON.stringify(e.href)})`];
  return e.layerName === "" ? r.push("layer") : e.layerName && r.push(`layer(${e.layerName})`), e.supportsText && r.push(`supports(${e.supportsText})`), e.media.length && r.push(e.media.mediaText), r.join(" ") + ";";
}
function Vn(e) {
  try {
    const t = e.rules || e.cssRules;
    if (!t)
      return null;
    let r = e.href;
    !r && e.ownerNode && (r = e.ownerNode.baseURI);
    const i = Array.from(
      t,
      (n) => To(n, r)
    ).join("");
    return Uc(i);
  } catch {
    return null;
  }
}
function To(e, t) {
  if (qc(e)) {
    let r;
    try {
      r = // for same-origin stylesheets,
      // we can access the imported stylesheet rules directly
      Vn(e.styleSheet) || // work around browser issues with the raw string `@import url(...)` statement
      Bc(e);
    } catch {
      r = e.cssText;
    }
    return e.styleSheet.href ? dr(r, e.styleSheet.href) : r;
  } else {
    let r = e.cssText;
    return jc(e) && e.selectorText.includes(":") && (r = Wc(r)), t ? dr(r, t) : r;
  }
}
function Wc(e) {
  const t = /(\[(?:[\w-]+)[^\\])(:(?:[\w-]+)\])/gm;
  return e.replace(t, "$1\\$2");
}
function qc(e) {
  return "styleSheet" in e;
}
function jc(e) {
  return "selectorText" in e;
}
class No {
  constructor() {
    Fi(this, "idNodeMap", /* @__PURE__ */ new Map()), Fi(this, "nodeMetaMap", /* @__PURE__ */ new WeakMap());
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
function Hc() {
  return new No();
}
function cr({
  element: e,
  maskInputOptions: t,
  tagName: r,
  type: i,
  value: n,
  maskInputFn: s
}) {
  let l = n || "";
  const d = i && lt(i);
  return (t[r.toLowerCase()] || d && t[d]) && (s ? l = s(l, e) : l = "*".repeat(l.length)), l;
}
function lt(e) {
  return e.toLowerCase();
}
const Wi = "__rrweb_original__";
function Vc(e) {
  const t = e.getContext("2d");
  if (!t) return !0;
  const r = 50;
  for (let i = 0; i < e.width; i += r)
    for (let n = 0; n < e.height; n += r) {
      const s = t.getImageData, l = Wi in s ? s[Wi] : s;
      if (new Uint32Array(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        l.call(
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
function ur(e) {
  const t = e.type;
  return e.hasAttribute("data-rr-is-password") ? "password" : t ? (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    lt(t)
  ) : null;
}
function _o(e, t) {
  let r;
  try {
    r = new URL(e, t ?? window.location.href);
  } catch {
    return null;
  }
  const i = /\.([0-9a-z]+)(?:$)/i, n = r.pathname.match(i);
  return (n == null ? void 0 : n[1]) ?? null;
}
function Yc(e) {
  let t = "";
  return e.indexOf("//") > -1 ? t = e.split("/").slice(0, 3).join("/") : t = e.split("/")[0], t = t.split("?")[0], t;
}
const Gc = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm, Xc = /^(?:[a-z+]+:)?\/\//i, Jc = /^www\..*/i, Kc = /^(data:)([^,]*),(.*)/i;
function dr(e, t) {
  return (e || "").replace(
    Gc,
    (r, i, n, s, l, d) => {
      const o = n || l || d, p = i || s || "";
      if (!o)
        return r;
      if (Xc.test(o) || Jc.test(o))
        return `url(${p}${o}${p})`;
      if (Kc.test(o))
        return `url(${p}${o}${p})`;
      if (o[0] === "/")
        return `url(${p}${Yc(t) + o}${p})`;
      const a = t.split("/"), h = o.split("/");
      a.pop();
      for (const u of h)
        u !== "." && (u === ".." ? a.pop() : a.push(u));
      return `url(${p}${a.join("/")}${p})`;
    }
  );
}
function Vt(e, t = !1) {
  return t ? e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "") : e.replace(/(\/\*[^*]*\*\/)|[\s;]/g, "").replace(/0px/g, "0");
}
function Zc(e, t, r = !1) {
  const i = Array.from(t.childNodes), n = [];
  let s = 0;
  if (i.length > 1 && e && typeof e == "string") {
    let l = Vt(e, r);
    const d = l.length / e.length;
    for (let o = 1; o < i.length; o++)
      if (i[o].textContent && typeof i[o].textContent == "string") {
        const p = Vt(
          i[o].textContent,
          r
        ), a = 100;
        let h = 3;
        for (; h < p.length && // keep consuming css identifiers (to get a decent chunk more quickly)
        (p[h].match(/[a-zA-Z0-9]/) || // substring needs to be unique to this section
        p.indexOf(p.substring(0, h), 1) !== -1); h++)
          ;
        for (; h < p.length; h++) {
          let u = p.substring(0, h), c = l.split(u), m = -1;
          if (c.length === 2)
            m = c[0].length;
          else if (c.length > 2 && c[0] === "" && i[o - 1].textContent !== "")
            m = l.indexOf(u, 1);
          else if (c.length === 1) {
            if (u = u.substring(
              0,
              u.length - 1
            ), c = l.split(u), c.length <= 1)
              return n.push(e), n;
            h = a + 1;
          } else h === p.length - 1 && (m = l.indexOf(u));
          if (c.length >= 2 && h > a) {
            const f = i[o - 1].textContent;
            if (f && typeof f == "string") {
              const g = Vt(f).length;
              m = l.indexOf(u, g);
            }
            m === -1 && (m = c[0].length);
          }
          if (m !== -1) {
            let f = Math.floor(m / d);
            for (; f > 0 && f < e.length; ) {
              if (s += 1, s > 50 * i.length)
                return n.push(e), n;
              const g = Vt(
                e.substring(0, f),
                r
              );
              if (g.length === m) {
                n.push(e.substring(0, f)), e = e.substring(f), l = l.substring(m);
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
function Qc(e, t) {
  return Zc(e, t).join("/* rr_split */");
}
let eu = 1;
const tu = new RegExp("[^a-z0-9-_:]"), Pt = -2;
function $o() {
  return eu++;
}
function ru(e) {
  if (e instanceof HTMLFormElement)
    return "form";
  const t = lt(e.tagName);
  return tu.test(t) ? "div" : t;
}
let mt, qi;
const nu = /^[^ \t\n\r\u000c]+/, iu = /^[, \t\n\r\u000c]+/;
function su(e, t) {
  if (t.trim() === "")
    return t;
  let r = 0;
  function i(s) {
    let l;
    const d = s.exec(t.substring(r));
    return d ? (l = d[0], r += l.length, l) : "";
  }
  const n = [];
  for (; i(iu), !(r >= t.length); ) {
    let s = i(nu);
    if (s.slice(-1) === ",")
      s = vt(e, s.substring(0, s.length - 1)), n.push(s);
    else {
      let l = "";
      s = vt(e, s);
      let d = !1;
      for (; ; ) {
        const o = t.charAt(r);
        if (o === "") {
          n.push((s + l).trim());
          break;
        } else if (d)
          o === ")" && (d = !1);
        else if (o === ",") {
          r += 1, n.push((s + l).trim());
          break;
        } else o === "(" && (d = !0);
        l += o, r += 1;
      }
    }
  }
  return n.join(", ");
}
const ji = /* @__PURE__ */ new WeakMap();
function vt(e, t) {
  return !t || t.trim() === "" ? t : ri(e, t);
}
function ou(e) {
  return !!(e.tagName === "svg" || e.ownerSVGElement);
}
function ri(e, t) {
  let r = ji.get(e);
  if (r || (r = e.createElement("a"), ji.set(e, r)), !t)
    t = "";
  else if (t.startsWith("blob:") || t.startsWith("data:"))
    return t;
  return r.setAttribute("href", t), r.href;
}
function Do(e, t, r, i) {
  return i && (r === "src" || r === "href" && !(t === "use" && i[0] === "#") || r === "xlink:href" && i[0] !== "#" || r === "background" && ["table", "td", "th"].includes(t) ? vt(e, i) : r === "srcset" ? su(e, i) : r === "style" ? dr(i, ri(e)) : t === "object" && r === "data" ? vt(e, i) : i);
}
function zo(e, t, r) {
  return ["video", "audio"].includes(e) && t === "autoplay";
}
function au(e, t, r) {
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
function hr(e, t, r) {
  if (!e) return !1;
  if (e.nodeType !== e.ELEMENT_NODE)
    return r ? hr(ue.parentNode(e), t, r) : !1;
  for (let i = e.classList.length; i--; ) {
    const n = e.classList[i];
    if (t.test(n))
      return !0;
  }
  return r ? hr(ue.parentNode(e), t, r) : !1;
}
function Fo(e, t, r, i) {
  let n;
  if (Po(e)) {
    if (n = e, !ue.childNodes(n).length)
      return !1;
  } else {
    if (ue.parentElement(e) === null)
      return !1;
    n = ue.parentElement(e);
  }
  try {
    if (typeof t == "string") {
      if (i) {
        if (n.closest(`.${t}`)) return !0;
      } else if (n.classList.contains(t)) return !0;
    } else if (hr(n, t, i)) return !0;
    if (r) {
      if (i) {
        if (n.closest(r)) return !0;
      } else if (n.matches(r)) return !0;
    }
  } catch {
  }
  return !1;
}
function lu(e, t, r) {
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
  const l = "about:blank";
  if (i.location.href !== l || e.src === l || e.src === "")
    return setTimeout(t, 0), e.addEventListener("load", t);
  e.addEventListener("load", t);
}
function cu(e, t, r) {
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
function uu(e, t) {
  const {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    needsMask: l,
    inlineStylesheet: d,
    maskInputOptions: o = {},
    maskTextFn: p,
    maskInputFn: a,
    dataURLOptions: h = {},
    inlineImages: u,
    recordCanvas: c,
    keepIframeSrcFn: m,
    newlyAddedElement: f = !1,
    cssCaptured: g = !1
  } = t, x = du(r, i);
  switch (e.nodeType) {
    case e.DOCUMENT_NODE:
      return e.compatMode !== "CSS1Compat" ? {
        type: ae.Document,
        childNodes: [],
        compatMode: e.compatMode
        // probably "BackCompat"
      } : {
        type: ae.Document,
        childNodes: []
      };
    case e.DOCUMENT_TYPE_NODE:
      return {
        type: ae.DocumentType,
        name: e.name,
        publicId: e.publicId,
        systemId: e.systemId,
        rootId: x
      };
    case e.ELEMENT_NODE:
      return pu(e, {
        doc: r,
        blockClass: n,
        blockSelector: s,
        inlineStylesheet: d,
        maskInputOptions: o,
        maskInputFn: a,
        dataURLOptions: h,
        inlineImages: u,
        recordCanvas: c,
        keepIframeSrcFn: m,
        newlyAddedElement: f,
        rootId: x
      });
    case e.TEXT_NODE:
      return hu(e, {
        doc: r,
        needsMask: l,
        maskTextFn: p,
        rootId: x,
        cssCaptured: g
      });
    case e.CDATA_SECTION_NODE:
      return {
        type: ae.CDATA,
        textContent: "",
        rootId: x
      };
    case e.COMMENT_NODE:
      return {
        type: ae.Comment,
        textContent: ue.textContent(e) || "",
        rootId: x
      };
    default:
      return !1;
  }
}
function du(e, t) {
  if (!t.hasNode(e)) return;
  const r = t.getId(e);
  return r === 1 ? void 0 : r;
}
function hu(e, t) {
  const { needsMask: r, maskTextFn: i, rootId: n, cssCaptured: s } = t, l = ue.parentNode(e), d = l && l.tagName;
  let o = "";
  const p = d === "STYLE" ? !0 : void 0, a = d === "SCRIPT" ? !0 : void 0;
  return a ? o = "SCRIPT_PLACEHOLDER" : s || (o = ue.textContent(e), p && o && (o = dr(o, ri(t.doc)))), !p && !a && o && r && (o = i ? i(o, ue.parentElement(e)) : o.replace(/[\S]/g, "*")), {
    type: ae.Text,
    textContent: o || "",
    rootId: n
  };
}
function pu(e, t) {
  const {
    doc: r,
    blockClass: i,
    blockSelector: n,
    inlineStylesheet: s,
    maskInputOptions: l = {},
    maskInputFn: d,
    dataURLOptions: o = {},
    inlineImages: p,
    recordCanvas: a,
    keepIframeSrcFn: h,
    newlyAddedElement: u = !1,
    rootId: c
  } = t, m = au(e, i, n), f = ru(e);
  let g = {};
  const x = e.attributes.length;
  for (let w = 0; w < x; w++) {
    const S = e.attributes[w];
    zo(f, S.name, S.value) || (g[S.name] = Do(
      r,
      f,
      lt(S.name),
      S.value
    ));
  }
  if (f === "link" && s) {
    const w = Array.from(r.styleSheets).find((v) => v.href === e.href);
    let S = null;
    w && (S = Vn(w)), S && (delete g.rel, delete g.href, g._cssText = S);
  }
  if (f === "style" && e.sheet) {
    let w = Vn(
      e.sheet
    );
    w && (e.childNodes.length > 1 && (w = Qc(w, e)), g._cssText = w);
  }
  if (["input", "textarea", "select"].includes(f)) {
    const w = e.value, S = e.checked;
    g.type !== "radio" && g.type !== "checkbox" && g.type !== "submit" && g.type !== "button" && w ? g.value = cr({
      element: e,
      type: ur(e),
      tagName: f,
      value: w,
      maskInputOptions: l,
      maskInputFn: d
    }) : S && (g.checked = S);
  }
  if (f === "option" && (e.selected && !l.select ? g.selected = !0 : delete g.selected), f === "dialog" && e.open && (g.rr_open_mode = e.matches("dialog:modal") ? "modal" : "non-modal"), f === "canvas" && a) {
    if (e.__context === "2d")
      Vc(e) || (g.rr_dataURL = e.toDataURL(
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
    mt || (mt = r.createElement("canvas"), qi = mt.getContext("2d"));
    const w = e, S = w.currentSrc || w.getAttribute("src") || "<unknown-src>", v = w.crossOrigin, b = () => {
      w.removeEventListener("load", b);
      try {
        mt.width = w.naturalWidth, mt.height = w.naturalHeight, qi.drawImage(w, 0, 0), g.rr_dataURL = mt.toDataURL(
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
  f === "iframe" && !h(g.src) && (e.contentDocument || (g.rr_src = g.src), delete g.src);
  let y;
  try {
    customElements.get(f) && (y = !0);
  } catch {
  }
  return {
    type: ae.Element,
    tagName: f,
    attributes: g,
    childNodes: [],
    isSVG: ou(e) || void 0,
    needBlock: m,
    rootId: c,
    isCustom: y
  };
}
function J(e) {
  return e == null ? "" : e.toLowerCase();
}
function Uo(e) {
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
function fu(e, t) {
  if (t.comment && e.type === ae.Comment)
    return !0;
  if (e.type === ae.Element) {
    if (t.script && // script tag
    (e.tagName === "script" || // (module)preload link
    e.tagName === "link" && (e.attributes.rel === "preload" && e.attributes.as === "script" || e.attributes.rel === "modulepreload") || // prefetch link
    e.tagName === "link" && e.attributes.rel === "prefetch" && typeof e.attributes.href == "string" && _o(e.attributes.href) === "js"))
      return !0;
    if (t.headFavicon && (e.tagName === "link" && e.attributes.rel === "shortcut icon" || e.tagName === "meta" && (J(e.attributes.name).match(
      /^msapplication-tile(image|color)$/
    ) || J(e.attributes.name) === "application-name" || J(e.attributes.rel) === "icon" || J(e.attributes.rel) === "apple-touch-icon" || J(e.attributes.rel) === "shortcut icon")))
      return !0;
    if (e.tagName === "meta") {
      if (t.headMetaDescKeywords && J(e.attributes.name).match(/^description|keywords$/))
        return !0;
      if (t.headMetaSocial && (J(e.attributes.property).match(/^(og|twitter|fb):/) || // og = opengraph (facebook)
      J(e.attributes.name).match(/^(og|twitter):/) || J(e.attributes.name) === "pinterest"))
        return !0;
      if (t.headMetaRobots && (J(e.attributes.name) === "robots" || J(e.attributes.name) === "googlebot" || J(e.attributes.name) === "bingbot"))
        return !0;
      if (t.headMetaHttpEquiv && e.attributes["http-equiv"] !== void 0)
        return !0;
      if (t.headMetaAuthorship && (J(e.attributes.name) === "author" || J(e.attributes.name) === "generator" || J(e.attributes.name) === "framework" || J(e.attributes.name) === "publisher" || J(e.attributes.name) === "progid" || J(e.attributes.property).match(/^article:/) || J(e.attributes.property).match(/^product:/)))
        return !0;
      if (t.headMetaVerification && (J(e.attributes.name) === "google-site-verification" || J(e.attributes.name) === "yandex-verification" || J(e.attributes.name) === "csrf-token" || J(e.attributes.name) === "p:domain_verify" || J(e.attributes.name) === "verify-v1" || J(e.attributes.name) === "verification" || J(e.attributes.name) === "shopify-checkout-api-token"))
        return !0;
    }
  }
  return !1;
}
function wt(e, t) {
  const {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    maskTextClass: l,
    maskTextSelector: d,
    skipChild: o = !1,
    inlineStylesheet: p = !0,
    maskInputOptions: a = {},
    maskTextFn: h,
    maskInputFn: u,
    slimDOMOptions: c,
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
  let { needsMask: I } = t, { preserveWhiteSpace: M = !0 } = t;
  I || (I = Fo(
    e,
    l,
    d,
    I === void 0
  ));
  const $ = uu(e, {
    doc: r,
    mirror: i,
    blockClass: n,
    blockSelector: s,
    needsMask: I,
    inlineStylesheet: p,
    maskInputOptions: a,
    maskTextFn: h,
    maskInputFn: u,
    dataURLOptions: m,
    inlineImages: f,
    recordCanvas: g,
    keepIframeSrcFn: b,
    newlyAddedElement: k,
    cssCaptured: E
  });
  if (!$)
    return console.warn(e, "not serialized"), null;
  let N;
  i.hasNode(e) ? N = i.getId(e) : fu($, c) || !M && $.type === ae.Text && !$.textContent.replace(/^\s+|\s+$/gm, "").length ? N = Pt : N = $o();
  const C = Object.assign($, { id: N });
  if (i.add(e, C), N === Pt)
    return null;
  x && x(e);
  let he = !o;
  if (C.type === ae.Element) {
    he = he && !C.needBlock, delete C.needBlock;
    const B = ue.shadowRoot(e);
    B && Ot(B) && (C.isShadowHost = !0);
  }
  if ((C.type === ae.Document || C.type === ae.Element) && he) {
    c.headWhitespace && C.type === ae.Element && C.tagName === "head" && (M = !1);
    const B = {
      doc: r,
      mirror: i,
      blockClass: n,
      blockSelector: s,
      needsMask: I,
      maskTextClass: l,
      maskTextSelector: d,
      skipChild: o,
      inlineStylesheet: p,
      maskInputOptions: a,
      maskTextFn: h,
      maskInputFn: u,
      slimDOMOptions: c,
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
    if (!(C.type === ae.Element && C.tagName === "textarea" && C.attributes.value !== void 0)) {
      C.type === ae.Element && C.attributes._cssText !== void 0 && typeof C.attributes._cssText == "string" && (B.cssCaptured = !0);
      for (const Z of Array.from(ue.childNodes(e))) {
        const se = wt(Z, B);
        se && C.childNodes.push(se);
      }
    }
    let V = null;
    if (Po(e) && (V = ue.shadowRoot(e)))
      for (const Z of Array.from(ue.childNodes(V))) {
        const se = wt(Z, B);
        se && (Ot(V) && (se.isShadow = !0), C.childNodes.push(se));
      }
  }
  const ne = ue.parentNode(e);
  return ne && Rt(ne) && Ot(ne) && (C.isShadow = !0), C.type === ae.Element && C.tagName === "iframe" && lu(
    e,
    () => {
      const B = e.contentDocument;
      if (B && y) {
        const V = wt(B, {
          doc: B,
          mirror: i,
          blockClass: n,
          blockSelector: s,
          needsMask: I,
          maskTextClass: l,
          maskTextSelector: d,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: h,
          maskInputFn: u,
          slimDOMOptions: c,
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
        V && y(
          e,
          V
        );
      }
    },
    w
  ), C.type === ae.Element && C.tagName === "link" && typeof C.attributes.rel == "string" && (C.attributes.rel === "stylesheet" || C.attributes.rel === "preload" && typeof C.attributes.href == "string" && _o(C.attributes.href) === "css") && cu(
    e,
    () => {
      if (S) {
        const B = wt(e, {
          doc: r,
          mirror: i,
          blockClass: n,
          blockSelector: s,
          needsMask: I,
          maskTextClass: l,
          maskTextSelector: d,
          skipChild: !1,
          inlineStylesheet: p,
          maskInputOptions: a,
          maskTextFn: h,
          maskInputFn: u,
          slimDOMOptions: c,
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
        B && S(
          e,
          B
        );
      }
    },
    v
  ), C;
}
function mu(e, t) {
  const {
    mirror: r = new No(),
    blockClass: i = "rr-block",
    blockSelector: n = null,
    maskTextClass: s = "rr-mask",
    maskTextSelector: l = null,
    inlineStylesheet: d = !0,
    inlineImages: o = !1,
    recordCanvas: p = !1,
    maskAllInputs: a = !1,
    maskTextFn: h,
    maskInputFn: u,
    slimDOM: c = !1,
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
  } : a, k = Uo(c);
  return wt(e, {
    doc: e,
    mirror: r,
    blockClass: i,
    blockSelector: n,
    maskTextClass: s,
    maskTextSelector: l,
    skipChild: !1,
    inlineStylesheet: d,
    maskInputOptions: b,
    maskTextFn: h,
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
function gu(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function yu(e) {
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
var Yt = { exports: {} }, Hi;
function bu() {
  if (Hi) return Yt.exports;
  Hi = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return Yt.exports = t(), Yt.exports.createColors = t, Yt.exports;
}
const vu = {}, wu = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: vu
}, Symbol.toStringTag, { value: "Module" })), De = /* @__PURE__ */ yu(wu);
var Fr, Vi;
function ni() {
  if (Vi) return Fr;
  Vi = 1;
  let e = /* @__PURE__ */ bu(), t = De;
  class r extends Error {
    constructor(n, s, l, d, o, p) {
      super(n), this.name = "CssSyntaxError", this.reason = n, o && (this.file = o), d && (this.source = d), p && (this.plugin = p), typeof s < "u" && typeof l < "u" && (typeof s == "number" ? (this.line = s, this.column = l) : (this.line = s.line, this.column = s.column, this.endLine = l.line, this.endColumn = l.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(n) {
      if (!this.source) return "";
      let s = this.source;
      n == null && (n = e.isColorSupported), t && n && (s = t(s));
      let l = s.split(/\r?\n/), d = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, l.length), p = String(o).length, a, h;
      if (n) {
        let { bold: u, gray: c, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), h = (f) => c(f);
      } else
        a = h = (u) => u;
      return l.slice(d, o).map((u, c) => {
        let m = d + 1 + c, f = " " + (" " + m).slice(-p) + " | ";
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
  return Fr = r, r.default = r, Fr;
}
var Gt = {}, Yi;
function ii() {
  return Yi || (Yi = 1, Gt.isClean = Symbol("isClean"), Gt.my = Symbol("my")), Gt;
}
var Ur, Gi;
function Bo() {
  if (Gi) return Ur;
  Gi = 1;
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
      let l = "@" + n.name, d = n.params ? this.rawValue(n, "params") : "";
      if (typeof n.raws.afterName < "u" ? l += n.raws.afterName : d && (l += " "), n.nodes)
        this.block(n, l + d);
      else {
        let o = (n.raws.between || "") + (s ? ";" : "");
        this.builder(l + d + o, n);
      }
    }
    beforeAfter(n, s) {
      let l;
      n.type === "decl" ? l = this.raw(n, null, "beforeDecl") : n.type === "comment" ? l = this.raw(n, null, "beforeComment") : s === "before" ? l = this.raw(n, null, "beforeRule") : l = this.raw(n, null, "beforeClose");
      let d = n.parent, o = 0;
      for (; d && d.type !== "root"; )
        o += 1, d = d.parent;
      if (l.includes(`
`)) {
        let p = this.raw(n, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) l += p;
      }
      return l;
    }
    block(n, s) {
      let l = this.raw(n, "between", "beforeOpen");
      this.builder(s + l + "{", n, "start");
      let d;
      n.nodes && n.nodes.length ? (this.body(n), d = this.raw(n, "after")) : d = this.raw(n, "after", "emptyBody"), d && this.builder(d), this.builder("}", n, "end");
    }
    body(n) {
      let s = n.nodes.length - 1;
      for (; s > 0 && n.nodes[s].type === "comment"; )
        s -= 1;
      let l = this.raw(n, "semicolon");
      for (let d = 0; d < n.nodes.length; d++) {
        let o = n.nodes[d], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== d || l);
      }
    }
    comment(n) {
      let s = this.raw(n, "left", "commentLeft"), l = this.raw(n, "right", "commentRight");
      this.builder("/*" + s + n.text + l + "*/", n);
    }
    decl(n, s) {
      let l = this.raw(n, "between", "colon"), d = n.prop + l + this.rawValue(n, "value");
      n.important && (d += n.raws.important || " !important"), s && (d += ";"), this.builder(d, n);
    }
    document(n) {
      this.body(n);
    }
    raw(n, s, l) {
      let d;
      if (l || (l = s), s && (d = n.raws[s], typeof d < "u"))
        return d;
      let o = n.parent;
      if (l === "before" && (!o || o.type === "root" && o.first === n || o && o.type === "document"))
        return "";
      if (!o) return e[l];
      let p = n.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[l] < "u")
        return p.rawCache[l];
      if (l === "before" || l === "after")
        return this.beforeAfter(n, l);
      {
        let a = "raw" + t(l);
        this[a] ? d = this[a](p, n) : p.walk((h) => {
          if (d = h.raws[s], typeof d < "u") return !1;
        });
      }
      return typeof d > "u" && (d = e[l]), p.rawCache[l] = d, d;
    }
    rawBeforeClose(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length > 0 && typeof l.raws.after < "u")
          return s = l.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(n, s) {
      let l;
      return n.walkComments((d) => {
        if (typeof d.raws.before < "u")
          return l = d.raws.before, l.includes(`
`) && (l = l.replace(/[^\n]+$/, "")), !1;
      }), typeof l > "u" ? l = this.raw(s, null, "beforeDecl") : l && (l = l.replace(/\S/g, "")), l;
    }
    rawBeforeDecl(n, s) {
      let l;
      return n.walkDecls((d) => {
        if (typeof d.raws.before < "u")
          return l = d.raws.before, l.includes(`
`) && (l = l.replace(/[^\n]+$/, "")), !1;
      }), typeof l > "u" ? l = this.raw(s, null, "beforeRule") : l && (l = l.replace(/\S/g, "")), l;
    }
    rawBeforeOpen(n) {
      let s;
      return n.walk((l) => {
        if (l.type !== "decl" && (s = l.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && (l.parent !== n || n.first !== l) && typeof l.raws.before < "u")
          return s = l.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(n) {
      let s;
      return n.walkDecls((l) => {
        if (typeof l.raws.between < "u")
          return s = l.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length === 0 && (s = l.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(n) {
      if (n.raws.indent) return n.raws.indent;
      let s;
      return n.walk((l) => {
        let d = l.parent;
        if (d && d !== n && d.parent && d.parent === n && typeof l.raws.before < "u") {
          let o = l.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length && l.last.type === "decl" && (s = l.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(n, s) {
      let l = n[s], d = n.raws[s];
      return d && d.value === l ? d.raw : l;
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
  return Ur = r, r.default = r, Ur;
}
var Br, Xi;
function wr() {
  if (Xi) return Br;
  Xi = 1;
  let e = Bo();
  function t(r, i) {
    new e(i).stringify(r);
  }
  return Br = t, t.default = t, Br;
}
var Wr, Ji;
function xr() {
  if (Ji) return Wr;
  Ji = 1;
  let { isClean: e, my: t } = ii(), r = ni(), i = Bo(), n = wr();
  function s(d, o) {
    let p = new d.constructor();
    for (let a in d) {
      if (!Object.prototype.hasOwnProperty.call(d, a) || a === "proxyCache") continue;
      let h = d[a], u = typeof h;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = h : Array.isArray(h) ? p[a] = h.map((c) => s(c, p)) : (u === "object" && h !== null && (h = s(h)), p[a] = h);
    }
    return p;
  }
  class l {
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
      for (let c = 0; c < o; c++)
        a[c] === `
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
      for (let c in this) {
        if (!Object.prototype.hasOwnProperty.call(this, c) || c === "parent" || c === "proxyCache") continue;
        let m = this[c];
        if (Array.isArray(m))
          a[c] = m.map((f) => typeof f == "object" && f.toJSON ? f.toJSON(null, p) : f);
        else if (typeof m == "object" && m.toJSON)
          a[c] = m.toJSON(null, p);
        else if (c === "source") {
          let f = p.get(m.input);
          f == null && (f = u, p.set(m.input, u), u++), a[c] = {
            end: m.end,
            inputId: f,
            start: m.start
          };
        } else
          a[c] = m;
      }
      return h && (a.inputs = [...p.keys()].map((c) => c.toJSON())), a;
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
  return Wr = l, l.default = l, Wr;
}
var qr, Ki;
function kr() {
  if (Ki) return qr;
  Ki = 1;
  let e = xr();
  class t extends e {
    constructor(i) {
      i && typeof i.value < "u" && typeof i.value != "string" && (i = { ...i, value: String(i.value) }), super(i), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return qr = t, t.default = t, qr;
}
var jr, Zi;
function xu() {
  if (Zi) return jr;
  Zi = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return jr = { nanoid: (i = 21) => {
    let n = "", s = i;
    for (; s--; )
      n += e[Math.random() * 64 | 0];
    return n;
  }, customAlphabet: (i, n = 21) => (s = n) => {
    let l = "", d = s;
    for (; d--; )
      l += i[Math.random() * i.length | 0];
    return l;
  } }, jr;
}
var Hr, Qi;
function Wo() {
  if (Qi) return Hr;
  Qi = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = De, { existsSync: r, readFileSync: i } = De, { dirname: n, join: s } = De;
  function l(o) {
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
      let a = /^data:application\/json;charset=utf-?8;base64,/, h = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, c = /^data:application\/json,/;
      if (u.test(p) || c.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || h.test(p))
        return l(p.substr(RegExp.lastMatch.length));
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
  return Hr = d, d.default = d, Hr;
}
var Vr, es;
function Sr() {
  if (es) return Vr;
  es = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = De, { fileURLToPath: r, pathToFileURL: i } = De, { isAbsolute: n, resolve: s } = De, { nanoid: l } = /* @__PURE__ */ xu(), d = De, o = ni(), p = Wo(), a = Symbol("fromOffsetCache"), h = !!(e && t), u = !!(s && n);
  class c {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || n(g.from) ? this.file = g.from : this.file = s(g.from)), u && h) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let y = x.consumer().file;
          !this.file && y && (this.file = this.mapResolve(y));
        }
      }
      this.file || (this.id = "<input css " + l(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, y = {}) {
      let w, S, v;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let I = this.fromOffset(k.offset);
          g = I.line, x = I.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let I = this.fromOffset(E.offset);
          S = I.line, v = I.col;
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
      ), w.input = { column: x, endColumn: v, endLine: S, line: g, source: this.css }, this.file && (i && (w.input.url = i(this.file).toString()), w.input.file = this.file), w;
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
      n(S.source) ? b = i(S.source) : b = new URL(
        S.source,
        this.map.consumer().sourceRoot || i(this.map.mapFile)
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
  return Vr = c, c.default = c, d && d.registerInput && d.registerInput(c), Vr;
}
var Yr, ts;
function qo() {
  if (ts) return Yr;
  ts = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = De, { dirname: r, relative: i, resolve: n, sep: s } = De, { pathToFileURL: l } = De, d = Sr(), o = !!(e && t), p = !!(r && n && i && s);
  class a {
    constructor(u, c, m, f) {
      this.stringify = u, this.mapOpts = m.map || {}, this.root = c, this.opts = m, this.css = f, this.originalCSS = f, this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute, this.memoizedFileURLs = /* @__PURE__ */ new Map(), this.memoizedPaths = /* @__PURE__ */ new Map(), this.memoizedURLs = /* @__PURE__ */ new Map();
    }
    addAnnotation() {
      let u;
      this.isInline() ? u = "data:application/json;base64," + this.toBase64(this.map.toString()) : typeof this.mapOpts.annotation == "string" ? u = this.mapOpts.annotation : typeof this.mapOpts.annotation == "function" ? u = this.mapOpts.annotation(this.opts.to, this.root) : u = this.outputFile() + ".map";
      let c = `
`;
      this.css.includes(`\r
`) && (c = `\r
`), this.css += c + "/*# sourceMappingURL=" + u + " */";
    }
    applyPrevMaps() {
      for (let u of this.previous()) {
        let c = this.toUrl(this.path(u.file)), m = u.root || r(u.file), f;
        this.mapOpts.sourcesContent === !1 ? (f = new e(u.text), f.sourcesContent && (f.sourcesContent = null)) : f = u.consumer(), this.map.applySourceMap(f, c, this.toUrl(this.path(m)));
      }
    }
    clearAnnotation() {
      if (this.mapOpts.annotation !== !1)
        if (this.root) {
          let u;
          for (let c = this.root.nodes.length - 1; c >= 0; c--)
            u = this.root.nodes[c], u.type === "comment" && u.text.indexOf("# sourceMappingURL=") === 0 && this.root.removeChild(c);
        } else this.css && (this.css = this.css.replace(/\n*?\/\*#[\S\s]*?\*\/$/gm, ""));
    }
    generate() {
      if (this.clearAnnotation(), p && o && this.isMap())
        return this.generateMap();
      {
        let u = "";
        return this.stringify(this.root, (c) => {
          u += c;
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
      let u = 1, c = 1, m = "<no source>", f = {
        generated: { column: 0, line: 0 },
        original: { column: 0, line: 0 },
        source: ""
      }, g, x;
      this.stringify(this.root, (y, w, S) => {
        if (this.css += y, w && S !== "end" && (f.generated.line = u, f.generated.column = c - 1, w.source && w.source.start ? (f.source = this.sourcePath(w), f.original.line = w.source.start.line, f.original.column = w.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = y.match(/\n/g), g ? (u += g.length, x = y.lastIndexOf(`
`), c = y.length - x) : c += y.length, w && S !== "start") {
          let v = w.parent || { raws: {} };
          (!(w.type === "decl" || w.type === "atrule" && !w.nodes) || w !== v.last || v.raws.semicolon) && (w.source && w.source.end ? (f.source = this.sourcePath(w), f.original.line = w.source.end.line, f.original.column = w.source.end.column - 1, f.generated.line = u, f.generated.column = c - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = c - 1, this.map.addMapping(f)));
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
      return typeof u < "u" && u !== !0 ? !1 : this.previous().length ? this.previous().some((c) => c.inline) : !0;
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
      let c = this.memoizedPaths.get(u);
      if (c) return c;
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
              let c = u.source.input.map;
              this.previousMaps.includes(c) || this.previousMaps.push(c);
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
        this.root.walk((c) => {
          if (c.source) {
            let m = c.source.input.from;
            if (m && !u[m]) {
              u[m] = !0;
              let f = this.usesFileUrls ? this.toFileUrl(m) : this.toUrl(this.path(m));
              this.map.setSourceContent(f, c.source.input.css);
            }
          }
        });
      else if (this.css) {
        let c = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
        this.map.setSourceContent(c, this.css);
      }
    }
    sourcePath(u) {
      return this.mapOpts.from ? this.toUrl(this.mapOpts.from) : this.usesFileUrls ? this.toFileUrl(u.source.input.from) : this.toUrl(this.path(u.source.input.from));
    }
    toBase64(u) {
      return Buffer ? Buffer.from(u).toString("base64") : window.btoa(unescape(encodeURIComponent(u)));
    }
    toFileUrl(u) {
      let c = this.memoizedFileURLs.get(u);
      if (c) return c;
      if (l) {
        let m = l(u).toString();
        return this.memoizedFileURLs.set(u, m), m;
      } else
        throw new Error(
          "`map.absolute` option is not available in this PostCSS build"
        );
    }
    toUrl(u) {
      let c = this.memoizedURLs.get(u);
      if (c) return c;
      s === "\\" && (u = u.replace(/\\/g, "/"));
      let m = encodeURI(u).replace(/[#?]/g, encodeURIComponent);
      return this.memoizedURLs.set(u, m), m;
    }
  }
  return Yr = a, Yr;
}
var Gr, rs;
function Cr() {
  if (rs) return Gr;
  rs = 1;
  let e = xr();
  class t extends e {
    constructor(i) {
      super(i), this.type = "comment";
    }
  }
  return Gr = t, t.default = t, Gr;
}
var Xr, ns;
function ct() {
  if (ns) return Xr;
  ns = 1;
  let { isClean: e, my: t } = ii(), r = kr(), i = Cr(), n = xr(), s, l, d, o;
  function p(u) {
    return u.map((c) => (c.nodes && (c.nodes = p(c.nodes)), delete c.source, c));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let c of u.proxyOf.nodes)
        a(c);
  }
  class h extends n {
    append(...c) {
      for (let m of c) {
        let f = this.normalize(m, this.last);
        for (let g of f) this.proxyOf.nodes.push(g);
      }
      return this.markDirty(), this;
    }
    cleanRaws(c) {
      if (super.cleanRaws(c), this.nodes)
        for (let m of this.nodes) m.cleanRaws(c);
    }
    each(c) {
      if (!this.proxyOf.nodes) return;
      let m = this.getIterator(), f, g;
      for (; this.indexes[m] < this.proxyOf.nodes.length && (f = this.indexes[m], g = c(this.proxyOf.nodes[f], f), g !== !1); )
        this.indexes[m] += 1;
      return delete this.indexes[m], g;
    }
    every(c) {
      return this.nodes.every(c);
    }
    getIterator() {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach += 1;
      let c = this.lastEach;
      return this.indexes[c] = 0, c;
    }
    getProxyProcessor() {
      return {
        get(c, m) {
          return m === "proxyOf" ? c : c[m] ? m === "each" || typeof m == "string" && m.startsWith("walk") ? (...f) => c[m](
            ...f.map((g) => typeof g == "function" ? (x, y) => g(x.toProxy(), y) : g)
          ) : m === "every" || m === "some" ? (f) => c[m](
            (g, ...x) => f(g.toProxy(), ...x)
          ) : m === "root" ? () => c.root().toProxy() : m === "nodes" ? c.nodes.map((f) => f.toProxy()) : m === "first" || m === "last" ? c[m].toProxy() : c[m] : c[m];
        },
        set(c, m, f) {
          return c[m] === f || (c[m] = f, (m === "name" || m === "params" || m === "selector") && c.markDirty()), !0;
        }
      };
    }
    index(c) {
      return typeof c == "number" ? c : (c.proxyOf && (c = c.proxyOf), this.proxyOf.nodes.indexOf(c));
    }
    insertAfter(c, m) {
      let f = this.index(c), g = this.normalize(m, this.proxyOf.nodes[f]).reverse();
      f = this.index(c);
      for (let y of g) this.proxyOf.nodes.splice(f + 1, 0, y);
      let x;
      for (let y in this.indexes)
        x = this.indexes[y], f < x && (this.indexes[y] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(c, m) {
      let f = this.index(c), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(c);
      for (let w of x) this.proxyOf.nodes.splice(f, 0, w);
      let y;
      for (let w in this.indexes)
        y = this.indexes[w], f <= y && (this.indexes[w] = y + x.length);
      return this.markDirty(), this;
    }
    normalize(c, m) {
      if (typeof c == "string")
        c = p(s(c).nodes);
      else if (typeof c > "u")
        c = [];
      else if (Array.isArray(c)) {
        c = c.slice(0);
        for (let g of c)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (c.type === "root" && this.type !== "document") {
        c = c.nodes.slice(0);
        for (let g of c)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (c.type)
        c = [c];
      else if (c.prop) {
        if (typeof c.value > "u")
          throw new Error("Value field is missed in node creation");
        typeof c.value != "string" && (c.value = String(c.value)), c = [new r(c)];
      } else if (c.selector)
        c = [new l(c)];
      else if (c.name)
        c = [new d(c)];
      else if (c.text)
        c = [new i(c)];
      else
        throw new Error("Unknown node type in node creation");
      return c.map((g) => (g[t] || h.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
    }
    prepend(...c) {
      c = c.reverse();
      for (let m of c) {
        let f = this.normalize(m, this.first, "prepend").reverse();
        for (let g of f) this.proxyOf.nodes.unshift(g);
        for (let g in this.indexes)
          this.indexes[g] = this.indexes[g] + f.length;
      }
      return this.markDirty(), this;
    }
    push(c) {
      return c.parent = this, this.proxyOf.nodes.push(c), this;
    }
    removeAll() {
      for (let c of this.proxyOf.nodes) c.parent = void 0;
      return this.proxyOf.nodes = [], this.markDirty(), this;
    }
    removeChild(c) {
      c = this.index(c), this.proxyOf.nodes[c].parent = void 0, this.proxyOf.nodes.splice(c, 1);
      let m;
      for (let f in this.indexes)
        m = this.indexes[f], m >= c && (this.indexes[f] = m - 1);
      return this.markDirty(), this;
    }
    replaceValues(c, m, f) {
      return f || (f = m, m = {}), this.walkDecls((g) => {
        m.props && !m.props.includes(g.prop) || m.fast && !g.value.includes(m.fast) || (g.value = g.value.replace(c, f));
      }), this.markDirty(), this;
    }
    some(c) {
      return this.nodes.some(c);
    }
    walk(c) {
      return this.each((m, f) => {
        let g;
        try {
          g = c(m, f);
        } catch (x) {
          throw m.addToError(x);
        }
        return g !== !1 && m.walk && (g = m.walk(c)), g;
      });
    }
    walkAtRules(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "atrule" && c.test(f.name))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "atrule" && f.name === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
        if (f.type === "atrule")
          return m(f, g);
      }));
    }
    walkComments(c) {
      return this.walk((m, f) => {
        if (m.type === "comment")
          return c(m, f);
      });
    }
    walkDecls(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "decl" && c.test(f.prop))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "decl" && f.prop === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
        if (f.type === "decl")
          return m(f, g);
      }));
    }
    walkRules(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "rule" && c.test(f.selector))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "rule" && f.selector === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
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
    l = u;
  }, h.registerAtRule = (u) => {
    d = u;
  }, h.registerRoot = (u) => {
    o = u;
  }, Xr = h, h.default = h, h.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, d.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, l.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, i.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((c) => {
      h.rebuild(c);
    });
  }, Xr;
}
var Jr, is;
function si() {
  if (is) return Jr;
  is = 1;
  let e = ct(), t, r;
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
  }, Jr = i, i.default = i, Jr;
}
var Kr, ss;
function jo() {
  if (ss) return Kr;
  ss = 1;
  let e = {};
  return Kr = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, Kr;
}
var Zr, os;
function Ho() {
  if (os) return Zr;
  os = 1;
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
  return Zr = e, e.default = e, Zr;
}
var Qr, as;
function oi() {
  if (as) return Qr;
  as = 1;
  let e = Ho();
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
  return Qr = t, t.default = t, Qr;
}
var en, ls;
function ku() {
  if (ls) return en;
  ls = 1;
  const e = 39, t = 34, r = 92, i = 47, n = 10, s = 32, l = 12, d = 9, o = 13, p = 91, a = 93, h = 40, u = 41, c = 123, m = 125, f = 59, g = 42, x = 58, y = 64, w = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, v = /.[\r\n"'(/\\]/, b = /[\da-f]/i;
  return en = function(E, I = {}) {
    let M = E.css.valueOf(), $ = I.ignoreErrors, N, C, he, ne, B, V, Z, se, X, F, Ce = M.length, O = 0, le = [], pe = [];
    function Xe() {
      return O;
    }
    function oe(R) {
      throw E.error("Unclosed " + R, O);
    }
    function we() {
      return pe.length === 0 && O >= Ce;
    }
    function We(R) {
      if (pe.length) return pe.pop();
      if (O >= Ce) return;
      let T = R ? R.ignoreUnclosed : !1;
      switch (N = M.charCodeAt(O), N) {
        case n:
        case s:
        case d:
        case o:
        case l: {
          C = O;
          do
            C += 1, N = M.charCodeAt(C);
          while (N === s || N === n || N === d || N === o || N === l);
          F = ["space", M.slice(O, C)], O = C - 1;
          break;
        }
        case p:
        case a:
        case c:
        case m:
        case x:
        case f:
        case u: {
          let P = String.fromCharCode(N);
          F = [P, P, O];
          break;
        }
        case h: {
          if (se = le.length ? le.pop()[1] : "", X = M.charCodeAt(O + 1), se === "url" && X !== e && X !== t && X !== s && X !== n && X !== d && X !== l && X !== o) {
            C = O;
            do {
              if (V = !1, C = M.indexOf(")", C + 1), C === -1)
                if ($ || T) {
                  C = O;
                  break;
                } else
                  oe("bracket");
              for (Z = C; M.charCodeAt(Z - 1) === r; )
                Z -= 1, V = !V;
            } while (V);
            F = ["brackets", M.slice(O, C + 1), O, C], O = C;
          } else
            C = M.indexOf(")", O + 1), ne = M.slice(O, C + 1), C === -1 || v.test(ne) ? F = ["(", "(", O] : (F = ["brackets", ne, O, C], O = C);
          break;
        }
        case e:
        case t: {
          he = N === e ? "'" : '"', C = O;
          do {
            if (V = !1, C = M.indexOf(he, C + 1), C === -1)
              if ($ || T) {
                C = O + 1;
                break;
              } else
                oe("string");
            for (Z = C; M.charCodeAt(Z - 1) === r; )
              Z -= 1, V = !V;
          } while (V);
          F = ["string", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        case y: {
          w.lastIndex = O + 1, w.test(M), w.lastIndex === 0 ? C = M.length - 1 : C = w.lastIndex - 2, F = ["at-word", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        case r: {
          for (C = O, B = !0; M.charCodeAt(C + 1) === r; )
            C += 1, B = !B;
          if (N = M.charCodeAt(C + 1), B && N !== i && N !== s && N !== n && N !== d && N !== o && N !== l && (C += 1, b.test(M.charAt(C)))) {
            for (; b.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          F = ["word", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        default: {
          N === i && M.charCodeAt(O + 1) === g ? (C = M.indexOf("*/", O + 2) + 1, C === 0 && ($ || T ? C = M.length : oe("comment")), F = ["comment", M.slice(O, C + 1), O, C], O = C) : (S.lastIndex = O + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, F = ["word", M.slice(O, C + 1), O, C], le.push(F), O = C);
          break;
        }
      }
      return O++, F;
    }
    function Ae(R) {
      pe.push(R);
    }
    return {
      back: Ae,
      endOfFile: we,
      nextToken: We,
      position: Xe
    };
  }, en;
}
var tn, cs;
function ai() {
  if (cs) return tn;
  cs = 1;
  let e = ct();
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
  return tn = t, t.default = t, e.registerAtRule(t), tn;
}
var rn, us;
function Dt() {
  if (us) return rn;
  us = 1;
  let e = ct(), t, r;
  class i extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, l, d) {
      let o = super.normalize(s);
      if (l) {
        if (d === "prepend")
          this.nodes.length > 1 ? l.raws.before = this.nodes[1].raws.before : delete l.raws.before;
        else if (this.first !== l)
          for (let p of o)
            p.raws.before = l.raws.before;
      }
      return o;
    }
    removeChild(s, l) {
      let d = this.index(s);
      return !l && d === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[d].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, rn = i, i.default = i, e.registerRoot(i), rn;
}
var nn, ds;
function Vo() {
  if (ds) return nn;
  ds = 1;
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
      let n = [], s = "", l = !1, d = 0, o = !1, p = "", a = !1;
      for (let h of t)
        a ? a = !1 : h === "\\" ? a = !0 : o ? h === p && (o = !1) : h === '"' || h === "'" ? (o = !0, p = h) : h === "(" ? d += 1 : h === ")" ? d > 0 && (d -= 1) : d === 0 && r.includes(h) && (l = !0), l ? (s !== "" && n.push(s.trim()), s = "", l = !1) : s += h;
      return (i || s !== "") && n.push(s.trim()), n;
    }
  };
  return nn = e, e.default = e, nn;
}
var sn, hs;
function li() {
  if (hs) return sn;
  hs = 1;
  let e = ct(), t = Vo();
  class r extends e {
    constructor(n) {
      super(n), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(n) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, l = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = n.join(l);
    }
  }
  return sn = r, r.default = r, e.registerRule(r), sn;
}
var on, ps;
function Su() {
  if (ps) return on;
  ps = 1;
  let e = kr(), t = ku(), r = Cr(), i = ai(), n = Dt(), s = li();
  const l = {
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
      let u, c, m, f = !1, g = !1, x = [], y = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? y.push(u === "(" ? ")" : "]") : u === "{" && y.length > 0 ? y.push("}") : u === y[y.length - 1] && y.pop(), y.length === 0)
          if (u === ";") {
            h.source.end = this.getPosition(a[2]), h.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, c = x[m]; c && c[0] === "space"; )
                c = x[--m];
              c && (h.source.end = this.getPosition(c[3] || c[2]), h.source.end.offset++);
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
      let u = 0, c;
      for (let m = h - 1; m >= 0 && (c = a[m], !(c[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        c[0] === "word" ? c[3] + 1 : c[2]
      );
    }
    colon(a) {
      let h = 0, u, c, m;
      for (let [f, g] of a.entries()) {
        if (u = g, c = u[0], c === "(" && (h += 1), c === ")" && (h -= 1), h === 0 && c === ":")
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
        let c = u.match(/^(\s*)([^]*\S)(\s*)$/);
        h.text = c[2], h.raws.left = c[1], h.raws.right = c[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, h) {
      let u = new e();
      this.init(u, a[0][2]);
      let c = a[a.length - 1];
      for (c[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        c[3] || c[2] || d(a)
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
      a.some((y) => y[0] !== "space" && y[0] !== "comment") && (u.raws.between += f.map((y) => y[1]).join(""), f = []), this.raw(u, "value", f.concat(a), h), u.value.includes(":") && !h && this.checkMissedSemicolon(a);
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
      let h = !1, u = null, c = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], y = a;
      for (; y; ) {
        if (u = y[0], x.push(y), u === "(" || u === "[")
          m || (m = y), f.push(u === "(" ? ")" : "]");
        else if (g && c && u === "{")
          m || (m = y), f.push("}");
        else if (f.length === 0)
          if (u === ";")
            if (c) {
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
          } else u === ":" && (c = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        y = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (h = !0), f.length > 0 && this.unclosedBracket(m), h && c) {
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
    raw(a, h, u, c) {
      let m, f, g = u.length, x = "", y = !0, w, S;
      for (let v = 0; v < g; v += 1)
        m = u[v], f = m[0], f === "space" && v === g - 1 && !c ? y = !1 : f === "comment" ? (S = u[v - 1] ? u[v - 1][0] : "empty", w = u[v + 1] ? u[v + 1][0] : "empty", !l[S] && !l[w] ? x.slice(-1) === "," ? y = !1 : x += m[1] : y = !1) : x += m[1];
      if (!y) {
        let v = u.reduce((b, k) => b + k[1], "");
        a.raws[h] = { raw: v, value: x };
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
      for (let c = h; c < a.length; c++)
        u += a[c][1];
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
  return on = o, on;
}
var an, fs;
function ci() {
  if (fs) return an;
  fs = 1;
  let e = ct(), t = Su(), r = Sr();
  function i(n, s) {
    let l = new r(n, s), d = new t(l);
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
  return an = i, i.default = i, e.registerParse(i), an;
}
var ln, ms;
function Yo() {
  if (ms) return ln;
  ms = 1;
  let { isClean: e, my: t } = ii(), r = qo(), i = wr(), n = ct(), s = si(), l = jo(), d = oi(), o = ci(), p = Dt();
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
  }, c = 0;
  function m(S) {
    return typeof S == "object" && typeof S.then == "function";
  }
  function f(S) {
    let v = !1, b = a[S.type];
    return S.type === "decl" ? v = S.prop.toLowerCase() : S.type === "atrule" && (v = S.name.toLowerCase()), v && S.append ? [
      b,
      b + "-" + v,
      c,
      b + "Exit",
      b + "Exit-" + v
    ] : v ? [b, b + "-" + v, b + "Exit", b + "Exit-" + v] : S.append ? [b, c, b + "Exit"] : [b, b + "Exit"];
  }
  function g(S) {
    let v;
    return S.type === "document" ? v = ["Document", c, "DocumentExit"] : S.type === "root" ? v = ["Root", c, "RootExit"] : v = f(S), {
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
      else if (b instanceof w || b instanceof d)
        E = x(b.root), b.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = b.map);
      else {
        let I = o;
        k.syntax && (I = k.syntax.parse), k.parser && (I = k.parser), I.parse && (I = I.parse);
        try {
          E = I(b, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && n.rebuild(E);
      }
      this.result = new d(v, E, k), this.helpers = { ...y, postcss: y, result: this.result }, this.plugins = this.processor.plugins.map((I) => typeof I == "object" && I.prepare ? { ...I, ...I.prepare(this.result) } : I);
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
          let E = k.postcssPlugin, I = k.postcssVersion, M = this.result.processor.version, $ = I.split("."), N = M.split(".");
          ($[0] !== N[0] || parseInt($[1]) > parseInt(N[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + I + ". Perhaps this is the source of the error below."
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
            if (!h[k] && /^[A-Z]/.test(k))
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
                let I = b[b.length - 1].node;
                throw this.handleError(E, I);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [b, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = b;
            try {
              if (v.type === "document") {
                let E = v.nodes.map(
                  (I) => k(I, this.helpers)
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
      let v = this.result.opts, b = i;
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
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || l(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(v, b);
    }
    toString() {
      return this.css;
    }
    visitSync(v, b) {
      for (let [k, E] of v) {
        this.result.lastPlugin = k;
        let I;
        try {
          I = E(b, this.helpers);
        } catch (M) {
          throw this.handleError(M, b.proxyOf);
        }
        if (b.type !== "root" && b.type !== "document" && !b.parent)
          return !0;
        if (m(I))
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
        let [M, $] = E[b.visitorIndex];
        b.visitorIndex += 1, b.visitorIndex === E.length && (b.visitors = [], b.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return $(k.toProxy(), this.helpers);
        } catch (N) {
          throw this.handleError(N, k);
        }
      }
      if (b.iterator !== 0) {
        let M = b.iterator, $;
        for (; $ = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !$[e]) {
            $[e] = !0, v.push(g($));
            return;
          }
        b.iterator = 0, delete k.indexes[M];
      }
      let I = b.events;
      for (; b.eventIndex < I.length; ) {
        let M = I[b.eventIndex];
        if (b.eventIndex += 1, M === c) {
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
        if (k === c)
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
  }, ln = w, w.default = w, p.registerLazyResult(w), s.registerLazyResult(w), ln;
}
var cn, gs;
function Cu() {
  if (gs) return cn;
  gs = 1;
  let e = qo(), t = wr(), r = jo(), i = ci();
  const n = oi();
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
      let c = new e(h, a, this._opts, o);
      if (c.isMap()) {
        let [m, f] = c.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        c.clearAnnotation(), this.result.css = c.css;
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
  return cn = s, s.default = s, cn;
}
var un, ys;
function Eu() {
  if (ys) return un;
  ys = 1;
  let e = Cu(), t = Yo(), r = si(), i = Dt();
  class n {
    constructor(l = []) {
      this.version = "8.4.38", this.plugins = this.normalize(l);
    }
    normalize(l) {
      let d = [];
      for (let o of l)
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
    process(l, d = {}) {
      return !this.plugins.length && !d.parser && !d.stringifier && !d.syntax ? new e(this, l, d) : new t(this, l, d);
    }
    use(l) {
      return this.plugins = this.plugins.concat(this.normalize([l])), this;
    }
  }
  return un = n, n.default = n, i.registerProcessor(n), r.registerProcessor(n), un;
}
var dn, bs;
function Mu() {
  if (bs) return dn;
  bs = 1;
  let e = kr(), t = Wo(), r = Cr(), i = ai(), n = Sr(), s = Dt(), l = li();
  function d(o, p) {
    if (Array.isArray(o)) return o.map((u) => d(u));
    let { inputs: a, ...h } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let c = { ...u, __proto__: n.prototype };
        c.map && (c.map = {
          ...c.map,
          __proto__: t.prototype
        }), p.push(c);
      }
    }
    if (h.nodes && (h.nodes = o.nodes.map((u) => d(u, p))), h.source) {
      let { inputId: u, ...c } = h.source;
      h.source = c, u != null && (h.source.input = p[u]);
    }
    if (h.type === "root")
      return new s(h);
    if (h.type === "decl")
      return new e(h);
    if (h.type === "rule")
      return new l(h);
    if (h.type === "comment")
      return new r(h);
    if (h.type === "atrule")
      return new i(h);
    throw new Error("Unknown node type: " + o.type);
  }
  return dn = d, d.default = d, dn;
}
var hn, vs;
function Ru() {
  if (vs) return hn;
  vs = 1;
  let e = ni(), t = kr(), r = Yo(), i = ct(), n = Eu(), s = wr(), l = Mu(), d = si(), o = Ho(), p = Cr(), a = ai(), h = oi(), u = Sr(), c = ci(), m = Vo(), f = li(), g = Dt(), x = xr();
  function y(...w) {
    return w.length === 1 && Array.isArray(w[0]) && (w = w[0]), new n(w);
  }
  return y.plugin = function(S, v) {
    let b = !1;
    function k(...I) {
      console && console.warn && !b && (b = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = v(...I);
      return M.postcssPlugin = S, M.postcssVersion = new n().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(I, M, $) {
      return y([k($)]).process(I, M);
    }, k;
  }, y.stringify = s, y.parse = c, y.fromJSON = l, y.list = m, y.comment = (w) => new p(w), y.atRule = (w) => new a(w), y.decl = (w) => new t(w), y.rule = (w) => new f(w), y.root = (w) => new g(w), y.document = (w) => new d(w), y.CssSyntaxError = e, y.Declaration = t, y.Container = i, y.Processor = n, y.Document = d, y.Comment = p, y.Warning = o, y.AtRule = a, y.Result = h, y.Input = u, y.Rule = f, y.Root = g, y.Node = x, r.registerPostcss(y), hn = y, y.default = y, hn;
}
var Ou = Ru();
const Q = /* @__PURE__ */ gu(Ou);
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
var Iu = Object.defineProperty, Au = (e, t, r) => t in e ? Iu(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r, Oe = (e, t, r) => Au(e, typeof t != "symbol" ? t + "" : t, r);
Date.now().toString();
function Lu(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function Pu(e) {
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
var Xt = { exports: {} }, ws;
function Tu() {
  if (ws) return Xt.exports;
  ws = 1;
  var e = String, t = function() {
    return { isColorSupported: !1, reset: e, bold: e, dim: e, italic: e, underline: e, inverse: e, hidden: e, strikethrough: e, black: e, red: e, green: e, yellow: e, blue: e, magenta: e, cyan: e, white: e, gray: e, bgBlack: e, bgRed: e, bgGreen: e, bgYellow: e, bgBlue: e, bgMagenta: e, bgCyan: e, bgWhite: e };
  };
  return Xt.exports = t(), Xt.exports.createColors = t, Xt.exports;
}
const Nu = {}, _u = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Nu
}, Symbol.toStringTag, { value: "Module" })), ze = /* @__PURE__ */ Pu(_u);
var pn, xs;
function ui() {
  if (xs) return pn;
  xs = 1;
  let e = /* @__PURE__ */ Tu(), t = ze;
  class r extends Error {
    constructor(n, s, l, d, o, p) {
      super(n), this.name = "CssSyntaxError", this.reason = n, o && (this.file = o), d && (this.source = d), p && (this.plugin = p), typeof s < "u" && typeof l < "u" && (typeof s == "number" ? (this.line = s, this.column = l) : (this.line = s.line, this.column = s.column, this.endLine = l.line, this.endColumn = l.column)), this.setMessage(), Error.captureStackTrace && Error.captureStackTrace(this, r);
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "", this.message += this.file ? this.file : "<css input>", typeof this.line < "u" && (this.message += ":" + this.line + ":" + this.column), this.message += ": " + this.reason;
    }
    showSourceCode(n) {
      if (!this.source) return "";
      let s = this.source;
      n == null && (n = e.isColorSupported), t && n && (s = t(s));
      let l = s.split(/\r?\n/), d = Math.max(this.line - 3, 0), o = Math.min(this.line + 2, l.length), p = String(o).length, a, h;
      if (n) {
        let { bold: u, gray: c, red: m } = e.createColors(!0);
        a = (f) => u(m(f)), h = (f) => c(f);
      } else
        a = h = (u) => u;
      return l.slice(d, o).map((u, c) => {
        let m = d + 1 + c, f = " " + (" " + m).slice(-p) + " | ";
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
  return pn = r, r.default = r, pn;
}
var Jt = {}, ks;
function di() {
  return ks || (ks = 1, Jt.isClean = Symbol("isClean"), Jt.my = Symbol("my")), Jt;
}
var fn, Ss;
function Go() {
  if (Ss) return fn;
  Ss = 1;
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
      let l = "@" + n.name, d = n.params ? this.rawValue(n, "params") : "";
      if (typeof n.raws.afterName < "u" ? l += n.raws.afterName : d && (l += " "), n.nodes)
        this.block(n, l + d);
      else {
        let o = (n.raws.between || "") + (s ? ";" : "");
        this.builder(l + d + o, n);
      }
    }
    beforeAfter(n, s) {
      let l;
      n.type === "decl" ? l = this.raw(n, null, "beforeDecl") : n.type === "comment" ? l = this.raw(n, null, "beforeComment") : s === "before" ? l = this.raw(n, null, "beforeRule") : l = this.raw(n, null, "beforeClose");
      let d = n.parent, o = 0;
      for (; d && d.type !== "root"; )
        o += 1, d = d.parent;
      if (l.includes(`
`)) {
        let p = this.raw(n, null, "indent");
        if (p.length)
          for (let a = 0; a < o; a++) l += p;
      }
      return l;
    }
    block(n, s) {
      let l = this.raw(n, "between", "beforeOpen");
      this.builder(s + l + "{", n, "start");
      let d;
      n.nodes && n.nodes.length ? (this.body(n), d = this.raw(n, "after")) : d = this.raw(n, "after", "emptyBody"), d && this.builder(d), this.builder("}", n, "end");
    }
    body(n) {
      let s = n.nodes.length - 1;
      for (; s > 0 && n.nodes[s].type === "comment"; )
        s -= 1;
      let l = this.raw(n, "semicolon");
      for (let d = 0; d < n.nodes.length; d++) {
        let o = n.nodes[d], p = this.raw(o, "before");
        p && this.builder(p), this.stringify(o, s !== d || l);
      }
    }
    comment(n) {
      let s = this.raw(n, "left", "commentLeft"), l = this.raw(n, "right", "commentRight");
      this.builder("/*" + s + n.text + l + "*/", n);
    }
    decl(n, s) {
      let l = this.raw(n, "between", "colon"), d = n.prop + l + this.rawValue(n, "value");
      n.important && (d += n.raws.important || " !important"), s && (d += ";"), this.builder(d, n);
    }
    document(n) {
      this.body(n);
    }
    raw(n, s, l) {
      let d;
      if (l || (l = s), s && (d = n.raws[s], typeof d < "u"))
        return d;
      let o = n.parent;
      if (l === "before" && (!o || o.type === "root" && o.first === n || o && o.type === "document"))
        return "";
      if (!o) return e[l];
      let p = n.root();
      if (p.rawCache || (p.rawCache = {}), typeof p.rawCache[l] < "u")
        return p.rawCache[l];
      if (l === "before" || l === "after")
        return this.beforeAfter(n, l);
      {
        let a = "raw" + t(l);
        this[a] ? d = this[a](p, n) : p.walk((h) => {
          if (d = h.raws[s], typeof d < "u") return !1;
        });
      }
      return typeof d > "u" && (d = e[l]), p.rawCache[l] = d, d;
    }
    rawBeforeClose(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length > 0 && typeof l.raws.after < "u")
          return s = l.raws.after, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawBeforeComment(n, s) {
      let l;
      return n.walkComments((d) => {
        if (typeof d.raws.before < "u")
          return l = d.raws.before, l.includes(`
`) && (l = l.replace(/[^\n]+$/, "")), !1;
      }), typeof l > "u" ? l = this.raw(s, null, "beforeDecl") : l && (l = l.replace(/\S/g, "")), l;
    }
    rawBeforeDecl(n, s) {
      let l;
      return n.walkDecls((d) => {
        if (typeof d.raws.before < "u")
          return l = d.raws.before, l.includes(`
`) && (l = l.replace(/[^\n]+$/, "")), !1;
      }), typeof l > "u" ? l = this.raw(s, null, "beforeRule") : l && (l = l.replace(/\S/g, "")), l;
    }
    rawBeforeOpen(n) {
      let s;
      return n.walk((l) => {
        if (l.type !== "decl" && (s = l.raws.between, typeof s < "u"))
          return !1;
      }), s;
    }
    rawBeforeRule(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && (l.parent !== n || n.first !== l) && typeof l.raws.before < "u")
          return s = l.raws.before, s.includes(`
`) && (s = s.replace(/[^\n]+$/, "")), !1;
      }), s && (s = s.replace(/\S/g, "")), s;
    }
    rawColon(n) {
      let s;
      return n.walkDecls((l) => {
        if (typeof l.raws.between < "u")
          return s = l.raws.between.replace(/[^\s:]/g, ""), !1;
      }), s;
    }
    rawEmptyBody(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length === 0 && (s = l.raws.after, typeof s < "u"))
          return !1;
      }), s;
    }
    rawIndent(n) {
      if (n.raws.indent) return n.raws.indent;
      let s;
      return n.walk((l) => {
        let d = l.parent;
        if (d && d !== n && d.parent && d.parent === n && typeof l.raws.before < "u") {
          let o = l.raws.before.split(`
`);
          return s = o[o.length - 1], s = s.replace(/\S/g, ""), !1;
        }
      }), s;
    }
    rawSemicolon(n) {
      let s;
      return n.walk((l) => {
        if (l.nodes && l.nodes.length && l.last.type === "decl" && (s = l.raws.semicolon, typeof s < "u"))
          return !1;
      }), s;
    }
    rawValue(n, s) {
      let l = n[s], d = n.raws[s];
      return d && d.value === l ? d.raw : l;
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
  return fn = r, r.default = r, fn;
}
var mn, Cs;
function Er() {
  if (Cs) return mn;
  Cs = 1;
  let e = Go();
  function t(r, i) {
    new e(i).stringify(r);
  }
  return mn = t, t.default = t, mn;
}
var gn, Es;
function Mr() {
  if (Es) return gn;
  Es = 1;
  let { isClean: e, my: t } = di(), r = ui(), i = Go(), n = Er();
  function s(d, o) {
    let p = new d.constructor();
    for (let a in d) {
      if (!Object.prototype.hasOwnProperty.call(d, a) || a === "proxyCache") continue;
      let h = d[a], u = typeof h;
      a === "parent" && u === "object" ? o && (p[a] = o) : a === "source" ? p[a] = h : Array.isArray(h) ? p[a] = h.map((c) => s(c, p)) : (u === "object" && h !== null && (h = s(h)), p[a] = h);
    }
    return p;
  }
  class l {
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
      for (let c = 0; c < o; c++)
        a[c] === `
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
      for (let c in this) {
        if (!Object.prototype.hasOwnProperty.call(this, c) || c === "parent" || c === "proxyCache") continue;
        let m = this[c];
        if (Array.isArray(m))
          a[c] = m.map((f) => typeof f == "object" && f.toJSON ? f.toJSON(null, p) : f);
        else if (typeof m == "object" && m.toJSON)
          a[c] = m.toJSON(null, p);
        else if (c === "source") {
          let f = p.get(m.input);
          f == null && (f = u, p.set(m.input, u), u++), a[c] = {
            end: m.end,
            inputId: f,
            start: m.start
          };
        } else
          a[c] = m;
      }
      return h && (a.inputs = [...p.keys()].map((c) => c.toJSON())), a;
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
  return gn = l, l.default = l, gn;
}
var yn, Ms;
function Rr() {
  if (Ms) return yn;
  Ms = 1;
  let e = Mr();
  class t extends e {
    constructor(i) {
      i && typeof i.value < "u" && typeof i.value != "string" && (i = { ...i, value: String(i.value) }), super(i), this.type = "decl";
    }
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
  }
  return yn = t, t.default = t, yn;
}
var bn, Rs;
function $u() {
  if (Rs) return bn;
  Rs = 1;
  let e = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return bn = { nanoid: (i = 21) => {
    let n = "", s = i;
    for (; s--; )
      n += e[Math.random() * 64 | 0];
    return n;
  }, customAlphabet: (i, n = 21) => (s = n) => {
    let l = "", d = s;
    for (; d--; )
      l += i[Math.random() * i.length | 0];
    return l;
  } }, bn;
}
var vn, Os;
function Xo() {
  if (Os) return vn;
  Os = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = ze, { existsSync: r, readFileSync: i } = ze, { dirname: n, join: s } = ze;
  function l(o) {
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
      let a = /^data:application\/json;charset=utf-?8;base64,/, h = /^data:application\/json;base64,/, u = /^data:application\/json;charset=utf-?8,/, c = /^data:application\/json,/;
      if (u.test(p) || c.test(p))
        return decodeURIComponent(p.substr(RegExp.lastMatch.length));
      if (a.test(p) || h.test(p))
        return l(p.substr(RegExp.lastMatch.length));
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
  return vn = d, d.default = d, vn;
}
var wn, Is;
function Or() {
  if (Is) return wn;
  Is = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = ze, { fileURLToPath: r, pathToFileURL: i } = ze, { isAbsolute: n, resolve: s } = ze, { nanoid: l } = /* @__PURE__ */ $u(), d = ze, o = ui(), p = Xo(), a = Symbol("fromOffsetCache"), h = !!(e && t), u = !!(s && n);
  class c {
    constructor(f, g = {}) {
      if (f === null || typeof f > "u" || typeof f == "object" && !f.toString)
        throw new Error(`PostCSS received ${f} instead of CSS string`);
      if (this.css = f.toString(), this.css[0] === "\uFEFF" || this.css[0] === "￾" ? (this.hasBOM = !0, this.css = this.css.slice(1)) : this.hasBOM = !1, g.from && (!u || /^\w+:\/\//.test(g.from) || n(g.from) ? this.file = g.from : this.file = s(g.from)), u && h) {
        let x = new p(this.css, g);
        if (x.text) {
          this.map = x;
          let y = x.consumer().file;
          !this.file && y && (this.file = this.mapResolve(y));
        }
      }
      this.file || (this.id = "<input css " + l(6) + ">"), this.map && (this.map.file = this.from);
    }
    error(f, g, x, y = {}) {
      let w, S, v;
      if (g && typeof g == "object") {
        let k = g, E = x;
        if (typeof k.offset == "number") {
          let I = this.fromOffset(k.offset);
          g = I.line, x = I.col;
        } else
          g = k.line, x = k.column;
        if (typeof E.offset == "number") {
          let I = this.fromOffset(E.offset);
          S = I.line, v = I.col;
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
      ), w.input = { column: x, endColumn: v, endLine: S, line: g, source: this.css }, this.file && (i && (w.input.url = i(this.file).toString()), w.input.file = this.file), w;
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
      n(S.source) ? b = i(S.source) : b = new URL(
        S.source,
        this.map.consumer().sourceRoot || i(this.map.mapFile)
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
  return wn = c, c.default = c, d && d.registerInput && d.registerInput(c), wn;
}
var xn, As;
function Jo() {
  if (As) return xn;
  As = 1;
  let { SourceMapConsumer: e, SourceMapGenerator: t } = ze, { dirname: r, relative: i, resolve: n, sep: s } = ze, { pathToFileURL: l } = ze, d = Or(), o = !!(e && t), p = !!(r && n && i && s);
  class a {
    constructor(u, c, m, f) {
      this.stringify = u, this.mapOpts = m.map || {}, this.root = c, this.opts = m, this.css = f, this.originalCSS = f, this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute, this.memoizedFileURLs = /* @__PURE__ */ new Map(), this.memoizedPaths = /* @__PURE__ */ new Map(), this.memoizedURLs = /* @__PURE__ */ new Map();
    }
    addAnnotation() {
      let u;
      this.isInline() ? u = "data:application/json;base64," + this.toBase64(this.map.toString()) : typeof this.mapOpts.annotation == "string" ? u = this.mapOpts.annotation : typeof this.mapOpts.annotation == "function" ? u = this.mapOpts.annotation(this.opts.to, this.root) : u = this.outputFile() + ".map";
      let c = `
`;
      this.css.includes(`\r
`) && (c = `\r
`), this.css += c + "/*# sourceMappingURL=" + u + " */";
    }
    applyPrevMaps() {
      for (let u of this.previous()) {
        let c = this.toUrl(this.path(u.file)), m = u.root || r(u.file), f;
        this.mapOpts.sourcesContent === !1 ? (f = new e(u.text), f.sourcesContent && (f.sourcesContent = null)) : f = u.consumer(), this.map.applySourceMap(f, c, this.toUrl(this.path(m)));
      }
    }
    clearAnnotation() {
      if (this.mapOpts.annotation !== !1)
        if (this.root) {
          let u;
          for (let c = this.root.nodes.length - 1; c >= 0; c--)
            u = this.root.nodes[c], u.type === "comment" && u.text.indexOf("# sourceMappingURL=") === 0 && this.root.removeChild(c);
        } else this.css && (this.css = this.css.replace(/\n*?\/\*#[\S\s]*?\*\/$/gm, ""));
    }
    generate() {
      if (this.clearAnnotation(), p && o && this.isMap())
        return this.generateMap();
      {
        let u = "";
        return this.stringify(this.root, (c) => {
          u += c;
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
      let u = 1, c = 1, m = "<no source>", f = {
        generated: { column: 0, line: 0 },
        original: { column: 0, line: 0 },
        source: ""
      }, g, x;
      this.stringify(this.root, (y, w, S) => {
        if (this.css += y, w && S !== "end" && (f.generated.line = u, f.generated.column = c - 1, w.source && w.source.start ? (f.source = this.sourcePath(w), f.original.line = w.source.start.line, f.original.column = w.source.start.column - 1, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, this.map.addMapping(f))), g = y.match(/\n/g), g ? (u += g.length, x = y.lastIndexOf(`
`), c = y.length - x) : c += y.length, w && S !== "start") {
          let v = w.parent || { raws: {} };
          (!(w.type === "decl" || w.type === "atrule" && !w.nodes) || w !== v.last || v.raws.semicolon) && (w.source && w.source.end ? (f.source = this.sourcePath(w), f.original.line = w.source.end.line, f.original.column = w.source.end.column - 1, f.generated.line = u, f.generated.column = c - 2, this.map.addMapping(f)) : (f.source = m, f.original.line = 1, f.original.column = 0, f.generated.line = u, f.generated.column = c - 1, this.map.addMapping(f)));
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
      return typeof u < "u" && u !== !0 ? !1 : this.previous().length ? this.previous().some((c) => c.inline) : !0;
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
      let c = this.memoizedPaths.get(u);
      if (c) return c;
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
              let c = u.source.input.map;
              this.previousMaps.includes(c) || this.previousMaps.push(c);
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
        this.root.walk((c) => {
          if (c.source) {
            let m = c.source.input.from;
            if (m && !u[m]) {
              u[m] = !0;
              let f = this.usesFileUrls ? this.toFileUrl(m) : this.toUrl(this.path(m));
              this.map.setSourceContent(f, c.source.input.css);
            }
          }
        });
      else if (this.css) {
        let c = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
        this.map.setSourceContent(c, this.css);
      }
    }
    sourcePath(u) {
      return this.mapOpts.from ? this.toUrl(this.mapOpts.from) : this.usesFileUrls ? this.toFileUrl(u.source.input.from) : this.toUrl(this.path(u.source.input.from));
    }
    toBase64(u) {
      return Buffer ? Buffer.from(u).toString("base64") : window.btoa(unescape(encodeURIComponent(u)));
    }
    toFileUrl(u) {
      let c = this.memoizedFileURLs.get(u);
      if (c) return c;
      if (l) {
        let m = l(u).toString();
        return this.memoizedFileURLs.set(u, m), m;
      } else
        throw new Error(
          "`map.absolute` option is not available in this PostCSS build"
        );
    }
    toUrl(u) {
      let c = this.memoizedURLs.get(u);
      if (c) return c;
      s === "\\" && (u = u.replace(/\\/g, "/"));
      let m = encodeURI(u).replace(/[#?]/g, encodeURIComponent);
      return this.memoizedURLs.set(u, m), m;
    }
  }
  return xn = a, xn;
}
var kn, Ls;
function Ir() {
  if (Ls) return kn;
  Ls = 1;
  let e = Mr();
  class t extends e {
    constructor(i) {
      super(i), this.type = "comment";
    }
  }
  return kn = t, t.default = t, kn;
}
var Sn, Ps;
function ut() {
  if (Ps) return Sn;
  Ps = 1;
  let { isClean: e, my: t } = di(), r = Rr(), i = Ir(), n = Mr(), s, l, d, o;
  function p(u) {
    return u.map((c) => (c.nodes && (c.nodes = p(c.nodes)), delete c.source, c));
  }
  function a(u) {
    if (u[e] = !1, u.proxyOf.nodes)
      for (let c of u.proxyOf.nodes)
        a(c);
  }
  class h extends n {
    append(...c) {
      for (let m of c) {
        let f = this.normalize(m, this.last);
        for (let g of f) this.proxyOf.nodes.push(g);
      }
      return this.markDirty(), this;
    }
    cleanRaws(c) {
      if (super.cleanRaws(c), this.nodes)
        for (let m of this.nodes) m.cleanRaws(c);
    }
    each(c) {
      if (!this.proxyOf.nodes) return;
      let m = this.getIterator(), f, g;
      for (; this.indexes[m] < this.proxyOf.nodes.length && (f = this.indexes[m], g = c(this.proxyOf.nodes[f], f), g !== !1); )
        this.indexes[m] += 1;
      return delete this.indexes[m], g;
    }
    every(c) {
      return this.nodes.every(c);
    }
    getIterator() {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach += 1;
      let c = this.lastEach;
      return this.indexes[c] = 0, c;
    }
    getProxyProcessor() {
      return {
        get(c, m) {
          return m === "proxyOf" ? c : c[m] ? m === "each" || typeof m == "string" && m.startsWith("walk") ? (...f) => c[m](
            ...f.map((g) => typeof g == "function" ? (x, y) => g(x.toProxy(), y) : g)
          ) : m === "every" || m === "some" ? (f) => c[m](
            (g, ...x) => f(g.toProxy(), ...x)
          ) : m === "root" ? () => c.root().toProxy() : m === "nodes" ? c.nodes.map((f) => f.toProxy()) : m === "first" || m === "last" ? c[m].toProxy() : c[m] : c[m];
        },
        set(c, m, f) {
          return c[m] === f || (c[m] = f, (m === "name" || m === "params" || m === "selector") && c.markDirty()), !0;
        }
      };
    }
    index(c) {
      return typeof c == "number" ? c : (c.proxyOf && (c = c.proxyOf), this.proxyOf.nodes.indexOf(c));
    }
    insertAfter(c, m) {
      let f = this.index(c), g = this.normalize(m, this.proxyOf.nodes[f]).reverse();
      f = this.index(c);
      for (let y of g) this.proxyOf.nodes.splice(f + 1, 0, y);
      let x;
      for (let y in this.indexes)
        x = this.indexes[y], f < x && (this.indexes[y] = x + g.length);
      return this.markDirty(), this;
    }
    insertBefore(c, m) {
      let f = this.index(c), g = f === 0 ? "prepend" : !1, x = this.normalize(m, this.proxyOf.nodes[f], g).reverse();
      f = this.index(c);
      for (let w of x) this.proxyOf.nodes.splice(f, 0, w);
      let y;
      for (let w in this.indexes)
        y = this.indexes[w], f <= y && (this.indexes[w] = y + x.length);
      return this.markDirty(), this;
    }
    normalize(c, m) {
      if (typeof c == "string")
        c = p(s(c).nodes);
      else if (typeof c > "u")
        c = [];
      else if (Array.isArray(c)) {
        c = c.slice(0);
        for (let g of c)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (c.type === "root" && this.type !== "document") {
        c = c.nodes.slice(0);
        for (let g of c)
          g.parent && g.parent.removeChild(g, "ignore");
      } else if (c.type)
        c = [c];
      else if (c.prop) {
        if (typeof c.value > "u")
          throw new Error("Value field is missed in node creation");
        typeof c.value != "string" && (c.value = String(c.value)), c = [new r(c)];
      } else if (c.selector)
        c = [new l(c)];
      else if (c.name)
        c = [new d(c)];
      else if (c.text)
        c = [new i(c)];
      else
        throw new Error("Unknown node type in node creation");
      return c.map((g) => (g[t] || h.rebuild(g), g = g.proxyOf, g.parent && g.parent.removeChild(g), g[e] && a(g), typeof g.raws.before > "u" && m && typeof m.raws.before < "u" && (g.raws.before = m.raws.before.replace(/\S/g, "")), g.parent = this.proxyOf, g));
    }
    prepend(...c) {
      c = c.reverse();
      for (let m of c) {
        let f = this.normalize(m, this.first, "prepend").reverse();
        for (let g of f) this.proxyOf.nodes.unshift(g);
        for (let g in this.indexes)
          this.indexes[g] = this.indexes[g] + f.length;
      }
      return this.markDirty(), this;
    }
    push(c) {
      return c.parent = this, this.proxyOf.nodes.push(c), this;
    }
    removeAll() {
      for (let c of this.proxyOf.nodes) c.parent = void 0;
      return this.proxyOf.nodes = [], this.markDirty(), this;
    }
    removeChild(c) {
      c = this.index(c), this.proxyOf.nodes[c].parent = void 0, this.proxyOf.nodes.splice(c, 1);
      let m;
      for (let f in this.indexes)
        m = this.indexes[f], m >= c && (this.indexes[f] = m - 1);
      return this.markDirty(), this;
    }
    replaceValues(c, m, f) {
      return f || (f = m, m = {}), this.walkDecls((g) => {
        m.props && !m.props.includes(g.prop) || m.fast && !g.value.includes(m.fast) || (g.value = g.value.replace(c, f));
      }), this.markDirty(), this;
    }
    some(c) {
      return this.nodes.some(c);
    }
    walk(c) {
      return this.each((m, f) => {
        let g;
        try {
          g = c(m, f);
        } catch (x) {
          throw m.addToError(x);
        }
        return g !== !1 && m.walk && (g = m.walk(c)), g;
      });
    }
    walkAtRules(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "atrule" && c.test(f.name))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "atrule" && f.name === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
        if (f.type === "atrule")
          return m(f, g);
      }));
    }
    walkComments(c) {
      return this.walk((m, f) => {
        if (m.type === "comment")
          return c(m, f);
      });
    }
    walkDecls(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "decl" && c.test(f.prop))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "decl" && f.prop === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
        if (f.type === "decl")
          return m(f, g);
      }));
    }
    walkRules(c, m) {
      return m ? c instanceof RegExp ? this.walk((f, g) => {
        if (f.type === "rule" && c.test(f.selector))
          return m(f, g);
      }) : this.walk((f, g) => {
        if (f.type === "rule" && f.selector === c)
          return m(f, g);
      }) : (m = c, this.walk((f, g) => {
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
    l = u;
  }, h.registerAtRule = (u) => {
    d = u;
  }, h.registerRoot = (u) => {
    o = u;
  }, Sn = h, h.default = h, h.rebuild = (u) => {
    u.type === "atrule" ? Object.setPrototypeOf(u, d.prototype) : u.type === "rule" ? Object.setPrototypeOf(u, l.prototype) : u.type === "decl" ? Object.setPrototypeOf(u, r.prototype) : u.type === "comment" ? Object.setPrototypeOf(u, i.prototype) : u.type === "root" && Object.setPrototypeOf(u, o.prototype), u[t] = !0, u.nodes && u.nodes.forEach((c) => {
      h.rebuild(c);
    });
  }, Sn;
}
var Cn, Ts;
function hi() {
  if (Ts) return Cn;
  Ts = 1;
  let e = ut(), t, r;
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
  }, Cn = i, i.default = i, Cn;
}
var En, Ns;
function Ko() {
  if (Ns) return En;
  Ns = 1;
  let e = {};
  return En = function(r) {
    e[r] || (e[r] = !0, typeof console < "u" && console.warn && console.warn(r));
  }, En;
}
var Mn, _s;
function Zo() {
  if (_s) return Mn;
  _s = 1;
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
  return Mn = e, e.default = e, Mn;
}
var Rn, $s;
function pi() {
  if ($s) return Rn;
  $s = 1;
  let e = Zo();
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
  return Rn = t, t.default = t, Rn;
}
var On, Ds;
function Du() {
  if (Ds) return On;
  Ds = 1;
  const e = 39, t = 34, r = 92, i = 47, n = 10, s = 32, l = 12, d = 9, o = 13, p = 91, a = 93, h = 40, u = 41, c = 123, m = 125, f = 59, g = 42, x = 58, y = 64, w = /[\t\n\f\r "#'()/;[\\\]{}]/g, S = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g, v = /.[\r\n"'(/\\]/, b = /[\da-f]/i;
  return On = function(E, I = {}) {
    let M = E.css.valueOf(), $ = I.ignoreErrors, N, C, he, ne, B, V, Z, se, X, F, Ce = M.length, O = 0, le = [], pe = [];
    function Xe() {
      return O;
    }
    function oe(R) {
      throw E.error("Unclosed " + R, O);
    }
    function we() {
      return pe.length === 0 && O >= Ce;
    }
    function We(R) {
      if (pe.length) return pe.pop();
      if (O >= Ce) return;
      let T = R ? R.ignoreUnclosed : !1;
      switch (N = M.charCodeAt(O), N) {
        case n:
        case s:
        case d:
        case o:
        case l: {
          C = O;
          do
            C += 1, N = M.charCodeAt(C);
          while (N === s || N === n || N === d || N === o || N === l);
          F = ["space", M.slice(O, C)], O = C - 1;
          break;
        }
        case p:
        case a:
        case c:
        case m:
        case x:
        case f:
        case u: {
          let P = String.fromCharCode(N);
          F = [P, P, O];
          break;
        }
        case h: {
          if (se = le.length ? le.pop()[1] : "", X = M.charCodeAt(O + 1), se === "url" && X !== e && X !== t && X !== s && X !== n && X !== d && X !== l && X !== o) {
            C = O;
            do {
              if (V = !1, C = M.indexOf(")", C + 1), C === -1)
                if ($ || T) {
                  C = O;
                  break;
                } else
                  oe("bracket");
              for (Z = C; M.charCodeAt(Z - 1) === r; )
                Z -= 1, V = !V;
            } while (V);
            F = ["brackets", M.slice(O, C + 1), O, C], O = C;
          } else
            C = M.indexOf(")", O + 1), ne = M.slice(O, C + 1), C === -1 || v.test(ne) ? F = ["(", "(", O] : (F = ["brackets", ne, O, C], O = C);
          break;
        }
        case e:
        case t: {
          he = N === e ? "'" : '"', C = O;
          do {
            if (V = !1, C = M.indexOf(he, C + 1), C === -1)
              if ($ || T) {
                C = O + 1;
                break;
              } else
                oe("string");
            for (Z = C; M.charCodeAt(Z - 1) === r; )
              Z -= 1, V = !V;
          } while (V);
          F = ["string", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        case y: {
          w.lastIndex = O + 1, w.test(M), w.lastIndex === 0 ? C = M.length - 1 : C = w.lastIndex - 2, F = ["at-word", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        case r: {
          for (C = O, B = !0; M.charCodeAt(C + 1) === r; )
            C += 1, B = !B;
          if (N = M.charCodeAt(C + 1), B && N !== i && N !== s && N !== n && N !== d && N !== o && N !== l && (C += 1, b.test(M.charAt(C)))) {
            for (; b.test(M.charAt(C + 1)); )
              C += 1;
            M.charCodeAt(C + 1) === s && (C += 1);
          }
          F = ["word", M.slice(O, C + 1), O, C], O = C;
          break;
        }
        default: {
          N === i && M.charCodeAt(O + 1) === g ? (C = M.indexOf("*/", O + 2) + 1, C === 0 && ($ || T ? C = M.length : oe("comment")), F = ["comment", M.slice(O, C + 1), O, C], O = C) : (S.lastIndex = O + 1, S.test(M), S.lastIndex === 0 ? C = M.length - 1 : C = S.lastIndex - 2, F = ["word", M.slice(O, C + 1), O, C], le.push(F), O = C);
          break;
        }
      }
      return O++, F;
    }
    function Ae(R) {
      pe.push(R);
    }
    return {
      back: Ae,
      endOfFile: we,
      nextToken: We,
      position: Xe
    };
  }, On;
}
var In, zs;
function fi() {
  if (zs) return In;
  zs = 1;
  let e = ut();
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
  return In = t, t.default = t, e.registerAtRule(t), In;
}
var An, Fs;
function zt() {
  if (Fs) return An;
  Fs = 1;
  let e = ut(), t, r;
  class i extends e {
    constructor(s) {
      super(s), this.type = "root", this.nodes || (this.nodes = []);
    }
    normalize(s, l, d) {
      let o = super.normalize(s);
      if (l) {
        if (d === "prepend")
          this.nodes.length > 1 ? l.raws.before = this.nodes[1].raws.before : delete l.raws.before;
        else if (this.first !== l)
          for (let p of o)
            p.raws.before = l.raws.before;
      }
      return o;
    }
    removeChild(s, l) {
      let d = this.index(s);
      return !l && d === 0 && this.nodes.length > 1 && (this.nodes[1].raws.before = this.nodes[d].raws.before), super.removeChild(s);
    }
    toResult(s = {}) {
      return new t(new r(), this, s).stringify();
    }
  }
  return i.registerLazyResult = (n) => {
    t = n;
  }, i.registerProcessor = (n) => {
    r = n;
  }, An = i, i.default = i, e.registerRoot(i), An;
}
var Ln, Us;
function Qo() {
  if (Us) return Ln;
  Us = 1;
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
      let n = [], s = "", l = !1, d = 0, o = !1, p = "", a = !1;
      for (let h of t)
        a ? a = !1 : h === "\\" ? a = !0 : o ? h === p && (o = !1) : h === '"' || h === "'" ? (o = !0, p = h) : h === "(" ? d += 1 : h === ")" ? d > 0 && (d -= 1) : d === 0 && r.includes(h) && (l = !0), l ? (s !== "" && n.push(s.trim()), s = "", l = !1) : s += h;
      return (i || s !== "") && n.push(s.trim()), n;
    }
  };
  return Ln = e, e.default = e, Ln;
}
var Pn, Bs;
function mi() {
  if (Bs) return Pn;
  Bs = 1;
  let e = ut(), t = Qo();
  class r extends e {
    constructor(n) {
      super(n), this.type = "rule", this.nodes || (this.nodes = []);
    }
    get selectors() {
      return t.comma(this.selector);
    }
    set selectors(n) {
      let s = this.selector ? this.selector.match(/,\s*/) : null, l = s ? s[0] : "," + this.raw("between", "beforeOpen");
      this.selector = n.join(l);
    }
  }
  return Pn = r, r.default = r, e.registerRule(r), Pn;
}
var Tn, Ws;
function zu() {
  if (Ws) return Tn;
  Ws = 1;
  let e = Rr(), t = Du(), r = Ir(), i = fi(), n = zt(), s = mi();
  const l = {
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
      let u, c, m, f = !1, g = !1, x = [], y = [];
      for (; !this.tokenizer.endOfFile(); ) {
        if (a = this.tokenizer.nextToken(), u = a[0], u === "(" || u === "[" ? y.push(u === "(" ? ")" : "]") : u === "{" && y.length > 0 ? y.push("}") : u === y[y.length - 1] && y.pop(), y.length === 0)
          if (u === ";") {
            h.source.end = this.getPosition(a[2]), h.source.end.offset++, this.semicolon = !0;
            break;
          } else if (u === "{") {
            g = !0;
            break;
          } else if (u === "}") {
            if (x.length > 0) {
              for (m = x.length - 1, c = x[m]; c && c[0] === "space"; )
                c = x[--m];
              c && (h.source.end = this.getPosition(c[3] || c[2]), h.source.end.offset++);
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
      let u = 0, c;
      for (let m = h - 1; m >= 0 && (c = a[m], !(c[0] !== "space" && (u += 1, u === 2))); m--)
        ;
      throw this.input.error(
        "Missed semicolon",
        c[0] === "word" ? c[3] + 1 : c[2]
      );
    }
    colon(a) {
      let h = 0, u, c, m;
      for (let [f, g] of a.entries()) {
        if (u = g, c = u[0], c === "(" && (h += 1), c === ")" && (h -= 1), h === 0 && c === ":")
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
        let c = u.match(/^(\s*)([^]*\S)(\s*)$/);
        h.text = c[2], h.raws.left = c[1], h.raws.right = c[3];
      }
    }
    createTokenizer() {
      this.tokenizer = t(this.input);
    }
    decl(a, h) {
      let u = new e();
      this.init(u, a[0][2]);
      let c = a[a.length - 1];
      for (c[0] === ";" && (this.semicolon = !0, a.pop()), u.source.end = this.getPosition(
        c[3] || c[2] || d(a)
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
      a.some((y) => y[0] !== "space" && y[0] !== "comment") && (u.raws.between += f.map((y) => y[1]).join(""), f = []), this.raw(u, "value", f.concat(a), h), u.value.includes(":") && !h && this.checkMissedSemicolon(a);
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
      let h = !1, u = null, c = !1, m = null, f = [], g = a[1].startsWith("--"), x = [], y = a;
      for (; y; ) {
        if (u = y[0], x.push(y), u === "(" || u === "[")
          m || (m = y), f.push(u === "(" ? ")" : "]");
        else if (g && c && u === "{")
          m || (m = y), f.push("}");
        else if (f.length === 0)
          if (u === ";")
            if (c) {
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
          } else u === ":" && (c = !0);
        else u === f[f.length - 1] && (f.pop(), f.length === 0 && (m = null));
        y = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile() && (h = !0), f.length > 0 && this.unclosedBracket(m), h && c) {
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
    raw(a, h, u, c) {
      let m, f, g = u.length, x = "", y = !0, w, S;
      for (let v = 0; v < g; v += 1)
        m = u[v], f = m[0], f === "space" && v === g - 1 && !c ? y = !1 : f === "comment" ? (S = u[v - 1] ? u[v - 1][0] : "empty", w = u[v + 1] ? u[v + 1][0] : "empty", !l[S] && !l[w] ? x.slice(-1) === "," ? y = !1 : x += m[1] : y = !1) : x += m[1];
      if (!y) {
        let v = u.reduce((b, k) => b + k[1], "");
        a.raws[h] = { raw: v, value: x };
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
      for (let c = h; c < a.length; c++)
        u += a[c][1];
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
  return Tn = o, Tn;
}
var Nn, qs;
function gi() {
  if (qs) return Nn;
  qs = 1;
  let e = ut(), t = zu(), r = Or();
  function i(n, s) {
    let l = new r(n, s), d = new t(l);
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
  return Nn = i, i.default = i, e.registerParse(i), Nn;
}
var _n, js;
function ea() {
  if (js) return _n;
  js = 1;
  let { isClean: e, my: t } = di(), r = Jo(), i = Er(), n = ut(), s = hi(), l = Ko(), d = pi(), o = gi(), p = zt();
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
  }, c = 0;
  function m(S) {
    return typeof S == "object" && typeof S.then == "function";
  }
  function f(S) {
    let v = !1, b = a[S.type];
    return S.type === "decl" ? v = S.prop.toLowerCase() : S.type === "atrule" && (v = S.name.toLowerCase()), v && S.append ? [
      b,
      b + "-" + v,
      c,
      b + "Exit",
      b + "Exit-" + v
    ] : v ? [b, b + "-" + v, b + "Exit", b + "Exit-" + v] : S.append ? [b, c, b + "Exit"] : [b, b + "Exit"];
  }
  function g(S) {
    let v;
    return S.type === "document" ? v = ["Document", c, "DocumentExit"] : S.type === "root" ? v = ["Root", c, "RootExit"] : v = f(S), {
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
      else if (b instanceof w || b instanceof d)
        E = x(b.root), b.map && (typeof k.map > "u" && (k.map = {}), k.map.inline || (k.map.inline = !1), k.map.prev = b.map);
      else {
        let I = o;
        k.syntax && (I = k.syntax.parse), k.parser && (I = k.parser), I.parse && (I = I.parse);
        try {
          E = I(b, k);
        } catch (M) {
          this.processed = !0, this.error = M;
        }
        E && !E[t] && n.rebuild(E);
      }
      this.result = new d(v, E, k), this.helpers = { ...y, postcss: y, result: this.result }, this.plugins = this.processor.plugins.map((I) => typeof I == "object" && I.prepare ? { ...I, ...I.prepare(this.result) } : I);
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
          let E = k.postcssPlugin, I = k.postcssVersion, M = this.result.processor.version, $ = I.split("."), N = M.split(".");
          ($[0] !== N[0] || parseInt($[1]) > parseInt(N[1])) && console.error(
            "Unknown error from PostCSS plugin. Your current PostCSS version is " + M + ", but " + E + " uses " + I + ". Perhaps this is the source of the error below."
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
            if (!h[k] && /^[A-Z]/.test(k))
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
                let I = b[b.length - 1].node;
                throw this.handleError(E, I);
              }
          }
        }
        if (this.listeners.OnceExit)
          for (let [b, k] of this.listeners.OnceExit) {
            this.result.lastPlugin = b;
            try {
              if (v.type === "document") {
                let E = v.nodes.map(
                  (I) => k(I, this.helpers)
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
      let v = this.result.opts, b = i;
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
      return process.env.NODE_ENV !== "production" && ("from" in this.opts || l(
        "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
      )), this.async().then(v, b);
    }
    toString() {
      return this.css;
    }
    visitSync(v, b) {
      for (let [k, E] of v) {
        this.result.lastPlugin = k;
        let I;
        try {
          I = E(b, this.helpers);
        } catch (M) {
          throw this.handleError(M, b.proxyOf);
        }
        if (b.type !== "root" && b.type !== "document" && !b.parent)
          return !0;
        if (m(I))
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
        let [M, $] = E[b.visitorIndex];
        b.visitorIndex += 1, b.visitorIndex === E.length && (b.visitors = [], b.visitorIndex = 0), this.result.lastPlugin = M;
        try {
          return $(k.toProxy(), this.helpers);
        } catch (N) {
          throw this.handleError(N, k);
        }
      }
      if (b.iterator !== 0) {
        let M = b.iterator, $;
        for (; $ = k.nodes[k.indexes[M]]; )
          if (k.indexes[M] += 1, !$[e]) {
            $[e] = !0, v.push(g($));
            return;
          }
        b.iterator = 0, delete k.indexes[M];
      }
      let I = b.events;
      for (; b.eventIndex < I.length; ) {
        let M = I[b.eventIndex];
        if (b.eventIndex += 1, M === c) {
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
        if (k === c)
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
  }, _n = w, w.default = w, p.registerLazyResult(w), s.registerLazyResult(w), _n;
}
var $n, Hs;
function Fu() {
  if (Hs) return $n;
  Hs = 1;
  let e = Jo(), t = Er(), r = Ko(), i = gi();
  const n = pi();
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
      let c = new e(h, a, this._opts, o);
      if (c.isMap()) {
        let [m, f] = c.generate();
        m && (this.result.css = m), f && (this.result.map = f);
      } else
        c.clearAnnotation(), this.result.css = c.css;
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
  return $n = s, s.default = s, $n;
}
var Dn, Vs;
function Uu() {
  if (Vs) return Dn;
  Vs = 1;
  let e = Fu(), t = ea(), r = hi(), i = zt();
  class n {
    constructor(l = []) {
      this.version = "8.4.38", this.plugins = this.normalize(l);
    }
    normalize(l) {
      let d = [];
      for (let o of l)
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
    process(l, d = {}) {
      return !this.plugins.length && !d.parser && !d.stringifier && !d.syntax ? new e(this, l, d) : new t(this, l, d);
    }
    use(l) {
      return this.plugins = this.plugins.concat(this.normalize([l])), this;
    }
  }
  return Dn = n, n.default = n, i.registerProcessor(n), r.registerProcessor(n), Dn;
}
var zn, Ys;
function Bu() {
  if (Ys) return zn;
  Ys = 1;
  let e = Rr(), t = Xo(), r = Ir(), i = fi(), n = Or(), s = zt(), l = mi();
  function d(o, p) {
    if (Array.isArray(o)) return o.map((u) => d(u));
    let { inputs: a, ...h } = o;
    if (a) {
      p = [];
      for (let u of a) {
        let c = { ...u, __proto__: n.prototype };
        c.map && (c.map = {
          ...c.map,
          __proto__: t.prototype
        }), p.push(c);
      }
    }
    if (h.nodes && (h.nodes = o.nodes.map((u) => d(u, p))), h.source) {
      let { inputId: u, ...c } = h.source;
      h.source = c, u != null && (h.source.input = p[u]);
    }
    if (h.type === "root")
      return new s(h);
    if (h.type === "decl")
      return new e(h);
    if (h.type === "rule")
      return new l(h);
    if (h.type === "comment")
      return new r(h);
    if (h.type === "atrule")
      return new i(h);
    throw new Error("Unknown node type: " + o.type);
  }
  return zn = d, d.default = d, zn;
}
var Fn, Gs;
function Wu() {
  if (Gs) return Fn;
  Gs = 1;
  let e = ui(), t = Rr(), r = ea(), i = ut(), n = Uu(), s = Er(), l = Bu(), d = hi(), o = Zo(), p = Ir(), a = fi(), h = pi(), u = Or(), c = gi(), m = Qo(), f = mi(), g = zt(), x = Mr();
  function y(...w) {
    return w.length === 1 && Array.isArray(w[0]) && (w = w[0]), new n(w);
  }
  return y.plugin = function(S, v) {
    let b = !1;
    function k(...I) {
      console && console.warn && !b && (b = !0, console.warn(
        S + `: postcss.plugin was deprecated. Migration guide:
https://evilmartians.com/chronicles/postcss-8-plugin-migration`
      ), process.env.LANG && process.env.LANG.startsWith("cn") && console.warn(
        S + `: 里面 postcss.plugin 被弃用. 迁移指南:
https://www.w3ctech.com/topic/2226`
      ));
      let M = v(...I);
      return M.postcssPlugin = S, M.postcssVersion = new n().version, M;
    }
    let E;
    return Object.defineProperty(k, "postcss", {
      get() {
        return E || (E = k()), E;
      }
    }), k.process = function(I, M, $) {
      return y([k($)]).process(I, M);
    }, k;
  }, y.stringify = s, y.parse = c, y.fromJSON = l, y.list = m, y.comment = (w) => new p(w), y.atRule = (w) => new a(w), y.decl = (w) => new t(w), y.rule = (w) => new f(w), y.root = (w) => new g(w), y.document = (w) => new d(w), y.CssSyntaxError = e, y.Declaration = t, y.Container = i, y.Processor = n, y.Document = d, y.Comment = p, y.Warning = o, y.AtRule = a, y.Result = h, y.Input = u, y.Rule = f, y.Root = g, y.Node = x, r.registerPostcss(y), Fn = y, y.default = y, Fn;
}
var qu = Wu();
const ee = /* @__PURE__ */ Lu(qu);
ee.stringify;
ee.fromJSON;
ee.plugin;
ee.parse;
ee.list;
ee.document;
ee.comment;
ee.atRule;
ee.rule;
ee.decl;
ee.root;
ee.CssSyntaxError;
ee.Declaration;
ee.Container;
ee.Processor;
ee.Document;
ee.Comment;
ee.Warning;
ee.AtRule;
ee.Result;
ee.Input;
ee.Rule;
ee.Root;
ee.Node;
class yi {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  constructor(...t) {
    Oe(this, "parentElement", null), Oe(this, "parentNode", null), Oe(this, "ownerDocument"), Oe(this, "firstChild", null), Oe(this, "lastChild", null), Oe(this, "previousSibling", null), Oe(this, "nextSibling", null), Oe(this, "ELEMENT_NODE", 1), Oe(this, "TEXT_NODE", 3), Oe(this, "nodeType"), Oe(this, "nodeName"), Oe(this, "RRNodeType");
  }
  get childNodes() {
    const t = [];
    let r = this.firstChild;
    for (; r; )
      t.push(r), r = r.nextSibling;
    return t;
  }
  contains(t) {
    if (t instanceof yi) {
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
const Xs = {
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
}, Js = {
  Node: ["contains", "getRootNode"],
  ShadowRoot: ["getSelection"],
  Element: [],
  MutationObserver: ["constructor"]
}, Kt = {}, ta = {}, ju = () => !!globalThis.Zone;
function bi(e) {
  if (Kt[e])
    return Kt[e];
  const t = globalThis[e], r = t.prototype, i = e in Xs ? Xs[e] : void 0, n = !!(i && // @ts-expect-error 2345
  i.every(
    (d) => {
      var o, p;
      return !!((p = (o = Object.getOwnPropertyDescriptor(r, d)) == null ? void 0 : o.get) != null && p.toString().includes("[native code]"));
    }
  )), s = e in Js ? Js[e] : void 0, l = !!(s && s.every(
    // @ts-expect-error 2345
    (d) => {
      var o;
      return typeof r[d] == "function" && ((o = r[d]) == null ? void 0 : o.toString().includes("[native code]"));
    }
  ));
  if (n && l && !ju())
    return Kt[e] = t.prototype, t.prototype;
  try {
    const d = document.createElement("iframe");
    d.style.display = "none", document.body.appendChild(d);
    const o = d.contentWindow;
    if (!o) return t.prototype;
    const p = o[e].prototype;
    if (!p)
      return d.remove(), r;
    const a = navigator.userAgent;
    return a.includes("Safari") && !a.includes("Chrome") ? (d.classList.add("rr-block"), d.setAttribute("__rrwebUntaintedMutationObserver", ""), ta[e] = () => d.remove()) : d.remove(), Kt[e] = p;
  } catch {
    return r;
  }
}
const Un = {};
function Ge(e, t, r) {
  var i;
  const n = `${e}.${String(r)}`;
  if (Un[n])
    return Un[n].call(
      t
    );
  const s = bi(e), l = (i = Object.getOwnPropertyDescriptor(
    s,
    r
  )) == null ? void 0 : i.get;
  return l ? (Un[n] = l, l.call(t)) : t[r];
}
const Bn = {};
function ra(e, t, r) {
  const i = `${e}.${String(r)}`;
  if (Bn[i])
    return Bn[i].bind(
      t
    );
  const s = bi(e)[r];
  return typeof s != "function" ? t[r] : (Bn[i] = s, s.bind(t));
}
function Hu(e) {
  return Ge("Node", e, "ownerDocument");
}
function Vu(e) {
  return Ge("Node", e, "childNodes");
}
function Yu(e) {
  return Ge("Node", e, "parentNode");
}
function Gu(e) {
  return Ge("Node", e, "parentElement");
}
function Xu(e) {
  return Ge("Node", e, "textContent");
}
function Ju(e, t) {
  return ra("Node", e, "contains")(t);
}
function Ku(e) {
  return ra("Node", e, "getRootNode")();
}
function Zu(e) {
  return !e || !("host" in e) ? null : Ge("ShadowRoot", e, "host");
}
function Qu(e) {
  return e.styleSheets;
}
function ed(e) {
  return !e || !("shadowRoot" in e) ? null : Ge("Element", e, "shadowRoot");
}
function td(e, t) {
  return Ge("Element", e, "querySelector")(t);
}
function rd(e, t) {
  return Ge("Element", e, "querySelectorAll")(t);
}
function na() {
  return [
    bi("MutationObserver").constructor,
    ta.MutationObserver ?? (() => {
    })
  ];
}
let Tt = Date.now;
/* @__PURE__ */ /[1-9][0-9]{12}/.test(Date.now().toString()) || (Tt = () => (/* @__PURE__ */ new Date()).getTime());
function dt(e, t, r) {
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
const W = {
  ownerDocument: Hu,
  childNodes: Vu,
  parentNode: Yu,
  parentElement: Gu,
  textContent: Xu,
  contains: Ju,
  getRootNode: Ku,
  host: Zu,
  styleSheets: Qu,
  shadowRoot: ed,
  querySelector: td,
  querySelectorAll: rd,
  nowTimestamp: Tt,
  mutationObserverCtor: na,
  patch: dt
};
function be(e, t, r = document) {
  const i = { capture: !0, passive: !0 };
  return r.addEventListener(e, t, i), () => r.removeEventListener(e, t, i);
}
const yt = `Please stop import mirror directly. Instead of that,\r
now you can use replayer.getMirror() to access the mirror instance of a replayer,\r
or you can use record.mirror to access the mirror instance during recording.`;
let Ks = {
  map: {},
  getId() {
    return console.error(yt), -1;
  },
  getNode() {
    return console.error(yt), null;
  },
  removeNodeFromMap() {
    console.error(yt);
  },
  has() {
    return console.error(yt), !1;
  },
  reset() {
    console.error(yt);
  }
};
typeof window < "u" && window.Proxy && window.Reflect && (Ks = new Proxy(Ks, {
  get(e, t, r) {
    return t === "map" && console.error(yt), Reflect.get(e, t, r);
  }
}));
function Nt(e, t, r = {}) {
  let i = null, n = 0;
  return function(...s) {
    const l = Date.now();
    !n && r.leading === !1 && (n = l);
    const d = t - (l - n), o = this;
    d <= 0 || d > t ? (i && (clearTimeout(i), i = null), n = l, e.apply(o, s)) : !i && r.trailing !== !1 && (i = setTimeout(() => {
      n = r.leading === !1 ? 0 : Date.now(), i = null, e.apply(o, s);
    }, d));
  };
}
function Ar(e, t, r, i, n = window) {
  const s = n.Object.getOwnPropertyDescriptor(e, t);
  return n.Object.defineProperty(
    e,
    t,
    i ? r : {
      set(l) {
        setTimeout(() => {
          r.set.call(this, l);
        }, 0), s && s.set && s.set.call(this, l);
      }
    }
  ), () => Ar(e, t, s || {}, !0);
}
function ia(e) {
  var t, r, i, n;
  const s = e.document;
  return {
    left: s.scrollingElement ? s.scrollingElement.scrollLeft : e.pageXOffset !== void 0 ? e.pageXOffset : s.documentElement.scrollLeft || (s == null ? void 0 : s.body) && ((t = W.parentElement(s.body)) == null ? void 0 : t.scrollLeft) || ((r = s == null ? void 0 : s.body) == null ? void 0 : r.scrollLeft) || 0,
    top: s.scrollingElement ? s.scrollingElement.scrollTop : e.pageYOffset !== void 0 ? e.pageYOffset : (s == null ? void 0 : s.documentElement.scrollTop) || (s == null ? void 0 : s.body) && ((i = W.parentElement(s.body)) == null ? void 0 : i.scrollTop) || ((n = s == null ? void 0 : s.body) == null ? void 0 : n.scrollTop) || 0
  };
}
function sa() {
  return window.innerHeight || document.documentElement && document.documentElement.clientHeight || document.body && document.body.clientHeight;
}
function oa() {
  return window.innerWidth || document.documentElement && document.documentElement.clientWidth || document.body && document.body.clientWidth;
}
function aa(e) {
  return e ? e.nodeType === e.ELEMENT_NODE ? e : W.parentElement(e) : null;
}
function ve(e, t, r, i) {
  if (!e)
    return !1;
  const n = aa(e);
  if (!n)
    return !1;
  try {
    if (typeof t == "string") {
      if (n.classList.contains(t) || i && n.closest("." + t) !== null) return !0;
    } else if (hr(n, t, i)) return !0;
  } catch {
  }
  return !!(r && (n.matches(r) || i && n.closest(r) !== null));
}
function nd(e, t) {
  return t.getId(e) !== -1;
}
function Wn(e, t, r) {
  return e.tagName === "TITLE" && r.headTitleMutations ? !0 : t.getId(e) === Pt;
}
function la(e, t) {
  if (Rt(e))
    return !1;
  const r = t.getId(e);
  if (!t.has(r))
    return !0;
  const i = W.parentNode(e);
  return i && i.nodeType === e.DOCUMENT_NODE ? !1 : i ? la(i, t) : !0;
}
function Yn(e) {
  return !!e.changedTouches;
}
function id(e = window) {
  "NodeList" in e && !e.NodeList.prototype.forEach && (e.NodeList.prototype.forEach = Array.prototype.forEach), "DOMTokenList" in e && !e.DOMTokenList.prototype.forEach && (e.DOMTokenList.prototype.forEach = Array.prototype.forEach);
}
function ca(e, t) {
  return !!(e.nodeName === "IFRAME" && t.getMeta(e));
}
function ua(e, t) {
  return !!(e.nodeName === "LINK" && e.nodeType === e.ELEMENT_NODE && e.getAttribute && e.getAttribute("rel") === "stylesheet" && t.getMeta(e));
}
function Gn(e) {
  return e ? e instanceof yi && "shadowRoot" in e ? !!e.shadowRoot : !!W.shadowRoot(e) : !1;
}
class sd {
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
function da(e) {
  var t;
  let r = null;
  return "getRootNode" in e && ((t = W.getRootNode(e)) == null ? void 0 : t.nodeType) === Node.DOCUMENT_FRAGMENT_NODE && W.host(W.getRootNode(e)) && (r = W.host(W.getRootNode(e))), r;
}
function od(e) {
  let t = e, r;
  for (; r = da(t); )
    t = r;
  return t;
}
function ad(e) {
  const t = W.ownerDocument(e);
  if (!t) return !1;
  const r = od(e);
  return W.contains(t, r);
}
function ha(e) {
  const t = W.ownerDocument(e);
  return t ? W.contains(t, e) || ad(e) : !1;
}
var H = /* @__PURE__ */ ((e) => (e[e.DomContentLoaded = 0] = "DomContentLoaded", e[e.Load = 1] = "Load", e[e.FullSnapshot = 2] = "FullSnapshot", e[e.IncrementalSnapshot = 3] = "IncrementalSnapshot", e[e.Meta = 4] = "Meta", e[e.Custom = 5] = "Custom", e[e.Plugin = 6] = "Plugin", e[e.Asset = 7] = "Asset", e))(H || {}), q = /* @__PURE__ */ ((e) => (e[e.Mutation = 0] = "Mutation", e[e.MouseMove = 1] = "MouseMove", e[e.MouseInteraction = 2] = "MouseInteraction", e[e.Scroll = 3] = "Scroll", e[e.ViewportResize = 4] = "ViewportResize", e[e.Input = 5] = "Input", e[e.TouchMove = 6] = "TouchMove", e[e.MediaInteraction = 7] = "MediaInteraction", e[e.StyleSheetRule = 8] = "StyleSheetRule", e[e.CanvasMutation = 9] = "CanvasMutation", e[e.Font = 10] = "Font", e[e.Log = 11] = "Log", e[e.Drag = 12] = "Drag", e[e.StyleDeclaration = 13] = "StyleDeclaration", e[e.Selection = 14] = "Selection", e[e.AdoptedStyleSheet = 15] = "AdoptedStyleSheet", e[e.CustomElement = 16] = "CustomElement", e))(q || {}), xe = /* @__PURE__ */ ((e) => (e[e.MouseUp = 0] = "MouseUp", e[e.MouseDown = 1] = "MouseDown", e[e.Click = 2] = "Click", e[e.ContextMenu = 3] = "ContextMenu", e[e.DblClick = 4] = "DblClick", e[e.Focus = 5] = "Focus", e[e.Blur = 6] = "Blur", e[e.TouchStart = 7] = "TouchStart", e[e.TouchMove_Departed = 8] = "TouchMove_Departed", e[e.TouchEnd = 9] = "TouchEnd", e[e.TouchCancel = 10] = "TouchCancel", e))(xe || {}), je = /* @__PURE__ */ ((e) => (e[e.Mouse = 0] = "Mouse", e[e.Pen = 1] = "Pen", e[e.Touch = 2] = "Touch", e))(je || {}), St = /* @__PURE__ */ ((e) => (e[e["2D"] = 0] = "2D", e[e.WebGL = 1] = "WebGL", e[e.WebGL2 = 2] = "WebGL2", e))(St || {}), bt = /* @__PURE__ */ ((e) => (e[e.Play = 0] = "Play", e[e.Pause = 1] = "Pause", e[e.Seeked = 2] = "Seeked", e[e.VolumeChange = 3] = "VolumeChange", e[e.RateChange = 4] = "RateChange", e))(bt || {}), pa = /* @__PURE__ */ ((e) => (e[e.Document = 0] = "Document", e[e.DocumentType = 1] = "DocumentType", e[e.Element = 2] = "Element", e[e.Text = 3] = "Text", e[e.CDATA = 4] = "CDATA", e[e.Comment = 5] = "Comment", e))(pa || {});
function Zs(e) {
  return "__ln" in e;
}
class ld {
  constructor() {
    L(this, "length", 0), L(this, "head", null), L(this, "tail", null);
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
    if (t.__ln = r, t.previousSibling && Zs(t.previousSibling)) {
      const i = t.previousSibling.__ln.next;
      r.next = i, r.previous = t.previousSibling.__ln, t.previousSibling.__ln.next = r, i && (i.previous = r);
    } else if (t.nextSibling && Zs(t.nextSibling) && t.nextSibling.__ln.previous) {
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
const Qs = (e, t) => `${e}@${t}`;
class cd {
  constructor() {
    L(this, "frozen", !1), L(this, "locked", !1), L(this, "texts", []), L(this, "attributes", []), L(this, "attributeMap", /* @__PURE__ */ new WeakMap()), L(this, "removes", []), L(this, "mapRemoves", []), L(this, "movedMap", {}), L(this, "addedSet", /* @__PURE__ */ new Set()), L(this, "movedSet", /* @__PURE__ */ new Set()), L(this, "droppedSet", /* @__PURE__ */ new Set()), L(this, "removesSubTreeCache", /* @__PURE__ */ new Set()), L(this, "mutationCb"), L(this, "blockClass"), L(this, "blockSelector"), L(this, "maskTextClass"), L(this, "maskTextSelector"), L(this, "inlineStylesheet"), L(this, "maskInputOptions"), L(this, "maskTextFn"), L(this, "maskInputFn"), L(this, "keepIframeSrcFn"), L(this, "recordCanvas"), L(this, "inlineImages"), L(this, "slimDOMOptions"), L(this, "dataURLOptions"), L(this, "doc"), L(this, "mirror"), L(this, "iframeManager"), L(this, "stylesheetManager"), L(this, "shadowDomManager"), L(this, "canvasManager"), L(this, "processedNodeManager"), L(this, "unattachedDoc"), L(this, "processMutations", (t) => {
      t.forEach(this.processMutation), this.emit();
    }), L(this, "emit", () => {
      if (this.frozen || this.locked)
        return;
      const t = [], r = /* @__PURE__ */ new Set(), i = new ld(), n = (o) => {
        let p = o, a = Pt;
        for (; a === Pt; )
          p = p && p.nextSibling, a = p && this.mirror.getId(p);
        return a;
      }, s = (o) => {
        const p = W.parentNode(o);
        if (!p || !ha(o))
          return;
        let a = !1;
        if (o.nodeType === Node.TEXT_NODE) {
          const m = p.tagName;
          if (m === "TEXTAREA")
            return;
          m === "STYLE" && this.addedSet.has(p) && (a = !0);
        }
        const h = Rt(p) ? this.mirror.getId(da(o)) : this.mirror.getId(p), u = n(o);
        if (h === -1 || u === -1)
          return i.addNode(o);
        const c = wt(o, {
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
            ca(m, this.mirror) && this.iframeManager.addIframe(m), ua(m, this.mirror) && this.stylesheetManager.trackLinkElement(
              m
            ), Gn(o) && this.shadowDomManager.addShadowRoot(W.shadowRoot(o), this.doc);
          },
          onIframeLoad: (m, f) => {
            this.iframeManager.attachIframe(m, f), this.shadowDomManager.observeAttachShadow(m);
          },
          onStylesheetLoad: (m, f) => {
            this.stylesheetManager.attachLinkElement(m, f);
          },
          cssCaptured: a
        });
        c && (t.push({
          parentId: h,
          nextId: u,
          node: c
        }), r.add(c.id));
      };
      for (; this.mapRemoves.length; )
        this.mirror.removeNodeFromMap(this.mapRemoves.shift());
      for (const o of this.movedSet)
        eo(this.removesSubTreeCache, o, this.mirror) && !this.movedSet.has(W.parentNode(o)) || s(o);
      for (const o of this.addedSet)
        !to(this.droppedSet, o) && !eo(this.removesSubTreeCache, o, this.mirror) || to(this.movedSet, o) ? s(o) : this.droppedSet.add(o);
      let l = null;
      for (; i.length; ) {
        let o = null;
        if (l) {
          const p = this.mirror.getId(W.parentNode(l.value)), a = n(l.value);
          p !== -1 && a !== -1 && (o = l);
        }
        if (!o) {
          let p = i.tail;
          for (; p; ) {
            const a = p;
            if (p = p.previous, a) {
              const h = this.mirror.getId(W.parentNode(a.value));
              if (n(a.value) === -1) continue;
              if (h !== -1) {
                o = a;
                break;
              } else {
                const c = a.value, m = W.parentNode(c);
                if (m && m.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                  const f = W.host(m);
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
        l = o.previous, i.removeNode(o.value), s(o.value);
      }
      const d = {
        texts: this.texts.map((o) => {
          const p = o.node, a = W.parentNode(p);
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
    }), L(this, "genTextAreaValueMutation", (t) => {
      let r = this.attributeMap.get(t);
      r || (r = {
        node: t,
        attributes: {},
        styleDiff: {},
        _unchangedStyles: {}
      }, this.attributes.push(r), this.attributeMap.set(t, r));
      const i = Array.from(
        W.childNodes(t),
        (n) => W.textContent(n) || ""
      ).join("");
      r.attributes.value = cr({
        element: t,
        maskInputOptions: this.maskInputOptions,
        tagName: t.tagName,
        type: ur(t),
        value: i,
        maskInputFn: this.maskInputFn
      });
    }), L(this, "processMutation", (t) => {
      if (!Wn(t.target, this.mirror, this.slimDOMOptions))
        switch (t.type) {
          case "characterData": {
            const r = W.textContent(t.target);
            !ve(t.target, this.blockClass, this.blockSelector, !1) && r !== t.oldValue && this.texts.push({
              value: Fo(
                t.target,
                this.maskTextClass,
                this.maskTextSelector,
                !0
                // checkAncestors
              ) && r ? this.maskTextFn ? this.maskTextFn(r, aa(t.target)) : r.replace(/[\S]/g, "*") : r,
              node: t.target
            });
            break;
          }
          case "attributes": {
            const r = t.target;
            let i = t.attributeName, n = t.target.getAttribute(i);
            if (i === "value") {
              const l = ur(r);
              n = cr({
                element: r,
                maskInputOptions: this.maskInputOptions,
                tagName: r.tagName,
                type: l,
                value: n,
                maskInputFn: this.maskInputFn
              });
            }
            if (ve(t.target, this.blockClass, this.blockSelector, !1) || n === t.oldValue)
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
            }, this.attributes.push(s), this.attributeMap.set(t.target, s)), i === "type" && r.tagName === "INPUT" && (t.oldValue || "").toLowerCase() === "password" && r.setAttribute("data-rr-is-password", "true"), !zo(r.tagName, i))
              if (s.attributes[i] = Do(
                this.doc,
                lt(r.tagName),
                lt(i),
                n
              ), i === "style") {
                if (!this.unattachedDoc)
                  try {
                    this.unattachedDoc = document.implementation.createHTMLDocument();
                  } catch {
                    this.unattachedDoc = this.doc;
                  }
                const l = this.unattachedDoc.createElement("span");
                t.oldValue && l.setAttribute("style", t.oldValue);
                for (const d of Array.from(r.style)) {
                  const o = r.style.getPropertyValue(d), p = r.style.getPropertyPriority(d);
                  o !== l.style.getPropertyValue(d) || p !== l.style.getPropertyPriority(d) ? p === "" ? s.styleDiff[d] = o : s.styleDiff[d] = [o, p] : s._unchangedStyles[d] = [o, p];
                }
                for (const d of Array.from(l.style))
                  r.style.getPropertyValue(d) === "" && (s.styleDiff[d] = !1);
              } else i === "open" && r.tagName === "DIALOG" && (r.matches("dialog:modal") ? s.attributes.rr_open_mode = "modal" : s.attributes.rr_open_mode = "non-modal");
            break;
          }
          case "childList": {
            if (ve(t.target, this.blockClass, this.blockSelector, !0))
              return;
            if (t.target.tagName === "TEXTAREA") {
              this.genTextAreaValueMutation(t.target);
              return;
            }
            t.addedNodes.forEach((r) => this.genAdds(r, t.target)), t.removedNodes.forEach((r) => {
              const i = this.mirror.getId(r), n = Rt(t.target) ? this.mirror.getId(W.host(t.target)) : this.mirror.getId(t.target);
              ve(t.target, this.blockClass, this.blockSelector, !1) || Wn(r, this.mirror, this.slimDOMOptions) || !nd(r, this.mirror) || (this.addedSet.has(r) ? (Xn(this.addedSet, r), this.droppedSet.add(r)) : this.addedSet.has(t.target) && i === -1 || la(t.target, this.mirror) || (this.movedSet.has(r) && this.movedMap[Qs(i, n)] ? Xn(this.movedSet, r) : (this.removes.push({
                parentId: n,
                id: i,
                isShadow: Rt(t.target) && Ot(t.target) ? !0 : void 0
              }), ud(r, this.removesSubTreeCache))), this.mapRemoves.push(r));
            });
            break;
          }
        }
    }), L(this, "genAdds", (t, r) => {
      if (!this.processedNodeManager.inOtherBuffer(t, this) && !(this.addedSet.has(t) || this.movedSet.has(t))) {
        if (this.mirror.hasNode(t)) {
          if (Wn(t, this.mirror, this.slimDOMOptions))
            return;
          this.movedSet.add(t);
          let i = null;
          r && this.mirror.hasNode(r) && (i = this.mirror.getId(r)), i && i !== -1 && (this.movedMap[Qs(this.mirror.getId(t), i)] = !0);
        } else
          this.addedSet.add(t), this.droppedSet.delete(t);
        ve(t, this.blockClass, this.blockSelector, !1) || (W.childNodes(t).forEach((i) => this.genAdds(i)), Gn(t) && W.childNodes(W.shadowRoot(t)).forEach((i) => {
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
function Xn(e, t) {
  e.delete(t), W.childNodes(t).forEach((r) => Xn(e, r));
}
function ud(e, t) {
  const r = [e];
  for (; r.length; ) {
    const i = r.pop();
    t.has(i) || (t.add(i), W.childNodes(i).forEach((n) => r.push(n)));
  }
}
function eo(e, t, r) {
  return e.size === 0 ? !1 : dd(e, t);
}
function dd(e, t, r) {
  const i = W.parentNode(t);
  return i ? e.has(i) : !1;
}
function to(e, t) {
  return e.size === 0 ? !1 : fa(e, t);
}
function fa(e, t) {
  const r = W.parentNode(t);
  return r ? e.has(r) ? !0 : fa(e, r) : !1;
}
let It;
function hd(e) {
  It = e;
}
function pd() {
  It = void 0;
}
const j = (e) => It ? (...r) => {
  try {
    return e(...r);
  } catch (i) {
    if (It && It(i) === !0)
      return;
    throw i;
  }
} : e, st = [];
function Ft(e) {
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
function ma(e, t) {
  const r = new cd();
  st.push(r), r.init(e);
  const [i, n] = na(), s = new i(
    j(r.processMutations.bind(r))
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
function fd({
  mousemoveCb: e,
  sampling: t,
  doc: r,
  mirror: i
}) {
  if (t.mousemove === !1)
    return () => {
    };
  const n = typeof t.mousemove == "number" ? t.mousemove : 50, s = typeof t.mousemoveCallback == "number" ? t.mousemoveCallback : 500;
  let l = [], d;
  const o = Nt(
    j(
      (h) => {
        const u = Date.now() - d;
        e(
          l.map((c) => (c.timeOffset -= u, c)),
          h
        ), l = [], d = null;
      }
    ),
    s
  ), p = j(
    Nt(
      j((h) => {
        const u = Ft(h), { clientX: c, clientY: m } = Yn(h) ? h.changedTouches[0] : h;
        d || (d = Tt()), l.push({
          x: c,
          y: m,
          id: i.getId(u),
          timeOffset: Tt() - d
        }), o(
          typeof DragEvent < "u" && h instanceof DragEvent ? q.Drag : h instanceof MouseEvent ? q.MouseMove : q.TouchMove
        );
      }),
      n,
      {
        trailing: !1
      }
    )
  ), a = [
    be("mousemove", p, r),
    be("touchmove", p, r),
    be("drag", p, r)
  ];
  return j(() => {
    a.forEach((h) => h());
  });
}
function md({
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
  const l = s.mouseInteraction === !0 || s.mouseInteraction === void 0 ? {} : s.mouseInteraction, d = [];
  let o = null;
  const p = (a) => (h) => {
    const u = Ft(h);
    if (ve(u, i, n, !0))
      return;
    let c = null, m = a;
    if ("pointerType" in h) {
      switch (h.pointerType) {
        case "mouse":
          c = je.Mouse;
          break;
        case "touch":
          c = je.Touch;
          break;
        case "pen":
          c = je.Pen;
          break;
      }
      c === je.Touch ? xe[a] === xe.MouseDown ? m = "TouchStart" : xe[a] === xe.MouseUp && (m = "TouchEnd") : je.Pen;
    } else Yn(h) && (c = je.Touch);
    c !== null ? (o = c, (m.startsWith("Touch") && c === je.Touch || m.startsWith("Mouse") && c === je.Mouse) && (c = null)) : xe[a] === xe.Click && (c = o, o = null);
    const f = Yn(h) ? h.changedTouches[0] : h;
    if (!f)
      return;
    const g = r.getId(u), { clientX: x, clientY: y } = f;
    j(e)({
      type: xe[m],
      id: g,
      x,
      y,
      ...c !== null && { pointerType: c }
    });
  };
  return Object.keys(xe).filter(
    (a) => Number.isNaN(Number(a)) && !a.endsWith("_Departed") && l[a] !== !1
  ).forEach((a) => {
    let h = lt(a);
    const u = p(a);
    if (window.PointerEvent)
      switch (xe[a]) {
        case xe.MouseDown:
        case xe.MouseUp:
          h = h.replace(
            "mouse",
            "pointer"
          );
          break;
        case xe.TouchStart:
        case xe.TouchEnd:
          return;
      }
    d.push(be(h, u, t));
  }), j(() => {
    d.forEach((a) => a());
  });
}
function ga({
  scrollCb: e,
  doc: t,
  mirror: r,
  blockClass: i,
  blockSelector: n,
  sampling: s
}) {
  const l = j(
    Nt(
      j((d) => {
        const o = Ft(d);
        if (!o || ve(o, i, n, !0))
          return;
        const p = r.getId(o);
        if (o === t && t.defaultView) {
          const a = ia(t.defaultView);
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
  return be("scroll", l, t);
}
function gd({ viewportResizeCb: e }, { win: t }) {
  let r = -1, i = -1;
  const n = j(
    Nt(
      j(() => {
        const s = sa(), l = oa();
        (r !== s || i !== l) && (e({
          width: Number(l),
          height: Number(s)
        }), r = s, i = l);
      }),
      200
    )
  );
  return be("resize", n, t);
}
const yd = ["INPUT", "TEXTAREA", "SELECT"], ro = /* @__PURE__ */ new WeakMap();
function bd({
  inputCb: e,
  doc: t,
  mirror: r,
  blockClass: i,
  blockSelector: n,
  ignoreClass: s,
  ignoreSelector: l,
  maskInputOptions: d,
  maskInputFn: o,
  sampling: p,
  userTriggeredOnInput: a
}) {
  function h(y) {
    let w = Ft(y);
    const S = y.isTrusted, v = w && w.tagName;
    if (w && v === "OPTION" && (w = W.parentElement(w)), !w || !v || yd.indexOf(v) < 0 || ve(w, i, n, !0) || w.classList.contains(s) || l && w.matches(l))
      return;
    let b = w.value, k = !1;
    const E = ur(w) || "";
    E === "radio" || E === "checkbox" ? k = w.checked : (d[v.toLowerCase()] || d[E]) && (b = cr({
      element: w,
      maskInputOptions: d,
      tagName: v,
      type: E,
      value: b,
      maskInputFn: o
    })), u(
      w,
      a ? { text: b, isChecked: k, userTriggered: S } : { text: b, isChecked: k }
    );
    const I = w.name;
    E === "radio" && I && k && t.querySelectorAll(`input[type="radio"][name="${I}"]`).forEach((M) => {
      if (M !== w) {
        const $ = M.value;
        u(
          M,
          a ? { text: $, isChecked: !k, userTriggered: !1 } : { text: $, isChecked: !k }
        );
      }
    });
  }
  function u(y, w) {
    const S = ro.get(y);
    if (!S || S.text !== w.text || S.isChecked !== w.isChecked) {
      ro.set(y, w);
      const v = r.getId(y);
      j(e)({
        ...w,
        id: v
      });
    }
  }
  const m = (p.input === "last" ? ["change"] : ["input", "change"]).map(
    (y) => be(y, j(h), t)
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
      (y) => Ar(
        y[0],
        y[1],
        {
          set() {
            j(h)({
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
  ), j(() => {
    m.forEach((y) => y());
  });
}
function pr(e) {
  const t = [];
  function r(i, n) {
    if (Zt("CSSGroupingRule") && i.parentRule instanceof CSSGroupingRule || Zt("CSSMediaRule") && i.parentRule instanceof CSSMediaRule || Zt("CSSSupportsRule") && i.parentRule instanceof CSSSupportsRule || Zt("CSSConditionRule") && i.parentRule instanceof CSSConditionRule) {
      const l = Array.from(
        i.parentRule.cssRules
      ).indexOf(i);
      return n.unshift(l), r(i.parentRule, n);
    } else if (i.parentStyleSheet) {
      const l = Array.from(i.parentStyleSheet.cssRules).indexOf(i);
      n.unshift(l);
    }
    return n;
  }
  return r(e, t);
}
function Ke(e, t, r) {
  let i, n;
  return e ? (e.ownerNode ? i = t.getId(e.ownerNode) : n = r.getId(e), {
    styleId: n,
    id: i
  }) : {};
}
function vd({ styleSheetRuleCb: e, mirror: t, stylesheetManager: r }, { win: i }) {
  if (!i.CSSStyleSheet || !i.CSSStyleSheet.prototype)
    return () => {
    };
  const n = i.CSSStyleSheet.prototype.insertRule;
  i.CSSStyleSheet.prototype.insertRule = new Proxy(n, {
    apply: j(
      (a, h, u) => {
        const [c, m] = u, { id: f, styleId: g } = Ke(
          h,
          t,
          r.styleMirror
        );
        return (f && f !== -1 || g && g !== -1) && e({
          id: f,
          styleId: g,
          adds: [{ rule: c, index: m }]
        }), a.apply(h, u);
      }
    )
  }), i.CSSStyleSheet.prototype.addRule = function(a, h, u = this.cssRules.length) {
    const c = `${a} { ${h} }`;
    return i.CSSStyleSheet.prototype.insertRule.apply(this, [c, u]);
  };
  const s = i.CSSStyleSheet.prototype.deleteRule;
  i.CSSStyleSheet.prototype.deleteRule = new Proxy(s, {
    apply: j(
      (a, h, u) => {
        const [c] = u, { id: m, styleId: f } = Ke(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          removes: [{ index: c }]
        }), a.apply(h, u);
      }
    )
  }), i.CSSStyleSheet.prototype.removeRule = function(a) {
    return i.CSSStyleSheet.prototype.deleteRule.apply(this, [a]);
  };
  let l;
  i.CSSStyleSheet.prototype.replace && (l = i.CSSStyleSheet.prototype.replace, i.CSSStyleSheet.prototype.replace = new Proxy(l, {
    apply: j(
      (a, h, u) => {
        const [c] = u, { id: m, styleId: f } = Ke(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replace: c
        }), a.apply(h, u);
      }
    )
  }));
  let d;
  i.CSSStyleSheet.prototype.replaceSync && (d = i.CSSStyleSheet.prototype.replaceSync, i.CSSStyleSheet.prototype.replaceSync = new Proxy(d, {
    apply: j(
      (a, h, u) => {
        const [c] = u, { id: m, styleId: f } = Ke(
          h,
          t,
          r.styleMirror
        );
        return (m && m !== -1 || f && f !== -1) && e({
          id: m,
          styleId: f,
          replaceSync: c
        }), a.apply(h, u);
      }
    )
  }));
  const o = {};
  Qt("CSSGroupingRule") ? o.CSSGroupingRule = i.CSSGroupingRule : (Qt("CSSMediaRule") && (o.CSSMediaRule = i.CSSMediaRule), Qt("CSSConditionRule") && (o.CSSConditionRule = i.CSSConditionRule), Qt("CSSSupportsRule") && (o.CSSSupportsRule = i.CSSSupportsRule));
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
        apply: j(
          (u, c, m) => {
            const [f, g] = m, { id: x, styleId: y } = Ke(
              c.parentStyleSheet,
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
                    ...pr(c),
                    g || 0
                    // defaults to 0
                  ]
                }
              ]
            }), u.apply(c, m);
          }
        )
      }
    ), h.prototype.deleteRule = new Proxy(
      p[a].deleteRule,
      {
        apply: j(
          (u, c, m) => {
            const [f] = m, { id: g, styleId: x } = Ke(
              c.parentStyleSheet,
              t,
              r.styleMirror
            );
            return (g && g !== -1 || x && x !== -1) && e({
              id: g,
              styleId: x,
              removes: [
                { index: [...pr(c), f] }
              ]
            }), u.apply(c, m);
          }
        )
      }
    );
  }), j(() => {
    i.CSSStyleSheet.prototype.insertRule = n, i.CSSStyleSheet.prototype.deleteRule = s, l && (i.CSSStyleSheet.prototype.replace = l), d && (i.CSSStyleSheet.prototype.replaceSync = d), Object.entries(o).forEach(([a, h]) => {
      h.prototype.insertRule = p[a].insertRule, h.prototype.deleteRule = p[a].deleteRule;
    });
  });
}
function ya({
  mirror: e,
  stylesheetManager: t
}, r) {
  var i, n, s;
  let l = null;
  r.nodeName === "#document" ? l = e.getId(r) : l = e.getId(W.host(r));
  const d = r.nodeName === "#document" ? (i = r.defaultView) == null ? void 0 : i.Document : (s = (n = r.ownerDocument) == null ? void 0 : n.defaultView) == null ? void 0 : s.ShadowRoot, o = d != null && d.prototype ? Object.getOwnPropertyDescriptor(
    d == null ? void 0 : d.prototype,
    "adoptedStyleSheets"
  ) : void 0;
  return l === null || l === -1 || !d || !o ? () => {
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
      if (l !== null && l !== -1)
        try {
          t.adoptStyleSheets(p, l);
        } catch {
        }
      return h;
    }
  }), j(() => {
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
function wd({
  styleDeclarationCb: e,
  mirror: t,
  ignoreCSSAttributes: r,
  stylesheetManager: i
}, { win: n }) {
  const s = n.CSSStyleDeclaration.prototype.setProperty;
  n.CSSStyleDeclaration.prototype.setProperty = new Proxy(s, {
    apply: j(
      (d, o, p) => {
        var a;
        const [h, u, c] = p;
        if (r.has(h))
          return s.apply(o, [h, u, c]);
        const { id: m, styleId: f } = Ke(
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
            priority: c
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: pr(o.parentRule)
        }), d.apply(o, p);
      }
    )
  });
  const l = n.CSSStyleDeclaration.prototype.removeProperty;
  return n.CSSStyleDeclaration.prototype.removeProperty = new Proxy(l, {
    apply: j(
      (d, o, p) => {
        var a;
        const [h] = p;
        if (r.has(h))
          return l.apply(o, [h]);
        const { id: u, styleId: c } = Ke(
          (a = o.parentRule) == null ? void 0 : a.parentStyleSheet,
          t,
          i.styleMirror
        );
        return (u && u !== -1 || c && c !== -1) && e({
          id: u,
          styleId: c,
          remove: {
            property: h
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          index: pr(o.parentRule)
        }), d.apply(o, p);
      }
    )
  }), j(() => {
    n.CSSStyleDeclaration.prototype.setProperty = s, n.CSSStyleDeclaration.prototype.removeProperty = l;
  });
}
function xd({
  mediaInteractionCb: e,
  blockClass: t,
  blockSelector: r,
  mirror: i,
  sampling: n,
  doc: s
}) {
  const l = j(
    (o) => Nt(
      j((p) => {
        const a = Ft(p);
        if (!a || ve(a, t, r, !0))
          return;
        const { currentTime: h, volume: u, muted: c, playbackRate: m, loop: f } = a;
        e({
          type: o,
          id: i.getId(a),
          currentTime: h,
          volume: u,
          muted: c,
          playbackRate: m,
          loop: f
        });
      }),
      n.media || 500
    )
  ), d = [
    be("play", l(bt.Play), s),
    be("pause", l(bt.Pause), s),
    be("seeked", l(bt.Seeked), s),
    be("volumechange", l(bt.VolumeChange), s),
    be("ratechange", l(bt.RateChange), s)
  ];
  return j(() => {
    d.forEach((o) => o());
  });
}
function kd({ fontCb: e, doc: t }) {
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
  const l = dt(
    t.fonts,
    "add",
    function(d) {
      return function(o) {
        return setTimeout(
          j(() => {
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
  }), i.push(l), j(() => {
    i.forEach((d) => d());
  });
}
function Sd(e) {
  const { doc: t, mirror: r, blockClass: i, blockSelector: n, selectionCb: s } = e;
  let l = !0;
  const d = j(() => {
    const o = t.getSelection();
    if (!o || l && (o != null && o.isCollapsed)) return;
    l = o.isCollapsed || !1;
    const p = [], a = o.rangeCount || 0;
    for (let h = 0; h < a; h++) {
      const u = o.getRangeAt(h), { startContainer: c, startOffset: m, endContainer: f, endOffset: g } = u;
      ve(c, i, n, !0) || ve(f, i, n, !0) || p.push({
        start: r.getId(c),
        startOffset: m,
        end: r.getId(f),
        endOffset: g
      });
    }
    s({ ranges: p });
  });
  return d(), be("selectionchange", d);
}
function Cd({
  doc: e,
  customElementCb: t
}) {
  const r = e.defaultView;
  return !r || !r.customElements ? () => {
  } : dt(
    r.customElements,
    "define",
    function(n) {
      return function(s, l, d) {
        try {
          t({
            define: {
              name: s
            }
          });
        } catch {
          console.warn(`Custom element callback failed for ${s}`);
        }
        return n.apply(this, [s, l, d]);
      };
    }
  );
}
function Ed(e, t) {
  const {
    mutationCb: r,
    mousemoveCb: i,
    mouseInteractionCb: n,
    scrollCb: s,
    viewportResizeCb: l,
    inputCb: d,
    mediaInteractionCb: o,
    styleSheetRuleCb: p,
    styleDeclarationCb: a,
    canvasMutationCb: h,
    fontCb: u,
    selectionCb: c,
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
    t.viewportResize && t.viewportResize(...f), l(...f);
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
    t.selection && t.selection(...f), c(...f);
  }, e.customElementCb = (...f) => {
    t.customElement && t.customElement(...f), m(...f);
  };
}
function Md(e, t = {}) {
  const r = e.doc.defaultView;
  if (!r)
    return () => {
    };
  Ed(e, t);
  let i, n = () => {
  };
  e.recordDOM && ([i, n] = ma(e, e.doc));
  const s = fd(e), l = md(e), d = ga(e), o = gd(e, {
    win: r
  }), p = bd(e), a = xd(e);
  let h = () => {
  }, u = () => {
  }, c = () => {
  }, m = () => {
  };
  e.recordDOM && (h = vd(e, { win: r }), u = ya(e, e.doc), c = wd(e, {
    win: r
  }), e.collectFonts && (m = kd(e)));
  const f = Sd(e), g = Cd(e), x = [];
  for (const y of e.plugins)
    x.push(
      y.observer(y.callback, r, y.options)
    );
  return j(() => {
    st.forEach((y) => y.reset()), i == null || i.disconnect(), n(), s(), l(), d(), o(), p(), a(), h(), u(), c(), m(), f(), g(), x.forEach((y) => y());
  });
}
function Zt(e) {
  return typeof window[e] < "u";
}
function Qt(e) {
  return !!(typeof window[e] < "u" && // Note: Generally, this check _shouldn't_ be necessary
  // However, in some scenarios (e.g. jsdom) this can sometimes fail, so we check for it here
  window[e].prototype && "insertRule" in window[e].prototype && "deleteRule" in window[e].prototype);
}
class no {
  constructor(t) {
    L(this, "iframeIdToRemoteIdMap", /* @__PURE__ */ new WeakMap()), L(this, "iframeRemoteIdToIdMap", /* @__PURE__ */ new WeakMap()), this.generateIdFn = t;
  }
  getId(t, r, i, n) {
    const s = i || this.getIdToRemoteIdMap(t), l = n || this.getRemoteIdToIdMap(t);
    let d = s.get(r);
    return d || (d = this.generateIdFn(), s.set(r, d), l.set(d, r)), d;
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
class Rd {
  constructor(t) {
    L(this, "iframes", /* @__PURE__ */ new WeakMap()), L(this, "crossOriginIframeMap", /* @__PURE__ */ new WeakMap()), L(this, "crossOriginIframeMirror", new no($o)), L(this, "crossOriginIframeStyleMirror"), L(this, "crossOriginIframeRootIdMap", /* @__PURE__ */ new WeakMap()), L(this, "mirror"), L(this, "mutationCb"), L(this, "wrappedEmit"), L(this, "loadListener"), L(this, "stylesheetManager"), L(this, "recordCrossOriginIframes"), this.mutationCb = t.mutationCb, this.wrappedEmit = t.wrappedEmit, this.stylesheetManager = t.stylesheetManager, this.recordCrossOriginIframes = t.recordCrossOriginIframes, this.crossOriginIframeStyleMirror = new no(
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
      case H.FullSnapshot: {
        this.crossOriginIframeMirror.reset(t), this.crossOriginIframeStyleMirror.reset(t), this.replaceIdOnNode(r.data.node, t);
        const n = r.data.node.id;
        return this.crossOriginIframeRootIdMap.set(t, n), this.patchRootIdOnNode(r.data.node, n), {
          timestamp: r.timestamp,
          type: H.IncrementalSnapshot,
          data: {
            source: q.Mutation,
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
      case H.Meta:
      case H.Load:
      case H.DomContentLoaded:
        return !1;
      case H.Plugin:
        return r;
      case H.Custom:
        return this.replaceIds(
          r.data.payload,
          t,
          ["id", "parentId", "previousId", "nextId"]
        ), r;
      case H.IncrementalSnapshot:
        switch (r.data.source) {
          case q.Mutation:
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
          case q.Drag:
          case q.TouchMove:
          case q.MouseMove:
            return r.data.positions.forEach((n) => {
              this.replaceIds(n, t, ["id"]);
            }), r;
          case q.ViewportResize:
            return !1;
          case q.MediaInteraction:
          case q.MouseInteraction:
          case q.Scroll:
          case q.CanvasMutation:
          case q.Input:
            return this.replaceIds(r.data, t, ["id"]), r;
          case q.StyleSheetRule:
          case q.StyleDeclaration:
            return this.replaceIds(r.data, t, ["id"]), this.replaceStyleIds(r.data, t, ["styleId"]), r;
          case q.Font:
            return r;
          case q.Selection:
            return r.data.ranges.forEach((n) => {
              this.replaceIds(n, t, ["start", "end"]);
            }), r;
          case q.AdoptedStyleSheet:
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
    t.type !== pa.Document && !t.rootId && (t.rootId = r), "childNodes" in t && t.childNodes.forEach((i) => {
      this.patchRootIdOnNode(i, r);
    });
  }
}
class Od {
  constructor(t) {
    L(this, "shadowDoms", /* @__PURE__ */ new WeakSet()), L(this, "mutationCb"), L(this, "scrollCb"), L(this, "bypassOptions"), L(this, "mirror"), L(this, "restoreHandlers", []), this.mutationCb = t.mutationCb, this.scrollCb = t.scrollCb, this.bypassOptions = t.bypassOptions, this.mirror = t.mirror, this.init();
  }
  init() {
    this.reset(), this.patchAttachShadow(Element, document);
  }
  addShadowRoot(t, r) {
    if (!Ot(t) || this.shadowDoms.has(t)) return;
    this.shadowDoms.add(t);
    const [i] = ma(
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
      ga({
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
        this.mirror.getId(W.host(t))
      ), this.restoreHandlers.push(
        ya(
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
      dt(
        t.prototype,
        "attachShadow",
        function(n) {
          return function(s) {
            const l = n.call(this, s), d = W.shadowRoot(this);
            return d && ha(this) && i.addShadowRoot(d, r), l;
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
var xt = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", Id = typeof Uint8Array > "u" ? [] : new Uint8Array(256);
for (var er = 0; er < xt.length; er++)
  Id[xt.charCodeAt(er)] = er;
var Ad = function(e) {
  var t = new Uint8Array(e), r, i = t.length, n = "";
  for (r = 0; r < i; r += 3)
    n += xt[t[r] >> 2], n += xt[(t[r] & 3) << 4 | t[r + 1] >> 4], n += xt[(t[r + 1] & 15) << 2 | t[r + 2] >> 6], n += xt[t[r + 2] & 63];
  return i % 3 === 2 ? n = n.substring(0, n.length - 1) + "=" : i % 3 === 1 && (n = n.substring(0, n.length - 2) + "=="), n;
};
const io = /* @__PURE__ */ new Map();
function Ld(e, t) {
  let r = io.get(e);
  return r || (r = /* @__PURE__ */ new Map(), io.set(e, r)), r.has(t) || r.set(t, []), r.get(t);
}
const ba = (e, t, r) => {
  if (!e || !(wa(e, t) || typeof e == "object"))
    return;
  const i = e.constructor.name, n = Ld(r, i);
  let s = n.indexOf(e);
  return s === -1 && (s = n.length, n.push(e)), s;
};
function tr(e, t, r) {
  if (e instanceof Array)
    return e.map((i) => tr(i, t, r));
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
    const i = e.constructor.name, n = Ad(e);
    return {
      rr_type: i,
      base64: n
    };
  } else {
    if (e instanceof DataView)
      return {
        rr_type: e.constructor.name,
        args: [
          tr(e.buffer, t, r),
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
          args: [tr(e.data, t, r), e.width, e.height]
        };
      if (wa(e, t) || typeof e == "object") {
        const i = e.constructor.name, n = ba(e, t, r);
        return {
          rr_type: i,
          index: n
        };
      }
    }
  }
  return e;
}
const va = (e, t, r) => e.map((i) => tr(i, t, r)), wa = (e, t) => !![
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
function Pd(e, t, r, i) {
  const n = [], s = Object.getOwnPropertyNames(
    t.CanvasRenderingContext2D.prototype
  );
  for (const l of s)
    try {
      if (typeof t.CanvasRenderingContext2D.prototype[l] != "function")
        continue;
      const d = dt(
        t.CanvasRenderingContext2D.prototype,
        l,
        function(o) {
          return function(...p) {
            return ve(this.canvas, r, i, !0) || setTimeout(() => {
              const a = va(p, t, this);
              e(this.canvas, {
                type: St["2D"],
                property: l,
                args: a
              });
            }, 0), o.apply(this, p);
          };
        }
      );
      n.push(d);
    } catch {
      const d = Ar(
        t.CanvasRenderingContext2D.prototype,
        l,
        {
          set(o) {
            e(this.canvas, {
              type: St["2D"],
              property: l,
              args: [o],
              setter: !0
            });
          }
        }
      );
      n.push(d);
    }
  return () => {
    n.forEach((l) => l());
  };
}
function Td(e) {
  return e === "experimental-webgl" ? "webgl" : e;
}
function so(e, t, r, i) {
  const n = [];
  try {
    const s = dt(
      e.HTMLCanvasElement.prototype,
      "getContext",
      function(l) {
        return function(d, ...o) {
          if (!ve(this, t, r, !0)) {
            const p = Td(d);
            if ("__context" in this || (this.__context = p), i && ["webgl", "webgl2"].includes(p))
              if (o[0] && typeof o[0] == "object") {
                const a = o[0];
                a.preserveDrawingBuffer || (a.preserveDrawingBuffer = !0);
              } else
                o.splice(0, 1, {
                  preserveDrawingBuffer: !0
                });
          }
          return l.apply(this, [d, ...o]);
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
function oo(e, t, r, i, n, s) {
  const l = [], d = Object.getOwnPropertyNames(e);
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
        const p = dt(
          e,
          o,
          function(a) {
            return function(...h) {
              const u = a.apply(this, h);
              if (ba(u, s, this), "tagName" in this.canvas && !ve(this.canvas, i, n, !0)) {
                const c = va(h, s, this), m = {
                  type: t,
                  property: o,
                  args: c
                };
                r(this.canvas, m);
              }
              return u;
            };
          }
        );
        l.push(p);
      } catch {
        const p = Ar(e, o, {
          set(a) {
            r(this.canvas, {
              type: t,
              property: o,
              args: [a],
              setter: !0
            });
          }
        });
        l.push(p);
      }
  return l;
}
function Nd(e, t, r, i) {
  const n = [];
  return typeof t.WebGLRenderingContext < "u" && n.push(
    ...oo(
      t.WebGLRenderingContext.prototype,
      St.WebGL,
      e,
      r,
      i,
      t
    )
  ), typeof t.WebGL2RenderingContext < "u" && n.push(
    ...oo(
      t.WebGL2RenderingContext.prototype,
      St.WebGL2,
      e,
      r,
      i,
      t
    )
  ), () => {
    n.forEach((s) => s());
  };
}
const xa = `(function() {
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
`, ao = typeof self < "u" && self.Blob && new Blob([xa], { type: "text/javascript;charset=utf-8" });
function _d(e) {
  let t;
  try {
    if (t = ao && (self.URL || self.webkitURL).createObjectURL(ao), !t) throw "";
    const r = new Worker(t, {
      name: e == null ? void 0 : e.name
    });
    return r.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(t);
    }), r;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent(xa),
      {
        name: e == null ? void 0 : e.name
      }
    );
  } finally {
    t && (self.URL || self.webkitURL).revokeObjectURL(t);
  }
}
class $d {
  constructor(t) {
    L(this, "pendingCanvasMutations", /* @__PURE__ */ new Map()), L(this, "rafStamps", { latestId: 0, invokeId: null }), L(this, "mirror"), L(this, "mutationCb"), L(this, "resetObservers"), L(this, "frozen", !1), L(this, "locked", !1), L(this, "processMutation", (o, p) => {
      (this.rafStamps.invokeId && this.rafStamps.latestId !== this.rafStamps.invokeId || !this.rafStamps.invokeId) && (this.rafStamps.invokeId = this.rafStamps.latestId), this.pendingCanvasMutations.has(o) || this.pendingCanvasMutations.set(o, []), this.pendingCanvasMutations.get(o).push(p);
    });
    const {
      sampling: r = "all",
      win: i,
      blockClass: n,
      blockSelector: s,
      recordCanvas: l,
      dataURLOptions: d
    } = t;
    this.mutationCb = t.mutationCb, this.mirror = t.mirror, l && r === "all" && this.initCanvasMutationObserver(i, n, s), l && typeof r == "number" && this.initCanvasFPSObserver(r, i, n, s, {
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
    const l = so(
      r,
      i,
      n,
      !0
    ), d = /* @__PURE__ */ new Map(), o = new _d();
    o.onmessage = (m) => {
      const { id: f } = m.data;
      if (d.set(f, !1), !("base64" in m.data)) return;
      const { base64: g, type: x, width: y, height: w } = m.data;
      this.mutationCb({
        id: f,
        type: St["2D"],
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
    let a = 0, h;
    const u = () => {
      const m = [];
      return r.document.querySelectorAll("canvas").forEach((f) => {
        ve(f, i, n, !0) || m.push(f);
      }), m;
    }, c = (m) => {
      if (a && m - a < p) {
        h = requestAnimationFrame(c);
        return;
      }
      a = m, u().forEach(async (f) => {
        var g;
        const x = this.mirror.getId(f);
        if (d.get(x) || f.width === 0 || f.height === 0) return;
        if (d.set(x, !0), ["webgl", "webgl2"].includes(f.__context)) {
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
      }), h = requestAnimationFrame(c);
    };
    h = requestAnimationFrame(c), this.resetObservers = () => {
      l(), cancelAnimationFrame(h);
    };
  }
  initCanvasMutationObserver(t, r, i) {
    this.startRAFTimestamping(), this.startPendingCanvasMutationFlusher();
    const n = so(
      t,
      r,
      i,
      !1
    ), s = Pd(
      this.processMutation.bind(this),
      t,
      r,
      i
    ), l = Nd(
      this.processMutation.bind(this),
      t,
      r,
      i
    );
    this.resetObservers = () => {
      n(), s(), l();
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
    const n = i.map((l) => {
      const { type: d, ...o } = l;
      return o;
    }), { type: s } = i[0];
    this.mutationCb({ id: r, type: s, commands: n }), this.pendingCanvasMutations.delete(t);
  }
}
class Dd {
  constructor(t) {
    L(this, "trackedLinkElements", /* @__PURE__ */ new WeakSet()), L(this, "mutationCb"), L(this, "adoptedStyleSheetCb"), L(this, "styleMirror", new sd()), this.mutationCb = t.mutationCb, this.adoptedStyleSheetCb = t.adoptedStyleSheetCb;
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
      let l;
      this.styleMirror.has(s) ? l = this.styleMirror.getId(s) : (l = this.styleMirror.add(s), n.push({
        styleId: l,
        rules: Array.from(s.rules || CSSRule, (d, o) => ({
          rule: To(d, s.href),
          index: o
        }))
      })), i.styleIds.push(l);
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
class zd {
  constructor() {
    L(this, "nodeMap", /* @__PURE__ */ new WeakMap()), L(this, "active", !1);
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
let re, rr, qn, fr = !1;
try {
  if (Array.from([1], (e) => e * 2)[0] !== 2) {
    const e = document.createElement("iframe");
    document.body.appendChild(e), Array.from = ((zi = e.contentWindow) == null ? void 0 : zi.Array.from) || Array.from, document.body.removeChild(e);
  }
} catch (e) {
  console.debug("Unable to override Array.from", e);
}
const Le = Hc();
function et(e = {}) {
  const {
    emit: t,
    checkoutEveryNms: r,
    checkoutEveryNth: i,
    blockClass: n = "rr-block",
    blockSelector: s = null,
    ignoreClass: l = "rr-ignore",
    ignoreSelector: d = null,
    maskTextClass: o = "rr-mask",
    maskTextSelector: p = null,
    inlineStylesheet: a = !0,
    maskAllInputs: h,
    maskInputOptions: u,
    slimDOMOptions: c,
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
    userTriggeredOnInput: I = !1,
    collectFonts: M = !1,
    inlineImages: $ = !1,
    plugins: N,
    keepIframeSrcFn: C = () => !1,
    ignoreCSSAttributes: he = /* @__PURE__ */ new Set([]),
    errorHandler: ne
  } = e;
  hd(ne);
  const B = k ? window.parent === window : !0;
  let V = !1;
  if (!B)
    try {
      window.parent.document && (V = !1);
    } catch {
      V = !0;
    }
  if (B && !t)
    throw new Error("emit function is required");
  if (!B && !V)
    return () => {
    };
  S !== void 0 && y.mousemove === void 0 && (y.mousemove = S), Le.reset();
  const Z = h === !0 ? {
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
  } : u !== void 0 ? u : { password: !0 }, se = Uo(c);
  id();
  let X, F = 0;
  const Ce = (R) => {
    for (const T of N || [])
      T.eventProcessor && (R = T.eventProcessor(R));
    return x && // Disable packing events which will be emitted to parent frames.
    !V && (R = x(R)), R;
  };
  re = (R, T) => {
    var P;
    const A = R;
    if (A.timestamp = Tt(), (P = st[0]) != null && P.isFrozen() && A.type !== H.FullSnapshot && !(A.type === H.IncrementalSnapshot && A.data.source === q.Mutation) && st.forEach((D) => D.unfreeze()), B)
      t == null || t(Ce(A), T);
    else if (V) {
      const D = {
        type: "rrweb",
        event: Ce(A),
        origin: window.location.origin,
        isCheckout: T
      };
      window.parent.postMessage(D, "*");
    }
    if (A.type === H.FullSnapshot)
      X = A, F = 0;
    else if (A.type === H.IncrementalSnapshot) {
      if (A.data.source === q.Mutation && A.data.isAttachIframe)
        return;
      F++;
      const D = i && F >= i, _ = r && A.timestamp - X.timestamp > r;
      (D || _) && rr(!0);
    }
  };
  const O = (R) => {
    re({
      type: H.IncrementalSnapshot,
      data: {
        source: q.Mutation,
        ...R
      }
    });
  }, le = (R) => re({
    type: H.IncrementalSnapshot,
    data: {
      source: q.Scroll,
      ...R
    }
  }), pe = (R) => re({
    type: H.IncrementalSnapshot,
    data: {
      source: q.CanvasMutation,
      ...R
    }
  }), Xe = (R) => re({
    type: H.IncrementalSnapshot,
    data: {
      source: q.AdoptedStyleSheet,
      ...R
    }
  }), oe = new Dd({
    mutationCb: O,
    adoptedStyleSheetCb: Xe
  }), we = new Rd({
    mirror: Le,
    mutationCb: O,
    stylesheetManager: oe,
    recordCrossOriginIframes: k,
    wrappedEmit: re
  });
  for (const R of N || [])
    R.getMirror && R.getMirror({
      nodeMirror: Le,
      crossOriginIframeMirror: we.crossOriginIframeMirror,
      crossOriginIframeStyleMirror: we.crossOriginIframeStyleMirror
    });
  const We = new zd();
  qn = new $d({
    recordCanvas: b,
    mutationCb: pe,
    win: window,
    blockClass: n,
    blockSelector: s,
    mirror: Le,
    sampling: y.canvas,
    dataURLOptions: w
  });
  const Ae = new Od({
    mutationCb: O,
    scrollCb: le,
    bypassOptions: {
      blockClass: n,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskInputOptions: Z,
      dataURLOptions: w,
      maskTextFn: f,
      maskInputFn: m,
      recordCanvas: b,
      inlineImages: $,
      sampling: y,
      slimDOMOptions: se,
      iframeManager: we,
      stylesheetManager: oe,
      canvasManager: qn,
      keepIframeSrcFn: C,
      processedNodeManager: We
    },
    mirror: Le
  });
  rr = (R = !1) => {
    if (!v)
      return;
    re(
      {
        type: H.Meta,
        data: {
          href: window.location.href,
          width: oa(),
          height: sa()
        }
      },
      R
    ), oe.reset(), Ae.init(), st.forEach((P) => P.lock());
    const T = mu(document, {
      mirror: Le,
      blockClass: n,
      blockSelector: s,
      maskTextClass: o,
      maskTextSelector: p,
      inlineStylesheet: a,
      maskAllInputs: Z,
      maskTextFn: f,
      maskInputFn: m,
      slimDOM: se,
      dataURLOptions: w,
      recordCanvas: b,
      inlineImages: $,
      onSerialize: (P) => {
        ca(P, Le) && we.addIframe(P), ua(P, Le) && oe.trackLinkElement(P), Gn(P) && Ae.addShadowRoot(W.shadowRoot(P), document);
      },
      onIframeLoad: (P, A) => {
        we.attachIframe(P, A), Ae.observeAttachShadow(P);
      },
      onStylesheetLoad: (P, A) => {
        oe.attachLinkElement(P, A);
      },
      keepIframeSrcFn: C
    });
    if (!T)
      return console.warn("Failed to snapshot the document");
    re(
      {
        type: H.FullSnapshot,
        data: {
          node: T,
          initialOffset: ia(window)
        }
      },
      R
    ), st.forEach((P) => P.unlock()), document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0 && oe.adoptStyleSheets(
      document.adoptedStyleSheets,
      Le.getId(document)
    );
  };
  try {
    const R = [], T = (A) => {
      var D;
      return j(Md)(
        {
          mutationCb: O,
          mousemoveCb: (_, z) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: z,
              positions: _
            }
          }),
          mouseInteractionCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.MouseInteraction,
              ..._
            }
          }),
          scrollCb: le,
          viewportResizeCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.ViewportResize,
              ..._
            }
          }),
          inputCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.Input,
              ..._
            }
          }),
          mediaInteractionCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.MediaInteraction,
              ..._
            }
          }),
          styleSheetRuleCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.StyleSheetRule,
              ..._
            }
          }),
          styleDeclarationCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.StyleDeclaration,
              ..._
            }
          }),
          canvasMutationCb: pe,
          fontCb: (_) => re({
            type: H.IncrementalSnapshot,
            data: {
              source: q.Font,
              ..._
            }
          }),
          selectionCb: (_) => {
            re({
              type: H.IncrementalSnapshot,
              data: {
                source: q.Selection,
                ..._
              }
            });
          },
          customElementCb: (_) => {
            re({
              type: H.IncrementalSnapshot,
              data: {
                source: q.CustomElement,
                ..._
              }
            });
          },
          blockClass: n,
          ignoreClass: l,
          ignoreSelector: d,
          maskTextClass: o,
          maskTextSelector: p,
          maskInputOptions: Z,
          inlineStylesheet: a,
          sampling: y,
          recordDOM: v,
          recordCanvas: b,
          inlineImages: $,
          userTriggeredOnInput: I,
          collectFonts: M,
          doc: A,
          maskInputFn: m,
          maskTextFn: f,
          keepIframeSrcFn: C,
          blockSelector: s,
          slimDOMOptions: se,
          dataURLOptions: w,
          mirror: Le,
          iframeManager: we,
          stylesheetManager: oe,
          shadowDomManager: Ae,
          processedNodeManager: We,
          canvasManager: qn,
          ignoreCSSAttributes: he,
          plugins: ((D = N == null ? void 0 : N.filter((_) => _.observer)) == null ? void 0 : D.map((_) => ({
            observer: _.observer,
            options: _.options,
            callback: (z) => re({
              type: H.Plugin,
              data: {
                plugin: _.name,
                payload: z
              }
            })
          }))) || []
        },
        g
      );
    };
    we.addLoadListener((A) => {
      try {
        R.push(T(A.contentDocument));
      } catch (D) {
        console.warn(D);
      }
    });
    const P = () => {
      rr(), R.push(T(document)), fr = !0;
    };
    return ["interactive", "complete"].includes(document.readyState) ? P() : (R.push(
      be("DOMContentLoaded", () => {
        re({
          type: H.DomContentLoaded,
          data: {}
        }), E === "DOMContentLoaded" && P();
      })
    ), R.push(
      be(
        "load",
        () => {
          re({
            type: H.Load,
            data: {}
          }), E === "load" && P();
        },
        window
      )
    )), () => {
      R.forEach((A) => {
        try {
          A();
        } catch (D) {
          String(D).toLowerCase().includes("cross-origin") || console.warn(D);
        }
      }), We.destroy(), fr = !1, pd();
    };
  } catch (R) {
    console.warn(R);
  }
}
et.addCustomEvent = (e, t) => {
  if (!fr)
    throw new Error("please add custom event after start recording");
  re({
    type: H.Custom,
    data: {
      tag: e,
      payload: t
    }
  });
};
et.freezePage = () => {
  st.forEach((e) => e.freeze());
};
et.takeFullSnapshot = (e) => {
  if (!fr)
    throw new Error("please take full snapshot after start recording");
  rr(e);
};
et.mirror = Le;
var lo;
(function(e) {
  e[e.NotStarted = 0] = "NotStarted", e[e.Running = 1] = "Running", e[e.Stopped = 2] = "Stopped";
})(lo || (lo = {}));
const { addCustomEvent: Rh } = et, { freezePage: Oh } = et, { takeFullSnapshot: Ih } = et, jn = 2, Fd = 4;
class Ud {
  constructor(t) {
    Wt(this, "events", []);
    Wt(this, "lastMeta", null);
    Wt(this, "lastFull", null);
    this.opts = t;
  }
  push(t) {
    t.type === Fd && (this.lastMeta = t), t.type === jn && (this.lastFull = t, this.events = []), this.events.push(t), this.prune();
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
    return !this.events.some((i) => i.type === jn) && this.lastFull && (this.lastMeta && t.push(this.lastMeta), t.push(this.lastFull)), [...t, ...this.events];
  }
  /** True when the buffer can produce a scrubbable replay (a full snapshot + at least one more event). */
  isPlayable() {
    const t = this.snapshot();
    return t.some((i) => i.type === jn) && t.length >= 2;
  }
  clear() {
    this.events = [], this.lastMeta = null, this.lastFull = null;
  }
}
function Bd(e, t = {}) {
  const r = new Ud({
    windowMs: t.windowMs ?? 45e3,
    maxEvents: t.maxEvents ?? 2e3
  }), i = t.maskAllInputs !== !1, n = t.maskText !== !1;
  let s;
  try {
    s = e({
      emit(l) {
        try {
          r.push(l);
        } catch {
        }
      },
      maskAllInputs: i,
      // Mask every text node by default. rrweb calls maskTextFn(text) per node; '*' keeps layout.
      maskTextFn: n ? (l) => "*".repeat(l.length) : void 0,
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
const ka = "klav-sims-live", Sa = "klav-sims-overlay", co = "klav-sims-ext-css";
let ke = null, _e = null, fe = null, ge = null, ot = null;
const Re = /* @__PURE__ */ new Map(), mr = /* @__PURE__ */ new Set(), Ie = /* @__PURE__ */ new Map(), Ve = /* @__PURE__ */ new Map();
let Ca = 0, de = null, nr = 0, at = null;
const gr = /* @__PURE__ */ new Set();
let $e = null, He = null, me = null, Pe = null, Te = null, Ne = null, Fe = 0, ye = !1, Ze = 0, ir = !1, At = null;
const Wd = 3400;
function Ea(e) {
  try {
    document.dispatchEvent(new CustomEvent("klavity:sims-live", { detail: { active: e } }));
  } catch {
  }
}
const qd = `
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
  .ksl-slot.ksl-has-annotation { cursor: pointer; }
  .ksl-slot.ksl-focus .ksim-head {
    box-shadow: 0 0 0 3px rgba(139,92,246,.28), 0 0 26px rgba(139,92,246,.36);
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

  .ksl-more-counter {
    min-width: 42px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(139,92,246,.38);
    background: rgba(22,17,12,.92);
    color: #c4b5fd;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    font: 700 11px/1 ui-monospace,'JetBrains Mono',monospace;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 10px 28px rgba(0,0,0,.34), 0 0 0 4px rgba(139,92,246,.12);
    transition: transform .15s ease, background .15s ease, border-color .15s ease;
  }
  .ksl-more-counter:hover {
    transform: translateY(-1px) scale(1.04);
    background: rgba(139,92,246,.2);
    border-color: rgba(139,92,246,.62);
  }
  .ksl-more-counter:active { transform: scale(.97); }
  .ksl-more-counter:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }

  .ksl-tour-controls {
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(139,92,246,.32);
    background: rgba(22,17,12,.92);
    display: none;
    align-items: center;
    gap: 2px;
    padding: 2px;
    pointer-events: auto;
    box-shadow: 0 10px 28px rgba(0,0,0,.34), 0 0 0 4px rgba(139,92,246,.1);
  }
  .ksl-tour-btn {
    width: 26px;
    height: 24px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    color: #c4b5fd;
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    transition: transform .15s ease, background .15s ease, color .15s ease;
  }
  .ksl-tour-btn:hover {
    transform: translateY(-1px) scale(1.06);
    background: rgba(139,92,246,.2);
    color: #fff;
  }
  .ksl-tour-btn:active { transform: scale(.97); }
  .ksl-tour-btn:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }
  .ksl-tour-btn:disabled { opacity:.38; cursor:not-allowed; transform:none; background:transparent; }
  .ksl-tour-btn.is-playing {
    background: rgba(139,92,246,.28);
    color: #fff;
  }

  @media (max-width:480px) {
    .ksl-dock { max-width:calc(100vw - 24px); gap:7px; }
    .ksl-bubble { width:min(180px,calc(100vw - 40px)); font-size:12px; }
  }
  @media (prefers-reduced-motion:reduce) {
    .ksl-slot,.ksl-bubble,.ksl-bubble.is-out { animation:none !important; opacity:1; transform:none; }
    .ksl-idle { animation:none !important; opacity:.6; }
    .ksl-ring circle { animation:none !important; }
  }
`, jd = `
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
    transition: opacity .18s ease, transform .18s ease;
  }
  @keyframes klav-halo-in {
    from { transform: scale(.84); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  @keyframes klav-halo-pulse {
    0%,100% { opacity: .75; }
    50%     { opacity: 1; }
  }

  /* ── Collapsed marker — small anchored pin before an observation is focused ── */
  @keyframes klav-marker-in {
    from { transform: scale(.68); opacity: 0; }
    60%  { transform: scale(1.08); opacity: 1; }
    to   { transform: scale(1); opacity: 1; }
  }
  .klav-pin-marker {
    position: fixed;
    z-index: 2147483642;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 2px solid rgba(255,255,255,.86);
    box-shadow: 0 8px 26px rgba(0,0,0,.34), 0 0 0 5px var(--klav-marker-glow, rgba(139,92,246,.16));
    color: #fff;
    font: 700 9px/1 ui-monospace, 'JetBrains Mono', monospace;
    letter-spacing: -.02em;
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    animation: klav-marker-in .28s cubic-bezier(.34,1.36,.64,1) both;
    transition: transform .16s ease, opacity .16s ease, filter .16s ease, box-shadow .16s ease;
  }
  .klav-pin-marker:hover,
  .klav-pin-marker:focus-visible {
    transform: translateY(-2px) scale(1.08);
    box-shadow: 0 12px 32px rgba(0,0,0,.42), 0 0 0 7px var(--klav-marker-glow, rgba(139,92,246,.22));
    outline: none;
  }
  .klav-pin-marker.is-active {
    transform: translateY(-3px) scale(1.13);
    opacity: 1;
    filter: saturate(1.18);
  }
  .klav-pin-marker.is-dim {
    opacity: .42;
    filter: grayscale(.35) saturate(.8);
    transform: scale(.92);
  }
  .klav-pin-marker::after {
    content:'';
    position:absolute;
    left:50%;
    bottom:-7px;
    transform:translateX(-50%);
    width:0;
    height:0;
    border:6px solid transparent;
    border-top-color: var(--klav-marker-accent, currentColor);
    opacity:.95;
  }

  /* ── Expanded pinned bubble — only one is visible at a time ── */
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
    transition: opacity .16s ease, transform .16s ease;
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
    .klav-pin-marker { animation:none !important; transition:none !important; }
    .klav-pin,.klav-pin.is-out { animation:none !important; opacity:1; transform:none; }
  }
`;
function Jn(e, t) {
  const r = e.replace("#", ""), i = (d) => parseInt(d, 16), [n, s, l] = r.length === 3 ? [i(r[0] + r[0]), i(r[1] + r[1]), i(r[2] + r[2])] : [i(r.slice(0, 2)), i(r.slice(2, 4)), i(r.slice(4, 6))];
  return `rgba(${n},${s},${l},${t})`;
}
function Hd(e) {
  if (e.suggestedBug) return !0;
  const t = String(e.severity ?? "").trim().toLowerCase();
  if (t && t !== "none") return !0;
  const r = String(e.sentiment ?? "").trim().toLowerCase();
  return r ? !(/* @__PURE__ */ new Set(["positive", "satisfied", "delighted", "neutral", "none"])).has(r) : !1;
}
function yr() {
  var e, t;
  try {
    return ((t = (e = window.matchMedia) == null ? void 0 : e.call(window, "(prefers-reduced-motion: reduce)")) == null ? void 0 : t.matches) ?? !1;
  } catch {
    return !1;
  }
}
function Ma(e) {
  return new Promise((t) => setTimeout(t, e));
}
function Vd(e) {
  if (!e) return !1;
  if (e === ge || e === ke || e.id === Sa || e.id === ka || e.id === "klavity-widget-host") return !0;
  const t = e.classList;
  return !!t && (t.contains("klav-halo") || t.contains("klav-pin") || t.contains("klav-pin-marker") || t.contains("klav-walker") || t.contains("ksl-bubble") || t.contains("ksl-slot"));
}
function Yd(e) {
  const t = [];
  for (const r of [ge, ke])
    r && (t.push({ el: r, vis: r.style.visibility }), r.style.visibility = "hidden");
  try {
    return e();
  } finally {
    for (const { el: r, vis: i } of t) r.style.visibility = i;
  }
}
function Ra(e) {
  const t = e.targetViewport;
  return {
    scrollX: Number.isFinite(t == null ? void 0 : t.scrollX) ? Number(t.scrollX) : window.scrollX,
    scrollY: Number.isFinite(t == null ? void 0 : t.scrollY) ? Number(t.scrollY) : window.scrollY,
    width: Math.max(1, Number.isFinite(t == null ? void 0 : t.width) ? Number(t.width) : window.innerWidth),
    height: Math.max(1, Number.isFinite(t == null ? void 0 : t.height) ? Number(t.height) : window.innerHeight)
  };
}
function Oa(e, t) {
  return new DOMRect(
    t.scrollX + e.x * t.width,
    t.scrollY + e.y * t.height,
    Math.max(1, e.w * t.width),
    Math.max(1, e.h * t.height)
  );
}
function uo(e) {
  return Math.max(0, e.width) * Math.max(0, e.height);
}
function Gd(e, t) {
  const r = Math.max(e.left, t.left), i = Math.min(e.right, t.right), n = Math.max(e.top, t.top), s = Math.min(e.bottom, t.bottom);
  return Math.max(0, i - r) * Math.max(0, s - n);
}
function Xd(e) {
  return new DOMRect(e.left + window.scrollX, e.top + window.scrollY, e.width, e.height);
}
function Ia(e) {
  if (!e || !(e instanceof HTMLElement) || e === document.body || e === document.documentElement || Vd(e)) return !1;
  const t = e.getBoundingClientRect();
  if (t.width < 8 || t.height < 8) return !1;
  try {
    const r = getComputedStyle(e);
    if (r.display === "none" || r.visibility === "hidden" || Number(r.opacity) === 0) return !1;
  } catch {
  }
  return !0;
}
function Jd(e, t) {
  return Yd(() => {
    const r = /* @__PURE__ */ new Set(), i = [], n = (l) => {
      let d = l;
      for (; d && d !== document.body && d !== document.documentElement; )
        !r.has(d) && Ia(d) && (r.add(d), i.push(d)), d = d.parentElement;
    }, s = typeof document.elementsFromPoint == "function" ? document.elementsFromPoint(e, t) : [document.elementFromPoint(e, t)].filter(Boolean);
    for (const l of s) n(l);
    return i;
  });
}
function Kd(e, t) {
  const r = Ra(t), i = Oa(e, r), n = Math.max(2, Math.min(window.innerWidth - 2, i.left + i.width / 2 - window.scrollX)), s = Math.max(2, Math.min(window.innerHeight - 2, i.top + i.height / 2 - window.scrollY)), l = Jd(n, s);
  if (!l.length) return null;
  const d = Math.max(1, uo(i));
  let o = null, p = -1 / 0;
  for (const a of l) {
    const h = Xd(a.getBoundingClientRect()), u = Gd(h, i);
    if (u <= 0) continue;
    const c = Math.max(1, uo(h)), m = u / d, f = Math.max(0, (c - u) / c), g = a.tagName.toLowerCase(), x = /^(button|a|input|textarea|select|label|section|article|nav|header|footer|main|form)$/.test(g) ? 0.18 : 0, y = c > window.innerWidth * window.innerHeight * 0.92 ? 0.8 : 0, w = m - f * 0.35 + x - y;
    w > p && (o = a, p = w);
  }
  return o ?? l[0] ?? null;
}
async function vi(e, t) {
  if (e >= window.scrollX + 80 && e <= window.scrollX + window.innerWidth - 80 && t >= window.scrollY + 80 && t <= window.scrollY + window.innerHeight - 80) return;
  const n = Math.max(0, document.documentElement.scrollHeight - window.innerHeight), s = Math.max(0, document.documentElement.scrollWidth - window.innerWidth), l = Math.max(0, Math.min(n, t - window.innerHeight * 0.38)), d = Math.max(0, Math.min(s, e - window.innerWidth * 0.45));
  try {
    window.scrollTo({ top: l, left: d, behavior: yr() ? "auto" : "smooth" });
  } catch {
    window.scrollTo(d, l);
  }
  await Ma(yr() ? 80 : 520);
}
const Zd = /* @__PURE__ */ new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "being",
  "button",
  "clear",
  "could",
  "easy",
  "element",
  "feels",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "page",
  "section",
  "that",
  "the",
  "their",
  "there",
  "this",
  "with",
  "would",
  "where",
  "while",
  "your"
]);
function Qd(e) {
  const t = /* @__PURE__ */ new Set();
  return String(e || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((r) => r.length < 4 || Zd.has(r) || t.has(r) ? !1 : (t.add(r), !0));
}
function eh(e) {
  const t = Qd(e.text);
  if (!t.length) return null;
  const r = [
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "label",
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "li",
    "nav",
    "header",
    "footer",
    "main",
    "section",
    "article",
    "form",
    "[role]",
    "[aria-label]",
    "[data-testid]",
    "div"
  ].join(",");
  let i = null, n = 0;
  const s = Array.from(document.querySelectorAll(r)).slice(0, 700);
  for (const l of s) {
    if (!Ia(l)) continue;
    const d = l.getBoundingClientRect();
    if (!(d.bottom > 0 && d.right > 0 && d.top < window.innerHeight && d.left < window.innerWidth)) continue;
    const p = [
      l.textContent || "",
      l.getAttribute("aria-label") || "",
      l.getAttribute("title") || "",
      l.getAttribute("placeholder") || "",
      l.getAttribute("data-testid") || "",
      l.id || "",
      typeof l.className == "string" ? l.className : ""
    ].join(" ").toLowerCase();
    if (!p.trim()) continue;
    const a = t.reduce((g, x) => g + (p.includes(x) ? 1 : 0), 0);
    if (!a) continue;
    const h = l.tagName.toLowerCase(), u = /^(button|a|input|textarea|select|label|h1|h2|h3|section|article|nav|header|footer|main|form)$/.test(h) ? 0.6 : 0, m = Math.max(1, d.width * d.height) > window.innerWidth * window.innerHeight * 0.85 ? 1.1 : 0, f = a / t.length + u - m;
    f > n && (i = l, n = f);
  }
  return i;
}
async function th(e, t = {}) {
  if (e.region) {
    const r = Ra(e), i = Oa(e.region, r);
    t.scroll !== !1 && await vi(i.left + i.width / 2, i.top + i.height / 2);
    const n = Kd(e.region, e);
    if (n) return n;
  }
  return eh(e);
}
function rh() {
  if (ke && _e) return _e;
  ke = document.createElement("div"), ke.id = ka, ke.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;", _e = ke.attachShadow({ mode: "open" }), fc(_e);
  const e = document.createElement("style");
  return e.textContent = qd, _e.appendChild(e), document.body.appendChild(ke), _e;
}
function wi() {
  if (ge) return ge;
  if (!document.getElementById(co)) {
    const e = document.createElement("style");
    e.id = co, e.textContent = jd, document.head.appendChild(e);
  }
  return ge = document.createElement("div"), ge.id = Sa, ge.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483640;pointer-events:none;overflow:visible;", document.body.appendChild(ge), ge;
}
function nh(e, t = [], r = {}) {
  if (typeof document > "u") return;
  sr();
  const i = rh();
  wi(), ot = new AbortController(), document.addEventListener("keydown", (d) => {
    d.key === "Escape" && (ye ? Kn() : Ct());
  }, { signal: ot.signal }), document.addEventListener("pointerdown", (d) => {
    !de || ch(d) || Ct();
  }, { capture: !0, signal: ot.signal });
  const n = document.createElement("div");
  n.className = "ksl-sr", n.id = "ksl-announcer", n.setAttribute("aria-live", "polite"), n.setAttribute("aria-atomic", "true"), i.appendChild(n), fe = document.createElement("div"), fe.className = "ksl-dock", fe.setAttribute("role", "region"), fe.setAttribute("aria-label", "Sims — live feedback"), i.appendChild(fe);
  const s = document.createElement("button");
  s.className = "ksl-close-all", s.setAttribute("aria-label", "Stop all Sim reviews"), s.title = "Stop Sim reviews", s.innerHTML = K("x", { size: 12 }), s.addEventListener("click", sr), fe.appendChild(s), $e = document.createElement("button"), $e.type = "button", $e.className = "ksl-more-counter", $e.setAttribute("aria-label", "Show more Sim observations"), $e.addEventListener("click", () => {
    ah();
  }), fe.appendChild($e), He = document.createElement("div"), He.className = "ksl-tour-controls", He.setAttribute("role", "group"), He.setAttribute("aria-label", "Walk me through Sim observations"), Pe = document.createElement("button"), Pe.type = "button", Pe.className = "ksl-tour-btn", Pe.title = "Previous observation", Pe.setAttribute("aria-label", "Previous Sim observation"), Pe.innerHTML = K("chevron-left", { size: 15 }), Pe.addEventListener("click", () => {
    ho(-1);
  }), me = document.createElement("button"), me.type = "button", me.className = "ksl-tour-btn", me.title = "Walk me through", me.setAttribute("aria-label", "Play Sim walkthrough"), me.innerHTML = K("play", { size: 14 }), me.addEventListener("click", () => sh()), Te = document.createElement("button"), Te.type = "button", Te.className = "ksl-tour-btn", Te.title = "Next observation", Te.setAttribute("aria-label", "Next Sim observation"), Te.innerHTML = K("chevron-right", { size: 15 }), Te.addEventListener("click", () => {
    ho(1);
  }), Ne = document.createElement("button"), Ne.type = "button", Ne.className = "ksl-tour-btn", Ne.title = "Stop walkthrough", Ne.setAttribute("aria-label", "Stop Sim walkthrough"), Ne.innerHTML = K("x", { size: 13 }), Ne.addEventListener("click", () => Kn()), He.append(Pe, me, Te, Ne), fe.appendChild(He);
  const l = e === "all" ? t : t.filter((d) => e.includes(d.id));
  if (!l.length) {
    console.warn("[KlavitySims] deploy(): no matching Sims — dock not mounted."), sr();
    return;
  }
  Ea(!0), l.slice(0, 8).forEach((d, o) => {
    const p = d.accent || "#6366f1", a = d.initials || d.name.slice(0, 2).toUpperCase(), h = document.createElement("div");
    h.className = "ksl-slot", h.dataset.simId = d.id, h.setAttribute("aria-label", d.name), h.setAttribute("role", "button"), h.setAttribute("tabindex", "0"), h.style.setProperty("--ksl-idx", String(o)), h.style.setProperty("--ksl-accent", p), h.addEventListener("click", () => fo(d.id)), h.addEventListener("keydown", (y) => {
      y.key !== "Enter" && y.key !== " " || (y.preventDefault(), fo(d.id));
    });
    const u = window.innerWidth <= 480 ? 38 : 46;
    h.appendChild(Oo({ name: d.name, initials: a, photoUrl: d.photoUrl, color: p, animate: !0, legs: !0, size: u }));
    const c = "http://www.w3.org/2000/svg", m = document.createElementNS(c, "svg");
    m.setAttribute("class", "ksl-ring"), m.setAttribute("width", "62"), m.setAttribute("height", "62"), m.setAttribute("viewBox", "0 0 62 62"), m.setAttribute("aria-hidden", "true");
    const f = document.createElementNS(c, "circle");
    f.setAttribute("cx", "31"), f.setAttribute("cy", "31"), f.setAttribute("r", "29"), m.appendChild(f), h.appendChild(m);
    const g = document.createElement("span");
    g.className = "ksl-time-hint", g.textContent = "~5s", g.setAttribute("aria-hidden", "true"), h.appendChild(g);
    const x = document.createElement("span");
    x.className = "ksl-idle", x.textContent = "watching", x.setAttribute("aria-hidden", "true"), h.appendChild(x), fe.appendChild(h), Re.set(d.id, { simId: d.id, avatarEl: h, accent: p, initials: a, name: d.name, clearBubble: null, annotationIds: /* @__PURE__ */ new Set() });
  });
}
function ih(e) {
  Re.forEach(({ avatarEl: t }) => t.classList.toggle("ksl-thinking", e));
}
function Aa(e, t, r) {
  const i = ge, n = ke.getBoundingClientRect(), s = n.left + n.width / 2 - 21, l = n.top + n.height / 2 - 48, d = document.createElement("div");
  return d.className = "klav-walker", d.style.left = s + "px", d.style.top = l + "px", d.appendChild(
    Oo({ name: e.name, initials: e.initials, color: e.accent, animate: !1, legs: !0, size: 42 })
  ), i.appendChild(d), mr.add(d), new Promise((o) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.style.left = t + "px", d.style.top = r + "px";
      const p = () => {
        d.remove(), mr.delete(d), o();
      };
      d.addEventListener("transitionend", p, { once: !0 }), setTimeout(p, 1400);
    }));
  });
}
function xi() {
  Ie.forEach((e) => {
    const t = e.id === de, r = !!de && !t;
    e.marker.classList.toggle("is-active", t), e.marker.classList.toggle("is-dim", r), e.slot.avatarEl.classList.toggle("ksl-focus", t);
  }), ki();
}
function ki() {
  if (!$e) return;
  const e = de ? 1 : 0, t = Math.max(0, Ie.size - e) + Ve.size;
  $e.style.display = t > 0 ? "inline-flex" : "none", $e.textContent = `+${t} more`, $e.setAttribute("aria-label", `${t} more Sim observation${t === 1 ? "" : "s"}`), Ut();
}
function _t() {
  return [
    ...Array.from(Ie.keys()).map((e) => ({ kind: "annotation", id: e })),
    ...Array.from(Ve.keys()).map((e) => ({ kind: "pending", id: e }))
  ];
}
function Ut() {
  if (!He || !me || !Pe || !Te || !Ne) return;
  const e = Ie.size + Ve.size;
  He.style.display = e > 0 ? "inline-flex" : "none", Pe.disabled = e < 2, Te.disabled = e < 2, Ne.disabled = !ye && !de, me.disabled = e === 0, me.classList.toggle("is-playing", ye), me.innerHTML = K(ye ? "pause" : "play", { size: ye ? 13 : 14 }), me.title = ye ? "Pause walkthrough" : "Walk me through", me.setAttribute("aria-label", ye ? "Pause Sim walkthrough" : "Play Sim walkthrough");
}
function La() {
  At && (clearTimeout(At), At = null);
}
function Lr() {
  ye = !1, Ze += 1, La(), Ut();
}
function Kn() {
  Lr(), Ct();
}
function sh() {
  if (ye) {
    Lr();
    return;
  }
  const e = _t().length;
  e && (ye = !0, Ze += 1, Fe = Math.max(0, Math.min(Fe, e - 1)), Ut(), Ta(Ze));
}
function oh(e) {
  return new Promise((t) => {
    La(), At = setTimeout(() => {
      At = null, t(ye && Ze === e);
    }, Wd);
  });
}
async function Pa(e) {
  const t = _t();
  if (!t.length) return !1;
  const r = (e % t.length + t.length) % t.length;
  Fe = r;
  const i = t[r];
  let n = null;
  if (i.kind === "annotation" ? n = i.id : n = await Lt(i.id), !n) return !1;
  await Et(n);
  const s = Array.from(Ie.keys()).indexOf(n);
  return s >= 0 && (Fe = s), Ut(), !0;
}
async function Ta(e) {
  if (!(!ye || Ze !== e || ir)) {
    ir = !0;
    try {
      for (; ye && Ze === e; ) {
        if (!_t().length) {
          Kn();
          return;
        }
        if (!await Pa(Fe) || !ye || Ze !== e || !await oh(e)) return;
        Ct(), Fe = (Fe + 1) % Math.max(1, _t().length), await Ma(220);
      }
    } finally {
      ir = !1, Ut(), ye && Ze === e && Ta(e);
    }
  }
}
async function ho(e) {
  Lr();
  const t = _t().length;
  t && (Fe = ((Fe + e) % t + t) % t, await Pa(Fe));
}
async function ah() {
  const e = Array.from(Ie.keys()), t = de ? Math.max(0, e.indexOf(de) + 1) : 0, i = e.slice(t).concat(e.slice(0, t)).find((d) => d !== de);
  if (i) {
    await Et(i);
    return;
  }
  const n = Ve.values().next().value;
  if (!n) return;
  const s = n.targetEl.getBoundingClientRect();
  await vi(
    s.left + s.width / 2 + window.scrollX,
    s.top + s.height / 2 + window.scrollY
  );
  const l = await Lt(n.id);
  l && await Et(l);
}
function lh(e, t = !1) {
  var n;
  (n = e.chromeCleanup) == null || n.call(e), e.chromeCleanup = null;
  const r = e.halo, i = e.bubble;
  if (e.halo = null, e.bubble = null, t) {
    i == null || i.remove(), r == null || r.remove();
    return;
  }
  i && i.classList.add("is-out"), r && (r.style.animation = "klav-pin-out .18s ease-in forwards", r.style.opacity = "0"), setTimeout(() => {
    i == null || i.remove(), r == null || r.remove();
  }, 220);
}
function Ct(e = !1) {
  if (!de) return;
  const t = Ie.get(de);
  de = null, t && lh(t, e), Re.forEach(({ avatarEl: r }) => r.classList.remove("ksl-focus")), xi();
}
function ch(e) {
  return (typeof e.composedPath == "function" ? e.composedPath() : []).some((r) => {
    var i, n, s, l, d, o, p, a, h;
    return r instanceof Element ? r === ge || r === ke ? !0 : ((i = r.classList) == null ? void 0 : i.contains("klav-pin-marker")) || ((n = r.classList) == null ? void 0 : n.contains("klav-pin")) || ((s = r.classList) == null ? void 0 : s.contains("klav-pin-triage")) || ((l = r.classList) == null ? void 0 : l.contains("klav-pin-dismiss")) || ((d = r.classList) == null ? void 0 : d.contains("ksl-more-counter")) || ((o = r.classList) == null ? void 0 : o.contains("ksl-tour-controls")) || ((p = r.classList) == null ? void 0 : p.contains("ksl-tour-btn")) || ((a = r.classList) == null ? void 0 : a.contains("ksl-slot")) || ((h = r.classList) == null ? void 0 : h.contains("ksim")) : !1;
  });
}
function $t(e) {
  const t = e.getBoundingClientRect();
  return t.width > 0 && t.height > 0 && t.bottom > 0 && t.right > 0 && t.top < window.innerHeight && t.left < window.innerWidth ? t : null;
}
function po(e, t) {
  const r = $t(t);
  if (e.style.display = r ? "" : "none", !r) return;
  const i = Math.max(8, Math.min(window.innerWidth - 36, r.left + Math.min(r.width - 8, 14))), n = Math.max(8, Math.min(window.innerHeight - 36, r.top - 12));
  e.style.left = `${i}px`, e.style.top = `${n}px`;
}
function uh(e) {
  const t = wi(), { slot: r, obs: i, targetEl: n } = e, s = document.createElement("div");
  s.className = "klav-halo", s.style.borderColor = r.accent, s.style.boxShadow = `0 0 0 4px ${Jn(r.accent, 0.16)},0 0 24px ${Jn(r.accent, 0.2)}`, t.appendChild(s);
  const l = document.createElement("div");
  l.className = "klav-pin", l.style.borderLeftColor = r.accent, l.setAttribute("role", "status"), l.setAttribute("aria-label", `Focused feedback from ${r.name}`);
  const d = document.createElement("div");
  d.className = "klav-pin-hd";
  const o = document.createElement("div");
  o.className = "klav-pin-av", o.style.background = r.accent, o.textContent = r.initials;
  const p = document.createElement("span");
  if (p.className = "klav-pin-name", p.style.color = r.accent, p.textContent = r.name, d.appendChild(o), d.appendChild(p), i.severity && i.severity !== "none") {
    const x = i.severity === "medium" ? " sev-m" : i.severity === "low" ? " sev-l" : "", y = document.createElement("span");
    y.className = `klav-pin-sev${x}`, y.setAttribute("aria-label", `Severity: ${i.severity}`), y.textContent = i.severity, d.appendChild(y);
  }
  const a = document.createElement("div");
  a.className = "klav-pin-obs", a.textContent = i.text || "";
  const h = document.createElement("div");
  h.className = "klav-pin-actions";
  const u = document.createElement("button");
  u.className = "klav-pin-triage", u.innerHTML = K("bug") + " Track as Bug", u.setAttribute("aria-label", `Track observation from ${r.name} as a bug`), u.addEventListener("click", () => {
    var x;
    (x = or.onTriage) == null || x.call(or, i, r.name);
  });
  const c = document.createElement("button");
  c.className = "klav-pin-dismiss", c.textContent = "Collapse", c.setAttribute("aria-label", `Collapse pinned feedback from ${r.name}`), c.addEventListener("click", () => Ct()), h.appendChild(u), h.appendChild(c), l.appendChild(d), l.appendChild(a), l.appendChild(h), t.appendChild(l);
  const m = new AbortController(), f = () => {
    const x = $t(n), y = !!x;
    if (s.style.display = y ? "" : "none", l.style.display = y ? "" : "none", !x) return;
    s.style.left = `${x.left - 5}px`, s.style.top = `${x.top - 5}px`, s.style.width = `${x.width + 10}px`, s.style.height = `${x.height + 10}px`;
    const w = 224, S = Math.max(112, l.offsetHeight || 150);
    let v = x.left, b = x.top - S - 14;
    v = Math.max(10, Math.min(window.innerWidth - w - 10, v)), b < 10 && (b = x.bottom + 14), l.style.left = `${v}px`, l.style.top = `${b}px`;
  }, g = () => requestAnimationFrame(f);
  f(), window.addEventListener("scroll", g, { passive: !0, signal: m.signal }), window.addEventListener("resize", g, { signal: m.signal }), e.halo = s, e.bubble = l, e.chromeCleanup = () => m.abort();
}
async function Et(e) {
  const t = Ie.get(e);
  if (!t || de === e) return;
  Ct(!0), de = e, xi();
  const r = t.targetEl.getBoundingClientRect();
  if (await vi(
    r.left + r.width / 2 + window.scrollX,
    r.top + r.height / 2 + window.scrollY
  ), de !== e) return;
  const i = t.targetEl.getBoundingClientRect(), n = Math.max(8, Math.min(window.innerWidth - 60, i.left + i.width * 0.1 - 21)), s = Math.min(window.innerHeight - 80, i.bottom - 58);
  yr() || await Aa(t.slot, n, s), de === e && uh(t);
}
function fo(e) {
  const t = Re.get(e);
  if (!t) return;
  const r = Array.from(t.annotationIds).find((i) => Ie.has(i));
  r && Et(r);
}
function dh(e, t, r) {
  const i = wi(), n = `ann_${e.simId}_${++Ca}`, s = document.createElement("button");
  s.type = "button", s.className = "klav-pin-marker", s.style.background = e.accent, s.style.color = "#fff", s.style.setProperty("--klav-marker-glow", Jn(e.accent, 0.2)), s.style.setProperty("--klav-marker-accent", e.accent), s.textContent = e.initials, s.setAttribute("aria-label", `Show feedback from ${e.name}`), s.addEventListener("click", (p) => {
    p.stopPropagation(), Et(n);
  }), s.addEventListener("pointerenter", () => {
    Et(n);
  }), i.appendChild(s);
  const l = new AbortController(), d = () => requestAnimationFrame(() => po(s, r));
  po(s, r), window.addEventListener("scroll", d, { passive: !0, signal: l.signal }), window.addEventListener("resize", d, { signal: l.signal });
  const o = {
    id: n,
    slot: e,
    obs: t,
    targetEl: r,
    marker: s,
    halo: null,
    bubble: null,
    markerCleanup: () => l.abort(),
    chromeCleanup: null
  };
  return Ie.set(n, o), e.annotationIds.add(n), e.avatarEl.classList.add("ksl-has-annotation"), xi(), n;
}
async function Lt(e) {
  var i;
  const t = Ve.get(e);
  if (!t || t.revealed || (t.revealed = !0, (i = t.cleanup) == null || i.call(t), t.cleanup = null, Ve.delete(e), ki(), !Re.has(t.slot.simId))) return null;
  const r = $t(t.targetEl);
  if (r && !yr()) {
    const n = Math.max(8, Math.min(window.innerWidth - 60, r.left + r.width * 0.1 - 21)), s = Math.min(window.innerHeight - 80, r.bottom - 58);
    await Aa(t.slot, n, s);
  }
  return Re.has(t.slot.simId) ? dh(t.slot, t.obs, t.targetEl) : null;
}
function hh(e, t, r) {
  const i = `pending_${e.simId}_${++Ca}`, n = { id: i, slot: e, obs: t, targetEl: r, cleanup: null, revealed: !1 };
  if (Ve.set(i, n), e.avatarEl.classList.add("ksl-has-annotation"), ki(), $t(r)) {
    Lt(i);
    return;
  }
  if (typeof IntersectionObserver < "u") {
    const d = new IntersectionObserver((o) => {
      o.some((p) => p.isIntersecting || p.intersectionRatio > 0) && Lt(i);
    }, { threshold: 0.1 });
    d.observe(r), n.cleanup = () => d.disconnect();
    return;
  }
  const s = new AbortController(), l = () => {
    $t(r) && Lt(i);
  };
  window.addEventListener("scroll", l, { passive: !0, signal: s.signal }), window.addEventListener("resize", l, { signal: s.signal }), n.cleanup = () => s.abort();
}
function ph(e, t) {
  const r = nr * 120;
  nr += 1, at && clearTimeout(at), at = setTimeout(() => {
    nr = 0, at = null;
  }, r + 900);
  const i = setTimeout(() => {
    gr.delete(i), th(t, { scroll: !1 }).then((n) => {
      Re.has(e.simId) && (n ? hh(e, t, n) : fh(e, [t]));
    });
  }, r);
  gr.add(i);
}
function fh(e, t) {
  var c;
  if (!fe || !_e) return;
  (c = e.clearBubble) == null || c.call(e);
  const r = t[0], i = t.length - 1, n = _e.getElementById("ksl-announcer");
  n && (n.textContent = "", requestAnimationFrame(() => {
    if (!_e) return;
    const m = _e.getElementById("ksl-announcer");
    m && (m.textContent = `${e.name}: ${r.text || ""}${i > 0 ? ` and ${i} more` : ""}`);
  }));
  const s = document.createElement("div");
  s.className = "ksl-bubble", s.setAttribute("role", "status"), s.setAttribute("aria-label", `Feedback from ${e.name}`), s.style.borderLeftColor = e.accent;
  const l = document.createElement("button");
  l.className = "ksl-b-close", l.setAttribute("aria-label", `Dismiss feedback from ${e.name}`), l.innerHTML = K("x", { size: 13 });
  const d = document.createElement("div");
  if (d.className = "ksl-b-tag", d.style.color = e.accent, d.textContent = e.name, r.severity && r.severity !== "none") {
    const m = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", f = document.createElement("span");
    f.className = `ksl-b-sev${m}`.replace("sev-m", "sev-m").replace("sev-l", "sev-l"), f.textContent = r.severity, d.appendChild(f);
  }
  const o = document.createElement("div");
  if (o.className = "ksl-b-obs", o.textContent = r.text || "", s.appendChild(l), s.appendChild(d), s.appendChild(o), i > 0) {
    const m = document.createElement("div");
    m.className = "ksl-b-more", m.textContent = `+${i} more observation${i > 1 ? "s" : ""}`, s.appendChild(m);
  }
  e.avatarEl.appendChild(s), e.avatarEl.classList.add("ksl-has-bubble");
  let p = !1;
  const a = () => {
    var m;
    p || (p = !0, clearTimeout(h), s.classList.add("is-out"), setTimeout(() => {
      var f;
      s.remove(), ((f = Re.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : f.clearBubble) === u && e.avatarEl.classList.remove("ksl-has-bubble");
    }, 265), ((m = Re.get(e.avatarEl.dataset.simId ?? "")) == null ? void 0 : m.clearBubble) === u && (Re.get(e.avatarEl.dataset.simId ?? "").clearBubble = null));
  }, h = setTimeout(a, 14e3), u = () => {
    clearTimeout(h), a();
  };
  l.addEventListener("click", u), e.clearBubble = u;
}
function mh(e, t, r) {
  if (!fe) return;
  const i = Re.get(e);
  if (!i) {
    console.warn(`[KlavitySims] renderFeedback: simId "${e}" not in dock`);
    return;
  }
  if (!r.length) return;
  const n = [];
  for (const s of r)
    Hd(s) && n.push(s);
  n.forEach((s) => ph(i, s));
}
function sr() {
  Lr(), Fe = 0, ir = !1, He = null, me = null, Pe = null, Te = null, Ne = null, Re.forEach((e) => {
    var t;
    (t = e.clearBubble) == null || t.call(e), e.clearBubble = null;
  }), de = null, Re.clear(), ot == null || ot.abort(), ot = null, at && clearTimeout(at), at = null, gr.forEach((e) => clearTimeout(e)), gr.clear(), nr = 0, Ve.forEach((e) => {
    var t;
    return (t = e.cleanup) == null ? void 0 : t.call(e);
  }), Ve.clear(), $e = null, mr.forEach((e) => e.remove()), mr.clear(), Ie.forEach(({ marker: e, halo: t, bubble: r, markerCleanup: i, chromeCleanup: n }) => {
    i == null || i(), n == null || n(), e.remove(), t == null || t.remove(), r == null || r.remove();
  }), Ie.clear(), ge == null || ge.remove(), ge = null, fe == null || fe.remove(), fe = null, ke == null || ke.remove(), ke = null, _e = null, Ea(!1);
}
const or = {
  deploy: nh,
  setReviewing: ih,
  renderFeedback: mh,
  undeploy: sr,
  onTriage: null
};
function gh() {
  typeof window > "u" || window.KlavitySims || (window.KlavitySims = or);
}
typeof window < "u" && gh();
const mo = "klav-ao-css", yh = "klav-ao-overlay";
function bh(e, t, r, i, n, s = 10) {
  const o = !(e.y - r - 14 >= s), p = o ? e.y + e.h + 14 : e.y - r - 14, a = Math.max(s, Math.min(p, n - r - s));
  return { left: Math.max(s, Math.min(e.x, i - t - s)), top: a, below: o };
}
const vh = `
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
let it = null, wh = 1;
const br = /* @__PURE__ */ new Map();
function go(e, t) {
  const r = e.replace("#", ""), i = (d) => parseInt(d, 16), [n, s, l] = r.length === 3 ? [i(r[0] + r[0]), i(r[1] + r[1]), i(r[2] + r[2])] : [i(r.slice(0, 2)), i(r.slice(2, 4)), i(r.slice(4, 6))];
  return `rgba(${n},${s},${l},${t})`;
}
function xh() {
  if (it) return it;
  if (!document.getElementById(mo)) {
    const e = document.createElement("style");
    e.id = mo, e.textContent = vh, document.head.appendChild(e);
  }
  return it = document.createElement("div"), it.id = yh, it.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:visible;z-index:2147483640;", document.body.appendChild(it), it;
}
function Ah(e, t, r = {}) {
  const i = xh(), n = r.color ?? "#6366f1", s = `klav-ao-${wh++}`, l = 5, d = document.createElement("div");
  d.className = "klav-ao-halo", d.dataset.aoId = s, d.style.left = e.x - l + "px", d.style.top = e.y - l + "px", d.style.width = e.w + l * 2 + "px", d.style.height = e.h + l * 2 + "px", d.style.borderColor = n, d.style.boxShadow = `0 0 0 4px ${go(n, 0.14)},0 0 24px ${go(n, 0.18)}`, i.appendChild(d);
  let o = null;
  if (t) {
    const h = { x: e.x - l, y: e.y - l, w: e.w + l * 2, h: e.h + l * 2 }, { left: u, top: c, below: m } = bh(
      h,
      224,
      96,
      window.innerWidth,
      window.innerHeight
    );
    o = document.createElement("div"), o.className = "klav-ao-pin" + (m ? " tail-top" : ""), o.dataset.aoId = s, o.style.borderLeftColor = n, o.style.left = u + "px", o.style.top = c + "px", o.setAttribute("role", "status"), o.setAttribute("aria-label", `Annotation: ${t}`);
    const f = document.createElement("div");
    f.className = "klav-ao-hd";
    const g = document.createElement("span");
    if (g.className = "klav-ao-lbl", g.style.color = n, g.textContent = t, f.appendChild(g), r.severity) {
      const y = r.severity === "medium" ? " sev-m" : r.severity === "low" ? " sev-l" : "", w = document.createElement("span");
      w.className = `klav-ao-sev${y}`, w.textContent = r.severity, f.appendChild(w);
    }
    const x = document.createElement("button");
    x.className = "klav-ao-dismiss", x.textContent = "Dismiss", x.addEventListener("click", () => Na(s)), o.appendChild(f), o.appendChild(x), i.appendChild(o);
  }
  return br.set(s, { halo: d, pin: o }), s;
}
function Na(e) {
  const t = br.get(e);
  if (!t) return;
  br.delete(e);
  const { halo: r, pin: i } = t;
  i ? (i.classList.add("is-out"), r.style.animation = "klav-ao-pin-out .22s ease-in forwards", setTimeout(() => {
    i.remove(), r.remove();
  }, 240)) : r.remove();
}
function Lh() {
  for (const e of [...br.keys()]) Na(e);
}
let _a = gt;
const $a = { consoleErrors: [], networkFailures: [] };
let Da, za, kt = null;
function Fa(e) {
  const t = {};
  for (const [r, i] of Object.entries(e))
    i != null && (t[String(r).slice(0, 64)] = String(i).slice(0, 1e3));
  return t;
}
async function yo() {
  return Fl(document.body, {
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
function kh() {
  return Xl($a, { identity: Da, metadata: za });
}
async function Sh(e) {
  return ql(
    { type: e.type, description: e.description, context: e.context, screenshots: e.screenshots, replayEvents: e.replayEvents },
    _a,
    { jira: gc, linear: yc, github: bc, plane: vc, backend: wc }
  );
}
function Si(e = "bug") {
  const t = sc(e, {
    onCaptureFull: yo,
    onSubmit: async (r) => Sh({
      type: r.type,
      description: r.description,
      context: kh(),
      screenshots: r.screenshots,
      replayEvents: (kt == null ? void 0 : kt.getEvents()) ?? []
    })
  });
  setTimeout(async () => {
    try {
      const r = await yo();
      t.addScreenshot(r);
    } catch {
    }
  }, 200);
}
function Ch() {
  Jl($a, { consoleLevels: !0 });
}
function Ua(e) {
  Da = e ? Fa(e) : void 0;
}
function Ba(e) {
  za = e ? Fa(e) : void 0;
}
function Eh() {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth - 200)}px;top:${Math.min(e.clientY, window.innerHeight - 80)}px;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;padding:4px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:system-ui;`, t.innerHTML = `
      <div data-action="bug" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${K("bug")} Report a Bug</div>
      <div data-action="feature" style="padding:8px 16px;cursor:pointer;color:#cdd6f4;font-size:13px;border-radius:4px;">${K("lightbulb")} Request a Feature</div>
    `, document.body.appendChild(t);
    const r = (i) => {
      (!i || !t.contains(i.target)) && (t.remove(), document.removeEventListener("click", r));
    };
    t.addEventListener("click", (i) => {
      var s;
      const n = (s = i.target.closest("[data-action]")) == null ? void 0 : s.getAttribute("data-action");
      t.remove(), document.removeEventListener("click", r), n && Si(n);
    }), setTimeout(() => document.addEventListener("click", r), 0);
  });
}
function Wa(e = {}) {
  if (_a = {
    ...gt,
    ...e,
    jira: { ...gt.jira, ...e.jira },
    linear: { ...gt.linear, ...e.linear },
    github: { ...gt.github, ...e.github },
    plane: { ...gt.plane, ...e.plane }
  }, Ch(), Eh(), !kt)
    try {
      kt = Bd(et);
    } catch {
      kt = null;
    }
}
typeof window < "u" && (window.KlavitySnap = { init: Wa, openModal: Si, identify: Ua, setMetadata: Ba });
const Ph = { init: Wa, openModal: Si, identify: Ua, setMetadata: Ba };
export {
  or as KlavitySims,
  or as SimsLive,
  Na as clearAnnotation,
  Lh as clearAnnotations,
  Ph as default,
  Ua as identify,
  Wa as init,
  gh as installKlavitySims,
  Si as openModal,
  Ba as setMetadata,
  Ah as showAnnotation
};
