import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fillText, hex, IconArt, oklch, shown, smoothPath, strokeOf, type ArtLayer } from "../src/icon/art.tsx";

test("colours keep their hue, calmer: MSL blue stays blue, black becomes slate ink", () => {
  const [, c0, h0] = oklch([0, 0, 255]);
  const [L, c, h] = oklch(hexRgb(strokeOf([0, 0, 255], false)));
  assert.ok(Math.abs(h - h0) < 6 && c < c0 && L > 0.4 && L < 0.65);
  const ink = oklch(hexRgb(strokeOf([0, 0, 0], false)));
  assert.ok(ink[0] > 0.2 && ink[0] < 0.35 && ink[1] < 0.03);
  assert.equal(hex(1, 0, 0), "#ffffff");
});

test("text and visible read the part's parameters", () => {
  assert.equal(fillText("R=%R", { R: "10" }), "R=10");
  assert.equal(fillText("%name", { R: "10" }), "");
  assert.equal(fillText("50%%", {}), "50%");
  assert.equal(fillText("startTime=%startTime", {}), "");
  assert.equal(fillText("k=%k"), ""); // a thumbnail has no parameters
  assert.equal(shown("useHeatPort", {}), false);
  assert.equal(shown("not useSupport", {}), true);
  assert.equal(shown("useHeatPort", { useHeatPort: "true" }), true);
});

test("a Bezier line runs through the midpoints", () => {
  assert.equal(smoothPath([[0, 0], [10, 10], [20, 0]], false), "M0 0 L5 -5 Q10 -10 15 -5 L20 0");
});

test("the art draws whole: gradients, a hidden graphic left out, text filled", () => {
  const art: ArtLayer[] = [
    {
      extent: [-100, -100, 100, 100],
      g: [
        { t: "Rectangle", lineColor: [64, 64, 64], fillColor: [192, 192, 192], fillPattern: "HorizontalCylinder", extent: [-50, -50, 50, 50] },
        { t: "Ellipse", lineColor: [0, 0, 255], fillColor: [255, 255, 255], fillPattern: "Solid", extent: [-20, -20, 20, 20] },
        { t: "Line", visible: "useHeatPort", points: [[0, -100], [0, -30]], color: [191, 0, 0] },
        { t: "Text", extent: [-150, -40, 150, -80], text: "J=%J", lineColor: [0, 0, 0] },
      ],
    },
  ];
  const svg = renderToStaticMarkup(createElement(IconArt, { art, icon: { g: [] }, params: { J: "2" } }));
  assert.match(svg, /^<svg class="icon-art" width="64" height="56"/);
  assert.equal((svg.match(/<linearGradient/g) ?? []).length, 2);
  assert.match(svg, /<rect [^>]*rx="4"/); // a body plate gets its radius
  assert.doesNotMatch(svg, /<polyline/); // the heat port line is hidden
  assert.match(svg, />J=2<\/text>/);
  assert.equal(renderToStaticMarkup(createElement(IconArt, { art: [], icon: { g: [] } })), "");
});

function hexRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
