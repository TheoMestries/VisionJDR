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

let library = { backgrounds: [], characters: [], tracks: [], audioTracks: [], videoTracks: [] };

const statusByType = {
  character: characterStatus,
  background: backgroundStatus,
  track: trackStatus
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

const getTrackStorageLabel = (asset = {}) => {
  const storage = getTrackStorage(asset);

  if (storage === 'audio') {
    return 'Audio';
  }

  if (storage === 'video') {
    return 'Vidéo';
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

  if (asset.origin === 'upload') {
    item.classList.add('asset-card--custom');
  } else {
    item.classList.add('asset-card--default');
  }

  const figure = document.createElement('figure');
  figure.className = 'asset-card__figure';

  const preview = document.createElement('div');
  preview.className = 'asset-card__preview';

  const normalizedType = normaliseTrackType(type);
  const trackStorage = isTrackType(type) ? getTrackStorage(asset) : null;
  const trackStorageLabel = isTrackType(type) ? getTrackStorageLabel(asset) : null;
  const trackMediaKind = isTrackType(type) ? getTrackMediaKind(asset) : null;

  if (asset.image) {
    const image = document.createElement('img');
    image.src = asset.image;
    image.alt = asset.name || (type === 'character' ? 'Personnage' : 'Décor');
    preview.appendChild(image);
  } else if (isTrackType(type)) {
    preview.classList.add('asset-card__preview--track');

    if (asset.file) {
      const mediaKind = trackMediaKind || trackStorage;

      if (mediaKind === 'video') {
        const video = document.createElement('video');
        video.src = asset.file;
        video.controls = true;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.classList.add('asset-card__video');
        preview.appendChild(video);
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

  figure.appendChild(preview);

  const caption = document.createElement('figcaption');
  caption.className = 'asset-card__caption';
  caption.textContent = asset.name || 'Sans titre';
  figure.appendChild(caption);

  item.appendChild(figure);

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

  library = await response.json();

  const characters = Array.isArray(library.characters) ? library.characters : [];
  const backgrounds = Array.isArray(library.backgrounds) ? library.backgrounds : [];
  const tracks = Array.isArray(library.tracks) ? library.tracks : [];
  let audioTracks = Array.isArray(library.audioTracks) ? library.audioTracks : [];
  let videoTracks = Array.isArray(library.videoTracks) ? library.videoTracks : [];

  if (!audioTracks.length && !videoTracks.length && tracks.length) {
    const splitted = splitTracksByMediaKind(tracks);
    audioTracks = splitted.audio;
    videoTracks = splitted.video;
  }

  library.audioTracks = audioTracks;
  library.videoTracks = videoTracks;

  renderAssetList(characterList, characters, 'character', characterCount);
  renderAssetList(backgroundList, backgrounds, 'background', backgroundCount);
  renderAssetList(trackList, audioTracks, 'track-audio', trackCount, {
    emptyMessage: defaultEmptyMessages['track-audio']
  });
  renderAssetList(videoList, videoTracks, 'track-video', videoCount, {
    emptyMessage: defaultEmptyMessages['track-video']
  });
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
