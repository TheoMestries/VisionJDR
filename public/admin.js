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

const ORIENTATION_NORMAL = 'normal';
const ORIENTATION_MIRRORED = 'mirrored';
const VALID_ORIENTATIONS = new Set([ORIENTATION_NORMAL, ORIENTATION_MIRRORED]);

const orientationOptions = [
  { value: ORIENTATION_NORMAL, label: 'Orientation normale' },
  { value: ORIENTATION_MIRRORED, label: 'Orientation inversée' }
];

const getSlotInfo = (slot) => {
  if (!slot) {
    return { id: null, orientation: ORIENTATION_NORMAL };
  }

  if (typeof slot === 'string') {
    return { id: slot, orientation: ORIENTATION_NORMAL };
  }

  if (typeof slot === 'object') {
    const id = slot.id ?? null;
    const orientation = VALID_ORIENTATIONS.has(slot.orientation)
      ? slot.orientation
      : ORIENTATION_NORMAL;
    return { id, orientation };
  }

  return { id: null, orientation: ORIENTATION_NORMAL };
};

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

const createCharacterCard = (slot, label, column, index, totalCount) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-card';
  wrapper.classList.add(`character-card--${column}`);

  const stackSize = totalCount ?? 0;
  const overlayRank = column === 'left' ? index + 1 : stackSize - index;

  wrapper.style.zIndex = String(100 + overlayRank);
  wrapper.style.setProperty('--stack-translation', '0px');

  const { id: characterId, orientation } = getSlotInfo(slot);

  if (!characterId) {
    wrapper.classList.add('character-card--empty');
    wrapper.innerHTML = `<span class="character-card__label">Emplacement ${label}</span>`;
    return wrapper;
  }

  const character = charactersById[characterId];
  const characterName = character?.name ?? 'Inconnu';

  if (character?.image) {
    wrapper.classList.add('character-card--with-image');

    const imageElement = document.createElement('img');
    imageElement.className = 'character-card__image';
    imageElement.src = character.image;
    imageElement.alt = characterName;
    imageElement.loading = 'lazy';

    if (orientation === ORIENTATION_MIRRORED) {
      imageElement.classList.add('character-card__image--mirrored');
    }

    wrapper.appendChild(imageElement);

    const normalizedPath = (character.image ?? '').split('?')[0].toLowerCase();

    if (normalizedPath.endsWith('.png')) {
      wrapper.classList.add('character-card--transparent');
    }
  } else {
    wrapper.style.background = character?.color ?? '#475569';
  }

  const labelElement = document.createElement('span');
  labelElement.className = 'character-card__label';
  labelElement.textContent = characterName;
  wrapper.appendChild(labelElement);

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

  const leftSlots = Array.isArray(scene.left) ? scene.left : [];
  const leftCount = leftSlots.length;
  leftSlots.forEach((slot, index) => {
    previewLeft.appendChild(
      createCharacterCard(
        slot,
        `gauche ${index + 1}`,
        'left',
        index,
        leftCount
      )
    );
  });

  const rightSlots = Array.isArray(scene.right) ? scene.right : [];
  const rightCount = rightSlots.length;
  rightSlots.forEach((slot, index) => {
    previewRight.appendChild(
      createCharacterCard(
        slot,
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

const createOrientationSelect = (prefix, index, sideLabel) => {
  const select = document.createElement('select');
  select.id = `${prefix}-${index}-orientation`;
  select.name = `${prefix}-${index}-orientation`;
  select.classList.add('slot-controls__orientation');
  select.setAttribute('aria-label', `Orientation ${sideLabel} ${index + 1}`);

  orientationOptions.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });

  select.value = ORIENTATION_NORMAL;
  return select;
};

const syncOrientationAvailability = (slotControls) => {
  if (!slotControls) {
    return;
  }

  const hasCharacter = Boolean(slotControls.characterSelect.value);
  slotControls.orientationSelect.disabled = !hasCharacter;
  slotControls.orientationSelect.classList.toggle(
    'slot-controls__orientation--disabled',
    !hasCharacter
  );
};

const rebuildCharacterSlots = (container, count, prefix, emptyMessage) => {
  container.innerHTML = '';

  if (!count) {
    container.appendChild(createPlaceholder(emptyMessage));
    return [];
  }

  const sideLabel = prefix === 'left' ? 'gauche' : 'droite';

  return Array.from({ length: count }, (_, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'slot-controls';

    const characterSelect = document.createElement('select');
    characterSelect.id = `${prefix}-${index}`;
    characterSelect.name = `${prefix}-${index}`;
    populateSelect(characterSelect, characters, { includeEmpty: true });

    const orientationSelect = createOrientationSelect(prefix, index, sideLabel);

    wrapper.appendChild(characterSelect);
    wrapper.appendChild(orientationSelect);
    container.appendChild(wrapper);

    const slotControls = {
      wrapper,
      characterSelect,
      orientationSelect
    };

    syncOrientationAvailability(slotControls);

    return slotControls;
  });
};

const collectSlotValues = (slots) =>
  slots.map(({ characterSelect, orientationSelect }) => {
    const id = characterSelect.value || null;
    const orientation = VALID_ORIENTATIONS.has(orientationSelect.value)
      ? orientationSelect.value
      : ORIENTATION_NORMAL;

    if (!id) {
      return null;
    }

    return { id, orientation };
  });

const applySlotValue = (slotControls, value) => {
  if (!slotControls) {
    return;
  }

  const { id, orientation } = getSlotInfo(value);
  slotControls.characterSelect.value = id ?? '';
  slotControls.orientationSelect.value = orientation;
  syncOrientationAvailability(slotControls);
};

const getSceneFromForm = () => ({
  background: backgroundSelect.value,
  layout: layoutSelect.value || currentLayout?.id || null,
  left: collectSlotValues(leftSelectElements),
  right: collectSlotValues(rightSelectElements)
});

const applyLayout = (layout, { leftValues = [], rightValues = [] } = {}) => {
  if (!layout) {
    return;
  }

  currentLayout = layout;
  layoutSelect.value = layout.id;

  setFieldLabel(leftLabel, layout.left, 'gauche');
  setFieldLabel(rightLabel, layout.right, 'droite');

  leftSelectElements = rebuildCharacterSlots(
    leftContainer,
    layout.left,
    'left',
    'Aucun personnage à gauche pour cette configuration.'
  );
  rightSelectElements = rebuildCharacterSlots(
    rightContainer,
    layout.right,
    'right',
    'Aucun personnage à droite pour cette configuration.'
  );

  leftSelectElements.forEach((slot, index) => {
    applySlotValue(slot, leftValues[index]);
    slot.characterSelect.addEventListener('change', () => {
      if (!slot.characterSelect.value) {
        slot.orientationSelect.value = ORIENTATION_NORMAL;
      }
      syncOrientationAvailability(slot);
      handleFormInputChange();
    });
    slot.orientationSelect.addEventListener('change', handleFormInputChange);
  });

  rightSelectElements.forEach((slot, index) => {
    applySlotValue(slot, rightValues[index]);
    slot.characterSelect.addEventListener('change', () => {
      if (!slot.characterSelect.value) {
        slot.orientationSelect.value = ORIENTATION_NORMAL;
      }
      syncOrientationAvailability(slot);
      handleFormInputChange();
    });
    slot.orientationSelect.addEventListener('change', handleFormInputChange);
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

  const preservedLeft = collectSlotValues(leftSelectElements);
  const preservedRight = collectSlotValues(rightSelectElements);

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

  leftSelectElements.forEach((slot, index) => {
    const previousValue = preservedScene.left[index] ?? null;
    populateSelect(slot.characterSelect, characters, { includeEmpty: true });
    applySlotValue(slot, previousValue);
  });

  rightSelectElements.forEach((slot, index) => {
    const previousValue = preservedScene.right[index] ?? null;
    populateSelect(slot.characterSelect, characters, { includeEmpty: true });
    applySlotValue(slot, previousValue);
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
