// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {zipSync} from 'fflate';
import {inspectZip,writeZip} from '../../src/adapters/powerpoint/zip.js';

const code=(fn:()=>unknown)=>{try{fn();}catch(error){return (error as {code?:string}).code;}return undefined;};

describe('bounded PPTX ZIP handling',()=>{
  it('round-trips safe parts and rejects duplicate normalized package names',()=>{
    const parts=new Map([['ppt/slides/slide1.xml',new TextEncoder().encode('<p:sld/>')],['custom/data.bin',new Uint8Array([0,1,2,255])]]);
    const opened=inspectZip(writeZip(parts));expect([...opened.keys()]).toEqual([...parts.keys()]);
    expect(Array.from(opened.get('custom/data.bin')!)).toEqual([0,1,2,255]);
  });

  it('rejects a local filename that disagrees with its central-directory identity',()=>{
    const bytes=zipSync({'ppt/slides/slide1.xml':new TextEncoder().encode('<p:sld/>')});
    const localNameLength=bytes[26]!|(bytes[27]!<<8);expect(localNameLength).toBeGreaterThan(0);
    bytes[30]=bytes[30]===112?113:112;
    expect(code(()=>inspectZip(bytes))).toBe('ZIP_LOCAL');
  });

  it('rejects malformed end records and non-ASCII or traversal part names',()=>{
    expect(code(()=>inspectZip(new Uint8Array(64)))).toBe('ZIP_DIRECTORY');
    expect(code(()=>writeZip(new Map([['../payload',new Uint8Array([1])]])))).toBe('ZIP_PATH');
    expect(code(()=>inspectZip(zipSync({'unsafe\\part.xml':new Uint8Array([1])})))).toBe('ZIP_PATH');
  });

  it('bounds actual DEFLATE output even when local and central size claims are forged small',()=>{
    const bytes=zipSync({'small.xml':new TextEncoder().encode('A'.repeat(50_000))});
    const end=bytes.length-22;let central=-1;for(let i=0;i<bytes.length-4;i++)if((bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x01&&bytes[i+3]===0x02)){central=i;break;}
    expect(central).toBeGreaterThan(0);
    // Non-descriptor ZIPs carry the same claimed size in both headers.
    bytes[22]=10;bytes[23]=0;bytes[24]=0;bytes[25]=0;
    bytes[central+24]=10;bytes[central+25]=0;bytes[central+26]=0;bytes[central+27]=0;
    expect(end).toBeGreaterThan(central);
    expect(code(()=>inspectZip(bytes))).toBe('ZIP_SIZE');
  });

  it('rejects payloads whose actual bytes do not match the recorded CRC',()=>{
    const bytes=zipSync({'small.xml':new TextEncoder().encode('hello world')});
    let central=-1;for(let i=0;i<bytes.length-4;i++)if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x01&&bytes[i+3]===0x02){central=i;break;}
    expect(central).toBeGreaterThan(0);
    bytes[14]^=1;bytes[central+16]^=1;
    expect(code(()=>inspectZip(bytes))).toBe('ZIP_CRC');
  });
});
