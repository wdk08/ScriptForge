import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {FONT_COVERAGE} from '../js/unicode-font-data.js';import {needsUnicodeFont,unsupportedCharacters,UNICODE_SCALE} from '../js/unicode-fonts.js';
import {validatePDFCharacters} from '../js/pdf-unicode.js';
test('font coverage is tied to the exact bundled TTF bytes',async()=>{
 for(const [key,name]of [['couriernormal','CourierPrime-Regular'],['courierbold','CourierPrime-Bold'],['unicodenormal','DejaVuSansMono'],['unicodebold','DejaVuSansMono-Bold']])assert.equal(createHash('sha256').update(await readFile(`assets/fonts/${name}.ttf`)).digest('hex'),FONT_COVERAGE[key].sha256);
});
test('ordinary typography stays Courier; Unicode fallback preserves text and the same monospaced advance',()=>{
 assert.equal(needsUnicodeFont('“Café” — José’s…'),false);assert.equal(needsUnicodeFont('Ω ✓ → ♥ cafe\u0301'),true);
 assert.deepEqual(unsupportedCharacters('Straight "curly” apostrophe\' – é Ω Ж ✓ → ♥ cafe\u0301'),[]);assert.equal(UNICODE_SCALE*1233,1228);
});
test('unsupported supplementary characters identify code point and exact screenplay location',()=>{
 assert.throws(()=>validatePDFCharacters({elements:[{id:'sample',type:'dialogue',text:'First line\nAn \u{10ffff} arrives.'}]},{}),/U\+10FFFF.*dialogue element 1.*line 2, column 4/);
 assert.throws(()=>validatePDFCharacters({elements:[]},{author:'Writer \u{10ffff}'}),/title-page author/);
});
