const sceneElement = document.getElementById('scene');
const subtitleElement = document.querySelector('.top-bar__subtitle');
const leftColumn = document.getElementById('left-column');
const rightColumn = document.getElementById('right-column');

let backgroundsById = {};
let charactersById = {};
let latestScene = null;

const createCharacterCard = (characterId, position, column, index) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.style.setProperty('--stack-index', index);
  wrapper.classList.add(`character-card--${column}`);
  wrapper.style.zIndex = String(100 + index);

  if (!characterId) {
    wrapper.classList.add('character-card--empty');
    wrapper.innerHTML = `<span>Emplacement ${position}</span>`;
    return wrapper;
  }

  const character = charactersById[characterId];

  wrapper.style.background = character?.color ?? '#475569';
  wrapper.innerHTML = `<span>${character?.name ?? 'Inconnu'}</span>`;

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

  scene.left.forEach((characterId, index) => {
    leftColumn.appendChild(
      createCharacterCard(characterId, `gauche ${index + 1}`, 'left', index)
    );
  });

  scene.right.forEach((characterId, index) => {
    rightColumn.appendChild(
      createCharacterCard(characterId, `droite ${index + 1}`, 'right', index)
    );
  });

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

const initialise = async () => {
  const [libraryResponse, sceneResponse] = await Promise.all([
    fetch('/api/library'),
    fetch('/api/scene')
  ]);

  if (!libraryResponse.ok || !sceneResponse.ok) {
    if (subtitleElement) {
      subtitleElement.textContent = 'Impossible de charger les scènes';
    }
    return;
  }

  const library = await libraryResponse.json();
  const sceneData = await sceneResponse.json();

  backgroundsById = Object.fromEntries(library.backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(library.characters.map((item) => [item.id, item]));

  renderScene(sceneData.scene);

  const socket = io();
  socket.on('scene:update', renderScene);
};

initialise();
