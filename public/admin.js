const form = document.getElementById('scene-form');
const sceneTypeSelect = document.getElementById('scene-type');
const campaignSelect = document.getElementById('campaign');
const layoutSelect = document.getElementById('layout');
const backgroundSelect = document.getElementById('background');
const videoSelect = document.getElementById('video-track');
const leftLabel = document.getElementById('left-label');
const rightLabel = document.getElementById('right-label');
const leftField = document.getElementById('field-left');
const rightField = document.getElementById('field-right');
const leftContainer = document.getElementById('left-selects');
const rightContainer = document.getElementById('right-selects');
const statusElement = document.getElementById('form-status');
const previewScene = document.getElementById('preview-scene');
const previewVideoContainer = document.getElementById('preview-video-container');
const previewVideo = document.getElementById('preview-video');
const previewVideoPlaceholder = document.getElementById('preview-video-placeholder');
const previewLeft = document.getElementById('preview-left');
const previewRight = document.getElementById('preview-right');
const audioSelect = document.getElementById('audio-track');
const audioAddButton = document.getElementById('audio-track-add');
const playlistApplyButton = document.getElementById('audio-playlist-apply');
const playlistDeleteButton = document.getElementById('audio-playlist-delete');
const playlistFolderInput = document.getElementById('audio-playlist-folder');
const playlistNameInput = document.getElementById('audio-playlist-name');
const playlistSaveButton = document.getElementById('audio-playlist-save');
const playlistStartButton = document.getElementById('audio-playlist-start');
const playlistStartRandomButton = document.getElementById('audio-playlist-start-random');
const playlistStopButton = document.getElementById('audio-playlist-stop');
const playlistCycleInput = document.getElementById('audio-playlist-cycle');
const playlistActiveElement = document.getElementById('audio-playlist-active');
const playlistsContainer = document.querySelector('.audio-playlists');
const playlistFoldersElement = document.getElementById('audio-playlist-folders');
const playlistButtonsElement = document.getElementById('audio-playlist-buttons');
const playlistDetailTitle = document.getElementById('audio-playlist-detail-title');
const playlistDetailFolder = document.getElementById('audio-playlist-detail-folder');
const playlistDetailTracks = document.getElementById('audio-playlist-detail-tracks');
const audioActiveList = document.getElementById('audio-active-list');
const audioEmptyState = document.getElementById('audio-empty');
const layoutField = layoutSelect ? layoutSelect.closest('.field') : null;
const backgroundField = backgroundSelect ? backgroundSelect.closest('.field') : null;
const videoField = document.getElementById('field-video');

let socket;
let backgrounds = [];
let characters = [];
let layouts = [];
let backgroundsById = {};
let charactersById = {};
let layoutsById = {};
let currentScene = null;
let currentLayout = null;
let leftSelectElements = [];
let rightSelectElements = [];
let previewLayoutFrame = null;
let audioTracks = [];
let audioTracksById = {};
let videoTracks = [];
let videoTracksById = {};
let currentAudioMix = { tracks: [] };
const adminAudioPlayers = new Map();
let audioUiFrame = null;
let campaigns = [];
let campaignsById = {};
let selectedCampaignId = null;
let fullBackgrounds = [];
let fullCharacters = [];
let fullAudioTracks = [];
let fullVideoTracks = [];
let fullTracks = [];
let fullPlaylists = [];
let playlists = [];
let playlistsById = {};
let playlistFolders = {};
let selectedPlaylistFolder = null;
let selectedPlaylistId = null;
let activePlaylistId = null;
let activePlaylistTrackOrder = [];
let activePlaylistLoop = false;

const CAMPAIGN_STORAGE_KEY = 'visionjdr.selectedCampaign';

const readStoredCampaignId = () => {
  try {
    return window.localStorage?.getItem(CAMPAIGN_STORAGE_KEY) || null;
  } catch (error) {
    return null;
  }
};

const storeSelectedCampaignId = (campaignId) => {
  try {
    if (campaignId) {
      window.localStorage?.setItem(CAMPAIGN_STORAGE_KEY, campaignId);
    } else {
      window.localStorage?.removeItem(CAMPAIGN_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage errors (e.g., private mode).
  }
};

const AUDIO_PROGRESS_STEPS = 1000;
const AUDIO_SEEK_THRESHOLD = 0.25;

const ORIENTATION_NORMAL = 'normal';
const ORIENTATION_MIRRORED = 'mirrored';
const VALID_ORIENTATIONS = new Set([ORIENTATION_NORMAL, ORIENTATION_MIRRORED]);

const orientationOptions = [
  { value: ORIENTATION_NORMAL, label: 'Orientation normale' },
  { value: ORIENTATION_MIRRORED, label: 'Orientation inversée' }
];

const SCENE_TYPE_CHARACTER = 'character';
const SCENE_TYPE_VIDEO = 'video';
const VALID_SCENE_TYPES = new Set([SCENE_TYPE_CHARACTER, SCENE_TYPE_VIDEO]);

const getSceneTypeFromValue = (value) =>
  VALID_SCENE_TYPES.has(value) ? value : SCENE_TYPE_CHARACTER;

const getSlotInfo = (slot) => {
  if (!slot) {
    return { id: null, orientation: ORIENTATION_NORMAL };
  }

  if (typeof slot === 'string') {
    return { id: slot, orientation: ORIENTATION_NORMAL };
  }

  if (typeof slot === 'object') {
    const id = slot.id ?? null;
    const orientation = VALID_ORIENTATIONS.has(slot.orientation)
      ? slot.orientation
      : ORIENTATION_NORMAL;
    return { id, orientation };
  }

  return { id: null, orientation: ORIENTATION_NORMAL };
};

const matchesCampaign = (asset, campaignId) => {
  if (!campaignId) {
    return true;
  }

  const assetCampaignId = (asset?.campaignId || '').toString();

  return !assetCampaignId || assetCampaignId === campaignId;
};

const filterAssetsByCampaign = (assets, campaignId) => {
  if (!Array.isArray(assets)) {
    return [];
  }

  return assets.filter((item) => matchesCampaign(item, campaignId));
};

const splitTracksByMediaKind = (tracks) => {
  const audio = [];
  const video = [];

  if (!Array.isArray(tracks)) {
    return { audio, video };
  }

  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') {
      return;
    }

    const storage = (track.storage || '').toString();

    if (storage === 'video') {
      video.push(track);
      return;
    }

    if (storage === 'audio') {
      audio.push(track);
      return;
    }

    const mimeType = (track.mimeType || '').toString().toLowerCase();

    if (mimeType.startsWith('video/')) {
      video.push(track);
      return;
    }

    if (mimeType.startsWith('audio/')) {
      audio.push(track);
    }
  });

  return { audio, video };
};

const updateCampaignSelectOptions = () => {
  if (!campaignSelect) {
    return selectedCampaignId;
  }

  campaignSelect.innerHTML = '';

  campaigns.forEach((campaign) => {
    const option = document.createElement('option');
    option.value = campaign.id;
    option.textContent = campaign.name;
    campaignSelect.appendChild(option);
  });

  if (selectedCampaignId && campaignsById[selectedCampaignId]) {
    campaignSelect.value = selectedCampaignId;
    return selectedCampaignId;
  }

  if (campaignSelect.options.length > 0) {
    campaignSelect.selectedIndex = 0;
    return campaignSelect.value || null;
  }

  campaignSelect.value = '';
  return null;
};

const filterAssetsForCurrentCampaign = () => {
  backgrounds = filterAssetsByCampaign(fullBackgrounds, selectedCampaignId);
  characters = filterAssetsByCampaign(fullCharacters, selectedCampaignId);
  audioTracks = filterAssetsByCampaign(fullAudioTracks, selectedCampaignId);
  videoTracks = filterAssetsByCampaign(fullVideoTracks, selectedCampaignId);

  const filteredTracks = filterAssetsByCampaign(fullTracks, selectedCampaignId);
  playlists = filterAssetsByCampaign(fullPlaylists, selectedCampaignId);

  if (!audioTracks.length && !videoTracks.length && filteredTracks.length) {
    const splitted = splitTracksByMediaKind(filteredTracks);
    audioTracks = splitted.audio;
    videoTracks = splitted.video;
  }

  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));
  audioTracksById = Object.fromEntries(audioTracks.map((item) => [item.id, item]));
  videoTracksById = Object.fromEntries(videoTracks.map((item) => [item.id, item]));
  playlistsById = Object.fromEntries(playlists.map((item) => [item.id, item]));
};

