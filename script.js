/**
 * Juego de Memoria Pokémon (PokeAPI Memory Match Game)
 */

// Configuración general del juego
const NUM_PAIRS = 8; // 8 parejas = 16 cartas en total (4x4)
const MAX_POKEMON_ID = 151; // Pokémon de la primera generación (Kanto)

// Elementos del DOM
const gameBoard = document.getElementById('game-board');
const movesElement = document.getElementById('moves-count');
const matchesElement = document.getElementById('matches-count');
const timeElement = document.getElementById('time-count');
const restartBtn = document.getElementById('restart-btn');
const loadingElement = document.getElementById('loading');

// Modal de Victoria
const victoryModal = document.getElementById('victory-modal');
const modalMoves = document.getElementById('modal-moves');
const modalTime = document.getElementById('modal-time');
const playAgainBtn = document.getElementById('play-again-btn');

// Estado del juego
let cardsData = [];
let flippedCards = [];
let matchedPairs = 0;
let moves = 0;
let lockBoard = false;
let timer = null;
let seconds = 0;
let isTimerRunning = false;

// SVG de la Pokéball reutilizable para el reverso de cada carta
const POKEBALL_SVG = `
  <svg class="pokeball-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#1e293b" stroke-width="6"/>
    <path d="M 4,50 A 46,46 0 0,1 96,50 Z" fill="#ef4444" stroke="#1e293b" stroke-width="6"/>
    <line x1="4" y1="50" x2="96" y2="50" stroke="#1e293b" stroke-width="6"/>
    <circle cx="50" cy="50" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="6"/>
    <circle cx="50" cy="50" r="6" fill="#1e293b"/>
  </svg>
`;

/**
 * 1. Genera un conjunto de IDs aleatorios y únicos entre 1 y MAX_POKEMON_ID
 */
function getRandomPokemonIds(count, max) {
  const ids = new Set();
  while (ids.size < count) {
    const randomId = Math.floor(Math.random() * max) + 1;
    ids.add(randomId);
  }
  return Array.from(ids);
}

/**
 * Realiza las llamadas a la PokeAPI para obtener los datos de los Pokémon seleccionados
 */
async function fetchPokemonData() {
  const ids = getRandomPokemonIds(NUM_PAIRS, MAX_POKEMON_ID);

  const fetchPromises = ids.map(async (id) => {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!response.ok) {
      throw new Error(`Error al cargar el Pokémon con ID ${id}`);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      // Usamos el arte oficial de alta calidad, o el sprite frontal por defecto como fallback
      image: data.sprites.other?.['official-artwork']?.front_default || data.sprites.front_default
    };
  });

  return await Promise.all(fetchPromises);
}

/**
 * Mezcla aleatoria de un array utilizando el algoritmo Fisher-Yates
 */
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Prepara el mazo de cartas duplicando y mezclando
 */
function prepareDeck(pokemonList) {
  // Duplicamos el array para formar las parejas (8 * 2 = 16)
  const pairedCards = pokemonList.flatMap((pokemon, index) => [
    { ...pokemon, cardKey: `${pokemon.id}-A-${index}` },
    { ...pokemon, cardKey: `${pokemon.id}-B-${index}` }
  ]);

  // Mezclamos el array antes de renderizar
  return shuffleArray(pairedCards);
}

/**
 * 2. Renderizado e Interfaz (UI):
 * Construye el elemento HTML de cada carta con estructura 3D (front & back)
 */
function createCardElement(pokemonData) {
  const card = document.createElement('div');
  card.classList.add('card');
  card.dataset.pokemonId = pokemonData.id;
  card.dataset.cardKey = pokemonData.cardKey;

  card.innerHTML = `
    <div class="card-inner">
      <div class="card-back" title="Haz clic para voltear">
        ${POKEBALL_SVG}
      </div>
      <div class="card-front">
        <img class="pokemon-img" src="${pokemonData.image}" alt="${pokemonData.name}" loading="lazy" />
        <span class="pokemon-name">${pokemonData.name}</span>
        <span class="pokemon-id">#${String(pokemonData.id).padStart(3, '0')}</span>
      </div>
    </div>
  `;

  // Evento de clic para voltear la carta
  card.addEventListener('click', handleCardClick);
  return card;
}

/**
 * Renderiza todas las cartas en el contenedor Grid
 */
function renderBoard(cards) {
  gameBoard.innerHTML = '';
  const fragment = document.createDocumentFragment();

  cards.forEach((cardData) => {
    const cardElement = createCardElement(cardData);
    fragment.appendChild(cardElement);
  });

  gameBoard.appendChild(fragment);
}

/**
 * 3 & 4. Lógica del Juego:
 * Manejo de eventos de clic en las cartas
 */
