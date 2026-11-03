import {hostingInfo,storageNotice} from './hosting.js';
const $ = selector => document.querySelector(selector);
hostingInfo.then(info=>{
  if(!info.temporary)return;
  $('#accountIntro').insertAdjacentHTML('afterend',storageNotice());
  $('.account-lead').innerHTML='El mapa cambia.<br>Tu próximo movimiento te espera.';
});
let mode = 'login', busy = false, recovery = '';
const requested = new URL(location.href).searchParams.get('returnTo');
const destination = /^\/game\/(online|index)\.html(?:\?[^\r\n]*)?$/.test(requested || '') ? requested : '/game/online.html';
$('#continueSession').href = destination;
function message(text) { $('#accountStatus').textContent = text; }
function setMode(next) {
  if (busy) return;
  mode = next; message('');
  document.querySelectorAll('#accountTabs button').forEach(button => {
    button.classList.toggle('active',button.dataset.mode===mode);
    button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  });
  $('#recoveryLabel').hidden = mode !== 'recover';
  $('#recoveryCode').required = mode === 'recover';
  $('#passwordHelp').hidden = mode === 'login';
  $('#recoverButton').hidden = mode !== 'login';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#passwordLabel').textContent = mode === 'recover' ? 'NUEVA CONTRASEÑA' : 'CONTRASEÑA';
  $('#submitAccount').textContent = mode === 'register' ? 'CREAR MI CUENTA →' : mode === 'recover' ? 'RECUPERAR MI CUENTA →' : 'ENTRAR A LA SALA DE MANDO →';
  $('#accountHeading').textContent = mode === 'register' ? 'TU BANDERA TE ESPERA.' : mode === 'recover' ? 'RECUPERA EL MANDO.' : 'TU SIGUIENTE MOVIMIENTO.';
  $('#accountIntro').textContent = mode === 'recover' ? 'Usa la clave que guardaste al crear tu cuenta. Se cerrarán las sesiones anteriores y recibirás una clave nueva.' : 'Entra con tu usuario de Dominio para recuperar tus salas desde cualquier dispositivo.';
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
async function api(action, input) {
  const response = await fetch('/api/auth/'+action,{method:input?'POST':'GET',credentials:'same-origin',
    headers:input?{'Content-Type':'application/json'}:{},body:input?JSON.stringify(input):undefined,signal:AbortSignal.timeout(20000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar el acceso.');
  return data;
}
$('#accountForm').addEventListener('submit',async event=>{
  event.preventDefault(); if (busy) return;
  busy=true; $('#submitAccount').disabled=true; message('Comprobando tu acceso…');
  try {
    const data = await api(mode,{username:$('#username').value,password:$('#password').value,recoveryCode:$('#recoveryCode').value});
    $('#password').value=''; $('#recoveryCode').value='';
    if (data.recoveryCode) {
      recovery=data.recoveryCode;
      $('#accountForm').hidden=true; $('#accountTabs').hidden=true; $('#recoveryPanel').hidden=false;
      $('#accountHeading').textContent='GUARDA TU CLAVE.'; $('#accountIntro').textContent='Cuenta lista. Este es tu acceso de respaldo.';
      $('#recoveryOutput').textContent=recovery; message('');
    } else location.assign(destination);
  } catch (error) { message(error.name==='TimeoutError'?'El servidor tardó en responder. Vuelve a intentarlo.':error.message || 'Revisa tu conexión.'); }
  finally { busy=false; $('#submitAccount').disabled=false; }
});
$('#copyRecovery').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(recovery); message('Clave copiada. Guárdala antes de continuar.'); }
  catch { message('Selecciona y copia la clave que aparece arriba.'); }
});
$('#savedRecovery').addEventListener('change',()=>$('#finishRegistration').disabled=!$('#savedRecovery').checked);
$('#finishRegistration').addEventListener('click',()=>{if($('#savedRecovery').checked)location.assign(destination);});
$('#logout').addEventListener('click',async()=>{
  if (busy) return; busy=true; $('#logout').disabled=true;
  try { await api('logout',{}); location.reload(); }
  catch (error) { message(error.message); busy=false; $('#logout').disabled=false; }
});
try {
  const session=await api('session');
  if (session.authenticated) {
    $('#accountForm').hidden=true; $('#accountTabs').hidden=true; $('#sessionPanel').hidden=false;
    $('#accountHeading').textContent='EL MANDO ES TUYO.';
    $('#sessionName').textContent=session.user.username;
    $('#accountIntro').textContent='Tu cuenta está conectada. Retoma una operación o reúne nuevas banderas.';
  }
} catch { message('No pudimos comprobar tu sesión. Puedes intentar entrar de nuevo.'); }
