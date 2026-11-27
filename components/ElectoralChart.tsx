"use client";
import {useEffect,useRef,useState} from "react";
import * as echarts from "echarts";
type Point={t:number;v:number;meta:number};
type Props={points:Point[];first:number;last:number;goal:number;election:number;onSelect:(t:number)=>void};
const fmt=(n:number)=>n.toLocaleString("es-CO");
const date=(t:number)=>new Date(t).toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"});
const colors=["#dc2626","#f97316","#eab308","#2563eb","#16a34a"];
export default function ElectoralChart({points,first,last,goal,election,onSelect}:Props){
 const host=useRef<HTMLDivElement>(null), wrapper=useRef<HTMLDivElement>(null), chart=useRef<echarts.ECharts|null>(null);
 const select=useRef(onSelect);select.current=onSelect;
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{if(!host.current)return;const instance=echarts.init(host.current);chart.current=instance;const observer=new ResizeObserver(()=>instance.resize());observer.observe(host.current);return()=>{observer.disconnect();instance.dispose();chart.current=null;};},[]);
 useEffect(()=>{
 const instance=chart.current;if(!instance)return;
 const color=(v:number)=>colors[Math.min(4,Math.max(0,Math.ceil(v/goal*5)-1))];
 const data=points.map(p=>[p.t,p.v]);
 const option:echarts.EChartsOption={
 animationDurationUpdate:350,
 textStyle:{fontFamily:"system-ui, sans-serif",color:"#475569"},
 color:["#014cff","#64748b","#15803d"],
 legend:{top:8,data:["Proyectados acumulados","Estimados por líderes","Meta electoral"],textStyle:{fontSize:11}},
 grid:{left:98,right:65,top:75,bottom:65},
 tooltip:{trigger:"axis",confine:true,backgroundColor:"#fff",borderColor:"#e2e8f0",padding:14,textStyle:{color:"#0f172a",fontSize:12},axisPointer:{type:"line",lineStyle:{color:"#94a3b8",type:"dashed"}},formatter:(raw:unknown)=>{const rows=Array.isArray(raw)?raw:[];const t=Number(rows[0]?.value?.[0]);const i=points.findIndex(p=>p.t===t);const p=points[i];if(!p)return date(t);const delta=i>0?p.v-points[i-1].v:null;return '<strong>'+date(t)+'</strong><br/>Proyectados: <b>'+fmt(p.v)+'</b><br/>Estimados: '+fmt(p.meta)+'<br/>Meta electoral: '+fmt(goal)+'<br/>Cumplimiento: '+(p.v/goal*100).toFixed(1)+'%<br/>Variación: '+(delta===null?"—":(delta>0?"+":"")+fmt(delta));}},
 xAxis:{type:"time",min:first,max:Math.max(last,first+86400000),axisLabel:{hideOverlap:true,color:"#64748b"},axisLine:{lineStyle:{color:"#cbd5e1"}},splitLine:{show:false}},
 yAxis:{name:"Estimados por líderes",nameLocation:"middle",nameGap:58,nameTextStyle:{fontWeight:"bold",color:"#475569",fontSize:12},type:"value",min:0,max:Math.max(goal,...points.map(p=>Math.max(p.v,p.meta)))*1.08,axisLabel:{formatter:(v:number)=>fmt(v)},splitLine:{lineStyle:{color:"#e2e8f0",type:"dashed"}}},
 dataZoom:[{type:"inside",xAxisIndex:0,filterMode:"none"}],
 visualMap:{show:false,type:"piecewise",seriesIndex:0,dimension:1,pieces:colors.map((c,i)=>({...(i===0?{}:{gt:goal*i/5}),...(i===4?{}:{lte:goal*(i+1)/5}),color:c}))},
 series:[
 {name:"Proyectados acumulados",type:"line",data,symbol:"circle",symbolSize:6,lineStyle:{width:3},itemStyle:{borderColor:"#fff",borderWidth:1.5},areaStyle:{opacity:.22},emphasis:{focus:"series",scale:1.5}},
 {name:"Estimados por líderes",type:"line",data:points.map(p=>[p.t,p.meta]),symbol:"none",lineStyle:{type:"dashed",width:2,color:"#64748b"}},
 {name:"Meta electoral",type:"line",data:[[first,goal],[Math.max(last,first+86400000),goal]],symbol:"none",lineStyle:{type:"dashed",width:3,color:"#15803d"},tooltip:{show:false},markLine:{silent:true,symbol:"none",lineStyle:{opacity:0},label:{show:true,position:"start",formatter:()=>fmt(goal),color:"#15803d",fontWeight:"bold",backgroundColor:"#dcfce7",borderColor:"#16a34a",borderWidth:1,borderRadius:5,padding:[5,7]},data:[{yAxis:goal},{yAxis:goal,label:{position:"insideEndTop",formatter:"Meta electoral",backgroundColor:"transparent",borderWidth:0,padding:[0,4],color:"#15803d",fontWeight:"bold"}}]}},
 {name:"Fecha de elección",type:"line",data:[],silent:true,markLine:{silent:true,symbol:"none",lineStyle:{color:"#15803d",type:"dotted",opacity:.65},label:{show:true,position:"start",formatter:()=>date(election),color:"#15803d",fontWeight:"bold",backgroundColor:"#dcfce7",borderColor:"#16a34a",borderWidth:1,borderRadius:5,padding:[5,7]},data:election>=first&&election<=last?[{xAxis:election}]:[]}}
 ]};
 instance.setOption(option,{notMerge:true});
 const click=(event:unknown)=>{const e=event as {value?:number[]};if(e.value&&points.some(p=>p.t===e.value?.[0]))select.current(e.value[0]);};
 instance.on("click",click);return()=>{instance.off("click",click);};
 },[points,first,last,goal,election]);
 useEffect(()=>{if(!expanded)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setExpanded(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[expanded]);
 return <div ref={wrapper} className={expanded?"fixed inset-0 z-[150] flex flex-col bg-white p-4 sm:p-8":"mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3"><div><p className="text-sm font-bold text-slate-900">Evolución electoral</p><p className="text-xs text-slate-500">Explora el período con el zoom de la gráfica</p></div><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={()=>chart.current?.dispatchAction({type:"dataZoom",start:0,end:100})}>Restablecer zoom</button><button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={()=>{const url=chart.current?.getDataURL({type:"png",pixelRatio:2,backgroundColor:"#fff"});if(url){const a=document.createElement("a");a.href=url;a.download="proyeccion-electoral.png";a.click();}}}>Exportar PNG</button><button type="button" className="rounded-lg bg-[#014cff] px-3 py-2 text-xs font-bold text-white" onClick={()=>setExpanded(v=>!v)}>{expanded?"Cerrar pantalla completa":"Pantalla completa"}</button></div></div><div ref={host} role="img" aria-label="Evolución electoral interactiva" className={expanded?"min-h-0 flex-1 w-full":"h-[390px] w-full sm:h-[460px]"}/></div>;
}
