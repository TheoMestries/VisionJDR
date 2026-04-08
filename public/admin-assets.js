const characterForm = document.getElementById('character-upload-form');
const backgroundForm = document.getElementById('background-upload-form');
const trackForm = document.getElementById('track-upload-form');
const characterStatus = document.getElementById('character-upload-status');
const backgroundStatus = document.getElementById('background-upload-status');
const trackStatus = document.getElementById('track-upload-status');
const characterList = document.getElementById('character-assets');
const backgroundList = document.getElementById('background-assets');
const trackList = document.getElementById('track-assets');
const videoList = document.getElementById('video-assets');
const characterCount = document.getElementById('character-count');
const backgroundCount = document.getElementById('background-count');
const trackCount = document.getElementById('track-count');
const videoCount = document.getElementById('video-count');
const campaignSelect = document.getElementById('campaign-select');
const campaignCreateForm = document.getElementById('campaign-create-form');
const campaignNameInput = document.getElementById('campaign-name');
const campaignCreateStatus = document.getElementById('campaign-create-status');

let library = {
  backgrounds: [],
  characters: [],
  tracks: [],
  audioTracks: [],
  videoTracks: [],
  campaigns: [],
  playlists: []
};

let campaigns = [];
let campaignsById = {};
let selectedCampaignId = null;

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
    // Ignore storage errors.
  }
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

const renderAssetsForCurrentCampaign = () => {
  const filter = (assets) => filterAssetsByCampaign(assets, selectedCampaignId);

  const characters = filter(library.characters);
  const backgrounds = filter(library.backgrounds);
  let audioTracks = filter(library.audioTracks);
  let videoTracks = filter(library.videoTracks);
  const allTracks = Array.isArray(library.tracks) ? library.tracks : [];

  if (!audioTracks.length && !videoTracks.length && allTracks.length) {
    const filteredTracks = filter(allTracks);
    const splitted = splitTracksByMediaKind(filteredTracks);
    audioTracks = splitted.audio;
    videoTracks = splitted.video;
  }

  renderAssetList(characterList, characters, 'character', characterCount);
  renderAssetList(backgroundList, backgrounds, 'background', backgroundCount);
  renderAssetList(trackList, audioTracks, 'track-audio', trackCount, {
    emptyMessage: defaultEmptyMessages['track-audio']
  });
  renderAssetList(videoList, videoTracks, 'track-video', videoCount, {
    emptyMessage: defaultEmptyMessages['track-video']
  });
};

const setSelectedCampaign = (campaignId, { refresh = true, skipStorage = false } = {}) => {
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

  if (refresh) {
    renderAssetsForCurrentCampaign();
  }
};

const statusByType = {
  character: characterStatus,
  background: backgroundStatus,
  track: trackStatus
};

const audioPlayers = [];

const videoModalState = {
  element: null,
  titleElement: null,
  videoElement: null,
  lastTrigger: null
};

function closeVideoModal() {
  const { element, videoElement, lastTrigger } = videoModalState;

  if (!element || element.dataset.state !== 'open') {
    return;
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
  }

  element.dataset.state = 'closed';
  element.setAttribute('hidden', '');
  element.setAttribute('aria-hidden', 'true');

  document.body.classList.remove('is-modal-open');
  document.removeEventListener('keydown', handleVideoModalKeydown);

  if (lastTrigger && typeof lastTrigger.focus === 'function') {
    window.requestAnimationFrame(() => {
      lastTrigger.focus();
    });
  }

  videoModalState.lastTrigger = null;

  if (videoElement && typeof videoElement.blur === 'function') {
    videoElement.blur();
  }
}

function handleVideoModalKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeVideoModal();
  }
}

