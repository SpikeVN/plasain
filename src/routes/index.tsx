import { Title } from '@solidjs/meta';
import { createSignal, onSettled, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import Icon from '../components/Icon';
import AccountDialog from '../components/AccountDialog';
import { currentUser, savedUser, type User } from '../lib/api';
import { t } from '../lib/i18n';
import sticker from '../../assets/sticker.svg';
import crystalArt from '../../assets/figma/crystal-art.png';
import plannerArt from '../../assets/figma/planner-art-207472.png';
import regressorArt from '../../assets/figma/regressor-art.png';

export default function Home() {
  const navigate = useNavigate();
  const hasShownLoading = typeof window !== 'undefined' && window.sessionStorage.getItem('plasain.loading-seen') === 'true';
  const [ready, setReady] = createSignal(hasShownLoading);
  const [notice, setNotice] = createSignal('');
  const [user, setUser] = createSignal<User | null>(savedUser());
  const [accountOpen, setAccountOpen] = createSignal(false);

  if (typeof window !== 'undefined' && !hasShownLoading) {
    window.sessionStorage.setItem('plasain.loading-seen', 'true');
    window.setTimeout(() => setReady(true), 1100);
  }
  onSettled(() => { void currentUser().then(setUser); });
  const openAccount = async () => { setUser(await currentUser()); setAccountOpen(true); };
  const openPlanner = async () => {
    const verifiedUser = await currentUser();
    setUser(verifiedUser);
    if (verifiedUser) navigate('/planner'); else setAccountOpen(true);
  };

  return <main class="phone-shell"><Title>Plasain — mindful meals</Title>
    <Show when={!ready()}><section class="loading-screen" aria-label="Plasain"><h1>Plasain</h1><img class="loading-sticker" src={sticker} alt="Plasain" /><div class="loading-copy"><p>Thằng Bờm có cái quạt mo<br />Tú Ông xin đổi khô gà, mùn cưa</p><span class="loading-credit">Anh Tôi</span></div></section></Show>
    <Show when={ready()}><section class="home-screen"><div class="home-brand"><h1>{t('greeting')}<span>!</span></h1><button class="user-button" onClick={() => void openAccount()} aria-label={t('accountSettings')}><Show when={user()?.avatar} fallback={<Icon name="userRound" size={20} />}>{(avatar) => <img class="user-avatar" src={avatar()} alt="" draggable="false" />}</Show></button></div>
      <div class="menu-list">
        <button class="menu-card crystal-menu" onClick={() => navigate('/crystal')}><div class="menu-text"><h2>Crystal Ball</h2><p>{t('crystalDescription')}</p><Icon name="arrowUpRight" class="card-arrow" size={17} /></div><img class="menu-art crystal-art" src={crystalArt} alt="" draggable="false" /></button>
        <button class="menu-card planner-menu" onClick={() => void openPlanner()}><div class="menu-text"><h2>Planner</h2><p>{t('plannerDescription')}</p><Icon name="arrowUpRight" class="card-arrow" size={17} /></div><img class="menu-art planner-art" src={plannerArt} alt="" draggable="false" /></button>
        <button class="menu-card regressor-menu" onClick={() => setNotice(t('comingSoon'))}><div class="menu-text"><h2>Regressor</h2><p>{t('regressorDescription')}</p><Icon name="arrowUpRight" class="card-arrow" size={17} /></div><img class="menu-art regressor-art" src={regressorArt} alt="" draggable="false" /></button>
      </div>
      <div class="home-hint">{t('homeHint')}</div><img class="brand-sticker" src={sticker} alt="The Plasain Project, group 8 TIN314.1" draggable="false" />
      <Show when={notice()}><p class="toast">{notice()}</p></Show><Show when={accountOpen()}><AccountDialog user={user()} onUserChange={setUser} onClose={() => setAccountOpen(false)} /></Show>
    </section></Show>
  </main>;
}
