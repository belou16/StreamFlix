/**
 * Couche d'accès aux données.
 * Tous les appels réseau du site passent par ce module.
 */

// Seul point de configuration : changer cette URL suffit pour basculer vers l'API de production.
const API_BASE_URL = 'https://api.tvmaze.com';

// Service de recette pour l'envoi de la sélection, en attendant la route de l'API de production.
const SELECTION_URL = 'https://jsonplaceholder.typicode.com/posts';

/**
 * Erreur levée par la couche réseau.
 * `status` vaut null pour une erreur réseau, sinon le code HTTP reçu.
 */
export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Exécute une requête en distinguant les trois issues possibles :
 * erreur réseau, réponse HTTP en erreur (4xx / 5xx) et succès.
 */
async function request(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('Le serveur est injoignable. Vérifiez votre connexion puis réessayez.');
  }

  // fetch ne rejette pas sa promesse sur un code 4xx / 5xx : il faut tester response.ok.
  if (!response.ok) {
    throw new ApiError(`Le serveur a répondu par une erreur (code ${response.status}).`, response.status);
  }

  return response.json();
}

export async function getShows(page = 0) {
  return request(`${API_BASE_URL}/shows?page=${page}`);
}

export async function getShowById(id) {
  return request(`${API_BASE_URL}/shows/${id}`);
}

export async function searchShows(text) {
  const query = encodeURIComponent(text);
  const results = await request(`${API_BASE_URL}/search/shows?q=${query}`);

  // L'API renvoie des objets { score, show } : seule la série nous intéresse.
  return results.map((result) => result.show);
}

export async function sendSelection(payload) {
  return request(SELECTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });
}
