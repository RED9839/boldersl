import * as art from './art.js';
import { HERO_DATA, kitOf } from './cardbook.js';
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!=null)e.textContent=text;return e;};
const rows={front:'전열',mid:'중열',back:'후열'};
const tones={순수:'#a8d8b5',광기:'#e89e94',냉정:'#99cadc',우울:'#bfb2e0',활발:'#edce86',공명:'#dbd2bb'};
function button(text,action,cls=''){const b=node('button',cls,text);b.type='button';b.onclick=action;return b;}
// 메인 로비는 js/lobby.js 로 옮겼다(비서 사도 + 오른쪽 메뉴). 여기에는 사도 프로필 창만 남는다.
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