const ensureVideoModal = () => {
  if (videoModalState.element) {
    return videoModalState.element;
  }

  const modal = document.createElement('div');
  modal.className = 'video-modal';
  modal.dataset.state = 'closed';
  modal.setAttribute('hidden', '');
  modal.setAttribute('aria-hidden', 'true');

  const overlay = document.createElement('div');
  overlay.className = 'video-modal__overlay';
  overlay.dataset.action = 'close-video-modal';
  modal.appendChild(overlay);

  const dialog = document.createElement('div');
  dialog.className = 'video-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  modal.appendChild(dialog);

  const header = document.createElement('header');
  header.className = 'video-modal__header';
  dialog.appendChild(header);

  const title = document.createElement('h2');
  title.className = 'video-modal__title';
  title.id = 'video-modal-title';
  title.textContent = 'Lecture vidéo';
  header.appendChild(title);

  dialog.setAttribute('aria-labelledby', title.id);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'video-modal__close';
  closeButton.dataset.action = 'close-video-modal';
  closeButton.setAttribute('aria-label', 'Fermer la vidéo');
  closeButton.innerHTML = '<span aria-hidden="true">×</span>';
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = 'video-modal__body';
  dialog.appendChild(body);

  const video = document.createElement('video');
  video.className = 'video-modal__player';
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('tabindex', '-1');
  body.appendChild(video);

  modal.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action="close-video-modal"]');

    if (!trigger) {
      return;
    }

    event.preventDefault();
    closeVideoModal();
  });

  document.body.appendChild(modal);

  videoModalState.element = modal;
  videoModalState.videoElement = video;
  videoModalState.titleElement = title;

  return modal;
};

const openVideoModal = (asset = {}, triggerElement = null) => {
  if (!asset || !asset.file) {
    return;
  }

  const modal = ensureVideoModal();
  const { videoElement, titleElement } = videoModalState;

  const assetName = asset.name && asset.name.trim() ? asset.name.trim() : 'Vidéo';

  if (titleElement) {
    titleElement.textContent = assetName;
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.src = asset.file;
    videoElement.load();
  }

  modal.dataset.state = 'open';
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');

  document.body.classList.add('is-modal-open');
  document.addEventListener('keydown', handleVideoModalKeydown);

  videoModalState.lastTrigger = triggerElement || null;

  if (videoElement) {
    window.requestAnimationFrame(() => {
      try {
        videoElement.focus({ preventScroll: true });
      } catch (error) {
        // Ignore focus errors.
      }
    });
  }
};

const resetAudioPlayers = () => {
  audioPlayers.forEach((player) => {
    if (player?.audio && !player.audio.paused) {
      player.audio.pause();
    }
  });

  audioPlayers.length = 0;
};

const pauseOtherAudioPlayers = (currentAudio) => {
  audioPlayers.forEach((player) => {
    if (!player?.audio || player.audio === currentAudio) {
      return;
    }

    if (!player.audio.paused) {
      player.audio.pause();
    }
  });
};

