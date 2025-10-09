const sceneElement = document.getElementById('scene');
const subtitleElement = document.querySelector('.top-bar__subtitle');
const leftColumn = document.getElementById('left-column');
const rightColumn = document.getElementById('right-column');
const sceneVideoContainer = document.getElementById('scene-video-container');
const sceneVideoElement = document.getElementById('scene-video');
const sceneVideoPlaceholder = document.getElementById('scene-video-placeholder');
const viewerControls = document.getElementById('viewer-controls');
const volumePanel = viewerControls?.querySelector('.viewer-controls__panel') ?? null;
const volumeToggle = viewerControls?.querySelector('.viewer-controls__toggle') ?? null;
const volumeSlider = viewerControls?.querySelector('.viewer-controls__slider') ?? null;
const volumeValue = viewerControls?.querySelector('.viewer-controls__value') ?? null;

let backgroundsById = {};
let charactersById = {};
let audioTracksById = {};
let videoTracksById = {};
let videoTracks = [];
let latestScene = null;
let resizeFrame = null;
let latestAudioMix = { tracks: [] };
const audioPlayers = new Map();
const AUDIO_SEEK_THRESHOLD = 0.25;
const LOCAL_STORAGE_VOLUME_KEY = 'viewer:volume';

let currentVideoSource = null;

let globalVolume = 1;

const SCENE_TYPE_CHARACTER = 'character';
const SCENE_TYPE_VIDEO = 'video';
const VIDEO_PLACEHOLDER_DEFAULT = 'Aucune vidéo en cours de diffusion.';
const VIDEO_PLACEHOLDER_MISSING = 'Aucune vidéo sélectionnée.';
const VIDEO_PLACEHOLDER_EMPTY = 'Aucune vidéo disponible.';
const VIDEO_PLACEHOLDER_INTERACTION = 'Appuyez pour autoriser la lecture de la vidéo.';

const audioUnlockState = {
  unlocked: false,
  requested: false,
  pointerHandler: null
};

const clampVolume = (value) => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
};

const computeEffectiveVolume = (volume) => {
  const base = Number.isFinite(volume) ? volume : 1;
  return clampVolume(base * globalVolume);
};

const showSceneVideoPlaceholder = (message) => {
  if (!sceneVideoPlaceholder) {
    return;
  }

  sceneVideoPlaceholder.hidden = false;
  sceneVideoPlaceholder.textContent = message;
};

const hideSceneVideoPlaceholder = () => {
  if (!sceneVideoPlaceholder) {
    return;
  }

  sceneVideoPlaceholder.hidden = true;
};

const updateSceneVideoVolume = () => {
  if (!sceneVideoElement) {
    return;
  }

  sceneVideoElement.volume = computeEffectiveVolume(1);
};

const stopSceneVideo = () => {
  if (!sceneVideoElement) {
    currentVideoSource = null;
    return;
  }

  try {
    sceneVideoElement.pause();
  } catch (error) {
    /* Ignore pause errors. */
  }

  sceneVideoElement.removeAttribute('src');

  try {
    sceneVideoElement.load();
  } catch (error) {
    /* Ignore load errors when resetting the element. */
  }

  currentVideoSource = null;
};

const updateAllPlayerVolumes = () => {
  audioPlayers.forEach((player) => {
    if (!player || !player.audio) {
      return;
    }

    player.audio.volume = computeEffectiveVolume(player.desiredVolume);
  });

  updateSceneVideoVolume();
};

const persistGlobalVolume = (value) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_VOLUME_KEY, value.toString());
  } catch (error) {
    /* Ignore persistence errors (e.g., storage disabled). */
  }
};

const createAudioPlayer = (source) => {
  const audioElement = new Audio(source);
  audioElement.preload = 'auto';
  audioElement.volume = computeEffectiveVolume(1);

  const player = {
    audio: audioElement,
    source,
    pendingSeek: null,
    lastPosition: undefined,
    desiredVolume: 1
  };

  audioElement.addEventListener('loadedmetadata', () => {
    if (player.pendingSeek === null || player.pendingSeek === undefined) {
      return;
    }

    try {
      audioElement.currentTime = player.pendingSeek;
    } catch (error) {
      // Ignore seek errors triggered by browsers that disallow immediate seeking.
    }

    player.pendingSeek = null;
  });

  return player;
};

const ensureAudioPlayer = (id, source) => {
  if (!id || !source) {
    return null;
  }

  let player = audioPlayers.get(id);

  if (!player) {
    player = createAudioPlayer(source);
    audioPlayers.set(id, player);
    return player;
  }

  if (player.source !== source) {
    player.audio.pause();
    player.audio.src = source;
    player.source = source;
    player.pendingSeek = null;
    player.lastPosition = undefined;
    player.desiredVolume = 1;

    try {
      player.audio.currentTime = 0;
    } catch (error) {
      // Ignore seek reset errors.
    }
  }

  return player;
};

