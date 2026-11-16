'use strict';

// Separate target: never invokes pack_xhs.sh or removes the existing H5 ZIP.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'wechat');
const modules = ['core', 'ui', 'input', 'platform', 'runtime', 'rewarded-ad', 'campaign', 'progression', 'daily'];
const sourceFiles = ['game.js', 'game.json', 'config.js'].concat(modules.map(name => 'src/' + name + '.js'));
const assets = [
  'ui/cover-bg.webp', 'ui/cover-moon.webp', 'ui/menu.webp',
  'sprites/moon.webp', 'sprites/moon-dark.webp', 'sprites/earth.webp',
  'sprites/well.webp', 'sprites/rock.webp', 'sprites/signal.webp',
  'fonts/GeistMono.woff2', 'fonts/NotoSerifSC-700-sub.woff2',
  'fonts/Limelight.woff2', 'fonts/JosefinSans-300.woff2'
];
const entries = sourceFiles.map(file => ({ source: 'minigame/' + file, target: file }))
  .concat(assets.map(file => ({ source: 'assets/' + file, target: 'assets/' + file })));

// Validate the complete source list before touching an existing generated file.
entries.forEach(entry => {
  if (!fs.statSync(path.join(root, entry.source)).isFile()) throw new Error('Missing source: ' + entry.source);
});
const config = require(path.join(root, 'minigame', 'config.js'));
if (config.debug !== false) throw new Error('Deployable config.debug must be false');
if (config.rewardedAdUnitId && !/^adunit-[a-zA-Z0-9]+$/.test(config.rewardedAdUnitId)) {
  throw new Error('Invalid rewardedAdUnitId; never package a preview ad ID');
}
fs.mkdirSync(output, { recursive: true });
const expected = new Set(entries.map(entry => entry.target));
function listFiles(dir, prefix) {
  let result = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(item => {
    const key = prefix ? prefix + '/' + item.name : item.name;
    if (item.isDirectory()) result = result.concat(listFiles(path.join(dir, item.name), key));
    else result.push(key);
  });
  return result;
}
const unexpected = listFiles(output, '').filter(file => !expected.has(file));
if (unexpected.length) throw new Error('Unexpected files in dist/wechat; inspect before packaging: ' + unexpected.join(', '));
let bytes = 0;
entries.forEach(entry => {
  const source = path.join(root, entry.source), target = path.join(output, entry.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  bytes += fs.statSync(target).size;
});
const hashes = entries.map(entry => ({
  file: entry.target,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(output, entry.target))).digest('hex')
}));
fs.writeFileSync(path.join(root, 'dist', 'wechat-manifest.json'), JSON.stringify({ files: hashes, bytes }, null, 2) + '\n');

// Browser verification bundle: static function wrappers, no eval/new Function.
// It is deliberately outside dist/wechat and cannot be uploaded as game code.
if (process.argv.includes('--preview')) {
  const previewEntries = modules.map(name => 'minigame/src/' + name + '.js').concat('tools/preview_wechat.js');
  const wrappers = previewEntries.map(file => JSON.stringify(file) + ':function(require,module,exports){\n' +
    fs.readFileSync(path.join(root, file), 'utf8') + '\n}');
  const bundle = '(function(){\nconst modules={' + wrappers.join(',\n') + '};\n' +
    'const cache={};function load(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error("Unknown module "+id);' +
    'const m={exports:{}};cache[id]=m;modules[id](function(p){const a=id.split("/");a.pop();p.split("/").forEach(function(s){if(s==="..")a.pop();else if(s!==".")a.push(s)});let key=a.join("/");if(!key.endsWith(".js"))key+=".js";return load(key)},m,m.exports);return m.exports}' +
    'load("tools/preview_wechat.js");\n})();\n';
  fs.writeFileSync(path.join(root, 'dist', 'wechat-preview.js'), bundle);
}
console.log('WeChat candidate: ' + entries.length + ' files, ' + bytes + ' bytes; ad unit ' +
  (config.rewardedAdUnitId ? 'configured (not verified)' : 'not configured; ad offer disabled'));
