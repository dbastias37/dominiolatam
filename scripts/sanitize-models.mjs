// Remove editor-only metadata from GLB exports without changing their binary buffers,
// node names, transformations, meshes, materials, animations or attribution.
import {readdir,readFile,writeFile} from 'node:fs/promises';
const directory=new URL('../public/game/assets/vehicles/',import.meta.url);
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key!=='extras').map(([key,item])=>[key,clean(item)]));
  return value;
}
let changed=0;
for(const name of await readdir(directory)) {
  if(!name.endsWith('.glb'))continue;
  const path=new URL(name,directory),original=await readFile(path);
  if(original.toString('ascii',0,4)!=='glTF'||original.readUInt32LE(4)!==2||original.readUInt32LE(8)!==original.length)
    throw new Error('Invalid GLB: '+name);
  const chunks=[];
  for(let offset=12;offset<original.length;) {
    const length=original.readUInt32LE(offset),type=original.readUInt32LE(offset+4);
    let data=original.subarray(offset+8,offset+8+length);
    if(data.length!==length)throw new Error('Invalid chunk: '+name);
    if(type===0x4e4f534a) {
      const model=clean(JSON.parse(data.toString()));
      delete model.asset.generator;
      data=Buffer.from(JSON.stringify(model));
      data=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,0x20)]);
      // No local export paths may remain in metadata fields or resource URIs.
      if(/(?:\/home\/|\/Users\/|[A-Z]:\\\\|file:\/\/)/i.test(data.toString()))
        throw new Error('A local export path remains in '+name);
    }
    const header=Buffer.alloc(8);header.writeUInt32LE(data.length);header.writeUInt32LE(type,4);
    chunks.push(header,data);offset+=8+length;
  }
  const header=Buffer.from(original.subarray(0,12));
  header.writeUInt32LE(12+chunks.reduce((n,c)=>n+c.length,0),8);
  const result=Buffer.concat([header,...chunks]);
  if(!result.equals(original)){await writeFile(path,result);changed++;}
}
console.log('Models sanitized: '+changed);