const formatTrackTimecode = (value) => {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const createAudioPlayer = (asset = {}) => {
  const container = document.createElement('div');
  container.className = 'audio-track';
  container.dataset.state = 'paused';

  const audioElement = document.createElement('audio');
  audioElement.className = 'audio-track__element';
  audioElement.src = asset.file || '';
  audioElement.preload = 'metadata';
  audioElement.controls = false;
  container.appendChild(audioElement);

  const controls = document.createElement('div');
  controls.className = 'audio-track__controls';
  container.appendChild(controls);

  const trackName = asset.name ? asset.name.trim() : '';
  const readableName = trackName ? `« ${trackName} »` : 'la piste audio';

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'audio-track__play';
  playButton.innerHTML = '<span class="audio-track__icon" aria-hidden="true">▶</span>';
  playButton.setAttribute('aria-label', `Lire ${readableName}`);
  controls.appendChild(playButton);

  const timeline = document.createElement('div');
  timeline.className = 'audio-track__timeline';
  controls.appendChild(timeline);

  const progress = document.createElement('input');
  progress.type = 'range';
  progress.className = 'audio-track__progress';
  progress.min = '0';
  progress.max = '100';
  progress.step = '0.1';
  progress.value = '0';
  progress.disabled = true;
  progress.setAttribute('aria-label', `Position dans ${readableName}`);
  progress.style.setProperty('--progress', '0%');
  timeline.appendChild(progress);

  const timecodes = document.createElement('div');
  timecodes.className = 'audio-track__timecodes';

  const currentTimeLabel = document.createElement('span');
  currentTimeLabel.className = 'audio-track__time audio-track__time--current';
  currentTimeLabel.textContent = '0:00';

  const separator = document.createElement('span');
  separator.className = 'audio-track__separator';
  separator.textContent = '/';

  const durationLabel = document.createElement('span');
  durationLabel.className = 'audio-track__time audio-track__time--duration';
  durationLabel.textContent = '--:--';

  timecodes.append(currentTimeLabel, separator, durationLabel);
  timeline.appendChild(timecodes);

  const setProgress = (value) => {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    progress.value = String(clamped);
    progress.style.setProperty('--progress', `${clamped}%`);
  };

  const updatePlayState = (isPlaying) => {
    container.dataset.state = isPlaying ? 'playing' : 'paused';
    playButton.innerHTML = `<span class="audio-track__icon" aria-hidden="true">${
      isPlaying ? '❚❚' : '▶'
    }</span>`;
    playButton.setAttribute(
      'aria-label',
      `${isPlaying ? 'Mettre en pause' : 'Lire'} ${readableName}`
    );
  };

  const updateDurationLabel = () => {
    if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
      durationLabel.textContent = formatTrackTimecode(audioElement.duration);
      progress.disabled = false;
    } else {
      durationLabel.textContent = '--:--';
      progress.disabled = true;
      setProgress(0);
    }
  };

  const updateCurrentTime = () => {
    currentTimeLabel.textContent = formatTrackTimecode(audioElement.currentTime || 0);
  };

  const syncProgressWithAudio = () => {
    if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
      const percent = (audioElement.currentTime / audioElement.duration) * 100;
      setProgress(percent);
    }
  };

  const seekToProgress = () => {
    if (!Number.isFinite(audioElement.duration) || audioElement.duration <= 0) {
      return;
    }

    const value = Number(progress.value);
    const ratio = Math.max(0, Math.min(1, value / 100));
    audioElement.currentTime = ratio * audioElement.duration;
  };

  playButton.addEventListener('click', () => {
    if (!audioElement.src) {
      return;
    }

    if (audioElement.paused) {
      pauseOtherAudioPlayers(audioElement);
      audioElement.play().catch(() => {
        /* ignore playback rejection */
      });
    } else {
      audioElement.pause();
    }
  });

  progress.addEventListener('input', () => {
    setProgress(Number(progress.value));
  });

  progress.addEventListener('change', () => {
    setProgress(Number(progress.value));
    seekToProgress();
    updateCurrentTime();
  });

  const commitSeek = () => {
    seekToProgress();
    updateCurrentTime();
  };

  progress.addEventListener('pointerup', commitSeek);
  progress.addEventListener('mouseup', commitSeek);
  progress.addEventListener('touchend', commitSeek);

  progress.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      seekToProgress();
      updateCurrentTime();
    }
  });

  const onMetadata = () => {
    updateDurationLabel();
    updateCurrentTime();
  };

  audioElement.addEventListener('loadedmetadata', onMetadata);
  audioElement.addEventListener('durationchange', onMetadata);

  audioElement.addEventListener('timeupdate', () => {
    syncProgressWithAudio();
    updateCurrentTime();
  });

  audioElement.addEventListener('play', () => {
    pauseOtherAudioPlayers(audioElement);
    updatePlayState(true);
  });

  audioElement.addEventListener('pause', () => {
    updatePlayState(false);
  });

  audioElement.addEventListener('ended', () => {
    updatePlayState(false);
    audioElement.currentTime = 0;
    setProgress(0);
    updateCurrentTime();
  });

  audioPlayers.push({ audio: audioElement, updatePlayState });

  return container;
};

const getTrackStorage = (asset = {}) => {
  const storage = (asset.storage || '').toString().toLowerCase();

  if (storage === 'audio' || storage === 'video') {
    return storage;
  }

  const filePath = (asset.file || '').toString().toLowerCase();

  if (filePath.includes('/uploads/tracks/video/')) {
    return 'video';
  }

  if (filePath.includes('/uploads/tracks/audio/')) {
    return 'audio';
  }

  return null;
};

const getTrackMediaKind = (asset = {}) => {
  const mimeType = asset.mimeType || '';

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  const filePath = asset.file || '';
  const extension = filePath.split('?')[0].split('.').pop();

  if (!extension) {
    return null;
  }

  const normalizedExtension = extension.toLowerCase();

  if (['mp4', 'mpeg', 'mpg', 'mov', 'qt'].includes(normalizedExtension)) {
    return 'video';
  }

  if (
    [
      'mp3',
      'wav',
      'ogg',
      'oga',
      'aac',
      'flac',
      'm4a',
      'opus',
      'weba'
    ].includes(normalizedExtension)
  ) {
    return 'audio';
  }

  return null;
};