const seekAudioPlayer = (player, position) => {
  if (!player || !player.audio) {
    return;
  }

  if (!Number.isFinite(position) || position < 0) {
    return;
  }

  const { audio } = player;
  const difference = Math.abs((audio.currentTime ?? 0) - position);
  const requiresSeek =
    player.lastPosition === undefined ||
    difference > AUDIO_SEEK_THRESHOLD ||
    audio.paused;

  player.lastPosition = position;

  if (!requiresSeek) {
    return;
  }

  if (audio.readyState >= 1) {
    try {
      audio.currentTime = position;
      player.pendingSeek = null;
      return;
    } catch (error) {
      // Ignore seek errors and fall back to pending seek.
    }
  }

  player.pendingSeek = position;
};

const cancelAudioUnlockRequest = () => {
  if (audioUnlockState.pointerHandler) {
    window.removeEventListener('pointerdown', audioUnlockState.pointerHandler);
    audioUnlockState.pointerHandler = null;
  }

  audioUnlockState.requested = false;
};

const markAudioUnlocked = () => {
  if (audioUnlockState.unlocked) {
    return;
  }

  audioUnlockState.unlocked = true;
  cancelAudioUnlockRequest();
};

const unlockAudioPlayback = () => {
  const players = Array.from(audioPlayers.values());

  if (!players.length) {
    markAudioUnlocked();
    return;
  }

  players.forEach((player) => {
    const { audio, desiredVolume } = player;

    try {
      audio.muted = false;
      audio.volume = computeEffectiveVolume(desiredVolume);

      const playResult = audio.play();

      if (playResult && typeof playResult.then === 'function') {
        playResult.catch(() => {
          /* Ignore unlock errors to avoid breaking other players. */
        });
      }
    } catch (error) {
      /* Intentionally ignore playback errors during unlock attempts. */
    }
  });

  markAudioUnlocked();

  if (sceneVideoElement && currentVideoSource) {
    try {
      sceneVideoElement.muted = false;
      updateSceneVideoVolume();
      const playPromise = sceneVideoElement.play();

      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          /* Ignore unlock errors for video playback. */
        });
      }
    } catch (error) {
      /* Ignore unlock errors for the video element. */
    }
  }
};

const requestAudioUnlock = () => {
  if (audioUnlockState.unlocked || audioUnlockState.requested) {
    return;
  }

  audioUnlockState.requested = true;

  if (!audioUnlockState.pointerHandler) {
    audioUnlockState.pointerHandler = () => {
      audioUnlockState.pointerHandler = null;
      unlockAudioPlayback();
    };

    window.addEventListener('pointerdown', audioUnlockState.pointerHandler, { once: true });
  }
};

const updateStackingForColumn = (columnElement) => {
  if (!columnElement) {
    return;
  }

  const cards = Array.from(columnElement.querySelectorAll('.character-card'));

  if (!cards.length) {
    return;
  }

  const cardWidth = cards[0].getBoundingClientRect().width;

  if (!cardWidth) {
    return;
  }

  const columnWidth = columnElement.getBoundingClientRect().width;

  if (!columnWidth) {
    return;
  }

  const baseOverlapRatio = 0.35;
  const accentScale = 0.18 / baseOverlapRatio;
  const count = cards.length;

  let overlapRatio = baseOverlapRatio;

  if (count > 1) {
    const capacity = columnWidth / cardWidth;
    const denominator = count - 1 - accentScale;

    if (denominator > 0) {
      const requiredOverlap = (count - capacity) / denominator;

      if (requiredOverlap > overlapRatio) {
        overlapRatio = requiredOverlap;
      }
    }
  }

  overlapRatio = Math.min(Math.max(overlapRatio, baseOverlapRatio), 1.05);

  const overlap = cardWidth * overlapRatio;
  const accentRatio = overlapRatio * accentScale;
  const accentShift = cardWidth * accentRatio;
  const anchorIndex = columnElement.classList.contains('scene__column--right')
    ? cards.length - 1
    : 0;

  cards.forEach((card, index) => {
    const offsetFromAnchor = index - anchorIndex;
    const primaryShift = -overlap * offsetFromAnchor;
    const subtleShift =
      offsetFromAnchor === 0 ? 0 : Math.sign(offsetFromAnchor) * accentShift;
    const totalShift = primaryShift + subtleShift;

    card.style.setProperty('--stack-translation', `${totalShift}px`);
  });
};

