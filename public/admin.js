const form = document.getElementById('scene-form');
const backgroundSelect = document.getElementById('background');
const leftSelects = [document.getElementById('left-0'), document.getElementById('left-1')];
const rightSelects = [
  document.getElementById('right-0'),
  document.getElementById('right-1'),
  document.getElementById('right-2')
];
const statusElement = document.getElementById('form-status');
const previewScene = document.getElementById('preview-scene');
const previewLeft = document.getElementById('preview-left');
const previewRight = document.getElementById('preview-right');

let socket;
let backgrounds = [];
let characters = [];
let backgroundsById = {};
let charactersById = {};
let currentScene = null;
let previewLayoutFrame = null;

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

const createCharacterCard = (characterId, label, column, index, totalCount) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.classList.add(`character-card--${column}`);

  const stackSize = totalCount ?? 0;
  const overlayRank = column === 'left' ? index + 1 : stackSize - index;

  wrapper.style.zIndex = String(100 + overlayRank);
  wrapper.style.setProperty('--stack-translation', '0px');

  if (!characterId) {
    wrapper.classList.add('character-card--empty');
    wrapper.innerHTML = `<span>Emplacement ${label}</span>`;
    return wrapper;
  }

  const character = charactersById[characterId];
  wrapper.style.background = character?.color ?? '#475569';
  wrapper.innerHTML = `<span>${character?.name ?? 'Inconnu'}</span>`;
  return wrapper;
};

const renderPreview = (scene) => {
  if (!scene) {
    return;
  }

  const background = backgroundsById[scene.background];
  previewScene.style.background = background?.background ?? 'linear-gradient(160deg, #1e293b, #020617)';

  previewLeft.replaceChildren();
  previewRight.replaceChildren();

  const leftCount = scene.left.length;
  scene.left.forEach((characterId, index) => {
    previewLeft.appendChild(
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
    previewRight.appendChild(
      createCharacterCard(
        characterId,
        `droite ${index + 1}`,
        'right',
        index,
        rightCount
      )
    );
  });

  schedulePreviewLayout();
};

const applySceneToForm = (scene) => {
  if (!scene) {
    return;
  }

  backgroundSelect.value = scene.background;
  leftSelects.forEach((select, index) => {
    select.value = scene.left[index] ?? '';
  });
  rightSelects.forEach((select, index) => {
    select.value = scene.right[index] ?? '';
  });

  renderPreview(scene);
};

const getSceneFromForm = () => ({
  background: backgroundSelect.value,
  left: leftSelects.map((select) => select.value || null),
  right: rightSelects.map((select) => select.value || null)
});

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
    element.textContent = option.name;
    select.appendChild(element);
  });
};

const attachFormListeners = () => {
  const inputs = [backgroundSelect, ...leftSelects, ...rightSelects];
  inputs.forEach((input) => {
    input.addEventListener('change', () => {
      currentScene = getSceneFromForm();
      renderPreview(currentScene);
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const scene = getSceneFromForm();

    if (!scene.background) {
      statusElement.textContent = 'Sélectionnez un décor avant de diffuser.';
      return;
    }

    statusElement.textContent = 'Diffusion en cours…';
    socket.emit('scene:display', scene);
  });
};

const handleSceneUpdate = (scene) => {
  currentScene = scene;
  applySceneToForm(scene);
  const updatedAt = new Date(scene.updatedAt ?? Date.now());
  const formattedTime = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(updatedAt);
  statusElement.textContent = `Scène diffusée (${formattedTime})`;
};

const initialise = async () => {
  const libraryResponse = await fetch('/api/library');
  const sceneResponse = await fetch('/api/scene');

  if (!libraryResponse.ok || !sceneResponse.ok) {
    statusElement.textContent = 'Impossible de charger les données.';
    return;
  }

  const library = await libraryResponse.json();
  const sceneData = await sceneResponse.json();

  backgrounds = library.backgrounds;
  characters = library.characters;
  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));

  populateSelect(backgroundSelect, backgrounds);
  [...leftSelects, ...rightSelects].forEach((select) => populateSelect(select, characters, { includeEmpty: true }));

  attachFormListeners();

  socket = io();
  socket.on('scene:update', handleSceneUpdate);

  handleSceneUpdate(sceneData.scene);
};

initialise();

window.addEventListener('resize', () => {
  if (!currentScene) {
    return;
  }

  schedulePreviewLayout();
});
