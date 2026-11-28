import { cityFrames, mapLocations } from "./deck-data.js";

const slides = [...document.querySelectorAll(".slide")],
  dots = document.getElementById("dots");
let current = 0;
let globeModulePromise = null;
const globeInstances = new Map();

function isGlobeVisible(name) {
  return name === "main"
    ? current === 1
    : document.getElementById("regionMapModal")?.classList.contains("open");
}

async function ensureGlobe(name) {
  try {
    globeModulePromise ??= import("./globe.js").catch((error) => {
      globeModulePromise = null;
      throw error;
    });
    const { mountGlobe } = await globeModulePromise;
    let globe = globeInstances.get(name);
    if (!globe) {
      globe = mountGlobe(name);
      if (globe) globeInstances.set(name, globe);
    }
    globe?.setActive(isGlobeVisible(name));
    return globe;
  } catch (error) {
    const stage = document.querySelector(`.globe-stage[data-globe="${name}"]`);
    const status = stage?.querySelector(".globe-status");
    if (status) status.textContent = "Не удалось загрузить глобус";
    console.error("Could not load the interactive globe", error);
    return null;
  }
}

function setGlobeActive(name, active) {
  globeInstances.get(name)?.setActive(active);
}

const narration = new Audio();
let playingNarration = null,
  activeVoiceButton = null;
function updateNavigation() {
  const first = current === 0,
    last = current === slides.length - 1;
  document.getElementById("previousSlide").disabled = first;
  document.getElementById("nextSlide").disabled = last;
  const counter = document.getElementById("counter");
  counter.textContent = `${current + 1} / ${slides.length}`;
  counter.setAttribute(
    "aria-label",
    `Слайд ${current + 1} из ${slides.length}: ${slides[current].dataset.title}`,
  );
}
function setVoiceButton(button, playing) {
  if (!button) return;
  button.classList.toggle("playing", playing);
  button.setAttribute("aria-pressed", String(playing));
  button.setAttribute(
    "aria-label",
    playing ? "Остановить озвучку" : "Прослушать озвучку",
  );
  button.title = playing ? "Остановить озвучку" : "Прослушать озвучку";
}
function stopNarration() {
  narration.pause();
  narration.currentTime = 0;
  playingNarration = null;
  setVoiceButton(activeVoiceButton, false);
  activeVoiceButton = null;
}
function playAudioFile(key, src, button) {
  if (playingNarration === key) {
    stopNarration();
    return;
  }
  stopNarration();
  playingNarration = key;
  activeVoiceButton = button || null;
  narration.src = src;
  narration.currentTime = 0;
  setVoiceButton(activeVoiceButton, true);
  narration.play().catch(() => stopNarration());
}
function playNarration(n, button) {
  playAudioFile(n, `audio/narration-${String(n).padStart(2, "0")}.mp3`, button);
}
narration.onended = () => {
  setVoiceButton(activeVoiceButton, false);
  playingNarration = null;
  activeVoiceButton = null;
  if (
    citySlideshowPlaying &&
    document.getElementById("imageViewer").classList.contains("city-show")
  )
    citySlideshowTimer = setTimeout(() => stepCitySlideshow(1), 850);
};
function goTo(i) {
  if (document.getElementById("imageViewer")?.classList.contains("city-show"))
    closeImageViewer();
  const target = Math.max(0, Math.min(slides.length - 1, i));
  if (target !== current) stopNarration();
  current = target;
  slides.forEach((s, n) => s.classList.toggle("active", n === current));
  [...dots.children].forEach((d, n) => {
    d.classList.toggle("active", n === current);
    d.setAttribute("aria-current", n === current ? "step" : "false");
  });
  updateNavigation();
  document.getElementById("progress").style.width =
    `${(100 * (current + 1)) / slides.length}%`;
  document.getElementById("deck").scrollTo({ top: 0, behavior: "smooth" });
  setGlobeActive("main", current === 1);
  if (current === 1) {
    void ensureGlobe("main").then((globe) => globe?.setActive(current === 1));
    document.querySelector(".route-lights")?.beginElement?.();
  }
}
function next() {
  goTo(current + 1);
}
function prev() {
  goTo(current - 1);
}
slides.forEach((slide) => {
  const mapButton = slide.querySelector(".region-map-trigger"),
    voiceButton = slide.querySelector(".voice-button");
  if (!mapButton && !voiceButton) return;
  const actions = document.createElement("div");
  actions.className = "slide-actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Действия слайда");
  if (mapButton) {
    mapButton.setAttribute(
      "aria-label",
      mapButton.getAttribute("aria-label")?.replace("на карте", "на глобусе") ||
        "Открыть глобус",
    );
    actions.append(mapButton);
  }
  if (voiceButton) actions.append(voiceButton);
  slide.append(actions);
});
slides.forEach((s, i) => {
  const b = document.createElement("button");
  b.className = "dot" + (i === 0 ? " active" : "");
  b.title = s.dataset.title;
  b.setAttribute("aria-label", `Слайд ${i + 1}: ${s.dataset.title}`);
  b.setAttribute("aria-current", i === 0 ? "step" : "false");
  b.dataset.slideIndex = String(i);
  dots.appendChild(b);
});
updateNavigation();
let mapReturnFocus = null,
  selectedPlaceKey = "kalmykia";