const applyStackingSpacing = () => {
  updateStackingForColumn(leftColumn);
  updateStackingForColumn(rightColumn);
};

const getSlotInfo = (slot) => {
  if (!slot) {
    return { id: null, orientation: 'normal' };
  }

  if (typeof slot === 'string') {
    return { id: slot, orientation: 'normal' };
  }

  if (typeof slot === 'object') {
    const id = slot.id ?? null;
    const orientation = slot.orientation === 'mirrored' ? 'mirrored' : 'normal';
    return { id, orientation };
  }

  return { id: null, orientation: 'normal' };
};

const createCharacterCard = (slot, position, column, index, totalCount) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.classList.add(`character-card--${column}`);

  const stackSize = totalCount ?? 0;
  const overlayRank = column === 'left' ? index + 1 : stackSize - index;

  wrapper.style.zIndex = String(100 + overlayRank);

  wrapper.style.setProperty('--stack-translation', '0px');

  const { id: characterId, orientation } = getSlotInfo(slot);

  if (!characterId) {
    const label = document.createElement('span');
    label.className = 'character-card__label';
    wrapper.classList.add('character-card--empty');
    label.textContent = `Emplacement ${position}`;
    wrapper.appendChild(label);
    return wrapper;
  }

  const character = charactersById[characterId];
  const characterName = character?.name ?? 'Inconnu';
  wrapper.setAttribute('aria-label', characterName);

  if (character?.image) {
    wrapper.classList.add('character-card--with-image');

    const imageElement = document.createElement('img');
    imageElement.className = 'character-card__image';
    imageElement.src = character.image;
    imageElement.alt = characterName;
    imageElement.loading = 'lazy';

    if (orientation === 'mirrored') {
      imageElement.classList.add('character-card__image--mirrored');
    }

    wrapper.appendChild(imageElement);

    const normalizedPath = (character.image ?? '').split('?')[0].toLowerCase();

    if (normalizedPath.endsWith('.png')) {
      wrapper.classList.add('character-card--transparent');
    }
  } else {
    wrapper.style.background = character?.color ?? '#475569';
  }

  return wrapper;
};

const renderScene = (scene) => {
  if (!scene) {
    return;
  }

  latestScene = scene;

  const updatedAt = new Date(scene.updatedAt ?? Date.now());
  const formattedTime = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(updatedAt);

  const sceneType = scene?.type === SCENE_TYPE_VIDEO ? SCENE_TYPE_VIDEO : SCENE_TYPE_CHARACTER;

  if (sceneElement) {
    sceneElement.dataset.sceneType = sceneType;
  }

  if (sceneType === SCENE_TYPE_VIDEO) {
    const videoId = scene.video ?? '';
    const asset = videoTracksById[videoId] ?? null;

    if (sceneElement) {
      sceneElement.style.background = 'radial-gradient(circle at 30% 30%, #1f2937, #0f172a 70%)';
    }

    leftColumn.replaceChildren();
    rightColumn.replaceChildren();

    if (sceneVideoContainer) {
      sceneVideoContainer.hidden = false;
    }

    if (asset?.file && sceneVideoElement) {
      const source = asset.file;

      if (currentVideoSource !== source) {
        try {
          sceneVideoElement.pause();
        } catch (error) {
          /* Ignore pause errors during source change. */
        }

        sceneVideoElement.src = source;

        try {
          sceneVideoElement.load();
        } catch (error) {
          /* Ignore load errors triggered during rapid updates. */
        }

        currentVideoSource = source;
      } else {
        try {
          sceneVideoElement.currentTime = 0;
        } catch (error) {
          /* Ignore seek errors when resetting playback. */
        }
      }

      sceneVideoElement.playsInline = true;
      sceneVideoElement.controls = false;
      sceneVideoElement.loop = false;
      sceneVideoElement.muted = false;
      updateSceneVideoVolume();

      const playPromise = sceneVideoElement.play();

      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            hideSceneVideoPlaceholder();
            markAudioUnlocked();
          })
          .catch((error) => {
            showSceneVideoPlaceholder(VIDEO_PLACEHOLDER_INTERACTION);

            if (error?.name === 'NotAllowedError' || error?.name === 'NotSupportedError') {
              requestAudioUnlock();
            }
          });
      } else {
        hideSceneVideoPlaceholder();
        markAudioUnlocked();
      }
    } else {
      stopSceneVideo();
      showSceneVideoPlaceholder(
        videoTracks.length ? VIDEO_PLACEHOLDER_MISSING : VIDEO_PLACEHOLDER_EMPTY
      );
    }

    if (subtitleElement) {
      subtitleElement.textContent = `Dernière mise à jour : ${formattedTime}`;
    }

    requestAudioUnlock();
    return;
  }

  stopSceneVideo();
  showSceneVideoPlaceholder(VIDEO_PLACEHOLDER_DEFAULT);

  if (sceneVideoContainer) {
    sceneVideoContainer.hidden = true;
  }

  const background = backgroundsById[scene.background];
  sceneElement.style.background = background?.background ?? 'linear-gradient(160deg, #1e293b, #020617)';

  leftColumn.replaceChildren();
  rightColumn.replaceChildren();

  const leftSlots = Array.isArray(scene.left) ? scene.left : [];
  const leftCount = leftSlots.length;
  leftSlots.forEach((slot, index) => {
    leftColumn.appendChild(
      createCharacterCard(
        slot,
        `gauche ${index + 1}`,
        'left',
        index,
        leftCount
      )
    );
  });

  const rightSlots = Array.isArray(scene.right) ? scene.right : [];
  const rightCount = rightSlots.length;
  rightSlots.forEach((slot, index) => {
    rightColumn.appendChild(
      createCharacterCard(
        slot,
        `droite ${index + 1}`,
        'right',
        index,
        rightCount
      )
    );
  });

  requestAnimationFrame(applyStackingSpacing);

  if (subtitleElement) {
    subtitleElement.textContent = `Dernière mise à jour : ${formattedTime}`;
  }
};

