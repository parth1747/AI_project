import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './Map3D.css';
import { mapNodes, roads } from '../mapData';

interface Map3DProps {
  start: string | null;
  end: string | null;
  path: string[];
  visited: string[];
  focusNodeId: string | null;
  focusSignal: number;
  algorithmUsed: string | null;
  onViewRotationChange?: (azimuth: number, polar: number) => void;
  onNodeClick: (nodeId: string) => void;
}

const SPHERE_RADIUS = 360;
const LABEL_DISTANCE_FACTOR = 1.16;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FOCUS_CAMERA_DISTANCE = 240;
const FOCUS_CAMERA_LIFT = 60;
const FOCUS_TRANSITION_MS = 2000;
const PATH_EDGE_REVEAL_SPEED = 2.45;
const ROAD_OPACITY = 0.4;
const LABEL_PROXIMITY_RADIUS_MIN_PX = 80;
const LABEL_PROXIMITY_RADIUS_MAX_PX = 190;

function createSpherePosition(index: number, total: number): THREE.Vector3 {
  const ratio = (index + 0.5) / total;
  const y = 1 - ratio * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * index;

  return new THREE.Vector3(
    Math.cos(theta) * radius * SPHERE_RADIUS,
    y * SPHERE_RADIUS,
    Math.sin(theta) * radius * SPHERE_RADIUS
  );
}

function createArcPoints(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  if (midpoint.lengthSq() < 0.0001) {
    midpoint.set(0, SPHERE_RADIUS + 90, 0);
  }

  const outwardPoint = midpoint
    .normalize()
    .multiplyScalar(SPHERE_RADIUS + 70 + from.distanceTo(to) * 0.05);

  const curve = new THREE.QuadraticBezierCurve3(from, outwardPoint, to);
  return curve.getPoints(42);
}

function easeInOutQuint(value: number): number {
  return value < 0.5
    ? 16 * value * value * value * value * value
    : 1 - Math.pow(-2 * value + 2, 5) / 2;
}