const refreshFormOptions = ({ preservedScene = null } = {}) => {
  if (!backgroundSelect || !layoutSelect) {
    return;
  }

  const baseScene = preservedScene || getSceneFromForm();
  const preservedLeft = Array.isArray(baseScene.left) ? baseScene.left : [];
  const preservedRight = Array.isArray(baseScene.right) ? baseScene.right : [];

  populateSelect(backgroundSelect, backgrounds);
  populateVideoSelect(videoSelect, videoTracks);
  populateAudioSelect(audioSelect, audioTracks);
  const previousPlaylistId = selectedPlaylistId;
  if (previousPlaylistId && playlistsById[previousPlaylistId]) {
    selectedPlaylistId = previousPlaylistId;
  }
  renderPlaylistWorkspace();
  const mixChanged = applyAudioMixLocally(currentAudioMix);

  if (mixChanged && socket) {
    socket.emit('audio:set', currentAudioMix);
  }
  updateVideoSelectAvailability();

  leftSelectElements.forEach((slot, index) => {
    if (!slot || !slot.characterSelect) {
      return;
    }

    populateSelect(slot.characterSelect, characters, { includeEmpty: true });
    applySlotValue(slot, preservedLeft[index]);
  });

  rightSelectElements.forEach((slot, index) => {
    if (!slot || !slot.characterSelect) {
      return;
    }

    populateSelect(slot.characterSelect, characters, { includeEmpty: true });
    applySlotValue(slot, preservedRight[index]);
  });

  if (campaignSelect) {
    campaignSelect.value = selectedCampaignId ?? '';
  }

  const backgroundValue = backgroundsById[baseScene.background]
    ? baseScene.background
    : backgrounds[0]?.id ?? '';

  backgroundSelect.value = backgroundValue;

  if (videoSelect) {
    const videoValue = baseScene.video && videoTracksById[baseScene.video]
      ? baseScene.video
      : '';
    videoSelect.value = videoValue;
  }

  updateSceneTypeUI(getSceneTypeFromValue(sceneTypeSelect?.value));

  currentScene = getSceneFromForm();
  renderPreview(currentScene);

  updateAudioControlsAvailability();
  updatePlaylistControlsAvailability();
};

const setSelectedCampaign = (
  campaignId,
  { preservedScene = null, skipStorage = false } = {}
) => {
  const validId = campaignId && campaignsById[campaignId]
    ? campaignId
    : campaigns[0]?.id ?? null;

  selectedCampaignId = validId;

  if (!skipStorage) {
    storeSelectedCampaignId(selectedCampaignId);
  }

  if (campaignSelect) {
    campaignSelect.value = selectedCampaignId ?? '';
  }

  filterAssetsForCurrentCampaign();
  refreshFormOptions({ preservedScene });
};

const updateLibraryState = (nextLibrary) => {
  fullBackgrounds = Array.isArray(nextLibrary?.backgrounds)
    ? nextLibrary.backgrounds
    : [];
  fullCharacters = Array.isArray(nextLibrary?.characters)
    ? nextLibrary.characters
    : [];
  fullAudioTracks = Array.isArray(nextLibrary?.audioTracks)
    ? nextLibrary.audioTracks
    : [];
  fullVideoTracks = Array.isArray(nextLibrary?.videoTracks)
    ? nextLibrary.videoTracks
    : [];
  fullTracks = Array.isArray(nextLibrary?.tracks) ? nextLibrary.tracks : [];
  fullPlaylists = Array.isArray(nextLibrary?.playlists) ? nextLibrary.playlists : [];

  campaigns = Array.isArray(nextLibrary?.campaigns) ? nextLibrary.campaigns : [];
  campaignsById = Object.fromEntries(campaigns.map((item) => [item.id, item]));
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

const applyPreviewStacking = () => {
  updateStackingForColumn(previewLeft);
  updateStackingForColumn(previewRight);
};

const refreshPreviewLayout = () => {
  if (!previewScene) {
    previewLayoutFrame = null;
    return;
  }

  requestAnimationFrame(() => {
    const overlay = previewScene.querySelector('.scene__overlay');

    if (!overlay) {
      previewScene.style.removeProperty('--preview-available-height');
      applyPreviewStacking();
      previewLayoutFrame = null;
      return;
    }

    const sceneBounds = previewScene.getBoundingClientRect();

    if (!sceneBounds.height) {
      previewScene.style.removeProperty('--preview-available-height');
      applyPreviewStacking();
      previewLayoutFrame = null;
      return;
    }

    const overlayStyles = getComputedStyle(overlay);
    const paddingTop = parseFloat(overlayStyles.paddingTop) || 0;
    const paddingBottom = parseFloat(overlayStyles.paddingBottom) || 0;
    const availableHeight = Math.max(
      sceneBounds.height - paddingTop - paddingBottom,
      0
    );

    if (availableHeight) {
      previewScene.style.setProperty(
        '--preview-available-height',
        `${availableHeight}px`
      );
    } else {
      previewScene.style.removeProperty('--preview-available-height');
    }

    applyPreviewStacking();
    previewLayoutFrame = null;
  });
};

const schedulePreviewLayout = () => {
  if (previewLayoutFrame) {
    cancelAnimationFrame(previewLayoutFrame);
  }

  previewLayoutFrame = requestAnimationFrame(refreshPreviewLayout);
};

const createCharacterCard = (slot, label, column, index, totalCount) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.classList.add(`character-card--${column}`);

  const stackSize = totalCount ?? 0;
  const overlayRank = column === 'left' ? index + 1 : stackSize - index;

  wrapper.style.zIndex = String(100 + overlayRank);
  wrapper.style.setProperty('--stack-translation', '0px');

  const { id: characterId, orientation } = getSlotInfo(slot);

  if (!characterId) {
    wrapper.classList.add('character-card--empty');
    wrapper.innerHTML = `<span class="character-card__label">Emplacement ${label}</span>`;
    return wrapper;
  }

  const character = charactersById[characterId];
  const characterName = character?.name ?? 'Inconnu';

  if (character?.image) {
    wrapper.classList.add('character-card--with-image');

    const imageElement = document.createElement('img');
    imageElement.className = 'character-card__image';
    imageElement.src = character.image;
    imageElement.alt = characterName;
    imageElement.loading = 'lazy';

    if (orientation === ORIENTATION_MIRRORED) {
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

  const labelElement = document.createElement('span');
  labelElement.className = 'character-card__label';
  labelElement.textContent = characterName;
  wrapper.appendChild(labelElement);

  return wrapper;
};

const renderPreview = (scene) => {
  if (!scene) {
    return;
  }

  const sceneType = getSceneTypeFromValue(scene.type);

  if (sceneType === SCENE_TYPE_VIDEO) {
    previewScene.dataset.sceneType = SCENE_TYPE_VIDEO;
    const track = videoTracksById[scene.video] ?? null;
    previewScene.style.background = 'radial-gradient(circle at 30% 30%, #1f2937, #0f172a 70%)';
    previewLeft.replaceChildren();
    previewRight.replaceChildren();

    if (previewVideoContainer) {
      previewVideoContainer.hidden = false;
      previewVideoContainer.removeAttribute('aria-hidden');
    }

    if (track?.file && previewVideo) {
      if (previewVideo.src !== track.file) {
        previewVideo.pause();
        previewVideo.src = track.file;
        previewVideo.load();
      }

      previewVideo.muted = true;
      previewVideo.loop = true;
      previewVideo.playsInline = true;

      const playback = previewVideo.play();

      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {
          /* Ignore autoplay restrictions in preview. */
        });
      }

      if (previewVideoPlaceholder) {
        previewVideoPlaceholder.hidden = true;
      }
    } else {
      if (previewVideo) {
        previewVideo.pause();
        previewVideo.removeAttribute('src');
        previewVideo.load();
      }

      if (previewVideoPlaceholder) {
        previewVideoPlaceholder.hidden = false;
        previewVideoPlaceholder.textContent = videoTracks.length
          ? 'Sélectionnez une vidéo pour la prévisualiser.'
          : 'Aucune vidéo disponible.';
      }
    }

    return;
  }

  previewScene.dataset.sceneType = SCENE_TYPE_CHARACTER;

  const background = backgroundsById[scene.background];
  previewScene.style.background = background?.background ?? 'linear-gradient(160deg, #1e293b, #020617)';

  if (previewVideoContainer) {
    previewVideoContainer.hidden = true;
    previewVideoContainer.setAttribute('aria-hidden', 'true');
  }

  if (previewVideo) {
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
  }

  if (previewVideoPlaceholder) {
    previewVideoPlaceholder.hidden = false;
    previewVideoPlaceholder.textContent = 'Sélectionnez une vidéo pour la prévisualiser.';
  }

  previewLeft.replaceChildren();
  previewRight.replaceChildren();

  const leftSlots = Array.isArray(scene.left) ? scene.left : [];
  const leftCount = leftSlots.length;
  leftSlots.forEach((slot, index) => {
    previewLeft.appendChild(
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
    previewRight.appendChild(
      createCharacterCard(
        slot,
        `droite ${index + 1}`,
        'right',
        index,
        rightCount
      )
    );
  });

  schedulePreviewLayout();
};

const updateSceneTypeUI = (type) => {
  const sceneType = getSceneTypeFromValue(type);
  const isVideo = sceneType === SCENE_TYPE_VIDEO;

  toggleFieldVisibility(layoutField, !isVideo);
  toggleFieldVisibility(backgroundField, !isVideo);
  toggleFieldVisibility(leftField, !isVideo);
  toggleFieldVisibility(rightField, !isVideo);
  toggleFieldVisibility(videoField, isVideo);

  if (layoutSelect) {
    layoutSelect.disabled = isVideo;
  }

  if (backgroundSelect) {
    backgroundSelect.disabled = isVideo;
  }

  const updateSlotState = ({ characterSelect, orientationSelect }) => {
    if (characterSelect) {
      characterSelect.disabled = isVideo;
    }

    if (orientationSelect) {
      orientationSelect.disabled = isVideo;
    }
  };

  leftSelectElements.forEach(updateSlotState);
  rightSelectElements.forEach(updateSlotState);

  updateVideoSelectAvailability();

  if (previewScene) {
    previewScene.dataset.sceneType = sceneType;
  }
};

const setFieldLabel = (labelElement, count, side) => {
  if (!labelElement) {
    return;
  }

  labelElement.textContent = count
    ? `Personnages à ${side} (${count})`
    : `Personnages à ${side} (aucun)`;
};

const createPlaceholder = (message) => {
  const element = document.createElement('p');
  element.className = 'field__placeholder';
  element.textContent = message;
  return element;
};

const toggleFieldVisibility = (element, visible) => {
  if (!element) {
    return;
  }

  if (visible) {
    element.hidden = false;
    element.removeAttribute('aria-hidden');
  } else {
    element.hidden = true;
    element.setAttribute('aria-hidden', 'true');
  }
};

const populateSelect = (select, options, { includeEmpty = false } = {}) => {
  select.innerHTML = '';

  if (includeEmpty) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Emplacement vide';
    select.appendChild(emptyOption);
  }

  options.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.name ?? option.label;
    select.appendChild(element);
  });
};

