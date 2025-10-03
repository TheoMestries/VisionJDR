const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const backgrounds = [
  {
    id: 'forest-day',
    name: 'Forêt ensoleillée',
    background: 'linear-gradient(135deg, #7bc043, #2c5f2d)'
  },
  {
    id: 'arcane-lab',
    name: 'Laboratoire arcanique',
    background: 'radial-gradient(circle at top, #7f7fd5, #86a8e7, #91eae4)'
  },
  {
    id: 'city-night',
    name: 'Ville nocturne',
    background: 'linear-gradient(160deg, #20002c, #4a0072 45%, #120136)'
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

const characters = [
  { id: 'warrior', name: 'Guerrier', color: '#d35400' },
  { id: 'mage', name: 'Mage', color: '#9b59b6' },
  { id: 'archer', name: 'Archer', color: '#27ae60' },
  { id: 'rogue', name: 'Voleuse', color: '#2c3e50' },
  { id: 'cleric', name: 'Clerc', color: '#f1c40f' },
  { id: 'bard', name: 'Barde', color: '#e74c3c' }
];

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

  return {
    background: backgrounds[0].id,
    layout: layout.id,
    right: selectCharacters(layout.right, 0),
    left: selectCharacters(layout.left, layout.right),
    updatedAt: new Date().toISOString()
  };
};

let currentScene = defaultScene();

const library = { backgrounds, characters, layouts: sceneLayouts };

app.use(express.static(path.join(__dirname, 'public')));

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/library', (req, res) => {
  res.json(library);
});

app.get('/api/scene', (req, res) => {
  res.json({ scene: currentScene });
});

const normaliseScene = (scene) => {
  if (!scene || typeof scene !== 'object') {
    return null;
  }

  const background = backgrounds.find((option) => option.id === scene.background)?.id;
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
      return characters.find((option) => option.id === candidate)?.id || null;
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
