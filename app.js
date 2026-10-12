/**
 * NetVista 3D — Core Logic & Multi-Mode 3D Physical Link Hologram
 * Candidate: Bhavy Gol | Student ID: 25CS016
 * Topic: Bit Stuffing in HDLC Protocol | Course: ITUC201
 */

const HDLC_FLAG = "01111110";

// --- Pure HDLC Functions ---
function validateBinary(payload) {
  if (!payload) return "";
  const cleaned = payload.replace(/\s+/g, "");
  if (!/^[01]*$/.test(cleaned)) {
    throw new Error("Invalid character detected! Only binary '0' and '1' are permitted.");
  }
  return cleaned;
}

function senderBitStuffWithTrace(payload) {
  const clean = validateBinary(payload);
  const steps = [];
  const stuffedArray = [];
  let consecutiveOnes = 0;
  let stuffedZeroCount = 0;

  for (let i = 0; i < clean.length; i++) {
    const bit = clean[i];
    stuffedArray.push(bit);

    if (bit === '1') {
      consecutiveOnes++;
      if (consecutiveOnes === 5) {
        steps.push({
          step: steps.length + 1,
          idx: i + 1,
          bit: bit,
          onesCount: 5,
          action: "STUFF '0'",
          type: "stuff",
          streamSnapshot: stuffedArray.join("") + "0"
        });
        stuffedArray.push('0');
        stuffedZeroCount++;
        consecutiveOnes = 0; // reset
      } else {
        steps.push({
          step: steps.length + 1,
          idx: i + 1,
          bit: bit,
          onesCount: consecutiveOnes,
          action: "Keep",
          type: "keep",
          streamSnapshot: stuffedArray.join("")
        });
      }
    } else {
      consecutiveOnes = 0;
      steps.push({
        step: steps.length + 1,
        idx: i + 1,
        bit: bit,
        onesCount: 0,
        action: "Keep",
        type: "keep",
        streamSnapshot: stuffedArray.join("")
      });
    }
  }

  const stuffedPayload = stuffedArray.join("");
  const overheadPct = clean.length > 0 ? ((stuffedZeroCount / clean.length) * 100).toFixed(2) : "0.00";
  const framedStream = `${HDLC_FLAG} ${stuffedPayload} ${HDLC_FLAG}`;

  return {
    original: clean,
    stuffed: stuffedPayload,
    framed: framedStream,
    steps: steps,
    stuffedZeroCount: stuffedZeroCount,
    overheadPct: overheadPct
  };
}

function receiverBitDestuffWithTrace(stuffedPayload) {
  const clean = validateBinary(stuffedPayload);
  const destuffed = [];
  const steps = [];
  let consecutiveOnes = 0;
  let idx = 0;
  const n = clean.length;

  while (idx < n) {
    const bit = clean[idx];
    destuffed.push(bit);

    if (bit === '1') {
      consecutiveOnes++;
      if (consecutiveOnes === 5) {
        if (idx + 1 >= n) {
          throw new Error("Malformed stuffed stream: Payload ended right after five 1s without stuffed bit!");
        }
        const nextBit = clean[idx + 1];
        if (nextBit === '1') {
          throw new Error("Malformed stuffed stream: Found six consecutive 1s in stuffed payload! Violation of HDLC bit stuffing rule.");
        }
        steps.push({
          step: steps.length + 1,
          idx: idx + 1,
          bit: bit,
          onesCount: 5,
          action: "DISCARD '0'",
          type: "discard",
          restoredSnapshot: destuffed.join("")
        });
        // Skip stuffed '0'
        idx += 2;
        consecutiveOnes = 0;
        continue;
      } else {
        steps.push({
          step: steps.length + 1,
          idx: idx + 1,
          bit: bit,
          onesCount: consecutiveOnes,
          action: "Keep",
          type: "keep",
          restoredSnapshot: destuffed.join("")
        });
      }
    } else {
      consecutiveOnes = 0;
      steps.push({
        step: steps.length + 1,
        idx: idx + 1,
        bit: bit,
        onesCount: 0,
        action: "Keep",
        type: "keep",
        restoredSnapshot: destuffed.join("")
      });
    }
    idx++;
  }

  return {
    destuffed: destuffed.join(""),
    steps: steps
  };
}

