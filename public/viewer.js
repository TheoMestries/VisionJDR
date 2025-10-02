const sceneElement = document.getElementById('scene');
const subtitleElement = document.querySelector('.top-bar__subtitle');
const leftColumn = document.getElementById('left-column');
const rightColumn = document.getElementById('right-column');

let backgroundsById = {};
let charactersById = {};
let latestScene = null;
let resizeFrame = null;

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

const createCharacterCard = (characterId, position, column, index, totalCount) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.classList.add(`character-card--${column}`);

  const stackSize = totalCount ?? 0;
  const overlayRank = column === 'left' ? index + 1 : stackSize - index;

  wrapper.style.zIndex = String(100 + overlayRank);

  wrapper.style.setProperty('--stack-translation', '0px');

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

  const leftCount = scene.left.length;
  scene.left.forEach((characterId, index) => {
    leftColumn.appendChild(
      createCharacterCard(
        characterId,
        `gauche ${index + 1}`,
        'left',
        index,
        leftCount
      )
    );
  });

  const rightCount = scene.right.length;
  scene.right.forEach((characterId, index) => {
    rightColumn.appendChild(
      createCharacterCard(
        characterId,
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
