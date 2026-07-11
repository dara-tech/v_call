import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { easeInOutCubic, getCentroid, latLngToVector3 } from '@/lib/tvgarden/geo';
import { countryFillColor } from '@/lib/tvgarden/countryGeo';

const EARTH_TEXTURE =
  'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-dark.jpg';
const BUMP_TEXTURE =
  'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-topology.png';

const GLOBE_RADIUS = 1;
const DOT_SURFACE = GLOBE_RADIUS + 0.018;

const DEFAULT_CAMERA_Z = 2.75;
const ZOOM_CAMERA_Z = 1.62;
const MIN_CAMERA_Z = 1.45;
const MAX_CAMERA_Z = 3.4;
const FLY_DURATION_MS = 1200;
const OVERVIEW_DURATION_MS = 900;
const DRAG_SENSITIVITY = 0.004;
const CLICK_THRESHOLD_PX = 10;
const SPIN_DAMPING = 0.92;
const ZOOM_LERP = 0.14;

interface GlobeMarker {
  code: string;
  name: string;
  flag: string;
  channelCount: number;
}

interface GlobeSceneProps {
  markers: GlobeMarker[];
  selectedCode: string | null;
  onSelectCountry: (code: string) => void;
}

interface FlyAnimation {
  startTime: number;
  duration: number;
  fromQuat: THREE.Quaternion;
  toQuat: THREE.Quaternion;
  fromZoom: number;
  toZoom: number;
}

const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);
const _spinQuat = new THREE.Quaternion();
const _localPoint = new THREE.Vector3();
const _cameraFront = new THREE.Vector3(0, 0, 1);

function clampZoom(z: number) {
  return Math.max(MIN_CAMERA_Z, Math.min(MAX_CAMERA_Z, z));
}

function flyQuaternion(lat: number, lng: number, current: THREE.Quaternion): THREE.Quaternion {
  const { x, y, z } = latLngToVector3(lat, lng, 1);
  _localPoint.set(x, y, z).normalize();
  const goal = new THREE.Quaternion().setFromUnitVectors(_localPoint, _cameraFront);
  if (current.dot(goal) < 0) {
    goal.set(-goal.x, -goal.y, -goal.z, -goal.w);
  }
  return goal;
}

function dotRadius(channelCount: number, selected: boolean) {
  const base = 0.014 + Math.log10(channelCount + 1) * 0.007;
  return selected ? base * 1.55 : base;
}

function buildDotMeshes(markers: GlobeMarker[], selectedCode: string | null, dotGeo: THREE.SphereGeometry) {
  const meshes: THREE.Mesh[] = [];

  for (const m of markers) {
    const selected = m.code === selectedCode;
    const [lat, lng] = getCentroid(m.code);
    const pos = latLngToVector3(lat, lng, DOT_SURFACE);
    const r = dotRadius(m.channelCount, selected);

    const mesh = new THREE.Mesh(
      dotGeo,
      new THREE.MeshBasicMaterial({
        color: selected ? 0x22d3ee : countryFillColor(m.code, false, true),
        transparent: true,
        opacity: selected ? 1 : 0.92,
        depthWrite: true,
      }),
    );
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(r);
    mesh.userData.code = m.code;
    mesh.renderOrder = selected ? 2 : 1;
    meshes.push(mesh);
  }

  return meshes;
}

