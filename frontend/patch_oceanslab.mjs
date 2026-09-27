import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('c:/ocean/oceanStream/frontend/src/components/ocean/OceanSlab.jsx', 'utf8');

// Replace Argo floats instantiation
const oldArgoStr = `    // Argo floats
    const fGeo=new THREE.SphereGeometry(0.32,12,12);
    const fMat=new THREE.MeshStandardMaterial({color:'#00c8aa',emissive:'#009988',emissiveIntensity:1.0,roughness:0.12});
    const markers=new THREE.InstancedMesh(fGeo,fMat,256); markers.count=0; scene.add(markers);
    const tGeo=new THREE.BufferGeometry();
    const tPos=new Float32Array(256*2*3);
    tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));
    const tMat=new THREE.LineBasicMaterial({color:'#00c8aa',transparent:true,opacity:0.3});
    scene.add(new THREE.LineSegments(tGeo,tMat));`;

const newArgoStr = `    // Argo floats (Spheres)
    const floatGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const floatMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.8, roughness: 0.1 });
    const floatMarkers = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    floatMarkers.count = 0; scene.add(floatMarkers);

    // Gliders (Cones)
    const gliderGeo = new THREE.ConeGeometry(0.28, 0.9, 8);
    gliderGeo.rotateX(Math.PI / 2); // point forward
    const gliderMat = new THREE.MeshStandardMaterial({ color: '#ec4899', emissive: '#db2777', emissiveIntensity: 0.8, roughness: 0.1 });
    const gliderMarkers = new THREE.InstancedMesh(gliderGeo, gliderMat, 256);
    gliderMarkers.count = 0; scene.add(gliderMarkers);

    // Trajectory lines & Tethers
    const MAX_TRAJ_VERTS = 51200 * 3;
    const trajGeo = new THREE.BufferGeometry();
    const trajPos = new Float32Array(MAX_TRAJ_VERTS);
    const trajCol = new Float32Array(MAX_TRAJ_VERTS);
    trajGeo.setAttribute('position', new THREE.BufferAttribute(trajPos, 3));
    trajGeo.setAttribute('color', new THREE.BufferAttribute(trajCol, 3));
    const trajMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
    const trajLines = new THREE.LineSegments(trajGeo, trajMat);
    scene.add(trajLines);

    const tGeo=new THREE.BufferGeometry();
    const tPos=new Float32Array(256*2*3);
    tGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3));
    const tMat=new THREE.LineBasicMaterial({color:'#00c8aa',transparent:true,opacity:0.2});
    scene.add(new THREE.LineSegments(tGeo,tMat));`;

code = code.replace(oldArgoStr, newArgoStr);

// Replace hover logic for float identification
const oldHoverStr = `      // Float hit
      const fh=ray.intersectObject(markers)[0];
      if (fh&&dataRef.current.floats[fh.instanceId]) {
        const f=dataRef.current.floats[fh.instanceId]; hoveredFloat=f;
        renderer.domElement.style.cursor='pointer';
        if (tip) {
          tip.style.display='block';
          tip.style.left=(e.clientX-rect.left)+'px';
          tip.style.top=(e.clientY-rect.top)+'px';
          const t=f.temperature!=null?Number(f.temperature).toFixed(2)+' °C':'—';
          const s=f.salinity!=null?Number(f.salinity).toFixed(2)+' PSU':'—';
          tip.innerHTML='<div style="color:#00c8aa;font-weight:700;margin-bottom:3px">Argo Float #'+(f.platform_number||f.id||'?')+'</div>'
            +'<div>Depth: '+Math.round(f.depth??0)+' m</div>'
            +'<div>Temp: '+t+'  Sal: '+s+'</div>'
            +'<div style="color:#38bdf8;font-size:10px;margin-top:3px">Click for profile</div>';
        }`;

