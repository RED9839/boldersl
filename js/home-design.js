import * as art from './art.js';
import { HERO_DATA, kitOf } from './cardbook.js';
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!=null)e.textContent=text;return e;};
const rows={front:'전열',mid:'중열',back:'후열'};
const tones={순수:'#a8d8b5',광기:'#e89e94',냉정:'#99cadc',우울:'#bfb2e0',활발:'#edce86',공명:'#dbd2bb'};
function button(text,action,cls=''){const b=node('button',cls,text);b.type='button';b.onclick=action;return b;}
export function lobbyScreen(onStart){
 const s=document.querySelector('#screen');s.className='journey-home';s.replaceChildren();
 const top=node('div','home-eyebrow','세계수 아래의 이야기');
 const hero=node('section','home-hero');
 const copy=node('div','home-copy');copy.append(node('span','chapter-label','첫째 층 · 에르피엔'),node('h2','','작은 사도들,\n커다란 모험.'),node('p','home-lead','세 명의 사도와 한 벌의 덱.\n세계수 아래, 우리만의 이야기를 시작해요.'));
 copy.append(button('새로운 모험  →',onStart,'home-primary'));
 copy.append(node('p','home-caption','사도 편성 → 카드 전투 → 새로운 선택'));
 const scene=node('div','home-scene');scene.setAttribute('aria-label','모험을 기다리는 사도들');
 scene.append(node('div','scene-orbit'),node('span','scene-star star-a','✦'),node('span','scene-star star-b','✧'));
 const entries=Object.entries(HERO_DATA);const featured=['에르핀','네르','버터'].map(k=>entries.find(([id])=>id===k)).filter(Boolean);if(featured.length<3){for(const e of entries){if(!featured.includes(e))featured.push(e);if(featured.length===3)break;}}
 featured.forEach(([id,h],i)=>{const wrap=button('',()=>profileScreen(id),'scene-person person-'+i);wrap.setAttribute('aria-label',h.ko+' 프로필');wrap.append(art.portrait(id,{ko:h.ko,tint:tones[h.nature],size:i===1?290:230,slot:'event',still:true}),node('span','person-tag',h.ko));scene.append(wrap);});
 scene.append(node('span','scene-note','어떤 이야기를 만나게 될까요?'));hero.append(copy,scene);
 const route=node('section','home-route');const title=node('div','route-title');title.append(node('span','chapter-label','여정'),node('h3','','세 지역을 잇는 여정'),node('p','','매 전투 뒤, 덱은 조금씩 달라집니다.'));route.append(title);
 [['01','에르피엔','요정 · 세계수 주변','잎사귀 사이로 시작되는 첫걸음'],['02','모나티엄','엘프 · 동부','새로운 카드, 새로운 가능성'],['03','벨리티엔','마녀 · 세계수 뿌리','마지막 선택이 기다리는 곳']].forEach(([n,name,sub,desc])=>{const c=node('article','route-card');c.append(node('span','route-number',n),node('span','route-place',sub),node('h3','',name),node('p','',desc));route.append(c);});
 s.append(top,hero,route);
}
export function profileScreen(key,{onTake,selected=false,full=false}={}){
 const h=HERO_DATA[key];if(!h)return;
 const previous=document.activeElement;const dialog=node('dialog','hero-profile');dialog.setAttribute('aria-label',h.ko+' 사도 프로필');
 const sheet=node('div','profile-sheet');const visual=node('div','profile-visual');visual.style.setProperty('--hero-tone',tones[h.nature]||'#b8d3bb');
 visual.append(node('span','chapter-label','사도'),art.portrait(key,{ko:h.ko,tint:tones[h.nature],size:370,slot:'event',still:true}));
 const body=node('div','profile-body');body.append(node('span','chapter-label',`${h.nature} · ${h.race} · ${rows[h.row]||h.row}`),node('h2','',h.ko),node('p','profile-role',`${h.role}  /  ${h.dmgType||'사도'}`),node('p','profile-blurb',h.blurb||'함께 모험할 사도의 능력과 카드를 확인하세요.'));
 const stats=node('div','profile-stats');for(const [label,val] of [['체력',h.hp],['공격',h.atk],['방어',h.def],['치명',h.crit+'%']]){const d=node('div');d.append(node('small','',label),node('strong','',val));stats.append(d);}body.append(stats);
 for(const [label,text] of [['패시브',h.passive],['고유 능력',h.keyword?`${h.keyword.ko} · ${h.keyword.text}`:null],['고학년 스킬',h.ult?`${h.ult.ko} · ${h.ult.text}`:null]])if(text){const d=node('section','profile-ability');d.append(node('h3','',label),node('p','',text));body.append(d);}
 const kit=kitOf(key);body.append(node('h3','profile-section','이 사도와 시작하는 카드'));
 const cards=node('div','profile-cards');for(const c of kit.start){const d=node('article');d.append(node('span','profile-cost',c.xcost?'X':c.cost),node('h4','',c.name),node('p','',c.text));cards.append(d);}body.append(cards);
 if(onTake){const take=button(selected?'편성에서 빼기':full?'편성 완료 · 다른 사도를 먼저 빼 주세요':'이 사도와 함께하기 →',()=>{onTake();dialog.close();},'home-primary');take.disabled=!selected&&full;body.append(take);}
 const close=button('닫기 ×',()=>dialog.close(),'profile-close');sheet.append(visual,body,close);dialog.append(sheet);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.showModal();close.focus();
}
