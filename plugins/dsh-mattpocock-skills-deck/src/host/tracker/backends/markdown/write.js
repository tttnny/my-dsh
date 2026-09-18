import { classifyError, fail } from '../../preflight.js'
import { ERROR_KIND } from '../../../../shared/tracker/constants.js'
function getFs(ctx){if(ctx&&ctx.platform&&ctx.platform.fs)return ctx.platform.fs;if(ctx&&ctx.fs)return ctx.fs;if(ctx&&typeof ctx.get==='function'){try{const f=ctx.get('fs');if(f)return f}catch{}}return null}
// 内核 fs 服务只提供 resolve / writeText / readText / listDir / stat / lstat：没有 mkdir / rename / unlink / writeFile。
// 目录必须已存在；缺失时本层按 fast-fail 直接抛错，不做能力探测后静默返回。
export async function ensureDir(ctx, dirPath){
  const fs=getFs(ctx);if(!fs||!dirPath)return
  if(typeof fs.resolve!=='function'||typeof fs.stat!=='function')throw Object.assign(new Error('fs.stat not supported'),{kind:ERROR_KIND.ENV})
  let info=null
  try{const t=await fs.resolve(dirPath);info=await fs.stat(t)}catch(e){info=null}
  if(!info){const err=new Error('directory missing: '+dirPath);err.kind=ERROR_KIND.ENV;throw err}
}
export async function writeTextFile(ctx, fullPath, content){
  const fs=getFs(ctx);if(!fs)throw Object.assign(new Error('fs unavailable'),{kind:ERROR_KIND.ENV})
  if(typeof fs.resolve!=='function'||typeof fs.writeText!=='function')throw Object.assign(new Error('fs.write not supported'),{kind:ERROR_KIND.ENV})
  try{const t=await fs.resolve(fullPath);await fs.writeText(t,String(content))}catch(e){const kind=e&&e.kind?e.kind:classifyError(e);const err=new Error(e&&e.message?e.message:String(e));err.kind=kind;throw err}
}
export async function renameFile(ctx, fromPath, toPath){
  // 内核 fs 没有 rename，也没有 unlink：无法在不留源文件的前提下改名，按能力缺口直接报错。
  throw Object.assign(new Error('fs.rename not supported: kernel fs has no rename/unlink'),{kind:ERROR_KIND.ENV})
}
export async function writeFile(ctx, path, content){
  try{await writeTextFile(ctx,path,content);return{ok:true}}catch(e){const kind=e&&e.kind?e.kind:classifyError(e);return fail(kind,e&&e.message?e.message:String(e))}
}
export default writeFile