function openRegionMap(key) {
  const place = mapLocations[key];
  if (!place) return;
  selectedPlaceKey = key;
  mapReturnFocus = document.activeElement;
  document.getElementById("regionMapTitle").textContent = place.label;
  document.getElementById("regionMapNote").textContent =
    place.note + " · метка приблизительная";
  const link = document.getElementById("googleEarthLink");
  link.href = `https://earth.google.com/web/@${place.lat},${place.lon},1800000a,0d,35y,0h,0t,0r`;
  const modal = document.getElementById("regionMapModal");
  modal.hidden = false;
  modal.classList.add("open");
  document.getElementById("closeRegionMap").focus();
  void ensureGlobe("modal").then((globe) => {
    if (!globe || !modal.classList.contains("open")) return;
    globe.focus(key);
    requestAnimationFrame(() => {
      globe.resize();
      globe.setActive(modal.classList.contains("open"));
    });
  });
}
function openSelectedRegionMap() {
  const active = document.querySelector("#regionList .region-button.active");
  openRegionMap(active?.dataset.region || "kalmykia");
}
function closeRegionMap() {
  const modal = document.getElementById("regionMapModal");
  modal.classList.remove("open");
  modal.hidden = true;
  setGlobeActive("modal", false);
  if (mapReturnFocus?.isConnected) mapReturnFocus.focus();
}
const cityArtCards = cityFrames.map((frame, index) => ({
  index,
  title: frame.caption,
  alt: frame.alt,
}));
function renderCityGallery() {
  const host = document.getElementById("cityPreviewGrid");
  cityArtCards.forEach((card) => {
    const button = document.createElement("button");
    button.className = "city-preview";
    button.type = "button";
    button.setAttribute("aria-label", `Открыть рисунок: ${card.title}`);
    button.dataset.cityIndex = String(card.index);
    const image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 941;
    image.height = 1672;
    image.src = cityFrames[card.index].src;
    image.alt = card.alt;
    const title = document.createElement("span");
    title.textContent = card.title;
    button.append(image, title);
    host.append(button);
  });
}
renderCityGallery();
let cityFrameIndex = 0,
  citySlideshowTimer = null,
  citySlideshowPlaying = false,
  imageViewerReturnFocus = null;

function openImageViewerModal({ cityShow = false } = {}) {
  const viewer = document.getElementById("imageViewer");
  if (!viewer.classList.contains("open"))
    imageViewerReturnFocus = document.activeElement;
  viewer.classList.toggle("city-show", cityShow);
  viewer.classList.add("open");
  viewer.querySelector(".modal-close")?.focus();
}

