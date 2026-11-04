import fs from 'node:fs/promises';import ts from 'typescript';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const file=new URL('../app/.markdown-qa.mjs',import.meta.url);
await fs.writeFile(file,ts.transpileModule(await fs.readFile(new URL('../app/markdown.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
try{
 const {default:Markdown,readableMarkdown}=await import(file.href);
 const render=text=>renderToStaticMarkup(React.createElement(Markdown,{text,pages:[1],onPage:()=>{}}));
 const rendered=render('### 核心结论\n\n**重点说明。 **\n\n1. 方法一\n2. 方法二\n\n| 指标 | 结果 |\n| --- | --- |\n| 准确率 | 90% |\n\n\\(x^2\\) [p.1] [p.99]');
 assert(rendered.includes('<h3>核心结论</h3>'));assert(rendered.includes('<strong>重点说明。</strong>'));assert(rendered.includes('<ol>'));assert(rendered.includes('<table>'));assert(rendered.includes('class="katex"'));assert(rendered.includes('跳转至第 1 页'));assert(!rendered.includes('跳转至第 99 页'));
 const fenced='```md\n** raw ** [p.1] \\(x\\)\n```';assert.equal(readableMarkdown(fenced),fenced);assert(!render(fenced).includes('citation-pill'));
 const hostile=render('<script>alert(1)</script>\n\n<a href="javascript:alert(1)">bad</a>\n\n[bad](javascript:alert%281%29) ![tracking](https://evil.invalid/pixel) [source](https://example.org)');
 assert(!hostile.includes('<script'));assert(!hostile.includes('javascript:'));assert(!hostile.includes('<img'));assert(hostile.includes('noopener noreferrer'));
 for(const text of ['**partial','| a | b |\n| --','$$\\frac{x','[p.','```js\nconst x='])assert.doesNotThrow(()=>render(text));
 console.log('PASS: formatted headings/bold/list/table/math, valid page links, code preservation, incomplete streams, HTML/script/URL/image isolation.');
}finally{await fs.rm(file,{force:true})}
