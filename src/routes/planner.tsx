import { createSignal, For, onSettled, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import Icon from '../components/Icon';
import BrandSticker from '../components/BrandSticker';
import DishManager from '../components/DishManager';
import AccountDialog from '../components/AccountDialog';
import { createPlan, currentUser, dishImageSource, fetchDishes, isDishImage, savedUser, type Dish, type User } from '../lib/api';
import { t } from '../lib/i18n';

function Header(props: { back: () => void }) {
  return <header class="page-header"><button class="back-button" onClick={() => props.back()} aria-label={t('back')}><Icon name="arrowLeft" size={21} /></button><h1>{t('planner')}</h1><Icon name="sparkles" class="header-sparkle" size={19} /></header>;
}

export default function Planner() {
  const navigate = useNavigate();
  const initialUser = savedUser();
  const [dishes, setDishes] = createSignal<Dish[]>([]);
  const [goal, setGoal] = createSignal('Balanced');
  const [plan, setPlan] = createSignal<Dish[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [notice, setNotice] = createSignal('');
  const [user, setUser] = createSignal<User | null>(initialUser);
  const [accountOpen, setAccountOpen] = createSignal(!initialUser);
  const [sessionChecked, setSessionChecked] = createSignal(false);
  const refreshDishes = async () => {
    try { setDishes(await fetchDishes()); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load dishes.'); }
  };
  onSettled(() => { void currentUser().then((verifiedUser) => { setUser(verifiedUser); setSessionChecked(true); if (verifiedUser) void refreshDishes(); else setAccountOpen(true); }); });
  const makePlan = async () => {
    setLoading(true); setNotice('');
    try {
      setPlan(await createPlan(goal()));
    } catch (error) {
      const pool = dishes().filter((dish) => goal() === 'High protein' ? dish.protein >= 24 : goal() === 'Plant-based' ? dish.category === 'Plant-based' : true);
      setPlan(pool.slice(0, 3)); setNotice(error instanceof Error ? error.message : 'Using a sample plan.');
    } finally { setLoading(false); }
  };
  return <main class="phone-shell"><section class="feature-screen planner-screen"><Header back={() => navigate('/')} /><Show when={sessionChecked() && user()} fallback={<div class="planner-auth-gate"><span>✦</span><h2>{sessionChecked() ? t('plannerMembers') : t('checkingAccount')}</h2><p>{sessionChecked() ? t('plannerMembersCopy') : t('checkingCopy')}</p><Show when={sessionChecked()}><button class="primary-button" onClick={() => setAccountOpen(true)}>{t('signInContinue')}</button></Show></div>}>
    <p class="feature-intro">{t('plannerIntro')}</p>
    <div class="goal-panel"><label for="goal">{t('focus')}</label><select id="goal" value={goal()} onChange={(event) => setGoal(event.currentTarget.value)}><option value="Balanced">{t('balanced')}</option><option value="High protein">{t('highProtein')}</option><option value="Plant-based">{t('plantBased')}</option></select><p>{t('focusCopy')}</p></div>
    <div class="planner-stats"><div><b>3</b><span>{t('mealIdeas')}</span></div><div><b>~1,350</b><span>{t('dailyKcal')}</span></div><div><b>{t('balanced')}</b><span>{t('gentleGoal')}</span></div></div>
    <button class="primary-button planner-cta" onClick={makePlan} disabled={loading()}>{loading() ? t('preparingPlan') : <>{t('makePlan')} <Icon name="arrowUpRight" size={17} /></>}</button><Show when={notice()}><p class="inline-notice">{notice()}</p></Show>
    <DishManager onDishesChanged={refreshDishes} />
    <Show when={plan().length}><div class="plan-results"><div class="section-title"><h2>{t('yourDay')}</h2><span>{t('editAnytime')}</span></div><For each={plan()}>{(dish) => <article class="dish-card"><div class="dish-image"><Show when={isDishImage(dish.image)} fallback={dish.image}>{() => <img src={dishImageSource(dish.image)} alt="" draggable="false" />}</Show></div><div class="dish-copy"><span class="eyebrow">{dish.category}</span><h3>{dish.name}</h3><p>{dish.description}</p><div class="dish-macros"><span>{dish.calories} kcal</span><span>P {dish.protein}g</span><span>C {dish.carbs}g</span></div></div></article>}</For></div></Show>
    <Show when={!plan().length}><div class="planner-empty"><span>✿</span><p>{t('plannerEmpty')}</p></div></Show><BrandSticker />
    </Show><Show when={accountOpen()}><AccountDialog user={user()} onUserChange={(nextUser) => { setUser(nextUser); if (nextUser) void refreshDishes(); }} onClose={() => { setAccountOpen(false); if (!user()) navigate('/'); }} /></Show>
  </section></main>;
}
