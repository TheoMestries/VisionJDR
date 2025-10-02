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

const characters = [
  { id: 'warrior', name: 'Guerrier', color: '#d35400' },
  { id: 'mage', name: 'Mage', color: '#9b59b6' },
  { id: 'archer', name: 'Archer', color: '#27ae60' },
  { id: 'rogue', name: 'Voleuse', color: '#2c3e50' },
  { id: 'cleric', name: 'Clerc', color: '#f1c40f' },
  { id: 'bard', name: 'Barde', color: '#e74c3c' }
];

const defaultScene = () => ({
  background: backgrounds[0].id,
  right: characters.slice(0, 3).map((character) => character.id),
  left: characters.slice(3, 5).map((character) => character.id),
  updatedAt: new Date().toISOString()
});

let currentScene = defaultScene();

const library = { backgrounds, characters };

app.use(express.static(path.join(__dirname, 'public')));

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
  const left = Array.isArray(scene.left) ? scene.left.slice(0, 2) : [];
  const right = Array.isArray(scene.right) ? scene.right.slice(0, 3) : [];

  const sanitiseSlot = (slot, limit) => {
    const fallback = new Array(limit).fill(null);
    return fallback.map((_, index) => {
      const candidate = slot[index];
      return characters.find((option) => option.id === candidate)?.id || null;
    });
  };

  if (!background) {
    return null;
  }

  return {
    background,
    left: sanitiseSlot(left, 2),
    right: sanitiseSlot(right, 3),
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