const populateVideoSelect = (select, tracks) => {
  if (!select) {
    return;
  }

  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = tracks.length
    ? 'Sélectionnez une vidéo'
    : 'Aucune vidéo disponible';
  placeholder.selected = true;
  placeholder.dataset.placeholder = 'true';
  select.appendChild(placeholder);

  tracks.forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name || 'Vidéo';
    select.appendChild(option);
  });
};

const updateVideoSelectAvailability = () => {
  if (!videoSelect) {
    return;
  }

  const hasVideos = videoTracks.length > 0;
  videoSelect.disabled = !hasVideos;
};

const populateAudioSelect = (select, tracks) => {
  if (!select) {
    return;
  }

  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = tracks.length
    ? 'Sélectionnez une piste audio'
    : 'Aucune piste audio disponible';
  placeholder.selected = true;
  placeholder.dataset.placeholder = 'true';
  select.appendChild(placeholder);

  tracks.forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name || 'Piste audio';
    select.appendChild(option);
  });
};

const PLAYLIST_DEFAULT_FOLDER = 'Sans dossier';

const normalisePlaylistFolder = (value) => {
  const folder = (value || '').toString().trim().replace(/\s+/g, ' ');
  return folder || PLAYLIST_DEFAULT_FOLDER;
};

const buildPlaylistFolders = (entries) => {
  const grouped = {};

  (Array.isArray(entries) ? entries : []).forEach((playlist) => {
    const folder = normalisePlaylistFolder(playlist?.folder);

    if (!grouped[folder]) {
      grouped[folder] = [];
    }

    grouped[folder].push(playlist);
  });

  Object.values(grouped).forEach((folderEntries) => {
    folderEntries.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  });

  return grouped;
};

const ensurePlaylistSelections = () => {
  const folders = Object.keys(playlistFolders).sort((a, b) => a.localeCompare(b, 'fr'));

  if (!folders.length) {
    selectedPlaylistFolder = null;
    selectedPlaylistId = null;
    return;
  }

  if (!selectedPlaylistFolder || !playlistFolders[selectedPlaylistFolder]) {
    selectedPlaylistFolder = folders[0];
  }

  const entries = playlistFolders[selectedPlaylistFolder] || [];

  if (!selectedPlaylistId || !entries.some((playlist) => playlist.id === selectedPlaylistId)) {
    selectedPlaylistId = entries[0]?.id || null;
  }
};

const renderPlaylistDetail = () => {
  if (!playlistDetailTitle || !playlistDetailFolder || !playlistDetailTracks) {
    return;
  }

  const playlist = selectedPlaylistId ? playlistsById[selectedPlaylistId] : null;

  if (!playlist) {
    playlistDetailTitle.textContent = 'Sélectionnez une playlist';
    playlistDetailFolder.textContent = 'Dossier : —';
    playlistDetailTracks.replaceChildren();
    const emptyLine = document.createElement('li');
    emptyLine.className = 'audio-playlists__detail-empty';
    emptyLine.textContent = 'Aucune playlist sélectionnée.';
    playlistDetailTracks.appendChild(emptyLine);
    return;
  }

  const folder = normalisePlaylistFolder(playlist.folder);
  playlistDetailTitle.textContent = playlist.name || 'Playlist';
  playlistDetailFolder.textContent = `Dossier : ${folder}`;
  playlistDetailTracks.replaceChildren();

  const trackIds = Array.isArray(playlist.trackIds) ? playlist.trackIds : [];
  const validTrackIds = trackIds.filter((trackId) => audioTracksById[trackId]);

  if (!validTrackIds.length) {
    const emptyLine = document.createElement('li');
    emptyLine.className = 'audio-playlists__detail-empty';
    emptyLine.textContent = 'Cette playlist ne contient aucune piste audio disponible.';
    playlistDetailTracks.appendChild(emptyLine);
    return;
  }

  validTrackIds.forEach((trackId) => {
    const entry = document.createElement('li');
    entry.textContent = audioTracksById[trackId]?.name || 'Piste audio';
    playlistDetailTracks.appendChild(entry);
  });
};

const renderPlaylistWorkspace = () => {
  if (!playlistFoldersElement || !playlistButtonsElement) {
    return;
  }

  playlistFolders = buildPlaylistFolders(playlists);
  ensurePlaylistSelections();

  playlistFoldersElement.replaceChildren();
  playlistButtonsElement.replaceChildren();

  const folders = Object.keys(playlistFolders).sort((a, b) => a.localeCompare(b, 'fr'));

  if (!folders.length) {
    const emptyFolder = document.createElement('p');
    emptyFolder.className = 'audio-playlists__empty';
    emptyFolder.textContent = 'Aucun dossier.';
    playlistFoldersElement.appendChild(emptyFolder);

    const emptyPlaylist = document.createElement('p');
    emptyPlaylist.className = 'audio-playlists__empty';
    emptyPlaylist.textContent = 'Aucune playlist enregistrée.';
    playlistButtonsElement.appendChild(emptyPlaylist);
    renderPlaylistDetail();
    return;
  }

  folders.forEach((folder) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audio-playlists__folder-button';
    button.textContent = folder;
    button.dataset.selected = String(folder === selectedPlaylistFolder);
    button.addEventListener('click', () => {
      selectedPlaylistFolder = folder;
      selectedPlaylistId = playlistFolders[folder]?.[0]?.id || null;
      renderPlaylistWorkspace();
      updatePlaylistControlsAvailability();
    });
    playlistFoldersElement.appendChild(button);
  });

  const entries = playlistFolders[selectedPlaylistFolder] || [];

  entries.forEach((playlist) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audio-playlists__playlist-button';
    button.dataset.selected = String(playlist.id === selectedPlaylistId);
    button.innerHTML = `<span class="audio-playlists__playlist-icon" aria-hidden="true">♪</span><span>${playlist.name || 'Playlist'}</span>`;
    button.addEventListener('click', () => {
      selectedPlaylistId = playlist.id;
      renderPlaylistWorkspace();
      updatePlaylistControlsAvailability();
    });
    playlistButtonsElement.appendChild(button);
  });

  renderPlaylistDetail();
};

const updateActivePlaylistDisplay = () => {
  if (!playlistActiveElement) {
    return;
  }

  const activePlaylist =
    activePlaylistId && playlistsById[activePlaylistId] ? playlistsById[activePlaylistId] : null;

  if (!activePlaylist) {
    playlistActiveElement.textContent = 'Aucune playlist active.';
    playlistActiveElement.dataset.state = 'idle';
    playlistsContainer?.classList.remove('audio-playlists--active');
    return;
  }

  playlistActiveElement.textContent = `Playlist active : ${activePlaylist.name || 'Playlist'}`;
  playlistActiveElement.dataset.state = 'active';
  playlistsContainer?.classList.add('audio-playlists--active');
};

