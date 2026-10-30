// SPDX-License-Identifier: MIT OR Apache-2.0
import {Inflate, zipSync} from 'fflate';
import {PowerPointError, requirePpt} from './errors.js';

export const ZIP_LIMITS = Object.freeze({
  compressedBytes: 16 * 1024 * 1024,
  expandedBytes: 64 * 1024 * 1024,
  entries: 512,
  partBytes: 16 * 1024 * 1024,
  inflateRatio: 200,
});
const u16=(bytes:Uint8Array,at:number)=>bytes[at]!|(bytes[at+1]!<<8);
const u32=(bytes:Uint8Array,at:number)=>(u16(bytes,at)+(u16(bytes,at+2)!*0x10000))>>>0;
function safePart(path:string):void {
  const directory=path.endsWith('/');
  requirePpt(path.length>0&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes('\0'),'ZIP_PATH','Unsafe package part path');
  requirePpt(!/^[A-Za-z]:/.test(path),'ZIP_PATH','Drive-qualified package part path is forbidden');
  const parts=(directory?path.slice(0,-1):path).split('/');
  requirePpt(parts.every(part=>part!=='.'&&part!=='..'&&part.length>0),'ZIP_PATH','Package part has an empty or traversal segment');
}
export type PartMap=Map<string,Uint8Array>;
const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
function crc32Chunks(chunks:Uint8Array[]):number {let crc=0xffffffff;for(const chunk of chunks)for(const byte of chunk)crc=CRC_TABLE[(crc^byte)&0xff]!^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function inspectZip(bytes:Uint8Array):PartMap {
  requirePpt(bytes instanceof Uint8Array&&bytes.byteLength>=22&&bytes.byteLength<=ZIP_LIMITS.compressedBytes,'ZIP_LIMIT','Compressed package size is outside the admitted bound');
  let eocd=-1;
  const floor=Math.max(0,bytes.length-65_557);
  for(let i=bytes.length-22;i>=floor;i--)if(u32(bytes,i)===0x06054b50){eocd=i;break;}
  requirePpt(eocd>=0&&eocd+22<=bytes.length,'ZIP_DIRECTORY','Missing ZIP end-of-central-directory record');
  requirePpt(u16(bytes,eocd+4)===0&&u16(bytes,eocd+6)===0,'ZIP_MULTIDISK','Multi-disk ZIP is unsupported');
  const diskCount=u16(bytes,eocd+8), count=u16(bytes,eocd+10), directoryBytes=u32(bytes,eocd+12), directoryOffset=u32(bytes,eocd+16), comment=u16(bytes,eocd+20);
  requirePpt(diskCount===count&&count>0&&count<=ZIP_LIMITS.entries,'ZIP_LIMIT','ZIP entry count is outside the admitted bound');
  requirePpt(directoryOffset+directoryBytes<=eocd&&eocd+22+comment===bytes.length,'ZIP_DIRECTORY','Invalid ZIP central directory bounds');
  const declared=new Map<string,{size:number;compressed:number;method:number;local:number;flags:number;nameBytes:Uint8Array;crc:number}>();
  let at=directoryOffset,total=0;
  for(let i=0;i<count;i++){
    requirePpt(at+46<=directoryOffset+directoryBytes&&u32(bytes,at)===0x02014b50,'ZIP_DIRECTORY','Malformed central directory entry');
    const madeBy=u16(bytes,at+4),flags=u16(bytes,at+8),method=u16(bytes,at+10),crc=u32(bytes,at+16),compressed=u32(bytes,at+20),size=u32(bytes,at+24);
    const nameLen=u16(bytes,at+28),extraLen=u16(bytes,at+30),commentLen=u16(bytes,at+32),diskStart=u16(bytes,at+34),external=u32(bytes,at+38),local=u32(bytes,at+42);
    requirePpt(!(flags&1)&&!(flags&0x40),'ZIP_ENCRYPTED','Encrypted ZIP entries are unsupported');
    requirePpt((flags&~(0x08|0x800|0x06))===0,'ZIP_FLAGS','ZIP entry uses unsupported general-purpose flags');
    requirePpt(method===0||method===8,'ZIP_METHOD','Only stored and DEFLATE ZIP entries are supported');
    requirePpt(size!==0xffffffff&&compressed!==0xffffffff&&local!==0xffffffff&&diskStart===0,'ZIP64','ZIP64 and split entries are unsupported');
    requirePpt(at+46+nameLen+extraLen+commentLen<=directoryOffset+directoryBytes,'ZIP_DIRECTORY','Central directory entry exceeds its bounds');
    const nameBytes=bytes.subarray(at+46,at+46+nameLen),centralExtraStart=at+46+nameLen,centralExtraEnd=centralExtraStart+extraLen;
    let centralExtraAt=centralExtraStart;while(centralExtraAt<centralExtraEnd){requirePpt(centralExtraAt+4<=centralExtraEnd,'ZIP_DIRECTORY','Malformed central ZIP extra fields');const kind=u16(bytes,centralExtraAt),length=u16(bytes,centralExtraAt+2);requirePpt(kind!==1,'ZIP64','ZIP64 extra fields are unsupported');centralExtraAt+=4+length;requirePpt(centralExtraAt<=centralExtraEnd,'ZIP_DIRECTORY','Central ZIP extra field exceeds its bound');}requirePpt(centralExtraAt===centralExtraEnd,'ZIP_DIRECTORY','Malformed central ZIP extra field size');
    let name='';for(const b of nameBytes)name+=String.fromCharCode(b);
    requirePpt(nameBytes.every(b=>b<128),'ZIP_PATH','Non-ASCII package paths are unsupported');
    safePart(name);requirePpt(!declared.has(name),'ZIP_DUPLICATE','Duplicate package part '+name);
    // Unix-origin symlinks are forbidden; packages may contain ordinary directories only when empty payloads.
    if((madeBy>>>8)===3){const mode=external>>>16;requirePpt((mode&0o170000)!==0o120000,'ZIP_SYMLINK','Symbolic-link package parts are unsupported');}
    requirePpt(!name.endsWith('/')||size===0,'ZIP_DIRECTORY','Directory entries cannot contain data');
    requirePpt(size<=ZIP_LIMITS.partBytes&&compressed<=ZIP_LIMITS.partBytes,'ZIP_LIMIT','Package part exceeds the per-part size bound');
    requirePpt(compressed===0?size===0:size/compressed<=ZIP_LIMITS.inflateRatio,'ZIP_RATIO','ZIP expansion ratio exceeds the admitted bound');
    total+=size;requirePpt(total<=ZIP_LIMITS.expandedBytes,'ZIP_LIMIT','Expanded package exceeds the aggregate size bound');
    declared.set(name,{size,compressed,method,local,flags,nameBytes:new Uint8Array(nameBytes),crc});at+=46+nameLen+extraLen+commentLen;
  }
  requirePpt(at===directoryOffset+directoryBytes,'ZIP_DIRECTORY','Unexpected trailing data in ZIP central directory');
  // Validate every local header and the compressed-data extents before inflation.
  const extents:{start:number;end:number;name:string}[]=[];
  for(const[name,meta]of declared){
    const at=meta.local;requirePpt(at+30<=directoryOffset&&u32(bytes,at)===0x04034b50,'ZIP_LOCAL','Malformed ZIP local entry header');
    const flags=u16(bytes,at+6),method=u16(bytes,at+8),localCrc=u32(bytes,at+14),localCompressed=u32(bytes,at+18),localSize=u32(bytes,at+22),nameLen=u16(bytes,at+26),extraLen=u16(bytes,at+28);
    requirePpt(flags===meta.flags&&method===meta.method,'ZIP_LOCAL','Local and central ZIP headers disagree');
    const nameStart=at+30,nameEnd=nameStart+nameLen,dataStart=nameEnd+extraLen,dataEnd=dataStart+meta.compressed;
    requirePpt(dataStart<=directoryOffset&&dataEnd<=directoryOffset,'ZIP_LOCAL','Compressed entry data crosses into the central directory');
    const localName=bytes.subarray(nameStart,nameEnd);
    requirePpt(localName.length===meta.nameBytes.length&&localName.every((b,i)=>b===meta.nameBytes[i]),'ZIP_LOCAL','Local and central ZIP entry names disagree');
    if(extraLen){let extraAt=nameEnd;while(extraAt<dataStart){requirePpt(extraAt+4<=dataStart,'ZIP_LOCAL','Malformed local ZIP extra fields');const kind=u16(bytes,extraAt),length=u16(bytes,extraAt+2);requirePpt(kind!==1,'ZIP64','ZIP64 extra fields are unsupported');extraAt+=4+length;requirePpt(extraAt<=dataStart,'ZIP_LOCAL','Local ZIP extra field exceeds its bound');}requirePpt(extraAt===dataStart,'ZIP_LOCAL','Malformed local ZIP extra field size');}
    let entryEnd=dataEnd;
    if(flags&0x08){
      let descriptor=dataEnd;if(u32(bytes,descriptor)===0x08074b50)descriptor+=4;
      requirePpt(descriptor+12<=directoryOffset&&u32(bytes,descriptor)===meta.crc&&u32(bytes,descriptor+4)===meta.compressed&&u32(bytes,descriptor+8)===meta.size,'ZIP_DESCRIPTOR','Data descriptor does not match the central directory');entryEnd=descriptor+12;
    }else requirePpt(localCrc===meta.crc&&localCompressed===meta.compressed&&localSize===meta.size,'ZIP_LOCAL','Local and central ZIP sizes/CRC disagree');
    extents.push({start:at,end:entryEnd,name});
  }
  extents.sort((a,b)=>a.start-b.start);for(let i=1;i<extents.length;i++)requirePpt(extents[i]!.start>=extents[i-1]!.end,'ZIP_OVERLAP','ZIP local entries overlap');
  // Decode each bounded compressed extent incrementally. The claimed uncompressed
  // sizes are admission hints only; output is counted before it is retained.
  const parts:PartMap=new Map();let observed=0;
  for(const[name,meta]of declared){
    const extent=extents.find(value=>value.name===name)!;
    const dataStart=meta.local+30+meta.nameBytes.length+u16(bytes,meta.local+28),dataEnd=dataStart+meta.compressed;
    const chunks:Uint8Array[]=[];let actual=0;
    const accept=(chunk:Uint8Array)=>{actual+=chunk.length;observed+=chunk.length;requirePpt(actual<=meta.size,'ZIP_SIZE','Actual inflated size exceeds the central-directory claim for '+name);requirePpt(actual<=ZIP_LIMITS.partBytes&&observed<=ZIP_LIMITS.expandedBytes,'ZIP_LIMIT','Actual expanded package exceeds its admitted bound');if(chunk.length)chunks.push(new Uint8Array(chunk));};
    try{
      if(meta.method===0){for(let offset=dataStart;offset<dataEnd;offset+=64)accept(bytes.subarray(offset,Math.min(offset+64,dataEnd)));}
      else {const inflater=new Inflate();inflater.ondata=(chunk)=>accept(chunk);for(let offset=dataStart;offset<dataEnd;offset+=64)inflater.push(bytes.subarray(offset,Math.min(offset+64,dataEnd)),Math.min(offset+64,dataEnd)===dataEnd);}
    }catch(error){if(error instanceof PowerPointError)throw error;throw new PowerPointError('ZIP_INFLATE','ZIP payload could not be safely inflated: '+name);}
    requirePpt(actual===meta.size,'ZIP_SIZE','Actual inflated size disagrees with the central directory for '+name);
    requirePpt(crc32Chunks(chunks)===meta.crc,'ZIP_CRC','Inflated CRC disagrees with the central directory for '+name);
    const result=new Uint8Array(actual);let cursor=0;for(const chunk of chunks){result.set(chunk,cursor);cursor+=chunk.length;}parts.set(name,result);
  }
  requirePpt(observed===total,'ZIP_SIZE','Expanded package size disagrees with directory totals');
  return parts;
}
export function writeZip(parts:PartMap):Uint8Array {
  const files:Record<string,Uint8Array>={};for(const[path,data]of parts){safePart(path);files[path]=data;}
  const bytes=zipSync(files,{level:6});requirePpt(bytes.length<=ZIP_LIMITS.compressedBytes,'ZIP_LIMIT','Output package exceeds compressed-size bound');return bytes;
}
export function partText(parts:PartMap,path:string):string {
  const bytes=parts.get(path);requirePpt(bytes,'PACKAGE_PART','Required package part is missing: '+path);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new PowerPointError('PACKAGE_ENCODING','Package part is not valid UTF-8: '+path);}
}
export function putText(parts:PartMap,path:string,text:string):void {parts.set(path,new TextEncoder().encode(text));}
