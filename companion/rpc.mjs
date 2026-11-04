import {EventEmitter} from 'node:events';
import {createInterface} from 'node:readline';

export class CodexRPC extends EventEmitter {
  constructor(child) {
    super(); this.child=child; this.pending=new Map(); this.seq=0; this.closed=false;
    createInterface({input:child.stdout}).on('line', line=>{
      let message; try {message=JSON.parse(line)} catch {return}
      if ('id' in message && !message.method) {
        const call=this.pending.get(message.id); if(!call)return;
        this.pending.delete(message.id); clearTimeout(call.timer);
        if(message.error)call.reject(Error(message.error.message||'Codex 请求失败'));else call.resolve(message.result);
      } else if ('id' in message) {
        // This reading client never approves tool, filesystem, or credential requests.
        if(message.method==='item/commandExecution/requestApproval'||message.method==='item/fileChange/requestApproval')this.send({id:message.id,result:{decision:'decline'}});
        else this.send({id:message.id,error:{code:-32601,message:'Paperleaf supports text-only reading; this operation is disabled'}});
        this.emit('blocked',message);
      } else this.emit('notification',message);
    });
    child.on('error',()=>this.failAll('无法启动 Codex，请重新安装连接程序的依赖'));
    child.on('exit',()=>this.failAll('Codex 进程已退出，请重启连接程序'));
    child.stdin.on('error',()=>this.failAll('Codex 连接已断开'));
    // Do not relay stderr: it may contain provider diagnostics or local paths.
    child.stderr?.on('data',()=>{});
  }
  send(message){if(!this.closed)this.child.stdin.write(JSON.stringify(message)+'\n')}
  request(method,params={},timeout=30000){
    if(this.closed)return Promise.reject(Error('Codex 连接已关闭'));
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex 请求超时，请检查连接程序与网络'));},timeout);
      this.pending.set(id,{resolve,reject,timer}); this.send({id,method,params});
    });
  }
  async initialize(){await this.request('initialize',{clientInfo:{name:'paperleaf_reader',title:'Paperleaf Reader',version:'1.4.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized'});}
  failAll(message){if(this.closed)return;this.closed=true;for(const c of this.pending.values()){clearTimeout(c.timer);c.reject(Error(message))}this.pending.clear();this.emit('closed',message)}
  close(){this.failAll('连接程序已关闭');this.child.kill();}
}