const isTrackType = (type) => ['track', 'track-audio', 'track-video'].includes(type);

const normaliseTrackType = (type) => (type && type.startsWith('track') ? 'track' : type);

const splitTracksByMediaKind = (tracks) => {
  const audio = [];
  const video = [];

  tracks.forEach((track) => {
    const kind = getTrackMediaKind(track) || getTrackStorage(track);

    if (kind === 'video') {
      video.push(track);
    } else if (kind === 'audio') {
      audio.push(track);
    }
  });

  return { audio, video };
};

const endpointByType = {
  character: '/api/assets/characters/',
  background: '/api/assets/backgrounds/',
  track: '/api/assets/tracks/'
};

const setStatus = (element, message, state = null) => {
  if (!element) {
    return;
  }

  element.textContent = message;

  if (!state) {
    element.removeAttribute('data-state');
    return;
  }

  element.dataset.state = state;
};

const clearStatusLater = (element) => {
  if (!element) {
    return;
  }

  if (element.dataset.timeoutId) {
    clearTimeout(Number(element.dataset.timeoutId));
  }

  const timeoutId = window.setTimeout(() => {
    setStatus(element, '');
    element.removeAttribute('data-state');
    element.removeAttribute('data-timeout-id');
  }, 4000);

  element.dataset.timeoutId = String(timeoutId);
};

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(parsed);
};

