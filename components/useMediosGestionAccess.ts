"use client";
import {useEffect,useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth} from "@/lib/firebase";

export function useMediosGestionAccess(){
  const [canManage,setCanManage]=useState(false);
  const [checked,setChecked]=useState(false);
  useEffect(()=>{
    let active=true;
    const unsub=onAuthStateChanged(auth,async user=>{
      if(active){setCanManage(false);setChecked(false);}
      if(!user){if(active)setChecked(true);return;}
      try{
        const token=await user.getIdToken();
        const res=await fetch("/api/medios?type=visibility",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
        const data=res.ok?await res.json():{canManage:false};
        if(active)setCanManage(data.canManage===true);
      }catch{if(active)setCanManage(false);}
      finally{if(active)setChecked(true);}
    });
    return()=>{active=false;unsub();};
  },[]);
  return {canManage,checked};
}
