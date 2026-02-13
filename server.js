const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEFAULT_PORT = 3000;
const MAX_PORT_RETRIES = 10;

const parsePort = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.warn(
      `Ignoring invalid port value "${value}". Please provide an integer between 1 and 65535.`
    );
    return null;
  }

  return parsed;
};

const getPortFromArguments = () => {
  const argv = process.argv.slice(2);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--port' || argument === '-p') {
      const candidate = argv[index + 1];

      if (!candidate) {
        console.warn('The --port flag requires a value. Falling back to defaults.');
        return null;
      }

      return parsePort(candidate);
    }

    if (argument.startsWith('--port=')) {
      return parsePort(argument.split('=')[1]);
    }
  }

  return null;
};

const cliPort = getPortFromArguments();
const envPort = parsePort(process.env.PORT);

const requestedPort = cliPort ?? envPort ?? DEFAULT_PORT;
const portWasExplicitlyRequested = cliPort !== null || envPort !== null;

let currentPort = requestedPort;
let portAttempts = 0;

const startServer = (port) => {
  portAttempts += 1;
  currentPort = port;
  server.listen(port);
};

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const CHARACTER_UPLOADS_DIR = path.join(UPLOADS_DIR, 'characters');
const BACKGROUND_UPLOADS_DIR = path.join(UPLOADS_DIR, 'backgrounds');
const TRACK_UPLOADS_DIR = path.join(UPLOADS_DIR, 'tracks');
const TRACK_AUDIO_UPLOADS_DIR = path.join(TRACK_UPLOADS_DIR, 'audio');
const TRACK_VIDEO_UPLOADS_DIR = path.join(TRACK_UPLOADS_DIR, 'video');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

const ensureDirectory = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

ensureDirectory(DATA_DIR);
ensureDirectory(UPLOADS_DIR);
ensureDirectory(CHARACTER_UPLOADS_DIR);
ensureDirectory(BACKGROUND_UPLOADS_DIR);
ensureDirectory(TRACK_UPLOADS_DIR);
ensureDirectory(TRACK_AUDIO_UPLOADS_DIR);
ensureDirectory(TRACK_VIDEO_UPLOADS_DIR);

const defaultBackgrounds = [];

const sceneLayouts = [
  { id: '1v0', label: '1 vs 0', left: 1, right: 0 },
  { id: '0v1', label: '0 vs 1', left: 0, right: 1 },
  { id: '1v1', label: '1 vs 1', left: 1, right: 1 },
  { id: '2v1', label: '2 vs 1', left: 2, right: 1 },
  { id: '1v2', label: '1 vs 2', left: 1, right: 2 },
  { id: '2v2', label: '2 vs 2', left: 2, right: 2 },
  { id: '2v3', label: '2 vs 3', left: 2, right: 3 },
  { id: '1v3', label: '1 vs 3', left: 1, right: 3 },
  { id: '3v1', label: '3 vs 1', left: 3, right: 1 },
  { id: '3v2', label: '3 vs 2', left: 3, right: 2 },
  { id: '3v3', label: '3 vs 3', left: 3, right: 3 }
];

const SCENE_TYPE_CHARACTER = 'character';
const SCENE_TYPE_VIDEO = 'video';
const VALID_SCENE_TYPES = new Set([SCENE_TYPE_CHARACTER, SCENE_TYPE_VIDEO]);

const defaultCharacters = [];

const safeReadJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'element';

const randomSuffix = () => crypto.randomBytes(4).toString('hex');

const createCampaignId = (name) => {
  const base = slugify(name || 'campagne');
  const timestamp = Date.now().toString(36);
  return `campaign-${base}-${timestamp}-${randomSuffix()}`;
};

const createCampaign = (name) => ({
  id: createCampaignId(name),
  name: name && name.trim() ? name.trim() : 'Campagne sans nom',
  createdAt: new Date().toISOString()
});

const normaliseCampaign = (campaign) => {
  if (!campaign || typeof campaign !== 'object') {
    return null;
  }

  const name = (campaign.name || '').toString().trim() || 'Campagne sans nom';
  const rawId = (campaign.id || '').toString().trim();
  const id = rawId || createCampaignId(name);
  const createdAtDate = campaign.createdAt ? new Date(campaign.createdAt) : null;
  const createdAt = createdAtDate && !Number.isNaN(createdAtDate.valueOf())
    ? createdAtDate.toISOString()
    : new Date().toISOString();

  return { id, name, createdAt };
};

