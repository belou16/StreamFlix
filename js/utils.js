/**
 * Fonctions partagées par les trois pages : création d'éléments, mise en forme
 * des données de l'API et stockage de « Ma liste » dans le navigateur.
 */

// DOM

export function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);

  if (className) element.className = className;
  if (text) element.textContent = text;

  return element;
}

export function cloneTemplate(selector) {
  const template = document.querySelector(selector);
  return template.content.firstElementChild.cloneNode(true);
}

export function debounce(callback, delay) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

// Texte et dates

// Minuscules et sans accents, pour que « pokemon » trouve « Pokémon ».
export function normalizeText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// formatCount(2, 'série retenue', 'séries retenues') → « 2 séries retenues »
export function formatCount(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`;
}

// Date locale au format AAAA-MM-JJ (toISOString donnerait la date UTC, décalée la nuit).
export function getTodayDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${today.getFullYear()}-${month}-${day}`;
}

/**
 * Le résumé fourni par l'API contient du HTML. Plutôt que de l'injecter tel quel (risque XSS),
 * on l'analyse avec DOMParser, qui n'exécute aucun script, et on n'en garde que le texte.
 */
export function htmlToParagraphs(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs = [...parsed.querySelectorAll('p')].map((paragraph) => paragraph.textContent.trim());
  const texts = paragraphs.length > 0 ? paragraphs : [parsed.body.textContent.trim()];

  return texts.filter(Boolean);
}

// Données des séries

const STATUS_LABELS = {
  Running: 'En cours',
  Ended: 'Terminée',
  'To Be Determined': 'À déterminer',
  'In Development': 'En développement',
};

const STAR_COUNT = 5;

const ratingFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function getRating(show) {
  return show.rating?.average ?? null;
}

export function getYear(show) {
  return show.premiered ? Number(show.premiered.slice(0, 4)) : null;
}

export function getPosterUrl(show, size = 'medium') {
  return show.image?.[size] ?? null;
}

export function formatYear(year) {
  return year === null ? 'Année inconnue' : String(year);
}

export function formatRating(rating) {
  return ratingFormatter.format(rating);
}

// La note de l'API est sur 10, l'affichage se fait sur 5 étoiles.
export function formatStars(rating) {
  const filledStars = Math.round(rating / 2);
  return '★'.repeat(filledStars) + '☆'.repeat(STAR_COUNT - filledStars);
}

export function formatNetwork(show) {
  // Les séries diffusées en ligne n'ont pas de chaîne mais une plateforme (webChannel).
  return show.network?.name ?? show.webChannel?.name ?? 'Chaîne inconnue';
}

export function formatStatus(status) {
  return STATUS_LABELS[status] ?? status ?? 'Statut inconnu';
}

// Une valeur absente (null) est toujours placée en fin de liste, quel que soit le sens du tri.
export function compareNullable(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return (a - b) * direction;
}

// Ma liste

const WATCHLIST_KEY = 'streamflix-watchlist';

// Mêmes bornes que les attributs min et max du champ de priorité (liste.html).
export const MIN_PRIORITY = 1;
export const MAX_PRIORITY = 10;

export function getWatchlist() {
  // Une valeur illisible (modifiée à la main, ancien format) ne doit pas empêcher le site de fonctionner :
  // la liste repart alors de zéro.
  try {
    const savedList = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(savedList) ? savedList : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

export function isInWatchlist(showId) {
  return getWatchlist().some((item) => item.id === showId);
}

export function addToWatchlist(show) {
  const list = getWatchlist();
  if (list.some((item) => item.id === show.id)) return;

  list.push({
    id: show.id,
    name: show.name,
    year: getYear(show),
    image: getPosterUrl(show),
    priority: Math.min(list.length + 1, MAX_PRIORITY),
  });

  saveWatchlist(list);
}

export function removeFromWatchlist(showId) {
  saveWatchlist(getWatchlist().filter((item) => item.id !== showId));
}

export function updatePriority(showId, priority) {
  const list = getWatchlist().map((item) => (item.id === showId ? { ...item, priority } : item));
  saveWatchlist(list);
}

// `value` est la valeur brute du champ : une chaîne, vide si la saisie n'est pas un nombre.
export function isValidPriority(value) {
  if (value.trim() === '') return false;

  const priority = Number(value);
  return Number.isInteger(priority) && priority >= MIN_PRIORITY && priority <= MAX_PRIORITY;
}