const createAssetCard = (asset, type) => {
  const item = document.createElement('li');
  item.className = 'asset-card';
  item.dataset.assetCategory = type;

  const normalizedType = normaliseTrackType(type);
  const trackStorage = isTrackType(type) ? getTrackStorage(asset) : null;
  const trackMediaKind = isTrackType(type) ? getTrackMediaKind(asset) : null;
  const trackKind = trackMediaKind || trackStorage;

  if (type === 'track-video') {
    item.classList.add('asset-card--track', 'asset-card--video', 'asset-card--video-list');

    if (asset.origin === 'upload') {
      item.classList.add('asset-card--custom');
    } else {
      item.classList.add('asset-card--default');
    }

    const videoButton = document.createElement('button');
    videoButton.type = 'button';
    videoButton.className = 'asset-card__video-link';

    const assetName = asset.name && asset.name.trim() ? asset.name.trim() : 'Sans titre';
    videoButton.textContent = assetName;

    if (asset.file) {
      videoButton.setAttribute('aria-label', `Lire la vidéo « ${assetName} »`);
      videoButton.addEventListener('click', () => {
        openVideoModal(asset, videoButton);
      });
    } else {
      videoButton.disabled = true;
      videoButton.setAttribute('aria-disabled', 'true');
    }

    item.appendChild(videoButton);

    if (asset.origin === 'upload') {
      const actions = document.createElement('div');
      actions.className = 'asset-card__actions asset-card__actions--video';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'asset-card__button';
      deleteButton.textContent = 'Supprimer';
      deleteButton.dataset.assetId = asset.id;
      deleteButton.dataset.assetType = normalizedType;
      deleteButton.dataset.assetCategory = type;
      deleteButton.dataset.action = 'delete-asset';

      actions.appendChild(deleteButton);
      item.appendChild(actions);
    }

    return item;
  }

  if (asset.origin === 'upload') {
    item.classList.add('asset-card--custom');
  } else {
    item.classList.add('asset-card--default');
  }

  const preview = document.createElement('div');
  preview.className = 'asset-card__preview';

  const figure = document.createElement('figure');
  figure.className = 'asset-card__figure';

  if (asset.image) {
    const image = document.createElement('img');
    image.src = asset.image;
    image.alt = asset.name || (type === 'character' ? 'Personnage' : 'Décor');
    preview.appendChild(image);
  } else if (isTrackType(type)) {
    item.classList.add('asset-card--track');
    preview.classList.add('asset-card__preview--track');
    const mediaKind = trackKind;


    if (mediaKind === 'video') {
      item.classList.add('asset-card--video');
      preview.classList.add('asset-card__preview--video');
    } else if (mediaKind === 'audio') {
      item.classList.add('asset-card--audio');
      preview.classList.add('asset-card__preview--audio');
    }

    if (asset.file) {
      if (mediaKind === 'video') {
        const video = document.createElement('video');
        video.src = asset.file;
        video.controls = true;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.classList.add('asset-card__video');
        preview.appendChild(video);
      } else if (mediaKind === 'audio') {
        preview.appendChild(createAudioPlayer(asset));
      } else {
        const audio = document.createElement('audio');
        audio.src = asset.file;
        audio.controls = true;
        audio.preload = 'metadata';
        preview.appendChild(audio);
      }
    } else {
      const icon = document.createElement('span');
      icon.className = 'asset-card__icon';
      icon.textContent = '🎵';
      preview.appendChild(icon);
    }

    // No additional badge for tracks – the preview and title are sufficient.
  } else if (type === 'background') {
    preview.style.background = asset.background || '#1e293b';
  } else {
    preview.style.background = asset.color || '#1e293b';
  }

  const caption = document.createElement('figcaption');
  caption.className = 'asset-card__caption';
  caption.textContent = asset.name || 'Sans titre';

  if (trackKind === 'audio') {
    caption.classList.add('asset-card__caption--track');
    figure.appendChild(caption);
    figure.appendChild(preview);
  } else {
    figure.appendChild(preview);
    figure.appendChild(caption);
  }

  item.appendChild(figure);

  if (type === 'track-audio') {
    const campaignPlaylists = filterAssetsByCampaign(library.playlists, selectedCampaignId);

    if (campaignPlaylists.length) {
      const playlistActions = document.createElement('div');
      playlistActions.className = 'asset-card__playlist-actions';

      const playlistSelect = document.createElement('select');
      playlistSelect.className = 'asset-card__playlist-select';
      playlistSelect.setAttribute('aria-label', `Ajouter ${asset.name || 'la piste'} à une playlist`);

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Ajouter à une playlist…';
      placeholder.selected = true;
      playlistSelect.appendChild(placeholder);

      campaignPlaylists.forEach((playlist) => {
        const option = document.createElement('option');
        option.value = playlist.id;
        option.textContent = playlist.name || 'Playlist';
        playlistSelect.appendChild(option);
      });

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'asset-card__button asset-card__button--neutral';
      addButton.textContent = 'Ajouter';
      addButton.dataset.action = 'add-track-to-playlist';
      addButton.dataset.assetId = asset.id;
      addButton.disabled = true;

      playlistSelect.addEventListener('change', () => {
        addButton.disabled = !playlistSelect.value;
      });

      addButton.addEventListener('click', async () => {
        const playlistId = playlistSelect.value;

        if (!playlistId) {
          return;
        }

        addButton.disabled = true;
        const originalText = addButton.textContent;
        addButton.textContent = 'Ajout…';

        try {
          const response = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: asset.id, action: 'add' })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            setStatus(trackStatus, errorData?.error || 'Impossible d’ajouter la piste à la playlist.', 'error');
            clearStatusLater(trackStatus);
          } else {
            setStatus(trackStatus, 'Piste ajoutée à la playlist.', 'success');
            clearStatusLater(trackStatus);
            await refreshLibrary();
          }
        } catch (error) {
          setStatus(trackStatus, "Une erreur réseau est survenue.", 'error');
          clearStatusLater(trackStatus);
        } finally {
          addButton.textContent = originalText;
          addButton.disabled = !playlistSelect.value;
        }
      });

      playlistActions.append(playlistSelect, addButton);
      item.appendChild(playlistActions);
    }
  }


  if (!isTrackType(type)) {
    const origin = document.createElement('p');
    origin.className = 'asset-card__meta';
    origin.textContent = asset.origin === 'upload' ? 'Importé' : 'Préconfiguré';
    item.appendChild(origin);

    const formattedDate = formatDateTime(asset.createdAt);


    if (formattedDate && asset.origin === 'upload') {
      const dateElement = document.createElement('p');
      dateElement.className = 'asset-card__meta asset-card__meta--muted';
      dateElement.textContent = `Ajouté le ${formattedDate}`;
      item.appendChild(dateElement);
    }
  }

  if (asset.origin === 'upload') {
    const actions = document.createElement('div');
    actions.className = 'asset-card__actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'asset-card__button';
    deleteButton.textContent = 'Supprimer';
    deleteButton.dataset.assetId = asset.id;
    deleteButton.dataset.assetType = normalizedType;
    if (isTrackType(type) && type !== normalizedType) {
      deleteButton.dataset.assetCategory = type;
    }
    deleteButton.dataset.action = 'delete-asset';

    actions.appendChild(deleteButton);
    item.appendChild(actions);
  }

  return item;
};