const detectTrackStorage = (track) => {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const storage = (track.storage || '').toString().toLowerCase();

  if (storage === 'audio' || storage === 'video') {
    return storage;
  }

  const filePath = (track.file || '').toString().toLowerCase();

  if (filePath.includes('/uploads/tracks/video/')) {
    return 'video';
  }

  if (filePath.includes('/uploads/tracks/audio/')) {
    return 'audio';
  }

  return null;
};

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'oga',
  'aac',
  'flac',
  'm4a',
  'opus',
  'weba'
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mpeg', 'mpg', 'mov', 'qt', 'm4v', 'webm']);

const detectTrackKind = (track) => {
  const storage = detectTrackStorage(track);

  if (storage === 'audio' || storage === 'video') {
    return storage;
  }

  const mimeType = (track.mimeType || '').toString().toLowerCase();

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  const filePath = (track.file || track.source || '').toString().toLowerCase();

  if (!filePath) {
    return null;
  }

  const extension = path.extname(filePath).replace('.', '');

  if (!extension) {
    return null;
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }

  return null;
};

const decodeUploadText = (value) => {
  const input = (value || '').toString();

  if (!input || !looksLikeMojibake(input)) {
    return input;
  }

  const decoded = Buffer.from(input, 'latin1').toString('utf8');

  if (!decoded) {
    return input;
  }

  return looksLikeMojibake(decoded) ? input : decoded;
};

const normaliseTrack = (track) => {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const storage = detectTrackKind(track);
  const name = decodeUploadText(track.name);

  return {
    ...track,
    name,
    storage: storage ?? null
  };
};

const loadCustomLibrary = () => {
  const stored = safeReadJson(LIBRARY_FILE);
  let needsPersist = false;

  if (!stored) {
    const defaultCampaign = createCampaign('Campagne principale');

    return {
      library: {
        campaigns: [defaultCampaign],
        backgrounds: [],
        characters: [],
        tracks: []
      },
      needsPersist: true
    };
  }

  const campaignsInput = Array.isArray(stored.campaigns) ? stored.campaigns : [];
  const seenCampaignIds = new Set();
  const campaigns = [];

  campaignsInput.forEach((entry) => {
    const normalised = normaliseCampaign(entry);

    if (!normalised || seenCampaignIds.has(normalised.id)) {
      needsPersist = true;
      return;
    }

    const originalId = (entry?.id || '').toString().trim();
    const originalName = (entry?.name || '').toString().trim();

    if (normalised.id !== originalId || normalised.name !== originalName) {
      needsPersist = true;
    }

    campaigns.push(normalised);
    seenCampaignIds.add(normalised.id);
  });

  if (!campaigns.length) {
    campaigns.push(createCampaign('Campagne principale'));
    needsPersist = true;
  }

  const validCampaignIds = new Set(campaigns.map((campaign) => campaign.id));

  const normaliseAssetWithCampaign = (asset) => {
    if (!asset || typeof asset !== 'object') {
      needsPersist = true;
      return null;
    }

    const inputCampaignId = (asset.campaignId || '').toString().trim();
    const campaignId = inputCampaignId && validCampaignIds.has(inputCampaignId)
      ? inputCampaignId
      : null;

    if (campaignId !== inputCampaignId) {
      needsPersist = true;
    }

    return { ...asset, campaignId };
  };

  const normaliseAssetCollection = (collection) => {
    if (!Array.isArray(collection)) {
      if (collection && typeof collection === 'object' && Object.keys(collection).length) {
        needsPersist = true;
      }

      return [];
    }

    const result = [];

    collection.forEach((item) => {
      const normalised = normaliseAssetWithCampaign(item);

      if (normalised) {
        result.push(normalised);
      }
    });

    return result;
  };

  const backgrounds = normaliseAssetCollection(stored.backgrounds);
  const characters = normaliseAssetCollection(stored.characters);
  const tracks = Array.isArray(stored.tracks)
    ? stored.tracks
        .map(normaliseTrack)
        .filter((track) => track !== null)
        .map(normaliseAssetWithCampaign)
        .filter((track) => track !== null)
    : [];

  return {
    library: { campaigns, backgrounds, characters, tracks },
    needsPersist
  };
};

const { library: initialLibrary, needsPersist: libraryNeedsPersist } = loadCustomLibrary();
let customLibrary = initialLibrary;