const formatTimeValue = (value) => {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const minutePart = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const prefix = hours > 0 ? `${hours}:${minutePart}` : minutePart;

  return `${prefix}:${String(seconds).padStart(2, '0')}`;
};

const formatTimeDisplay = (current, duration) => {
  const currentLabel = formatTimeValue(current);

  if (!Number.isFinite(duration) || duration <= 0) {
    return currentLabel;
  }

  return `${currentLabel} / ${formatTimeValue(duration)}`;
};

const formatPositionValue = (value) => {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }

  return String(Math.round(value * 100) / 100);
};

const advancePlaylistTrack = (finishedTrackId) => {
  if (!finishedTrackId) {
    return;
  }

  updateAudioMixState((tracks) => {
    const currentTracks = Array.isArray(tracks) ? tracks : [];
    const finishedIndex = currentTracks.findIndex((track) => track.id === finishedTrackId);

    if (finishedIndex === -1) {
      return currentTracks;
    }

    const finishedTrack = currentTracks[finishedIndex];

    if (!finishedTrack || finishedTrack.loop || finishedTrack.playing === false) {
      return currentTracks;
    }

    const playableTrackIds = currentTracks
      .map((track) => track.id)
      .filter((id) => audioTracksById[id]);

    if (!playableTrackIds.length) {
      return currentTracks;
    }

    const fallbackOrder = activePlaylistTrackOrder.length ? activePlaylistTrackOrder : playableTrackIds;
    const playlistOrder = fallbackOrder.filter((id) => playableTrackIds.includes(id));
    const finishedOrderIndex = playlistOrder.indexOf(finishedTrackId);
    const hasNextTrack = finishedOrderIndex >= 0 && finishedOrderIndex < playlistOrder.length - 1;
    const shouldRestartFromBeginning = !hasNextTrack && activePlaylistLoop && playlistOrder.length > 0;
    const nextTrackId = hasNextTrack
      ? playlistOrder[finishedOrderIndex + 1]
      : shouldRestartFromBeginning
        ? playlistOrder[0]
        : null;

    return currentTracks.map((track, index) => {
      if (index === finishedIndex) {
        return {
          ...track,
          playing: false,
          position: 0
        };
      }

      if (track.id === nextTrackId) {
        return {
          ...track,
          playing: true,
          position: 0
        };
      }

      return track;
    });
  });
};

const ensureAdminAudioPlayer = (trackId, source) => {
  if (!trackId || !source) {
    return null;
  }

  let player = adminAudioPlayers.get(trackId);

  if (!player) {
    const audioElement = new Audio(source);
    audioElement.preload = 'auto';

    player = {
      audio: audioElement,
      source,
      pendingSeek: null,
      lastPosition: undefined,
      ui: null
    };

    audioElement.addEventListener('loadedmetadata', () => {
      if (player.pendingSeek === null || player.pendingSeek === undefined) {
        return;
      }

      try {
        audioElement.currentTime = player.pendingSeek;
      } catch (error) {
        // Ignore browsers that reject immediate seeking without metadata.
      }

      player.pendingSeek = null;
    });

    audioElement.addEventListener('ended', () => {
      advancePlaylistTrack(trackId);
    });

    adminAudioPlayers.set(trackId, player);
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
      // Ignore reset errors that can occur on some browsers.
    }
  }

  return player;
};

const seekAdminAudioPlayer = (player, position) => {
  if (!player || !player.audio) {
    return;
  }

  if (!Number.isFinite(position) || position < 0) {
    return;
  }

  const { audio } = player;
  const previousTarget = player.lastPosition;
  const hasNewTarget =
    previousTarget === undefined ||
    Math.abs(previousTarget - position) > AUDIO_SEEK_THRESHOLD;
  const currentDifference = Math.abs((audio.currentTime ?? 0) - position);
  const shouldSeek =
    hasNewTarget ||
    (audio.paused && currentDifference > AUDIO_SEEK_THRESHOLD);

  player.lastPosition = position;

  if (!shouldSeek) {
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

const stopAdminAudioPlayer = (player) => {
  if (!player || !player.audio) {
    return;
  }

  player.audio.pause();

  try {
    player.audio.currentTime = 0;
  } catch (error) {
    // Ignore reset failures.
  }

  player.pendingSeek = null;
  player.lastPosition = undefined;
  player.ui = null;
};

const updateAdminPlayerUiState = (player, track, assetName) => {
  if (!player || !player.ui) {
    return;
  }

  const { audio, ui } = player;
  const duration = audio?.duration;
  const targetPosition = Number(track?.position);
  const resolvedPosition =
    Number.isFinite(targetPosition) && targetPosition >= 0
      ? targetPosition
      : Number(audio?.currentTime) || 0;
  const isPlaying = track?.playing === false ? false : true;

  if (ui.playButton) {
    ui.playButton.textContent = isPlaying ? 'Pause' : 'Lecture';
    ui.playButton.dataset.state = isPlaying ? 'playing' : 'paused';
    ui.playButton.setAttribute(
      'aria-label',
      `${isPlaying ? 'Mettre en pause' : 'Lire'} ${assetName}`
    );
  }

  if (ui.timeDisplay && !ui.isScrubbing) {
    ui.timeDisplay.textContent = formatTimeDisplay(resolvedPosition, duration);
  }

  if (ui.progressInput && !ui.isScrubbing) {
    if (Number.isFinite(duration) && duration > 0) {
      ui.progressInput.disabled = false;
      const ratio = Math.max(0, Math.min(1, resolvedPosition / duration));
      ui.progressInput.value = String(Math.round(ratio * AUDIO_PROGRESS_STEPS));
    } else {
      ui.progressInput.disabled = true;
      ui.progressInput.value = '0';
    }
  }

  if (ui.positionInput && document.activeElement !== ui.positionInput) {
    ui.positionInput.value = formatPositionValue(resolvedPosition);
  }
};

const runAdminAudioUiUpdate = () => {
  let hasActivePlayers = false;

  adminAudioPlayers.forEach((player) => {
    if (!player || !player.audio || !player.ui) {
      return;
    }

    hasActivePlayers = true;

    const { audio, ui } = player;
    const duration = audio.duration;
    const currentTime = audio.currentTime;

    if (ui.timeDisplay && !ui.isScrubbing) {
      ui.timeDisplay.textContent = formatTimeDisplay(currentTime, duration);
    }

    if (ui.progressInput) {
      if (Number.isFinite(duration) && duration > 0) {
        ui.progressInput.disabled = false;

        if (!ui.isScrubbing) {
          const ratio = Math.max(0, Math.min(1, currentTime / duration));
          ui.progressInput.value = String(Math.round(ratio * AUDIO_PROGRESS_STEPS));
        }
      } else {
        ui.progressInput.disabled = true;

        if (!ui.isScrubbing) {
          ui.progressInput.value = '0';
        }
      }
    }

    if (ui.positionInput && document.activeElement !== ui.positionInput) {
      ui.positionInput.value = formatPositionValue(currentTime);
    }
  });

  if (hasActivePlayers) {
    audioUiFrame = requestAnimationFrame(runAdminAudioUiUpdate);
  } else {
    audioUiFrame = null;
  }
};

const scheduleAdminAudioUiUpdate = () => {
  if (audioUiFrame !== null) {
    return;
  }

  audioUiFrame = requestAnimationFrame(runAdminAudioUiUpdate);
};

const cancelAdminAudioUiUpdate = () => {
  if (audioUiFrame === null) {
    return;
  }

  cancelAnimationFrame(audioUiFrame);
  audioUiFrame = null;
};

const applyAdminAudioPlayback = () => {
  const tracks = Array.isArray(currentAudioMix.tracks) ? currentAudioMix.tracks : [];
  const activeIds = new Set();

  tracks.forEach((track) => {
    const asset = audioTracksById[track.id];

    if (!asset || !asset.file) {
      return;
    }

    const player = ensureAdminAudioPlayer(track.id, asset.file);

    if (!player) {
      return;
    }

    activeIds.add(track.id);

    const { audio } = player;

    audio.loop = Boolean(track.loop);
    audio.volume = track.volume ?? 1;

    if (Number.isFinite(track.position) && track.position >= 0) {
      seekAdminAudioPlayer(player, track.position);
    }

    const shouldPlay = track.playing === false ? false : true;

    if (shouldPlay) {
      if (audio.paused || audio.ended) {
        if (audio.ended || (audio.duration && audio.currentTime >= audio.duration)) {
          seekAdminAudioPlayer(player, 0);
        }

        audio.play().catch(() => {
          /* Ignore autoplay issues on admin side. */
        });
      }
    } else if (!audio.paused) {
      audio.pause();
    }

    updateAdminPlayerUiState(player, track, asset?.name || 'la piste audio');
  });

  adminAudioPlayers.forEach((player, id) => {
    if (!activeIds.has(id)) {
      stopAdminAudioPlayer(player);
      adminAudioPlayers.delete(id);
    }
  });

  if (adminAudioPlayers.size > 0) {
    scheduleAdminAudioUiUpdate();
  } else {
    cancelAdminAudioUiUpdate();
  }
};

const sanitiseAudioMix = (mix) => {
  if (!mix || typeof mix !== 'object') {
    return { tracks: [] };
  }

  const entries = Array.isArray(mix.tracks) ? mix.tracks : [];
  const seen = new Set();
  const tracks = [];

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const id = (entry.id || '').toString();

    if (!id || seen.has(id) || !audioTracksById[id]) {
      return;
    }

    const volumeInput = Number(entry.volume);
    const volume = Number.isFinite(volumeInput)
      ? Math.max(0, Math.min(1, volumeInput))
      : 1;
    const loop = Boolean(entry.loop);
    const playing = entry.playing === false ? false : true;
    const positionInput = Number(entry.position);
    const position = Number.isFinite(positionInput) && positionInput >= 0 ? positionInput : 0;

    seen.add(id);
    tracks.push({ id, volume, loop, playing, position });
  });

  return { tracks };
};

