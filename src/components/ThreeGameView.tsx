import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Trophy, Shield, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { syncCreationToFirestore } from '../lib/firebase';

type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playTone(freq: number, endFreq: number, dur: number, type: OscillatorType = 'triangle', gainVal = 0.12) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), ctx.currentTime + dur);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  public shoot() {
    this.playTone(680, 220, 0.11, 'sawtooth', 0.08);
  }
  public collect() {
    this.playTone(540, 1080, 0.16, 'sine', 0.12);
  }
  public explode() {
    this.playTone(190, 48, 0.24, 'square', 0.14);
  }
  public hit() {
    this.playTone(140, 52, 0.3, 'sawtooth', 0.18);
  }
}

export const ThreeGameView: React.FC = () => {
  const { user, getIdToken, gameScores, refreshSqlWorkspace } = useAuth();
  const mountRef = useRef<HTMLDivElement>(null);
  const sfxRef = useRef<SoundEngine>(new SoundEngine());

  const [phase, setPhase] = useState<GamePhase>('title');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [shields, setShields] = useState(3);
  const [orbsCollected, setOrbsCollected] = useState(0);
  const [muted, setMuted] = useState(false);

  const gameCtrlRef = useRef({
    phase: 'title' as GamePhase,
    resetRequested: false,
    keys: new Set<string>(),
    fireQueued: false,
  });

  const bestScore = Math.max(
    score,
    ...(gameScores.length > 0 ? gameScores.map((s) => s.score) : [0])
  );

  const persistScore = useCallback(
    async (finalScore: number, finalWave: number, finalOrbs: number) => {
      if (!user || finalScore <= 0) return;
      try {
        const token = await getIdToken();
        if (!token) return;
        await fetch('/api/sql/game-scores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            score: finalScore,
            wave: finalWave,
            orbsCollected: finalOrbs,
          }),
        });
        await syncCreationToFirestore({
          uid: user.uid,
          creationId: `score_${Date.now()}`,
          kind: 'game_score',
          title: `Aegis Orbit Run: ${finalScore} pts`,
          summary: `Wave ${finalWave} • ${finalOrbs} Resonance Crystals collected`,
          model: 'aegis-orbit-3d',
        }).catch(console.error);
        await refreshSqlWorkspace();
      } catch (err) {
        console.error('[Game score persist error]:', err);
      }
    },
    [user, getIdToken, refreshSqlWorkspace]
  );

  const startGame = () => {
    setScore(0);
    setWave(1);
    setShields(3);
    setOrbsCollected(0);
    gameCtrlRef.current.resetRequested = true;
    gameCtrlRef.current.phase = 'playing';
    setPhase('playing');
    sfxRef.current.collect();
  };

  const togglePause = () => {
    if (gameCtrlRef.current.phase === 'playing') {
      gameCtrlRef.current.phase = 'paused';
      setPhase('paused');
    } else if (gameCtrlRef.current.phase === 'paused') {
      gameCtrlRef.current.phase = 'playing';
      setPhase('playing');
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sfxRef.current.muted = next;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (gameCtrlRef.current.phase === 'playing') {
          gameCtrlRef.current.phase = 'paused';
          setPhase('paused');
        } else if (gameCtrlRef.current.phase === 'paused') {
          gameCtrlRef.current.phase = 'playing';
          setPhase('playing');
        }
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && gameCtrlRef.current.phase === 'playing') {
          gameCtrlRef.current.fireQueued = true;
        }
      }
      gameCtrlRef.current.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      gameCtrlRef.current.keys.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
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
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.022);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(56, width / height, 0.1, 120);
    const baseCamPos = new THREE.Vector3(0, 5.2, 10.2);
    camera.position.copy(baseCamPos);
    camera.lookAt(0, 0.6, -6);

    const hemi = new THREE.HemisphereLight(0x7cb8ff, 0x181326, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(7, 14, 8);
    key.castShadow = !isSoftwareGl;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    // Orbital Track & Side Rails
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75, metalness: 0.25 });
    const track = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 90), trackMat);
    track.position.set(0, -0.35, -32);
    track.receiveShadow = true;
    scene.add(track);

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.8,
    });
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 90), railMat);
    railL.position.set(-7.6, -0.1, -32);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 90), railMat);
    railR.position.set(7.6, -0.1, -32);
    scene.add(railL, railR);

    // Moving lane chevron markers for speed perception
    const laneStrips: THREE.Mesh[] = [];
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.25,
      roughness: 0.5,
    });
    for (let i = 0; i < 14; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 2.2), stripMat);
      strip.position.set(0, -0.18, -i * 6);
      scene.add(strip);
      laneStrips.push(strip);
    }

    // 6-Part Composite Player Craft
    const playerGroup = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.85 });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.7,
      roughness: 0.1,
      metalness: 0.3,
    });
    const thrusterMat = new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      emissive: 0xec4899,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.9, 8), hullMat);
    fuselage.rotation.x = -Math.PI / 2;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.7), canopyMat);
    canopy.position.set(0, 0.22, -0.1);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.65), hullMat);
    wingL.position.set(-0.72, -0.04, 0.28);
    wingL.rotation.y = 0.25;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.65), hullMat);
    wingR.position.set(0.72, -0.04, 0.28);
    wingR.rotation.y = -0.25;
    const engineL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), thrusterMat);
    engineL.rotation.x = Math.PI / 2;
    engineL.position.set(-0.42, 0, 0.8);
    const engineR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), thrusterMat);
    engineR.rotation.x = Math.PI / 2;
    engineR.position.set(0.42, 0, 0.8);

    playerGroup.add(fuselage, canopy, wingL, wingR, engineL, engineR);
    playerGroup.position.set(0, 0.65, 3.6);
    playerGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    scene.add(playerGroup);

    // Dynamic entity pools
    interface Bolt {
      mesh: THREE.Group;
      z: number;
      x: number;
    }
    interface Hazard {
      mesh: THREE.Group;
      x: number;
      z: number;
      speed: number;
      swayPhase: number;
      hp: number;
      flashTimer: number;
      bodyMat: THREE.MeshStandardMaterial;
    }
    interface Orb {
      mesh: THREE.Group;
      x: number;
      z: number;
      phase: number;
    }
    interface Burst {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      life: number;
    }

    const bolts: Bolt[] = [];
    const hazards: Hazard[] = [];
    const orbs: Orb[] = [];
    const bursts: Burst[] = [];

    const spawnBolt = (x: number, z: number) => {
      const g = new THREE.Group();
      const bMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.0,
      });
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.75), bMat);
      left.position.x = -0.35;
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.75), bMat);
      right.position.x = 0.35;
      g.add(left, right);
      g.position.set(x, 0.65, z - 0.8);
      scene.add(g);
      bolts.push({ mesh: g, x, z: z - 0.8 });
    };

    const spawnHazard = (waveNum: number) => {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0x991b1b,
        emissiveIntensity: 0.75,
        roughness: 0.3,
        metalness: 0.7,
      });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 });
      const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), bodyMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 10, 24), darkMat);
      const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.25), darkMat);
      bladeL.position.x = -0.78;
      const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.25), darkMat);
      bladeR.position.x = 0.78;
      g.add(core, ring, bladeL, bladeR);
      const x = (Math.random() - 0.5) * 12;
      const z = -54;
      g.position.set(x, 0.75, z);
      scene.add(g);
      hazards.push({
        mesh: g,
        x,
        z,
        speed: 12 + waveNum * 2.1 + Math.random() * 3,
        swayPhase: Math.random() * Math.PI * 2,
        hp: waveNum >= 4 ? 2 : 1,
        flashTimer: 0,
        bodyMat,
      });
    };

    const spawnOrb = () => {
      const g = new THREE.Group();
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.4,
      });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), orbMat);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 24), orbMat);
      halo.rotation.x = Math.PI / 2;
      g.add(gem, halo);
      const x = (Math.random() - 0.5) * 11.5;
      const z = -52;
      g.position.set(x, 0.75, z);
      scene.add(g);
      orbs.push({ mesh: g, x, z, phase: Math.random() * Math.PI * 2 });
    };

    const spawnBurst = (pos: THREE.Vector3, colorHex: number) => {
      const count = isSoftwareGl ? 6 : 12;
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.14, 0.14),
          new THREE.MeshBasicMaterial({ color: colorHex })
        );
        m.position.copy(pos);
        scene.add(m);
        bursts.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 9,
            1.5 + Math.random() * 5,
            (Math.random() - 0.5) * 9
          ),
          life: 0.45,
        });
      }
    };

    let runScore = 0;
    let runWave = 1;
    let runShields = 3;
    let runOrbs = 0;
    let hazardTimer = 0;
    let orbTimer = 0;
    let shakeTimer = 0;
    let fireCooldown = 0;
    let invulnTimer = 0;

    const clearEntities = () => {
      bolts.forEach((b) => scene.remove(b.mesh));
      hazards.forEach((h) => scene.remove(h.mesh));
      orbs.forEach((o) => scene.remove(o.mesh));
      bursts.forEach((p) => scene.remove(p.mesh));
      bolts.length = 0;
      hazards.length = 0;
      orbs.length = 0;
      bursts.length = 0;
      playerGroup.position.set(0, 0.65, 3.6);
      playerGroup.rotation.set(0, 0, 0);
      runScore = 0;
      runWave = 1;
      runShields = 3;
      runOrbs = 0;
      hazardTimer = 0.4;
      orbTimer = 0.2;
      shakeTimer = 0;
      invulnTimer = 0;
    };

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
    let rafId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const dt = Math.min(clock.getDelta(), 0.05);
      const ctrl = gameCtrlRef.current;

      if (ctrl.resetRequested) {
        clearEntities();
        ctrl.resetRequested = false;
      }

      if (ctrl.phase === 'title') {
        playerGroup.position.y = 0.65 + Math.sin(clock.elapsedTime * 2) * 0.1;
        playerGroup.rotation.z = Math.sin(clock.elapsedTime * 1.2) * 0.14;
        renderer.render(scene, camera);
        return;
      }

      if (ctrl.phase === 'paused' || ctrl.phase === 'gameover') {
        renderer.render(scene, camera);
        return;
      }

      // Active gameplay updates
      const keys = ctrl.keys;
      const moveX =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const moveZ =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);

      playerGroup.position.x = THREE.MathUtils.clamp(playerGroup.position.x + moveX * 9.5 * dt, -6.1, 6.1);
      playerGroup.position.z = THREE.MathUtils.clamp(playerGroup.position.z + moveZ * 7.0 * dt, -2.5, 5.2);
      playerGroup.rotation.z = THREE.MathUtils.lerp(playerGroup.rotation.z, -moveX * 0.38, 10 * dt);

      fireCooldown = Math.max(0, fireCooldown - dt);
      if (ctrl.fireQueued && fireCooldown <= 0) {
        ctrl.fireQueued = false;
        fireCooldown = 0.18;
        spawnBolt(playerGroup.position.x, playerGroup.position.z);
        sfxRef.current.shoot();
      } else {
        ctrl.fireQueued = false;
      }

      invulnTimer = Math.max(0, invulnTimer - dt);
      if (invulnTimer > 0) {
        hullMat.emissive.setHex(0xf43f5e);
        hullMat.emissiveIntensity = 0.9;
      } else {
        hullMat.emissive.setHex(0x000000);
        hullMat.emissiveIntensity = 0;
      }

      // Animate lane strips
      const trackSpeed = 16 + runWave * 2;
      for (const s of laneStrips) {
        s.position.z += trackSpeed * dt;
        if (s.position.z > 10) s.position.z -= 84;
      }

      // Spawn timers
      hazardTimer -= dt;
      if (hazardTimer <= 0) {
        spawnHazard(runWave);
        hazardTimer = Math.max(0.32, 1.05 - runWave * 0.1);
      }

      orbTimer -= dt;
      if (orbTimer <= 0) {
        spawnOrb();
        orbTimer = 1.15;
      }

      // Update bolts
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.z -= 34 * dt;
        b.mesh.position.z = b.z;
        if (b.z < -62) {
          scene.remove(b.mesh);
          bolts.splice(i, 1);
        }
      }

      // Update hazards & collisions
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.z += h.speed * dt;
        h.swayPhase += dt * 2.4;
        const swayX = h.x + Math.sin(h.swayPhase) * (runWave >= 2 ? 1.1 : 0.35);
        h.mesh.position.set(THREE.MathUtils.clamp(swayX, -6.2, 6.2), 0.75, h.z);
        h.mesh.rotation.y += 2.2 * dt;

        if (h.flashTimer > 0) {
          h.flashTimer -= dt;
          h.bodyMat.emissiveIntensity = 2.4;
        } else {
          h.bodyMat.emissiveIntensity = 0.75;
        }

        // Bolt vs Hazard
        let destroyed = false;
        for (let bi = bolts.length - 1; bi >= 0; bi--) {
          const b = bolts[bi];
          if (Math.abs(b.mesh.position.x - h.mesh.position.x) < 0.95 && Math.abs(b.z - h.z) < 1.1) {
            scene.remove(b.mesh);
            bolts.splice(bi, 1);
            h.hp -= 1;
            h.flashTimer = 0.12;
            if (h.hp <= 0) {
              spawnBurst(h.mesh.position.clone(), 0xf87171);
              scene.remove(h.mesh);
              hazards.splice(i, 1);
              runScore += 150;
              setScore(runScore);
              shakeTimer = 0.12;
              sfxRef.current.explode();
              destroyed = true;
              break;
            }
          }
        }
        if (destroyed) continue;

        // Player vs Hazard
        if (
          invulnTimer <= 0 &&
          Math.abs(playerGroup.position.x - h.mesh.position.x) < 1.05 &&
          Math.abs(playerGroup.position.z - h.z) < 1.05
        ) {
          spawnBurst(h.mesh.position.clone(), 0xfb7185);
          scene.remove(h.mesh);
          hazards.splice(i, 1);
          runShields -= 1;
          setShields(runShields);
          invulnTimer = 1.1;
          shakeTimer = 0.28;
          sfxRef.current.hit();

          if (runShields <= 0) {
            ctrl.phase = 'gameover';
            setPhase('gameover');
            void persistScore(runScore, runWave, runOrbs);
            break;
          }
          continue;
        }

        if (h.z > 11) {
          scene.remove(h.mesh);
          hazards.splice(i, 1);
        }
      }

      // Update orbs
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.z += (13 + runWave * 1.4) * dt;
        o.phase += dt * 3;
        o.mesh.position.set(o.x, 0.75 + Math.sin(o.phase) * 0.14, o.z);
        o.mesh.rotation.y += 3 * dt;

        // Gentle magnetic pull when close
        const dx = playerGroup.position.x - o.x;
        const dz = playerGroup.position.z - o.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.4) {
          o.x += dx * 5 * dt;
          o.z += dz * 5 * dt;
        }

        if (dist < 1.15) {
          spawnBurst(o.mesh.position.clone(), 0xfacc15);
          scene.remove(o.mesh);
          orbs.splice(i, 1);
          runOrbs += 1;
          runScore += 100;
          setOrbsCollected(runOrbs);
          setScore(runScore);
          sfxRef.current.collect();
          continue;
        }

        if (o.z > 11) {
          scene.remove(o.mesh);
          orbs.splice(i, 1);
        }
      }

      // Wave progression
      const nextWave = Math.floor(runScore / 800) + 1;
      if (nextWave !== runWave) {
        runWave = nextWave;
        setWave(runWave);
      }

      // Update bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const p = bursts[i];
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(Math.max(0.01, p.life * 2));
        if (p.life <= 0) {
          scene.remove(p.mesh);
          (p.mesh.geometry as THREE.BufferGeometry).dispose();
          (p.mesh.material as THREE.Material).dispose();
          bursts.splice(i, 1);
        }
      }

      // Camera shake decay
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        camera.position.set(
          baseCamPos.x + (Math.random() - 0.5) * shakeTimer * 1.4,
          baseCamPos.y + (Math.random() - 0.5) * shakeTimer * 1.4,
          baseCamPos.z
        );
      } else {
        camera.position.lerp(baseCamPos, 10 * dt);
      }

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      envRT.dispose();
      pmrem.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
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
  }, [persistScore]);

  return (
    <div className="relative w-full h-[calc(100dvh-56px)] bg-[#060913] overflow-hidden select-none">
      {/* Stable WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Compact Top HUD (<= 15% viewport, solid dark panels, zero backdrop-filter) */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[#0c1017]/95 border border-white/15 pointer-events-auto">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">Score</div>
            <div className="text-sm font-mono font-bold text-white">{score}</div>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">Wave</div>
            <div className="text-sm font-mono font-bold text-cyan-300">{wave}</div>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className="flex items-center gap-1 text-rose-400">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-mono font-bold text-white">{shields}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c1017]/95 border border-white/15 text-xs text-amber-300">
            <Trophy className="w-3.5 h-3.5" />
            <span className="font-mono font-semibold">{bestScore}</span>
          </div>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
            className="p-2 rounded-xl bg-[#0c1017]/95 border border-white/15 text-zinc-200 hover:text-white cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {(phase === 'playing' || phase === 'paused') && (
            <button
              type="button"
              onClick={togglePause}
              aria-label={phase === 'paused' ? 'Resume Game' : 'Pause Game'}
              className="p-2 rounded-xl bg-[#0c1017]/95 border border-white/15 text-zinc-200 hover:text-white cursor-pointer"
            >
              {phase === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Touch Controls while playing */}
      {phase === 'playing' && (
        <div className="sm:hidden absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              onTouchStart={() => gameCtrlRef.current.keys.add('ArrowLeft')}
              onTouchEnd={() => gameCtrlRef.current.keys.delete('ArrowLeft')}
              className="px-4 py-3 rounded-xl bg-[#0c1017]/95 border border-white/20 text-white text-xs font-bold"
            >
              LEFT
            </button>
            <button
              type="button"
              onTouchStart={() => gameCtrlRef.current.keys.add('ArrowRight')}
              onTouchEnd={() => gameCtrlRef.current.keys.delete('ArrowRight')}
              className="px-4 py-3 rounded-xl bg-[#0c1017]/95 border border-white/20 text-white text-xs font-bold"
            >
              RIGHT
            </button>
          </div>
          <button
            type="button"
            onTouchStart={() => {
              gameCtrlRef.current.fireQueued = true;
            }}
            className="px-5 py-3 rounded-xl bg-cyan-500 text-zinc-950 font-bold text-xs pointer-events-auto"
          >
            FIRE
          </button>
        </div>
      )}

      {/* Title / Pause / Game Over Overlay */}
      {phase !== 'playing' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/60">
          <div className="max-w-sm w-full rounded-2xl bg-[#0c1017] border border-white/15 p-6 text-center space-y-4 shadow-2xl">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 mx-auto">
              <Zap className="w-6 h-6" />
            </div>

            {phase === 'title' && (
              <>
                <h2 className="text-xl font-bold tracking-tight text-white">Aegis Orbit 3D</h2>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Steer with <span className="font-mono text-white">WASD</span> or{' '}
                  <span className="font-mono text-white">Arrow Keys</span>, fire twin bolts with{' '}
                  <span className="font-mono text-white">Space</span>, collect Resonance Crystals, and blast seeker drones.
                </p>
                <button
                  type="button"
                  onClick={startGame}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>Launch Mission</span>
                </button>
              </>
            )}

            {phase === 'paused' && (
              <>
                <h2 className="text-xl font-bold text-white">Mission Paused</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={togglePause}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm cursor-pointer"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={startGame}
                    className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm cursor-pointer"
                  >
                    Restart
                  </button>
                </div>
              </>
            )}

            {phase === 'gameover' && (
              <>
                <h2 className="text-xl font-bold text-rose-300">Shields Depleted</h2>
                <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/10 text-xs">
                  <div>
                    <div className="text-zinc-400">Score</div>
                    <div className="font-mono font-bold text-white text-base">{score}</div>
                  </div>
                  <div>
                    <div className="text-zinc-400">Wave</div>
                    <div className="font-mono font-bold text-cyan-300 text-base">{wave}</div>
                  </div>
                  <div>
                    <div className="text-zinc-400">Crystals</div>
                    <div className="font-mono font-bold text-amber-300 text-base">{orbsCollected}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startGame}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Play Again</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