// --- 3D Three.js Visualization ---
let scene, camera, renderer, bitGroup, controls;
let current3DMode = "orbital"; // "orbital" or "linear"
let is3DSpinning = true;
let transmitterNode, receiverNode, transmissionBeam;
let particlesMesh;
let cachedPayload = "011111101111101";

function init3DVisualizer() {
  const container = document.getElementById("three-canvas");
  if (!container) return;

  const width = container.clientWidth || 550;
  const height = container.clientHeight || 480;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040711);
  scene.fog = new THREE.FogExp2(0x040711, 0.025);

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 5, 20);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  // Orbit Controls
  if (window.THREE && THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 45;
    controls.minDistance = 5;
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
  keyLight.position.set(6, 15, 10);
  scene.add(keyLight);

  const fillMagenta = new THREE.PointLight(0xf43f5e, 2, 40);
  fillMagenta.position.set(-8, -2, 6);
  scene.add(fillMagenta);

  const fillCyan = new THREE.PointLight(0x06b6d4, 2, 40);
  fillCyan.position.set(8, 4, -4);
  scene.add(fillCyan);

  // Holographic Grid Floor
  const gridHelper = new THREE.GridHelper(36, 36, 0x06b6d4, 0x1e293b);
  gridHelper.position.y = -3.8;
  scene.add(gridHelper);

  // Cosmic Background Data Particles
  const particleCount = 200;
  const partGeom = new THREE.BufferGeometry();
  const partPositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i += 3) {
    partPositions[i] = (Math.random() - 0.5) * 50;
    partPositions[i + 1] = (Math.random() - 0.5) * 30;
    partPositions[i + 2] = (Math.random() - 0.5) * 50;
  }
  partGeom.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
  const partMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.15,
    transparent: true,
    opacity: 0.5
  });
  particlesMesh = new THREE.Points(partGeom, partMat);
  scene.add(particlesMesh);

  // Group for Bits & Hardware Stations
  bitGroup = new THREE.Group();
  scene.add(bitGroup);

  // Initial build
  update3DStream(cachedPayload);

  // Animate loop
  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    
    // Auto-spin logic depending on mode
    if (bitGroup) {
      if (is3DSpinning) {
        if (current3DMode === "orbital") {
          bitGroup.rotation.y += 0.005;
        } else {
          // In linear mode, subtle gentle sway
          bitGroup.rotation.y = Math.sin(Date.now() * 0.0008) * 0.15;
        }
      }

      // Dynamic floating pulsation on data bits
      const time = Date.now() * 0.003;
      bitGroup.children.forEach((child, index) => {
        if (child.userData && child.userData.isBit) {
          child.position.y = child.userData.baseY + Math.sin(time + index * 0.35) * 0.18;
          if (child.userData.isStuffed) {
            // Spin stuffed bits individually for dramatic distinction!
            child.rotation.y += 0.02;
          }
        }
      });
    }

    if (particlesMesh) {
      particlesMesh.rotation.y += 0.0003;
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    if (!container || !renderer || !camera) return;
    const newW = container.clientWidth;
    const newH = container.clientHeight;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
  });
}