const areAudioMixesEqual = (a, b) => {
  const aTracks = Array.isArray(a?.tracks) ? a.tracks : [];
  const bTracks = Array.isArray(b?.tracks) ? b.tracks : [];

  if (aTracks.length !== bTracks.length) {
    return false;
  }

  return aTracks.every((track, index) => {
    const other = bTracks[index];

    if (!other) {
      return false;
    }

    const volumeDelta = Math.abs((track.volume ?? 1) - (other.volume ?? 1));
    const thisPlaying = track.playing === false ? false : true;
    const otherPlaying = other.playing === false ? false : true;
    const positionDelta = Math.abs((track.position ?? 0) - (other.position ?? 0));

    return (
      track.id === other.id &&
      track.loop === other.loop &&
      volumeDelta < 0.0001 &&
      thisPlaying === otherPlaying &&
      positionDelta < 0.01
    );
  });
};

function updateAudioSelectOptions() {
  if (!audioSelect) {
    return;
  }

  const activeIds = new Set(
    (Array.isArray(currentAudioMix.tracks) ? currentAudioMix.tracks : []).map(
      (track) => track.id
    )
  );

  Array.from(audioSelect.options).forEach((option) => {
    if (!option.value) {
      option.disabled = audioTracks.length === 0;
      return;
    }

    option.disabled = activeIds.has(option.value);
  });
}

function updateAudioControlsAvailability() {
  if (!audioSelect || !audioAddButton) {
    return;
  }

  const hasTracks = audioTracks.length > 0;
  audioSelect.disabled = !hasTracks;

  const selectedId = audioSelect.value;
  const selectedOption =
    audioSelect.options && audioSelect.selectedIndex >= 0
      ? audioSelect.options[audioSelect.selectedIndex]
      : null;
  const isActive = (currentAudioMix.tracks || []).some((track) => track.id === selectedId);
  const isAvailable =
    Boolean(selectedId) &&
    Boolean(audioTracksById[selectedId]) &&
    !isActive &&
    !selectedOption?.disabled;
  audioAddButton.disabled = !hasTracks || !isAvailable;
}

function updatePlaylistControlsAvailability() {
  const hasPlaylistControls =
    playlistApplyButton &&
    playlistDeleteButton &&
    playlistSaveButton &&
    playlistStartButton &&
    playlistStartRandomButton &&
    playlistStopButton &&
    playlistCycleInput;

  if (!hasPlaylistControls) {
    return;
  }

  const hasPlaylists = playlists.length > 0;
  const hasSelectedPlaylist = Boolean(selectedPlaylistId && playlistsById[selectedPlaylistId]);
  const hasMixTracks = Array.isArray(currentAudioMix?.tracks) && currentAudioMix.tracks.length > 0;
  const hasName = Boolean((playlistNameInput?.value || '').trim());

  playlistApplyButton.disabled = !hasSelectedPlaylist;
  playlistDeleteButton.disabled = !hasSelectedPlaylist;
  playlistSaveButton.disabled = !hasMixTracks || !hasName || !selectedCampaignId;
  playlistStartButton.disabled = !hasSelectedPlaylist;
  playlistStartRandomButton.disabled = !hasSelectedPlaylist;
  playlistStopButton.disabled = !hasMixTracks;
  playlistCycleInput.disabled = !hasSelectedPlaylist && !hasMixTracks && !hasPlaylists;
  updateActivePlaylistDisplay();
}

