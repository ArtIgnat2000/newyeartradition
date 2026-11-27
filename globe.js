import * as THREE from './vendor/three.module.js';

const places = window.mapLocations || {};
const CITY_KEYS = Object.keys(places).filter((key) => places[key].kind === 'city');
const instances = new Map();

function globePosition(latitude, longitude, radius = 1) {
  const phi = (longitude + 180) * Math.PI / 180;
  const theta = (90 - latitude) * Math.PI / 180;
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta) * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
  );
}

function initGlobe(stage) {
  const canvasHost = stage.querySelector('.globe-canvas');
  const labelsHost = stage.querySelector('.globe-labels');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 3.15);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xb6d5ff, 1.55));
  const keyLight = new THREE.DirectionalLight(0xfff4dd, 2.25);
  keyLight.position.set(-2.5, 2.2, 4);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x3579bc, 1.1);
  fillLight.position.set(3, -1.2, -3);
  scene.add(fillLight);

  const earthGroup = new THREE.Group();
  // Center the Eurasian continent toward the viewer on the first frame.
  earthGroup.rotation.set(0.98, THREE.MathUtils.degToRad(170), 0);
  scene.add(earthGroup);
  const sphereGeometry = new THREE.SphereGeometry(1, 96, 72);
  const earthMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, map: null });
  const earth = new THREE.Mesh(sphereGeometry, earthMaterial);
  earthGroup.add(earth);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x6ebcff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
  );
  earthGroup.add(atmosphere);

  const labels = new Map();
  const markers = new Map();
  const markerRaycaster = new THREE.Raycaster();
  const markerPointer = new THREE.Vector2();
  function addPlace(key) {
    const place = places[key];
    if (!place || markers.has(key)) return;
    const selected = key === stage.dataset.focus;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(selected ? 0.018 : 0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: selected ? 0xffde85 : 0xffffff, depthTest: true }),
    );
    marker.position.copy(globePosition(place.lat, place.lon, 1.012));
    marker.userData.placeKey = key;
    earthGroup.add(marker);
    markers.set(key, marker);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'globe-city-label';
    label.dataset.key = key;
    label.textContent = place.label;
    label.setAttribute('aria-label', `${place.label}: открыть изображение города`);
    label.title = place.note;
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      if (place.image) window.openCityPreview?.(place.image, place.alt || place.label, `${place.label} · ${place.note}`);
      else if (window.openRegionMap) window.openRegionMap(key);
    });
    labelsHost.appendChild(label);
    labels.set(key, label);
  }
  CITY_KEYS.forEach(addPlace);
  if (stage.dataset.focus && places[stage.dataset.focus]?.kind === 'region') addPlace(stage.dataset.focus);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load('images/earth-blue-marble.jpg', (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    earthMaterial.map = texture;
    earthMaterial.needsUpdate = true;
    stage.classList.add('ready');
  }, undefined, () => {
    const status = stage.querySelector('.globe-status');
    status.textContent = 'Не удалось загрузить текстуру глобуса';
  });

  let radius = 3.15;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let resumeSpinAt = 0;
  let active = true;
  const pointerDown = (event) => {
    if (event.target.closest('.globe-controls,.globe-city-label')) return;
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    resumeSpinAt = performance.now() + 5000;
    renderer.domElement.setPointerCapture?.(event.pointerId);
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    previousX = event.clientX;
    previousY = event.clientY;
    earthGroup.rotation.y += dx * 0.006;
    earthGroup.rotation.x = THREE.MathUtils.clamp(earthGroup.rotation.x + dy * 0.004, -1.25, 1.25);
    resumeSpinAt = performance.now() + 5000;
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 6) return;

    const bounds = renderer.domElement.getBoundingClientRect();
    markerPointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    markerRaycaster.setFromCamera(markerPointer, camera);
    scene.updateMatrixWorld(true);
    const hit = markerRaycaster.intersectObjects([...markers.values()], false)[0];
    const place = hit && places[hit.object.userData.placeKey];
    if (place?.image) window.openCityPreview?.(place.image, place.alt || place.label, `${place.label} · ${place.note}`);
  });
  renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.002, 2.15, 5.5);
    camera.position.z = radius;
    resumeSpinAt = performance.now() + 3500;
  }, { passive: false });

  stage.querySelectorAll('[data-globe-action]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', () => {
      const action = button.dataset.globeAction;
      if (action === 'zoom-in') radius = Math.max(2.15, radius - 0.28);
      if (action === 'zoom-out') radius = Math.min(5.5, radius + 0.28);
      if (action === 'reset') {
        radius = 3.15;
        earthGroup.rotation.set(0.98, THREE.MathUtils.degToRad(170), 0);
      }
      camera.position.z = radius;
      resumeSpinAt = performance.now() + 4500;
    });
  });

  function resize() {
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  const projected = new THREE.Vector3();
  const viewed = new THREE.Vector3();
  function render(now) {
    if (!active) return;
    const dialogOpen = stage.closest('.globe-modal')?.classList.contains('open');
    const slideActive = stage.closest('.slide')?.classList.contains('active');
    if (document.hidden || (!dialogOpen && !slideActive)) { requestAnimationFrame(render); return; }
    if (!dragging && now > resumeSpinAt) earthGroup.rotation.y += 0.001;
    renderer.render(scene, camera);
    for (const [key, marker] of markers) {
      const label = labels.get(key);
      marker.getWorldPosition(projected);
      viewed.copy(projected).applyMatrix4(camera.matrixWorldInverse);
      projected.project(camera);
      const visible = viewed.z < -0.015 && projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15;
      label.hidden = !visible;
      if (visible) {
        label.style.left = `${(projected.x * 0.5 + 0.5) * stage.clientWidth}px`;
        label.style.top = `${(-projected.y * 0.5 + 0.5) * stage.clientHeight}px`;
      }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  return {
    focus(key) {
      if (!places[key]) return;
      const place = places[key];
      const focusedPlaces = place.group || [key];
      focusedPlaces.forEach((placeKey) => { if (!markers.has(placeKey)) addPlace(placeKey); });
      if (!place.group && !markers.has(key)) addPlace(key);
      for (const [placeKey, marker] of markers) {
        const selected = placeKey === key || focusedPlaces.includes(placeKey);
        marker.material.color.set(selected ? 0xffde85 : 0xffffff);
        marker.scale.setScalar(placeKey === key ? 1.5 : 1);
        labels.get(placeKey)?.classList.toggle('is-selected', selected);
      }
      // Rotate the selected longitude to the front without changing the drag controls.
      const targetYaw = THREE.MathUtils.degToRad(-90 - place.lon);
      earthGroup.rotation.y = targetYaw;
      const targetLat = THREE.MathUtils.degToRad(place.lat);
      earthGroup.rotation.x = THREE.MathUtils.clamp(targetLat, -1.1, 1.1);
      resumeSpinAt = performance.now() + 6000;
    },
    resize,
    destroy() { active = false; resizeObserver.disconnect(); renderer.dispose(); },
  };
}

function makeInstances() {
  document.querySelectorAll('.globe-stage').forEach((stage) => {
    if (instances.has(stage.dataset.globe)) return;
    try {
      instances.set(stage.dataset.globe, initGlobe(stage));
    } catch (error) {
      stage.querySelector('.globe-status').textContent = 'Для интерактивного глобуса нужен WebGL';
      console.error('Could not initialize Earth globe', error);
    }
  });
}

makeInstances();
window.focusGlobePlace = (key, name = 'modal') => instances.get(name)?.focus(key);
window.resizeGlobe = (name) => instances.get(name)?.resize();