function update3DStream(originalPayload) {
  cachedPayload = originalPayload;
  if (!bitGroup) return;

  // Clear previous objects
  while (bitGroup.children.length > 0) {
    const obj = bitGroup.children[0];
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
    bitGroup.remove(obj);
  }

  // Materials
  const matBitOne = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.3,
    roughness: 0.1,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4
  });

  const matBitZero = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.1,
    roughness: 0.5,
    emissive: 0x1e293b,
    emissiveIntensity: 0.2
  });

  const matBitStuffed = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    metalness: 0.4,
    roughness: 0.1,
    emissive: 0xe11d48,
    emissiveIntensity: 0.9
  });

  const matFlag = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    metalness: 0.3,
    roughness: 0.2,
    emissive: 0x7e22ce,
    emissiveIntensity: 0.5
  });

  const matStation = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    metalness: 0.5,
    roughness: 0.2,
    emissive: 0x059669,
    emissiveIntensity: 0.6
  });

  // Build Sequence: Flag (8) + Stuffed Payload + Flag (8)
  const fullSequence = [
    ...HDLC_FLAG.split("").map(b => ({ val: b, type: "flag" })),
    ...buildStuffedAnnotated(originalPayload),
    ...HDLC_FLAG.split("").map(b => ({ val: b, type: "flag" }))
  ];

  const total = fullSequence.length;

  if (current3DMode === "orbital") {
    // Mode A: Circular Orbital Frame Ring
    const radius = 6.4;

    fullSequence.forEach((item, i) => {
      const angle = (i / total) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const baseY = (i % 2 === 0 ? 0.25 : -0.25);

      let mat = matBitZero;
      let sizeY = 0.8;
      let isStuffed = false;

      if (item.type === "flag") {
        mat = matFlag;
        sizeY = 1.05;
      } else if (item.type === "stuffed") {
        mat = matBitStuffed;
        sizeY = 1.8; // Dramatic pillar!
        isStuffed = true;
      } else if (item.val === "1") {
        mat = matBitOne;
        sizeY = 1.2;
      }

      const geom = new THREE.BoxGeometry(0.65, sizeY, 0.65);
      const cube = new THREE.Mesh(geom, mat);
      cube.position.set(x, baseY, z);
      cube.rotation.y = -angle;

      cube.userData = {
        isBit: true,
        baseY: baseY,
        isStuffed: isStuffed,
        bitVal: item.val,
        bitType: item.type
      };

      // Outer outline edge
      const wireGeom = new THREE.EdgesGeometry(geom);
      const wireMat = new THREE.LineBasicMaterial({
        color: isStuffed ? 0xffffff : 0x38bdf8,
        linewidth: 1
      });
      cube.add(new THREE.LineSegments(wireGeom, wireMat));

      bitGroup.add(cube);
    });

    // Central Holographic HDLC Transceiver Station
    const coreGeom = new THREE.IcosahedronGeometry(1.6, 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      wireframe: true,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.6
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    bitGroup.add(coreMesh);

    // Inner orbital glowing ring
    const ringGeom = new THREE.TorusGeometry(radius, 0.04, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.4 });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    bitGroup.add(ringMesh);

  } else {
    // Mode B: Point-to-Point Physical Link Line (Transmitter -> Channel -> Receiver)
    const spacing = 1.1;
    const startX = -((total - 1) * spacing) / 2;

    // Sender Station Tower (Left)
    const txGeom = new THREE.CylinderGeometry(0.8, 1.2, 3, 16);
    transmitterNode = new THREE.Mesh(txGeom, matStation);
    transmitterNode.position.set(startX - 2.5, 0, 0);
    bitGroup.add(transmitterNode);

    // Receiver Station Tower (Right)
    const rxGeom = new THREE.CylinderGeometry(0.8, 1.2, 3, 16);
    receiverNode = new THREE.Mesh(rxGeom, matStation);
    receiverNode.position.set(-startX + 2.5, 0, 0);
    bitGroup.add(receiverNode);

    // Channel Laser Path
    const channelGeom = new THREE.CylinderGeometry(0.04, 0.04, Math.abs(startX * 2) + 5, 8);
    const channelMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.5 });
    transmissionBeam = new THREE.Mesh(channelGeom, channelMat);
    transmissionBeam.rotation.z = Math.PI / 2;
    transmissionBeam.position.set(0, -0.4, 0);
    bitGroup.add(transmissionBeam);

    fullSequence.forEach((item, i) => {
      const x = startX + i * spacing;
      const baseY = (i % 2 === 0 ? 0.3 : -0.3);

      let mat = matBitZero;
      let sizeY = 0.8;
      let isStuffed = false;

      if (item.type === "flag") {
        mat = matFlag;
        sizeY = 1.1;
      } else if (item.type === "stuffed") {
        mat = matBitStuffed;
        sizeY = 1.8;
        isStuffed = true;
      } else if (item.val === "1") {
        mat = matBitOne;
        sizeY = 1.2;
      }

      const geom = new THREE.BoxGeometry(0.7, sizeY, 0.7);
      const cube = new THREE.Mesh(geom, mat);
      cube.position.set(x, baseY, 0);

      cube.userData = {
        isBit: true,
        baseY: baseY,
        isStuffed: isStuffed,
        bitVal: item.val,
        bitType: item.type
      };

      const wireGeom = new THREE.EdgesGeometry(geom);
      const wireMat = new THREE.LineBasicMaterial({
        color: isStuffed ? 0xffffff : 0x38bdf8,
        linewidth: 1
      });
      cube.add(new THREE.LineSegments(wireGeom, wireMat));

      bitGroup.add(cube);
    });
  }
}