export function GlobeScene({ markers, selectedCode, onSelectCountry }: GlobeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectCountry);
  onSelectRef.current = onSelectCountry;

  const sceneRef = useRef<{
    earthGroup: THREE.Group;
    markerGroup: THREE.Group;
    dotMeshes: THREE.Mesh[];
    dotGeo: THREE.SphereGeometry;
    pickables: THREE.Object3D[];
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    autoRotate: boolean;
    dragging: boolean;
    flyAnim: FlyAnimation | null;
    zoomTarget: number;
    spinVelX: number;
    spinVelY: number;
    frameId: number;
    lastFrame: number;
  } | null>(null);

  const markersRef = useRef(markers);
  const selectedRef = useRef(selectedCode);
  markersRef.current = markers;
  selectedRef.current = selectedCode;

  function rebuildDots() {
    const s = sceneRef.current;
    if (!s) return;

    for (const mesh of s.dotMeshes) {
      (mesh.material as THREE.Material).dispose();
    }
    while (s.markerGroup.children.length) s.markerGroup.remove(s.markerGroup.children[0]);

    s.dotMeshes = buildDotMeshes(markersRef.current, selectedRef.current, s.dotGeo);
    s.pickables = s.dotMeshes;
    for (const mesh of s.dotMeshes) s.markerGroup.add(mesh);
  }

  function startFlyTo(code: string | null) {
    const s = sceneRef.current;
    if (!s) return;

    s.autoRotate = !code;
    s.spinVelX = 0;
    s.spinVelY = 0;

    if (!code) {
      s.flyAnim = {
        startTime: performance.now(),
        duration: OVERVIEW_DURATION_MS,
        fromQuat: s.earthGroup.quaternion.clone(),
        toQuat: s.earthGroup.quaternion.clone(),
        fromZoom: s.camera.position.z,
        toZoom: DEFAULT_CAMERA_Z,
      };
      s.zoomTarget = DEFAULT_CAMERA_Z;
      return;
    }

    const [lat, lng] = getCentroid(code);
    const fromQuat = s.earthGroup.quaternion.clone();
    s.flyAnim = {
      startTime: performance.now(),
      duration: FLY_DURATION_MS,
      fromQuat,
      toQuat: flyQuaternion(lat, lng, fromQuat),
      fromZoom: s.camera.position.z,
      toZoom: ZOOM_CAMERA_Z,
    };
    s.zoomTarget = ZOOM_CAMERA_Z;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, DEFAULT_CAMERA_Z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x8899bb, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(4, 2, 6);
    scene.add(sun);

    const loader = new THREE.TextureLoader();
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    earthGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72),
        new THREE.MeshPhongMaterial({
          map: loader.load(EARTH_TEXTURE),
          bumpMap: loader.load(BUMP_TEXTURE),
          bumpScale: 0.025,
          specular: new THREE.Color(0x111122),
          shininess: 5,
        }),
      ),
    );
    earthGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS + 0.012, 72, 72),
        new THREE.MeshBasicMaterial({
          color: 0x2266aa,
          transparent: true,
          opacity: 0.1,
          side: THREE.BackSide,
        }),
      ),
    );

    const markerGroup = new THREE.Group();
    earthGroup.add(markerGroup);
    const dotGeo = new THREE.SphereGeometry(1, 12, 12);

    const starPositions = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const r = 20 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.6 }),
      ),
    );

    const state = {
      earthGroup,
      markerGroup,
      dotMeshes: [] as THREE.Mesh[],
      dotGeo,
      pickables: [] as THREE.Object3D[],
      renderer,
      camera,
      autoRotate: true,
      dragging: false,
      flyAnim: null as FlyAnimation | null,
      zoomTarget: DEFAULT_CAMERA_Z,
      spinVelX: 0,
      spinVelY: 0,
      frameId: 0,
      lastFrame: performance.now(),
    };
    sceneRef.current = state;

    rebuildDots();
    if (selectedRef.current) startFlyTo(selectedRef.current);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let pointerDown = false;
    let activePointerId: number | null = null;

    function onPointerDown(e: PointerEvent) {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      pointerDown = true;
      state.dragging = false;
      state.flyAnim = null;
      state.spinVelX = 0;
      state.spinVelY = 0;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      pointerDown = false;

      const totalMoved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
      const wasDrag = state.dragging || totalMoved >= CLICK_THRESHOLD_PX;
      state.dragging = false;

      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }

      if (!wasDrag) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(state.pickables);
        if (hits[0]?.object?.userData?.code) {
          onSelectRef.current(hits[0].object.userData.code as string);
        }
      } else if (Math.abs(state.spinVelX) + Math.abs(state.spinVelY) <= 0.0005) {
        window.setTimeout(() => {
          if (!selectedRef.current && !pointerDown) state.autoRotate = true;
        }, 3000);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== activePointerId || !pointerDown) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 1) state.dragging = true;

      lastX = e.clientX;
      lastY = e.clientY;
      state.autoRotate = false;
      state.flyAnim = null;

      earthGroup.rotateOnWorldAxis(_axisY, -dx * DRAG_SENSITIVITY);
      earthGroup.rotateOnWorldAxis(_axisX, -dy * DRAG_SENSITIVITY);
      state.spinVelX = -dy * DRAG_SENSITIVITY * 0.85;
      state.spinVelY = -dx * DRAG_SENSITIVITY * 0.85;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      state.flyAnim = null;
      state.autoRotate = false;
      state.zoomTarget = clampZoom(state.zoomTarget + e.deltaY * 0.0012 * state.zoomTarget);
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    function animate(now: number) {
      state.frameId = requestAnimationFrame(animate);
      const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
      state.lastFrame = now;

      if (state.flyAnim && !state.dragging && !pointerDown) {
        const { startTime, duration, fromQuat, toQuat, fromZoom, toZoom } = state.flyAnim;
        const raw = Math.min(1, (now - startTime) / duration);
        const t = easeInOutCubic(raw);
        earthGroup.quaternion.slerpQuaternions(fromQuat, toQuat, t);
        camera.position.z = THREE.MathUtils.lerp(fromZoom, toZoom, t);
        state.zoomTarget = toZoom;
        if (raw >= 1) state.flyAnim = null;
      } else if (!state.dragging && !pointerDown) {
        if (Math.abs(state.spinVelX) + Math.abs(state.spinVelY) > 0.00005) {
          earthGroup.rotateOnWorldAxis(_axisY, state.spinVelY);
          earthGroup.rotateOnWorldAxis(_axisX, state.spinVelX);
          state.spinVelX *= SPIN_DAMPING;
          state.spinVelY *= SPIN_DAMPING;
        } else if (state.autoRotate && !selectedRef.current) {
          _spinQuat.setFromAxisAngle(_axisY, 0.12 * dt);
          earthGroup.quaternion.premultiply(_spinQuat);
          earthGroup.quaternion.normalize();
        }

        const zoomDiff = state.zoomTarget - camera.position.z;
        if (Math.abs(zoomDiff) > 0.0005) {
          camera.position.z += zoomDiff * ZOOM_LERP;
        }
      }

      renderer.render(scene, camera);
    }
    animate(performance.now());

    const ro = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(state.frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      for (const mesh of state.dotMeshes) {
        (mesh.material as THREE.Material).dispose();
      }
      dotGeo.dispose();
      sceneRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    rebuildDots();
    startFlyTo(selectedCode);
  }, [selectedCode]);

  useEffect(() => {
    rebuildDots();
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[200px] w-full touch-none cursor-grab active:cursor-grabbing"
    />
  );
}
