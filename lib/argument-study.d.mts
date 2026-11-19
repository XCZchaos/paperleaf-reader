import type {ArgumentStudy,ArgumentSource,ArgumentParagraph} from './argument-types';
import type {PageText} from './ai-types';
import type {runCodexTask} from './codex-client';
export function prepareArgumentSource(pages:PageText[],mode?:'body'|'all'):{sources:ArgumentSource[];excluded:{page:number;reason:string}[]};
export function argumentBatches(sources:ArgumentSource[]):ArgumentSource[][];
export function newArgumentStudy(paper:{id:string;title:string;authors?:string},pages:PageText[],mode?:'body'|'all',course?:string):ArgumentStudy;
export function studyParagraphs(study:ArgumentStudy|null):ArgumentParagraph[];
export function studyComplete(study:ArgumentStudy|null):boolean;
export function validateArgumentStudy(value:unknown,totalPages?:number):ArgumentStudy;
export function generateArgumentStudy(options:{study:ArgumentStudy;runTask:typeof runCodexTask;signal:AbortSignal;onChange:(s:ArgumentStudy)=>void|Promise<void>;onProgress:(job:import('./ai-types').CodexJob|null,label:string)=>void;model?:string;effort?:string}):Promise<ArgumentStudy>;

export function inspectArgumentParagraphs(sources:ArgumentSource[]):{id:string;page:number;original:string;reason:string}[];

export function reviewArgumentStudy(options:Parameters<typeof generateArgumentStudy>[0]):Promise<ArgumentStudy>;