function handleCardClick(event) {
  const clickedCard = event.currentTarget;

  // Condiciones de bloqueo:
  // - Tablero bloqueado por animación pendiente
  // - La carta ya está volteada o ya fue emparejada
  if (
    lockBoard ||
    clickedCard.classList.contains('flipped') ||
    clickedCard.classList.contains('matched')
  ) {
    return;
  }

  // Iniciar el temporizador con el primer clic del jugador
  if (!isTimerRunning) {
    startTimer();
  }

  // Voltear carta actual (CSS 3D flip con .flipped)
  clickedCard.classList.add('flipped');
  flippedCards.push(clickedCard);

  // Cuando se han volteado 2 cartas
  if (flippedCards.length === 2) {
    moves++;
    updateStatsDisplay();
    checkForMatch();
  }
}

/**
 * Verifica si las dos cartas volteadas coinciden
 */
function checkForMatch() {
  const [firstCard, secondCard] = flippedCards;
  const isMatch = firstCard.dataset.pokemonId === secondCard.dataset.pokemonId;

  if (isMatch) {
    handleCardsMatch(firstCard, secondCard);
  } else {
    handleCardsMismatch(firstCard, secondCard);
  }
}

/**
 * Caso: Las cartas coinciden
 */
function handleCardsMatch(firstCard, secondCard) {
  // Se quedan boca arriba permanentemente con la clase 'matched'
  firstCard.classList.add('matched');
  secondCard.classList.add('matched');

  // Limpiamos las cartas volteadas
  flippedCards = [];
  matchedPairs++;
  updateStatsDisplay();

  // 5. Detectar fin del juego cuando se encuentran todas las parejas
  if (matchedPairs === NUM_PAIRS) {
    stopTimer();
    setTimeout(showVictoryModal, 600);
  }
}

/**
 * Caso: Las cartas no coinciden
 */
function handleCardsMismatch(firstCard, secondCard) {
  // Bloquear el tablero para evitar nuevos clics durante la espera
  lockBoard = true;

  // Esperar aproximadamente 1 segundo y volver a voltearlas boca abajo
  setTimeout(() => {
    firstCard.classList.remove('flipped');
    secondCard.classList.remove('flipped');

    // Desbloquear tablero y vaciar array
    flippedCards = [];
    lockBoard = false;
  }, 1000);
}

/**
 * 5. Muestra el modal de victoria con estadísticas finales
 */
function showVictoryModal() {
  modalMoves.textContent = moves;
  modalTime.textContent = formatTime(seconds);
  victoryModal.classList.add('active');
}

/**
 * Oculta el modal de victoria
 */
function hideVictoryModal() {
  victoryModal.classList.remove('active');
}

/**
 * Funciones del temporizador y estadísticas
 */
function startTimer() {
  isTimerRunning = true;
  clearInterval(timer);
  timer = setInterval(() => {
    seconds++;
    timeElement.textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  isTimerRunning = false;
  clearInterval(timer);
}

function resetTimer() {
  stopTimer();
  seconds = 0;
  timeElement.textContent = '00:00';
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateStatsDisplay() {
  movesElement.textContent = moves;
  matchesElement.textContent = `${matchedPairs}/${NUM_PAIRS}`;
}

function resetStats() {
  moves = 0;
  matchedPairs = 0;
  flippedCards = [];
  lockBoard = false;
  resetTimer();
  updateStatsDisplay();
}

/**
 * Inicializa y reinicia el juego (nueva llamada a la PokeAPI)
 */
async function initGame() {
  hideVictoryModal();
  resetStats();

  // Mostrar indicador de carga y ocultar tablero momentáneamente
  loadingElement.style.display = 'flex';
  gameBoard.style.display = 'none';

  try {
    // 1. Fetch de los datos a la PokeAPI
    const pokemonList = await fetchPokemonData();

    // 2. Duplicar y mezclar cartas
    cardsData = prepareDeck(pokemonList);

    // 3. Renderizar en el tablero
    renderBoard(cardsData);

    // Mostrar tablero
    loadingElement.style.display = 'none';
    gameBoard.style.display = 'grid';
  } catch (error) {
    console.error('Error al iniciar el juego:', error);
    loadingElement.innerHTML = `
      <p style="color: #ef4444; font-weight: bold; margin-bottom: 1rem;">
        Hubo un error al cargar los Pokémon de la API.
      </p>
      <button class="btn" onclick="initGame()">Reintentar</button>
    `;
  }
}

// Event Listeners
restartBtn.addEventListener('click', initGame);
playAgainBtn.addEventListener('click', initGame);

// Iniciar el juego automáticamente al cargar la página
document.addEventListener('DOMContentLoaded', initGame);