if (libraryNeedsPersist) {
  writeJson(LIBRARY_FILE, customLibrary);
}

let backgrounds = [];
let characters = [];
let backgroundsById = {};
let charactersById = {};
let tracks = [];
let tracksById = {};
let campaigns = [];
let campaignsById = {};
let library = {
  backgrounds: [],
  characters: [],
  tracks: [],
  audioTracks: [],
  videoTracks: [],
  layouts: [],
  campaigns: []
};
let currentAudioMix = { tracks: [] };

const normaliseAudioMixTrack = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const trackId = (entry.id || '').toString();

  if (!trackId) {
    return null;
  }

  const track = tracksById[trackId];

  if (!track || detectTrackKind(track) !== 'audio') {
    return null;
  }

  const volumeInput = Number(entry.volume);
  const volume = Number.isFinite(volumeInput)
    ? Math.max(0, Math.min(1, volumeInput))
    : 1;
  const loop = Boolean(entry.loop);
  const playing = entry.playing === false ? false : true;
  const positionInput = Number(entry.position);
  const position = Number.isFinite(positionInput) && positionInput >= 0 ? positionInput : 0;

  return { id: track.id, volume, loop, playing, position };
};

const normaliseAudioMix = (mix) => {
  if (!mix || typeof mix !== 'object') {
    return { tracks: [] };
  }

  const inputTracks = Array.isArray(mix.tracks) ? mix.tracks : [];
  const seen = new Set();
  const tracks = [];

  inputTracks.forEach((entry) => {
    const normalised = normaliseAudioMixTrack(entry);

    if (!normalised || seen.has(normalised.id)) {
      return;
    }

    seen.add(normalised.id);
    tracks.push(normalised);
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

const setAudioMix = (mix) => {
  const normalised = normaliseAudioMix(mix);

  if (!areAudioMixesEqual(currentAudioMix, normalised)) {
    currentAudioMix = normalised;
    io.emit('audio:update', currentAudioMix);
  }
};

const splitTracksByKind = (collection) => {
  const audio = [];
  const video = [];

  collection.forEach((track) => {
    const kind = detectTrackKind(track);

    if (kind === 'video') {
      video.push(track);
    } else if (kind === 'audio') {
      audio.push(track);
    }
  });

  return { audio, video };
};

const refreshLibrary = () => {
  let shouldPersistCampaigns = false;

  let shouldPersistLibrary = false;

  if (!Array.isArray(customLibrary.campaigns)) {
    customLibrary.campaigns = [createCampaign('Campagne principale')];
    shouldPersistCampaigns = true;
  } else if (!customLibrary.campaigns.length) {
    customLibrary.campaigns.push(createCampaign('Campagne principale'));
    shouldPersistCampaigns = true;
  }

  campaigns = [...customLibrary.campaigns];
  campaignsById = Object.fromEntries(campaigns.map((item) => [item.id, item]));

  const normaliseCampaignAttachment = (entry) => {
    if (!entry || typeof entry !== 'object') {
      shouldPersistLibrary = true;
      return null;
    }

    const rawCampaignId = (entry.campaignId || '').toString().trim();
    const campaignId = rawCampaignId && campaignsById[rawCampaignId] ? rawCampaignId : null;

    if (campaignId !== entry.campaignId) {
      shouldPersistLibrary = true;
    }

    return { ...entry, campaignId };
  };

  const sanitiseCollection = (collection) => {
    if (!Array.isArray(collection)) {
      if (collection && collection.length) {
        shouldPersistLibrary = true;
      }
      return [];
    }

    const result = [];

    collection.forEach((item) => {
      const normalised = normaliseCampaignAttachment(item);

      if (normalised) {
        result.push(normalised);
      } else {
        shouldPersistLibrary = true;
      }
    });

    return result;
  };

  const defaultBackgroundList = defaultBackgrounds.map((item) => ({
    ...item,
    campaignId: item?.campaignId ?? null
  }));
  const defaultCharacterList = defaultCharacters.map((item) => ({
    ...item,
    campaignId: item?.campaignId ?? null
  }));

  const customBackgrounds = sanitiseCollection(customLibrary.backgrounds);
  const customCharacters = sanitiseCollection(customLibrary.characters);
  const customTracks = Array.isArray(customLibrary.tracks)
    ? customLibrary.tracks
        .map((track) => {
          const normalised = normaliseTrack(track);

          if (!normalised) {
            shouldPersistLibrary = true;
          }

          return normalised;
        })
        .filter((track) => track !== null)
        .map(normaliseCampaignAttachment)
        .filter((track) => track !== null)
    : [];

  customLibrary.backgrounds = customBackgrounds;
  customLibrary.characters = customCharacters;
  customLibrary.tracks = customTracks;

  backgrounds = [...defaultBackgroundList, ...customBackgrounds];
  characters = [...defaultCharacterList, ...customCharacters];
  tracks = [...customTracks];

  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));
  tracksById = Object.fromEntries(tracks.map((item) => [item.id, item]));
  const { audio, video } = splitTracksByKind(tracks);
  library = {
    backgrounds,
    characters,
    tracks,
    audioTracks: audio,
    videoTracks: video,
    layouts: sceneLayouts,
    campaigns
  };

  shouldPersistLibrary = shouldPersistLibrary || shouldPersistCampaigns;

  if (shouldPersistLibrary) {
    writeJson(LIBRARY_FILE, customLibrary);
  }

  const previousMix = currentAudioMix;
  const normalisedMix = normaliseAudioMix(previousMix);

  if (!areAudioMixesEqual(previousMix, normalisedMix)) {
    currentAudioMix = normalisedMix;
    io.emit('audio:update', currentAudioMix);
  } else {
    currentAudioMix = normalisedMix;
  }
};

const persistCustomLibrary = () => {
  writeJson(LIBRARY_FILE, customLibrary);
};

refreshLibrary();

const createAssetId = (prefix, name) => {
  const base = slugify(name);
  const timestamp = Date.now().toString(36);
  return `${prefix}-${base}-${randomSuffix()}`;
};

const looksLikeMojibake = (value) => /(?:Ã.|Â|â.|�)/.test(value);



const createFileName = (originalName) => {
  const safeOriginalName = decodeUploadText(originalName);
  const extension = path.extname(safeOriginalName) || '.png';
  const baseName = slugify(path.basename(safeOriginalName, extension));
  const timestamp = Date.now().toString(36);

  return `${baseName}-${timestamp}-${randomSuffix()}${extension}`;
};

const normaliseUploadPath = (publicPath) => {
  if (!publicPath || typeof publicPath !== 'string') {
    return null;
  }

  const strippedPath = publicPath.replace(/^\/+/, '');
  const absolutePath = path.resolve(__dirname, 'public', strippedPath);
  const relativeToUploads = path.relative(UPLOADS_DIR, absolutePath);

  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) {
    return null;
  }

  return absolutePath;
};

