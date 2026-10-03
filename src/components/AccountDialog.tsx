import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { availableLocales, locale, setLocale, t } from '../lib/i18n';
import Icon from './Icon';
import { authenticate, deleteAccount, endSession, updateProfile, type User } from '../lib/api';

export default function AccountDialog(props: { user: User | null; onUserChange: (user: User | null) => void; onClose: () => void }) {
  const [mode, setMode] = createSignal<'login' | 'register'>('login');
  const [hasSwitchedMode, setHasSwitchedMode] = createSignal(false);
  const [message, setMessage] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [avatarSource, setAvatarSource] = createSignal(untrack(() => props.user?.avatar ?? ''));
  const [avatarChanged, setAvatarChanged] = createSignal(false);
  const [cropSource, setCropSource] = createSignal('');
  const [cropOpen, setCropOpen] = createSignal(false);
  const [displayName, setDisplayName] = createSignal(untrack(() => props.user?.display_name ?? props.user?.username ?? ''));
  const [height, setHeight] = createSignal(untrack(() => props.user?.height_cm?.toString() ?? ''));
  const [biologicalSex, setBiologicalSex] = createSignal<User['biological_sex']>(untrack(() => props.user?.biological_sex ?? null));
  const [saveStatus, setSaveStatus] = createSignal<'idle' | 'saving' | 'saved'>('idle');
  const [deleteConfirm, setDeleteConfirm] = createSignal(false);
  let saveTimer: number | undefined;
  let cropImage: HTMLImageElement | undefined;
  let cropper: Cropper | undefined;
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      const user = await authenticate(mode(), String(form.get('username') || ''), String(form.get('password') || ''));
      props.onUserChange(user); props.onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  };
  const logout = () => { void endSession(); props.onUserChange(null); props.onClose(); };
  const switchMode = (nextMode: 'login' | 'register') => { setHasSwitchedMode(true); setMode(nextMode); };
  const chooseAvatar = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage('Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setCropSource(String(reader.result)); setCropOpen(true); };
    reader.readAsDataURL(file);
  };
  createEffect(cropOpen, (isOpen) => {
    if (!isOpen || !cropImage) return;
    cropper?.destroy();
    cropper = new Cropper(cropImage, { aspectRatio: 1, viewMode: 1, autoCropArea: 1, background: false, responsive: true });
    onCleanup(() => { cropper?.destroy(); cropper = undefined; });
  });
  const saveCrop = () => {
    const canvas = cropper?.getCroppedCanvas({ width: 256, height: 256, imageSmoothingQuality: 'high' });
    if (!canvas) return;
    setAvatarSource(canvas.toDataURL('image/jpeg', .86)); setAvatarChanged(true); setCropOpen(false); scheduleSave();
  };
  const saveProfile = async () => {
    if (!displayName().trim()) return;
    setSaveStatus('saving'); setMessage('');
    try {
      const updated = await updateProfile({ display_name: displayName().trim(), height_cm: height() ? Number(height()) : null, biological_sex: biologicalSex(), avatar: avatarChanged() ? avatarSource() : undefined });
      props.onUserChange(updated); setAvatarSource(updated.avatar ?? '');
      setSaveStatus('saved'); window.setTimeout(() => setSaveStatus('idle'), 1600);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your profile.'); setSaveStatus('idle'); }
  };
  const scheduleSave = () => { if (saveTimer) window.clearTimeout(saveTimer); setSaveStatus('idle'); saveTimer = window.setTimeout(() => void saveProfile(), 550); };
  const removeAccount = async () => {
    setBusy(true); setMessage('');
    try { await deleteAccount(); props.onUserChange(null); props.onClose(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete your account.'); }
    finally { setBusy(false); }
  };
  onCleanup(() => { if (saveTimer) window.clearTimeout(saveTimer); });

  return <div class="account-overlay" role="presentation" onClick={() => props.onClose()}>
    <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(event) => event.stopPropagation()}>
      <button class="account-close" type="button" onClick={() => props.onClose()} aria-label={t('close')}><Icon name="x" size={20} /></button>
      <Show when={message()}><p class="inline-notice account-notice">{message()}</p></Show>
      <Show when={props.user} fallback={<><Show when={mode() === 'login'}><div class={{ 'account-auth-panel': true, 'account-auth-transition': hasSwitchedMode() }}>
        <h2 id="account-title">{t('welcomeBack')}</h2><p>{t('accountIntro')}</p>
        <form class="compact-form" onSubmit={submit}>
          <input name="username" required minlength="3" maxlength="32" autocomplete="username" placeholder={t('username')} />
          <input name="password" required type="password" autocomplete="current-password" placeholder={t('password')} />
          <button class="primary-button account-submit-button" disabled={busy()}><span class="account-submit-content"><span>{busy() ? t('pleaseWait') : t('signIn')}</span><Icon name="arrowRight" class="account-submit-arrow" size={17} /></span></button>
        </form>
        <button class="text-button" onClick={() => switchMode('register')}>{t('newHere')}</button>
      </div></Show><Show when={mode() === 'register'}><div class={{ 'account-auth-panel': true, 'account-auth-transition': hasSwitchedMode() }}>
        <h2 id="account-title">{t('createAccount')}</h2><p>{t('accountIntro')}</p>
        <form class="compact-form" onSubmit={submit}>
          <input name="username" required minlength="3" maxlength="32" autocomplete="username" placeholder={t('username')} />
          <input name="password" required type="password" autocomplete="new-password" placeholder={t('password')} />
          <button class="primary-button account-submit-button" disabled={busy()}><span class="account-submit-content"><span>{busy() ? t('pleaseWait') : t('createAccount')}</span><Icon name="arrowRight" class="account-submit-arrow" size={17} /></span></button>
        </form>
        <button class="text-button" onClick={() => switchMode('login')}>{t('haveAccount')}</button>
      </div></Show></>}>
        {(user) => <><div class="profile-identity"><label class="avatar-upload" aria-label={t('choosePhoto')}><div class="avatar-crop"><Show when={avatarSource()} fallback={<Icon name="userRound" size={36} />}><img src={avatarSource()} alt="Avatar preview" draggable="false" /></Show></div><input type="file" accept="image/*" onChange={chooseAvatar} /></label><div><h2 id="account-title">{displayName() || user().username}</h2><span>@{user().username}</span></div></div><div class="profile-form">
          <label>{t('language')}<select value={locale()} onChange={(event) => setLocale(event.currentTarget.value as 'en' | 'vi')}><For each={availableLocales}>{({ code, language }) => <option value={code}>{language}</option>}</For></select></label><label>{t('username')}<input value={user().username} readonly aria-readonly="true" /></label><label>{t('displayName')}<input required maxlength="60" value={displayName()} onInput={(event) => { setDisplayName(event.currentTarget.value); scheduleSave(); }} /></label><label>{t('height')}<input class="height-input" type="number" min="80" max="260" value={height()} onInput={(event) => { setHeight(event.currentTarget.value); scheduleSave(); }} /></label><fieldset><legend>{t('biologicalSex')}</legend><p>{t('sexHelp')}</p><div class="sex-toggle"><button class={{ active: biologicalSex() === 'female' }} type="button" onClick={() => { setBiologicalSex('female'); scheduleSave(); }}>{t('female')}</button><button class={{ active: biologicalSex() === 'male' }} type="button" onClick={() => { setBiologicalSex('male'); scheduleSave(); }}>{t('male')}</button></div></fieldset><p class="profile-save-status">{saveStatus() === 'saving' ? t('saving') : saveStatus() === 'saved' ? t('saved') : t('autosave')}</p>
        </div><button class="account-signout" onClick={logout}><Icon name="logOut" size={16} /> {t('signOut')}</button><button class="account-delete" onClick={() => setDeleteConfirm(true)}>{t('deleteAccount')}</button><Show when={deleteConfirm()}><div class="delete-confirm"><b>{t('deleteQuestion')}</b><p>{t('deleteCopy')}</p><div><button class="text-button" onClick={() => setDeleteConfirm(false)}>{t('cancel')}</button><button class="delete-confirm-button" disabled={busy()} onClick={() => void removeAccount()}>{busy() ? t('deleting') : t('deleteAccount')}</button></div></div></Show></>}
      </Show>
    </section><Show when={cropOpen()}><div class="crop-overlay" role="presentation" onClick={() => setCropOpen(false)}><section class="crop-dialog" role="dialog" aria-modal="true" aria-label={t('cropPhoto')} onClick={(event) => event.stopPropagation()}><h2>{t('cropPhoto')}</h2><div class="cropper-frame"><img ref={(element) => { cropImage = element; }} src={cropSource()} alt={t('cropPhoto')} /></div><div class="crop-actions"><button class="text-button" onClick={() => setCropOpen(false)}>{t('cancel')}</button><button class="primary-button" onClick={saveCrop}>{t('savePhoto')}</button></div></section></div></Show>
  </div>;
}