function updateCityViewerControls() {
  const button = document.getElementById("viewerPlayPause");
  if (button) {
    button.textContent = citySlideshowPlaying
      ? "Ⅱ Остановить показ"
      : "▶ Запустить показ";
    button.setAttribute(
      "aria-label",
      citySlideshowPlaying ? "Остановить слайд-шоу" : "Запустить слайд-шоу",
    );
    button.setAttribute("aria-pressed", String(citySlideshowPlaying));
  }
}
function showCityFrame(index, { speak = citySlideshowPlaying } = {}) {
  cityFrameIndex = (index + cityFrames.length) % cityFrames.length;
  const frame = cityFrames[cityFrameIndex];
  const image = document.getElementById("viewerImage");
  image.decoding = "async";
  image.src = frame.src;
  image.alt = frame.alt;
  document.getElementById("viewerCaption").textContent = frame.caption;
  stopNarration();
  if (speak) playCityNarration(cityFrameIndex);
}
function playCityNarration(index = cityFrameIndex) {
  const frame = cityFrames[index];
  playAudioFile(
    `city-${index}`,
    frame.audio,
    document.getElementById("viewerNarration"),
  );
}
function openCitySlide(index) {
  stopCitySlideshow();
  showCityFrame(index, { speak: false });
  openImageViewerModal({ cityShow: true });
}
function startCitySlideshow() {
  openCitySlide(0);
  toggleCitySlideshow(true);
}
function stepCitySlideshow(delta) {
  if (!document.getElementById("imageViewer").classList.contains("city-show"))
    return;
  showCityFrame(cityFrameIndex + delta, { speak: citySlideshowPlaying });
}
function toggleCitySlideshow(force) {
  const play = force === undefined ? !citySlideshowPlaying : force;
  if (play) {
    if (citySlideshowTimer) clearTimeout(citySlideshowTimer);
    citySlideshowTimer = null;
    stopNarration();
    citySlideshowPlaying = true;
    updateCityViewerControls();
    playCityNarration(cityFrameIndex);
  } else stopCitySlideshow();
}
function stopCitySlideshow() {
  if (citySlideshowTimer) {
    clearTimeout(citySlideshowTimer);
    citySlideshowTimer = null;
  }
  const wasPlaying = citySlideshowPlaying;
  citySlideshowPlaying = false;
  if (
    wasPlaying &&
    typeof playingNarration === "string" &&
    playingNarration.startsWith("city-")
  )
    stopNarration();
  updateCityViewerControls();
}
function openCityPreview(src, alt, caption) {
  if (document.getElementById("regionMapModal").classList.contains("open"))
    closeRegionMap();
  const viewer = document.getElementById("imageViewer");
  stopCitySlideshow();
  viewer.classList.remove("city-show");
  stopNarration();
  const image = document.getElementById("viewerImage");
  image.decoding = "async";
  image.src = src;
  image.alt = alt;
  document.getElementById("viewerCaption").textContent = caption;
  openImageViewerModal();
}
function playVolgaNarration(button) {
  const selected = document.querySelector(".volga-region-choice.active");
  if (selected)
    playAudioFile(
      `volga-${selected.dataset.caption}`,
      selected.dataset.audio,
      button,
    );
}
function selectVolgaRegion(button) {
  const resumeVolgaNarration =
    typeof playingNarration === "string" &&
    playingNarration.startsWith("volga-");
  if (playingNarration !== null) stopNarration();
  document.querySelectorAll(".volga-region-choice").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  const image = document.getElementById("volgaImage");
  image.src = button.dataset.image;
  image.alt = button.dataset.alt;
  image.classList.remove("fade-in");
  void image.offsetWidth;
  image.classList.add("fade-in");
  document.getElementById("volgaCaption").textContent = button.dataset.caption;
  if (resumeVolgaNarration)
    playVolgaNarration(
      document.querySelector('[data-layout="volga"] .voice-button'),
    );
}
function selectRegion(button) {
  document
    .querySelectorAll(".region-button")
    .forEach((x) => x.classList.toggle("active", x === button));
  const img = document.getElementById("regionImage");
  img.src = button.dataset.image;
  img.alt = button.dataset.alt;
  img.classList.remove("fade-in");
  void img.offsetWidth;
  img.classList.add("fade-in");
  document.getElementById("regionCaption").textContent = button.dataset.name;
  selectedPlaceKey = button.dataset.region;
  const mapButton = document.getElementById("mapSelectedRegion");
  mapButton.setAttribute(
    "aria-label",
    `Показать ${mapLocations[selectedPlaceKey]?.label || "выбранный регион"} на глобусе`,
  );
}
function openImageViewer(imgId, captionId) {
  const img = document.getElementById(imgId);
  const viewerImage = document.getElementById("viewerImage");
  viewerImage.decoding = "async";
  viewerImage.src = img.src;
  viewerImage.alt = img.alt;
  document.getElementById("viewerCaption").textContent =
    document.getElementById(captionId).textContent;
  openImageViewerModal();
}
function closeImageViewer() {
  const viewer = document.getElementById("imageViewer");
  stopCitySlideshow();
  stopNarration();
  viewer.classList.remove("open", "city-show");
  if (imageViewerReturnFocus?.isConnected) imageViewerReturnFocus.focus();
  imageViewerReturnFocus = null;
}
document.getElementById("regionMapModal").addEventListener("click", (e) => {
  if (e.target.id === "regionMapModal") closeRegionMap();
});
async function toggleTheatre() {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    document.body.classList.toggle("theatre");
  }
}
window.openRegionMap = openRegionMap;
window.openCityPreview = openCityPreview;

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(
    "[data-action], [data-slide-index], [data-city-index]",
  );
  if (!trigger) return;

  if (trigger.hasAttribute("data-slide-index")) {
    goTo(Number(trigger.dataset.slideIndex));
    return;
  }
  if (trigger.hasAttribute("data-city-index")) {
    openCitySlide(Number(trigger.dataset.cityIndex));
    return;
  }

  switch (trigger.dataset.action) {
    case "play-narration":
      playNarration(Number(trigger.dataset.audioId), trigger);
      break;
    case "open-region-map":
      openRegionMap(trigger.dataset.regionKey);
      break;
    case "play-volga-narration":
      playVolgaNarration(trigger);
      break;
    case "open-selected-region-map":
      openSelectedRegionMap();
      break;
    case "start-city-slideshow":
      startCitySlideshow();
      break;
    case "go-to-start":
      goTo(0);
      break;
    case "previous-slide":
      prev();
      break;
    case "next-slide":
      next();
      break;
    case "toggle-theatre":
      toggleTheatre();
      break;
    case "close-region-map":
      closeRegionMap();
      break;
    case "close-image-viewer":
      closeImageViewer();
      break;
    case "step-city-slideshow":
      stepCitySlideshow(Number(trigger.dataset.delta));
      break;
    case "play-city-narration":
      playCityNarration();
      break;
    case "toggle-city-slideshow":
      toggleCitySlideshow();
      break;
    case "select-region":
      selectRegion(trigger);
      break;
    case "select-volga-region":
      selectVolgaRegion(trigger);
      break;
  }
});

function trapModalFocus(modal, event) {
  const items = [
    ...modal.querySelectorAll(
      'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((item) => !item.hidden && item.getClientRects().length);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", (e) => {
  const mapModal = document.getElementById("regionMapModal");
  if (mapModal.classList.contains("open")) {
    if (e.key === "Escape") closeRegionMap();
    else if (e.key === "Tab") trapModalFocus(mapModal, e);
    return;
  }
  const imageViewer = document.getElementById("imageViewer");
  if (imageViewer.classList.contains("open")) {
    if (e.key === "Escape") closeImageViewer();
    else if (e.key === "ArrowRight") stepCitySlideshow(1);
    else if (e.key === "ArrowLeft") stepCitySlideshow(-1);
    else if (e.key === "Tab") trapModalFocus(imageViewer, e);
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    prev();
  } else if (e.key === "Home") {
    e.preventDefault();
    goTo(0);
  } else if (e.key === "End") {
    e.preventDefault();
    goTo(slides.length - 1);
  } else if (e.key === " " && e.target === document.body) {
    e.preventDefault();
    next();
  } else if (e.key.toLowerCase() === "f") toggleTheatre();
  else if (e.key === "Escape" && document.fullscreenElement)
    document.exitFullscreen?.();
});
