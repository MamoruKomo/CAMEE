"use client";

import { useCallback, useState } from "react";
import type { VectorDocument } from "@/lib/vector/types";

export type EditorHistory = {
  past: VectorDocument[];
  present: VectorDocument;
  future: VectorDocument[];
};

export function createEditorHistory(document: VectorDocument): EditorHistory {
  return { past: [], present: document, future: [] };
}

export function commitHistory(history: EditorHistory, document: VectorDocument): EditorHistory {
  if (document === history.present) return history;
  return { past: [...history.past, history.present].slice(-100), present: document, future: [] };
}

export function undoHistory(history: EditorHistory): EditorHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoHistory(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (!next) return history;
  return { past: [...history.past, history.present].slice(-100), present: next, future: history.future.slice(1) };
}

export function useEditorHistory(initialDocument: VectorDocument) {
  const [history, setHistory] = useState(() => createEditorHistory(initialDocument));
  const commit = useCallback((document: VectorDocument) => setHistory((current) => commitHistory(current, document)), []);
  const replace = useCallback((document: VectorDocument) => setHistory(createEditorHistory(document)), []);
  const undo = useCallback(() => setHistory(undoHistory), []);
  const redo = useCallback(() => setHistory(redoHistory), []);
  return {
    document: history.present,
    commit,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
