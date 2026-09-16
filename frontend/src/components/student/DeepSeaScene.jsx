import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * DeepSeaScene — Performant procedural 3D Deep Sea Three.js Environment
 * Features:
 * - Dynamic depth fog & atmospheric lighting falloff
 * - Wave animated ocean surface
 * - Procedural seabed terrain, rocks, corals, hydrothermal vent
 * - Swimming fish schools, manta rays, pulsing bioluminescent jellyfish, abyssal anglerfish
 * - Floating plankton / marine snow particles
 * - 3D Argo float & glider markers
 * - Smooth camera dive animations to any depth
 */
export default function DeepSeaScene({
  currentDepth = 0,
  onSelectMarker,
  onZoneChange,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const targetCamYRef = useRef(0);
  const creaturesRef = useRef([]);
  const particlesRef = useRef(null);
  const ventParticlesRef = useRef(null);
  const surfaceMeshRef = useRef(null);

  // Map depth (0 - 5000m) to Three.js Y coordinate (0 down to -300)
  const depthToY = (d) => -(d / 5000) * 300;

  useEffect(() => {
    targetCamYRef.current = depthToY(currentDepth);
  }, [currentDepth]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // --- 1. Scene & Camera ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Initial surface fog
    scene.background = new THREE.Color(0x02172d);
    scene.fog = new THREE.FogExp2(0x02172d, 0.008);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 35);
    cameraRef.current = camera;

    // --- 2. Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // --- 3. Lighting ---
    const ambientLight = new THREE.AmbientLight(0x0a355c, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0x80e5ff, 2.5);
    sunLight.position.set(20, 60, 20);
    scene.add(sunLight);

    // Bioluminescence point light (follows camera)
    const cameraLight = new THREE.PointLight(0x00ffff, 1.5, 45);
    camera.add(cameraLight);
    scene.add(camera);

    // --- 4. Ocean Surface (Waves) ---
    const surfaceGeo = new THREE.PlaneGeometry(350, 350, 48, 48);
    surfaceGeo.rotateX(-Math.PI / 2);
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0099cc,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.position.y = 8;
    scene.add(surfaceMesh);
    surfaceMeshRef.current = surfaceMesh;

    // --- 5. Seabed Bathymetry & Hydrothermal Vent ---
    const seabedY = -310;
    const seabedGeo = new THREE.PlaneGeometry(400, 400, 64, 64);
    seabedGeo.rotateX(-Math.PI / 2);

    // Procedural terrain elevation
    const pos = seabedGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const elevation = Math.sin(vx * 0.04) * Math.cos(vz * 0.04) * 8 +
                        Math.sin(vx * 0.09 + 2) * 3;
      pos.setY(i, elevation);
    }
    seabedGeo.computeVertexNormals();

    const seabedMat = new THREE.MeshStandardMaterial({
      color: 0x06111e,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
    seabedMesh.position.y = seabedY;
    scene.add(seabedMesh);

    // Seabed Rocks & Corals
    const rockGeo = new THREE.DodecahedronGeometry(1.5, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.8 });
    const coralMat = new THREE.MeshStandardMaterial({ color: 0x00c8ff, emissive: 0x005577, emissiveIntensity: 0.6 });

    for (let r = 0; r < 28; r++) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rx = (Math.random() - 0.5) * 160;
      const rz = (Math.random() - 0.5) * 160;
      const sc = 1 + Math.random() * 2.5;
      rock.scale.set(sc, sc * 1.5, sc);
      rock.position.set(rx, seabedY + 2, rz);
      scene.add(rock);

      // Add coral cluster
      if (r % 2 === 0) {
        const coralGeo = new THREE.ConeGeometry(0.8, 2.5, 5);
        const coral = new THREE.Mesh(coralGeo, coralMat);
        coral.position.set(rx + 2, seabedY + 2.5, rz + 1);
        coral.rotation.z = (Math.random() - 0.5) * 0.4;
        scene.add(coral);
      }
    }

    // Hydrothermal Vent Chimney
    const ventGeo = new THREE.CylinderGeometry(2, 4, 18, 12);
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x110d0a, roughness: 0.95 });
    const ventMesh = new THREE.Mesh(ventGeo, ventMat);
    ventMesh.position.set(12, seabedY + 9, -15);
    scene.add(ventMesh);

    const ventLight = new THREE.PointLight(0xff5500, 3, 30);
    ventLight.position.set(12, seabedY + 18, -15);
    scene.add(ventLight);

    // Vent smoke particles
    const ventCount = 120;
    const ventPos = new Float32Array(ventCount * 3);
    for (let i = 0; i < ventCount; i++) {
      ventPos[i * 3] = 12 + (Math.random() - 0.5) * 2;
      ventPos[i * 3 + 1] = seabedY + 18 + Math.random() * 25;
      ventPos[i * 3 + 2] = -15 + (Math.random() - 0.5) * 2;
    }
    const ventPartGeo = new THREE.BufferGeometry();
    ventPartGeo.setAttribute('position', new THREE.BufferAttribute(ventPos, 3));
    const ventPartMat = new THREE.PointsMaterial({
      color: 0x442211,
      size: 1.2,
      transparent: true,
      opacity: 0.6,
    });
    const ventParticles = new THREE.Points(ventPartGeo, ventPartMat);
    scene.add(ventParticles);
    ventParticlesRef.current = ventParticles;

    // --- 6. Plankton & Marine Snow Particles ---
    const partCount = 2500;
    const partPositions = new Float32Array(partCount * 3);
    const partColors = new Float32Array(partCount * 3);

    for (let i = 0; i < partCount; i++) {
      partPositions[i * 3] = (Math.random() - 0.5) * 140;
      partPositions[i * 3 + 1] = 10 - Math.random() * 320; // 0 down to -310
      partPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;

      // Glow color based on depth
      const y = partPositions[i * 3 + 1];
      if (y > -30) {
        // Sunlight - white/cyan
        partColors[i * 3] = 0.8;
        partColors[i * 3 + 1] = 0.95;
        partColors[i * 3 + 2] = 1.0;
      } else if (y > -120) {
        // Twilight - cyan/emerald
        partColors[i * 3] = 0.0;
        partColors[i * 3 + 1] = 0.8;
        partColors[i * 3 + 2] = 0.9;
      } else {
        // Midnight & Abyss - bioluminescent cyan/violet marine snow
        partColors[i * 3] = 0.4;
        partColors[i * 3 + 1] = 0.5;
        partColors[i * 3 + 2] = 0.9;
      }
    }

    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
    partGeo.setAttribute('color', new THREE.BufferAttribute(partColors, 3));

    const partMat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);
    particlesRef.current = particles;

    // --- 7. Marine Life Creatures ---
    const creatures = [];

    // A) Sunlight Fish School (0m to -25m)
    const fishGeo = new THREE.ConeGeometry(0.35, 1.4, 4);
    fishGeo.rotateX(Math.PI / 2);
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.6 });

    for (let f = 0; f < 35; f++) {
      const fish = new THREE.Mesh(fishGeo, fishMat);
      const angle = (f / 35) * Math.PI * 2;
      fish.position.set(
        Math.cos(angle) * (14 + (f % 5)),
        -2 - (f % 8) * 1.5,
        Math.sin(angle) * (14 + (f % 5))
      );
      scene.add(fish);
      creatures.push({
        mesh: fish,
        type: 'fish',
        speed: 0.02 + (f % 4) * 0.005,
        radius: 14 + (f % 5),
        angle: angle,
        baseY: fish.position.y,
      });
    }

    // B) Manta Rays in Twilight Zone (-30m to -90m)
    const mantaGeo = new THREE.BufferGeometry();
    // Simplified delta wing shape
    const mantaVerts = new Float32Array([
      0, 0, 3,   -4, 0, -2,   4, 0, -2,
      0, 0, 3,   4, 0, -2,    0, 0, -4,
      0, 0, 3,   0, 0, -4,    -4, 0, -2,
    ]);
    mantaGeo.setAttribute('position', new THREE.BufferAttribute(mantaVerts, 3));
    mantaGeo.computeVertexNormals();
    const mantaMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x0284c7,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    for (let m = 0; m < 3; m++) {
      const manta = new THREE.Mesh(mantaGeo, mantaMat);
      manta.position.set((m - 1) * 22, -45 - m * 15, -10 + m * 8);
      scene.add(manta);
      creatures.push({
        mesh: manta,
        type: 'manta',
        speed: 0.008,
        angle: m * 2.1,
        radius: 26,
        baseY: manta.position.y,
      });
    }

    // C) Bioluminescent Jellyfish in Midnight Zone (-100m to -220m)
    const jellyGeo = new THREE.SphereGeometry(1.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const jellyMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });

    for (let j = 0; j < 8; j++) {
      const jelly = new THREE.Mesh(jellyGeo, jellyMat);
      jelly.position.set((Math.random() - 0.5) * 50, -110 - j * 16, (Math.random() - 0.5) * 40);
      scene.add(jelly);

      // Jellyfish tentacles
      const tentGeo = new THREE.CylinderGeometry(0.04, 0.02, 3.5, 4);
      for (let t = 0; t < 4; t++) {
        const tent = new THREE.Mesh(tentGeo, jellyMat);
        tent.position.set(Math.cos(t * 1.5) * 0.8, -1.8, Math.sin(t * 1.5) * 0.8);
        jelly.add(tent);
      }

      creatures.push({
        mesh: jelly,
        type: 'jelly',
        pulseSpeed: 1.8 + j * 0.2,
        baseY: jelly.position.y,
      });
    }

    // D) Deep-sea Anglerfish in Abyssal Zone (-240m to -300m)
    const anglerGroup = new THREE.Group();
    const anglerBodyGeo = new THREE.DodecahedronGeometry(1.4, 1);
    const anglerBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a0f0f, roughness: 0.9 });
    const anglerBody = new THREE.Mesh(anglerBodyGeo, anglerBodyMat);
    anglerGroup.add(anglerBody);

    // Glowing Esca Lure
    const lureGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const lureMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
    const lure = new THREE.Mesh(lureGeo, lureMat);
    lure.position.set(0, 1.8, 2.2);
    anglerGroup.add(lure);

    const lureLight = new THREE.PointLight(0x00ffaa, 2, 12);
    lureLight.position.set(0, 1.8, 2.2);
    anglerGroup.add(lureLight);

    anglerGroup.position.set(8, -265, -8);
    scene.add(anglerGroup);
    creatures.push({
      mesh: anglerGroup,
      type: 'angler',
      baseY: -265,
    });

    // --- 8. 3D Argo Float & Glider Markers ---
    const markers = [];

    // Argo Float 1 (Platform #2902765 - Core Argo)
    const argoGroup = new THREE.Group();
    const argoBodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.2, 12);
    const argoBodyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.8 }); // INCOIS Yellow
    const argoBody = new THREE.Mesh(argoBodyGeo, argoBodyMat);
    argoGroup.add(argoBody);

    // Antenna
    const antGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6);
    const antMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const ant = new THREE.Mesh(antGeo, antMat);
    ant.position.y = 2.4;
    argoGroup.add(ant);

    // Blinking transmitter light
    const floatLight = new THREE.PointLight(0x00e5ff, 1.5, 8);
    floatLight.position.y = 3.2;
    argoGroup.add(floatLight);

    argoGroup.position.set(10, -50, 12); // ~800m depth
    argoGroup.userData = {
      id: '2902765',
      name: 'Argo Float #2902765',
      type: 'Core Argo Robot',
      depth: '850 m',
      desc: 'Autonomous robotic profiling float measuring ocean temperature & salinity',
    };
    scene.add(argoGroup);
    markers.push(argoGroup);

    // Argo Float 2 (Platform #2903341 - BGC Argo)
    const bgcGroup = argoGroup.clone();
    bgcGroup.children[0].material = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.8 }); // Emerald Green
    bgcGroup.position.set(-14, -130, -5); // ~2000m depth
    bgcGroup.userData = {
      id: '2903341',
      name: 'Biogeochemical Argo Float #2903341',
      type: 'BGC-Argo Robot',
      depth: '2,100 m',
      desc: 'Deep-ocean sensor observing Chlorophyll-a, Dissolved Oxygen, Nitrate & pH',
    };
    scene.add(bgcGroup);
    markers.push(bgcGroup);

    creaturesRef.current = creatures;

    // --- 9. Raycasting for Clicking Markers ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markers, true);

      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit.parent && !hit.userData?.id) {
          hit = hit.parent;
        }
        if (hit?.userData?.id) {
          onSelectMarker?.(hit.userData);
        }
      }
    };

    container.addEventListener('click', handleClick);

    // --- 10. Animation Loop ---
    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // A) Smooth Camera Dive to Target Depth
      const targetY = targetCamYRef.current;
      camera.position.y += (targetY - camera.position.y) * 0.05;

      // Camera gentle drifting
      camera.position.x = Math.sin(elapsed * 0.2) * 2;
      camera.position.z = 32 + Math.cos(elapsed * 0.15) * 2;
      camera.lookAt(0, camera.position.y - 3, 0);

      // B) Depth Zone Lighting & Fog Transitions
      const curY = camera.position.y;
      if (curY > -15) {
        // Sunlight Zone (0 - 200m)
        scene.fog.color.setHex(0x022444);
        scene.background.setHex(0x022444);
        sunLight.intensity = 2.5;
        ambientLight.intensity = 1.3;
        onZoneChange?.('Sunlight Zone');
      } else if (curY > -60) {
        // Twilight Zone (200 - 1000m)
        scene.fog.color.setHex(0x021326);
        scene.background.setHex(0x021326);
        sunLight.intensity = 0.8;
        ambientLight.intensity = 0.8;
        onZoneChange?.('Twilight Zone');
      } else if (curY > -180) {
        // Midnight Zone (1000 - 4000m)
        scene.fog.color.setHex(0x010814);
        scene.background.setHex(0x010814);
        sunLight.intensity = 0.05;
        ambientLight.intensity = 0.4;
        onZoneChange?.('Midnight Zone');
      } else {
        // Abyssal & Hadal Zone (> 4000m)
        scene.fog.color.setHex(0x000308);
        scene.background.setHex(0x000308);
        sunLight.intensity = 0.0;
        ambientLight.intensity = 0.2;
        onZoneChange?.('Abyssal Zone');
      }

      // C) Animate Surface Waves
      if (surfaceMeshRef.current) {
        const p = surfaceMeshRef.current.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i);
          const v = p.getZ(i);
          const z = Math.sin(u * 0.1 + elapsed * 1.5) * Math.cos(v * 0.1 + elapsed * 1.2) * 0.8;
          p.setY(i, z);
        }
        surfaceMeshRef.current.geometry.computeVertexNormals();
        surfaceMeshRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // D) Animate Plankton Drift
      if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array;
        for (let i = 0; i < partCount; i++) {
          positions[i * 3 + 1] += Math.sin(elapsed + i) * 0.03;
          positions[i * 3] += Math.cos(elapsed * 0.5 + i) * 0.02;
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // E) Animate Creatures
      creaturesRef.current.forEach((c) => {
        if (c.type === 'fish') {
          c.angle += c.speed;
          c.mesh.position.x = Math.cos(c.angle) * c.radius;
          c.mesh.position.z = Math.sin(c.angle) * c.radius;
          c.mesh.position.y = c.baseY + Math.sin(elapsed * 3 + c.angle) * 0.4;
          c.mesh.rotation.y = -c.angle + Math.PI / 2;
        } else if (c.type === 'manta') {
          c.angle += c.speed;
          c.mesh.position.x = Math.cos(c.angle) * c.radius;
          c.mesh.position.z = Math.sin(c.angle) * c.radius;
          c.mesh.position.y = c.baseY + Math.sin(elapsed * 1.2) * 1.5;
          c.mesh.rotation.y = -c.angle + Math.PI / 2;
          c.mesh.rotation.z = Math.sin(elapsed * 2) * 0.15; // Wing flap tilt
        } else if (c.type === 'jelly') {
          const pulse = Math.sin(elapsed * c.pulseSpeed);
          c.mesh.position.y = c.baseY + pulse * 1.8;
          c.mesh.scale.set(1 + pulse * 0.15, 1 - pulse * 0.1, 1 + pulse * 0.15);
        } else if (c.type === 'angler') {
          c.mesh.position.x = 8 + Math.sin(elapsed * 0.4) * 4;
          c.mesh.position.z = -8 + Math.cos(elapsed * 0.3) * 3;
          c.mesh.rotation.y = Math.sin(elapsed * 0.4) * 0.3;
        }
      });

      // F) Animate Argo Float Bobbing
      markers.forEach((m, idx) => {
        m.position.y += Math.sin(elapsed * 1.5 + idx) * 0.015;
        m.rotation.y += 0.005;
      });

      // G) Animate Hydrothermal Vent Smoke
      if (ventParticlesRef.current) {
        const vPos = ventParticlesRef.current.geometry.attributes.position.array;
        for (let i = 0; i < ventCount; i++) {
          vPos[i * 3 + 1] += 0.25;
          vPos[i * 3] += (Math.random() - 0.5) * 0.1;
          if (vPos[i * 3 + 1] > seabedY + 45) {
            vPos[i * 3 + 1] = seabedY + 18;
            vPos[i * 3] = 12 + (Math.random() - 0.5) * 2;
          }
        }
        ventParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    // --- 11. Resize Handler ---
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('click', handleClick);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing select-none"
      style={{ touchAction: 'none' }}
    />
  );
}
