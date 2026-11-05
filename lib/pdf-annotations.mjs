export const annotationColors=['#9d3c32','#285a46','#214f8e','#302c28'];
export function validateAnnotations(value,pages){
 if(!Array.isArray(value)||value.length>500||JSON.stringify(value).length>600000)throw Error('批注过多，请先导出或删除不需要的批注');
 const unit=n=>Number.isFinite(n)&&n>=0&&n<=1,ids=new Set();
 return value.map(a=>{
  if(!a||typeof a.id!=='string'||!/^[-\w]{16,64}$/.test(a.id)||ids.has(a.id)||!Number.isInteger(a.page)||a.page<1||a.page>pages||!annotationColors.includes(a.color))throw Error('PDF 批注格式不正确');ids.add(a.id);
  if(a.kind==='pen'&&Array.isArray(a.points)&&a.points.length>=1&&a.points.length<=1200&&a.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(unit))&&Number.isFinite(a.width)&&a.width>=.0005&&a.width<=.02)return{id:a.id,kind:a.kind,page:a.page,color:a.color,width:a.width,points:a.points};
  if(a.kind==='text'&&[a.x,a.y,a.width,a.height].every(unit)&&a.width>=.06&&a.height>=.025&&a.x+a.width<=1.001&&a.y+a.height<=1.001&&typeof a.text==='string'&&a.text.length<=5000&&Number.isFinite(a.fontSize)&&a.fontSize>=.01&&a.fontSize<=.05)return{id:a.id,kind:a.kind,page:a.page,color:a.color,x:a.x,y:a.y,width:a.width,height:a.height,text:a.text,fontSize:a.fontSize};
  throw Error('PDF 批注格式不正确');
 });
}
