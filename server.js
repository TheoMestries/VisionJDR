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

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const CHARACTER_UPLOADS_DIR = path.join(UPLOADS_DIR, 'characters');
const BACKGROUND_UPLOADS_DIR = path.join(UPLOADS_DIR, 'backgrounds');
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

const defaultBackgrounds = [
  {
    id: 'forest-day',
    name: 'Forêt ensoleillée',
    background: 'linear-gradient(135deg, #7bc043, #2c5f2d)',
    origin: 'default'
  },
  {
    id: 'arcane-lab',
    name: 'Laboratoire arcanique',
    background: 'radial-gradient(circle at top, #7f7fd5, #86a8e7, #91eae4)',
    origin: 'default'
  },
  {
    id: 'city-night',
    name: 'Ville nocturne',
    background: 'linear-gradient(160deg, #20002c, #4a0072 45%, #120136)',
    origin: 'default'
  }
];

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

const defaultCharacters = [
  { id: 'warrior', name: 'Guerrier', color: '#d35400', origin: 'default' },
  { id: 'mage', name: 'Mage', color: '#9b59b6', origin: 'default' },
  { id: 'archer', name: 'Archer', color: '#27ae60', origin: 'default' },
  { id: 'rogue', name: 'Voleuse', color: '#2c3e50', origin: 'default' },
  { id: 'cleric', name: 'Clerc', color: '#f1c40f', origin: 'default' },
  { id: 'bard', name: 'Barde', color: '#e74c3c', origin: 'default' }
];

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

const loadCustomLibrary = () => {
  const stored = safeReadJson(LIBRARY_FILE);

  if (!stored) {
    return { backgrounds: [], characters: [] };
  }

  return {
    backgrounds: Array.isArray(stored.backgrounds) ? stored.backgrounds : [],
    characters: Array.isArray(stored.characters) ? stored.characters : []
  };
};

let customLibrary = loadCustomLibrary();
let backgrounds = [];
let characters = [];
let backgroundsById = {};
let charactersById = {};
let library = { backgrounds: [], characters: [], layouts: [] };

const refreshLibrary = () => {
  backgrounds = [...defaultBackgrounds, ...(customLibrary.backgrounds ?? [])];
  characters = [...defaultCharacters, ...(customLibrary.characters ?? [])];

  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));
  library = { backgrounds, characters, layouts: sceneLayouts };
};

const persistCustomLibrary = () => {
  writeJson(LIBRARY_FILE, customLibrary);
};

refreshLibrary();

const randomSuffix = () => crypto.randomBytes(4).toString('hex');

const createAssetId = (prefix, name) => {
  const base = slugify(name);
  const timestamp = Date.now().toString(36);
  return `${prefix}-${base}-${randomSuffix()}`;
};

const createFileName = (originalName) => {
  const extension = path.extname(originalName) || '.png';
  const baseName = slugify(path.basename(originalName, extension));
  const timestamp = Date.now().toString(36);

  return `${baseName}-${timestamp}-${randomSuffix()}${extension}`;
};

const imageFileFilter = (req, file, callback) => {
  if (!file.mimetype.startsWith('image/')) {
    callback(new Error('Seuls les fichiers images sont autorisés.'));
    return;
  }

  callback(null, true);
};

const uploadLimits = { fileSize: 8 * 1024 * 1024 };

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

const defaultScene = () => {
  const layout = layoutsById['2v3'] ?? sceneLayouts[0];
  const backgroundOption = backgrounds[0]?.id ?? null;

  return {
    background: backgroundOption,
    layout: layout.id,
    right: selectCharacters(layout.right, 0),
    left: selectCharacters(layout.left, layout.right),
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

app.get('/api/assets/custom', (req, res) => {
  res.json({
    backgrounds: customLibrary.backgrounds ?? [],
    characters: customLibrary.characters ?? []
  });
});

app.post(
  '/api/assets/characters',
  withUploader(characterUpload.single('image')),
  (req, res) => {
    const uploadedFile = req.file;
    const nameInput = (req.body?.name || '').toString().trim();

    if (!uploadedFile) {
      res.status(400).json({ error: "Aucune image n'a été envoyée." });
      return;
    }

    const displayName = nameInput || uploadedFile.originalname;
    const characterId = createAssetId('char', displayName);
    const publicPath = `/uploads/characters/${uploadedFile.filename}`;
    const character = {
      id: characterId,
      name: displayName,
      color: '#1e293b',
      image: publicPath,
      origin: 'upload',
      createdAt: new Date().toISOString()
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

app.post(
  '/api/assets/backgrounds',
  withUploader(backgroundUpload.single('image')),
  (req, res) => {
    const uploadedFile = req.file;
    const nameInput = (req.body?.name || '').toString().trim();

    if (!uploadedFile) {
      res.status(400).json({ error: "Aucune image n'a été envoyée." });
      return;
    }

    const displayName = nameInput || uploadedFile.originalname;
    const backgroundId = createAssetId('bg', displayName);
    const publicPath = `/uploads/backgrounds/${uploadedFile.filename}`;
    const backgroundStyle = `#0f172a url("${publicPath}") center / cover no-repeat`;
    const background = {
      id: backgroundId,
      name: displayName,
      background: backgroundStyle,
      image: publicPath,
      origin: 'upload',
      createdAt: new Date().toISOString()
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

app.get('/api/scene', (req, res) => {
  res.json({ scene: currentScene });
});

const normaliseScene = (scene) => {
  if (!scene || typeof scene !== 'object') {
    return null;
  }

  const background = backgroundsById[scene.background]?.id ?? null;
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
      return charactersById[candidate]?.id || null;
    });
  };

  if (!background) {
    return null;
  }

  return {
    background,
    layout: layout.id,
    left: sanitiseSlot(leftInput, layout.left),
    right: sanitiseSlot(rightInput, layout.right),
    updatedAt: new Date().toISOString()
  };
};

io.on('connection', (socket) => {
  socket.emit('scene:update', currentScene);

  socket.on('scene:display', (scene) => {
    const validatedScene = normaliseScene(scene);

    if (!validatedScene) {
      return;
    }

    currentScene = validatedScene;
    io.emit('scene:update', currentScene);
  });

  socket.on('disconnect', () => {
    // No clean-up required for now but keeping the handler for future use.
  });
});

server.listen(PORT, () => {
  console.log(`VisionJDR server listening on http://localhost:${PORT}`);
});