const sanitiseAudioMix = (mix) => {
  if (!mix || typeof mix !== 'object') {
    return [];
  }

  const entries = Array.isArray(mix.tracks) ? mix.tracks : [];
  const seen = new Set();
  const tracks = [];

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const id = (entry.id || '').toString();

    if (!id || seen.has(id)) {
      return;
    }

    const asset = audioTracksById[id];

    if (!asset || !asset.file) {
      return;
    }

    const volumeInput = Number(entry.volume);
    const volume = Number.isFinite(volumeInput)
      ? Math.max(0, Math.min(1, volumeInput))
      : 1;
    const loop = Boolean(entry.loop);
    const playing = entry.playing === false ? false : true;
    const positionInput = Number(entry.position);
    const position = Number.isFinite(positionInput) && positionInput >= 0 ? positionInput : null;

    seen.add(id);
    tracks.push({ id, volume, loop, playing, position });
  });

  return tracks;
};

const stopAudioPlayer = (player) => {
  if (!player || !player.audio) {
    return;
  }

  player.audio.pause();

  try {
    player.audio.currentTime = 0;
  } catch (error) {
    // Ignore reset errors that can happen on certain browsers.
  }

  player.pendingSeek = null;
  player.lastPosition = undefined;
  player.desiredVolume = 1;
};

const applyAudioMix = (mix) => {
  const tracks = sanitiseAudioMix(mix);
  const activeIds = new Set();

  tracks.forEach((track) => {
    const asset = audioTracksById[track.id];

    if (!asset || !asset.file) {
      return;
    }

    activeIds.add(track.id);

    const source = asset.file;
    const player = ensureAudioPlayer(track.id, source);

    if (!player) {
      return;
    }

    const { audio } = player;

    audio.loop = Boolean(track.loop);
    const desiredVolume = Number.isFinite(track.volume) ? track.volume : 1;
    player.desiredVolume = desiredVolume;

    if (Number.isFinite(track.position) && track.position >= 0) {
      seekAudioPlayer(player, track.position);
    }

    const shouldPlay = track.playing === false ? false : true;

    if (shouldPlay) {
      audio.muted = false;

      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration)) {
        seekAudioPlayer(player, 0);
      }

      if (audio.paused) {
        audio.volume = 0;

        let playResult = null;

        try {
          playResult = audio.play();
        } catch (error) {
          audio.volume = computeEffectiveVolume(desiredVolume);

          if (error?.name === 'NotAllowedError' || error?.name === 'NotSupportedError') {
            requestAudioUnlock();
          }

          return;
        }

        if (playResult && typeof playResult.then === 'function') {
          playResult
            .then(() => {
              audio.volume = computeEffectiveVolume(desiredVolume);
              markAudioUnlocked();
            })
            .catch((error) => {
              audio.volume = computeEffectiveVolume(desiredVolume);

              if (error?.name === 'NotAllowedError' || error?.name === 'NotSupportedError') {
                requestAudioUnlock();
              }
            });
        } else {
          audio.volume = computeEffectiveVolume(desiredVolume);
          markAudioUnlocked();
        }
      } else {
        audio.volume = computeEffectiveVolume(desiredVolume);
      }
    } else if (!audio.paused) {
      audio.pause();
    }
  });

  audioPlayers.forEach((player, id) => {
    if (!activeIds.has(id)) {
      stopAudioPlayer(player);
      audioPlayers.delete(id);
    }
  });

  latestAudioMix = { tracks };
  if (tracks.length === 0) {
    cancelAudioUnlockRequest();
  }
  return latestAudioMix;
};

