// A library class's own Icon graphics (the server's `art`), drawn whole and restyled by rule
// (articula#18; mockup and rules: agent-docs rebrand/apps/articula/blocks.html):
//  - colour: each RGB to OKLCH, chroma cut to about two thirds, lightness held in a band, hue kept;
//  - fills: white is paper tinted with the block's own hue, a solid colour gets light from above,
//    cylinders and spheres a smooth metal ramp, hatches go thin and soft;
//  - lines: one weight scale (1.5 / 2 / 2.75 px) that doesn't scale with the icon, sharp joins;
//  - text: the UI sans; `%name` is left to the plate's caption.
// The plate (kit CompactBlock) still sizes the block and draws its connector ports.

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { plateSize, type IconDef } from "@paperboatlab/ui/canvas";
import type { Placement } from "../model/types.ts";

type Rgb = [number, number, number] | null;
type Xy = [number, number];
export type ArtGraphic = {
  t: "Line" | "Polygon" | "Rectangle" | "Ellipse" | "Text";
  visible?: string;
  origin?: Xy;
  rotation?: number;
  points?: Xy[];
  color?: Rgb;
  lineColor?: Rgb;
  fillColor?: Rgb;
  pattern?: string;
  fillPattern?: string;
  thickness?: number;
  arrow?: [string, string];
  arrowSize?: number;
  smooth?: string;
  extent?: [number, number, number, number];
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  closure?: string;
  text?: string;
  fontSize?: number;
  textColor?: Rgb;
  align?: string;
};
/** One annotation of the class or a base class, in its own coordinate system. */
export type ArtLayer = { extent: [number, number, number, number]; g: ArtGraphic[] };

// ---------------------------------------------------------------- colour (OKLCH)

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => Math.round(255 * (Math.min(1, Math.max(0, c)) <= 0.0031308 ? 12.92 * Math.max(0, c) : 1.055 * Math.min(1, c) ** (1 / 2.4) - 0.055));

export function oklch([R, G, B]: [number, number, number]): [number, number, number] {
  const [r, g, b] = [lin(R), lin(G), lin(B)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, Bb), ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360];
}

/** OKLCH to hex, chroma cut until it fits sRGB. */
export function hex(L: number, C: number, H: number): string {
  let rgb: number[] = [];
  for (let i = 0; i < 24; i++, C *= 0.9) {
    const A = C * Math.cos((H * Math.PI) / 180);
    const B = C * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (rgb.every((v) => v >= -0.001 && v <= 1.001)) break;
  }
  return "#" + rgb.map((v) => gam(v).toString(16).padStart(2, "0")).join("");
}

const NEUTRAL_H = 260; // greys lean slightly cool, like the kit's slate

export function strokeOf(rgb: Rgb, dark: boolean): string {
  const [L, C, H] = oklch(rgb ?? [0, 0, 0]);
  if (C < 0.03) return hex(dark ? 0.88 - 0.25 * L : 0.27 + 0.4 * L, 0.014, NEUTRAL_H);
  return hex(dark ? 0.76 + 0.08 * L : 0.44 + 0.16 * L, Math.min(C * 0.75, 0.17), H);
}

function fillBase(rgb: [number, number, number], dark: boolean): [number, number, number] {
  const [L, C, H] = oklch(rgb);
  if (C < 0.03) return [dark ? 0.24 + 0.22 * L : 0.42 + 0.56 * L, 0.012, NEUTRAL_H];
  return [dark ? 0.48 + 0.2 * L : 0.56 + 0.3 * L, Math.min(C * 0.8, 0.16), H];
}

/** The icon's own hue: its most used chromatic line colour, which white fills lean to. */
function mainHue(layers: ArtLayer[]): number | null {
  const seen = new Map<number, number>();
  for (const { g } of layers)
    for (const p of g) {
      const c = p.t === "Line" ? p.color : p.t === "Text" ? null : p.lineColor;
      if (!c) continue;
      const [, C, H] = oklch(c);
      if (C >= 0.03) seen.set(Math.round(H), (seen.get(Math.round(H)) ?? 0) + 1);
    }
  let best: number | null = null;
  for (const [h, n] of seen) if (best === null || n > seen.get(best)!) best = h;
  return best;
}

// ---------------------------------------------------------------- the light/dark theme

const subscribe = (cb: () => void) => {
  const watch = new MutationObserver(cb);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watch.disconnect();
};
const useDark = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);

