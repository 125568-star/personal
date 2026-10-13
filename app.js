/* Personal website — deliberately independent from Provider's data and UI.
   Auth is shared through the existing Supabase project, but this site's
   browser session uses its own storage key and only calls personal-session. */
'use strict';

const PERSONAL_SUPABASE_URL='https://fudujpxplvlrcwtdcaas.supabase.co';
const PERSONAL_PUBLISHABLE_KEY='sb_publishable_cDLWnKhbvN-hPrwhbgBXcQ_dTgQApP0';
const app=document.getElementById('app');
const toastElement=document.getElementById('toast');
let authMode='signin';
let recovering=/(?:^|[&#])type=recovery(?:&|$)/.test(location.hash);
let bootSequence=0;
let toastTimer;

const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

const logo='<svg class="logo" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">'+
  '<circle cx="22" cy="22" r="19" fill="none" stroke="#c8236f" stroke-width="3" stroke-dasharray="5 4"/>'+
  '<circle cx="22" cy="22" r="11" fill="#1f56b8"/></svg>';
const brand=big=>'<div class="brand'+(big?' big':'')+'">'+logo+
  '<div><h1>Personal</h1><p class="tag">Private workspace</p></div></div>';

function themePref(){
  try{return localStorage.getItem('gsc_personal_theme')||'auto';}
  catch(_){return 'auto';}
}
function applyTheme(){
  const p=themePref();
  const dark=p==='dark'||(p==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
}
function syncThemeFooter(){
  document.querySelectorAll('[data-theme-choice]').forEach(button=>
    button.setAttribute('aria-pressed',String(button.dataset.themeChoice===themePref()))
  );
}
function setTheme(choice){
  if(!['dark','light','auto'].includes(choice))return;
  try{localStorage.setItem('gsc_personal_theme',choice)}catch(_){}
  applyTheme();
  syncThemeFooter();
}
function toast(message,isError=false){
  if(!toastElement)return;
  toastElement.textContent=message;
  toastElement.className='show'+(isError?' err':'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toastElement.className='';},4500);
}
function authWrapper(content){
  app.innerHTML='<div class="authwrap"><section class="card auth">'+brand(true)+content+'</section></div>';
}
function renderAuth(message=''){
  const title=authMode==='signin'?'Sign in':'Reset password';
  const passwordField=authMode==='signin'
    ? '<label>Password<input name="pw" type="password" autocomplete="current-password" minlength="8" required></label>'
    : '';
  authWrapper('<h2>'+title+'</h2>'+
    '<form id="auth-form">'+
      '<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>'+
      passwordField+
      '<div class="msg" id="auth-message" role="status">'+escapeHTML(message)+'</div>'+
      '<button class="primary" type="submit" id="auth-submit">'+
        (authMode==='signin'?'Sign in':'Email reset link')+'</button>'+
    '</form>'+
    '<div class="links">'+
      (authMode==='signin'
        ? '<button class="link" type="button" data-auth-mode="forgot">Forgot password?</button>'
        : '<button class="link" type="button" data-auth-mode="signin">Back to sign in</button>')+
    '</div>');
}
function renderRecovery(){
  authWrapper('<h2>Choose a new password</h2>'+
    '<form id="recovery-form">'+
      '<label>New password<input name="pw" type="password" autocomplete="new-password" minlength="8" required></label>'+
      '<div class="msg" id="recovery-message" role="status"></div>'+
      '<button class="primary" type="submit" id="recovery-submit">Save password</button>'+
    '</form>');
}
function renderError(message){
  authWrapper('<h2>Access unavailable</h2>'+
    '<div class="errbox" role="alert">'+escapeHTML(message)+'</div>'+
    '<div class="links">'+
      '<button class="ghost" data-retry type="button">Try again</button>'+
      '<button class="ghost" data-signout type="button">Sign out</button>'+
    '</div>');
}
function renderDashboard(member){
  app.innerHTML=
    '<header class="top">'+brand(false)+
      '<div class="who"><div class="me"><strong>'+
        escapeHTML(member.display_name||'Personal')+'</strong><small>'+
        escapeHTML(member.access_level==='owner'?'Owner':'Member')+
      '</small></div>'+
      '<button class="ghost sm" type="button" data-signout>Sign out</button></div>'+
    '</header>'+
    '<nav class="tabs" aria-label="Sections">'+
      '<a href="./dashboard.html" aria-current="page">Dashboard</a>'+
    '</nav>'+
    '<main><h2>Dashboard</h2><div class="dashboard-blank" aria-label="Empty dashboard"></div></main>';
}

const sb=window.supabase?.createClient(PERSONAL_SUPABASE_URL,PERSONAL_PUBLISHABLE_KEY,{
  auth:{
    storageKey:'gsc-personal-auth-v1',
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
  }
});
if(!sb) renderError('The sign-in service could not be loaded.');

async function boot(session,sequence){
  if(sequence!==bootSequence)return;
  if(!session?.user){
    if(recovering){
      authMode='forgot';
      recovering=false;
      renderAuth('This password reset link has expired or could not be opened. Request a new one.');
    }else{
      renderAuth();
    }
    return;
  }
  if(recovering){renderRecovery();return;}
  app.innerHTML='<p class="loading">Opening Personal Dashboard…</p>';
  const {data,error}=await sb.functions.invoke('personal-session',{body:{}});
  if(sequence!==bootSequence)return;
  if(error){
    let message='Unable to verify Personal access. Please try again.';
    if(error.context?.status===401)message='Your session has expired. Sign in again.';
    if(error.context?.status===403)message='This account is not authorized for the Personal website.';
    renderError(message);
    return;
  }
  if(!data?.allowed){
    renderError(data?.error||'This account is not authorized for the Personal website.');
    return;
  }
  renderDashboard(data);
}

document.addEventListener('click',async event=>{
  const theme=event.target.closest('[data-theme-choice]');
  if(theme){setTheme(theme.dataset.themeChoice);return;}
  const mode=event.target.closest('[data-auth-mode]');
  if(mode){
    authMode=mode.dataset.authMode==='forgot'?'forgot':'signin';
    renderAuth();
    return;
  }
  if(event.target.closest('[data-signout]')){
    if(!sb)return;
    const {error}=await sb.auth.signOut({scope:'local'});
    if(error){toast(error.message,true);return;}
    recovering=false;
    authMode='signin';
    renderAuth();
    return;
  }
  if(event.target.closest('[data-retry]')){
    if(!sb)return;
    const {data}=await sb.auth.getSession();
    const sequence=++bootSequence;
    await boot(data?.session,sequence);
  }
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='auth-form'){
    event.preventDefault();
    if(!sb)return;
    const form=event.target;
    const email=String(new FormData(form).get('email')||'').trim();
    const message=document.getElementById('auth-message');
    const button=document.getElementById('auth-submit');
    button.disabled=true;
    message.textContent='';
    if(authMode==='signin'){
      const password=String(new FormData(form).get('pw')||'');
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error){message.textContent=error.message;button.disabled=false;}
      // Successful login is handled by Supabase's SIGNED_IN event.
    }else{
      const {error}=await sb.auth.resetPasswordForEmail(email,{
        redirectTo:location.origin+location.pathname
      });
      if(error){message.textContent=error.message;}
      else{
        message.style.color='var(--muted)';
        message.textContent='If that address has an account, a password-reset email will arrive shortly.';
      }
      button.disabled=false;
    }
  }else if(event.target.id==='recovery-form'){
    event.preventDefault();
    if(!sb)return;
    const button=document.getElementById('recovery-submit');
    const message=document.getElementById('recovery-message');
    button.disabled=true;
    const {error}=await sb.auth.updateUser({
      password:String(new FormData(event.target).get('pw')||'')
    });
    if(error){message.textContent=error.message;button.disabled=false;return;}
    recovering=false;
    history.replaceState(null,'',location.pathname);
    toast('Password saved.');
    const {data}=await sb.auth.getSession();
    const sequence=++bootSequence;
    await boot(data?.session,sequence);
  }
});
if(sb){
  applyTheme();
  syncThemeFooter();
  try{
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
      if(themePref()==='auto')applyTheme();
    });
  }catch(_){}
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY')recovering=true;
    if(event==='SIGNED_OUT')recovering=false;
    if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
      // Do not call Supabase APIs synchronously inside the auth callback.
      const sequence=++bootSequence;
      setTimeout(()=>boot(session,sequence),0);
    }
  });
}