export const Map3D: React.FC<Map3DProps> = ({
  start,
  end,
  path,
  visited,
  focusNodeId,
  focusSignal,
  algorithmUsed,
  onViewRotationChange,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const pointerInsideRef = useRef(false);

  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const labelSpritesRef = useRef<Map<string, THREE.Sprite>>(new Map());
  const algorithmLabelRef = useRef<THREE.Sprite | null>(null);
  const nodePositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const roadLinesRef = useRef<
    Array<{
      fromId: string;
      toId: string;
      line: THREE.Line;
      tube?: THREE.Mesh;
      isPathRoad: boolean;
      revealProgress: number;
    }>
  >([]);

  const hoveredNodeRef = useRef<THREE.Mesh | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const focusedNodeIdRef = useRef<string | null>(null);
  const focusedUntilRef = useRef<number>(0);
  const focusTransitionRef = useRef<{
    startTime: number;
    durationMs: number;
    fromCamera: THREE.Vector3;
    toCamera: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onViewRotationChangeRef = useRef(onViewRotationChange);

  const visualStateRef = useRef<{
    start: string | null;
    end: string | null;
    pathSet: Set<string>;
    visitedSet: Set<string>;
    pathEdgeSet: Set<string>;
  }>({
    start: null,
    end: null,
    pathSet: new Set<string>(),
    visitedSet: new Set<string>(),
    pathEdgeSet: new Set<string>(),
  });

  const COLOR_NODE_DEFAULT = 0xffffff;
  const COLOR_NODE_START = 0x37d67a;
  const COLOR_NODE_END = 0xff3b3b;
  const COLOR_NODE_PATH = 0x5a2d82;
  const COLOR_NODE_VISITED = 0xffe65f;
  const COLOR_ROAD_DEFAULT = 0xffffff;
  const COLOR_ROAD_PATH = 0x5a2d82;

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onViewRotationChangeRef.current = onViewRotationChange;
  }, [onViewRotationChange]);

  useEffect(() => {
    if (!focusNodeId) {
      focusedNodeIdRef.current = null;
      focusedUntilRef.current = 0;
      focusTransitionRef.current = null;
      return;
    }

    focusedNodeIdRef.current = focusNodeId;
    focusedUntilRef.current = performance.now() + 5000;

    const focusPosition = nodePositionsRef.current.get(focusNodeId);
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!focusPosition || !camera || !controls) {
      return;
    }

    const outwardDirection = focusPosition.clone();
    if (outwardDirection.lengthSq() < 0.0001) {
      outwardDirection.set(0, 0, 1);
    }
    outwardDirection.normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangentDirection = new THREE.Vector3().crossVectors(worldUp, outwardDirection);
    if (tangentDirection.lengthSq() < 0.0001) {
      tangentDirection.set(1, 0, 0);
    }
    tangentDirection.normalize();

    const liftDirection = new THREE.Vector3().crossVectors(outwardDirection, tangentDirection).normalize();
    const focusTarget = focusPosition.clone().multiplyScalar(0.94);
    const nextCameraPosition = focusTarget
      .clone()
      .add(outwardDirection.clone().multiplyScalar(FOCUS_CAMERA_DISTANCE))
      .add(liftDirection.multiplyScalar(FOCUS_CAMERA_LIFT));

    focusTransitionRef.current = {
      startTime: performance.now(),
      durationMs: FOCUS_TRANSITION_MS,
      fromCamera: camera.position.clone(),
      toCamera: nextCameraPosition,
      fromTarget: controls.target.clone(),
      toTarget: focusTarget,
    };
  }, [focusNodeId, focusSignal]);

  useEffect(() => {
    // Create algorithm label when algorithm is used
    if (algorithmUsed && sceneRef.current && labelSpritesRef.current) {
      // Remove old label if exists
      if (algorithmLabelRef.current) {
        sceneRef.current.remove(algorithmLabelRef.current);
        if (algorithmLabelRef.current.material instanceof THREE.SpriteMaterial) {
          algorithmLabelRef.current.material.dispose();
        }
      }

      // Define algorithm descriptions
      const algorithmInfo: Record<string, { title: string; description: string }> = {
        'A*': {
          title: 'A* Algorithm',
          description:
            'Uses heuristic guidance to find shortest path faster.\nEstimates distance to goal and explores promising nodes first.',
        },
        Dijkstra: {
          title: "Dijkstra's Algorithm",
          description:
            'Explores all nodes systematically by distance.\nGuarantees shortest path without heuristic guidance.',
        },
      };

      const info = algorithmInfo[algorithmUsed];

      // Create new label
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 384;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Background box with purple gradient
        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(90, 45, 130, 0.95)');
        gradient.addColorStop(1, 'rgba(122, 77, 162, 0.85)');
        context.fillStyle = gradient;
        context.fillRect(40, 40, canvas.width - 80, canvas.height - 80);

        // Border
        context.strokeStyle = 'rgba(184, 200, 50, 0.6)';
        context.lineWidth = 6;
        context.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

        // Title
        context.fillStyle = '#b8c832';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.font = 'bold 56px Righteous, Anton, sans-serif';
        context.fillText(info.title, canvas.width / 2, 70);

        // Separator line
        context.strokeStyle = 'rgba(184, 200, 50, 0.4)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(100, 155);
        context.lineTo(canvas.width - 100, 155);
        context.stroke();

        // Description text
        const lines = info.description.split('\n');
        context.fillStyle = '#ffffff';
        context.textAlign = 'center';
        context.font = 'bold 32px Righteous, Anton, sans-serif';

        let yOffset = 190;
        lines.forEach((line) => {
          context.fillText(line, canvas.width / 2, yOffset);
          yOffset += 70;
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          opacity: 0.95,
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(160, 48, 1);
        sprite.position.set(0, 320, 0);
        sprite.userData = { isAlgorithmLabel: true };
        sceneRef.current.add(sprite);
        algorithmLabelRef.current = sprite;
      }
    } else if (!algorithmUsed && algorithmLabelRef.current && sceneRef.current) {
      // Remove label when algorithm is cleared
      sceneRef.current.remove(algorithmLabelRef.current);
      if (algorithmLabelRef.current.material instanceof THREE.SpriteMaterial) {
        algorithmLabelRef.current.material.dispose();
      }
      algorithmLabelRef.current = null;
    }
  }, [algorithmUsed]);

  useEffect(() => {
    const pathSet = new Set(path);
    const visitedSet = new Set(visited);
    const pathEdgeSet = new Set<string>();

    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i];
      const to = path[i + 1];
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      pathEdgeSet.add(key);
    }

    visualStateRef.current = {
      start,
      end,
      pathSet,
      visitedSet,
      pathEdgeSet,
    };

    nodeMeshesRef.current.forEach((mesh, nodeId) => {
      const isStart = start === nodeId;
      const isEnd = end === nodeId;
      const isOnPath = pathSet.has(nodeId);
      const isVisited = visitedSet.has(nodeId);
      const pathFound = pathSet.size > 0;

      let color = COLOR_NODE_DEFAULT;
      if (isStart) {
        color = COLOR_NODE_START;
      } else if (isEnd) {
        color = COLOR_NODE_END;
      } else if (isOnPath) {
        color = COLOR_NODE_PATH;
      } else if (isVisited) {
        color = COLOR_NODE_VISITED;
      }

      const material = mesh.material as THREE.MeshStandardMaterial;
      const isPrimaryHighlight = isStart || isEnd || isOnPath;
      material.color.setHex(color);
      material.emissive.setHex(isPrimaryHighlight ? color : isVisited ? 0x5a5a5a : 0x0f0f0f);
      material.emissiveIntensity = isPrimaryHighlight ? 0.42 : isVisited ? 0.24 : 0.09;

      // Hide nodes when path is found, only show start, end, and path nodes
      if (pathFound && !isStart && !isEnd && !isOnPath) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
      }
    });

    // Hide labels for non-path nodes when a path is found
    labelSpritesRef.current.forEach((label, nodeId) => {
      const isStart = start === nodeId;
      const isEnd = end === nodeId;
      const isOnPath = pathSet.has(nodeId);
      const pathFound = pathSet.size > 0;

      if (pathFound && !isStart && !isEnd && !isOnPath) {
        label.visible = false;
      } else {
        label.visible = true;
      }
    });

    roadLinesRef.current.forEach((roadLine) => {
      const { fromId, toId, line } = roadLine;
      const roadKey = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      const isPathRoad = pathEdgeSet.has(roadKey);
      const material = line.material as THREE.LineBasicMaterial;
      const geometry = line.geometry as THREE.BufferGeometry;
      const pointCount = geometry.getAttribute('position').count;
      const pathFound = pathSet.size > 0;

      material.color.setHex(isPathRoad ? COLOR_ROAD_PATH : COLOR_ROAD_DEFAULT);
      material.opacity = isPathRoad ? 1 : ROAD_OPACITY;
      material.linewidth = isPathRoad ? 20 : 8;

      // Hide roads that are not part of the path when a path is found
      if (pathFound && !isPathRoad) {
        line.visible = false;
      } else {
        line.visible = true;
      }

      if (isPathRoad) {
        if (!roadLine.isPathRoad) {
          roadLine.revealProgress = 0;
          geometry.setDrawRange(0, Math.min(2, pointCount));
        }
      } else {
        roadLine.revealProgress = 1;
        geometry.setDrawRange(0, pointCount);
      }

      roadLine.isPathRoad = isPathRoad;
    });
  }, [start, end, path, visited]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0d, 0.00055);
    sceneRef.current = scene;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(56, width / height, 1, 5000);
    camera.position.set(0, 220, 980);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.target.set(0, 0, 0);
    controls.minDistance = 500;
    controls.maxDistance = 1900;
    controls.minPolarAngle = 0.1;
    controls.maxPolarAngle = Math.PI - 0.1;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.76);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.28);
    keyLight.position.set(260, 520, 410);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbfcfff, 0.58);
    rimLight.position.set(-520, -180, -320);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xdde8ff, 0.42);
    fillLight.position.set(-220, 160, 540);
    scene.add(fillLight);

    const starCount = 2600;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = 1400 + Math.random() * 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      const base = i * 3;
      starPositions[base] = x;
      starPositions[base + 1] = y;
      starPositions[base + 2] = z;
    }

    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starsGeometry, starsMaterial));

    const roadsGroup = new THREE.Group();
    const nodesGroup = new THREE.Group();
    const labelsGroup = new THREE.Group();
    scene.add(roadsGroup);
    scene.add(nodesGroup);
    scene.add(labelsGroup);

    const createLabel = (text: string): THREE.Sprite | null => {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(5, 5, 5, 0.8)';
      context.fillRect(30, 38, 708, 84);
      context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      context.lineWidth = 3;
      context.strokeRect(30, 38, 708, 84);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '700 44px Righteous, Anton, sans-serif';
      context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });

      const sprite = new THREE.Sprite(material);
      const labelScaleX = 58 + Math.min(36, text.length * 0.85);
      const labelScaleY = 16;

      sprite.scale.set(labelScaleX, labelScaleY, 1);
      sprite.userData = {
        baseScaleX: labelScaleX,
        baseScaleY: labelScaleY,
      };

      return sprite;
    };

    nodePositionsRef.current.clear();
    mapNodes.forEach((node, index) => {
      nodePositionsRef.current.set(node.id, createSpherePosition(index, mapNodes.length));
    });

    roadLinesRef.current = [];
    roads.forEach((road) => {
      const fromPosition = nodePositionsRef.current.get(road.fromId);
      const toPosition = nodePositionsRef.current.get(road.toId);
      if (!fromPosition || !toPosition) {
        return;
      }

      const points = createArcPoints(fromPosition, toPosition);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const pointCount = geometry.getAttribute('position').count;
      geometry.setDrawRange(0, pointCount);
      const material = new THREE.LineBasicMaterial({
        color: COLOR_ROAD_DEFAULT,
        transparent: true,
        opacity: ROAD_OPACITY,
        depthTest: false,
        depthWrite: false,
        linewidth: 8,
      });

      const line = new THREE.Line(geometry, material);
      roadsGroup.add(line);
      roadLinesRef.current.push({
        fromId: road.fromId,
        toId: road.toId,
        line,
        isPathRoad: false,
        revealProgress: 1,
      });
    });

    nodeMeshesRef.current.clear();
    labelSpritesRef.current.clear();

    mapNodes.forEach((node, index) => {
      const position = nodePositionsRef.current.get(node.id);
      if (!position) {
        return;
      }

      const geometry = new THREE.SphereGeometry(7.6, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        color: COLOR_NODE_DEFAULT,
        emissive: 0x141414,
        emissiveIntensity: 0.09,
        roughness: 0.28,
        metalness: 0.24,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        nodeId: node.id,
        hovered: false,
        phase: index * 0.37,
      };
      nodesGroup.add(mesh);
      nodeMeshesRef.current.set(node.id, mesh);

      const label = createLabel(node.name);
      if (label) {
        label.position.copy(position.clone().multiplyScalar(LABEL_DISTANCE_FACTOR));
        labelsGroup.add(label);
        labelSpritesRef.current.set(node.id, label);
      }
    });

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickNode = () => {
      const nodeMeshes = Array.from(nodeMeshesRef.current.values());
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersections = raycasterRef.current.intersectObjects(nodeMeshes, false);

      if (intersections.length === 0) {
        return null;
      }

      return intersections[0].object as THREE.Mesh;
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointer(event);
      pointerInsideRef.current = true;
      const nextHovered = pickNode();

      if (hoveredNodeRef.current === nextHovered) {
        return;
      }

      if (hoveredNodeRef.current) {
        hoveredNodeRef.current.userData.hovered = false;
      }

      hoveredNodeRef.current = nextHovered;
      if (hoveredNodeRef.current) {
        hoveredNodeRef.current.userData.hovered = true;
      }

      renderer.domElement.style.cursor = nextHovered ? 'pointer' : 'grab';
    };

    const onPointerDown = (event: PointerEvent) => {
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      updatePointer(event);
      pointerInsideRef.current = true;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerUp = (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      dragStartRef.current = null;

      const dragDistance = dragStart
        ? Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y)
        : Number.POSITIVE_INFINITY;

      updatePointer(event);
      pointerInsideRef.current = true;

      if (dragDistance < 8) {
        const clickedNode = pickNode();
        const nodeId = clickedNode?.userData.nodeId;
        if (typeof nodeId === 'string') {
          onNodeClickRef.current(nodeId);
        }
      }

      renderer.domElement.style.cursor = hoveredNodeRef.current ? 'pointer' : 'grab';
    };

    const onPointerLeave = () => {
      dragStartRef.current = null;
      pointerInsideRef.current = false;
      pointerRef.current.set(2, 2);
      if (hoveredNodeRef.current) {
        hoveredNodeRef.current.userData.hovered = false;
      }

      hoveredNodeRef.current = null;
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth === 0 || nextHeight === 0) {
        return;
      }

      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
  const viewportSize = new THREE.Vector2();
  const projectedPosition = new THREE.Vector3();
    const animate = () => {
      const focusTransition = focusTransitionRef.current;
      if (focusTransition) {
        const elapsedMs = performance.now() - focusTransition.startTime;
        const normalizedProgress = Math.max(0, Math.min(1, elapsedMs / focusTransition.durationMs));
        const easedProgress = easeInOutQuint(normalizedProgress);

        camera.position.lerpVectors(
          focusTransition.fromCamera,
          focusTransition.toCamera,
          easedProgress
        );
        controls.target.lerpVectors(
          focusTransition.fromTarget,
          focusTransition.toTarget,
          easedProgress
        );

        if (normalizedProgress >= 1) {
          focusTransitionRef.current = null;
        }
      }

      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const currentState = visualStateRef.current;
      const hoveredNodeId = (hoveredNodeRef.current?.userData.nodeId as string | undefined) ?? null;
      const activeFocusedNodeId =
        performance.now() < focusedUntilRef.current ? focusedNodeIdRef.current : null;
      renderer.getSize(viewportSize);
      const pointerInside = pointerInsideRef.current;
      const pointerScreenX = (pointerRef.current.x * 0.5 + 0.5) * viewportSize.x;
      const pointerScreenY = (-pointerRef.current.y * 0.5 + 0.5) * viewportSize.y;
      const zoomDistance = camera.position.distanceTo(controls.target);
      const zoomRange = Math.max(1, controls.maxDistance - controls.minDistance);
      const zoomProgress = THREE.MathUtils.clamp(
        (controls.maxDistance - zoomDistance) / zoomRange,
        0,
        1
      );
      const labelProximityRadiusPx = THREE.MathUtils.lerp(
        LABEL_PROXIMITY_RADIUS_MIN_PX,
        LABEL_PROXIMITY_RADIUS_MAX_PX,
        zoomProgress
      );

      roadLinesRef.current.forEach((roadLine) => {
        if (!roadLine.isPathRoad) {
          return;
        }

        const geometry = roadLine.line.geometry as THREE.BufferGeometry;
        const pointCount = geometry.getAttribute('position').count;
        if (pointCount < 2) {
          return;
        }

        if (roadLine.revealProgress < 1) {
          roadLine.revealProgress = Math.min(1, roadLine.revealProgress + delta * PATH_EDGE_REVEAL_SPEED);
          const drawCount = Math.max(2, Math.floor(pointCount * roadLine.revealProgress));
          geometry.setDrawRange(0, drawCount);
        } else if (geometry.drawRange.count !== pointCount) {
          geometry.setDrawRange(0, pointCount);
        }
      });

      nodeMeshesRef.current.forEach((mesh, nodeId) => {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const isStartNode = currentState.start === nodeId;
        const isEndNode = currentState.end === nodeId;
        const isPathNode = currentState.pathSet.has(nodeId);
        const isVisitedNode = currentState.visitedSet.has(nodeId);
        const isImportant = isStartNode || isEndNode || isPathNode;
        const isHovered = hoveredNodeId === nodeId;
        const isFocused = activeFocusedNodeId === nodeId;
        const phase = typeof mesh.userData.phase === 'number' ? mesh.userData.phase : 0;

        const pathPulse = isImportant ? 1 + Math.sin(elapsed * 2.8 + phase) * 0.08 : 1;
        const hoverPulse = isHovered ? 1 + Math.sin(elapsed * 8.4 + phase) * 0.07 : 1;
        const focusPulse = isFocused ? 1.32 + Math.sin(elapsed * 6.4 + phase) * 0.08 : 1;
        const targetScale = pathPulse * (isHovered ? 1.5 * hoverPulse : 1) * focusPulse;

        mesh.scale.x = THREE.MathUtils.lerp(mesh.scale.x, targetScale, 0.22);
        mesh.scale.y = THREE.MathUtils.lerp(mesh.scale.y, targetScale, 0.22);
        mesh.scale.z = THREE.MathUtils.lerp(mesh.scale.z, targetScale, 0.22);

        if (isImportant) {
          material.emissiveIntensity = 0.3 + (Math.sin(elapsed * 3.8 + phase) + 1) * 0.1;
        } else if (isFocused) {
          material.emissiveIntensity = 0.36;
        } else if (isVisitedNode) {
          material.emissiveIntensity = isHovered ? 0.3 : 0.18;
        } else {
          material.emissiveIntensity = isHovered ? 0.12 : 0.05;
        }

        const label = labelSpritesRef.current.get(nodeId);
        if (label) {
          const labelMaterial = label.material as THREE.SpriteMaterial;
          const baseScaleX =
            typeof label.userData.baseScaleX === 'number' ? label.userData.baseScaleX : 64;
          const baseScaleY =
            typeof label.userData.baseScaleY === 'number' ? label.userData.baseScaleY : 16;

          const staticPosition = nodePositionsRef.current.get(nodeId);
          let isWithinPointerRadius = false;
          if (staticPosition && pointerInside && viewportSize.x > 0 && viewportSize.y > 0) {
            projectedPosition.copy(staticPosition).project(camera);

            if (projectedPosition.z >= -1 && projectedPosition.z <= 1) {
              const nodeScreenX = (projectedPosition.x * 0.5 + 0.5) * viewportSize.x;
              const nodeScreenY = (-projectedPosition.y * 0.5 + 0.5) * viewportSize.y;
              const pointerDistance = Math.hypot(nodeScreenX - pointerScreenX, nodeScreenY - pointerScreenY);
              isWithinPointerRadius = pointerDistance <= labelProximityRadiusPx;
            }
          }

          const isLabelVisible = isHovered || isWithinPointerRadius;
          const labelPulse = isHovered
            ? 1.6 + Math.sin(elapsed * 7.2 + phase) * 0.07
            : isLabelVisible
              ? 1.08 + Math.sin(elapsed * 4 + phase) * 0.03
              : 1;
          const targetScaleX = baseScaleX * labelPulse;
          const targetScaleY = baseScaleY * labelPulse;

          label.scale.x = THREE.MathUtils.lerp(label.scale.x, targetScaleX, 0.2);
          label.scale.y = THREE.MathUtils.lerp(label.scale.y, targetScaleY, 0.2);
          const targetLabelOpacity = isLabelVisible ? (isHovered ? 1 : 0.94) : 0;
          labelMaterial.opacity = THREE.MathUtils.lerp(labelMaterial.opacity, targetLabelOpacity, 0.22);

          if (staticPosition) {
            const distanceFactor = isHovered
              ? LABEL_DISTANCE_FACTOR + 0.045
              : isLabelVisible
                ? LABEL_DISTANCE_FACTOR + 0.02
                : LABEL_DISTANCE_FACTOR;
            label.position.copy(staticPosition.clone().multiplyScalar(distanceFactor));
          }
        }
      });

      controls.update();

      if (onViewRotationChangeRef.current) {
        onViewRotationChangeRef.current(
          controls.getAzimuthalAngle(),
          controls.getPolarAngle()
        );
      }

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      resizeObserver.disconnect();
      controls.dispose();

      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);

      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Sprite ||
          object instanceof THREE.Points
        ) {
          if ('geometry' in object && object.geometry) {
            object.geometry.dispose();
          }

          if ('material' in object && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              const texturedMaterial = material as THREE.Material & {
                map?: THREE.Texture;
                alphaMap?: THREE.Texture;
              };

              if (texturedMaterial.map) {
                texturedMaterial.map.dispose();
              }
              if (texturedMaterial.alphaMap) {
                texturedMaterial.alphaMap.dispose();
              }

              material.dispose();
            });
          }
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      hoveredNodeRef.current = null;
      pointerInsideRef.current = false;
      focusedNodeIdRef.current = null;
      focusedUntilRef.current = 0;
      focusTransitionRef.current = null;
      nodeMeshesRef.current.clear();
      labelSpritesRef.current.clear();
      nodePositionsRef.current.clear();
      roadLinesRef.current = [];
      algorithmLabelRef.current = null;

      controlsRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map3d-container" />;
};