function buildStuffedAnnotated(payload) {
  const clean = validateBinary(payload);
  const res = [];
  let ones = 0;
  for (let bit of clean) {
    res.push({ val: bit, type: bit === '1' ? 'one' : 'zero' });
    if (bit === '1') {
      ones++;
      if (ones === 5) {
        res.push({ val: '0', type: 'stuffed' });
        ones = 0;
      }
    } else {
      ones = 0;
    }
  }
  return res;
}

// 3D Controls
function switch3DMode(mode) {
  current3DMode = mode;
  const btnOrbital = document.getElementById("mode-orbital-btn");
  const btnLinear = document.getElementById("mode-linear-btn");

  if (btnOrbital && btnLinear) {
    if (mode === "orbital") {
      btnOrbital.classList.add("active-3d-btn");
      btnLinear.classList.remove("active-3d-btn");
    } else {
      btnLinear.classList.add("active-3d-btn");
      btnOrbital.classList.remove("active-3d-btn");
    }
  }

  update3DStream(cachedPayload);
  reset3DCamera();
}

function toggle3DRotation() {
  is3DSpinning = !is3DSpinning;
  const btn = document.getElementById("toggle-spin-btn");
  if (btn) btn.innerText = is3DSpinning ? "Auto Spin: ON" : "Auto Spin: OFF";
}

function reset3DCamera() {
  if (camera && controls) {
    if (current3DMode === "orbital") {
      camera.position.set(0, 5, 20);
    } else {
      camera.position.set(0, 4, 25);
    }
    controls.reset();
  }
}

// --- UI Interaction & Pipeline Runner ---
function runSimulationPipeline() {
  const inputEl = document.getElementById("payload-input");
  const rawInput = inputEl.value.trim();
  const alertBox = document.getElementById("sim-error-alert");

  try {
    if (alertBox) alertBox.style.display = "none";
    const senderRes = senderBitStuffWithTrace(rawInput);
    const receiverRes = receiverBitDestuffWithTrace(senderRes.stuffed);

    // Verify roundtrip identity
    const isPass = senderRes.original === receiverRes.destuffed;

    // Render Ribbons
    renderRibbon("original-ribbon", senderRes.original, "original");
    renderRibbon("stuffed-ribbon", senderRes.stuffed, "stuffed", senderRes.steps);
    renderFramedRibbon("framed-ribbon", senderRes.stuffed);
    renderRibbon("restored-ribbon", receiverRes.destuffed, "restored");

    // Render Stats
    document.getElementById("stat-orig-len").innerText = `${senderRes.original.length} bits`;
    document.getElementById("stat-stuffed-len").innerText = `${senderRes.stuffed.length} bits`;
    document.getElementById("stat-stuffed-count").innerText = `${senderRes.stuffedZeroCount} zeros`;
    document.getElementById("stat-overhead").innerText = `${senderRes.overheadPct}%`;
    
    const statusPill = document.getElementById("stat-status-pill");
    if (statusPill) {
      statusPill.innerHTML = isPass ? 
        `<span style="color:#10b981;font-weight:700;">PASS (100% Verified Identity)</span>` : 
        `<span style="color:#ef4444;font-weight:700;">FAIL (Mismatch)</span>`;
    }

    // Render Trace Tables
    renderTraceTable("sender-trace-body", senderRes.steps);
    renderReceiverTraceTable("receiver-trace-body", receiverRes.steps);

    // Update 3D Canvas
    update3DStream(senderRes.original);

  } catch (err) {
    if (alertBox) {
      alertBox.innerText = err.message;
      alertBox.style.display = "block";
    }
  }
}

