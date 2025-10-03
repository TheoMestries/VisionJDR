const form = document.getElementById('scene-form');
const layoutSelect = document.getElementById('layout');
const backgroundSelect = document.getElementById('background');
const leftLabel = document.getElementById('left-label');
const rightLabel = document.getElementById('right-label');
const leftContainer = document.getElementById('left-selects');
const rightContainer = document.getElementById('right-selects');
const statusElement = document.getElementById('form-status');
const previewScene = document.getElementById('preview-scene');
const previewLeft = document.getElementById('preview-left');
const previewRight = document.getElementById('preview-right');

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
    wrapper.innerHTML = `<span class="character-card__label">Emplacement ${label}</span>`;
    return wrapper;
  }

  const character = charactersById[characterId];
  const characterName = character?.name ?? 'Inconnu';

  if (character?.image) {
    wrapper.classList.add('character-card--with-image');
    wrapper.style.background = `linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.82)), url("${character.image}") center / cover no-repeat`;
  } else {
    wrapper.style.background = character?.color ?? '#475569';
  }

  wrapper.innerHTML = `<span class="character-card__label">${characterName}</span>`;
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

const getSelectValues = (selects) =>
  selects.map((select) => (select.value ? select.value : null));

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

const rebuildCharacterSelects = (container, count, prefix, emptyMessage) => {
  container.innerHTML = '';

  if (!count) {
    container.appendChild(createPlaceholder(emptyMessage));
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const select = document.createElement('select');
    select.id = `${prefix}-${index}`;
    select.name = `${prefix}-${index}`;
    populateSelect(select, characters, { includeEmpty: true });
    container.appendChild(select);
    return select;
  });
};

const getSceneFromForm = () => ({
  background: backgroundSelect.value,
  layout: layoutSelect.value || currentLayout?.id || null,
  left: getSelectValues(leftSelectElements),
  right: getSelectValues(rightSelectElements)
});

const applyLayout = (layout, { leftValues = [], rightValues = [] } = {}) => {
  if (!layout) {
    return;
  }

  currentLayout = layout;
  layoutSelect.value = layout.id;

  setFieldLabel(leftLabel, layout.left, 'gauche');
  setFieldLabel(rightLabel, layout.right, 'droite');

  leftSelectElements = rebuildCharacterSelects(
    leftContainer,
    layout.left,
    'left',
    'Aucun personnage à gauche pour cette configuration.'
  );
  rightSelectElements = rebuildCharacterSelects(
    rightContainer,
    layout.right,
    'right',
    'Aucun personnage à droite pour cette configuration.'
  );

  leftSelectElements.forEach((select, index) => {
    select.value = leftValues[index] ?? '';
    select.addEventListener('change', handleFormInputChange);
  });

  rightSelectElements.forEach((select, index) => {
    select.value = rightValues[index] ?? '';
    select.addEventListener('change', handleFormInputChange);
  });
};

const findLayoutForScene = (scene) => {
  if (!scene) {
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

  const preservedLeft = getSelectValues(leftSelectElements);
  const preservedRight = getSelectValues(rightSelectElements);

  applyLayout(selectedLayout, {
    leftValues: preservedLeft,
    rightValues: preservedRight
  });

  handleFormInputChange();
};

const attachFormListeners = () => {
  backgroundSelect.addEventListener('change', handleFormInputChange);
  layoutSelect.addEventListener('change', handleLayoutSelectionChange);

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
  applySceneToForm(scene);
  const updatedAt = new Date((scene && scene.updatedAt) || Date.now());
  const formattedTime = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(updatedAt);

  const layoutLabel =
    layoutsById[currentScene?.layout ?? scene?.layout ?? '']?.label ||
    `${currentScene?.left?.length ?? 0} vs ${currentScene?.right?.length ?? 0}`;

  statusElement.textContent = `Scène ${layoutLabel} diffusée (${formattedTime})`;
};

const handleLibraryUpdate = (nextLibrary) => {
  if (!nextLibrary) {
    return;
  }

  const nextBackgrounds = Array.isArray(nextLibrary.backgrounds)
    ? nextLibrary.backgrounds
    : backgrounds;
  const nextCharacters = Array.isArray(nextLibrary.characters)
    ? nextLibrary.characters
    : characters;

  backgrounds = nextBackgrounds;
  characters = nextCharacters;

  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));

  const preservedScene = getSceneFromForm();

  populateSelect(backgroundSelect, backgrounds);

  leftSelectElements.forEach((select, index) => {
    const previousValue = preservedScene.left[index] ?? '';
    populateSelect(select, characters, { includeEmpty: true });
    select.value = previousValue ?? '';
  });

  rightSelectElements.forEach((select, index) => {
    const previousValue = preservedScene.right[index] ?? '';
    populateSelect(select, characters, { includeEmpty: true });
    select.value = previousValue ?? '';
  });

  const backgroundValue = backgroundsById[preservedScene.background]
    ? preservedScene.background
    : backgrounds[0]?.id ?? '';

  backgroundSelect.value = backgroundValue;

  currentScene = getSceneFromForm();
  renderPreview(currentScene);
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

  backgrounds = library.backgrounds ?? [];
  characters = library.characters ?? [];
  layouts = library.layouts ?? [];

  if (!layouts.length) {
    layouts = [{ id: '2v3', label: '2 vs 3', left: 2, right: 3 }];
  }

  backgroundsById = Object.fromEntries(backgrounds.map((item) => [item.id, item]));
  charactersById = Object.fromEntries(characters.map((item) => [item.id, item]));
  layoutsById = Object.fromEntries(layouts.map((item) => [item.id, item]));

  populateSelect(layoutSelect, layouts);
  populateSelect(backgroundSelect, backgrounds);

  attachFormListeners();

  socket = io();
  socket.on('scene:update', handleSceneUpdate);
  socket.on('library:update', handleLibraryUpdate);

  handleSceneUpdate(sceneData.scene);
};

initialise();

window.addEventListener('resize', () => {
  if (!currentScene) {
    return;
  }

  schedulePreviewLayout();
});