const removeUploadFile = (publicPath) => {
  const filePath = normaliseUploadPath(publicPath);

  if (!filePath) {
    return;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Intentionally ignore errors when removing files.
  }
};

const ensureCustomCollection = (key) => {
  if (!Array.isArray(customLibrary[key])) {
    customLibrary[key] = [];
  }

  return customLibrary[key];
};

const imageFileFilter = (req, file, callback) => {
  if (!file.mimetype.startsWith('image/')) {
    callback(new Error('Seuls les fichiers images sont autorisés.'));
    return;
  }

  callback(null, true);
};

const uploadLimits = { fileSize: 8 * 1024 * 1024 };

const isAudioMimeType = (mimeType) => mimeType?.startsWith('audio/');
const isVideoMimeType = (mimeType) => ['video/mp4', 'video/mpeg', 'video/quicktime'].includes(mimeType);

const trackFileFilter = (req, file, callback) => {
  const isAudio = isAudioMimeType(file.mimetype);
  const isVideo = isVideoMimeType(file.mimetype);

  if (!isAudio && !isVideo) {
    callback(new Error('Seuls les fichiers audio ou vidéo MP4 sont autorisés.'));
    return;
  }

  callback(null, true);
};

const trackUploadLimits = { fileSize: 64 * 1024 * 1024 };

const characterUpload = multer({
  storage: multer.diskStorage({
    destination: CHARACTER_UPLOADS_DIR,
    filename: (req, file, callback) => {
      callback(null, createFileName(file.originalname));
    }
  }),
  fileFilter: imageFileFilter,
  limits: uploadLimits
});

const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: BACKGROUND_UPLOADS_DIR,
    filename: (req, file, callback) => {
      callback(null, createFileName(file.originalname));
    }
  }),
  fileFilter: imageFileFilter,
  limits: uploadLimits
});

const trackUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      const destination = isVideoMimeType(file.mimetype)
        ? TRACK_VIDEO_UPLOADS_DIR
        : TRACK_AUDIO_UPLOADS_DIR;

      callback(null, destination);
    },
    filename: (req, file, callback) => {
      callback(null, createFileName(file.originalname));
    }
  }),
  fileFilter: trackFileFilter,
  limits: trackUploadLimits
});

const withUploader = (uploader) => (req, res, next) => {
  uploader(req, res, (error) => {
    if (error) {
      res.status(400).json({ error: error.message || 'Téléversement impossible.' });
      return;
    }

    next();
  });
};

const layoutsById = Object.fromEntries(sceneLayouts.map((layout) => [layout.id, layout]));
const maxLeftSlots = Math.max(...sceneLayouts.map((layout) => layout.left));
const maxRightSlots = Math.max(...sceneLayouts.map((layout) => layout.right));

const selectCharacters = (count, offset = 0) => {
  if (!count) {
    return [];
  }

  if (!characters.length) {
    return Array.from({ length: count }, () => null);
  }

  const result = [];

  for (let index = 0; index < count; index += 1) {
    const character = characters[(offset + index) % characters.length];
    result.push(character?.id ?? null);
  }

  return result;
};

const MIRRORED_ORIENTATION = 'mirrored';
const NORMAL_ORIENTATION = 'normal';
const VALID_ORIENTATIONS = new Set([NORMAL_ORIENTATION, MIRRORED_ORIENTATION]);

const withDefaultOrientation = (ids) =>
  ids.map((id) => (id ? { id, orientation: NORMAL_ORIENTATION } : null));

const defaultScene = () => {
  const layout = layoutsById['2v3'] ?? sceneLayouts[0];
  const backgroundOption = backgrounds[0]?.id ?? null;

  return {
    type: SCENE_TYPE_CHARACTER,
    background: backgroundOption,
    layout: layout.id,
    right: withDefaultOrientation(selectCharacters(layout.right, 0)),
    left: withDefaultOrientation(selectCharacters(layout.left, layout.right)),
    updatedAt: new Date().toISOString()
  };
};

let currentScene = defaultScene();

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/assets', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-assets.html'));
});

app.get('/api/library', (req, res) => {
  res.json(library);
});

app.get('/api/campaigns', (req, res) => {
  res.json({ campaigns });
});

app.post('/api/campaigns', (req, res) => {
  const nameInput = (req.body?.name || '').toString().trim();

  if (!nameInput) {
    res.status(400).json({ error: 'Le nom de la campagne est requis.' });
    return;
  }

  const normalisedName = nameInput.replace(/\s+/g, ' ').trim();
  const duplicate = campaigns.find(
    (campaign) => campaign.name.toLowerCase() === normalisedName.toLowerCase()
  );

  if (duplicate) {
    res.status(400).json({ error: 'Une campagne portant ce nom existe déjà.' });
    return;
  }

  const campaign = createCampaign(normalisedName);
  const collection = ensureCustomCollection('campaigns');
  collection.push(campaign);
  persistCustomLibrary();
  refreshLibrary();

  io.emit('library:update', library);

  res.status(201).json({ campaign });
});

app.get('/api/audio', (req, res) => {
  res.json({ mix: currentAudioMix });
});

app.get('/api/assets/custom', (req, res) => {
  const { audio: audioTracks, video: videoTracks } = splitTracksByKind(
    (customLibrary.tracks ?? []).map(normaliseTrack).filter(Boolean)
  );

  res.json({
    backgrounds: customLibrary.backgrounds ?? [],
    characters: customLibrary.characters ?? [],
    tracks: customLibrary.tracks ?? [],
    campaigns: customLibrary.campaigns ?? [],
    audioTracks,
    videoTracks
  });
});

app.post(
  '/api/assets/characters',
  withUploader(characterUpload.single('image')),
  (req, res) => {
    const uploadedFile = req.file;
    const nameInput = (req.body?.name || '').toString().trim();
    const campaignId = (req.body?.campaignId || '').toString().trim();

    if (!uploadedFile) {
      res.status(400).json({ error: "Aucune image n'a été envoyée." });
      return;
    }

    if (!campaignId || !campaignsById[campaignId]) {
      res.status(400).json({ error: 'Sélectionnez une campagne valide avant d\'ajouter un personnage.' });
      return;
    }

    const displayName = decodeUploadText(nameInput || uploadedFile.originalname);
    const characterId = createAssetId('char', displayName);
    const publicPath = `/uploads/characters/${uploadedFile.filename}`;
    const character = {
      id: characterId,
      name: displayName,
      color: '#1e293b',
      image: publicPath,
      origin: 'upload',
      createdAt: new Date().toISOString(),
      campaignId
    };

    if (!Array.isArray(customLibrary.characters)) {
      customLibrary.characters = [];
    }

    customLibrary.characters.push(character);
    persistCustomLibrary();
    refreshLibrary();

    io.emit('library:update', library);

    res.status(201).json({ character });
  }
);

