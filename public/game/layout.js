export const COMPACT_QUERY='(max-width: 900px), (max-height: 540px) and (max-width: 1200px)';
export const compactViewport=(width,height)=>width<=900||(height<=540&&width<=1200);

// Frame the board inside the space actually left by the visible interface.
export function boardFrame({width,height,mode='play',hidden=false,panel=null,top=0,bottom=0}){
 const compact=compactViewport(width,height),landscape=compact&&width>height;
 let left=0,right=width,upper=0,lower=height;
 if(!hidden&&mode!=='menu'){
  if(compact){
   upper=Math.max(top,mode==='play'&&!landscape?112:64);lower=Math.min(bottom||height-(landscape?84:150),height);
   if(panel?.width>0&&panel?.height>0){if(landscape)left=Math.min(width*.55,panel.right+12);else lower=Math.min(lower,panel.top-12);}
  }else{left=width>1000?330:280;right=width-(width>1100&&mode==='play'?245:0);}
 }else if(!hidden&&mode==='menu'&&!compact){left=width>1000?290:280;}
 if(lower-upper<80){upper=Math.max(0,Math.min(upper,height-80));lower=Math.min(height,upper+80);}
 return {cx:(left+right)/2,cy:(upper+lower)/2,width:right-left,height:lower-upper,compact,landscape};
}

export class InterfaceState{
 constructor(){this.hidden=false;this.panelOpen=false;this.panelBeforeHide=false;}
 showPanel(){if(!this.hidden)this.panelOpen=true;}
 closePanel(){this.panelOpen=false;}
 toggleMap(){if(this.hidden){this.hidden=false;this.panelOpen=this.panelBeforeHide;}else{this.panelBeforeHide=this.panelOpen;this.panelOpen=false;this.hidden=true;}return this.hidden;}
 reset(){this.hidden=false;this.panelOpen=false;this.panelBeforeHide=false;}
}
