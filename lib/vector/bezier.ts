import type { Vec2, VectorNodeType, VectorPath } from "./types";

export type CubicBezier = {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
};

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function multiply(value: Vec2, factor: number): Vec2 {
  return { x: value.x * factor, y: value.y * factor };
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function cubicPoint(curve: CubicBezier, t: number): Vec2 {
  const safeT = Math.max(0, Math.min(1, t));
  const inverse = 1 - safeT;
  const a = inverse ** 3;
  const b = 3 * inverse ** 2 * safeT;
  const c = 3 * inverse * safeT ** 2;
  const d = safeT ** 3;
  return {
    x: curve.p0.x * a + curve.p1.x * b + curve.p2.x * c + curve.p3.x * d,
    y: curve.p0.y * a + curve.p1.y * b + curve.p2.y * c + curve.p3.y * d,
  };
}

export function closestPointOnPath(path: VectorPath, point: Vec2, samplesPerSegment = 32) {
  const segmentCount = path.closed ? path.nodes.length : Math.max(0, path.nodes.length - 1);
  if (!segmentCount) throw new Error("距離を計算できるセグメントがありません。");
  const sampleCount = Math.max(8, Math.min(256, Math.floor(samplesPerSegment)));
  let best = { segmentIndex: 0, t: 0, point: path.nodes[0].anchor, distance: Infinity };
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const curve = segmentCurve(path, segmentIndex);
    let bestSample = 0;
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const t = sample / sampleCount;
      const candidate = cubicPoint(curve, t);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < best.distance) {
        best = { segmentIndex, t, point: candidate, distance };
        bestSample = sample;
      }
    }
    if (best.segmentIndex !== segmentIndex) continue;
    let low = Math.max(0, (bestSample - 1) / sampleCount);
    let high = Math.min(1, (bestSample + 1) / sampleCount);
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const leftT = low + (high - low) / 3;
      const rightT = high - (high - low) / 3;
      const left = cubicPoint(curve, leftT);
      const right = cubicPoint(curve, rightT);
      const leftDistance = Math.hypot(left.x - point.x, left.y - point.y);
      const rightDistance = Math.hypot(right.x - point.x, right.y - point.y);
      if (leftDistance <= rightDistance) high = rightT;
      else low = leftT;
    }
    const t = (low + high) / 2;
    const candidate = cubicPoint(curve, t);
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < best.distance) best = { segmentIndex, t, point: candidate, distance };
  }
  return best;
}

export function handlePolar(handle: Vec2) {
  return { length: Math.hypot(handle.x, handle.y), angleDegrees: Math.atan2(handle.y, handle.x) * 180 / Math.PI };
}

export function handleFromPolar(length: number, angleDegrees: number): Vec2 | null {
  if (!Number.isFinite(length) || length < 0 || !Number.isFinite(angleDegrees)) throw new Error("ハンドルの長さと角度は有限値にしてください。");
  if (length === 0) return null;
  const radians = angleDegrees * Math.PI / 180;
  return { x: Math.cos(radians) * length, y: Math.sin(radians) * length };
}