const createAssetDeletionHandler = (collectionKey) => (req, res) => {
  const assetId = req.params?.id;
  const collection = ensureCustomCollection(collectionKey);

  if (!assetId) {
    res.status(400).json({ error: "Identifiant du média manquant." });
    return;
  }

  const assetIndex = collection.findIndex((item) => item.id === assetId);

  if (assetIndex === -1) {
    res.status(404).json({ error: 'Média introuvable.' });
    return;
  }

  const asset = collection[assetIndex];

  if (asset.origin !== 'upload') {
    res.status(400).json({ error: 'Ce média ne peut pas être supprimé.' });
    return;
  }

  collection.splice(assetIndex, 1);

  ['image', 'file', 'source'].forEach((key) => {
    const value = asset[key];

    if (value) {
      removeUploadFile(value);
    }
  });

  persistCustomLibrary();
  refreshLibrary();
  io.emit('library:update', library);

  res.status(200).json({ success: true });
};

app.post(
  '/api/assets/backgrounds',
  withUploader(backgroundUpload.single('image')),
  (req, res) => {
    const uploadedFile = req.file;
    const nameInput = (req.body?.name || '').toString().trim();
    const campaignId = (req.body?.campaignId || '').toString().trim();

    if (!uploadedFile) {
      res.status(400).json({ error: "Aucune image n'a été envoyée." });
      return;
    }

    if (!campaignId || !campaignsById[campaignId]) {
      res.status(400).json({ error: 'Sélectionnez une campagne valide avant d\'ajouter un décor.' });
      return;
    }

    const displayName = decodeUploadText(nameInput || uploadedFile.originalname);
    const backgroundId = createAssetId('bg', displayName);
    const publicPath = `/uploads/backgrounds/${uploadedFile.filename}`;
    const backgroundStyle = `#0f172a url("${publicPath}") center / cover no-repeat`;
    const background = {
      id: backgroundId,
      name: displayName,
      background: backgroundStyle,
      image: publicPath,
      origin: 'upload',
      createdAt: new Date().toISOString(),
      campaignId
    };

    if (!Array.isArray(customLibrary.backgrounds)) {
      customLibrary.backgrounds = [];
    }

    customLibrary.backgrounds.push(background);
    persistCustomLibrary();
    refreshLibrary();

    io.emit('library:update', library);

    res.status(201).json({ background });
  }
);

app.delete('/api/assets/characters/:id', createAssetDeletionHandler('characters'));
app.delete('/api/assets/backgrounds/:id', createAssetDeletionHandler('backgrounds'));
app.post(
  '/api/assets/tracks',
  withUploader(trackUpload.single('file')),
  (req, res) => {
    const uploadedFile = req.file;
    const nameInput = (req.body?.name || '').toString().trim();
    const campaignId = (req.body?.campaignId || '').toString().trim();

    if (!uploadedFile) {
      res.status(400).json({ error: "Aucun fichier média n'a été envoyé." });
      return;
    }

    if (!campaignId || !campaignsById[campaignId]) {
      res.status(400).json({ error: 'Sélectionnez une campagne valide avant d\'ajouter une piste.' });
      return;
    }

    const displayName = decodeUploadText(nameInput || uploadedFile.originalname);
    const trackId = createAssetId('track', displayName);
    const isVideo = isVideoMimeType(uploadedFile.mimetype);
    const subDirectory = isVideo ? 'video' : 'audio';
    const publicPath = `/uploads/tracks/${subDirectory}/${uploadedFile.filename}`;
    const track = {
      id: trackId,
      name: displayName,
      file: publicPath,
      mimeType: uploadedFile.mimetype,
      storage: subDirectory,
      origin: 'upload',
      createdAt: new Date().toISOString(),
      campaignId
    };

    const collection = ensureCustomCollection('tracks');
    collection.push(track);
    persistCustomLibrary();
    refreshLibrary();

    io.emit('library:update', library);

    res.status(201).json({ track });
  }
);
app.delete('/api/assets/tracks/:id', createAssetDeletionHandler('tracks'));