const defaultEmptyMessages = {
  character: 'Aucun personnage enregistré pour le moment.',
  background: 'Aucun décor enregistré pour le moment.',
  track: 'Aucune piste enregistrée pour le moment.',
  'track-audio': 'Aucune musique enregistrée pour le moment.',
  'track-video': 'Aucune vidéo enregistrée pour le moment.'
};

const renderAssetList = (listElement, assets, type, countElement, options = {}) => {
  if (!listElement) {
    return;
  }

  if (type === 'track-audio') {
    resetAudioPlayers();
  }

  listElement.innerHTML = '';

  const sortedAssets = [...assets].sort((a, b) => {
    const aCustom = a.origin === 'upload';
    const bCustom = b.origin === 'upload';

    if (aCustom !== bCustom) {
      return aCustom ? -1 : 1;
    }

    const dateA = a.createdAt ? new Date(a.createdAt).valueOf() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).valueOf() : 0;

    return dateB - dateA;
  });

  if (!sortedAssets.length) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'asset-card asset-card--empty';
    emptyMessage.textContent = options.emptyMessage ?? defaultEmptyMessages[type] ??
      'Aucun média enregistré pour le moment.';
    listElement.appendChild(emptyMessage);
  } else {
    sortedAssets.forEach((asset) => {
      listElement.appendChild(createAssetCard(asset, type));
    });
  }

  if (countElement) {
    countElement.textContent = String(sortedAssets.length);
  }
};

const refreshLibrary = async () => {
  const response = await fetch('/api/library');

  if (!response.ok) {
    throw new Error("Impossible de charger la médiathèque.");
  }

  const data = await response.json();

  library = {
    backgrounds: Array.isArray(data.backgrounds) ? data.backgrounds : [],
    characters: Array.isArray(data.characters) ? data.characters : [],
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
    audioTracks: Array.isArray(data.audioTracks) ? data.audioTracks : [],
    videoTracks: Array.isArray(data.videoTracks) ? data.videoTracks : [],
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    playlists: Array.isArray(data.playlists) ? data.playlists : []
  };

  if (!library.audioTracks.length && !library.videoTracks.length && library.tracks.length) {
    const splitted = splitTracksByMediaKind(library.tracks);
    library.audioTracks = splitted.audio;
    library.videoTracks = splitted.video;
  }

  campaigns = library.campaigns;
  campaignsById = Object.fromEntries(campaigns.map((item) => [item.id, item]));

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

  const resolvedCampaign = updateCampaignSelectOptions();

  if (resolvedCampaign !== null) {
    selectedCampaignId = resolvedCampaign;
  }

  storeSelectedCampaignId(selectedCampaignId);

  renderAssetsForCurrentCampaign();
};

