// Egyptian Basra / Sab'a el Komi. Rules documented in docs/EGYPTIAN-CARDS.md.
import { shuffle } from './lib/util.js';
import { cardTxt, rankOf, sweep, suggestedCapture, validCapture } from '../shared/cards.js';
export const BOAT_MAX = 4; // compatibility with the existing card-room protocol
const deck = (rng) => shuffle(rng, ['S','H','D','C'].flatMap(s=>Array.from({length:13},(_,i)=>cardTxt({r:i+1,s}))));
const teamOf = (b, id) => b.order.indexOf(id) % 2;
function deal(b) {
  const d = [...b.deck];
  const hands = Object.fromEntries(b.order.map(id=>[id, d.splice(0,4)]));
  return { ...b, deck:d, hands };
}
function hand(b, rng) {
  const d = deck(rng), floor = [];
  while (floor.length < 4) {
    const c = d.shift();
    if (sweep(c)) d.push(c); else floor.push(c);
  }
  const first = (b.dealer + 1) % b.order.length;
  return deal({ ...b, deck:d, floor, captured:[[],[]], basras:[0,0], turn:first,
    stage:'rules', ready:[], lastCapture:null, lastPlay:null, result:null, move:b.move+1 });
}
export function createBoat(players, rng) {
  if (![2,4].includes(players.length)) throw new Error('Basra needs 2 or 4 players');
  const order = players.map(p=>p.id);
  return hand({ kind:'basra', order, dealer:order.length-1, hand:1, totals:[0,0], carry:0,
    points:Object.fromEntries(order.map(id=>[id,0])), move:0, winners:[] }, rng);
}
function finish(b) {
  const captured = b.captured.map(a=>[...a]);
  // A capture is guaranteed by the four jacks; keep a defensive fallback.
  captured[teamOf(b,b.lastCapture ?? b.order[b.dealer])].push(...b.floor);
  const counts = captured.map(a=>a.length);
  const majority = counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
  const bonus = majority === null ? 0 : 30 + b.carry;
  const specials = captured.map(a=>a.reduce((sum,c)=>sum + (rankOf(c) === 1 || rankOf(c) === 11 ? 1 : c === '2♣' ? 2 : c === '10♦' ? 3 : 0),0));
  const earned = specials.map((s,i)=>s+b.basras[i]*10+(majority===i?bonus:0));
  const totals = b.totals.map((s,i)=>s+earned[i]);
  const winner = Math.max(...totals)>=101 && totals[0]!==totals[1] ? (totals[0]>totals[1]?0:1) : null;
  return { ...b, floor:[], captured, totals, carry:majority===null?b.carry+30:0,
    points:Object.fromEntries(b.order.map(id=>[id,totals[teamOf(b,id)]])),
    stage:winner===null?'handOver':'over', winners:winner===null?[]:b.order.filter(id=>teamOf(b,id)===winner),
    result:{counts,specials,basras:b.basras,earned,majority,bonus,totals}, ready:[] };
}
export function boatAct(b, pid, act, ctx) {
  if (!act || !b.order.includes(pid) && !ctx.isHost(pid)) return b;
  if (act.type==='ready' && b.stage==='rules' && b.order.includes(pid) && !b.ready.includes(pid)) return {...b,ready:[...b.ready,pid]};
  if (act.type==='next' && b.stage==='handOver' && ctx.isHost(pid)) return hand({...b,hand:b.hand+1,dealer:(b.dealer+1)%b.order.length},ctx.rng);
  if (act.type!=='play' || b.stage!=='play' || b.order[b.turn]!==pid || act.move!==b.move) return b;
  const card=act.card;
  if (!b.hands[pid]?.includes(card)) return b;
  const auto=suggestedCapture(card,b.floor);
  const selected=act.take===undefined?auto:act.take;
  if (!Array.isArray(selected) || selected.length>52 || new Set(selected).size!==selected.length || selected.some(c=>!b.floor.includes(c))) return b;
  if (sweep(card) && selected.length!==b.floor.length || !validCapture(card,selected) || !selected.length && auto.length) return b;
  const floor=b.floor.filter(c=>!selected.includes(c));
  let basra=selected.length>0 && floor.length===0 && rankOf(card)!==11;
  if (card==='7♦') basra=basra && selected.every(c=>rankOf(c)<=10) && selected.reduce((s,c)=>s+rankOf(c),0)<=10;
  const team=teamOf(b,pid), captured=b.captured.map(a=>[...a]), basras=[...b.basras];
  if (selected.length) { captured[team].push(card,...selected); if(basra) basras[team]++; }
  else floor.push(card);
  let n={...b, floor,captured,basras, hands:{...b.hands,[pid]:b.hands[pid].filter(c=>c!==card)},
    turn:(b.turn+1)%b.order.length, move:b.move+1, lastCapture:selected.length?pid:b.lastCapture,
    lastPlay:{pid,card,take:selected,basra}};
  if (b.order.every(id=>!n.hands[id].length)) n=n.deck.length?deal(n):finish(n);
  return n;
}
export function boatTick(b, ctx) {
  if(b.stage==='rules' && b.order.every(id=>b.ready.includes(id))) return {...b,stage:'play'};
  return b;
}
export function boatView(b, pid) {
  return {kind:b.kind,stage:b.stage,order:b.order,teams:b.order.map((id,i)=>({id,team:i%2})),hand:b.hand,
    dealer:b.order[b.dealer],turn:b.order[b.turn],move:b.move,ready:b.ready,floor:b.floor,
    // Never broadcast another player's cards or the undealt deck, even to the host/display.
    myHand:b.hands[pid]??[],handCounts:Object.fromEntries(b.order.map(id=>[id,b.hands[id].length])),
    captured:b.captured.map(a=>a.length),basras:b.basras,totals:b.totals,points:b.points,carry:b.carry,
    deckLeft:b.deck.length,lastPlay:b.lastPlay,result:b.result,winners:b.winners};
}
export function boatAwards(b,players) {
  const best=Math.max(...b.totals);
  return b.order.filter(id=>players.some(p=>p.id===id) && b.totals[teamOf(b,id)]===best).map(id=>({
    key:'champion-'+id,title:b.totals[0]===b.totals[1]?'تعادل البصرة':'بطل البصرة',icon:'🏆',pid:id,value:`${best} نقطة`}));
}
