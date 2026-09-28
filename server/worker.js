import {DurableObject} from 'cloudflare:workers';
import {BattleRoom} from './BattleRoom.js';
import {cleanRoom,PROTOCOL} from '../shared/BattleRules.js';
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({game:'Boom',protocol:PROTOCOL,status:'ready'},{headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
 if(url.pathname.startsWith('/room/')){
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin&&origin!=='https://3wasfnjd.github.io')return new Response('Origin denied',{status:403});
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  return env.BOOM_ROOMS.getByName(cleanRoom(url.pathname.split('/')[2])).fetch(request);
 }
 return env.ASSETS.fetch(request);
}};
export class BoomRoom extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.timer=null;this.savedAt=0;
  ctx.blockConcurrencyWhile(async()=>{this.game=new BattleRoom({saved:await ctx.storage.get('room'),broadcast:m=>this.broadcast(m)});for(const ws of ctx.getWebSockets()){const id=ws.deserializeAttachment()?.id,p=this.game.players.get(id);if(p)p.connected=true;}if(ctx.getWebSockets().length)this.start();});
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 async fetch(){const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({id:null,created:Date.now()});this.start();return new Response(null,{status:101,webSocket:client});}
 broadcast(message){const raw=JSON.stringify(message);for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.id){try{ws.send(raw);}catch{}}}
 start(){if(this.timer)return;this.timer=setInterval(()=>{this.game.tick();for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if((!a.id&&Date.now()-a.created>10000)||(a.id&&!this.game.players.get(a.id)?.connected))try{ws.close(4000,'timeout');}catch{}}
  if(this.game.dirty&&Date.now()-this.savedAt>2000){this.savedAt=Date.now();this.game.dirty=false;this.ctx.storage.put('room',this.game.save()).catch(()=>{this.game.dirty=true;});}},50);}
 async webSocketMessage(ws,raw){if(typeof raw!=='string'||raw.length>4096){ws.close(1009,'message too large');return;}let m;try{m=JSON.parse(raw);}catch{return;}const a=ws.deserializeAttachment();
  if(!a.id&&m.type==='hello'){const welcome=this.game.join(m);if(welcome.type==='full'){ws.send(JSON.stringify(welcome));ws.close(4001,'room full');return;}
   for(const other of this.ctx.getWebSockets())if(other!==ws&&other.deserializeAttachment()?.id===welcome.id){other.serializeAttachment({id:null,created:Date.now()});try{other.close(4002,'session replaced');}catch{}}
   ws.serializeAttachment({id:welcome.id,created:Date.now()});ws.send(JSON.stringify(welcome));this.game.dirty=true;return;
  }if(a.id)this.game.message(a.id,m);
 }
 async webSocketClose(ws){const id=ws.deserializeAttachment()?.id;if(id&&!this.ctx.getWebSockets().some(other=>other!==ws&&other.deserializeAttachment()?.id===id))this.game.leave(id);
  await this.ctx.storage.put('room',this.game.save());if(!this.ctx.getWebSockets().filter(s=>s!==ws).length){clearInterval(this.timer);this.timer=null;await this.ctx.storage.setAlarm(Date.now()+35000);}
 }
 async webSocketError(ws){await this.webSocketClose(ws);}
 async alarm(){this.game.cleanup(Date.now());await this.ctx.storage.put('room',this.game.save());}
}