function renderRibbon(elementId, bitStr, mode, steps = []) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = "";

  if (!bitStr) {
    container.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem;">(Empty Stream)</span>`;
    return;
  }

  // Mark inserted zero positions
  const stuffedIndices = new Set();
  if (mode === "stuffed" && steps) {
    let ones = 0;
    for (let i = 0; i < bitStr.length; i++) {
      if (bitStr[i] === '1') {
        ones++;
        if (ones === 5 && i + 1 < bitStr.length && bitStr[i+1] === '0') {
          stuffedIndices.add(i + 1);
          ones = 0;
        }
      } else {
        if (!stuffedIndices.has(i)) ones = 0;
      }
    }
  }

  for (let i = 0; i < bitStr.length; i++) {
    const bit = bitStr[i];
    const isStuffed = stuffedIndices.has(i);
    const div = document.createElement("div");
    
    let cls = bit === '1' ? "bit-cell val-1" : "bit-cell val-0";
    if (isStuffed) cls = "bit-cell val-stuffed";

    div.className = cls;
    div.innerHTML = `<span>${bit}</span><span class="bit-idx">${i+1}</span>`;
    div.title = isStuffed ? `Stuffed '0' bit inserted after five 1s` : `Bit at position ${i+1}: ${bit}`;
    container.appendChild(div);
  }
}

function renderFramedRibbon(elementId, stuffedBitStr) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = "";

  // Opening Flag
  const openFlagSpan = document.createElement("span");
  openFlagSpan.className = "bit-cell val-flag";
  openFlagSpan.style.width = "auto";
  openFlagSpan.style.padding = "0 10px";
  openFlagSpan.innerHTML = `<span>FLAG: ${HDLC_FLAG}</span><span class="bit-idx">Start Delimiter</span>`;
  container.appendChild(openFlagSpan);

  // Stuffed Payload preview
  const payloadSpan = document.createElement("span");
  payloadSpan.style.margin = "0 10px";
  payloadSpan.style.color = "#38bdf8";
  payloadSpan.style.fontFamily = "monospace";
  payloadSpan.style.fontWeight = "700";
  payloadSpan.innerText = stuffedBitStr || "(Empty)";
  container.appendChild(payloadSpan);

  // Closing Flag
  const closeFlagSpan = document.createElement("span");
  closeFlagSpan.className = "bit-cell val-flag";
  closeFlagSpan.style.width = "auto";
  closeFlagSpan.style.padding = "0 10px";
  closeFlagSpan.innerHTML = `<span>FLAG: ${HDLC_FLAG}</span><span class="bit-idx">End Delimiter</span>`;
  container.appendChild(closeFlagSpan);
}

