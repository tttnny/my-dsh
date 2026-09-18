import { classifyError, fail } from '../../preflight.js'
import { ERROR_KIND } from '../../../../shared/tracker/constants.js'
function getFs(ctx){if(ctx&&ctx.platform&&ctx.platform.fs)return ctx.platform.fs;if(ctx&&ctx.fs)return ctx.fs;if(ctx&&typeof ctx.get==='function'){try{const f=ctx.get('fs');if(f)return f}catch{}}return null}
export async function readTextFile(ctx, fullPath){
  const fs=getFs(ctx);if(!fs)throw Object.assign(new Error('fs unavailable'),{kind:ERROR_KIND.ENV})
  if(typeof fs.resolve!=='function'||typeof fs.readText!=='function')throw Object.assign(new Error('fs.read not supported'),{kind:ERROR_KIND.ENV})
  try{const t=await fs.resolve(fullPath);const txt=await fs.readText(t);return String(txt??'')}catch(e){const kind=classifyError(e);const err=new Error(e&&e.message?e.message:String(e));err.kind=kind;err.cause=e;throw err}
}
export async function readDir(ctx, dirPath){
  // 内核 fs 没有 readdir：目录枚举只走 resolve + listDir；目录不存在按空表回答。
  const fs=getFs(ctx);if(!fs)throw Object.assign(new Error('fs unavailable'),{kind:ERROR_KIND.ENV})
  if(typeof fs.resolve!=='function'||typeof fs.listDir!=='function')throw Object.assign(new Error('fs.listDir not supported'),{kind:ERROR_KIND.ENV})
  try{const t=await fs.resolve(dirPath);const list=await fs.listDir(t);if(Array.isArray(list))return list.map(x=>typeof x==='string'?x:(x&&x.name)||String(x));return[]}catch(e){return[]}
}
export async function exists(ctx, fullPath){
  const fs=getFs(ctx);if(!fs)return false
  // DSH 文件沙箱区分两种形状：lstat 是“路径形”（直接吃字符串路径），stat 是“目标形”（需先 resolve 成 handle）。
  if(typeof fs.lstat==='function'){
    try{ const st=await fs.lstat(fullPath); if(st) return true; }catch{}
  }
  if(typeof fs.resolve==='function'&&typeof fs.stat==='function'){
    try{ const t=await fs.resolve(fullPath); const st=await fs.stat(t); if(st) return true; }catch{}
  }
  // 兜底：readText 是内核提供的能力，读得到即存在。
  try{ await readTextFile(ctx, fullPath); return true }catch{ return false }
}
export async function statFile(ctx, fullPath){
  const fs=getFs(ctx);if(!fs)return null
  if(typeof fs.resolve==='function'&&typeof fs.stat==='function'){try{const t=await fs.resolve(fullPath);return await fs.stat(t)}catch{return null}}
  if(typeof fs.lstat==='function'){try{return await fs.lstat(fullPath)}catch{return null}}
  return null
}
export async function readFile(ctx, path){
  try{const txt=await readTextFile(ctx,path);return txt}catch(e){const kind=e&&e.kind?e.kind:classifyError(e);return fail(kind,e&&e.message?e.message:String(e))}
}
export default readFile
