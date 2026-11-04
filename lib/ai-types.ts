export type PageText={page:number;text:string};
export type Deck={title:string;subtitle:string;slides:{title:string;bullets:string[];speakerNotes:string;pages:number[]}[]};
export type PaperMetadata={title:string;authors:string;year:string;journal:string;doi:string;abstract:string;keywords:string[]};
export type ResearchKind='translate'|'ask'|'summary'|'slides';
export type ResearchResult={id:string;paperId:string;kind:ResearchKind;question:string;text:string;deck:Deck|null;page:number;pages:number[];model:string;created:number};
export type CodexStatus={connected:boolean;account:{email:string|null;plan:string}|null;models:{id:string;name:string;default:boolean}[];rateLimits:{primary?:{usedPercent:number;windowDurationMins:number;resetsAt:number};secondary?:{usedPercent:number;windowDurationMins:number;resetsAt:number}}|null;login?:{done:boolean;success:boolean;error:string}|null;warning?:string;version:string};
export type CodexJob={id:string;kind:ResearchKind|'metadata';metadata?:PaperMetadata|null;status:'preparing'|'running'|'completed'|'error'|'cancelled';text:string;error:string;deck:Deck|null;model:string;pages:number[];created:number};
