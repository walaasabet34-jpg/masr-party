import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, boatAct, boatTick, boatView } from '../egyptian.js';
import { suggestedCapture, validCapture, cardName } from '../../shared/cards.js';
import { Room } from '../room.js';
const players=['a','b','c','d'].map(id=>({id}));
const ctx={rng:Math.random,connected:()=>true,isHost:id=>id==='a'};
function ready(b){for(const id of b.order)b=boatAct(b,id,{type:'ready'},ctx);return boatTick(b,ctx);}
function play(b,card,take){return boatAct(b,b.order[b.turn],{type:'play',card,take,move:b.move},ctx);}
function fixture(floor,card){let b=ready(createBoat(players.slice(0,2),ctx.rng));return {...b,floor,hands:{a:[card,'K♠'],b:['2♣']},turn:0};}
test('captures: sums, multiple groups, face cards, and invalid groups',()=>{
 assert.deepEqual(suggestedCapture('10♥',['10♣','4♠','6♠','3♠']),['10♣','4♠','6♠']);
 assert.ok(validCapture('9♥',['9♣','4♠','5♠','3♣','6♣']));
 assert.ok(!validCapture('9♥',['4♠','6♠']));
 assert.ok(!validCapture('9♥',['Q♠','6♠']));
 assert.deepEqual(suggestedCapture('Q♥',['Q♠','K♠','Q♣']),['Q♠','Q♣']);
 assert.equal(cardName('7♦'),'٧ ديناري');
 assert.equal(cardName('J♠'),'ولد بستوني');
});
test('ordinary basra, jack sweep, Komi special cases and empty floor',()=>{
 for(const [floor,c,bonus] of [[['3♠','6♣'],'9♥',1],[['3♠','6♣'],'J♥',0],[['4♣','6♠'],'7♦',1],[['5♣','6♠'],'7♦',0],[['Q♣'],'7♦',0],[[],'7♦',0],[['J♣'],'J♥',0]]){
  const b=play(fixture(floor,c),c);assert.equal(b.basras[0],bonus);
  assert.equal(b.lastPlay.take.length,floor.length);assert.equal(b.floor.length,floor.length?0:1);
 }
});
test('forged actions, replay, wrong turn, illegal sums and skipped capture are ignored',()=>{
 let b=fixture(['4♠','5♠'],'9♥');
 const action={type:'play',card:'9♥',move:b.move};
 assert.equal(boatAct(b,'b',action,ctx),b);
 assert.equal(boatAct(b,'a',{...action,card:'A♦'},ctx),b);
 for(const take of [[],['4♠'],['4♠','4♠'],['K♦'],null])assert.equal(boatAct(b,'a',{...action,take},ctx),b);
 const n=boatAct(b,'a',action,ctx);assert.notEqual(n,b);assert.equal(boatAct(n,'a',action,ctx),n);
});
test('private views hide every opponent hand and deck, including display and host',()=>{
 const b=createBoat(players,Math.random);
 for(const id of ['a','b',null,'outsider']){
  const v=boatView(b,id);assert.equal(v.myHand.length,id==='a'||id==='b'?4:0);
  assert.equal(v.hands,undefined);assert.equal(v.deck,undefined);assert.deepEqual(Object.values(v.handCounts),[4,4,4,4]);
 }
 assert.ok(!b.floor.some(c=>c==='7♦'||c.startsWith('J')));
});
test('complete matches with 2 and 4 players conserve 52 cards, score once and finish at 101',()=>{
 for(const n of [2,4]){
  for(let run=0;run<15;run++){
   let b=ready(createBoat(players.slice(0,n),Math.random)), hands=0;
   while(b.stage!=='over'&&hands++<100){
    let moves=0;
    while(b.stage==='play'&&moves++<60){
     const id=b.order[b.turn], c=b.hands[id][0];const before=b;
     b=play(b,c);assert.notEqual(b,before);
     const all=[...b.deck,...b.floor,...Object.values(b.hands).flat(),...b.captured.flat()];
     assert.equal(all.length,52);assert.equal(new Set(all).size,52);
    }
    assert.equal(moves,48);assert.equal(b.captured.flat().length,52);
    assert.equal(b.result.earned.reduce((a,x)=>a+x,0),13+b.result.bonus+b.basras.reduce((a,x)=>a+x,0)*10);
    const same=boatAct(b,'a',{type:'play',card:'A♥',move:b.move},ctx);assert.equal(same,b);
    if(b.stage==='handOver'){
     const old=b.totals;b=boatAct(b,'a',{type:'next'},ctx);assert.deepEqual(b.totals,old);b=ready(b);
    }
   }
   assert.equal(b.stage,'over');assert.ok(Math.max(...b.totals)>=101);assert.notEqual(b.totals[0],b.totals[1]);
   assert.equal(b.winners.length,n/2);
  }
 }
});
test('26-26 carries majority bonus; leftovers go to last capturer without a basra',()=>{
 let b=fixture(['K♦'],'K♠');
 // Final move drops a queen; last capture receives it and the existing floor.
 b={...b,hands:{a:['Q♣'],b:[]},deck:[],captured:[Array(24).fill('3♣'),Array(24).fill('4♣')],floor:['K♦','A♥','5♣'],lastCapture:'b',carry:30};
 b=play(b,'Q♣');assert.equal(b.result.counts[1],28);assert.equal(b.result.bonus,60);assert.equal(b.basras[1],0);
 b=fixture(['K♦'],'K♠');b={...b,hands:{a:['Q♣'],b:[]},deck:[],captured:[Array(26).fill('3♣'),Array(24).fill('4♣')],floor:['K♦'],lastCapture:'b',carry:30};
 b=play(b,'Q♣');assert.deepEqual(b.result.counts,[26,26]);assert.equal(b.carry,60);assert.equal(b.result.bonus,0);
});
test('card rooms start only with 2 or 4 connected seats and do not expose late hands',()=>{
 const r=new Room('TEST',{format:'boat'});r.displayToken='test';
 for(let i=0;i<3;i++)r.addPlayer({name:'p'+i});
 r.start('display',0);assert.equal(r.phase,'lobby');
 r.addPlayer({name:'four'});r.start('display',1);assert.equal(r.boat.kind,'basra');
});
