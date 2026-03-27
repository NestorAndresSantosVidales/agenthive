// ============================================================
// AGENT HIVE — 3D Room (Three.js)
// Sims-style avatars, walking, talking, working
// ============================================================

(function () {
  const ROOM_W = 14, ROOM_D = 14, ROOM_H = 4;

  // Agent visual config
  const AGENT_CONFIG = {
    oracle: { bodyColor: 0x9ea0ff, headColor: 0xd0d2ff, deskPos: [-4, 0, -3], label: '🔮 Oracle' },
    nexus:  { bodyColor: 0x4cff91, headColor: 0xaaffcc, deskPos: [ 4, 0, -3], label: '🕸️ Nexus'  },
    sigma:  { bodyColor: 0xffcc44, headColor: 0xffe8a0, deskPos: [-4, 0,  3], label: '⚡ Sigma'  },
    echo:   { bodyColor: 0xff6b9d, headColor: 0xffb3cc, deskPos: [ 4, 0,  3], label: '🧠 Echo'   },
  };

  // ── Scene Setup ──────────────────────────────────────────
  const container = document.getElementById('room3d-container');
  const W = container.clientWidth, H = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);
  scene.fog = new THREE.Fog(0x0d0d1a, 18, 35);

  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
  camera.position.set(0, 9, 14);
  camera.lookAt(0, 0, 0);

  // ── Orbit Controls (manual) ──────────────────────────────
  let isDragging = false, prevMouse = { x: 0, y: 0 };
  let camTheta = 0, camPhi = 0.55, camRadius = 16;

  renderer.domElement.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('mouseup',   () => { isDragging = false; });
  renderer.domElement.addEventListener('mousemove', e => {
    if (!isDragging) return;
    camTheta -= (e.clientX - prevMouse.x) * 0.008;
    camPhi    = Math.max(0.2, Math.min(1.2, camPhi - (e.clientY - prevMouse.y) * 0.006));
    prevMouse = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('wheel', e => {
    camRadius = Math.max(8, Math.min(28, camRadius + e.deltaY * 0.02));
  });

  function updateCamera() {
    camera.position.set(
      camRadius * Math.sin(camTheta) * Math.cos(camPhi),
      camRadius * Math.sin(camPhi),
      camRadius * Math.cos(camTheta) * Math.cos(camPhi)
    );
    camera.lookAt(0, 1, 0);
  }

  // ── Lights ───────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x222244, 1.2));

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  // Colored point lights per desk
  const deskLights = [
    { color: 0x9ea0ff, pos: [-4, 2, -3] },
    { color: 0x4cff91, pos: [ 4, 2, -3] },
    { color: 0xffcc44, pos: [-4, 2,  3] },
    { color: 0xff6b9d, pos: [ 4, 2,  3] },
  ];
  deskLights.forEach(dl => {
    const pl = new THREE.PointLight(dl.color, 1.5, 5);
    pl.position.set(...dl.pos);
    scene.add(pl);
  });

  // ── Room Geometry ────────────────────────────────────────
  function buildRoom() {
    const mat = {
      floor: new THREE.MeshLambertMaterial({ color: 0x1a1a3e }),
      wall:  new THREE.MeshLambertMaterial({ color: 0x111128 }),
      grid:  new THREE.MeshBasicMaterial({ color: 0x9ea0ff, wireframe: true, transparent: true, opacity: 0.06 }),
    };

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D, 14, 14), mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid overlay
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D, 14, 14), mat.grid);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.01;
    scene.add(grid);

    // Walls
    const wallGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
    const backWall = new THREE.Mesh(wallGeo, mat.wall);
    backWall.position.set(0, ROOM_H / 2, -ROOM_D / 2);
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), mat.wall);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), mat.wall);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(ROOM_W / 2, ROOM_H / 2, 0);
    scene.add(rightWall);

    // Ceiling glow strips
    for (let i = -1; i <= 1; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.05, ROOM_D - 2),
        new THREE.MeshBasicMaterial({ color: 0x9ea0ff, transparent: true, opacity: 0.6 })
      );
      strip.position.set(i * 3, ROOM_H - 0.1, 0);
      scene.add(strip);
    }
  }

  // ── Desk + Monitor ───────────────────────────────────────
  function buildDesk(x, z, color) {
    const group = new THREE.Group();

    // Desk surface
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.1, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x2a2a4e })
    );
    desk.position.y = 0.85;
    desk.castShadow = true;
    group.add(desk);

    // Legs
    [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.85, 0.08),
        new THREE.MeshLambertMaterial({ color: 0x1a1a3e })
      );
      leg.position.set(lx, 0.42, lz);
      group.add(leg);
    });

    // Monitor
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x111128 })
    );
    monitor.position.set(0, 1.35, -0.35);
    group.add(monitor);

    // Screen glow
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.65),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    screen.position.set(0, 1.35, -0.32);
    group.add(screen);

    // Monitor stand
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.3, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x1a1a3e })
    );
    stand.position.set(0, 1.05, -0.35);
    group.add(stand);

    // Chair
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2a1a4e })
    );
    chair.position.set(0, 0.55, 0.7);
    group.add(chair);

    const chairBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.7, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x2a1a4e })
    );
    chairBack.position.set(0, 0.9, 0.35);
    group.add(chairBack);

    group.position.set(x, 0, z);
    scene.add(group);
    return group;
  }

  // ── Avatar Builder ───────────────────────────────────────
  function buildAvatar(cfg) {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.3),
      new THREE.MeshLambertMaterial({ color: cfg.bodyColor })
    );
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.38, 0.38),
      new THREE.MeshLambertMaterial({ color: cfg.headColor })
    );
    head.position.y = 1.44;
    head.castShadow = true;
    group.add(head);

    // Eyes
    [-0.1, 0.1].forEach(ex => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x0d0d1a })
      );
      eye.position.set(ex, 1.47, 0.2);
      group.add(eye);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      pupil.position.set(ex, 1.47, 0.24);
      group.add(pupil);
    });

    // Arms
    [-0.35, 0.35].forEach((ax, i) => {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.55, 0.15),
        new THREE.MeshLambertMaterial({ color: cfg.bodyColor })
      );
      arm.position.set(ax, 0.82, 0);
      arm.name = i === 0 ? 'armL' : 'armR';
      group.add(arm);
    });

    // Legs
    [-0.14, 0.14].forEach((lx, i) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.55, 0.18),
        new THREE.MeshLambertMaterial({ color: cfg.bodyColor })
      );
      leg.position.set(lx, 0.27, 0);
      leg.name = i === 0 ? 'legL' : 'legR';
      group.add(leg);
    });

    // Name tag (sprite)
    group.userData.nameTag = createNameTag(cfg.label, cfg.bodyColor);
    group.userData.nameTag.position.set(0, 2.1, 0);
    group.add(group.userData.nameTag);

    // Speech bubble (hidden by default)
    group.userData.bubble = createBubble();
    group.userData.bubble.position.set(0.5, 2.0, 0);
    group.userData.bubble.visible = false;
    group.add(group.userData.bubble);

    return group;
  }

  // ── Name Tag Sprite ──────────────────────────────────────
  function createNameTag(label, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}cc`;
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 0.55, 1);
    return sprite;
  }

  // ── Speech Bubble ────────────────────────────────────────
  function createBubble() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    canvas._ctx = ctx;
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.userData.canvas = canvas;
    sprite.userData.tex = tex;
    return sprite;
  }

  function showBubble(avatar, text, duration = 4000) {
    const bubble = avatar.userData.bubble;
    const canvas = bubble.userData.canvas;
    const ctx = canvas._ctx || canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    // Background
    ctx.fillStyle = 'rgba(13,13,26,0.92)';
    ctx.strokeStyle = '#9ea0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(6, 6, 500, 100, 16);
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.fillStyle = 'rgba(13,13,26,0.92)';
    ctx.beginPath();
    ctx.moveTo(30, 106); ctx.lineTo(10, 122); ctx.lineTo(55, 106);
    ctx.fill();

    // Text — wrap
    ctx.fillStyle = '#e0e0ff';
    ctx.font = '18px Segoe UI';
    ctx.textBaseline = 'top';
    const words = text.split(' ');
    let line = '', y = 18;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > 480 && line) {
        ctx.fillText(line.trim(), 18, y);
        line = word + ' ';
        y += 24;
        if (y > 80) break;
      } else { line = test; }
    }
    ctx.fillText(line.trim(), 18, y);

    bubble.userData.tex.needsUpdate = true;
    bubble.visible = true;

    clearTimeout(bubble.userData.timer);
    bubble.userData.timer = setTimeout(() => { bubble.visible = false; }, duration);
  }

  // ── Screen Text Update ───────────────────────────────────
  function updateScreen(deskGroup, text) {
    // Find the screen mesh (PlaneGeometry child)
    deskGroup.children.forEach(child => {
      if (child.geometry?.type === 'PlaneGeometry') {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 160;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, 256, 160);
        ctx.fillStyle = '#9ea0ff';
        ctx.font = 'bold 13px monospace';
        ctx.fillText('> AGENT TERMINAL', 10, 20);
        ctx.fillStyle = '#4cff91';
        ctx.font = '11px monospace';
        const lines = text.match(/.{1,28}/g) || [text];
        lines.slice(0, 8).forEach((l, i) => ctx.fillText(l, 10, 40 + i * 14));
        child.material.map = new THREE.CanvasTexture(canvas);
        child.material.needsUpdate = true;
      }
    });
  }

  // ── Agent State Machine ──────────────────────────────────
  const agentStates = {};

  function initAgentState(id, deskPos) {
    agentStates[id] = {
      state: 'walking',       // walking | working | talking | idle
      target: new THREE.Vector3(...deskPos).add(new THREE.Vector3(0, 0, 1.1)),
      deskPos: new THREE.Vector3(...deskPos).add(new THREE.Vector3(0, 0, 1.1)),
      walkTimer: 0,
      animTime: 0,
      talkTarget: null,
    };
  }

  // ── Build Scene ──────────────────────────────────────────
  buildRoom();

  const desks = {};
  const avatars = {};

  Object.entries(AGENT_CONFIG).forEach(([id, cfg]) => {
    desks[id] = buildDesk(cfg.deskPos[0], cfg.deskPos[2], cfg.bodyColor);
    avatars[id] = buildAvatar(cfg);
    // Start avatars near center
    avatars[id].position.set(
      (Math.random() - 0.5) * 4,
      0,
      (Math.random() - 0.5) * 4
    );
    scene.add(avatars[id]);
    initAgentState(id, cfg.deskPos);
  });

  // Center table
  const centerTable = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.08, 16),
    new THREE.MeshLambertMaterial({ color: 0x2a2a4e })
  );
  centerTable.position.set(0, 0.8, 0);
  scene.add(centerTable);

  // ── Auth0 Server Terminal (center-back wall) ─────────────
  const terminalGroup = new THREE.Group();

  // Server rack body
  const rack = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 2.4, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x111128 })
  );
  rack.position.y = 1.2;
  terminalGroup.add(rack);

  // Rack border glow
  const rackGlow = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 2.45, 0.45),
    new THREE.MeshBasicMaterial({ color: 0x9ea0ff, wireframe: true, transparent: true, opacity: 0.3 })
  );
  rackGlow.position.y = 1.2;
  terminalGroup.add(rackGlow);

  // Screen on rack
  const termScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x0d0d1a })
  );
  termScreen.position.set(0, 1.6, 0.26);
  terminalGroup.add(termScreen);

  // Auth0 logo label sprite
  const auth0Canvas = document.createElement('canvas');
  auth0Canvas.width = 256; auth0Canvas.height = 64;
  const auth0Ctx = auth0Canvas.getContext('2d');
  auth0Ctx.fillStyle = '#0d0d1a';
  auth0Ctx.fillRect(0, 0, 256, 64);
  auth0Ctx.fillStyle = '#9ea0ff';
  auth0Ctx.font = 'bold 20px monospace';
  auth0Ctx.textAlign = 'center';
  auth0Ctx.fillText('🔐 AUTH0 SERVER', 128, 24);
  auth0Ctx.fillStyle = '#4cff9188';
  auth0Ctx.font = '13px monospace';
  auth0Ctx.fillText('CREDENTIAL VALIDATOR', 128, 46);
  const auth0Tex = new THREE.CanvasTexture(auth0Canvas);
  const auth0Label = new THREE.Sprite(new THREE.SpriteMaterial({ map: auth0Tex, transparent: true }));
  auth0Label.scale.set(2.4, 0.6, 1);
  auth0Label.position.set(0, 2.8, 0.3);
  terminalGroup.add(auth0Label);

  // Blinking status light
  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4cff91 })
  );
  statusLight.position.set(0.7, 0.35, 0.26);
  terminalGroup.add(statusLight);
  terminalGroup.userData.statusLight = statusLight;

  // Point light emanating from terminal
  const termLight = new THREE.PointLight(0x9ea0ff, 2, 6);
  termLight.position.set(0, 1.5, 1);
  terminalGroup.add(termLight);
  terminalGroup.userData.termLight = termLight;

  terminalGroup.position.set(0, 0, -6);
  scene.add(terminalGroup);

  // ── Terminal screen canvas (live updates) ────────────────
  const termCanvas = document.createElement('canvas');
  termCanvas.width = 256; termCanvas.height = 160;
  const termCtx = termCanvas.getContext('2d');
  const termTex = new THREE.CanvasTexture(termCanvas);
  termScreen.material = new THREE.MeshBasicMaterial({ map: termTex });

  function updateTerminalScreen(lines, color = '#4cff91') {
    termCtx.fillStyle = '#050510';
    termCtx.fillRect(0, 0, 256, 160);
    termCtx.fillStyle = '#9ea0ff';
    termCtx.font = 'bold 11px monospace';
    termCtx.fillText('> AUTH0 TERMINAL', 8, 16);
    termCtx.fillStyle = '#9ea0ff33';
    termCtx.fillRect(0, 20, 256, 1);
    termCtx.fillStyle = color;
    termCtx.font = '10px monospace';
    lines.forEach((l, i) => termCtx.fillText(l, 8, 36 + i * 14));
    termTex.needsUpdate = true;
  }

  updateTerminalScreen(['Initializing...', 'Waiting for agents...']);

  // ── Validation beam (agent → terminal) ──────────────────
  // We'll draw a line from agent to terminal during validation
  const beamMat = new THREE.LineBasicMaterial({ color: 0x9ea0ff, transparent: true, opacity: 0.8 });
  let activeBeam = null;

  function showBeam(fromPos, toPos, color = 0x9ea0ff) {
    if (activeBeam) { scene.remove(activeBeam); activeBeam = null; }
    const points = [fromPos.clone(), toPos.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    activeBeam = new THREE.Line(geo, mat);
    scene.add(activeBeam);
    setTimeout(() => {
      if (activeBeam) { scene.remove(activeBeam); activeBeam = null; }
    }, 3000);
  }

  // ── Validation flash ring around avatar ─────────────────
  function flashAvatar(agentId, color) {
    const avatar = avatars[agentId];
    if (!avatar) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(avatar.position);
    ring.position.y = 0.05;
    scene.add(ring);

    let t = 0;
    const interval = setInterval(() => {
      t += 0.05;
      ring.material.opacity = 0.9 * (1 - t / 1.5);
      ring.scale.setScalar(1 + t * 1.5);
      if (t >= 1.5) { clearInterval(interval); scene.remove(ring); }
    }, 30);
  }

  // Particles (floating data dots)
  const particleGeo = new THREE.BufferGeometry();
  const pCount = 120;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3]     = (Math.random() - 0.5) * ROOM_W;
    pPos[i * 3 + 1] = Math.random() * ROOM_H;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * ROOM_D;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ color: 0x9ea0ff, size: 0.06, transparent: true, opacity: 0.5 })
  );
  scene.add(particles);

  // ── Animation Loop ───────────────────────────────────────
  const clock = new THREE.Clock();

  function animateAvatar(avatar, state, dt) {
    const t = state.animTime;

    const legL = avatar.getObjectByName('legL');
    const legR = avatar.getObjectByName('legR');
    const armL = avatar.getObjectByName('armL');
    const armR = avatar.getObjectByName('armR');

    if (state.state === 'walking') {
      const swing = Math.sin(t * 6) * 0.3;
      if (legL) legL.rotation.x =  swing;
      if (legR) legR.rotation.x = -swing;
      if (armL) armL.rotation.x = -swing * 0.5;
      if (armR) armR.rotation.x =  swing * 0.5;
      // Bob
      avatar.position.y = Math.abs(Math.sin(t * 6)) * 0.04;
    } else if (state.state === 'working') {
      // Typing animation
      if (armR) armR.rotation.x = -0.6 + Math.sin(t * 8) * 0.15;
      if (armL) armL.rotation.x = -0.5 + Math.sin(t * 8 + 1) * 0.1;
      if (legL) legL.rotation.x = 0;
      if (legR) legR.rotation.x = 0;
      avatar.position.y = 0;
    } else if (state.state === 'talking') {
      // Gesturing
      if (armR) armR.rotation.x = -0.8 + Math.sin(t * 4) * 0.4;
      if (armL) armL.rotation.x = -0.3;
      avatar.position.y = Math.sin(t * 3) * 0.02;
    } else {
      // Idle — subtle breathing
      avatar.position.y = Math.sin(t * 1.5) * 0.015;
      if (armL) armL.rotation.x = 0;
      if (armR) armR.rotation.x = 0;
    }
  }

  function moveAvatar(avatar, state, dt) {
    if (state.state !== 'walking') return;

    const pos = avatar.position;
    const target = state.target;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.15) {
      const speed = 2.5;
      pos.x += (dx / dist) * speed * dt;
      pos.z += (dz / dist) * speed * dt;
      // Face direction
      avatar.rotation.y = Math.atan2(dx, dz);
    } else {
      // Arrived
      state.state = 'working';
      state.walkTimer = 8 + Math.random() * 10;
    }
  }

  function updateAgentAI(id, dt) {
    const state = agentStates[id];
    const avatar = avatars[id];
    state.animTime += dt;
    state.walkTimer -= dt;

    if (state.state === 'working' && state.walkTimer <= 0) {
      // Decide: go to desk, center table, or another agent
      const roll = Math.random();
      if (roll < 0.5) {
        // Go back to desk
        state.target = state.deskPos.clone();
        state.state = 'walking';
      } else if (roll < 0.75) {
        // Go to center table
        state.target = new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          0,
          (Math.random() - 0.5) * 1.5
        );
        state.state = 'walking';
        state.walkTimer = 5 + Math.random() * 5;
      } else {
        // Walk toward another agent
        const others = Object.keys(avatars).filter(k => k !== id);
        const targetId = others[Math.floor(Math.random() * others.length)];
        const tPos = avatars[targetId].position;
        state.target = new THREE.Vector3(tPos.x + 0.8, 0, tPos.z + 0.8);
        state.state = 'walking';
        state.talkTarget = targetId;
        state.walkTimer = 4 + Math.random() * 4;
      }
    }

    if (state.state === 'idle' && state.walkTimer <= 0) {
      state.state = 'working';
      state.walkTimer = 6 + Math.random() * 8;
    }

    moveAvatar(avatar, state, dt);
    animateAvatar(avatar, state, dt);
  }

  // ── Particle drift ───────────────────────────────────────
  function driftParticles(dt) {
    const pos = particleGeo.attributes.position.array;
    for (let i = 0; i < pCount; i++) {
      pos[i * 3 + 1] += dt * 0.15;
      if (pos[i * 3 + 1] > ROOM_H) pos[i * 3 + 1] = 0;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    updateCamera();
    Object.keys(agentStates).forEach(id => updateAgentAI(id, dt));
    driftParticles(dt);

    // Blink terminal status light
    const sl = terminalGroup.userData.statusLight;
    if (sl) sl.material.opacity = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);

    // Pulse terminal light intensity
    const tl = terminalGroup.userData.termLight;
    if (tl) tl.intensity = 1.5 + 0.5 * Math.sin(Date.now() * 0.002);

    renderer.render(scene, camera);
  }
  animate();

  // ── Resize ───────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  // ── Public API — called from agents.js / auth0-monitor.js ──
  window.Room3D = {
    speak(agentId, text) {
      const avatar = avatars[agentId];
      if (!avatar) return;
      showBubble(avatar, text);
      const state = agentStates[agentId];
      state.state = 'talking';
      state.walkTimer = 4;
    },

    setWorking(agentId, taskText) {
      const state = agentStates[agentId];
      if (state) {
        state.state = 'working';
        state.walkTimer = 6 + Math.random() * 6;
      }
      if (desks[agentId]) updateScreen(desks[agentId], taskText);
    },

    walkTo(agentId, x, z) {
      const state = agentStates[agentId];
      if (state) {
        state.target = new THREE.Vector3(x, 0, z);
        state.state = 'walking';
      }
    },

    // Walk agent to the Auth0 terminal, show beam, then flash result
    validateAtTerminal(agentId, { userName, result, onArrival }) {
      const state  = agentStates[agentId];
      const avatar = avatars[agentId];
      if (!state || !avatar) return;

      // If this is just a result update (no walking needed), apply visuals directly
      if (result !== 'pending' && !onArrival) {
        const beamColor   = result === 'valid' ? 0x4cff91 : result === 'blocked' ? 0xff4444 : 0xffcc44;
        const statusLine  = result === 'valid'   ? '✅ ACCESS GRANTED'
                          : result === 'blocked' ? '🚫 ACCESS DENIED'
                                                 : '⚠️  SUSPICIOUS';
        const screenColor = result === 'valid' ? '#4cff91' : result === 'blocked' ? '#ff4444' : '#ffcc44';

        const avatarTop     = avatar.position.clone(); avatarTop.y = 1.5;
        const terminalFront = new THREE.Vector3(avatar.position.x, 1.5, -5.7);
        showBeam(avatarTop, terminalFront, beamColor);
        flashAvatar(agentId, beamColor);

        updateTerminalScreen([
          `Agent: ${agentId.toUpperCase()}`,
          `User: ${userName.substring(0, 20)}`,
          '─────────────────',
          statusLine,
          'Auth0 validated',
        ], screenColor);

        const sl = terminalGroup.userData.statusLight;
        if (sl) sl.material.color.setHex(beamColor);

        // Walk back to desk
        setTimeout(() => {
          state.target = state.deskPos.clone();
          state.state  = 'walking';
        }, 3000);
        return;
      }

      // Walk to terminal
      const termPos = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, -4.5);
      state.target    = termPos;
      state.state     = 'walking';
      state.walkTimer = 0;

      updateTerminalScreen([
        `Agent: ${agentId.toUpperCase()}`,
        'Validating user:',
        userName.substring(0, 22),
        '...',
        'Querying Auth0 API',
      ], '#ffcc44');

      // Poll until avatar arrives
      const checkArrival = setInterval(() => {
        const dx = avatar.position.x - termPos.x;
        const dz = avatar.position.z - termPos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
          clearInterval(checkArrival);
          if (onArrival) onArrival();
        }
      }, 200);
    },

    // Flash all agents (e.g. high-risk alert)
    alertAll(color = 0xff4444) {
      Object.keys(avatars).forEach(id => flashAvatar(id, color));
      updateTerminalScreen([
        '🚨 SECURITY ALERT',
        'High-risk event',
        'All agents notified',
        'Initiating lockdown',
      ], '#ff4444');
      const sl = terminalGroup.userData.statusLight;
      if (sl) sl.material.color.setHex(color);
    },

    updateTerminal(lines, color) {
      updateTerminalScreen(lines, color);
    },
  };

})();