// ---------------------------------------------------------------- drawing

const HATCH: Record<string, string> = { Horizontal: "M0 3H6", Vertical: "M3 0V6", Cross: "M0 3H6M3 0V6", Forward: "M0 6L6 0", Backward: "M0 0L6 6", CrossDiag: "M0 6L6 0M0 0L6 6" };
const DASH: Record<string, string> = { Dash: "4 2", Dot: "1 2", DashDot: "4 2 1 2", DashDotDot: "4 2 1 2 1 2" };
const width = (t = 0.25) => (t <= 0.3 ? 1.5 : t <= 0.6 ? 2 : 2.75);

/** Just enough of a Modelica Boolean for `visible`: a parameter, `not` one, true/false; unknown flags read false. */
export function shown(expr: string | undefined, params: Record<string, unknown>): boolean {
  if (expr === undefined) return true;
  const e = expr.trim();
  if (e.startsWith("not ")) return !shown(e.slice(4), params);
  if (e === "true" || e === "false") return e === "true";
  const v = params[e];
  return v === true || v === "true";
}

/** `%par` from the part's parameters, `%%` as %; `%name` reads empty (the caption has it); a
 * parameter without a value empties the text. No params (a library thumbnail): a text with any `%par` reads empty. */
export function fillText(s: string, params?: Record<string, unknown>): string {
  if (!params) return /%[A-Za-z_]/.test(s) ? "" : s.replaceAll("%%", "%");
  let missing = false;
  const out = s.replace(/%(%|[A-Za-z_][\w.]*)/g, (_, k: string) => {
    if (k === "%") return "%";
    if (k === "name") return "";
    if (params[k] === undefined) missing = true;
    return String(params[k]);
  });
  return missing ? "" : out; // a parameter without a value hides its text, never prints its own name
}

class Pen {
  defs: ReactNode[] = [];
  n = 0;
  constructor(
    readonly id: string,
    readonly dark: boolean,
    readonly hue: number | null,
  ) {}