const deleteAsset = async (type, assetId, buttonElement) => {
  const endpoint = endpointByType[type];
  const statusElement = statusByType[type];

  if (!endpoint || !statusElement) {
    return;
  }

  setStatus(statusElement, 'Suppression en cours…', 'pending');

  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.dataset.originalLabel = buttonElement.textContent;
    buttonElement.textContent = 'Suppression…';
  }

  try {
    const response = await fetch(`${endpoint}${encodeURIComponent(assetId)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error || 'La suppression a échoué.';
      setStatus(statusElement, message, 'error');
      clearStatusLater(statusElement);
      return;
    }

    setStatus(statusElement, 'Média supprimé.', 'success');
    clearStatusLater(statusElement);
    await refreshLibrary();
  } catch (error) {
    setStatus(statusElement, "Une erreur réseau est survenue.", 'error');
    clearStatusLater(statusElement);
  } finally {
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = buttonElement.dataset.originalLabel || 'Supprimer';
      delete buttonElement.dataset.originalLabel;
    }
  }
};

const handleAssetListClick = (event) => {
  const trigger = event.target.closest('button[data-action="delete-asset"]');

  if (!trigger) {
    return;
  }

  const assetId = trigger.dataset.assetId;
  const assetType = trigger.dataset.assetType;
  const assetCategory =
    trigger.dataset.assetCategory || trigger.closest('li')?.dataset.assetCategory || null;

  if (!assetId || !assetType) {
    return;
  }

  let confirmationMessage = 'Supprimer ce média de la médiathèque ?';

  if (assetType === 'background') {
    confirmationMessage = 'Supprimer ce décor de la médiathèque ?';
  } else if (assetType === 'character') {
    confirmationMessage = 'Supprimer ce personnage de la médiathèque ?';
  } else if (assetType === 'track') {
    if (assetCategory === 'track-video') {
      confirmationMessage = 'Supprimer cette vidéo de la médiathèque ?';
    } else if (assetCategory === 'track-audio') {
      confirmationMessage = 'Supprimer cette musique de la médiathèque ?';
    } else {
      confirmationMessage = 'Supprimer cette piste de la médiathèque ?';
    }
  }

  if (!window.confirm(confirmationMessage)) {
    return;
  }

  deleteAsset(assetType, assetId, trigger).catch(() => {
    // Errors are handled within deleteAsset.
  });
};

const handleUpload = (formElement, endpoint, statusElement, successMessage = 'Média enregistré avec succès !') => {
  if (!formElement) {
    return;
  }

  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = formElement.querySelector('button[type="submit"]');
    const formData = new FormData(formElement);

    if (!selectedCampaignId) {
      setStatus(statusElement, 'Sélectionnez une campagne avant de téléverser un média.', 'error');
      clearStatusLater(statusElement);
      return;
    }

    formData.set('campaignId', selectedCampaignId);

    setStatus(statusElement, 'Téléversement en cours…', 'pending');
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.error || 'Le téléversement a échoué.';
        setStatus(statusElement, message, 'error');
        clearStatusLater(statusElement);
        return;
      }

      setStatus(statusElement, successMessage, 'success');
      clearStatusLater(statusElement);
      formElement.reset();
      await refreshLibrary();
    } catch (error) {
      setStatus(statusElement, "Une erreur réseau est survenue.", 'error');
      clearStatusLater(statusElement);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
};

handleUpload(characterForm, '/api/assets/characters', characterStatus, 'Personnage enregistré avec succès !');
handleUpload(backgroundForm, '/api/assets/backgrounds', backgroundStatus, 'Décor enregistré avec succès !');
handleUpload(trackForm, '/api/assets/tracks', trackStatus, 'Piste enregistrée avec succès !');

if (campaignSelect) {
  campaignSelect.addEventListener('change', () => {
    setSelectedCampaign(campaignSelect.value || null);
  });
}

if (campaignCreateForm) {
  campaignCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = campaignNameInput ? campaignNameInput.value.trim() : '';

    if (!name) {
      setStatus(campaignCreateStatus, 'Indiquez un nom de campagne.', 'error');
      clearStatusLater(campaignCreateStatus);
      return;
    }

    const submitButton = campaignCreateForm.querySelector('button[type="submit"]');

    setStatus(campaignCreateStatus, 'Création en cours…', 'pending');

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.error || 'Impossible de créer la campagne.';
        setStatus(campaignCreateStatus, message, 'error');
        clearStatusLater(campaignCreateStatus);
        return;
      }

      const data = await response.json();
      const campaign = data?.campaign;

      if (campaign?.id) {
        selectedCampaignId = campaign.id;
        storeSelectedCampaignId(selectedCampaignId);
      }

      if (campaignNameInput) {
        campaignNameInput.value = '';
      }

      setStatus(campaignCreateStatus, 'Campagne créée avec succès !', 'success');
      clearStatusLater(campaignCreateStatus);

      await refreshLibrary();
    } catch (error) {
      setStatus(campaignCreateStatus, "Une erreur réseau est survenue.", 'error');
      clearStatusLater(campaignCreateStatus);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

if (characterList) {
  characterList.addEventListener('click', handleAssetListClick);
}

if (backgroundList) {
  backgroundList.addEventListener('click', handleAssetListClick);
}

if (trackList) {
  trackList.addEventListener('click', handleAssetListClick);
}

if (videoList) {
  videoList.addEventListener('click', handleAssetListClick);
}

refreshLibrary().catch(() => {
  setStatus(characterStatus, 'Impossible de charger la médiathèque.', 'error');
  setStatus(backgroundStatus, 'Impossible de charger la médiathèque.', 'error');
  setStatus(trackStatus, 'Impossible de charger la médiathèque.', 'error');
});
