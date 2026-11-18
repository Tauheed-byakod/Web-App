import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(Boolean(getToken()));
  const [toast,setToast]=useState(null);
  const notify=useCallback((message,type='success')=>{
    setToast({message,type});
    window.setTimeout(()=>setToast(null),3500);
  },[]);
  const refresh=useCallback(async()=>{
    if(!getToken()){setUser(null);setLoading(false);return;}
    try { setUser((await api('/auth/me')).user); }
    catch { localStorage.removeItem('civicgaps-token');setUser(null); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{
    refresh();
    const expired=()=>{setUser(null);notify('Your session expired. Please sign in again.','error');};
    window.addEventListener('civicgaps-session-expired',expired);
    return ()=>window.removeEventListener('civicgaps-session-expired',expired);
  },[refresh,notify]);
  const signIn=useCallback(async(credentials)=>{
    const result=await api('/auth/login',{method:'POST',body:credentials});
    localStorage.setItem('civicgaps-token',result.token);setUser(result.user);return result.user;
  },[]);
  const register=useCallback(async(credentials)=>{
    const result=await api('/auth/register',{method:'POST',body:credentials});
    localStorage.setItem('civicgaps-token',result.token);setUser(result.user);return result.user;
  },[]);
  const signOut=useCallback(()=>{localStorage.removeItem('civicgaps-token');setUser(null);},[]);
  const value=useMemo(()=>({user,loading,signIn,register,signOut,refresh,notify}),[user,loading,signIn,register,signOut,refresh,notify]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