  fill(fill: Rgb, pattern = "None"): string {
    if (pattern === "None") return "none";
    const [L0, C0, H0] = fillBase(fill ?? [255, 255, 255], this.dark);
    const [fl, fc] = oklch(fill ?? [255, 255, 255]);
    const white = fc < 0.03 && fl > 0.97;
    let [L, C, H] = [L0, C0, H0];
    if (white && this.hue !== null) [C, H] = [0.04, this.hue];
    const id = `${this.id}-${++this.n}`;
    const stop = (o: number, l: number, c = C) => <stop key={o} offset={o} stopColor={hex(l, c, H)} />;
    if (pattern === "Solid") {
      const [top, bot] = white ? (this.dark ? [[0.36, C * 0.6], [0.28, C]] : [[0.995, 0.006], [0.925, C]]) : [[L + 0.1, C * 0.7], [L - 0.08, C * 1.1]];
      this.defs.push(<linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">{stop(0, top[0], top[1])}{stop(1, bot[0], bot[1])}</linearGradient>);
    } else if (pattern === "HorizontalCylinder" || pattern === "VerticalCylinder") {
      if (white) L = this.dark ? 0.42 : 0.9;
      const v = pattern === "HorizontalCylinder";
      this.defs.push(
        <linearGradient key={id} id={id} x1="0" y1="0" x2={v ? 0 : 1} y2={v ? 1 : 0}>
          {stop(0, L - 0.16)}{stop(0.32, L + 0.08)}{stop(0.55, L)}{stop(1, L - 0.22)}
        </linearGradient>,
      );
    } else if (pattern === "Sphere") {
      this.defs.push(<radialGradient key={id} id={id} cx=".38" cy=".34" r=".7">{stop(0, L + 0.2)}{stop(0.25, L + 0.08)}{stop(0.7, L - 0.06)}{stop(1, L - 0.22)}</radialGradient>);
    } else {
      this.defs.push(
        <pattern key={id} id={id} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d={HATCH[pattern] ?? HATCH.Horizontal} stroke={hex(L, C, H)} strokeWidth=".7" opacity=".7" />
        </pattern>,
      );
    }
    return `url(#${id})`;
  }

  line(color: Rgb, pattern = "Solid", thickness?: number) {
    if (pattern === "None") return null;
    return { stroke: strokeOf(color, this.dark), strokeWidth: width(thickness), strokeDasharray: DASH[pattern], strokeLinejoin: "miter" as const, strokeMiterlimit: 4, vectorEffect: "non-scaling-stroke" as const };
  }
}

const pts = (p: Xy[]) => p.map(([x, y]) => `${x},${-y}`).join(" ");

/** OMEdit's Smooth.Bezier: quadratic curves through the midpoints of the polyline. */
export function smoothPath(p: Xy[], closed: boolean): string {
  const q: Xy[] = p.map(([x, y]) => [x, -y]);
  if (closed) q.push(q[0]);
  if (q.length < 3) return "M" + q.map(([x, y]) => `${x} ${y}`).join(" L");
  const mid = (a: Xy, b: Xy): Xy => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${q[0][0]} ${q[0][1]} L${mid(q[0], q[1]).join(" ")}`;
  for (let i = 1; i < q.length - 1; i++) d += ` Q${q[i][0]} ${q[i][1]} ${mid(q[i], q[i + 1]).join(" ")}`;
  return d + ` L${q[q.length - 1][0]} ${q[q.length - 1][1]}` + (closed ? " Z" : "");
}

function arrowHead(from: Xy, to: Xy, kind: string, size: number, color: string, key: string): ReactNode {
  const [bx, by] = [to[0], -to[1]];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const [dx, dy] = [(to[0] - from[0]) / len, -(to[1] - from[1]) / len]; // along the line, on screen
  const back = (side: number): Xy => [bx - size * dx - side * size * 0.45 * dy, by - size * dy + side * size * 0.45 * dx];
  const corners: Xy[] = kind === "Half" ? [[bx, by], back(1)] : [[bx, by], back(1), back(-1)];
  return <polygon key={key} points={corners.map((c) => c.join(",")).join(" ")} fill={kind === "Filled" ? color : "none"} stroke={color} vectorEffect="non-scaling-stroke" />;
}

function graphic(pen: Pen, g: ArtGraphic, params: Record<string, unknown> | undefined, mirror: boolean, key: string): ReactNode {
  if (!shown(g.visible, params ?? {})) return null;
  const [ox, oy] = g.origin ?? [0, 0];
  const transform = ox || oy || g.rotation ? `translate(${ox},${-oy}) rotate(${-(g.rotation ?? 0)})` : undefined;
  let body: ReactNode = null;
  if (g.t === "Line" && g.points) {
    const line = pen.line(g.color ?? null, g.pattern, g.thickness);
    if (!line) return null;
    const p = g.points;
    body = (
      <>
        {g.smooth === "Bezier" ? <path d={smoothPath(p, false)} fill="none" {...line} /> : <polyline points={pts(p)} fill="none" {...line} />}
        {g.arrow?.[0] && g.arrow[0] !== "None" && arrowHead(p[1], p[0], g.arrow[0], g.arrowSize ?? 3, line.stroke, "a0")}
        {g.arrow?.[1] && g.arrow[1] !== "None" && arrowHead(p[p.length - 2], p[p.length - 1], g.arrow[1], g.arrowSize ?? 3, line.stroke, "a1")}
      </>
    );
  } else if (g.t === "Text" && g.extent && g.text !== undefined) {
    const s = fillText(g.text, params).trim();
    if (!s) return null;
    const [x1, y1, x2, y2] = g.extent;
    const [w, h] = [Math.abs(x2 - x1), Math.abs(y2 - y1)];
    const size = g.fontSize ? g.fontSize * 1.4 : Math.min(h * 0.78, w / Math.max(1, s.length * 0.58));
    const [, C] = oklch(g.textColor ?? g.lineColor ?? [0, 0, 0]);
    const fill = C < 0.03 ? (pen.dark ? hex(0.7, 0.01, NEUTRAL_H) : hex(0.44, 0.012, NEUTRAL_H)) : strokeOf(g.textColor ?? g.lineColor ?? null, pen.dark);
    const anchor = g.align === "Left" ? "start" : g.align === "Right" ? "end" : "middle";
    const x = g.align === "Left" ? Math.min(x1, x2) : g.align === "Right" ? Math.max(x1, x2) : (x1 + x2) / 2;
    const y = -(y1 + y2) / 2;
    // a mirrored part keeps its text readable
    body = (
      <text x={x} y={y} fontSize={size.toFixed(1)} fill={fill} textAnchor={anchor} dominantBaseline="central" style={{ fontFamily: "var(--font-sans)" }} transform={mirror ? `translate(${2 * x},0) scale(-1,1)` : undefined}>
        {s}
      </text>
    );
  } else {
    const line = pen.line(g.lineColor ?? null, g.pattern, g.thickness);
    const stroke = line ?? { stroke: "none" };
    if (g.t === "Polygon" && g.points) {
      const fill = pen.fill(g.fillColor ?? null, g.fillPattern);
      body = g.smooth === "Bezier" ? <path d={smoothPath(g.points, true)} fill={fill} {...stroke} /> : <polygon points={pts(g.points)} fill={fill} {...stroke} />;
    } else if (g.t === "Rectangle" && g.extent) {
      const [x1, y1, x2, y2] = g.extent;
      const [x, y, w, h] = [Math.min(x1, x2), -Math.max(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      const fill = pen.fill(g.fillColor ?? null, g.fillPattern);
      const r = fill !== "none" && Math.min(w, h) >= 30 ? Math.max(g.radius ?? 0, 4) : (g.radius ?? 0); // body plates get a small radius
      body = <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} {...stroke} />;
    } else if (g.t === "Ellipse" && g.extent) {
      const [x1, y1, x2, y2] = g.extent;
      const [cx, cy, rx, ry] = [(x1 + x2) / 2, -(y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2];
      const fill = pen.fill(g.fillColor ?? null, g.fillPattern);
      const [a0, a1] = [g.startAngle ?? 0, g.endAngle ?? 360];
      if (a1 !== a0 && (a1 - a0) % 360 === 0) body = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} {...stroke} />;
      else {
        const at = (a: number) => `${cx + rx * Math.cos((a * Math.PI) / 180)} ${cy - ry * Math.sin((a * Math.PI) / 180)}`;
        const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
        const arc = `A${rx} ${ry} 0 ${large} 0 ${at(a1)}`;
        const d = g.closure === "Radial" ? `M${cx} ${cy} L${at(a0)} ${arc} Z` : `M${at(a0)} ${arc}${g.closure === "Chord" ? " Z" : ""}`;
        body = <path d={d} fill={g.closure === "None" ? "none" : fill} {...stroke} />;
      }
    }
  }
  return body && <g key={key} transform={transform}>{body}</g>;
}

const PAD = 8; // the kit's plate inset for icon art (icon.ts)

/**
 * The class's graphics as an SVG the size of `icon`'s plate (turned and mirrored as `place` says),
 * or null when there is nothing to draw.
 */
export function IconArt({ art, icon, place, params }: { art: ArtLayer[] | undefined; icon: IconDef; place?: Pick<Placement, "rotation" | "mirror">; params?: Record<string, unknown> }) {
  const dark = useDark();
  const id = "art" + useId().replace(/[^\w-]/g, "");
  if (!art?.length) return null;
  const { w, h } = plateSize(icon); // the plate as placed
  const rot = place?.rotation ?? 0;
  const mirror = Boolean(place?.mirror);
  const swap = rot === 90 || rot === 270;
  // the drawing area before the turn, inside the plate's inset, one scale for both axes
  const [aw, ah] = swap ? [h - 2 * PAD, w - 2 * PAD] : [w - 2 * PAD, h - 2 * PAD];
  const pen = new Pen(id, dark, mainHue(art));
  const layers = art.map((layer, i) => {
    const [x1, y1, x2, y2] = layer.extent;
    const [ew, eh] = [Math.abs(x2 - x1) || 200, Math.abs(y2 - y1) || 200];
    const k = Math.min(aw / ew, ah / eh);
    const [cx, cy] = [(x1 + x2) / 2, -(y1 + y2) / 2];
    return (
      <g key={i} transform={`scale(${k}) translate(${-cx},${-cy})`}>
        {layer.g.map((g, j) => graphic(pen, g, params, mirror, String(j)))}
      </g>
    );
  });
  return (
    <svg className="icon-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        {pen.defs}
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000" floodOpacity={dark ? 0.45 : 0.13} />
        </filter>
      </defs>
      <g transform={`translate(${w / 2},${h / 2}) rotate(${-rot}) scale(${mirror ? -1 : 1},1)`} filter={`url(#${id}-sh)`}>
        {layers}
      </g>
    </svg>
  );
}