function renderTraceTable(bodyId, steps) {
  const tbody = document.getElementById(bodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  steps.forEach(s => {
    const tr = document.createElement("tr");
    const isStuff = s.type === "stuff";
    tr.innerHTML = `
      <td>${s.step}</td>
      <td><strong>${s.idx}</strong></td>
      <td><code>${s.bit}</code></td>
      <td>${s.onesCount}</td>
      <td><span class="${isStuff ? 'badge-stuff' : 'badge-keep'}">${s.action}</span></td>
      <td style="font-family:monospace;letter-spacing:1px;color:${isStuff ? '#f43f5e' : '#94a3b8'};">${s.streamSnapshot}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderReceiverTraceTable(bodyId, steps) {
  const tbody = document.getElementById(bodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  steps.forEach(s => {
    const tr = document.createElement("tr");
    const isDiscard = s.type === "discard";
    tr.innerHTML = `
      <td>${s.step}</td>
      <td><strong>${s.idx}</strong></td>
      <td><code>${s.bit}</code></td>
      <td>${s.onesCount}</td>
      <td><span class="${isDiscard ? 'badge-stuff' : 'badge-keep'}">${s.action}</span></td>
      <td style="font-family:monospace;letter-spacing:1px;color:#38bdf8;">${s.restoredSnapshot}</td>
    `;
    tbody.appendChild(tr);
  });
}

function setPreset(val) {
  const inputEl = document.getElementById("payload-input");
  if (inputEl) {
    inputEl.value = val;
    runSimulationPipeline();
  }
}

// Tab Switching
function switchTab(evt, tabId) {
  const tabPanes = document.querySelectorAll(".tab-pane");
  tabPanes.forEach(pane => pane.classList.remove("active"));

  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => btn.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add("active");

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("active");
  }
}

// Lightbox Modal for Screenshots
function openImageModal(imgSrc, title) {
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-img");
  const modalTitle = document.getElementById("modal-title");
  if (modal && modalImg && modalTitle) {
    modalImg.src = imgSrc;
    modalTitle.innerText = title;
    modal.style.display = "flex";
  }
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");
  if (modal) modal.style.display = "none";
}

const DOC_URLS = {
  "tech_doc": {
    title: "Technical Assessment Report & Documentation (Bhavy Gol - 25CS016)",
    url: "docs/25CS016_technical_document.pdf#toolbar=1&navpanes=0&view=FitH"
  },
  "slides": {
    title: "Presentation Slides Defense Deck (Bhavy Gol - 25CS016)",
    url: "docs/25CS016_Presentation_slides.pdf#toolbar=1&navpanes=0&view=FitH"
  },
  "results": {
    title: "Solved Exam Question & Additional Results (Bhavy Gol - 25CS016)",
    url: "docs/25CS016_Additional_results.pdf#toolbar=1&navpanes=0&view=FitH"
  }
};

function openPdfModal(docKeyOrUrl, title) {
  const modal = document.getElementById("pdf-modal");
  const iframe = document.getElementById("pdf-iframe");
  const titleEl = document.getElementById("pdf-modal-title");
  const openTabEl = document.getElementById("pdf-open-newtab");

  if (!modal || !iframe) return;

  let targetUrl = docKeyOrUrl;
  let docTitle = title || "Document Viewer";

  if (DOC_URLS[docKeyOrUrl]) {
    targetUrl = DOC_URLS[docKeyOrUrl].url;
    docTitle = DOC_URLS[docKeyOrUrl].title;
  }

  // Set clean title and raw link
  if (titleEl) titleEl.innerText = docTitle;
  if (openTabEl) openTabEl.href = targetUrl.split('#')[0];

  // Load exact vector PDF inside modal frame
  iframe.src = targetUrl;

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closePdfModal() {
  const modal = document.getElementById("pdf-modal");
  const iframe = document.getElementById("pdf-iframe");
  if (modal) {
    modal.style.display = "none";
    if (iframe) iframe.src = "";
    document.body.style.overflow = "";
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeImageModal();
    closePdfModal();
  }
});

// Initialize benchmark chart using Chart.js
function initBenchmarkChart() {
  const ctx = document.getElementById("overheadChart");
  if (!ctx || !window.Chart) return;

  const labels = [
    "Case 1 (Alt)", "Case 2 (5x 1s)", "Case 3 (6x 1s)", "Case 4 (Flag)", 
    "Case 5 (Multi)", "Case 6 (10x 1s)", "Case 7 (0s)", "Case 10 (20x 1s)", 
    "Synth P=0.2", "Synth P=0.4", "Synth P=0.6", "Synth P=0.8", "Synth P=0.9"
  ];
  const overheadData = [0.0, 20.0, 16.67, 12.5, 18.18, 20.0, 0.0, 20.0, 0.0, 0.0, 8.7, 10.81, 12.07];
  const oneDensityData = [50.0, 100.0, 100.0, 75.0, 90.91, 100.0, 0.0, 100.0, 26.0, 38.3, 69.57, 89.19, 86.21];

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Bit Stuffing Overhead (%)',
          data: overheadData,
          backgroundColor: 'rgba(244, 63, 94, 0.75)',
          borderColor: '#f43f5e',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: '1-Bit Density (%)',
          data: oneDensityData,
          type: 'line',
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: '#06b6d4',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', font: { family: 'Inter' } }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#38bdf8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: 'Percentage (%)', color: '#94a3b8' }
        }
      }
    }
  });
}

// Window Onload Bootstrapper
window.addEventListener("DOMContentLoaded", () => {
  init3DVisualizer();
  runSimulationPipeline();
  initBenchmarkChart();
});
