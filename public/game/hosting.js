// Only public storage capabilities are exposed; no credentials or connection strings.
export const hostingInfo=fetch('/api/hosting',{cache:'no-store',signal:AbortSignal.timeout(4000)})
  .then(response=>{if(!response.ok)throw new Error('Hosting information unavailable');return response.json();})
  .then(info=>({temporary:info.persistence==='ephemeral'}))
  .catch(()=>({temporary:true}));
export function storageNotice(){return '<p class="hosting-note"><strong>SALAS TEMPORALES · VERSIÓN GRATUITA</strong> Las cuentas, las salas y el chat pueden borrarse cuando el servidor se reinicia o entra en reposo. La campaña individual se guarda en tu navegador.</p>';}
