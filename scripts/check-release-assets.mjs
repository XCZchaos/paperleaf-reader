import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const [manifest,...files]=process.argv.slice(2);
const {assets}=JSON.parse(await readFile(manifest,'utf8'));
assert.equal(files.length,9,'Expected a Windows installer and four Mac installers with checksums');
assert.deepEqual(assets.map(a=>a.name).sort(),files.map(f=>path.basename(f)).sort(),'Unexpected or missing release assets');
for(const file of files){
  const name=path.basename(file),remote=assets.find(a=>a.name===name);
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  assert.equal(remote.size,(await stat(file)).size,'Size mismatch: '+name);
  assert.equal(remote.digest,'sha256:'+hash.digest('hex'),'SHA-256 mismatch: '+name);
}
console.log('Verified all nine attached artifacts against the exact local build files.');
