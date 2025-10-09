const sceneElement = document.getElementById('scene');
const subtitleElement = document.querySelector('.top-bar__subtitle');
const leftColumn = document.getElementById('left-column');
const rightColumn = document.getElementById('right-column');

let backgroundsById = {};
let charactersById = {};
let audioTracksById = {};
let latestScene = null;
let resizeFrame = null;
let latestAudioMix = { tracks: [] };
const audioPlayers = new Map();
const AUDIO_SEEK_THRESHOLD = 0.25;

const createAudioPlayer = (source) => {
  const audioElement = new Audio(source);
  audioElement.preload = 'auto';

  const player = {
    audio: audioElement,
    source,
    pendingSeek: null,
    lastPosition: undefined
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

  const updatedAt = new Date(scene.updatedAt ?? Date.now());
  const formattedTime = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(updatedAt);

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
    audio.volume = track.volume ?? 1;

    if (Number.isFinite(track.position) && track.position >= 0) {
      seekAudioPlayer(player, track.position);
    }

    const shouldPlay = track.playing === false ? false : true;

    if (shouldPlay) {
      if (audio.paused || audio.ended) {
        if (audio.ended || (audio.duration && audio.currentTime >= audio.duration)) {
          seekAudioPlayer(player, 0);
        }

        audio.play().catch(() => {
          /* Autoplay might be blocked; ignore rejection. */
        });
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
