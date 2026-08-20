import type { Vec2, VectorPath } from "./types";

export type AffineMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export const identityMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyMatrices(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function transformPoint(matrix: AffineMatrix, point: Vec2): Vec2 {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

export function transformVector(matrix: AffineMatrix, vector: Vec2): Vec2 {
  return { x: matrix.a * vector.x + matrix.c * vector.y, y: matrix.b * vector.x + matrix.d * vector.y };
}

function transformNumbers(source: string) {
  return source.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
}

export function parseSvgTransform(source: string | undefined): AffineMatrix {
  let result = identityMatrix;
  for (const match of (source ?? "").matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const name = match[1].toLowerCase();
    const values = transformNumbers(match[2]);
    if (values.some((value) => !Number.isFinite(value))) throw new Error("SVG transformに不正な数値があります。");
    let next: AffineMatrix;
    if (name === "matrix" && values.length === 6) next = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
    else if (name === "translate" && (values.length === 1 || values.length === 2)) next = { ...identityMatrix, e: values[0], f: values[1] ?? 0 };
    else if (name === "scale" && (values.length === 1 || values.length === 2)) next = { a: values[0], b: 0, c: 0, d: values[1] ?? values[0], e: 0, f: 0 };
    else if (name === "rotate" && (values.length === 1 || values.length === 3)) {
      const radians = values[0] * Math.PI / 180;
      const rotation = { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0 };
      if (values.length === 1) next = rotation;
      else {
        const toCenter = { ...identityMatrix, e: values[1], f: values[2] };
        const fromCenter = { ...identityMatrix, e: -values[1], f: -values[2] };
        next = multiplyMatrices(multiplyMatrices(toCenter, rotation), fromCenter);
      }
    } else if (name === "skewx" && values.length === 1) next = { ...identityMatrix, c: Math.tan(values[0] * Math.PI / 180) };
    else if (name === "skewy" && values.length === 1) next = { ...identityMatrix, b: Math.tan(values[0] * Math.PI / 180) };
    else throw new Error(`未対応または不正なSVG transformです: ${match[0]}`);
    result = multiplyMatrices(result, next);
  }
  return result;
}

export function applySvgMatrixToPath(path: VectorPath, matrix: AffineMatrix): VectorPath {
  const worldPoint = (point: Vec2) => {
    const transformed = transformPoint(matrix, { x: point.x, y: -point.y });
    return { x: transformed.x, y: -transformed.y };
  };
  const worldVector = (vector: Vec2) => {
    const transformed = transformVector(matrix, { x: vector.x, y: -vector.y });
    return { x: transformed.x, y: -transformed.y };
  };
  return {
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      anchor: worldPoint(node.anchor),
      inHandle: node.inHandle ? worldVector(node.inHandle) : null,
      outHandle: node.outHandle ? worldVector(node.outHandle) : null,
    })),
  };
}
