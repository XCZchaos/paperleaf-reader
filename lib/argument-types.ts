export type ArgumentDimension='thesis'|'concept'|'evidence'|'rebuttal'|'method';
export type ArgumentSource={id:string;page:number;endPage?:number;original:string};
export type ArgumentHighlight={quote:string;kind:ArgumentDimension;occurrence:number;start:number;end:number};
export type ArgumentParagraph=ArgumentSource&{section:string;translation:string;function:string;role:string;critique:string;dimension:ArgumentDimension;highlights:ArgumentHighlight[]};
export type ArgumentFinding={text:string;sources:string[]};
export type ArgumentOverview=Record<'problem'|'thesis'|'evidence'|'rebuttal'|'conclusion'|'claim'|'strongest'|'weakest',ArgumentFinding>;
export type ArgumentInput={phase:'paragraphs';paragraphs:ArgumentSource[];context:string}|{phase:'overview';sources:string[];outline:string};
export type ArgumentBatchResult={paragraphs:ArgumentParagraph[];digest:string;skippedHighlights:number};
export type ArgumentStudy={
 format:'paperleaf-argument-v1';paragraphVersion?:2|3;paperId:string;title:string;authors:string;course:string;mode:'body'|'all';
 sources:ArgumentSource[];excluded:{page:number;reason:string}[];totalPages:number;
 batches:{ids:string[];result:ArgumentBatchResult;model:string;effort:string}[];
 overview:ArgumentOverview|null;overviewModel:string;created:number;updated:number;
};
