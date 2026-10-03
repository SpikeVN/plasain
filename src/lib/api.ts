export type Dish = {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image: string;
  description: string;
  tags?: string[];
};

export type User = { id: string; username: string; display_name?: string; height_cm?: number | null; biological_sex?: 'female' | 'male' | null; avatar?: string | null };
export type DishDraft = Omit<Dish, 'id'>;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'plasain.session-token';
const USER_KEY = 'plasain.session-user';

function savedToken() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
}

function headers(): Record<string, string> {
  const token = savedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  if (typeof body?.detail === 'string') return body.detail;
  if (Array.isArray(body?.detail)) return body.detail.map((issue: { msg?: string }) => issue.msg || 'Invalid value.').join(' ');
  return 'Something went wrong. Please try again.';
}

export async function fetchDishes(): Promise<Dish[]> {
  const response = await fetch(`${API_URL}/api/dishes`, { headers: headers() });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dishes;
}

export function savedUser(): User | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(USER_KEY);
  try { return value ? JSON.parse(value) as User : null; } catch { return null; }
}

export function signOut() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function endSession() {
  try { await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', headers: headers() }); }
  finally { signOut(); }
}

export async function currentUser(): Promise<User | null> {
  if (!savedToken()) return null;
  let response: Response;
  try { response = await fetch(`${API_URL}/api/auth/me`, { headers: headers() }); }
  catch { signOut(); return null; }
  if (!response.ok) { signOut(); return null; }
  const user = (await response.json() as { user: User }).user;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function authenticate(action: 'login' | 'register', username: string, password: string): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  const session = await response.json() as { token: string; user: User };
  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  return session.user;
}

export async function updateProfile(profile: Pick<User, 'display_name' | 'height_cm' | 'biological_sex' | 'avatar'>): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/me`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(profile) });
  if (!response.ok) throw new Error(await responseError(response));
  const user = (await response.json() as { user: User }).user;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function deleteAccount() {
  const response = await fetch(`${API_URL}/api/auth/me`, { method: 'DELETE', headers: headers() });
  if (!response.ok) throw new Error(await responseError(response));
  signOut();
}

export async function addDish(dish: DishDraft): Promise<Dish> {
  const response = await fetch(`${API_URL}/api/dishes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(dish),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dish;
}

export async function updateDish(id: string, dish: DishDraft): Promise<Dish> {
  const response = await fetch(`${API_URL}/api/dishes/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(dish),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dish;
}

export async function removeDish(id: string) {
  const response = await fetch(`${API_URL}/api/dishes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  if (!response.ok) throw new Error(await responseError(response));
}

export function isDishImage(image: string) {
  return image.startsWith('/') || /^https?:\/\//i.test(image);
}

export function dishImageSource(image: string) {
  return image.startsWith('/') ? `${API_URL}${image}` : image;
}

export async function uploadDishImage(image: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/dishes/image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ image }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json() as { image: string }).image;
}

export async function createPlan(goal: string): Promise<Dish[]> {
  const response = await fetch(`${API_URL}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ goal }) });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json() as { meals: Dish[] }).meals;
}