app.get('/api/scene', (req, res) => {
  res.json({ scene: currentScene });
});

const normaliseScene = (scene) => {
  if (!scene || typeof scene !== 'object') {
    return null;
  }

  const rawCampaignId = (scene.campaign || scene.campaignId || '').toString().trim();
  const campaignId = rawCampaignId && campaignsById[rawCampaignId] ? rawCampaignId : null;

  const requestedType = VALID_SCENE_TYPES.has(scene.type)
    ? scene.type
    : SCENE_TYPE_CHARACTER;

  if (requestedType === SCENE_TYPE_VIDEO) {
    const videoId = (scene.video || '').toString();

    if (!videoId) {
      return null;
    }

    const track = tracksById[videoId];

    if (!track || detectTrackKind(track) !== 'video') {
      return null;
    }

    return {
      type: SCENE_TYPE_VIDEO,
      video: track.id,
      campaign: campaignId,
      updatedAt: new Date().toISOString()
    };
  }

  const background = backgroundsById[scene.background]?.id ?? null;

  if (!background) {
    return null;
  }

  const leftInput = Array.isArray(scene.left) ? scene.left : [];
  const rightInput = Array.isArray(scene.right) ? scene.right : [];

  const requestedLayout = layoutsById[scene.layout];
  const leftLength = Math.min(leftInput.length, maxLeftSlots);
  const rightLength = Math.min(rightInput.length, maxRightSlots);

  const fallbackLayout = sceneLayouts.find(
    (option) => option.left === leftLength && option.right === rightLength
  );

  const layout = requestedLayout || fallbackLayout || layoutsById['2v3'] || sceneLayouts[0];

  const sanitiseSlot = (slot, limit) => {
    if (!limit) {
      return [];
    }

    const trimmed = slot.slice(0, limit);

    return Array.from({ length: limit }, (_, index) => {
      const candidate = trimmed[index];

      if (!candidate) {
        return null;
      }

      const rawId =
        typeof candidate === 'string'
          ? candidate
          : typeof candidate === 'object'
            ? candidate.id
            : null;

      const id = charactersById[rawId]?.id || null;

      if (!id) {
        return null;
      }

      const rawOrientation =
        typeof candidate === 'object' && candidate
          ? candidate.orientation
          : null;

      const orientation = VALID_ORIENTATIONS.has(rawOrientation)
        ? rawOrientation
        : NORMAL_ORIENTATION;

      return { id, orientation };
    });
  };

  return {
    type: SCENE_TYPE_CHARACTER,
    background,
    layout: layout.id,
    left: sanitiseSlot(leftInput, layout.left),
    right: sanitiseSlot(rightInput, layout.right),
    campaign: campaignId,
    updatedAt: new Date().toISOString()
  };
};

io.on('connection', (socket) => {
  socket.emit('scene:update', currentScene);
  socket.emit('audio:update', currentAudioMix);

  socket.on('scene:display', (scene) => {
    const validatedScene = normaliseScene(scene);

    if (!validatedScene) {
      return;
    }

    currentScene = validatedScene;
    io.emit('scene:update', currentScene);
  });

  socket.on('audio:set', (mix) => {
    setAudioMix(mix);
  });

  socket.on('disconnect', () => {
    // No clean-up required for now but keeping the handler for future use.
  });
});

server.on('listening', () => {
  const address = server.address();
  const resolvedPort =
    typeof address === 'object' && address !== null ? address.port : currentPort;

  console.log(`VisionJDR server listening on http://localhost:${resolvedPort}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    if (portWasExplicitlyRequested || portAttempts > MAX_PORT_RETRIES) {
      console.error(
        `Port ${currentPort} is already in use. Stop the other process or set the PORT environment variable to a different value before starting VisionJDR.`
      );
      process.exit(1);
    }

    const nextPort = requestedPort + portAttempts;

    console.warn(
      `Port ${currentPort} is in use. Retrying with port ${nextPort}. You can set the PORT environment variable or pass --port to choose a specific port.`
    );

    setTimeout(() => {
      startServer(nextPort);
    }, 250);

    return;
  }

  console.error('Unexpected error while starting the VisionJDR server.', error);
  process.exit(1);
});

startServer(requestedPort);