function renderAudioMix() {
  if (!audioActiveList || !audioEmptyState) {
    return;
  }

  audioActiveList.innerHTML = '';

  const tracks = Array.isArray(currentAudioMix.tracks) ? currentAudioMix.tracks : [];
  const visibleTracks = tracks.filter((track) => audioTracksById[track.id]);

  if (!visibleTracks.length) {
    audioEmptyState.hidden = false;
    audioActiveList.setAttribute('aria-hidden', 'true');
    updateAudioSelectOptions();
    updateAudioControlsAvailability();
    return;
  }

  audioEmptyState.hidden = true;
  audioActiveList.removeAttribute('aria-hidden');

  visibleTracks.forEach((mixTrack) => {
    const asset = audioTracksById[mixTrack.id];
    const item = document.createElement('li');
    item.className = 'audio-mixer__item';

    const header = document.createElement('div');
    header.className = 'audio-mixer__item-header';

    const name = document.createElement('span');
    name.className = 'audio-mixer__name';
    name.textContent = asset?.name || 'Piste audio';
    header.appendChild(name);

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'audio-mixer__stop';
    stopButton.textContent = 'Arrêter';
    stopButton.addEventListener('click', () => {
      updateAudioMixState((tracks) => tracks.filter((track) => track.id !== mixTrack.id));
    });
    header.appendChild(stopButton);

    item.appendChild(header);

    const player = asset?.file ? ensureAdminAudioPlayer(mixTrack.id, asset.file) : null;
    const uiState = {
      playButton: null,
      timeDisplay: null,
      progressInput: null,
      positionInput: null,
      isScrubbing: false
    };

    const transportRow = document.createElement('div');
    transportRow.className = 'audio-mixer__row audio-mixer__row--transport';

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'audio-mixer__playback';
    playButton.addEventListener('click', () => {
      const currentPlayer = adminAudioPlayers.get(mixTrack.id);
      const audioElement = currentPlayer?.audio;
      const isPlaying = mixTrack.playing === false ? false : true;
      const nextPlaying = !isPlaying;
      const candidate = Number(audioElement?.currentTime);
      const basePosition = Number.isFinite(candidate) && candidate >= 0 ? candidate : mixTrack.position ?? 0;
      const safePosition = Math.max(0, basePosition);

      updateAudioMixState((tracks) =>
        tracks.map((track) =>
          track.id === mixTrack.id
            ? {
                ...track,
                playing: nextPlaying,
                position: safePosition
              }
            : track
        )
      );
    });
    transportRow.appendChild(playButton);

    const timeDisplay = document.createElement('span');
    timeDisplay.className = 'audio-mixer__time';
    transportRow.appendChild(timeDisplay);

    const progressInput = document.createElement('input');
    progressInput.type = 'range';
    progressInput.min = '0';
    progressInput.max = String(AUDIO_PROGRESS_STEPS);
    progressInput.step = '1';
    progressInput.value = '0';
    progressInput.className = 'audio-mixer__progress';
    progressInput.disabled = true;

    const handleScrubInput = () => {
      if (!player || !player.audio) {
        return;
      }

      const duration = player.audio.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      uiState.isScrubbing = true;

      const ratio = Number(progressInput.value) / AUDIO_PROGRESS_STEPS;
      const seconds = Math.max(0, Math.min(duration, ratio * duration));
      timeDisplay.textContent = formatTimeDisplay(seconds, duration);

      if (uiState.positionInput && document.activeElement !== uiState.positionInput) {
        uiState.positionInput.value = formatPositionValue(seconds);
      }
    };

    progressInput.addEventListener('input', handleScrubInput);

    const startScrub = () => {
      uiState.isScrubbing = true;
    };

    ['pointerdown', 'mousedown', 'touchstart'].forEach((eventName) => {
      progressInput.addEventListener(eventName, startScrub);
    });

    const commitScrub = () => {
      if (!player || !player.audio) {
        uiState.isScrubbing = false;
        return;
      }

      const duration = player.audio.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        uiState.isScrubbing = false;
        return;
      }

      const ratio = Number(progressInput.value) / AUDIO_PROGRESS_STEPS;
      const seconds = Math.max(0, Math.min(duration, ratio * duration));

      uiState.isScrubbing = false;

      updateAudioMixState((tracks) =>
        tracks.map((track) =>
          track.id === mixTrack.id
            ? {
                ...track,
                position: seconds
              }
            : track
        )
      );
    };

    ['pointerup', 'mouseup', 'touchend', 'change'].forEach((eventName) => {
      progressInput.addEventListener(eventName, commitScrub);
    });

    transportRow.appendChild(progressInput);

    const positionWrapper = document.createElement('div');
    positionWrapper.className = 'audio-mixer__position';

    const positionLabel = document.createElement('span');
    positionLabel.className = 'audio-mixer__position-label';
    positionLabel.textContent = 'Position (s)';
    positionWrapper.appendChild(positionLabel);

    const positionInput = document.createElement('input');
    positionInput.type = 'number';
    positionInput.min = '0';
    positionInput.step = '0.1';
    positionInput.className = 'audio-mixer__position-input';
    positionInput.value = formatPositionValue(mixTrack.position ?? 0);
    positionInput.setAttribute(
      'aria-label',
      `Position en secondes pour ${asset?.name || 'la piste audio'}`
    );
    positionInput.addEventListener('change', () => {
      const nextValue = Number(positionInput.value);

      if (!Number.isFinite(nextValue)) {
        positionInput.value = formatPositionValue(mixTrack.position ?? 0);
        return;
      }

      const safeValue = Math.max(0, nextValue);

      if (safeValue !== nextValue) {
        positionInput.value = formatPositionValue(safeValue);
      }

      updateAudioMixState((tracks) =>
        tracks.map((track) =>
          track.id === mixTrack.id
            ? {
                ...track,
                position: safeValue
              }
            : track
        )
      );
    });

    positionWrapper.appendChild(positionInput);
    transportRow.appendChild(positionWrapper);

    item.appendChild(transportRow);

    uiState.playButton = playButton;
    uiState.timeDisplay = timeDisplay;
    uiState.progressInput = progressInput;
    uiState.positionInput = positionInput;

    if (player) {
      player.ui = uiState;
    }

    const controlsRow = document.createElement('div');
    controlsRow.className = 'audio-mixer__row';

    const volumeLabel = document.createElement('label');
    volumeLabel.className = 'audio-mixer__volume';
    volumeLabel.textContent = 'Volume';

    const volumeValue = document.createElement('span');
    volumeValue.className = 'audio-mixer__value';
    const initialVolume = Math.round((mixTrack.volume ?? 1) * 100);
    volumeValue.textContent = `${initialVolume}%`;

    const volumeInput = document.createElement('input');
    volumeInput.type = 'range';
    volumeInput.min = '0';
    volumeInput.max = '100';
    volumeInput.step = '1';
    volumeInput.value = String(initialVolume);
    volumeInput.setAttribute('aria-label', `Volume de ${asset?.name || 'la piste audio'}`);

    volumeInput.addEventListener('input', () => {
      volumeValue.textContent = `${volumeInput.value}%`;
    });

    const commitVolumeChange = () => {
      const sliderValue = Number(volumeInput.value);
      const ratio = Number.isFinite(sliderValue)
        ? Math.max(0, Math.min(100, sliderValue)) / 100
        : 1;

      updateAudioMixState((tracks) =>
        tracks.map((track) =>
          track.id === mixTrack.id
            ? {
                ...track,
                volume: ratio
              }
            : track
        )
      );
    };

    volumeInput.addEventListener('change', commitVolumeChange);
    volumeInput.addEventListener('pointerup', commitVolumeChange);
    volumeInput.addEventListener('mouseup', commitVolumeChange);
    volumeInput.addEventListener('touchend', commitVolumeChange);

    volumeLabel.append(volumeInput, volumeValue);
    controlsRow.appendChild(volumeLabel);

    const loopLabel = document.createElement('label');
    loopLabel.className = 'audio-mixer__loop';

    const loopInput = document.createElement('input');
    loopInput.type = 'checkbox';
    loopInput.checked = Boolean(mixTrack.loop);
    loopInput.setAttribute(
      'aria-label',
      `Lecture en boucle pour ${asset?.name || 'la piste audio'}`
    );
    loopInput.addEventListener('change', () => {
      updateAudioMixState((tracks) =>
        tracks.map((track) =>
          track.id === mixTrack.id
            ? {
                ...track,
                loop: loopInput.checked
              }
            : track
        )
      );
    });

    const loopText = document.createElement('span');
    loopText.textContent = 'Lecture en boucle';

    loopLabel.append(loopInput, loopText);
    controlsRow.appendChild(loopLabel);

    item.appendChild(controlsRow);

    if (player) {
      updateAdminPlayerUiState(player, mixTrack, asset?.name || 'la piste audio');
    } else {
      const isPlaying = mixTrack.playing === false ? false : true;
      playButton.textContent = isPlaying ? 'Pause' : 'Lecture';
      playButton.dataset.state = isPlaying ? 'playing' : 'paused';
      playButton.setAttribute(
        'aria-label',
        `${isPlaying ? 'Mettre en pause' : 'Lire'} ${asset?.name || 'la piste audio'}`
      );
    }

    audioActiveList.appendChild(item);
  });

  updateAudioSelectOptions();
  updateAudioControlsAvailability();
  updatePlaylistControlsAvailability();
}

function applyAudioMixLocally(mix) {
  const normalised = sanitiseAudioMix(mix);
  const changed = !areAudioMixesEqual(currentAudioMix, normalised);
  currentAudioMix = normalised;
  renderAudioMix();
  applyAdminAudioPlayback();
  return changed;
}

function updateAudioMixState(updater) {
  const currentTracks = Array.isArray(currentAudioMix.tracks)
    ? currentAudioMix.tracks
    : [];
  const nextTracks = updater(currentTracks);
  const didChange = applyAudioMixLocally({ tracks: nextTracks });

  if (didChange && socket) {
    socket.emit('audio:set', currentAudioMix);
  }
}

function handleAudioUpdate(mix) {
  applyAudioMixLocally(mix);
}

const saveCurrentMixAsPlaylist = async () => {
  const name = (playlistNameInput?.value || '').trim();
  const folder = normalisePlaylistFolder(playlistFolderInput?.value);

  if (!name) {
    statusElement.textContent = 'Saisissez un nom de playlist.';
    return;
  }

  const trackIds = (Array.isArray(currentAudioMix?.tracks) ? currentAudioMix.tracks : [])
    .map((entry) => entry.id)
    .filter((id) => audioTracksById[id]);

  if (!trackIds.length) {
    statusElement.textContent = 'Ajoutez au moins une piste au mix avant de créer une playlist.';
    return;
  }

  if (!selectedCampaignId) {
    statusElement.textContent = 'Sélectionnez une campagne avant de créer une playlist.';
    return;
  }

  const response = await fetch('/api/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      folder,
      campaignId: selectedCampaignId,
      trackIds
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    statusElement.textContent = payload.error || 'Impossible de sauvegarder la playlist.';
    return;
  }

  if (playlistNameInput) {
    playlistNameInput.value = '';
  }
  if (playlistFolderInput) {
    playlistFolderInput.value = '';
  }

  statusElement.textContent = `Playlist « ${name} » enregistrée.`;
  updatePlaylistControlsAvailability();
};

const applySelectedPlaylist = () => {
  const playlist = selectedPlaylistId ? playlistsById[selectedPlaylistId] : null;

  if (!playlist) {
    statusElement.textContent = 'Sélectionnez une playlist à charger.';
    updatePlaylistControlsAvailability();
    return;
  }

  const playlistTracks = Array.isArray(playlist.trackIds) ? playlist.trackIds : [];
  const nextTracks = playlistTracks
    .filter((trackId) => audioTracksById[trackId])
    .map((trackId) => ({
      id: trackId,
      volume: 1,
      loop: false,
      playing: false,
      position: 0
    }));

  updateAudioMixState(() => nextTracks);
  activePlaylistId = playlist.id;
  activePlaylistTrackOrder = nextTracks.map((track) => track.id);
  statusElement.textContent = `Playlist « ${playlist.name} » chargée.`;
  updateActivePlaylistDisplay();
};