export function splitCubic(curve: CubicBezier, t: number): [CubicBezier, CubicBezier] {
  const p01 = lerp(curve.p0, curve.p1, t);
  const p12 = lerp(curve.p1, curve.p2, t);
  const p23 = lerp(curve.p2, curve.p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const point = lerp(p012, p123, t);
  return [
    { p0: curve.p0, p1: p01, p2: p012, p3: point },
    { p0: point, p1: p123, p2: p23, p3: curve.p3 },
  ];
}

export function segmentCurve(path: VectorPath, segmentIndex: number): CubicBezier {
  const start = path.nodes[segmentIndex];
  const end = path.nodes[(segmentIndex + 1) % path.nodes.length];
  if (!start || !end) throw new Error("存在しないセグメントです。");
  return {
    p0: { ...start.anchor },
    p1: start.outHandle ? add(start.anchor, start.outHandle) : { ...start.anchor },
    p2: end.inHandle ? add(end.anchor, end.inHandle) : { ...end.anchor },
    p3: { ...end.anchor },
  };
}

export function isLineSegment(path: VectorPath, segmentIndex: number) {
  const start = path.nodes[segmentIndex];
  const end = path.nodes[(segmentIndex + 1) % path.nodes.length];
  return Boolean(start && end && !start.outHandle && !end.inHandle);
}

export function applyHandleDrag(
  path: VectorPath,
  nodeId: string,
  side: "in" | "out",
  handle: Vec2 | null,
): VectorPath {
  return {
    ...path,
    nodes: path.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const next = { ...node, inHandle: node.inHandle ? { ...node.inHandle } : null, outHandle: node.outHandle ? { ...node.outHandle } : null };
      const value = handle ? { ...handle } : null;
      if (side === "in") next.inHandle = value;
      else next.outHandle = value;
      if (!value || node.nodeType === "corner") return next;

      const oppositeSide = side === "in" ? "outHandle" : "inHandle";
      const existing = next[oppositeSide];
      if (node.nodeType === "symmetric") {
        next[oppositeSide] = { x: -value.x, y: -value.y };
      } else {
        const length = existing ? Math.hypot(existing.x, existing.y) : Math.hypot(value.x, value.y);
        const valueLength = Math.max(1e-12, Math.hypot(value.x, value.y));
        next[oppositeSide] = { x: (-value.x / valueLength) * length, y: (-value.y / valueLength) * length };
      }
      return next;
    }),
  };
}

export function setNodeType(path: VectorPath, nodeId: string, nodeType: VectorNodeType): VectorPath {
  return {
    ...path,
    nodes: path.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const next = { ...node, nodeType };
      if (nodeType === "corner") return next;
      const basis = node.outHandle ?? (node.inHandle ? { x: -node.inHandle.x, y: -node.inHandle.y } : { x: 10, y: 0 });
      const basisLength = Math.max(1e-12, Math.hypot(basis.x, basis.y));
      const inLength = nodeType === "symmetric" ? basisLength : Math.hypot(node.inHandle?.x ?? basis.x, node.inHandle?.y ?? basis.y);
      const outLength = nodeType === "symmetric" ? basisLength : Math.hypot(node.outHandle?.x ?? basis.x, node.outHandle?.y ?? basis.y);
      return {
        ...next,
        inHandle: { x: (-basis.x / basisLength) * inLength, y: (-basis.y / basisLength) * inLength },
        outHandle: { x: (basis.x / basisLength) * outLength, y: (basis.y / basisLength) * outLength },
      };
    }),
  };
}

export function deleteNode(path: VectorPath, nodeId: string): VectorPath {
  return { ...path, nodes: path.nodes.filter((node) => node.id !== nodeId) };
}

export function splitPathSegment(path: VectorPath, segmentIndex: number, t: number, nodeId: string): VectorPath {
  if (!(t > 0 && t < 1)) throw new Error("分割位置は0より大きく1より小さくしてください。");
  const startIndex = segmentIndex;
  const endIndex = (segmentIndex + 1) % path.nodes.length;
  const start = path.nodes[startIndex];
  const end = path.nodes[endIndex];
  if (!start || !end) throw new Error("分割対象のセグメントがありません。");
  const [left, right] = splitCubic(segmentCurve(path, segmentIndex), t);
  const nodes = path.nodes.map((node) => ({ ...node }));
  nodes[startIndex] = { ...start, outHandle: subtract(left.p1, left.p0) };
  nodes[endIndex] = { ...end, inHandle: subtract(right.p2, right.p3) };
  const inserted = {
    id: nodeId,
    anchor: left.p3,
    inHandle: subtract(left.p2, left.p3),
    outHandle: subtract(right.p1, right.p0),
    nodeType: "smooth" as const,
  };
  if (path.closed && endIndex === 0) nodes.push(inserted);
  else nodes.splice(endIndex, 0, inserted);
  return { ...path, nodes };
}
