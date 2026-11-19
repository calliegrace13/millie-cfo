import {useExperience} from '@/hooks/useExperience';
import {type ReactNode} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {useSetup} from '@/hooks/useSetup';
import {shouldEnterSetup} from '@/lib/module-setup';
// Existing users are never redirected. New users may pause and explore the app;
// setup completion is never an authorization or financial-calculation condition.
export function SetupEntry({children}:{children:ReactNode}){
 const {experience}=useExperience();
 const {progress,loading,error,reload}=useSetup(),{pathname}=useLocation();
 if(loading)return <div role="status" className="p-8">Opening your workspace…</div>;
 if(error&&pathname==='/setup')return <div role="alert" className="p-8 space-y-3"><p>Unable to load your setup guide. Your financial records are unchanged.</p><button className="underline" onClick={reload}>Retry setup</button></div>;
 if(experience!=="ai"&&shouldEnterSetup(progress,pathname))return <Navigate to="/setup" replace/>;
 return <>{children}</>;
}
