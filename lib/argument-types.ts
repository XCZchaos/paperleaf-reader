export type ArgumentDimension='thesis'|'concept'|'evidence'|'rebuttal'|'method';
export type ArgumentSource={id:string;page:number;endPage?:number;pageBreaks?:{page:number;offset:number}[];original:string};
export type ArgumentHighlight={quote:string;kind:ArgumentDimension;occurrence:number;start:number;end:number};
export type ArgumentParagraph=ArgumentSource&{section:string;translation:string;function:string;role:string;critique:string;dimension:ArgumentDimension;highlights:ArgumentHighlight[]};
export type ArgumentFinding={text:string;sources:string[]};
export type ArgumentOverview=Record<'problem'|'thesis'|'evidence'|'rebuttal'|'conclusion'|'claim'|'strongest'|'weakest',ArgumentFinding>;
export type BoundaryDecision={id:string;before:'keep'|'join'|'uncertain';splits:string[];reason:string};
export type BoundaryResult={decisions:BoundaryDecision[]};
export type BoundaryReview={quickStart?:boolean;layout:ArgumentSource[];batches:(BoundaryResult&{model:string})[]};
export type ArgumentInput={phase:'segmentation';paragraphs:ArgumentSource[];previous:{page:number;text:string}|null;next:{page:number;text:string}|null}|{phase:'paragraphs';paragraphs:ArgumentSource[];context:string}|{phase:'overview';sources:string[];outline:string};
export type ArgumentBatchResult={paragraphs:ArgumentParagraph[];digest:string;skippedHighlights:number};
export type ArgumentStudy={
 format:'paperleaf-argument-v1';paragraphVersion?:2|3|4;review?:BoundaryReview;paperId:string;title:string;authors:string;course:string;mode:'body'|'all';
 sources:ArgumentSource[];excluded:{page:number;reason:string}[];totalPages:number;
 batches:{ids:string[];result:ArgumentBatchResult;model:string;effort:string}[];
 overview:ArgumentOverview|null;overviewModel:string;created:number;updated:number;
};
