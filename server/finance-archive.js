import {crc32} from 'node:zlib';

// Stored ZIP entries keep original receipt bytes; callers stream one file at a time.
export async function financeArchive(entries,write){
  const directory=[];let offset=0;
  for await(const entry of entries){
    const name=Buffer.from(entry.name,'utf8'),data=entry.bytes,crc=crc32(data),header=Buffer.alloc(30),central=Buffer.alloc(46);
    if(name.length>65535||data.length>0xffffffff||offset>0xffffffff)throw Error('FINANCE_ARCHIVE_LIMIT');
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(0x21,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    directory.push(Buffer.concat([central,name]));await write(header);await write(name);await write(data);offset+=header.length+name.length+data.length;
  }
  const start=offset;for(const row of directory){await write(row);offset+=row.length;}
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(directory.length,8);end.writeUInt16LE(directory.length,10);end.writeUInt32LE(offset-start,12);end.writeUInt32LE(start,16);await write(end);
}
