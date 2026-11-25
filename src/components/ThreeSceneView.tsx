import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

type ScenePreset = 'hero' | 'closeup' | 'top';
type SceneMood = 'cyan' | 'gold' | 'violet';

const MOOD_CONFIG: Record<
  SceneMood,
  { bg: number; fog: number; core: number; accent: number; key: number }
> = {
  cyan: { bg: 0x070b14, fog: 0x070b14, core: 0x38bdf8, accent: 0xf472b6, key: 0xfff2e0 },
  gold: { bg: 0x100b08, fog: 0x100b08, core: 0xfbbf24, accent: 0xfb7185, key: 0xffe4b5 },
  violet: { bg: 0x0a0714, fog: 0x0a0714, core: 0xa78bfa, accent: 0x2dd4bf, key: 0xf5e6ff },
};

function createProceduralGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d1320';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(120, 170, 240, 0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const ThreeSceneView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [mood, setMood] = useState<SceneMood>('cyan');
  const [preset, setPreset] = useState<ScenePreset>('hero');
  const [dockOpen, setDockOpen] = useState<boolean>(true);

  const controlsStateRef = useRef({
    speed: 1,
    autoOrbit: true,
    mood: 'cyan' as SceneMood,
    presetRequest: null as ScenePreset | null,
  });

  useEffect(() => {
    controlsStateRef.current.speed = speed;
  }, [speed]);

  useEffect(() => {
    controlsStateRef.current.autoOrbit = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    controlsStateRef.current.mood = mood;
  }, [mood]);

  const applyPreset = (p: ScenePreset) => {
    setPreset(p);
    controlsStateRef.current.presetRequest = p;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight - 56;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_DEBUG_RENDERER_INFO');
    const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererName);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initMood = MOOD_CONFIG[controlsStateRef.current.mood];
    scene.background = new THREE.Color(initMood.bg);
    scene.fog = new THREE.FogExp2(initMood.fog, 0.025);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 120);
    camera.position.set(7.5, 5.2, 9.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.8, 0);

    // Lighting: Warm Key + Cool Hemisphere + Core Point Light
    const hemiLight = new THREE.HemisphereLight(0x88b4ff, 0x1a1528, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(initMood.key, 2.2);
    keyLight.position.set(8, 13, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const coreLight = new THREE.PointLight(initMood.core, 3.0, 18, 1.5);
    coreLight.position.set(0, 2.5, 0);
    scene.add(coreLight);

    // Materials
    const gridTex = createProceduralGridTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.78,
      metalness: 0.18,
    });
    const alloyMat = new THREE.MeshStandardMaterial({
      color: 0x262e3d,
      roughness: 0.34,
      metalness: 0.85,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xc8d4e8,
      roughness: 0.22,
      metalness: 0.92,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: initMood.core,
      emissive: initMood.core,
      emissiveIntensity: 1.3,
      roughness: 0.15,
      metalness: 0.2,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: initMood.accent,
      emissive: initMood.accent,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.65,
    });

    // Grounded Observatory Floor & Monolith Ring
    const floorMesh = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.4, 48), floorMat);
    floorMesh.position.y = -0.2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const daisRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.1, 14, 64), trimMat);
    daisRing.rotation.x = Math.PI / 2;
    daisRing.position.y = 0.06;
    scene.add(daisRing);

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const pillarGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), alloyMat);
      base.position.y = 0.15;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.2, 0.42), alloyMat);
      shaft.position.y = 1.4;
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), accentMat);
      beacon.position.y = 2.55;
      pillarGroup.add(base, shaft, beacon);
      pillarGroup.position.set(Math.cos(ang) * 7.2, 0, Math.sin(ang) * 7.2);
      pillarGroup.lookAt(0, 0, 0);
      pillarGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      scene.add(pillarGroup);
    }

    // Composite 10-Part Resonance Core Tower
    const coreTower = new THREE.Group();
    const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 0.45, 24), alloyMat);
    basePlinth.position.y = 0.225;
    const upperPlinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.35, 24), trimMat);
    upperPlinth.position.y = 0.62;
    const neckCol = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.9, 16), alloyMat);
    neckCol.position.y = 1.2;

    const crystalCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), crystalMat);
    crystalCore.position.y = 2.55;

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 16, 48), trimMat);
    innerRing.position.y = 2.55;
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.08, 16, 56), accentMat);
    outerRing.position.y = 2.55;

    coreTower.add(basePlinth, upperPlinth, neckCol, crystalCore, innerRing, outerRing);

    // 4 Pylon Wings around the core
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.2, 10), trimMat);
      pylon.position.set(Math.cos(ang) * 1.45, 1.85, Math.sin(ang) * 1.45);
      pylon.rotation.z = -Math.cos(ang) * 0.18;
      pylon.rotation.x = Math.sin(ang) * 0.18;
      coreTower.add(pylon);
    }

    coreTower.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    scene.add(coreTower);

    // 3 Composite 5-Part Orbiting Satellites
    const satellites: Array<{ group: THREE.Group; radius: number; speed: number; yOffset: number; phase: number }> = [];
    for (let s = 0; s < 3; s++) {
      const sat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), trimMat);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.28), crystalMat);
      wingL.position.x = -0.65;
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.28), crystalMat);
      wingR.position.x = 0.65;
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 12), accentMat);
      dish.rotation.x = Math.PI / 2;
      dish.position.z = 0.34;
      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.2, 10), alloyMat);
      thruster.rotation.x = Math.PI / 2;
      thruster.position.z = -0.32;
      sat.add(hull, wingL, wingR, dish, thruster);
      sat.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
      });
      scene.add(sat);
      satellites.push({
        group: sat,
        radius: 3.1 + s * 1.05,
        speed: 0.55 - s * 0.12,
        yOffset: 2.3 + s * 0.55,
        phase: (s * Math.PI * 2) / 3,
      });
    }

    // Floating Ambient Particle Field
    const particleCount = isSoftwareGl ? 120 : 280;
    const pPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 24;
      pPositions[i * 3 + 1] = 0.4 + Math.random() * 8;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: initMood.core,
      size: 0.07,
      transparent: true,
      opacity: 0.7,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight - 56;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let elapsed = 0;
    let rafId = 0;
    let disposed = false;

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const st = controlsStateRef.current;
      elapsed += dt * st.speed;

      // Sync mood palette smoothly
      const targetMood = MOOD_CONFIG[st.mood];
      (scene.background as THREE.Color).setHex(targetMood.bg);
      if (scene.fog instanceof THREE.FogExp2) scene.fog.color.setHex(targetMood.fog);
      crystalMat.color.setHex(targetMood.core);
      crystalMat.emissive.setHex(targetMood.core);
      accentMat.color.setHex(targetMood.accent);
      accentMat.emissive.setHex(targetMood.accent);
      coreLight.color.setHex(targetMood.core);
      particleMat.color.setHex(targetMood.core);

      // Camera preset transition
      if (st.presetRequest) {
        if (st.presetRequest === 'hero') {
          camera.position.set(7.5, 5.2, 9.5);
          controls.target.set(0, 1.8, 0);
        } else if (st.presetRequest === 'closeup') {
          camera.position.set(3.2, 2.9, 3.8);
          controls.target.set(0, 2.4, 0);
        } else if (st.presetRequest === 'top') {
          camera.position.set(0.1, 13.5, 5.5);
          controls.target.set(0, 1.2, 0);
        }
        st.presetRequest = null;
      }

      // Animate core & rings
      crystalCore.rotation.y = elapsed * 0.9;
      crystalCore.rotation.x = Math.sin(elapsed * 0.6) * 0.35;
      crystalCore.position.y = 2.55 + Math.sin(elapsed * 1.8) * 0.14;
      coreLight.intensity = 2.6 + Math.sin(elapsed * 2.5) * 0.6;

      innerRing.rotation.x = elapsed * 0.7;
      innerRing.rotation.y = elapsed * 0.5;
      outerRing.rotation.x = -elapsed * 0.45;
      outerRing.rotation.z = elapsed * 0.6;

      for (const sat of satellites) {
        const a = elapsed * sat.speed + sat.phase;
        sat.group.position.set(
          Math.cos(a) * sat.radius,
          sat.yOffset + Math.sin(elapsed * 1.5 + sat.phase) * 0.28,
          Math.sin(a) * sat.radius
        );
        sat.group.lookAt(0, 2.55, 0);
      }

      particles.rotation.y = elapsed * 0.04;

      controls.autoRotate = st.autoOrbit;
      controls.autoRotateSpeed = 0.8 * st.speed;
      controls.update();

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      envRT.dispose();
      pmrem.dispose();
      gridTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[calc(100dvh-56px)] bg-[#070b14] overflow-hidden select-none">
      {/* Stable WebGL Mount Outside React HUD */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Minimal Top-Left Title Plate (No backdrop-filter over WebGL) */}
      <div className="absolute top-4 left-4 z-10 px-3.5 py-2 rounded-xl bg-[#0c1017]/95 border border-white/15 pointer-events-none">
        <div className="text-xs font-semibold text-white">Tojuu Resonance Observatory</div>
        <div className="text-[11px] text-zinc-400">Drag to orbit • Scroll to zoom</div>
      </div>

      {/* Collapsible Bottom Control Dock (<= 15% viewport, solid dark surface) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[94%] max-w-2xl rounded-2xl bg-[#0c1017]/95 border border-white/15 shadow-2xl">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scene Controls</span>
          </div>
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <span>{dockOpen ? 'Collapse' : 'Expand'}</span>
            {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {dockOpen && (
          <div className="px-4 pb-3 pt-1 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-xs">
            {/* Camera Presets */}
            <div className="flex items-center gap-1.5">
              {(['hero', 'closeup', 'top'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`px-2.5 py-1.5 rounded-lg border capitalize cursor-pointer ${
                    preset === p
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {p === 'closeup' ? 'Core' : p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPreset('hero')}
                title="Reset Camera"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mood Selector */}
            <div className="flex items-center gap-1.5 justify-start sm:justify-center">
              {(['cyan', 'gold', 'violet'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  className={`px-2.5 py-1.5 rounded-lg border capitalize cursor-pointer ${
                    mood === m
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Speed & Auto-Orbit */}
            <div className="flex items-center gap-2.5 justify-between sm:justify-end">
              <label className="flex items-center gap-1.5 text-zinc-300">
                <span>{speed.toFixed(1)}x</span>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-20 accent-cyan-400"
                />
              </label>
              <button
                type="button"
                onClick={() => setAutoOrbit((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                  autoOrbit
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-zinc-400'
                }`}
              >
                Orbit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
