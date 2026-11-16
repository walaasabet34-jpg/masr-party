// Egyptian card table, using the existing card-room transport.
import { useEffect, useState } from 'react';
import { api } from '../net.js';
import { Avatar, Btn, playerMap } from '../ui/kit.jsx';
import { Card } from '../ui/art.jsx';
import { cardName, suggestedCapture, validCapture, sweep } from '../../../shared/cards.js';
import { T } from '../copy.js';

function Rules() {
  return <details className="rounded-2xl border border-white/20 bg-black/25 p-4">
    <summary className="cursor-pointer font-display font-black">إزاي نلعب؟ وقواعد الحساب</summary>
    <ul className="mt-3 space-y-2 text-sm">{T.boatSteps.map(([e,t,d])=><li key={t}>{e} <b>{t}:</b> {d}</li>)}</ul>
    <p className="mt-3 text-sm text-ink-muted">دور لكل لاعب من غير مؤقت. آخر واحد لمّ ياخد باقي الأرض من غير بصرة. عند ٤ لاعيبة: الأول والتالت فريق، والتاني والرابع فريق. بنت وشايب مالهمش قيمة جمع. أعلى رصيد يكسب بعد الإيد اللي يوصل فيها فريق لـ١٠١؛ التعادل يكمّل إيد كمان.</p>
  </details>;
}
function Table({snap,big=false}) {
  const b=snap.boat, P=playerMap(snap);
  const mine=b.order.includes(snap.me), turn=mine && b.turn===snap.me && b.stage==='play';
  const host=snap.role==='display' || snap.hostId===snap.me;
  const [card,setCard]=useState(null), [take,setTake]=useState([]);
  useEffect(()=>{setCard(null);setTake([]);},[b.move]);
  const choose=(c)=>{setCard(c);setTake(suggestedCapture(c,b.floor));};
  const toggle=(c)=>{if(card && !sweep(card)) setTake(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c]);};
  const valid=card && validCapture(card,take) && (take.length || !suggestedCapture(card,b.floor).length);
  const names=(i)=>b.order.filter((_,n)=>n%2===i).map(id=>P[id]?.name??'لاعب').join(' + ');
  const over=['handOver','over'].includes(b.stage);
  return <div className={`mx-auto flex w-full max-w-5xl flex-col gap-4 ${big?'':'px-4 pb-6'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-display font-black text-3xl">🃏 بصرة · الكومي</h1>
      <span className="text-sm text-ink-muted">إيد {b.hand} · باقي الرزمة {b.deckLeft} · الهدف ١٠١</span>
    </div>
    <div className="grid grid-cols-2 gap-3">{[0,1].map(i=><div key={i} className={`rounded-2xl border-2 p-3 ${b.teams.find(x=>x.id===b.turn)?.team===i?'border-lime bg-lime/10':'border-white/15 bg-black/25'}`}>
      <div className="font-display font-black">{names(i)}</div><div className="text-xl text-lime">{b.totals[i]} نقطة</div>
      <div className="text-xs text-ink-muted">{b.captured[i]} ورقة ملمومة · {b.basras[i]} بصرة في الإيد</div>
    </div>)}</div>
    <Rules />
    {b.stage==='rules' && <div className="rounded-3xl bg-cyan p-5 text-black">
      <h2 className="text-2xl font-black">جاهزين للكوتشينة؟</h2>
      <p>ورقك ليك لوحدك. اختار ورقة من إيدك، راجع الورق اللي هتلمّه، وبعدين العب.</p>
      <p className="my-3">جاهز {b.ready.length} من {b.order.length}</p>
      {mine?<Btn color="lime" disabled={b.ready.includes(snap.me)} onClick={()=>api.boat({type:'ready'})}>{b.ready.includes(snap.me)?'جاهز ✓':'أنا جاهز'}</Btn>:<p>مستنيين اللاعيبة يجهزوا من أجهزتهم.</p>}
    </div>}
    {b.stage==='play' && <>
      <div className={`rounded-2xl p-3 text-center font-display font-black text-xl ${turn?'bg-lime text-black':'bg-white/10'}`}>{turn?'دورك! اختار ورقة من إيدك':`دور ${P[b.turn]?.name??'لاعب'}`}{P[b.turn]?.connected===false && ' · الاتصال مقطوع، مستنيين يرجع'}</div>
      <section aria-label="ورق الأرض" className="min-h-40 rounded-[30px] border-4 border-emerald-900 bg-emerald-800/70 p-4">
        <h2 className="mb-3 text-sm font-black text-white/80">ورق الأرض {card && '· المحدد هيتلمّ'}</h2>
        <div className="flex flex-wrap justify-center gap-3">{b.floor.length?b.floor.map(c=><Card key={c} txt={c} w={big?70:58} glow={take.includes(c)} onClick={turn&&card&&!sweep(card)?()=>toggle(c):undefined}/>):<p className="py-5 text-white/70">الأرض فاضية… خلي بالك من البصرة!</p>}</div>
      </section>
      {b.lastPlay && <p className="rounded-xl bg-white/5 p-3 text-sm" aria-live="polite">{P[b.lastPlay.pid]?.name}: لعب {cardName(b.lastPlay.card)} · {b.lastPlay.take.length?`لمّ ${b.lastPlay.take.length} ورقة`:'نزّل ورقة على الأرض'} {b.lastPlay.basra && '· بصرة! +١٠ ✨'}</p>}
    </>}
    {mine && !over && <section aria-label="ورقك" className="rounded-3xl bg-black/25 p-4">
      <h2 className="mb-3 font-display font-black text-xl">ورقك <span className="text-xs text-ink-muted">مخفي عن الباقيين</span></h2>
      <div className="flex flex-wrap justify-center gap-3">{b.myHand.map(c=><Card key={c} txt={c} w={62} glow={card===c} onClick={turn?()=>choose(c):undefined}/>)}</div>
      {turn && card && <div className="mt-4 text-center">
        <p className="mb-3 text-sm">{take.length?`هتلمّ ${take.length} ورقة. تقدر تغيّر التحديد من الأرض.`:'الورقة هتنزل على الأرض.'}</p>
        {!valid && <p role="alert" className="mb-2 text-yellow">اختار ورق بنفس الرقم أو مجموعات مجموع كل واحدة يساوي ورقتك. لو فيه لمّة، لازم تلمّ.</p>}
        <Btn color="lime" className="w-full" disabled={!valid} onClick={()=>{api.boat({type:'play',card,take,move:b.move});setCard(null);setTake([]);}}>العب {cardName(card)}{take.length?' ولمّ':' على الأرض'}</Btn>
      </div>}
    </section>}
    {over && <section className="rounded-3xl border-2 border-yellow bg-yellow/10 p-5">
      <h2 className="mb-3 font-display font-black text-2xl">{b.stage==='over'?'🏆 خلصت!':'نتيجة الإيد'}</h2>
      {b.result && <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr>{['الفريق','ورق','بصرة','كروت خاصة','أغلبية','نقط الإيد'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{[0,1].map(i=><tr key={i}><td className="p-2">{names(i)}</td><td className="p-2">{b.result.counts[i]}</td><td className="p-2">{b.result.basras[i]*10}</td><td className="p-2">{b.result.specials[i]}</td><td className="p-2">{b.result.majority===i?b.result.bonus:0}</td><td className="p-2 font-black">+{b.result.earned[i]}</td></tr>)}</tbody></table></div>}
      {b.carry>0 && <p className="mt-3">تعادل في عدد الورق: {b.carry} نقطة أغلبية مترحّلة للإيد الجاية.</p>}
      {b.stage==='over' && <p className="my-4 text-2xl font-black">{b.winners.map(id=>P[id]?.name).join(' + ')} كسبوا 🎉</p>}
      {host && <Btn color="yellow" className="mt-4 w-full" onClick={()=>b.stage==='over'?api.end():api.boat({type:'next'})}>{b.stage==='over'?'شوف النتيجة النهائية':'وزّع الإيد الجاية'}</Btn>}
      {!host && b.stage==='handOver' && <p className="mt-3">مستنيين المضيف يوزّع الإيد الجاية.</p>}
    </section>}
    <div className="flex flex-wrap gap-3">{b.order.map(id=><div key={id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"><Avatar p={P[id]} size={24}/><span className="text-sm">{P[id]?.name}: {b.handCounts[id]} ورقة {id===b.turn && b.stage==='play'?'← الدور':''}</span></div>)}</div>
    {!mine && snap.role!=='display' && <p className="text-center text-ink-muted">بتتفرج دلوقتي. تقدر تلعب لما المضيف يرجع للأوضة ويبدأ ماتش جديد.</p>}
  </div>;
}
export function BoatBig({snap}) {return <Table snap={snap} big/>;}
export function BoatPhone({snap}) {return <Table snap={snap}/>;}
