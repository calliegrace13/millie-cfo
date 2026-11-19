import {createContext,useContext,useState,type ReactNode} from 'react';
import {useAuth} from './useAuth';
import {useAutomation} from './useAutomation';
type Experience='ai'|'manual';
const Context=createContext<{experience:Experience;choose:(v:Experience)=>void}>({experience:'manual',choose:()=>{}});
// Presentation preference only: never changes task permissions or module visibility.
export function ExperienceProvider({children}:{children:ReactNode}){
 const {user}=useAuth(),a=useAutomation(),[choice,setChoice]=useState<{owner:string;value:Experience}|null>(null);
 const key='millie-experience:'+user?.id;
 let stored:string|null=null;try{stored=localStorage.getItem(key);}catch{}
 const experience=choice&&choice.owner===user?.id?choice.value:stored==='ai'||stored==='manual'?stored:a.hasAI?'ai':'manual';
 const choose=(value:Experience)=>{if(!user)return;setChoice({owner:user.id,value});try{localStorage.setItem(key,value);}catch{}};
 return <Context.Provider value={{experience,choose}}>{children}</Context.Provider>;
}
export const useExperience=()=>useContext(Context);
