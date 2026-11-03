// Only resource loaders attach this type; programming errors keep their own cause.
export class ResourceLoadError extends Error {
 constructor(resource,cause){super(`No se pudo cargar ${resource}.`,{cause});this.name='ResourceLoadError';this.resource=resource;}
}
export async function loadResource(resource,load){
 try{return await load();}catch(error){throw new ResourceLoadError(resource,error);}
}
export function startupNotice(error){
 const detail=error?.message||'Sin detalle disponible.';
 if(/WebGL|Error creating.*context/i.test(detail))return {title:'EL MAPA 3D NO PUDO INICIAR',message:'Este navegador no pudo activar los gráficos 3D. Prueba abrir el juego directamente en Chrome.',detail};
 if(error instanceof ResourceLoadError)return {title:'FALTÓ CARGAR UN RECURSO',message:`${error.message} Vuelve a intentarlo.`,detail:error.cause?.message||detail};
 return {title:'HUBO UN ERROR AL INICIAR',message:'El juego encontró un error interno. Este aviso no significa que te falte internet.',detail};
}