const handleLibraryUpdate = (library) => {
  if (!library || typeof library !== 'object') {
    return;
  }

  backgroundsById = Object.fromEntries(
    (Array.isArray(library.backgrounds) ? library.backgrounds : []).map((item) => [
      item.id,
      item
    ])
  );
  charactersById = Object.fromEntries(
    (Array.isArray(library.characters) ? library.characters : []).map((item) => [
      item.id,
      item
    ])
  );
  audioTracksById = Object.fromEntries(
    (Array.isArray(library.audioTracks) ? library.audioTracks : []).map((item) => [
      item.id,
      item
    ])
  );
  videoTracks = Array.isArray(library.videoTracks) ? library.videoTracks : [];
  videoTracksById = Object.fromEntries(videoTracks.map((item) => [item.id, item]));

  if (latestScene) {
    renderScene(latestScene);
  }

  applyAudioMix(latestAudioMix);
};

const initialise = async () => {
  const [libraryResponse, sceneResponse, audioResponse] = await Promise.all([
    fetch('/api/library'),
    fetch('/api/scene'),
    fetch('/api/audio')
  ]);

  if (!libraryResponse.ok || !sceneResponse.ok || !audioResponse.ok) {
    if (subtitleElement) {
      subtitleElement.textContent = 'Impossible de charger les scènes';
    }
    return;
  }

  const library = await libraryResponse.json();
  const sceneData = await sceneResponse.json();
  const audioData = await audioResponse.json();

  handleLibraryUpdate(library);

  renderScene(sceneData.scene);
  applyAudioMix(audioData.mix);

  const socket = io();
  socket.on('scene:update', renderScene);
  socket.on('library:update', handleLibraryUpdate);
  socket.on('audio:update', applyAudioMix);
};

initialise();

const updateVolumeUI = (volume) => {
  if (!volumeSlider || !volumeValue) {
    return;
  }

  const percent = Math.round(volume * 100);
  volumeSlider.value = String(percent);
  volumeSlider.setAttribute('aria-valuenow', String(percent));
  volumeValue.textContent = `${percent}%`;
};

const setGlobalVolume = (volume) => {
  globalVolume = clampVolume(volume);
  updateVolumeUI(globalVolume);
  updateAllPlayerVolumes();
  persistGlobalVolume(globalVolume);
};

const loadStoredVolume = () => {
  try {
    const rawValue = localStorage.getItem(LOCAL_STORAGE_VOLUME_KEY);

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const parsed = Number.parseFloat(rawValue);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return clampVolume(parsed);
  } catch (error) {
    return null;
  }
};

const initialiseVolumeControls = () => {
  const storedVolume = loadStoredVolume();

  if (storedVolume !== null) {
    globalVolume = clampVolume(storedVolume);
  }

  updateVolumeUI(globalVolume);
  updateAllPlayerVolumes();

  if (volumeToggle && volumePanel) {
    const closePanel = () => {
      if (volumePanel.hasAttribute('hidden')) {
        return;
      }

      volumePanel.hidden = true;
      volumeToggle.setAttribute('aria-expanded', 'false');
    };

    const openPanel = () => {
      if (!volumePanel.hasAttribute('hidden')) {
        return;
      }

      volumePanel.hidden = false;
      volumeToggle.setAttribute('aria-expanded', 'true');
      volumePanel.focus?.();
    };

    const togglePanel = () => {
      if (volumePanel.hasAttribute('hidden')) {
        openPanel();
      } else {
        closePanel();
      }
    };

    volumeToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePanel();
    });

    viewerControls.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      closePanel();
      volumeToggle.focus();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!viewerControls || volumePanel.hasAttribute('hidden')) {
        return;
      }

      if (event.target instanceof Node && viewerControls.contains(event.target)) {
        return;
      }

      closePanel();
    });

    window.addEventListener('blur', closePanel);
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (event) => {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const percent = Number.parseFloat(target.value);
      const volume = clampVolume(percent / 100);
      setGlobalVolume(volume);
    });
  }
};

initialiseVolumeControls();

window.addEventListener('resize', () => {
  if (!latestScene) {
    return;
  }

  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    applyStackingSpacing();
    resizeFrame = null;
  });
});