const shuffleTrackIds = (trackIds) => {
  const shuffled = [...trackIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
};

const startSelectedPlaylistPlayback = ({ random = false } = {}) => {
  const selectedPlaylist = selectedPlaylistId ? playlistsById[selectedPlaylistId] : null;

  if (!selectedPlaylist) {
    statusElement.textContent = 'Sélectionnez une playlist avant de lancer la lecture.';
    updatePlaylistControlsAvailability();
    return;
  }

  if (activePlaylistId !== selectedPlaylist.id) {
    applySelectedPlaylist();
  }

  const tracks = Array.isArray(currentAudioMix?.tracks) ? currentAudioMix.tracks : [];
  const playableTrackIds = tracks.map((track) => track.id).filter((id) => audioTracksById[id]);

  if (!playableTrackIds.length) {
    statusElement.textContent = 'Chargez une playlist avant de lancer la lecture.';
    updatePlaylistControlsAvailability();
    return;
  }

  activePlaylistTrackOrder = random ? shuffleTrackIds(playableTrackIds) : [...playableTrackIds];
  const firstTrackId = activePlaylistTrackOrder[0];

  updateAudioMixState((currentTracks) =>
    currentTracks.map((track) => ({
      ...track,
      playing: track.id === firstTrackId,
      position: 0
    }))
  );

  const modeLabel = random ? 'en aléatoire' : 'dans l’ordre';
  statusElement.textContent = `Lecture de la playlist lancée ${modeLabel}.`;
  updatePlaylistControlsAvailability();
};

const stopPlaylistPlaybackAndClearMix = () => {
  const hasTracks = Array.isArray(currentAudioMix?.tracks) && currentAudioMix.tracks.length > 0;

  if (!hasTracks) {
    statusElement.textContent = 'Aucune piste à arrêter.';
    updatePlaylistControlsAvailability();
    return;
  }

  updateAudioMixState(() => []);
  activePlaylistId = null;
  activePlaylistTrackOrder = [];
  statusElement.textContent = 'Lecture arrêtée et mix audio vidé.';
  updateActivePlaylistDisplay();
  updatePlaylistControlsAvailability();
};

const deleteSelectedPlaylist = async () => {
  const playlist = selectedPlaylistId ? playlistsById[selectedPlaylistId] : null;

  if (!playlist) {
    statusElement.textContent = 'Sélectionnez une playlist à supprimer.';
    updatePlaylistControlsAvailability();
    return;
  }

  const response = await fetch(`/api/playlists/${encodeURIComponent(playlist.id)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    statusElement.textContent = payload.error || 'Impossible de supprimer cette playlist.';
    return;
  }

  if (activePlaylistId === playlist.id) {
    activePlaylistId = null;
  }

  statusElement.textContent = `Playlist « ${playlist.name} » supprimée.`;
  updateActivePlaylistDisplay();
};

const createOrientationSelect = (prefix, index, sideLabel) => {
  const select = document.createElement('select');
  select.id = `${prefix}-${index}-orientation`;
  select.name = `${prefix}-${index}-orientation`;
  select.classList.add('slot-controls__orientation');
  select.setAttribute('aria-label', `Orientation ${sideLabel} ${index + 1}`);

  orientationOptions.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });

  select.value = ORIENTATION_NORMAL;
  return select;
};

const syncOrientationAvailability = (slotControls) => {
  if (!slotControls) {
    return;
  }

  const hasCharacter = Boolean(slotControls.characterSelect.value);
  slotControls.orientationSelect.disabled = !hasCharacter;
  slotControls.orientationSelect.classList.toggle(
    'slot-controls__orientation--disabled',
    !hasCharacter
  );
};

const rebuildCharacterSlots = (container, count, prefix, emptyMessage) => {
  container.innerHTML = '';

  if (!count) {
    container.appendChild(createPlaceholder(emptyMessage));
    return [];
  }

  const sideLabel = prefix === 'left' ? 'gauche' : 'droite';

  return Array.from({ length: count }, (_, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'slot-controls';

    const characterSelect = document.createElement('select');
    characterSelect.id = `${prefix}-${index}`;
    characterSelect.name = `${prefix}-${index}`;
    populateSelect(characterSelect, characters, { includeEmpty: true });

    const orientationSelect = createOrientationSelect(prefix, index, sideLabel);

    wrapper.appendChild(characterSelect);
    wrapper.appendChild(orientationSelect);
    container.appendChild(wrapper);

    const slotControls = {
      wrapper,
      characterSelect,
      orientationSelect
    };

    syncOrientationAvailability(slotControls);

    return slotControls;
  });
};

const collectSlotValues = (slots) =>
  slots.map(({ characterSelect, orientationSelect }) => {
    const id = characterSelect.value || null;
    const orientation = VALID_ORIENTATIONS.has(orientationSelect.value)
      ? orientationSelect.value
      : ORIENTATION_NORMAL;

    if (!id) {
      return null;
    }

    return { id, orientation };
  });

const applySlotValue = (slotControls, value) => {
  if (!slotControls) {
    return;
  }

  const { id, orientation } = getSlotInfo(value);
  slotControls.characterSelect.value = id ?? '';
  slotControls.orientationSelect.value = orientation;
  syncOrientationAvailability(slotControls);
};

const getSceneFromForm = () => {
  const type = getSceneTypeFromValue(sceneTypeSelect?.value);
  const baseScene = {
    type,
    background: backgroundSelect.value,
    layout: layoutSelect.value || currentLayout?.id || null,
    left: collectSlotValues(leftSelectElements),
    right: collectSlotValues(rightSelectElements),
    campaign: selectedCampaignId
  };

  if (type === SCENE_TYPE_VIDEO) {
    const selectedVideo = videoSelect?.value || '';

    return {
      ...baseScene,
      video: selectedVideo || null
    };
  }

  return baseScene;
};

const applyLayout = (layout, { leftValues = [], rightValues = [] } = {}) => {
  if (!layout) {
    return;
  }

  currentLayout = layout;
  layoutSelect.value = layout.id;

  setFieldLabel(leftLabel, layout.left, 'gauche');
  setFieldLabel(rightLabel, layout.right, 'droite');

  leftSelectElements = rebuildCharacterSlots(
    leftContainer,
    layout.left,
    'left',
    'Aucun personnage à gauche pour cette configuration.'
  );
  rightSelectElements = rebuildCharacterSlots(
    rightContainer,
    layout.right,
    'right',
    'Aucun personnage à droite pour cette configuration.'
  );

  leftSelectElements.forEach((slot, index) => {
    applySlotValue(slot, leftValues[index]);
    slot.characterSelect.addEventListener('change', () => {
      if (!slot.characterSelect.value) {
        slot.orientationSelect.value = ORIENTATION_NORMAL;
      }
      syncOrientationAvailability(slot);
      handleFormInputChange();
    });
    slot.orientationSelect.addEventListener('change', handleFormInputChange);
  });

  rightSelectElements.forEach((slot, index) => {
    applySlotValue(slot, rightValues[index]);
    slot.characterSelect.addEventListener('change', () => {
      if (!slot.characterSelect.value) {
        slot.orientationSelect.value = ORIENTATION_NORMAL;
      }
      syncOrientationAvailability(slot);
      handleFormInputChange();
    });
    slot.orientationSelect.addEventListener('change', handleFormInputChange);
  });
};

const findLayoutForScene = (scene) => {
  if (!scene) {
    return layouts[0] ?? null;
  }

  if (getSceneTypeFromValue(scene.type) === SCENE_TYPE_VIDEO) {
    return layouts[0] ?? null;
  }

  if (scene.layout && layoutsById[scene.layout]) {
    return layoutsById[scene.layout];
  }

  const leftLength = Array.isArray(scene.left) ? scene.left.length : 0;
  const rightLength = Array.isArray(scene.right) ? scene.right.length : 0;

  return (
    layouts.find((layout) => layout.left === leftLength && layout.right === rightLength) ??
    layouts[0] ??
    null
  );
};

const applySceneToForm = (scene) => {
  if (!scene) {
    return;
  }

  setSelectedCampaign(scene.campaign ?? selectedCampaignId, {
    preservedScene: scene,
    skipStorage: false
  });

  const sceneType = getSceneTypeFromValue(scene.type);

  if (sceneTypeSelect) {
    sceneTypeSelect.value = sceneType;
  }

  updateSceneTypeUI(sceneType);

  if (sceneType === SCENE_TYPE_VIDEO) {
    if (videoSelect) {
      const videoValue = scene.video && videoTracksById[scene.video] ? scene.video : '';
      videoSelect.value = videoValue;
    }

    currentScene = getSceneFromForm();
    renderPreview(currentScene);
    return;
  }

  const layout = findLayoutForScene(scene);

  applyLayout(layout, {
    leftValues: scene.left ?? [],
    rightValues: scene.right ?? []
  });

  backgroundSelect.value = scene.background ?? '';

  currentScene = getSceneFromForm();
  renderPreview(currentScene);
};

function handleFormInputChange() {
  currentScene = getSceneFromForm();
  renderPreview(currentScene);
}

const handleLayoutSelectionChange = () => {
  const selectedLayout = layoutsById[layoutSelect.value] ?? layouts[0] ?? null;

  const preservedLeft = collectSlotValues(leftSelectElements);
  const preservedRight = collectSlotValues(rightSelectElements);

  applyLayout(selectedLayout, {
    leftValues: preservedLeft,
    rightValues: preservedRight
  });

  handleFormInputChange();
};

const attachFormListeners = () => {
  if (sceneTypeSelect) {
    sceneTypeSelect.addEventListener('change', () => {
      const nextType = getSceneTypeFromValue(sceneTypeSelect.value);
      updateSceneTypeUI(nextType);
      handleFormInputChange();
    });
  }

  backgroundSelect.addEventListener('change', handleFormInputChange);
  layoutSelect.addEventListener('change', handleLayoutSelectionChange);

  if (videoSelect) {
    videoSelect.addEventListener('change', handleFormInputChange);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const scene = getSceneFromForm();

    if (scene.type === SCENE_TYPE_VIDEO) {
      if (!scene.video) {
        statusElement.textContent = 'Sélectionnez une vidéo avant de diffuser.';
        return;
      }

      statusElement.textContent = 'Diffusion de la vidéo…';
      socket.emit('scene:display', scene);
      return;
    }

    if (!scene.background) {
      statusElement.textContent = 'Sélectionnez un décor avant de diffuser.';
      return;
    }

    statusElement.textContent = 'Diffusion en cours…';
    socket.emit('scene:display', scene);
  });
};

const handleSceneUpdate = (scene) => {
  applySceneToForm(scene);
  const updatedAt = new Date((scene && scene.updatedAt) || Date.now());
  const formattedTime = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(updatedAt);

  const sceneType = getSceneTypeFromValue(scene?.type);

  if (sceneType === SCENE_TYPE_VIDEO) {
    const selectedVideoId = currentScene?.video ?? scene?.video ?? '';
    const videoAsset = selectedVideoId ? videoTracksById[selectedVideoId] : null;
    const label = videoAsset?.name ? `Vidéo « ${videoAsset.name} »` : 'Scène vidéo';
    statusElement.textContent = `${label} diffusée (${formattedTime})`;
    return;
  }

  const layoutId = currentScene?.layout ?? scene?.layout ?? '';
  const layout = layoutsById[layoutId];
  const currentLeft = Array.isArray(currentScene?.left) ? currentScene.left : [];
  const currentRight = Array.isArray(currentScene?.right) ? currentScene.right : [];
  const layoutLabel = layout?.label || `${currentLeft.length} vs ${currentRight.length}`;

  statusElement.textContent = `Scène ${layoutLabel} diffusée (${formattedTime})`;
};

const handleLibraryUpdate = (nextLibrary) => {
  if (!nextLibrary) {
    return;
  }

  updateLibraryState(nextLibrary);

  if (Array.isArray(nextLibrary.layouts) && nextLibrary.layouts.length) {
    const previousLayout = layoutSelect.value;
    layouts = nextLibrary.layouts;
    layoutsById = Object.fromEntries(layouts.map((item) => [item.id, item]));
    populateSelect(layoutSelect, layouts);

    if (previousLayout && layoutsById[previousLayout]) {
      layoutSelect.value = previousLayout;
    }
  }

  if (selectedCampaignId && !campaignsById[selectedCampaignId]) {
    selectedCampaignId = null;
  }

  if (!selectedCampaignId) {
    const stored = readStoredCampaignId();

    if (stored && campaignsById[stored]) {
      selectedCampaignId = stored;
    } else {
      selectedCampaignId = campaigns[0]?.id ?? null;
    }
  }

  const resolvedCampaignId = updateCampaignSelectOptions();

  if (resolvedCampaignId !== null) {
    selectedCampaignId = resolvedCampaignId;
  }

  storeSelectedCampaignId(selectedCampaignId);

  const preservedScene = getSceneFromForm();

  filterAssetsForCurrentCampaign();
  refreshFormOptions({ preservedScene });
};

const initialise = async () => {
  const [libraryResponse, sceneResponse, audioResponse] = await Promise.all([
    fetch('/api/library'),
    fetch('/api/scene'),
    fetch('/api/audio')
  ]);

  if (!libraryResponse.ok || !sceneResponse.ok || !audioResponse.ok) {
    statusElement.textContent = 'Impossible de charger les données.';
    return;
  }

  const library = await libraryResponse.json();
  const sceneData = await sceneResponse.json();
  const audioData = await audioResponse.json();

  updateLibraryState(library);

  layouts = Array.isArray(library.layouts) && library.layouts.length
    ? library.layouts
    : [{ id: '2v3', label: '2 vs 3', left: 2, right: 3 }];

  layoutsById = Object.fromEntries(layouts.map((item) => [item.id, item]));

  const storedCampaignId = readStoredCampaignId();

  if (storedCampaignId && campaignsById[storedCampaignId]) {
    selectedCampaignId = storedCampaignId;
  } else {
    selectedCampaignId = campaigns[0]?.id ?? null;
  }

  const resolvedInitialCampaign = updateCampaignSelectOptions();

  if (resolvedInitialCampaign !== null) {
    selectedCampaignId = resolvedInitialCampaign;
  }

  storeSelectedCampaignId(selectedCampaignId);

  filterAssetsForCurrentCampaign();

  populateSelect(layoutSelect, layouts);
  populateSelect(backgroundSelect, backgrounds);
  populateVideoSelect(videoSelect, videoTracks);
  populateAudioSelect(audioSelect, audioTracks);
  renderPlaylistWorkspace();
  if (activePlaylistId && !playlistsById[activePlaylistId]) {
    activePlaylistId = null;
  }
  applyAudioMixLocally(audioData.mix);
  updateVideoSelectAvailability();

  attachFormListeners();
  updateAudioControlsAvailability();
  updatePlaylistControlsAvailability();
  updateActivePlaylistDisplay();

  if (sceneTypeSelect) {
    updateSceneTypeUI(getSceneTypeFromValue(sceneTypeSelect.value));
  }

  socket = io();
  socket.on('scene:update', handleSceneUpdate);
  socket.on('library:update', handleLibraryUpdate);
  socket.on('audio:update', handleAudioUpdate);

  handleSceneUpdate(sceneData.scene);
};

if (campaignSelect) {
  campaignSelect.addEventListener('change', () => {
    const preservedScene = getSceneFromForm();
    setSelectedCampaign(campaignSelect.value || null, { preservedScene });
  });
}

if (audioSelect) {
  audioSelect.addEventListener('change', () => {
    updateAudioControlsAvailability();
  });
}

if (playlistNameInput) {
  playlistNameInput.addEventListener('input', () => {
    updatePlaylistControlsAvailability();
  });
}

if (audioAddButton) {
  audioAddButton.addEventListener('click', () => {
    if (!audioSelect) {
      return;
    }

    const selectedId = audioSelect.value;

    if (!selectedId || !audioTracksById[selectedId]) {
      updateAudioControlsAvailability();
      return;
    }

    updateAudioMixState((tracks) => {
      if (tracks.some((track) => track.id === selectedId)) {
        return tracks;
      }

      return [
        ...tracks,
        { id: selectedId, volume: 1, loop: false, playing: true, position: 0 }
      ];
    });

    if (audioSelect.options.length > 0) {
      audioSelect.selectedIndex = 0;
    } else {
      audioSelect.value = '';
    }

    updateAudioControlsAvailability();
  });
}

if (playlistApplyButton) {
  playlistApplyButton.addEventListener('click', () => {
    applySelectedPlaylist();
  });
}

if (playlistDeleteButton) {
  playlistDeleteButton.addEventListener('click', () => {
    deleteSelectedPlaylist();
  });
}

if (playlistSaveButton) {
  playlistSaveButton.addEventListener('click', () => {
    saveCurrentMixAsPlaylist();
  });
}

if (playlistStartButton) {
  playlistStartButton.addEventListener('click', () => {
    startSelectedPlaylistPlayback({ random: false });
  });
}

if (playlistStartRandomButton) {
  playlistStartRandomButton.addEventListener('click', () => {
    startSelectedPlaylistPlayback({ random: true });
  });
}

if (playlistStopButton) {
  playlistStopButton.addEventListener('click', () => {
    stopPlaylistPlaybackAndClearMix();
  });
}

if (playlistCycleInput) {
  playlistCycleInput.addEventListener('change', () => {
    activePlaylistLoop = Boolean(playlistCycleInput.checked);
    statusElement.textContent = activePlaylistLoop
      ? 'Boucle de playlist activée.'
      : 'Boucle de playlist désactivée.';
  });
}

initialise();

window.addEventListener('resize', () => {
  if (!currentScene) {
    return;
  }

  schedulePreviewLayout();
});