const newHoverStr = `      // Float/Glider hit
      const fh = ray.intersectObjects([floatMarkers, gliderMarkers])[0];
      if (fh) {
        const isGlider = fh.object === gliderMarkers;
        const plats = sceneRef.current?.activePlatforms || [];
        const plat = plats.find(p => p.type === (isGlider ? 'glider' : 'argo') && p.index === fh.instanceId);
        
        if (plat && plat.floatRef) {
          const f = plat.floatRef;
          hoveredFloat = f;
          renderer.domElement.style.cursor='pointer';
          if (tip) {
            tip.style.display='block';
            tip.style.left=(e.clientX-rect.left)+'px';
            tip.style.top=(e.clientY-rect.top)+'px';
            const tVal=f.temperature!=null?Number(f.temperature).toFixed(2)+' °C':'—';
            const sVal=f.salinity!=null?Number(f.salinity).toFixed(2)+' PSU':'—';
            const typeLabel = f.type === 'glider' ? 'Glider' : f.type === 'bgc' ? 'BGC-Argo' : 'Argo Float';
            const icon = f.type === 'glider' ? '🚀' : '📡';
            const color = f.type === 'glider' ? '#ec4899' : '#38bdf8';
            tip.innerHTML='<div style="color:'+color+';font-weight:700;margin-bottom:3px">'+icon+' '+typeLabel+' #'+(f.platform_number||f.id||'?')+'</div>'
              +'<div>Depth: '+Math.round(f.depth??0)+' m</div>'
              +'<div>Temp: '+tVal+'  Sal: '+sVal+'</div>'
              +'<div style="color:#6a96ba;font-size:10px;margin-top:3px">Click for profile</div>';
          }
          return;
        }`;

code = code.replace(oldHoverStr, newHoverStr);

// Replace marker placement logic
const oldMarkerLogic = `      // Argo markers
      const fl=cur.floats||[], fc=Math.min(fl.length,256);
      markers.count=fc;
      const m2=new THREE.Matrix4(),p2=new THREE.Vector3(),q2=new THREE.Quaternion(),s2=new THREE.Vector3(1.1,1.1,1.1);
      fl.slice(0,fc).forEach((f,i)=>{
        const fx=((Number(f.lng??f.lon)-bW)/lSp-0.5)*mW;
        const fz=((Number(f.lat)-bS)/laSp-0.5)*mD;
        const fy=depthToY(Number(f.depth??f.data_depth??50));
        p2.set(fx,fy,fz); m2.compose(p2,q2,s2); markers.setMatrixAt(i,m2);
        const o=i*6;
        tPos[o]=fx;tPos[o+1]=depthToY(0);tPos[o+2]=fz;
        tPos[o+3]=fx;tPos[o+4]=fy;tPos[o+5]=fz;
      });
      markers.instanceMatrix.needsUpdate=true;
      tGeo.attributes.position.needsUpdate=true;`;

const newMarkerLogic = `      // ── Platforms (Argo + Gliders) & Trajectories ────────────────────────────
      const fl = cur.floats || [];
      let argoCount = 0, gliderCount = 0, trajIdx = 0, tetherIdx = 0;
      
      const m2 = new THREE.Matrix4(), p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3(1, 1, 1);
      const activePlatforms = [];

      fl.slice(0, 256).forEach((f, idx) => {
        const isGlider = f.type === 'glider';
        const rawLon = Number(f.lng ?? f.lon);
        const rawLat = Number(f.lat);
        const rawDepth = Number(f.depth ?? f.data_depth ?? 50);
        if (isNaN(rawLon) || isNaN(rawLat)) return;
        
        const fx = ((rawLon - bW) / lSp - 0.5) * mW;
        const fz = ((rawLat - bS) / laSp - 0.5) * mD;
        const fy = depthToY(rawDepth);
        
        p2.set(fx, fy, fz);
        q2.identity(); // Default orientation
        
        // Render Trajectory
        if (f.trajectory && f.trajectory.length > 0) {
           const tpts = f.trajectory;
           let lastPt = null;
           tpts.forEach(tp => {
             const tLon = Number(tp.lon);
             const tLat = Number(tp.lat);
             const tDepth = Number(tp.depth ?? tp.depth_m ?? 0);
             if (isNaN(tLon) || isNaN(tLat) || isNaN(tDepth)) return;
             
             const tx = ((tLon - bW) / lSp - 0.5) * mW;
             const tz = ((tLat - bS) / laSp - 0.5) * mD;
             const ty = depthToY(tDepth);
             
             if (lastPt && trajIdx < MAX_TRAJ_VERTS / 6) {
               trajPos[trajIdx*3] = lastPt.x; trajPos[trajIdx*3+1] = lastPt.y; trajPos[trajIdx*3+2] = lastPt.z;
               trajPos[trajIdx*3+3] = tx; trajPos[trajIdx*3+4] = ty; trajPos[trajIdx*3+5] = tz;
               
               const c = isGlider ? new THREE.Color('#ec4899') : new THREE.Color('#38bdf8');
               trajCol[trajIdx*3] = c.r; trajCol[trajIdx*3+1] = c.g; trajCol[trajIdx*3+2] = c.b;
               trajCol[trajIdx*3+3] = c.r; trajCol[trajIdx*3+4] = c.g; trajCol[trajIdx*3+5] = c.b;
               trajIdx += 2;
             }
             lastPt = {x: tx, y: ty, z: tz};
           });
           
           // Glider Orientation based on trajectory
           if (isGlider && tpts.length > 1) {
              const last = tpts[tpts.length - 1];
              const prev = tpts[tpts.length - 2];
              const dxW = (Number(last.lon) - Number(prev.lon)) / lSp * mW;
              const dzW = (Number(last.lat) - Number(prev.lat)) / laSp * mD;
              const dyW = depthToY(Number(last.depth ?? last.depth_m ?? 0)) - depthToY(Number(prev.depth ?? prev.depth_m ?? 0));
              if (dxW !== 0 || dzW !== 0 || dyW !== 0) {
                 const dir = new THREE.Vector3(dxW, dyW, dzW).normalize();
                 const up = new THREE.Vector3(0, 1, 0);
                 const m = new THREE.Matrix4();
                 m.lookAt(new THREE.Vector3(0,0,0), dir, up);
                 q2.setFromRotationMatrix(m);
              }
           }
        }
        
        m2.compose(p2, q2, s2);
        
        if (isGlider) {
           gliderMarkers.setMatrixAt(gliderCount, m2);
           activePlatforms.push({ type: 'glider', index: gliderCount, basePos: p2.clone(), baseQuat: q2.clone(), floatRef: f });
           gliderCount++;
        } else {
           floatMarkers.setMatrixAt(argoCount, m2);
           activePlatforms.push({ type: 'argo', index: argoCount, basePos: p2.clone(), baseQuat: q2.clone(), floatRef: f });
           argoCount++;
        }
        
        const o = tetherIdx * 6;
        tPos[o]=fx;tPos[o+1]=depthToY(0);tPos[o+2]=fz;
        tPos[o+3]=fx;tPos[o+4]=fy;tPos[o+5]=fz;
        tetherIdx++;
      });
      
      gliderMarkers.count = gliderCount;
      gliderMarkers.instanceMatrix.needsUpdate = true;
      floatMarkers.count = argoCount;
      floatMarkers.instanceMatrix.needsUpdate = true;
      
      trajGeo.setDrawRange(0, trajIdx);
      trajGeo.attributes.position.needsUpdate = true;
      trajGeo.attributes.color.needsUpdate = true;
      
      tGeo.setDrawRange(0, tetherIdx * 2);
      tGeo.attributes.position.needsUpdate = true;
      
      sceneRef.current.activePlatforms = activePlatforms;`;

