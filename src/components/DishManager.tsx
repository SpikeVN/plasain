import { createSignal, Show } from 'solid-js';
import { addDish, authenticate, endSession, savedUser } from '../lib/api';

export default function DishManager(props: { onDishesChanged: () => Promise<void> }) {
  const [user, setUser] = createSignal(savedUser());
  const [mode, setMode] = createSignal<'login' | 'register'>('login');
  const [message, setMessage] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const submitAuth = async (event: SubmitEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      setUser(await authenticate(mode(), String(form.get('username') || ''), String(form.get('password') || '')));
      await props.onDishesChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  const submitDish = async (event: SubmitEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      await addDish({
        name: String(form.get('name') || ''), category: String(form.get('category') || ''),
        calories: Number(form.get('calories')), protein: Number(form.get('protein')),
        carbs: Number(form.get('carbs')), fat: Number(form.get('fat')),
        image: String(form.get('image') || '🍽️'), description: String(form.get('description') || ''),
      });
      (event.currentTarget as HTMLFormElement).reset();
      setMessage('Dish added to your collection.');
      await props.onDishesChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add that dish.'); }
    finally { setBusy(false); }
  };

  return <section class="dish-manager">
    <Show when={user()} fallback={<>
      <div class="section-title"><h2>Your dishes</h2><span>Sign-in required</span></div>
      <p class="account-copy">Sign in to add meals that only you can see and use in plans.</p>
      <form class="compact-form" onSubmit={submitAuth}>
        <input name="username" required minlength="3" maxlength="32" autocomplete="username" placeholder="Username" />
        <input name="password" required type="password" autocomplete={mode() === 'login' ? 'current-password' : 'new-password'} placeholder="Password" />
        <button class="primary-button" disabled={busy()}>{busy() ? 'Please wait…' : mode() === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button class="text-button" onClick={() => setMode(mode() === 'login' ? 'register' : 'login')}>{mode() === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </>}>
      {(activeUser) => <>
        <div class="section-title"><h2>Your dishes</h2><button class="text-button" onClick={() => { void endSession(); setUser(null); void props.onDishesChanged(); }}>Sign out {activeUser().username}</button></div>
        <form class="compact-form dish-form" onSubmit={submitDish}>
          <input name="name" required maxlength="100" placeholder="Dish name" />
          <input name="category" required maxlength="50" placeholder="Category" />
          <div class="macro-inputs"><input name="calories" required type="number" min="0" placeholder="kcal" /><input name="protein" required type="number" min="0" placeholder="Protein g" /><input name="carbs" required type="number" min="0" placeholder="Carbs g" /><input name="fat" required type="number" min="0" placeholder="Fat g" /></div>
          <input name="image" maxlength="16" placeholder="Emoji (optional)" />
          <textarea name="description" maxlength="500" placeholder="A short description (optional)" />
          <button class="primary-button" disabled={busy()}>{busy() ? 'Saving…' : 'Add my dish'}</button>
        </form>
      </>}
    </Show>
    <Show when={message()}><p class="inline-notice">{message()}</p></Show>
  </section>;
}
