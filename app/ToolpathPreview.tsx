"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildRampToolpath, type Bounds, type RampPoint, type ToolPath } from "@/lib/cam";

export type PreviewHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  fitSelection?: () => void;
  scaleSelection?: (factor: number) => void;
  rotateSelection?: (degrees: number) => void;
  selectPaths?: (pathIds: string[]) => void;
};

type PreviewProps = {
  paths: ToolPath[];
  depths: number[];
  bitDiameter: number;
  materialBounds: Bounds;
  materialThickness: number;
  mode: "2d" | "3d";
  rampEnabled?: boolean;
  rampLength?: number;
};

type ViewState = {
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  fitZoom: number;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((material) => material.dispose());
  });
}

export const ToolpathPreview = forwardRef<PreviewHandle, PreviewProps>(function ToolpathPreview(
  { paths, depths, bitDiameter, materialBounds, materialThickness, mode, rampEnabled = false, rampLength = 0 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewState | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const view = viewRef.current;
      if (!view) return;
      view.camera.zoom = Math.min(8, view.camera.zoom * 1.2);
      view.camera.updateProjectionMatrix();
    },
    zoomOut() {
      const view = viewRef.current;
      if (!view) return;
      view.camera.zoom = Math.max(0.25, view.camera.zoom / 1.2);
      view.camera.updateProjectionMatrix();
    },
    fit() {
      const view = viewRef.current;
      if (!view) return;
      view.camera.zoom = view.fitZoom;
      view.controls.reset();
      view.camera.updateProjectionMatrix();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xe7ecec, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    let minX = materialBounds.minX;
    let minY = materialBounds.minY;
    let maxX = materialBounds.maxX;
    let maxY = materialBounds.maxY;
    paths.forEach((path) => path.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }));
    const drawingWidth = Math.max(10, maxX - minX);
    const drawingHeight = Math.max(10, maxY - minY);
    const maxDimension = Math.max(drawingWidth, drawingHeight);
    const boardWidth = Math.max(0.01, materialBounds.width);
    const boardHeight = Math.max(0.01, materialBounds.height);
    const thickness = Math.max(0.01, materialThickness);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const boardCenterX = (materialBounds.minX + materialBounds.maxX) / 2;
    const boardCenterY = (materialBounds.minY + materialBounds.maxY) / 2;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, maxDimension * 20 + 1000);
    camera.up.set(0, 0, 1);
    if (mode === "3d") {
      camera.position.set(maxDimension * 0.92, -maxDimension * 1.05, maxDimension * 0.9);
    } else {
      camera.position.set(0, 0, maxDimension * 2 + 100);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(0, 0, -Math.min(thickness, 10) / 4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enableRotate = mode === "3d";
    controls.target.set(0, 0, -Math.min(thickness, 10) / 4);
    controls.saveState();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x667277, 2.3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(maxDimension, -maxDimension, maxDimension * 2);
    scene.add(keyLight);

    const gridSize = Math.max(100, Math.ceil((maxDimension * 1.7) / 50) * 50);
    const grid = new THREE.GridHelper(gridSize, Math.min(80, Math.max(10, Math.round(gridSize / 25))), 0xb8c1c2, 0xd5dbdc);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -thickness - 0.2;
    scene.add(grid);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth, boardHeight, thickness),
      new THREE.MeshStandardMaterial({
        color: 0xf6f6f1,
        roughness: 0.82,
        metalness: 0,
        transparent: mode === "3d",
        opacity: mode === "3d" ? 0.9 : 1,
      }),
    );
    board.position.set(boardCenterX - centerX, boardCenterY - centerY, -thickness / 2);
    scene.add(board);
    const boardEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(board.geometry),
      new THREE.LineBasicMaterial({ color: 0x909c9f, transparent: true, opacity: 0.62 }),
    );
    boardEdges.position.copy(board.position);
    scene.add(boardEdges);

    if (paths.length) {
      const displayDepths = mode === "3d" ? depths : [0];
      displayDepths.forEach((depth, depthIndex) => {
        const isFinal = depthIndex === displayDepths.length - 1;
        paths.forEach((path) => {
          const previousDepth = depthIndex === 0 ? 0 : displayDepths[depthIndex - 1];
          const rampPoints = mode === "3d" && rampEnabled
            ? buildRampToolpath(path, previousDepth, depth, rampLength)
            : [];
          const vertices = (rampPoints.length ? rampPoints : path.points).flatMap((value) => [
            value.x - centerX,
            value.y - centerY,
            mode === "3d" ? -(rampPoints.length ? (value as RampPoint).depth : depth) : 0.18,
          ]);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
          const material = new THREE.LineBasicMaterial({
            color: isFinal ? 0x079caf : 0xf2aa2b,
            transparent: true,
            opacity: isFinal ? 1 : 0.54,
            depthTest: mode !== "3d",
          });
          scene.add(new THREE.Line(geometry, material));

          if (mode === "3d" && path.points.length && !rampPoints.length) {
            const start = path.points[0];
            const plungeGeometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(start.x - centerX, start.y - centerY, 0.3),
              new THREE.Vector3(start.x - centerX, start.y - centerY, -depth),
            ]);
            scene.add(new THREE.Line(plungeGeometry, new THREE.LineDashedMaterial({ color: 0xe58e12, dashSize: Math.max(0.5, bitDiameter), gapSize: Math.max(0.3, bitDiameter * 0.6) })));
          }
        });
      });
    }

    const axes = new THREE.AxesHelper(Math.max(12, maxDimension * 0.08));
    axes.position.set(-centerX, -centerY, 0.4);
    scene.add(axes);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const aspect = width / height;
      const viewHeight = mode === "3d"
        ? Math.max(boardHeight * 1.45, (boardWidth * 1.45) / aspect)
        : Math.max(boardHeight * 1.16, (boardWidth * 1.16) / aspect);
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    viewRef.current = { camera, controls, fitZoom: 1 };

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      viewRef.current = null;
    };
  }, [paths, depths, bitDiameter, materialBounds, materialThickness, mode, rampEnabled, rampLength]);

  return <div ref={containerRef} className="three-preview" aria-label={`${mode.toUpperCase()}ツールパスプレビュー`} />;
});