code = code.replace(oldMarkerLogic, newMarkerLogic);

// Add the animation loop inside OceanSlab
const oldAnim = `    let frame;
    const animate=()=>{ controls.update(); renderer.render(scene,camera); frame=requestAnimationFrame(animate); };
    animate();`;

const newAnim = `    let frame;
    const clock = new THREE.Clock();
    const animate=()=>{ 
      controls.update(); 
      const t = clock.getElapsedTime();
      const plats = sceneRef.current?.activePlatforms;
      if (plats && plats.length > 0) {
        const _m = new THREE.Matrix4();
        const _p = new THREE.Vector3();
        let fDirty = false;
        let gDirty = false;
        plats.forEach(plat => {
          const bob = Math.sin(t * 1.5 + plat.index * 0.5) * 0.12; 
          _p.copy(plat.basePos);
          _p.y += bob;
          _m.compose(_p, plat.baseQuat, new THREE.Vector3(1, 1, 1));
          if (plat.type === 'glider') {
            gliderMarkers.setMatrixAt(plat.index, _m);
            gDirty = true;
          } else {
            floatMarkers.setMatrixAt(plat.index, _m);
            fDirty = true;
          }
        });
        if (gDirty) gliderMarkers.instanceMatrix.needsUpdate = true;
        if (fDirty) floatMarkers.instanceMatrix.needsUpdate = true;
      }
      renderer.render(scene,camera); 
      frame=requestAnimationFrame(animate); 
    };
    animate();`;

code = code.replace(oldAnim, newAnim);

// Disposals
const oldDispose = `      fGeo.dispose();fMat.dispose();aGeo.dispose();aMat.dispose();
      tGeo.dispose();tMat.dispose();selGeo.dispose();selMat.dispose();`;

const newDispose = `      floatGeo.dispose();floatMat.dispose();gliderGeo.dispose();gliderMat.dispose();
      aGeo.dispose();aMat.dispose();tGeo.dispose();tMat.dispose();
      trajGeo.dispose();trajMat.dispose();selGeo.dispose();selMat.dispose();`;

code = code.replace(oldDispose, newDispose);

writeFileSync('c:/ocean/oceanStream/frontend/src/components/ocean/OceanSlab.jsx', code, 'utf8');
console.log('Patched OceanSlab.jsx with 3D trajectories and animations.');
