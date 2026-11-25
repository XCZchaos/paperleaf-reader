import {db} from './server';
import {argumentBatches} from './argument-study.mjs';
import {validateReview} from './argument-segmentation.mjs';
import type {ArgumentSource,BoundaryReview} from './argument-types';

type Plan = {revision:string; closedThrough:number; review:BoundaryReview|null};
const stateId = (owner:string,paper:string,mode:string) => owner+':'+paper+':translation-plan-'+mode;

export async function readTranslationPlan(owner:string,paper:string,mode:string) {
  // Pre-1.5.4 semantic queues were published atomically for the entire paper.
  const row=await db().prepare(`SELECT
    (SELECT value FROM reading_states WHERE id=?) AS plan,
    EXISTS(SELECT 1 FROM translation_paragraphs WHERE owner=? AND paper_id=? AND extraction_mode=?) AS has_rows`)
    .bind(stateId(owner,paper,mode),owner,paper,mode).first();
  const plan:Plan|null=row?.plan?JSON.parse(String(row.plan)):null;
  return {plan,complete:plan?plan.review===null:!!row?.has_rows};
}

export async function closedTranslationPages(owner:string,paper:string,mode:string,total:number) {
  const row=await db().prepare("SELECT json_extract(value,'$.closedThrough') AS through FROM reading_states WHERE id=?")
    .bind(stateId(owner,paper,mode)).first();
  return row?Number(row.through):total;
}

function planRows(confirmed:ArgumentSource[],closedThrough:number) {
  const rows=[];
  const starts=new Set<number>();
  const continuations=new Map<number,number>();
  for(const source of confirmed){
    starts.add(source.page);
    for(let page=source.page+1;page<=(source.endPage||source.page);page++)continuations.set(page,source.page);
    rows.push({id:crypto.randomUUID(),page:source.page,ordinal:Number(source.id.split('-')[1])-1,original:source.original,reason:''});
  }
  for(let page=1;page<=closedThrough;page++){
    if(starts.has(page))continue;
    const from=continuations.get(page);
    rows.push({id:crypto.randomUUID(),page,ordinal:0,original:'',reason:from?'本页续段已并入第 '+from+' 页。':'此页没有可翻译的正文。'});
  }
  return rows;
}

export async function publishTranslationPlan(owner:string,paper:string,mode:string,total:number,proposed:BoundaryReview,allowPartial:boolean) {
  const checked=validateReview(proposed,total,argumentBatches);
  if(!checked.review.batches.length||!allowPartial&&!checked.complete)throw Error('请先完成本批 AI 分段');
  const current=await readTranslationPlan(owner,paper,mode);
  if(current.complete)return {complete:true};
  const previous=current.plan?.review;
  if(previous) {
    const matches=previous.quickStart===checked.review.quickStart &&
      JSON.stringify(previous.layout)===JSON.stringify(checked.review.layout) &&
      JSON.stringify(previous.batches)===JSON.stringify(checked.review.batches.slice(0,previous.batches.length));
    if(!matches||previous.batches.length===checked.review.batches.length){
      if(!allowPartial)throw Error('另一窗口已保存分段进度，请刷新后继续');
      return {complete:false,review:previous};
    }
  }

  const id=stateId(owner,paper,mode),revision=crypto.randomUUID(),now=Date.now();
  const plan:Plan={revision,closedThrough:checked.closedThrough,review:checked.complete?null:checked.review};
  const database=db();
  // One transaction chooses a canonical continuation and appends immutable
  // paragraph rows only for its winning writer. Retrying never requeues a translation.
  await database.batch([
    database.prepare(`INSERT INTO reading_states (id,owner,paper_id,kind,value,updated)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM papers WHERE id=? AND owner=?)
      ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated=excluded.updated
      WHERE json_extract(reading_states.value,'$.revision')=?`)
      .bind(id,owner,paper,'translation-plan-'+mode,JSON.stringify(plan),now,paper,owner,current.plan?.revision||''),
    database.prepare(`INSERT INTO translation_paragraphs (id,owner,paper_id,page,ordinal,original,status,error,updated,extraction_mode)
      SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.page'),json_extract(value,'$.ordinal'),json_extract(value,'$.original'),
        CASE WHEN json_extract(value,'$.original')='' THEN 'skipped' ELSE 'queued' END,json_extract(value,'$.reason'),?,?
      FROM json_each(?) WHERE (SELECT json_extract(value,'$.revision') FROM reading_states WHERE id=?)=?
      ON CONFLICT(owner,paper_id,extraction_mode,page,ordinal) DO NOTHING`)
      .bind(owner,paper,now,mode,JSON.stringify(planRows(checked.confirmed,checked.closedThrough)),id,revision)
  ]);
  const saved=await readTranslationPlan(owner,paper,mode);
  if(saved.complete)return {complete:true};
  if(!saved.plan)throw Error('NOT_FOUND');
  return saved.plan.revision===revision?{complete:false}:{complete:false,review:saved.plan?.review};
}
