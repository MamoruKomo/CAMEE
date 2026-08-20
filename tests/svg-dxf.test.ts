import { describe, expect, it } from "vitest";
import { exportVectorDocumentToSvg, importSvgToVectorDocument, svgArcToCubics } from "@/lib/vector/svg";
import { importDxfToVectorDocument } from "@/lib/vector/dxf";

describe("SVG import/export", () => {
  it("imports required elements and M/L/H/V/C/Z", () => {
    const source = `<svg><path d="M0 0 H10 V10 C10 15 5 20 0 10 Z"/><line x1="1" y1="2" x2="3" y2="4"/><rect x="20" y="10" width="5" height="8"/><circle cx="40" cy="20" r="5"/><ellipse cx="60" cy="20" rx="8" ry="4"/><polyline points="0,0 2,3 4,0"/><polygon points="70,0 80,0 75,10"/></svg>`;
    const document = importSvgToVectorDocument(source);
    expect(document.paths).toHaveLength(7);
    expect(document.paths[0].closed).toBe(true);
    expect(document.paths[0].nodes.some((node) => node.inHandle || node.outHandle)).toBe(true);
  });

  it("serializes from VectorDocument and keeps cubic commands", () => {
    const document = importSvgToVectorDocument(`<svg><path data-name="curve" d="M0 0 C0 10 10 10 10 0"/></svg>`);
    const output = exportVectorDocumentToSvg(document);
    expect(output).toContain("<path");
    expect(output).toContain(" C ");
    expect(output).toContain("mm");
  });

  it("normalizes S/Q/T/A commands to cubic nodes", () => {
    const document = importSvgToVectorDocument(`<svg><path d="M0 0 C0 10 10 10 10 0 S20 -10 20 0 Q25 10 30 0 T40 0 A10 10 0 0 1 60 0"/></svg>`);
    const path = document.paths[0];
    expect(path.nodes.length).toBeGreaterThanOrEqual(7);
    expect(path.nodes.slice(1).every((node) => node.inHandle)).toBe(true);
    expect(path.nodes[path.nodes.length - 1].anchor).toEqual({ x: 60, y: -0 });
  });

  it("applies nested SVG transforms to anchors and handles", () => {
    const document = importSvgToVectorDocument(`<svg><g transform="translate(10 20)"><g transform="scale(2)"><path d="M1 2 Q2 4 3 4"/></g></g></svg>`);
    const path = document.paths[0];
    expect(path.nodes[0].anchor).toEqual({ x: 12, y: -24 });
    expect(path.nodes[1].anchor).toEqual({ x: 16, y: -28 });
    expect(path.nodes[0].outHandle).not.toBeNull();
  });

  it("converts SVG arcs to at most quarter-turn cubic segments", () => {
    const cubics = svgArcToCubics({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, 10, 0, false, true);
    expect(cubics).toHaveLength(2);
    expect(cubics[1].end).toEqual({ x: 20, y: 0 });
  });
});

describe("DXF import", () => {
  it("normalizes CIRCLE and ARC entities to cubic Bézier nodes", () => {
    const source = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n10\n50\n20\n50\n40\n10\n0\nARC\n10\n80\n20\n50\n40\n15\n50\n0\n51\n180\n0\nENDSEC\n0\nEOF\n`;
    const imported = importDxfToVectorDocument(source);
    expect(imported.document.paths).toHaveLength(2);
    expect(imported.document.paths[0].closed).toBe(true);
    expect(imported.document.paths[0].nodes).toHaveLength(4);
    expect(imported.document.paths.every((path) => path.nodes.some((node) => node.inHandle || node.outHandle))).toBe(true);
  });
});
