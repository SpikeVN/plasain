export type Dish = {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium_mg: number;
  image: string;
  description: string;
  tags?: string[];
};

export type User = {
  id: string;
  username: string;
  display_name?: string;
  height_cm?: number | null;
  biological_sex?: "female" | "male" | null;
  birth_year?: number | null;
  activity_level?: number | null;
  avatar?: string | null;
};
export type DishDraft = Omit<Dish, "id">;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TOKEN_KEY = "plasain.session-token";
const USER_KEY = "plasain.session-user";

function savedToken() {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(TOKEN_KEY);
}

function headers(): Record<string, string> {
  const token = savedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail))
    return body.detail
      .map((issue: { msg?: string }) => issue.msg || "Invalid value.")
      .join(" ");
  return "Something went wrong. Please try again.";
}

export async function fetchDishes(): Promise<Dish[]> {
  const response = await fetch(`${API_URL}/api/dishes`, { headers: headers() });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dishes;
}

export function savedUser(): User | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(USER_KEY);
  try {
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    return null;
  }
}

export function signOut() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function endSession() {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: headers(),
    });
  } finally {
    signOut();
  }
}

export async function currentUser(): Promise<User | null> {
  if (!savedToken()) return null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/me`, { headers: headers() });
  } catch {
    // The API can be temporarily unavailable while it restarts. Keep the
    // persisted session rather than treating a network failure as a logout.
    return savedUser();
  }
  if (response.status === 401 || response.status === 403) {
    signOut();
    return null;
  }
  if (!response.ok) return savedUser();
  try {
    const user = ((await response.json()) as { user: User }).user;
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return savedUser();
  }
}

export async function authenticate(
  action: "login" | "register",
  username: string,
  password: string,
): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  const session = (await response.json()) as { token: string; user: User };
  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  return session.user;
}

export async function updateProfile(
  profile: Pick<
    User,
    | "display_name"
    | "height_cm"
    | "biological_sex"
    | "birth_year"
    | "activity_level"
    | "avatar"
  >,
): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error(await responseError(response));
  const user = ((await response.json()) as { user: User }).user;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function deleteAccount() {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) throw new Error(await responseError(response));
  signOut();
}

export async function addDish(dish: DishDraft): Promise<Dish> {
  const response = await fetch(`${API_URL}/api/dishes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(dish),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dish;
}

export async function updateDish(id: string, dish: DishDraft): Promise<Dish> {
  const response = await fetch(
    `${API_URL}/api/dishes/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify(dish),
    },
  );
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()).dish;
}

export async function removeDish(id: string) {
  const response = await fetch(
    `${API_URL}/api/dishes/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: headers() },
  );
  if (!response.ok) throw new Error(await responseError(response));
}

export function isDishImage(image: string) {
  return image.startsWith("/") || /^https?:\/\//i.test(image);
}

export function dishImageSource(image: string) {
  if (image.startsWith("/dish-assets/")) return image;
  return image.startsWith("/") ? `${API_URL}${image}` : image;
}

export async function uploadDishImage(image: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/dishes/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ image }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return ((await response.json()) as { image: string }).image;
}

export type CheckIn = {
  weight_kg: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  sodium_mg: number;
};
export type RegressorResult = {
  clean_baseline_kg: number;
  current_weight_kg: number;
  tdee: number;
  caloric_deficit: number;
  initial_weekly_rate_kg: number;
  metabolic_floor_kg: number;
  trend_method: string;
  trajectory: {
    day: number;
    projected_weight_kg: number;
    metabolic_floor_kg: number;
  }[];
};

export async function projectWeight(input: {
  height_cm: number;
  age_years: number;
  sex: "female" | "male";
  pal: number;
  target_calories: number;
  check_ins: CheckIn[];
}): Promise<RegressorResult> {
  const response = await fetch(`${API_URL}/api/regressor/project`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as RegressorResult;
}

export type PlanResult = { meals: Dish[]; source: string; reply?: string };
export type SavedPlan = PlanResult & {
  id: number;
  goal: string;
  plan_date: string;
  created_at: string;
};

export async function createPlan(
  goal: string,
  dishes: Dish[] = [],
  prompt = "",
  language: "en" | "vi" = "en",
): Promise<PlanResult> {
  const response = await fetch(`${API_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ goal, dishes, prompt, language }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as PlanResult;
}

export async function streamPlan(
  goal: string,
  dishes: Dish[],
  prompt: string,
  language: "en" | "vi",
  onToken: (text: string) => void,
): Promise<PlanResult> {
  const response = await fetch(`${API_URL}/api/plan/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ goal, dishes, prompt, language }),
  });
  if (!response.ok || !response.body)
    throw new Error(await responseError(response));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let plan: PlanResult | undefined;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const data = event.match(/^data: (.+)$/m)?.[1];
      if (!type || !data) continue;
      const payload = JSON.parse(data) as PlanResult & { text?: string };
      if (type === "token" && payload.text) onToken(payload.text);
      if (type === "plan") plan = payload;
    }
    if (done) break;
  }
  if (!plan)
    throw new Error("The AI response ended before a plan was returned.");
  return plan;
}

export async function savePlan(
  goal: string,
  meals: Dish[],
  planDate: string,
): Promise<PlanResult> {
  const response = await fetch(`${API_URL}/api/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ goal, meals, plan_date: planDate }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as PlanResult;
}

export async function fetchPlans(
  planDate?: string,
  range?: { startDate?: string; endDate?: string },
): Promise<SavedPlan[]> {
  const params = new URLSearchParams();
  if (planDate) params.set("plan_date", planDate);
  if (range?.startDate) params.set("start_date", range.startDate);
  if (range?.endDate) params.set("end_date", range.endDate);
  const query = params.size ? `?${params}` : "";
  const response = await fetch(`${API_URL}/api/plans${query}`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return ((await response.json()) as { plans: SavedPlan[] }).plans;
}
