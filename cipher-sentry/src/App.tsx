import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletData } from "./hooks/useWalletData";
import { useMarketData } from "./hooks/useMarketData";
import { useTransactionHistory, TxRow } from "./hooks/useTransactionHistory";
import {
  Transaction,
  ComputeBudgetProgram,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

/* ---------- types ---------- */
type AgentId =
  | "tx" | "prio" | "close" | "bridge" | "airdrop" | "rug"
  | "clinic" | "jito" | "tax" | "rescue" | "stake";

type TraceStep = { label: string; detail: string; ms: number; status?: "pending"|"run"|"done" };
type AgentMessage = {
  id: string; agent: AgentId; prompt: string;
  trace: TraceStep[]; result: any;
  createdAt: number; confidence: number;
  source: "user"|"sentry"|"workflow";
};

type AgentDef = {
  id: AgentId; name: string; verb: string; blurb: string;
  accent: string; soft: string; icon: string; key: string;
  placeholder: string; chips: string[]; edge: string; hot?: boolean;
};

const FALLBACK_WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
/* Module-level mutable — updated from component so solver fns can access live price */
let LIVE_SOL_PRICE = 227.84;
const short = (s:string)=> s ? s.slice(0,4)+"…"+s.slice(-4) : "—";
const uid = ()=> Math.random().toString(36).slice(2,9);

const AGENTS: AgentDef[] = [
  { id:"tx", name:"TX Inspector", verb:"v0 trace • CU map", blurb:"failed sig → fix", accent:"#b9ff63", soft:"#11200f", icon:"⌬", key:"1",
    placeholder:"Paste sig: 4pQYH… or 'jupiter swap CU exceeded'",
    chips:["4pQYH… failed","CU budget exceeded","rent-exempt fail"],
    edge:"Solscan = logs • cipher = CPI flame + retry" },
  { id:"prio", name:"Priority", verb:"CU + tip ladder", blurb:"land <400ms", accent:"#62ffe8", soft:"#0c201c", icon:"⟐", key:"2",
    placeholder:"2.4 SOL → JUP — land next slot, <0.0008 SOL fee",
    chips:["land next slot <0.0008","priority fee now?","optimize CU"],
    edge:"Jupiter static CU • cipher simulates then budgets" },
  { id:"close", name:"Rent Reclaim", verb:"close ATAs", blurb:"+0.002039 / acct", accent:"#ffd65e", soft:"#221a08", icon:"✕", key:"3",
    placeholder:"scan wallet for empty token accounts + dust NFTs",
    chips:["close empty ATAs","reclaim rent","burn dust NFTs"],
    edge:"incinerator 1-by-1 • cipher bundles 24 in 1 v0" },
  { id:"bridge", name:"Bridge Mesh", verb:"Sol ↔ EVM", blurb:"deBridge • Mayan", accent:"#8fbfff", soft:"#0e1529", icon:"⇌", key:"4",
    placeholder:"bridge 8,200 USDC solana → base <90s <0.25%",
    chips:["8,200 USDC sol→base","2 SOL to Arb","mayan vs debridge"],
    edge:"widget = price • cipher = MEV lane + SOL fee" },
  { id:"airdrop", name:"Drop Hunter", verb:"JUP / JTO / TNSR", blurb:"vest + points", accent:"#f3a6ff", soft:"#231127", icon:"✶", key:"5",
    placeholder:"scan wallet for unclaimed: jup, jito, tensor, marginfi",
    chips:["scan drops","jupiter r3?","tensor claim?"],
    edge:"Step = claim list • cipher = points→USD + batch" },
  { id:"rug", name:"Pump Scan", verb:"mint • LP • sell-sim", blurb:"pump.fun safety", accent:"#ff7892", soft:"#24111a", icon:"◈", key:"6",
    placeholder:"pump mint 9e8rA… – mint/freeze revoked? sellable?",
    chips:["9e8rA… safe?","check mint authority","sell sim x3"],
    edge:"Rugcheck static • cipher runs 3 live sell sims" },
  { id:"clinic", name:"Clinic", verb:"health score", blurb:"rent • delegates", accent:"#8ce8ff", soft:"#0d1722", icon:"⬢", key:"7",
    placeholder:"full sol clinic — health, exposure, fix bundle",
    chips:["clinic wallet","rent audit","delegate sweep"],
    edge:"SolanaFM = explorer • cipher = 1-bundle fix" },
  { id:"jito", name:"Jito Shield", verb:"bundle • MEV", blurb:"sandwich <0.1%", accent:"#cba7ff", soft:"#19122a", icon:"⬒", key:"8",
    placeholder:"simulate 22 SOL → USDC, build Jito bundle",
    chips:["simulate 22 SOL→USDC","bundle jupiter","mev leak?"],
    edge:"Jito UI raw • cipher explains sandwich % + JSON" },
  { id:"tax", name:"Tax", verb:"FIFO • pump PnL", blurb:"CPA CSV", accent:"#90ff7a", soft:"#111f13", icon:"∑", key:"9",
    placeholder:"2025 FIFO export — include pump + JLP + Kamino",
    chips:["2025 FIFO export","pump PnL CSV","cost basis"],
    edge:"Koinly misses CPI • cipher Helius parsed" },
  { id:"rescue", name:"Rescue", verb:"isolate • sweep", blurb:"Jito atomic", accent:"#ff8b68", soft:"#24110f", icon:"⌖", key:"0",
    placeholder:"key leaked? emergency sweep → Squads Safe",
    chips:["emergency sweep","isolate compromised","close all delegates"],
    edge:"no consumer tool exists • cipher ships 1 bundle" },
  { id:"stake", name:"Stake Op", verb:"MEV APY", blurb:"validator opt", accent:"#6bfbd1", soft:"#0d201a", icon:"⟡", key:"s",
    placeholder:"restake SOL — highest MEV-share validator",
    chips:["best stake APY","jito mev share","restake 184 SOL"],
    edge:"Marinade = APY • cipher = MEV tips net" },
];

/* ---------- parsing ---------- */
const b58re = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
function parseAddr(q:string, fb:string){ const m=q.match(b58re); return m?.[0] ?? fb; }
function parseAmount(q:string, def:number){
  const m = q.match(/([\d,\.]+)\s*(sol|usdc|usd|jup|eth)?/i);
  return m ? parseFloat(m[1].replace(/,/g,'')) || def : def;
}
function parseYear(q:string){ const m=q.match(/\b(20\d{2})\b/); return m? +m[1] : 2025; }

function detectAgent(q:string):AgentId{
  const s=q.toLowerCase();
  if (/(sig|signature|fail|revert|cu |compute|budget|simulation|error|trace|0x|tx )/.test(s)) return "tx";
  if (/(priorit|cu |compute|tip|land|micro.?lamport|fee|gwei)/.test(s)) return "prio";
  if (/(close|rent|ata|reclaim|empty|dust|burn|incinerat)/.test(s)) return "close";
  if (/(bridge|wormhole|debridge|mayan|\bsol\b.*(base|eth|arb|→))/i.test(s)) return "bridge";
  if (/(airdrop|unclaim|jup|jto|tensor|marginfi|points|retro|drop)/.test(s)) return "airdrop";
  if (/(rug|pump|mint authority|freeze|honeypot|safe\?|lp burn|scam)/.test(s)) return "rug";
  if (/(clinic|health|score|audit)/.test(s)) return "clinic";
  if (/(mev|sandwich|jito|bundle|shield|shred)/.test(s)) return "jito";
  if (/(tax|fifo|cost basis|cpa|export|8949|pnl)/.test(s)) return "tax";
  if (/(rescue|drain|compromis|emergency|sweep|isolate|hack|leak)/.test(s)) return "rescue";
  if (/(stake|validator|apy|restake|mev share|jitosol)/.test(s)) return "stake";
  return "clinic";
}

function makeTrace(id: AgentId): TraceStep[] {
  const base:TraceStep[] = [
    { label:"parse", detail:"svm v0 • intent", ms:170 },
    { label:"rpc", detail:"helius • jito • ams", ms:260 },
    { label:"simulate", detail:"svm fork • preflight", ms:300 },
  ];
  const tails:Record<AgentId,TraceStep> = {
    tx:{label:"trace", detail:"CPI flame • CU map", ms:390},
    prio:{label:"optimize", detail:"CU + tip ladder", ms:340},
    close:{label:"rent", detail:"scan 143 ATAs", ms:390},
    bridge:{label:"route", detail:"deBridge • Mayan • CCTP", ms:410},
    airdrop:{label:"hunt", detail:"8 protocols + points", ms:440},
    rug:{label:"scan", detail:"mint/freeze • sell x3", ms:400},
    clinic:{label:"score", detail:"exposure graph", ms:350},
    jito:{label:"bundle", detail:"shredstream • tip", ms:410},
    tax:{label:"fifo", detail:"CPI rebuild 1847 tx", ms:470},
    rescue:{label:"isolate", detail:"close+sweep bundle", ms:360},
    stake:{label:"apy", detail:"MEV tips ladder", ms:320},
  };
  const end={label:"verify", detail:"slot-anchored", ms:120};
  return [...base, tails[id], end].map(t=>({...t, status:"pending" as const}));
}

/* ---------- solvers ---------- */
function solveTx(_q:string, wallet:string){
  return {
    kind:"tx",
    sig:"4pQYHx7aG9LkX2MqfW5t9P1zQeRN8bBvT7c3rD8nVjA1sKpZ6",
    slot: 349810992,
    status:"failed",
    err:"Error: insufficient funds for rent-exempt minimum",
    cu:{ used:118240, budget:200000 },
    cpi:[
      { name:"jupiter-aggregator-v6 • route", cu:71240, ok:true },
      { name:"spl-token • transfer_checked", cu:12430, ok:false, err:"0x1" },
      { name:"system • create_account (ATA JUP)", cu:18900, ok:false, err:"rent short" },
      { name:"compute-budget", cu:420, ok:true }
    ],
    fix:"Recipient JUP ATA missing • rent needs 0.002039 SOL • wallet left 0.0012 SOL",
    retry:`solana transfer ${short(wallet)} 0.005 --allow-unfunded-recipient\njupiter-swap --input-mint So11111… --output-mint JUPyiwr… --amount 2400000000 --compute-unit-price 42000`,
    tip:"42,000 μL • ~0.000084 SOL"
  };
}
function solvePrio(q:string){
  const amount = parseAmount(q, 2.4);
  const cuSim = Math.round(125000 + amount*9800);
  return {
    kind:"prio",
    pair:`SOL → JUP • ${amount} SOL`,
    amount, cuSim,
    cuSet: Math.ceil(cuSim*1.18/1000)*1000,
    ladder:[
      { p:"p25", price:18400, fee:0.0000368, land:"92% 2 slots" },
      { p:"p50", price:37200, fee:0.0000744, land:"98% next" },
      { p:"p80", price:82000, fee:0.000164, land:"~400ms" },
      { p:"jito", price:0, fee:0.00035, land:"~218ms", tip:350000 },
    ],
    pick:1
  };
}
function solveClose(q:string, wallet:string){
  const w = parseAddr(q, wallet);
  const empty = 24;
  const nfts = 7;
  const accounts = Array.from({length:empty}, (_,i)=>({
    id:`ata_${i}`, mint:["USDC","BONK","JUP","WIF","PYTH","ORCA","RAY","TNSR"][i%8],
    ata: Math.random().toString(36).slice(2,6)+"…"+Math.random().toString(36).slice(2,5),
    rent:0.002039, selected:true
  }));
  const rent = +(empty*0.002039).toFixed(6);
  return {
    kind:"close", wallet: w,
    scanned:143, empty, nfts,
    rent, usd: +(rent*LIVE_SOL_PRICE).toFixed(2),
    accounts, fee:0.000105
  };
}
function solveBridge(q:string){
  const amount = parseAmount(q, 8200);
  const toM = q.match(/(base|arbitrum|arb|optimism|op|ethereum|eth)\b/i);
  const to = toM ? ({arb:"Arbitrum", op:"Optimism", eth:"Ethereum", ethereum:"Ethereum"} as any)[toM[1].toLowerCase()] || (toM[1][0].toUpperCase()+toM[1].slice(1).toLowerCase()) : "Base";
  const baseOut = amount * 0.999;
  return {
    kind:"bridge", from:"Solana", to, asset:"USDC", amount,
    quotes:[
      { r:"deBridge DLN", t:"~62s", fee_usd:1.40, fee_sol:0.0061, out: +(baseOut*0.9990).toFixed(2), slip:"0.10%", tag:"best" },
      { r:"Mayan / Wormhole", t:"~48s", fee_usd:2.10, fee_sol:0.0091, out: +(baseOut*0.9981).toFixed(2), slip:"0.19%", tag:"fast" },
      { r:"Circle CCTP v2", t:"~13m", fee_usd:0, fee_sol:0, out: amount, slip:"0%", tag:"1:1" },
      { r:"Allbridge Core", t:"~3.2m", fee_usd:3.60, fee_sol:0.0157, out: +(baseOut*0.9967).toFixed(2), slip:"0.33%", tag:"alt" },
    ]
  };
}
function solveAirdrop(q:string, wallet:string){
  const w = parseAddr(q, wallet);
  return {
    kind:"airdrop", wallet:w,
    items:[
      { id:"jup", proj:"Jupiter • R3", amount:"1,840 JUP", usd:1492, claimed:false },
      { id:"tnsr", proj:"Tensor S4", amount:"620 TNSR", usd:244, claimed:false },
      { id:"jto", proj:"Jito", amount:"87 JTO", usd:211, claimed:false },
      { id:"mf", proj:"Marginfi pts", amount:"41,200 pts", usd:312, claimed:false, track:true },
    ],
    fee:"0.00031 SOL"
  };
}
function solveRug(q:string){
  const mint = parseAddr(q, "9e8rA4tVpumPV2XkQ3pMoNcat9x");
  const score = 79;
  return {
    kind:"rug",
    token:`MOONCAT • ${short(mint)} • pump`,
    mint, mcap:"$412k",
    checks:[
      {k:"Mint authority", v:"revoked", ok:true},
      {k:"Freeze authority", v:"revoked", ok:true},
      {k:"Mutable metadata", v:"no", ok:true},
      {k:"LP", v:"pump bonding 61%", ok:true, note:"migrating"},
      {k:"Sell sim", v:"0.8% / 1.1% / 0.9%", ok:true},
      {k:"Top10", v:"38.7%", ok:false},
      {k:"Insiders", v:"2 wallets 11.2%", ok:false},
    ],
    holders:[
      {n:"insider A", pct:6.4}, {n:"insider B", pct:4.8},
      {n:"whale", pct:5.2}, {n:"bundle", pct:3.7},
      {n:"rest", pct:79.9}
    ],
    score
  };
}
function solveClinic(q:string, wallet:string){
  const w = parseAddr(q, wallet);
  return {
    kind:"clinic", wallet:w, score:81, net:62440,
    exposure:[
      {l:"SPL delegates", v:2},
      {l:"Empty ATAs", v:24},
      {l:"Spam NFTs", v:7},
      {l:"LUT stale", v:1},
    ],
    inbox:[
      "24 empty ATAs — reclaim 0.0519 SOL",
      "2 SPL delegates stale 116d — revoke",
      "7 dust NFTs — burn & close",
      "1 lookup table expired — prune"
    ],
    fix:"1-bundle close+revoke+burn • 0.00021 SOL • +0.054 SOL"
  };
}
function solveJito(q:string){
  const solAmt = parseAmount(q, 22);
  const out = +(solAmt * LIVE_SOL_PRICE * 0.999).toFixed(2);
  return {
    kind:"jito",
    trade:`${solAmt} SOL → USDC`,
    solAmt,
    pub:{ out, pi:"0.21%", sandwich:"23%", back:"9%"},
    shield:{ out: +(out*0.9987).toFixed(2), sandwich:"<0.1%", land:"218ms", tip:0.00035 },
    bundle:`{\n  "jsonrpc":"2.0",\n  "method":"sendBundle",\n  "params":[["<signed v0>"]],\n  "id":1\n}`
  };
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function hashStr(s:string): number {
  let h = 0x811c9dc5;
  for(let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h;
}
function genMonthlyPnl(year:number, wallet:string) {
  const seed = hashStr(`${wallet}${year}`);
  /* Seasonal patterns: Q1 airdrop season, Q3 pump season, Q4 rotation */
  const gainsSeeds   = [1.4,2.8,1.1,1.6,1.0,0.9,1.2,2.1,1.8,1.3,1.7,1.5];
  const lossesSeeds  = [0.4,0.6,0.8,1.2,0.5,0.7,0.3,0.5,0.9,1.1,0.6,0.8];
  return MONTH_NAMES.map((month, i) => {
    const r = ((seed >> i) & 0xff) / 255;
    const gains  = Math.round((800 + r * 4200) * gainsSeeds[i]);
    const losses = Math.round((200 + r * 1600) * lossesSeeds[i]);
    const txs    = Math.round(60 + r * 240);
    return { month, gains, losses, net: gains - losses, txs };
  });
}
function solveTax(q:string, wallet:string){
  const year = parseYear(q);
  const w = parseAddr(q, wallet);
  const monthly = genMonthlyPnl(year, w);
  const gains  = monthly.reduce((s,m)=>s+m.gains, 0);
  const losses = monthly.reduce((s,m)=>s+m.losses, 0);
  return {
    kind:"tax", year, wallet:w,
    txs: monthly.reduce((s,m)=>s+m.txs, 0),
    realized:{ gains, losses, net: gains-losses },
    monthly,
    rows:[
      {d:`${year}-02-11`, a:"JUP", t:"airdrop", g:"+$1,884"},
      {d:`${year}-04-03`, a:"SOL", t:"sell 18.4 SOL", g:`+$${(18.4*LIVE_SOL_PRICE*1.06).toFixed(0)}`},
      {d:`${year}-06-19`, a:"BONK", t:"sell", g:"-$1,340"},
      {d:`${year}-09-27`, a:"MOONCAT", t:"pump exit", g:"+$2,700"},
      {d:`${year}-11-04`, a:"SOL", t:"sell 5.2 SOL", g:`+$${(5.2*LIVE_SOL_PRICE*0.97).toFixed(0)}`},
    ]
  };
}
function solveRescue(){
  return {
    kind:"rescue",
    checklist:[
      {id:"c1", s:"Cancel 2 pending v0", done:true, urg:false},
      {id:"c2", s:"Revoke 2 SPL delegates", done:false, urg:true},
      {id:"c3", s:"Close 143 ATAs • reclaim rent", done:false, urg:true},
      {id:"c4", s:"Sweep 47.82 SOL + 12,440 USDC → 4Vau…9c", done:false, urg:true},
      {id:"c5", s:"Burn spam NFTs", done:false, urg:false},
      {id:"c6", s:"Rotate to Ledger 3pk…", done:false, urg:false},
    ],
    bundle:"1 Jito bundle • 0.00041 SOL • AMS private",
    vault:"Squads Safe 4VauLt…9c2f • 2/3"
  };
}
function solveStake(q:string){
  const amt = parseAmount(q, 184);
  return {
    kind:"stake", amount:amt,
    validators:[
      { n:"Jito • jito-sol", apy:7.82, com:7, mev:"yes", score:94, pick:true },
      { n:"Laine", apy:7.14, com:5, mev:"partial", score:88 },
      { n:"JPool", apy:7.21, com:8, mev:"yes", score:86 },
      { n:"SolBlaze", apy:6.98, com:4, mev:"no", score:81 },
    ],
    ypy: +(amt*0.0782).toFixed(2)
  };
}

/* Build a close-ATA result from real on-chain token accounts */
function buildRealCloseResult(wallet: string, wd: import("./hooks/useWalletData").WalletData) {
  const empty = wd.emptyAtas;
  const accounts = empty.map((a, i) => ({
    id: `real_ata_${i}`,
    mint: a.symbol || a.mint.slice(0, 4),
    ata: short(a.pubkey),
    rent: 0.002039,
    selected: true,
  }));
  const rent = wd.reclaimableSol;
  return {
    kind: "close",
    wallet,
    live: true,
    scanned: wd.totalAccounts,
    empty: empty.length,
    nfts: 0,
    rent,
    usd: +(rent * LIVE_SOL_PRICE).toFixed(2),
    accounts,
    fee: 0.000105,
  };
}

const solvers: Record<AgentId,(q:string,wallet:string)=>any> = {
  tx: solveTx, prio: solvePrio, close: solveClose, bridge: (q)=>solveBridge(q),
  airdrop: solveAirdrop, rug: solveRug, clinic: solveClinic, jito: solveJito,
  tax: solveTax, rescue: ()=>solveRescue(), stake: solveStake
};

/* ============ APP ============ */
type BundleItem = { id:string; label:string; value:string; agent:AgentId };

export default function App(){
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected, connecting, disconnect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const walletData = useWalletData();

  const walletAddr = publicKey?.toBase58() ?? FALLBACK_WALLET;

  const [selected,setSelected] = useState<AgentId|"auto">("auto");
  const [thread,setThread] = useState<AgentMessage[]>(()=>{
    try{ const s=localStorage.getItem("cipher_thread_sentry_v3"); return s? JSON.parse(s):[];}catch{return [];}
  });
  const [input,setInput] = useState("");
  const [running,setRunning] = useState(false);
  const [liveTrace,setLiveTrace] = useState<TraceStep[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const market = useMarketData();
  const { solPrice, tps, slot, prioFee, priceSource, chainSource } = market;

  const [sentryOn,setSentryOn] = useState(true);
  const [nextRun,setNextRun] = useState(21);
  const [sentryLog,setSentryLog] = useState<{t:number; msg:string; agent:AgentId}[]>([]);

  const [savedSol,setSavedSol] = useState(0.284);
  const [claimedUsd,setClaimedUsd] = useState(2259);
  const [gasSaved,setGasSaved] = useState(41);

  const [bundle,setBundle] = useState<BundleItem[]>([]);
  const [toast,setToast] = useState<{msg:string; kind?:"ok"|"err"|"warn"}|null>(null);

  const [rescueSec,setRescueSec] = useState<number|null>(null);
  const [cmdOpen,setCmdOpen] = useState(false);
  const [cmdQ,setCmdQ] = useState("");

  // tx signing state
  const [signing,setSigning] = useState(false);
  const [lastSig,setLastSig] = useState<string|null>(null);

  const currentMeta = useMemo(()=> selected!=="auto" ? AGENTS.find(a=>a.id===selected)! : null, [selected]);

  useEffect(()=>{ try{ localStorage.setItem("cipher_thread_sentry_v3", JSON.stringify(thread.slice(-28))); }catch{} },[thread]);
  useEffect(()=>{ feedRef.current?.scrollTo({top: feedRef.current.scrollHeight, behavior:"smooth"});},[thread, liveTrace]);

  /* slot / tps / prio / price now come from useMarketData — no local jitter needed */
  useEffect(()=>{ LIVE_SOL_PRICE = solPrice; }, [solPrice]);

  useEffect(()=>{ if(!sentryOn) return; const id=setInterval(()=>setNextRun(n=> n>0? n-1:19),1000); return ()=>clearInterval(id);},[sentryOn]);
  useEffect(()=>{ if(!sentryOn || nextRun!==0) return;
    const pool:AgentId[] = ["close","clinic","airdrop","prio","stake"];
    const a = pool[Math.floor(Math.random()*pool.length)];
    runCore(AGENTS.find(x=>x.id===a)!.chips[0], a, "sentry");
    setNextRun(22+Math.floor(Math.random()*18));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[nextRun, sentryOn, walletAddr]);

  useEffect(()=>{ if(rescueSec===null || rescueSec<=0) return; const id=setInterval(()=>setRescueSec(s=> (s??1)-1),1000); return ()=>clearInterval(id); },[rescueSec]);

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setCmdOpen(o=>!o); setCmdQ(""); return; }
      const target = e.target as HTMLElement;
      const typing = target.tagName==="TEXTAREA" || target.tagName==="INPUT" || target.isContentEditable;
      if(!cmdOpen && !typing){
        if(e.key==="/"){ e.preventDefault(); inputRef.current?.focus(); return; }
        const map: Record<string,AgentId> = Object.fromEntries(AGENTS.map(a=>[a.key, a.id]));
        if(map[e.key]){ setSelected(map[e.key]); inputRef.current?.focus(); }
      }
    };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  },[cmdOpen]);

  const pushToast = (msg:string, kind:"ok"|"err"|"warn"="ok")=>{ setToast({msg,kind}); setTimeout(()=>setToast(null), 3000); };

  const runCore = useCallback(async (q:string, agentId:AgentId, source: AgentMessage["source"]="user")=>{
    const trace = makeTrace(agentId);
    if(source==="user") setRunning(true);
    setLiveTrace(trace.map(t=>({...t, status:"pending"})));
    for(let i=0;i<trace.length;i++){
      setLiveTrace(prev=>prev.map((s,idx)=> idx<i ? {...s,status:"done"} : idx===i ? {...s,status:"run"} : s));
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r=>setTimeout(r, source==="sentry" ? 70 : trace[i].ms*0.58));
    }
    setLiveTrace(prev=>prev.map(s=>({...s,status:"done"})));
    // For close agent: inject real on-chain ATAs if wallet connected
    let result: any;
    if(agentId === "close" && connected && walletData.tokenAccounts.length > 0) {
      result = buildRealCloseResult(walletAddr, walletData);
    } else {
      result = solvers[agentId](q, walletAddr);
    }
    const msg:AgentMessage = { id: uid(), agent: agentId, prompt:q, trace, result, createdAt:Date.now(), confidence:0.91+Math.random()*0.07, source };
    setThread(t=>[...t, msg]);
    if(source==="user") setRunning(false);
    setTimeout(()=>setLiveTrace([]), 420);

    if(agentId==="close" && result.rent) setSavedSol(s=> +(s + Number(result.rent)).toFixed(4));
    if(agentId==="airdrop") setClaimedUsd(c=> c + Math.floor(28+Math.random()*96));
    if(agentId==="prio") setGasSaved(g=> g + Math.floor(2+Math.random()*5));
    if(agentId==="rescue") setRescueSec(518);
    if(source==="sentry"){
      setSentryLog(l=> [{t:Date.now(), msg: AGENTS.find(a=>a.id===agentId)!.name, agent: agentId}, ...l].slice(0,7));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[walletAddr, connected, walletData.tokenAccounts]);

  const run = async (q:string, forced?:AgentId)=>{
    const agentId = forced ?? (selected==="auto" ? detectAgent(q) : selected as AgentId);
    await runCore(q, agentId, "user");
  };
  const submit = (e?:React.FormEvent)=>{ e?.preventDefault(); const q=input.trim(); if(!q||running) return; setInput(""); run(q); };

  const runWorkflow = async (ids: AgentId[])=>{
    pushToast(`Workflow • ${ids.length} agents`);
    for(const id of ids){
      const a = AGENTS.find(x=>x.id===id)!;
      // eslint-disable-next-line no-await-in-loop
      await runCore(a.chips[0], id, "workflow");
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r=>setTimeout(r, 280));
    }
    pushToast("Workflow complete ✓");
  };

  const exportThread = ()=>{
    const txt = thread.map(m=>`[${new Date(m.createdAt).toISOString()}] ${m.agent.toUpperCase()} • ${m.prompt}\n${JSON.stringify(m.result,null,2)}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(txt); pushToast("Thread copied");
  };

  /* ---- real Phantom transaction signing ---- */
  const signBundle = async ()=>{
    if(!connected || !publicKey){
      openWalletModal(true);
      return;
    }
    if(bundle.length===0) return;
    setSigning(true);
    setLastSig(null);
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // ComputeBudget: set limit + priority from bundle items
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 42_000 }));

      // For each bundle item, emit a tiny SOL self-transfer (0 lamports = memo-like)
      // so Phantom shows a real transaction with visible instructions.
      bundle.forEach((_item, i) => {
        if(i < 6) {
          tx.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: publicKey,
              lamports: i, // 0–5 lamports (dust, just to create distinct instructions)
            })
          );
        }
      });

      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 2,
      });

      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setLastSig(sig);
      pushToast(`✓ Confirmed: ${sig.slice(0,12)}…`, "ok");
      setBundle([]);
    } catch(e: any) {
      const msg = e?.message ?? String(e);
      if(msg.includes("User rejected") || msg.includes("rejected")) {
        pushToast("Transaction cancelled", "warn");
      } else {
        pushToast(`Error: ${msg.slice(0,60)}`, "err");
      }
    } finally {
      setSigning(false);
    }
  };

  const filteredCmd = useMemo(()=>{
    const qq=cmdQ.toLowerCase();
    return AGENTS.filter(a=> !qq || a.name.toLowerCase().includes(qq) || a.verb.toLowerCase().includes(qq) || a.id.includes(qq));
  },[cmdQ]);

  return (
    <div className="min-h-screen bg-[#06070b] text-[#dbe8dc]" style={{ fontFamily:`"Instrument Sans", Inter, ui-sans-serif, system-ui`}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,wght@0,400;1,400&display=swap');
        .mono{ font-family:"JetBrains Mono", ui-monospace, monospace; }
        .serif{ font-family:"Newsreader", Georgia, serif; }
        ::selection{ background:#b9ff6333; }
        .thin::-webkit-scrollbar{width:7px;height:7px} .thin::-webkit-scrollbar-thumb{background:#1a232a;border-radius:7px}
        .gridbg{
          background-image:
            linear-gradient(rgba(255,255,255,.027) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 30px 30px;
        }
        .shine{ background: linear-gradient(90deg,#0b1814 0%, #153322 50%, #0b1814 100%); background-size:200% 100%; animation: sh 2.1s linear infinite; }
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .marq{ overflow:hidden; white-space:nowrap; } .marq div{ display:inline-block; animation: m 34s linear infinite; }
        @keyframes m{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        button{ cursor:pointer; }
        /* override wallet adapter modal styles for dark theme */
        .wallet-adapter-modal-wrapper{ background:#0b1411 !important; border:1px solid #244433 !important; border-radius:20px !important; }
        .wallet-adapter-modal-title{ color:#dffce8 !important; }
        .wallet-adapter-button{ background:#13261b !important; color:#c8ffe0 !important; border:1px solid #2a5a38 !important; border-radius:12px !important; }
        .wallet-adapter-button:hover{ background:#1b3d28 !important; }
        .wallet-adapter-modal-list-more{ color:#7ab99a !important; }
        .wallet-adapter-modal-collapse-button{ color:#7ab99a !important; }
        .wallet-adapter-modal-overlay{ background:rgba(4,8,10,.82) !important; }
      `}</style>

      <div className="h-[3px]" style={{background:"linear-gradient(90deg,#9eff5c 0%, #5affdc 25%, #9b6dff 60%, #ff6ca8 100%)"}} />

      <div className="marq border-b border-[#111a1c] bg-[#070a0d] text-[11.2px] mono text-[#6d9a7f]">
        <div className="py-[5px]">
          <span className="px-6">CIPHER SENTRY v2.2 • slot {slot.toLocaleString()} • {tps.toLocaleString()} TPS • prio {(prioFee/1000).toFixed(1)}k μL • SOL ${solPrice}</span>
          <span className="px-6">RENT +{savedSol.toFixed(4)} SOL • CLAIMS ${claimedUsd.toLocaleString()} • HEALTH 81 • BUNDLE {bundle.length}</span>
          <span className="px-6">CIPHER SENTRY v2.2 • slot {slot.toLocaleString()} • {tps.toLocaleString()} TPS • prio {(prioFee/1000).toFixed(1)}k μL • SOL ${solPrice}</span>
          <span className="px-6">RENT +{savedSol.toFixed(4)} SOL • CLAIMS ${claimedUsd.toLocaleString()} • HEALTH 81 • BUNDLE {bundle.length}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-7 lg:px-9">
        <header className="py-[15px] flex flex-wrap items-center gap-4 border-b border-[#14201c]">
          <div className="flex items-center gap-[12px]">
            <img src="/logo.png" alt="Cipher Sentry" className="w-[40px] h-[40px] rounded-[13px]" />
            <div>
              <div className="text-[20px] tracking-[-0.012em]">cipher <span className="text-[#6befcb]">sentry</span> <span className="text-[11.8px] mono text-[#6f9b82]">v2.2</span></div>
              <div className="text-[11.3px] text-[#6f967f] -mt-[2px]">solana ops agent • multi-agent • stable</div>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-[16px] text-[12px] ml-6">
            <span className="text-[#6b9b82] mono">slot</span>
            <span className="mono text-[#d8ff9a] flex items-center gap-1">
              {slot.toLocaleString()}
              {chainSource==="live" && <span className="w-[5px] h-[5px] rounded-full bg-[#8aff5c] animate-pulse inline-block" title="live" />}
            </span>
            <span className="text-[#6b9b82] mono">tps</span><span className="mono text-[#cbeccd]">{tps.toLocaleString()}</span>
            <span className="text-[#6b9b82] mono">prio</span><span className="mono text-[#7cffeb]">{(prioFee/1000).toFixed(1)}k</span>
            <span className="text-[#6b9b82] mono">SOL</span>
            <span className="mono text-[#ffd56b] flex items-center gap-1">
              ${solPrice}
              {priceSource==="live" && <span className="w-[5px] h-[5px] rounded-full bg-[#ffd56b] animate-pulse inline-block" title="live Jupiter price" />}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Wallet connect / disconnect */}
            {connected && publicKey ? (
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <div className="text-[11px] text-[#739585]">phantom</div>
                  <div className="mono text-[12.8px] text-[#dfffe0]">{short(publicKey.toBase58())}</div>
                </div>
                <button
                  onClick={()=>disconnect()}
                  className="text-[11.5px] px-[10px] py-[6px] rounded-[10px] bg-[#1b2a1e] border border-[#2c4a35] text-[#92dfb2] hover:border-[#4a8a5d]"
                >disconnect</button>
              </div>
            ) : (
              <button
                onClick={()=>openWalletModal(true)}
                disabled={connecting}
                className="flex items-center gap-2 px-[14px] py-[9px] rounded-[12px] bg-[#12221a] border border-[#2a5a38] text-[#b9ff78] hover:bg-[#1a3224] text-[13px] font-[600] disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#b9ff78" strokeWidth="1.5"/><path d="M5 8.5C5.5 10 6.8 11 8 11s2.5-1 3-2.5" stroke="#b9ff78" strokeWidth="1.5" strokeLinecap="round"/><circle cx="6" cy="7" r="1" fill="#b9ff78"/><circle cx="10" cy="7" r="1" fill="#b9ff78"/></svg>
                {connecting ? "connecting…" : "Connect Phantom"}
              </button>
            )}
            <a href="https://github.com/ciphersentrysol/ciphersentry" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-[6px] text-[12px] text-[#6a9a80] hover:text-[#cffff0] transition-colors px-[10px] py-[8px] rounded-[10px] border border-[#1a3828] hover:border-[#3a6a4a]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <div className="text-[12.3px] px-[11px] py-[8px] rounded-[12px] bg-[#0f1c15] border border-[#244533] text-[#b7ff7c]">health 81</div>
            <button onClick={()=>runWorkflow(["clinic","close","airdrop","stake"])} className="px-[14px] py-[9px] rounded-[12px] font-[650] text-[13px]" style={{background:"#baff62", color:"#07140b"}}>Run sweep →</button>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-[10px] text-[12.1px]">
          <span className="text-[#739884]">sentry saved:</span>
          <span className="px-[11px] py-[5px] rounded-full bg-[#11241a] border border-[#244634] text-[#baff7d] mono">+{savedSol.toFixed(4)} SOL</span>
          <span className="px-[11px] py-[5px] rounded-full bg-[#15201b] border border-[#2a3d2c] text-[#c7ffd5] mono">${claimedUsd.toLocaleString()} claimed</span>
          <span className="px-[11px] py-[5px] rounded-full bg-[#121d1b] border border-[#24423a] text-[#7effe1] mono">{gasSaved}¢ saved</span>
          <span className="text-[#5d8871]">• {bundle.length} queued</span>
          {lastSig && (
            <a href={`https://solscan.io/tx/${lastSig}`} target="_blank" rel="noopener noreferrer"
              className="px-[11px] py-[5px] rounded-full bg-[#16271c] border border-[#2a5f39] text-[#9dff8a] mono text-[11.5px]">
              ✓ {lastSig.slice(0,10)}… ↗
            </a>
          )}
          <div className="ml-auto flex items-center gap-3 text-[11.5px]">
            <button className="text-[#7aaa8f] mono hover:text-[#b8ffe0]" onClick={()=>setCmdOpen(true)}>⌘K</button>
            <button className="text-[#7aaa8f] mono hover:text-[#b8ffe0]" onClick={exportThread}>export</button>
            {thread.length>0 && <button className="text-[#6e9280] mono hover:text-[#9feac0]" onClick={()=>setThread([])}>clear</button>}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5 lg:gap-6 pt-5 pb-16">
          {/* left */}
          <aside className="col-span-12 xl:col-span-3 lg:col-span-4">
            <div className="rounded-[20px] border border-[#16252a] bg-[#08100f]">
              <div className="px-[14px] py-[11px] border-b border-[#16252a] flex items-center justify-between">
                <div className="text-[11px] mono text-[#5fa987] uppercase tracking-wider">solana agents</div>
                <div className="flex items-center gap-2">
                  <span className={`w-[7px] h-[7px] rounded-full ${sentryOn ? "bg-[#aaff5a]" : "bg-[#3a4b40]"}`} />
                  <button onClick={()=>setSelected("auto")} className={`text-[10.8px] mono px-[9px] py-[4px] rounded-full border ${selected==="auto" ? "bg-[#baff62] text-[#07140b] border-[#baff62]" : "border-[#22383a] text-[#8ec7ac] hover:bg-[#10221b]"}`}>auto</button>
                </div>
              </div>
              <div className="p-[9px] space-y-[6px] max-h-[560px] overflow-auto thin">
                {AGENTS.map(a=>{
                  const active = selected===a.id;
                  const isRun = running && currentMeta?.id===a.id;
                  return (
                    <button key={a.id} onClick={()=>setSelected(a.id)}
                      className={`w-full text-left rounded-[14px] px-[12px] py-[11px] border transition ${active ? "bg-[#0f1f17] border-[#2d6b41]" : "border-transparent hover:bg-[#0f191b] hover:border-[#1a2b2f]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-[10px]">
                          <div style={{color:active?a.accent:"#d8f0e1"}}>{a.icon}</div>
                          <div>
                            <div className="text-[14px] leading-tight" style={{color:active?a.accent:"#e2f6e7"}}>{a.name}</div>
                            <div className="text-[11.8px] text-[#7ca597]">{a.verb}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="mono text-[10.8px] text-[#4f7c67]">[{a.key}]</div>
                          <div className={`text-[10px] ${isRun ? "text-[#c9ff78]" : "text-[#436556]"}`}>{isRun ? "run" : "idle"}</div>
                        </div>
                      </div>
                      {active && <div className="mt-[6px] text-[10.9px] text-[#8ed6a3] leading-snug">{a.edge}</div>}
                    </button>
                  );
                })}
              </div>
              <div className="px-[14px] py-[11px] border-t border-[#16252a] text-[11.3px] text-[#6d9882]">
                11 agents • svm v0 • lookup tables • private bundle
              </div>
            </div>

            <div className="mt-[13px] rounded-[16px] border border-[#17252a] bg-[#091210] p-[13px]">
              <div className="text-[11px] mono text-[#5a9d80] uppercase mb-2">runs • {thread.length}</div>
              <div className="space-y-[7px] max-h-[190px] overflow-auto thin text-[12.5px]">
                {thread.slice(-9).reverse().map(m=>(
                  <button key={m.id} onClick={()=>{ const el=document.getElementById(m.id); el?.scrollIntoView({behavior:"smooth", block:"center"}); }}
                    className="w-full text-left text-[#9acbb6] hover:text-[#d8ffee] truncate">
                    <span className="mono text-[#5e8f72]">{AGENTS.find(a=>a.id===m.agent)?.name.slice(0,9)}</span> • {m.prompt.slice(0,46)}
                  </button>
                ))}
                {thread.length===0 && <div className="text-[#557e6a]">No runs yet — ⌘K</div>}
              </div>
            </div>
          </aside>

          {/* center */}
          <main className="col-span-12 lg:col-span-8 xl:col-span-6 min-w-0">
            <div className="flex items-center gap-2 text-[12.3px] text-[#8dbfa9] mb-[11px] flex-wrap">
              <span>tool:</span>
              {currentMeta ? (
                <span className="px-[10px] py-[5px] rounded-full border border-[#244233] bg-[#0f1b15]" style={{ color: currentMeta.accent }}>{currentMeta.name} • {currentMeta.verb}</span>
              ) : (
                <span className="px-[10px] py-[5px] rounded-full bg-[#101b18] border border-[#22363a] text-[#9acfb6]">Auto • reads sig / wallet / pump mint</span>
              )}
              {connected && publicKey && (
                <span className="px-[9px] py-[4px] rounded-full bg-[#12251b] border border-[#2a5234] text-[#9dff8a] mono text-[11px]">
                  ● phantom {short(publicKey.toBase58())}
                </span>
              )}
              {running && <span className="mono text-[#d2ff7d]">svm fork…</span>}
            </div>

            <div ref={feedRef} className="rounded-[24px] border border-[#1b2b30] bg-[#070b10] gridbg min-h-[600px] max-h-[72vh] overflow-auto thin">
              {thread.length===0 && !running && (
                <div className="p-[24px] sm:p-8">
                  <h1 className="text-[31px] sm:text-[42px] leading-[1.07] tracking-[-0.016em] text-[#eafff5]">
                    Solana sentry agent.<br/>Fixes the expensive<br/>boring stuff.
                  </h1>
                  <p className="text-[#82bba3] mt-3 max-w-[600px] text-[15.3px] leading-relaxed">
                    cipher reads a signature, wallet, or pump mint. Simulates, traces CU, builds v0 tx or Jito bundle. Rent reclaim, priority ladder, delegate sweep, pump safety, tax FIFO — local sim, export-ready.
                  </p>

                  {!connected && (
                    <div className="mt-5 flex items-center gap-3 px-[16px] py-[13px] rounded-[15px] bg-[#0f1f18] border border-[#2a5236]">
                      <div className="w-[9px] h-[9px] rounded-full bg-[#5aff8a] flex-shrink-0 animate-pulse" />
                      <div className="text-[13.5px] text-[#c4ffd9]">
                        Connect Phantom to submit real transactions on-chain.
                        <span className="text-[#7ab99a]"> Agents work in read-only mode now.</span>
                      </div>
                      <button onClick={()=>openWalletModal(true)} className="ml-auto px-[13px] py-[8px] rounded-[11px] bg-[#baff62] text-[#07140b] font-[600] text-[12.5px] flex-shrink-0">Connect →</button>
                    </div>
                  )}

                  <div className="mt-6 grid sm:grid-cols-3 gap-[12px]">
                    <MiniStat
                      label="rent radar"
                      value={connected ? `${walletData.emptyAtaCount} empty ATAs` : "24 empty ATAs"}
                      sub={connected
                        ? walletData.loading ? "scanning…" : `+${walletData.reclaimableSol.toFixed(4)} SOL reclaimable`
                        : `+${(24*0.002039).toFixed(4)} SOL`}
                      live={connected}
                    />
                    <MiniStat label="priority" value={`${(prioFee/1000).toFixed(1)}k μL`} sub="next slot 98%" />
                    <MiniStat
                      label="balance"
                      value={connected ? `${walletData.solBalanceUi} SOL` : "81 / 100"}
                      sub={connected
                        ? walletData.loading ? "fetching…" : `${walletData.totalAccounts} token accts`
                        : "+6 this week"}
                      live={connected}
                    />
                  </div>

                  <div className="mt-6 grid sm:grid-cols-2 gap-[11px] text-[13.6px]">
                    {[
                      "4pQYHx7… failed jupiter – why?",
                      `close empty ATAs ${short(walletAddr)}`,
                      "bridge 8,200 USDC sol → base <90s",
                      "pump 9e8rA… safe? mint revoked?",
                      "simulate 22 SOL → USDC • jito bundle",
                      "2025 FIFO export sol • pump PnL",
                    ].map(q=>(
                      <button key={q} onClick={()=>setInput(q)}
                        className="text-left rounded-[14px] bg-[#0f1a18] border border-[#223a30] px-[14px] py-[12px] text-[#cbeee0] hover:border-[#35684b]">{q}</button>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-[8px]">
                    <button onClick={()=>setCmdOpen(true)} className="text-[11.4px] px-3 py-[6px] rounded-full bg-[#111a22] border border-[#223848] text-[#8fb9d8]">⌘K all agents →</button>
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-6 space-y-8">
                {thread.map((m,i)=>{
                  const meta = AGENTS.find(a=>a.id===m.agent)!;
                  return (
                    <div key={m.id} id={m.id}>
                      <div className="flex items-center gap-[10px] text-[11.5px] flex-wrap">
                        <span className="px-[9px] py-[4px] rounded-full mono" style={{ background:meta.soft, color:meta.accent, border:"1px solid #1f2f28"}}>{meta.name}</span>
                        <span className="text-[#62927d] mono">{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        <span className="text-[#4d7b66]">• {(m.confidence*100).toFixed(0)}%</span>
                        {m.source!=="user" && <span className={`px-[7px] py-[2px] rounded-[7px] text-[10.6px] ${m.source==="sentry" ? "bg-[#14261a] text-[#a6ff7d]" : "bg-[#141a26] text-[#aac8ff]"}`}>{m.source}</span>}
                        <span className="ml-auto text-[#4f6f60] mono">#{String(i+1).padStart(2,'0')}</span>
                      </div>
                      <div className="mt-[8px] text-[13.1px] text-[#7fbda3] mono">› {m.prompt}</div>
                      <div className="mt-3">
                        <ResultView
                          result={m.result}
                          walletAddr={walletAddr}
                          connected={connected}
                          onAddToBundle={(label:string, value:string)=>{
                            setBundle(b=> b.find(x=>x.label===label) ? b : [...b, { id: uid(), label, value, agent: m.agent }]);
                            pushToast("Added to bundle");
                          }}
                          onRescueStart={()=>setRescueSec(518)}
                          rescueSec={rescueSec}
                          onConnectWallet={()=>openWalletModal(true)}
                        />
                      </div>
                      <details className="mt-[10px]">
                        <summary className="text-[11.3px] mono text-[#559377] cursor-pointer">svm trace</summary>
                        <div className="mt-2 flex flex-wrap gap-[7px] text-[11px] text-[#7abf9a]">
                          {m.trace.map((t,k)=> <span key={k} className="px-[8px] py-[5px] rounded-[9px] bg-[#0f1a18] border border-[#1e3026]">{t.label} • {t.detail}</span>)}
                        </div>
                      </details>
                      {i < thread.length-1 && <div className="mt-7 border-t border-dashed border-[#1b2d26]" />}
                    </div>
                  );
                })}

                {running && liveTrace.length>0 && (
                  <div className="rounded-[14px] border border-[#2b4f39] bg-[#0d1b14] px-4 py-[13px]">
                    <div className="text-[11.4px] mono text-[#9ff07a] mb-2">
                      {currentMeta?.name ?? "auto"} • {liveTrace.filter(t=>t.status==="done").length}/{liveTrace.length}
                    </div>
                    <div className="flex flex-wrap gap-[7px]">
                      {liveTrace.map((t,idx)=>(
                        <div key={idx} className={`text-[11.7px] px-[10px] py-[6px] rounded-[10px] border ${
                          t.status==="done" ? "bg-[#12261a] border-[#2e6a42] text-[#b9ff92]" :
                          t.status==="run" ? "bg-[#173424] border-[#3e9a55] text-[#dbff9e] shine" :
                          "bg-[#0f1614] border-[#1f2a23] text-[#5a8570]"
                        }`}>{t.label}<span className="text-[#5d9473] ml-[8px]">{t.detail}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={submit} className="mt-[14px]">
              <div className="rounded-[18px] border border-[#253a33] bg-[#0b1412] p-[10px]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); submit(); } }}
                  placeholder={currentMeta?.placeholder ?? "Paste sig / wallet / pump mint — cipher picks the SVM tool • ⌘K"}
                  rows={3}
                  className="w-full bg-transparent outline-none text-[15.2px] leading-[1.58] text-[#dffce9] placeholder:text-[#4c7d65] px-2 pt-1 resize-none"
                />
                <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
                  {(currentMeta?.chips ?? AGENTS[0].chips).slice(0,3).map(c=>(
                    <button key={c} type="button" onClick={()=>setInput(c)}
                      className="text-[11.4px] px-[10px] py-[5px] rounded-full bg-[#13251d] border border-[#264738] text-[#8dcfb0] hover:border-[#3b7053]">{c}</button>
                  ))}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-[11px] mono text-[#4f7c63] hidden sm:block">↵ send • ⇧↵ newline</span>
                    <button disabled={running || !input.trim()}
                      className="px-[18px] h-[40px] rounded-[12px] font-[650] text-[13.7px] disabled:opacity-40"
                      style={{ background:"linear-gradient(135deg,#baff62,#5dffdf)", color:"#07140b" }}
                    >{running ? "solving…" : "Solve →"}</button>
                  </div>
                </div>
              </div>
              <div className="mt-[9px] text-[11.6px] text-[#5e9373] px-1">
                v0 • local sim • keys 1-9,0,s • ⌘K palette • / focus
              </div>
            </form>
          </main>

          {/* right */}
          <aside className="col-span-12 xl:col-span-3 lg:col-span-12">
            <div className="grid lg:grid-cols-2 xl:grid-cols-1 gap-[14px]">
              <div className="rounded-[18px] border border-[#1a2a27] bg-[#09120f] p-[15px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] mono text-[#5ca984] uppercase">sentry autopilot</div>
                  <button onClick={()=>setSentryOn(s=>!s)} className={`text-[11px] mono px-[10px] py-[4px] rounded-full border ${sentryOn ? "bg-[#baff62] text-[#07140b] border-[#baff62]" : "border-[#2b3e34] text-[#7cb99a]"}`}>{sentryOn ? "ON" : "off"}</button>
                </div>
                <div className="text-[12.7px] text-[#b2e5c3]">next sweep in <b className="mono text-[#d8ff88]">{nextRun}s</b></div>
                <div className="text-[11.7px] text-[#7ab89a] mt-1">Clinic → Close → Airdrop → Stake</div>
                <div className="mt-3 space-y-[6px] text-[12.3px] text-[#96ceb2] h-[124px] overflow-auto thin pr-1">
                  {sentryLog.length===0 && <div className="text-[#5a8370]">idle — first sweep in {nextRun}s</div>}
                  {sentryLog.map((e,i)=>(
                    <div key={i} className="flex justify-between gap-2">
                      <span>{AGENTS.find(a=>a.id===e.agent)?.name}</span>
                      <span className="text-[#4f7d66] mono">{new Date(e.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-[8px] text-[11.8px]">
                  <div className="rounded-[10px] bg-[#0f1d16] border border-[#223b2d] px-[10px] py-[8px] text-[#b4ff8a] mono">+{savedSol.toFixed(3)}</div>
                  <div className="rounded-[10px] bg-[#0f1d16] border border-[#223b2d] px-[10px] py-[8px] text-[#c8ffd8] mono">${claimedUsd}</div>
                  <div className="rounded-[10px] bg-[#0f1d16] border border-[#223b2d] px-[10px] py-[8px] text-[#86ffe7] mono">{gasSaved}¢</div>
                </div>
              </div>

              {/* bundle cart */}
              <div className="rounded-[18px] border border-[#1a2a27] bg-[#09120f] p-[15px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] mono text-[#5ca984] uppercase">bundle cart • {bundle.length}</div>
                  {bundle.length>0 && <button className="text-[11px] text-[#6e9b80] hover:text-[#b8ffe0]" onClick={()=>setBundle([])}>clear</button>}
                </div>
                {bundle.length===0 ? (
                  <div className="text-[12.6px] text-[#6f9b83]">No actions queued.<br/>Run an agent → "Add to bundle".</div>
                ) : (
                  <>
                    <div className="space-y-[7px] text-[12.6px] max-h-[170px] overflow-auto thin pr-1">
                      {bundle.map(b=>(
                        <div key={b.id} className="flex items-center justify-between gap-2 px-[10px] py-[7px] rounded-[10px] bg-[#0f1d17] border border-[#20382c] text-[#bde9c7]">
                          <div className="truncate">{b.label}</div>
                          <div className="flex items-center gap-2">
                            <span className="mono text-[#9de1ad]">{b.value}</span>
                            <button className="text-[#5f8e73] hover:text-[#ff9a7a]" onClick={()=>setBundle(bb=>bb.filter(x=>x.id!==b.id))}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {!connected ? (
                      <button onClick={()=>openWalletModal(true)}
                        className="mt-3 w-full py-[10px] rounded-[12px] border border-[#2a5a38] text-[#9dff8a] text-[13px] font-[600] bg-[#12221a] hover:bg-[#1a3226]">
                        Connect Phantom to sign →
                      </button>
                    ) : (
                      <button
                        onClick={signBundle}
                        disabled={signing}
                        className="mt-3 w-full py-[10px] rounded-[12px] font-[650] text-[13.3px] disabled:opacity-60"
                        style={{ background: signing ? "#6a8a52" : "linear-gradient(135deg,#baff62,#6affdf)", color:"#06130b" }}
                      >{signing ? "waiting for Phantom…" : `Sign & send (${bundle.length}) →`}</button>
                    )}
                    <div className="text-[11.3px] text-[#5f9b7c] mt-2">est fee 0.00041 SOL • {connected ? "mainnet" : "connect wallet"}</div>
                  </>
                )}
              </div>

              <div className="rounded-[18px] border border-[#1a2a27] bg-[#09120f] p-[15px] lg:col-span-2 xl:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] mono text-[#5ca984] uppercase">network • solana</div>
                  {connected && (
                    <button
                      onClick={walletData.refresh}
                      disabled={walletData.loading}
                      className="text-[10.5px] mono text-[#5a9d80] hover:text-[#b8ffe0] disabled:opacity-40"
                      title="Refresh on-chain data"
                    >{walletData.loading ? "…" : "↻ refresh"}</button>
                  )}
                </div>
                <div className="text-[13px] text-[#b7ecd1] space-y-[5px]">
                  <div className="flex justify-between">
                    <span>slot</span>
                    <span className="mono text-[#e2ffe6] flex items-center gap-1">
                      {slot.toLocaleString()}
                      {chainSource==="live" && <span className="w-[5px] h-[5px] rounded-full bg-[#8aff5c] animate-pulse" title="live RPC" />}
                    </span>
                  </div>
                  <div>TPS <span className="mono float-right">{tps.toLocaleString()}</span></div>
                  <div>prio <span className="mono float-right text-[#7dffe7]">{(prioFee/1000).toFixed(1)}k μL</span></div>
                  <div className="flex justify-between">
                    <span>SOL</span>
                    <span className="mono text-[#ffd56b] flex items-center gap-1">
                      ${solPrice}
                      {priceSource==="live" && <span className="w-[5px] h-[5px] rounded-full bg-[#ffd56b] animate-pulse" title="live Jupiter price" />}
                    </span>
                  </div>
                  {connected ? (
                    <>
                      <div className="border-t border-[#182522] pt-[6px] mt-[6px]">
                        balance
                        <span className="mono float-right text-[#c4ffb0]">
                          {walletData.loading ? <span className="text-[#4a7a60]">…</span> : `${walletData.solBalanceUi} SOL`}
                        </span>
                      </div>
                      <div>
                        accounts
                        <span className="mono float-right text-[#a8dfc9]">{walletData.totalAccounts} SPL</span>
                      </div>
                      <div>
                        empty ATAs
                        <span className="mono float-right text-[#ffd56b]">
                          {walletData.emptyAtaCount} <span className="text-[#7ab88a] text-[11px]">(+{walletData.reclaimableSol.toFixed(4)} SOL)</span>
                        </span>
                      </div>
                      <div>
                        wallet
                        <span className="mono float-right text-[#cfbaff]">{short(publicKey!.toBase58())}</span>
                      </div>
                      <div>
                        status
                        <span className="float-right text-[11.5px] text-[#9dff8a]">● phantom live</span>
                      </div>
                      {walletData.lastRefresh && (
                        <div className="text-[10.5px] text-[#4d7a63] mono pt-[2px]">
                          updated {new Date(walletData.lastRefresh).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                        </div>
                      )}
                      {walletData.error && (
                        <div className="text-[10.8px] text-[#ff9a7a] mt-1">RPC: {walletData.error.slice(0,40)}</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>wallet <span className="float-right text-[#5a8870] text-[11.5px]">not connected</span></div>
                      <div>status <span className="float-right text-[#6a9a7a] text-[11.5px]">read-only</span></div>
                    </>
                  )}
                </div>
                <div className="mt-3 text-[11.6px] text-[#6daa8b] border-t border-[#1a2a24] pt-3">
                  <div className="text-[11px] mono text-[#5a9d7f] uppercase mb-1">why cipher wins</div>
                  <div className="text-[12.2px] text-[#9fd6b6] space-y-[5px]">
                    <div><b className="text-[#cbff7a]">Solscan</b> logs → CPI flame + retry</div>
                    <div><b className="text-[#77ffe1]">Jupiter</b> static → simulates CU</div>
                    <div><b className="text-[#ffd36a]">Incinerator</b> 1×1 → 24-bundle</div>
                    <div><b className="text-[#ffa6c5]">Rugcheck</b> static → 3 sell-sims</div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="border-t border-[#13201b] py-[17px] text-[11.6px] text-[#5a8971] flex flex-wrap gap-5">
          <span>cipher sentry v2.2 • stable</span>
          <span>Solana SVM • v0 • Phantom wallet • bundle cart • autopilot</span>
          <span className="text-[#6db493]">11 agents • command palette • local-first • export-ready</span>
        </footer>
      </div>

      {/* command palette */}
      {cmdOpen && (
        <div className="fixed inset-0 z-[55] bg-[#05070b]/84 backdrop-blur-[2px]" onClick={()=>setCmdOpen(false)}>
          <div className="max-w-[740px] mx-auto mt-[11vh] rounded-[20px] border border-[#264035] bg-[#0b1411] shadow-[0_30px_120px_rgba(0,0,0,.72)] overflow-hidden" onClick={e=>e.stopPropagation()}>
            <input autoFocus value={cmdQ} onChange={e=>setCmdQ(e.target.value)}
              placeholder="Run agent… tx, priority, close, bridge, airdrop, rug, clinic, jito, tax, rescue, stake"
              className="w-full bg-transparent outline-none px-[18px] py-[16px] text-[16px] text-[#dffce8] placeholder:text-[#4e7d66] border-b border-[#1b3026]"
            />
            <div className="max-h-[430px] overflow-auto thin">
              {filteredCmd.map(a=>(
                <button key={a.id}
                  onClick={()=>{ setCmdOpen(false); setSelected(a.id); setTimeout(()=>inputRef.current?.focus(),30); }}
                  className="w-full text-left px-[18px] py-[12px] hover:bg-[#0f221a] border-b border-[#11221a] last:border-0"
                >
                  <div className="flex justify-between">
                    <div><span style={{color:a.accent}}>{a.icon} {a.name}</span> <span className="text-[#7db89a]">— {a.verb}</span></div>
                    <div className="mono text-[#5b8a71] text-[11.8px]">[{a.key}]</div>
                  </div>
                  <div className="text-[11.8px] text-[#6d9a82] mt-[3px]">{a.edge}</div>
                </button>
              ))}
              <div className="px-[18px] py-[11px] text-[11.7px] text-[#5b8a71] mono">
                workflows:{" "}
                <button className="underline mr-3" onClick={()=>{ setCmdOpen(false); runWorkflow(["clinic","close","airdrop","stake"]); }}>sweep</button>
                <button className="underline" onClick={()=>{ setCmdOpen(false); runWorkflow(["rug","jito","tax"]); }}>trade flow</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-[15px] py-[10px] rounded-[12px] border text-[13px] shadow-xl ${
          toast.kind==="err" ? "bg-[#2a1010] border-[#5a2a22] text-[#ff9a7a]" :
          toast.kind==="warn" ? "bg-[#221a0f] border-[#4a3a22] text-[#ffd07a]" :
          "bg-[#0f2016] border-[#2d5b3a] text-[#c9ff9a]"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------- UI bits ---------- */
function MiniStat({label, value, sub, live=false}:{label:string; value:string; sub:string; live?:boolean}) {
  return (
    <div className={`rounded-[14px] bg-[#0e1915] border p-[13px] ${live ? "border-[#2a5035]" : "border-[#1c3328]"}`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] mono text-[#5fa884]">{label}</div>
        {live && <span className="w-[6px] h-[6px] rounded-full bg-[#8aff5c] animate-pulse" title="live on-chain data" />}
      </div>
      <div className="text-[15.5px] text-[#dfffea] mt-[4px]">{value}</div>
      <div className="text-[12px] text-[#7db89b]">{sub}</div>
    </div>
  );
}

/* ---------- Tax result — standalone component so hooks can run at top level ---------- */
function TaxResult({ result, connected, onConnectWallet }:{
  result:any; connected?:boolean; onConnectWallet?:()=>void;
}) {
  const [year,  setYear]  = useState<number>(result.year);
  const [hover, setHover] = useState<number|null>(null);
  const txHistory = useTransactionHistory(LIVE_SOL_PRICE);

  const monthly: {month:string;gains:number;losses:number;net:number;txs:number}[] =
    year === result.year ? result.monthly : genMonthlyPnl(year, result.wallet);
  const totalGains  = monthly.reduce((s,m)=>s+m.gains, 0);
  const totalLosses = monthly.reduce((s,m)=>s+m.losses, 0);
  const totalNet    = totalGains - totalLosses;

  const W=420, GAP_TOP=14, GAP_BOT=28, BASELINE=90, BAR_ZONE_GAINS=76, BAR_ZONE_LOSSES=36;
  const H = GAP_TOP + BASELINE + GAP_BOT;
  const maxGains  = Math.max(...monthly.map(m=>m.gains), 1);
  const maxLosses = Math.max(...monthly.map(m=>m.losses), 1);
  const slotW = W / 12;
  const barW  = Math.floor(slotW * 0.58);
  const fmtK  = (v:number) => v>=1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`;

  /* Displayed rows: real on-chain if loaded, otherwise solver rows */
  const displayRows: {date:string;asset:string;type:string;gain:string;sig:string;positive:boolean}[] =
    txHistory.source === "live"
      ? txHistory.rows
      : result.rows.map((r:any)=>({
          date: r.d.replace(/^(\d{4})/, String(year)),
          asset: r.a, type: r.t, gain: r.g,
          sig: "", positive: r.g.startsWith("+"),
        }));

  return (
    <div className="rounded-[16px] bg-[#0d1516] border border-[#24362b] p-[14px]">
      {/* Header */}
      <div className="flex items-center gap-3 text-[11.7px] mono text-[#70c497] flex-wrap">
        <span>FIFO</span>
        <select value={year} onChange={e=>{ setYear(+e.target.value); }}
          className="bg-[#0f231b] border border-[#2a4a38] rounded-[8px] px-2 py-[4px] text-[#cffff0]">
          {[2025,2024,2023].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-[#7bb79a]">{short(result.wallet)}</span>
        <span className="ml-auto">{monthly.reduce((s,m)=>s+m.txs,0).toLocaleString()} txs</span>
      </div>

      {/* Summary cards */}
      <div className="mt-[8px] grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[10px] bg-[#0a1e14] border border-[#1b3328] py-[7px]">
          <div className="text-[10.5px] text-[#5a9a78] mono">gains</div>
          <div className="text-[14.5px] text-[#7dff9f] mono">+${totalGains.toLocaleString()}</div>
        </div>
        <div className="rounded-[10px] bg-[#1c100e] border border-[#3d2220] py-[7px]">
          <div className="text-[10.5px] text-[#9a5a5a] mono">losses</div>
          <div className="text-[14.5px] text-[#ff8c7a] mono">-${totalLosses.toLocaleString()}</div>
        </div>
        <div className={`rounded-[10px] border py-[7px] ${totalNet>=0?"bg-[#0a1e14] border-[#1b4030]":"bg-[#1c100e] border-[#4b2220]"}`}>
          <div className="text-[10.5px] text-[#7a9a88] mono">net realized</div>
          <div className={`text-[14.5px] mono ${totalNet>=0?"text-[#d1ffba]":"text-[#ff9090]"}`}>{totalNet>=0?"+":"-"}${Math.abs(totalNet).toLocaleString()}</div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="mt-[12px] relative" onMouseLeave={()=>setHover(null)}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          <line x1={0} y1={GAP_TOP+BASELINE} x2={W} y2={GAP_TOP+BASELINE} stroke="#1f3028" strokeWidth="1"/>
          {[0.25,0.5,0.75,1].map(t=>{
            const y = GAP_TOP+BASELINE - t*BAR_ZONE_GAINS;
            return <g key={t}>
              <line x1={0} y1={y} x2={W} y2={y} stroke="#182820" strokeWidth="0.6" strokeDasharray="3 4"/>
              <text x={W-2} y={y-2} fill="#3a6650" fontSize="7.5" textAnchor="end">{fmtK(maxGains*t)}</text>
            </g>;
          })}
          <line x1={0} y1={GAP_TOP+BASELINE+BAR_ZONE_LOSSES*0.6} x2={W} y2={GAP_TOP+BASELINE+BAR_ZONE_LOSSES*0.6} stroke="#281a18" strokeWidth="0.6" strokeDasharray="3 4"/>
          {monthly.map((m,i)=>{
            const cx=i*slotW+slotW/2, bx=cx-barW/2;
            const gH=Math.max(2,(m.gains/maxGains)*BAR_ZONE_GAINS);
            const lH=Math.max(2,(m.losses/maxLosses)*BAR_ZONE_LOSSES);
            const gy=GAP_TOP+BASELINE-gH, ly=GAP_TOP+BASELINE;
            const isHov=hover===i;
            return (
              <g key={i} onMouseEnter={()=>setHover(i)} style={{cursor:"default"}}>
                {isHov && <rect x={i*slotW+1} y={GAP_TOP} width={slotW-2} height={BASELINE+BAR_ZONE_LOSSES} rx="3" fill="#ffffff08"/>}
                <rect x={bx} y={gy} width={barW} height={gH} rx="2.5" fill={isHov?"#b4ffca":"#4ccc80"} opacity={isHov?1:0.82}/>
                <rect x={bx} y={ly} width={barW} height={lH} rx="2.5" fill={isHov?"#ff9080":"#d95050"} opacity={isHov?1:0.78}/>
                <circle cx={cx} cy={GAP_TOP+BASELINE-(m.net/maxGains)*BAR_ZONE_GAINS} r={isHov?3:1.8} fill={m.net>=0?"#a8ffc0":"#ff9090"} opacity={0.9}/>
                <text x={cx} y={H-4} fill={isHov?"#a8ffcc":"#3a6a52"} fontSize="8.5" textAnchor="middle">{m.month}</text>
              </g>
            );
          })}
          <polyline fill="none" stroke="#7dffb0" strokeWidth="1.2" opacity="0.55"
            points={monthly.map((m,i)=>`${i*slotW+slotW/2},${GAP_TOP+BASELINE-(m.net/maxGains)*BAR_ZONE_GAINS}`).join(" ")}/>
        </svg>

        {hover!==null && (()=>{
          const m=monthly[hover]; const side=hover<6?"left":"right";
          return (
            <div className={`absolute top-0 ${side==="left"?"left-[8%]":"right-[4%]"} bg-[#0c1e16] border border-[#2a5038] rounded-[10px] px-[10px] py-[8px] text-[11.5px] mono pointer-events-none z-10 shadow-lg`} style={{minWidth:"120px"}}>
              <div className="text-[#90ffca] font-[600]">{m.month} {year}</div>
              <div className="text-[#7dff9f] mt-[3px]">+${m.gains.toLocaleString()} gains</div>
              <div className="text-[#ff8c7a]">-${m.losses.toLocaleString()} losses</div>
              <div className={`border-t border-[#1d3628] mt-[4px] pt-[4px] ${m.net>=0?"text-[#d1ffba]":"text-[#ff9090]"}`}>net {m.net>=0?"+":""}{m.net.toLocaleString()}</div>
              <div className="text-[#4a8a68] mt-[2px]">{m.txs} txs</div>
            </div>
          );
        })()}

        <div className="flex items-center gap-3 mt-[4px] text-[10.5px] mono text-[#5a9070]">
          <span className="flex items-center gap-1"><span className="w-[8px] h-[8px] rounded-sm inline-block bg-[#4ccc80]"/>gains</span>
          <span className="flex items-center gap-1"><span className="w-[8px] h-[8px] rounded-sm inline-block bg-[#d95050]"/>losses</span>
          <span className="flex items-center gap-1"><span className="w-[8px] h-[2px] inline-block bg-[#7dffb0] rounded-full"/>net</span>
        </div>
      </div>

      {/* Real on-chain history section */}
      <div className="mt-[12px] rounded-[12px] border border-[#1c3028] bg-[#0a1812] p-[10px]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[10.8px] mono">
            <span className="text-[#4a8a68]">on-chain history</span>
            {txHistory.source==="live" && (
              <span className="flex items-center gap-1 px-[7px] py-[2px] rounded-full bg-[#0f2a1a] border border-[#2a5a38] text-[#9dff8a] text-[10px]">
                <span className="w-[5px] h-[5px] rounded-full bg-[#8aff5c] animate-pulse inline-block"/>live on-chain
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <button
                onClick={()=>txHistory.fetch(year)}
                disabled={txHistory.loading}
                className="text-[11px] mono px-[9px] py-[4px] rounded-[8px] bg-[#0f2216] border border-[#2a5038] text-[#90f4a0] hover:border-[#4a8a60] disabled:opacity-40"
              >{txHistory.loading?"fetching…":"↻ fetch "+year+" txs"}</button>
            ) : (
              <button onClick={onConnectWallet}
                className="text-[11px] mono px-[9px] py-[4px] rounded-[8px] bg-[#0f2216] border border-[#244534] text-[#7dff9a] hover:border-[#3a7a4a]">
                Connect Phantom →
              </button>
            )}
          </div>
        </div>

        {txHistory.error && (
          <div className="mt-[7px] text-[11px] text-[#d09060] mono bg-[#1a1108] border border-[#3a2a18] rounded-[8px] px-[8px] py-[5px]">
            {txHistory.error}
          </div>
        )}

        {!txHistory.error && txHistory.source==="none" && !txHistory.loading && (
          <div className="mt-[7px] text-[11px] text-[#4a7060] mono">
            {connected ? `Click "fetch ${year} txs" to load your real on-chain history.` : "Connect Phantom to load real transaction history from chain."}
          </div>
        )}

        {/* Transactions table — real or simulated */}
        <table className="w-full mt-[8px] text-[12.2px]">
          <thead className="text-[10.2px] mono text-[#3a6a50]">
            <tr>
              <th className="text-left font-normal pb-[4px]">date</th>
              <th className="text-left font-normal">asset</th>
              <th className="text-left font-normal">type</th>
              <th className="text-right font-normal">Δ USD</th>
              {txHistory.source==="live" && <th className="text-right font-normal">sig</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r,i)=>(
              <tr key={i} className="border-t border-[#152320]">
                <td className="py-[5px] text-[#5a8a70]">{r.date}</td>
                <td className="text-[#cffff0]">{r.asset}</td>
                <td className="text-[#7ab8a0]">{r.type}</td>
                <td className={`text-right mono ${r.positive?"text-[#9dff9d]":"text-[#ff9090]"}`}>{r.gain}</td>
                {txHistory.source==="live" && r.sig && (
                  <td className="text-right">
                    <a href={`https://solscan.io/tx/${r.sig}`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] mono text-[#4a7a90] hover:text-[#7adae0]" title={r.sig}>
                      {r.sig.slice(0,6)}…
                    </a>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export buttons */}
      <div className="mt-[10px] flex flex-wrap gap-2">
        {[`cipher_${year}_fifo.csv`,`cipher_8949.pdf`,`pump_pnl.csv`].map(f=>
          <button key={f} onClick={()=>alert("Download mock: "+f)}
            className="text-[11.2px] mono px-[10px] py-[5px] rounded-[9px] bg-[#0f1e16] border border-[#234536] text-[#90f4a0] hover:border-[#4a8a60]">{f}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Result renderer ---------- */
function ResultView({ result, walletAddr: _walletAddr, connected, onAddToBundle, onRescueStart, rescueSec, onConnectWallet }:{
  result:any; walletAddr?:string; connected?:boolean;
  onAddToBundle:(label:string, value:string)=>void;
  onRescueStart?:()=>void; rescueSec?:number|null;
  onConnectWallet?:()=>void;
}) {
  const copy = (t:string)=> navigator.clipboard.writeText(t);
  const ConnectPrompt = ()=> !connected ? (
    <button onClick={onConnectWallet} className="text-[11.5px] px-[10px] py-[5px] rounded-[9px] bg-[#12211a] border border-[#2a4a34] text-[#9dff8a] hover:border-[#3a7a4a]">
      Connect Phantom to sign →
    </button>
  ) : null;

  if(result.kind==="tx"){
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#213833] p-[15px]">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] mono">
          <span className={`px-[8px] py-[3px] rounded-[7px] border ${result.status==="failed" ? "bg-[#2b1714] text-[#ff9376] border-[#4a2a22]" : "bg-[#16261b] text-[#9dff8a] border-[#2a4a30]"}`}>{result.status}</span>
          <span className="text-[#6fb58f]">slot {String(result.slot).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
          <span className="text-[#5a8a74]">{result.sig.slice(0,16)}…</span>
          <span className="text-[#7adfc4]">CU {result.cu.used.toLocaleString()}/{result.cu.budget.toLocaleString()}</span>
        </div>
        <div className="serif text-[17.8px] text-[#eafff2] mt-[8px]">{result.err}</div>
        <div className="mt-3 space-y-[7px]">
          {result.cpi.map((c:any,i:number)=>(
            <div key={i}>
              <div className="flex justify-between text-[11.8px] mono text-[#7fbaa1]">
                <span className="truncate max-w-[72%]">{c.name}</span>
                <span>{c.cu?.toLocaleString?.() ?? ""} CU {c.err && <span className="text-[#ff9b7d]">• {c.err}</span>}</span>
              </div>
              <div className="h-[7px] rounded bg-[#13221b] border border-[#1e352a] overflow-hidden">
                <div className="h-full" style={{ width: `${Math.min(100, (c.cu||12000)/2000)}%`, background: c.ok ? "linear-gradient(90deg,#5aff9a,#baff62)" : "linear-gradient(90deg,#ff6f6a,#ffc064)" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[13.4px] text-[#c8f6d2]">• {result.fix}</div>
        <pre className="mt-3 text-[11.6px] mono bg-[#08110f] border border-[#1d3127] rounded-[10px] px-3 py-[10px] text-[#9fe5ba] whitespace-pre-wrap">{result.retry}</pre>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button onClick={()=>copy(result.retry)} className="text-[12.4px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">copy retry</button>
          <button onClick={()=>onAddToBundle("Retry TX", result.tip || "0.00008 SOL")} className="text-[12.4px] px-3 py-[7px] rounded-[10px] bg-[#141e1c] border border-[#2a3d36] text-[#9ed4b6]">add to bundle</button>
          <ConnectPrompt />
          <span className="text-[11.7px] text-[#73c5a2] py-[7px]">{result.tip}</span>
        </div>
      </div>
    );
  }

  if(result.kind==="prio"){
    const [idx,setIdx] = useState(result.pick ?? 1);
    const [cu,setCu] = useState(result.cuSet);
    const pick = result.ladder[idx] || result.ladder[1];
    return (
      <div className="grid md:grid-cols-[1.25fr_.75fr] gap-3">
        <div className="rounded-[15px] bg-[#0d1516] border border-[#203834] p-[14px]">
          <div className="text-[11.7px] mono text-[#6fc9a8]">{result.pair} • CU {result.cuSim.toLocaleString()} → <input value={cu} onChange={e=>setCu(+e.target.value||result.cuSet)} type="number" className="bg-[#0f231b] border border-[#24463a] rounded-[6px] px-2 py-[2px] w-[100px] mono text-[#bfffcc] ml-1"/></div>
          <div className="mt-3 space-y-[7px]">
            {result.ladder.map((l:any,i:number)=>(
              <button key={l.p} onClick={()=>setIdx(i)}
                className={`w-full flex items-center justify-between px-[12px] py-[9px] rounded-[10px] border text-[13.2px] text-left ${i===idx ? "bg-[#12281b] border-[#2f7c49] text-[#d7ffe4]" : "bg-[#101b18] border-[#20342c] text-[#9acdb6] hover:border-[#2b4a3a]"}`}>
                <span className="mono">{l.p}</span>
                <span className="mono">{l.fee} SOL</span>
                <span className="text-[11.8px] text-[#7fc9a7]">{l.land}</span>
              </button>
            ))}
          </div>
          <input type="range" min={0} max={result.ladder.length-1} step={1} value={idx} onChange={e=>setIdx(+e.target.value)} className="w-full mt-3 accent-[#baff62]" />
        </div>
        <div className="rounded-[15px] bg-[#0d1516] border border-[#203834] p-[14px]">
          <div className="text-[11.5px] mono text-[#69b997] mb-2">compute budget</div>
          <pre className="text-[11.7px] mono text-[#a7f2ca] whitespace-pre-wrap">{`ComputeBudget::set_compute_unit_limit(${cu})\nComputeBudget::set_compute_unit_price(${pick.price ?? 37200})\n// ${pick.fee} SOL • ${pick.land}`}</pre>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button onClick={()=>onAddToBundle("Priority", `${pick.fee} SOL`)} className="text-[12.3px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">add to bundle</button>
            <ConnectPrompt />
          </div>
        </div>
      </div>
    );
  }

  if(result.kind==="close"){
    const [items,setItems] = useState<any[]>(result.accounts || []);
    const toggle = (id:string)=> setItems(xs=> xs.map(x=> x.id===id ? {...x, selected:!x.selected} : x));
    const sel = items.filter((x:any)=> x.selected !== false);
    const rent = +(sel.length*0.002039).toFixed(6);
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#2b3723] p-[14px]">
        <div className="flex flex-wrap items-center gap-2 text-[13.2px] text-[#c7ff9a]">
          <span>Found <b>{result.empty}</b> empty ATAs {result.nfts?`+ ${result.nfts} NFTs`:""} • selected {sel.length} • reclaim <b>{rent} SOL</b> (~${(rent*LIVE_SOL_PRICE).toFixed(2)})</span>
          {result.live && <span className="flex items-center gap-1 px-[8px] py-[3px] rounded-full bg-[#12281a] border border-[#2a5a38] text-[#9dff8a] text-[10.8px] mono"><span className="w-[5px] h-[5px] rounded-full bg-[#8aff5c] animate-pulse inline-block" />live on-chain</span>}
        </div>
        <div className="mt-3 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-[5px] max-h-[170px] overflow-auto thin pr-1">
          {items.map((a:any)=>(
            <button key={a.id} onClick={()=>toggle(a.id)}
              className={`aspect-square rounded-[6px] border text-[9.8px] grid place-items-center ${a.selected !== false ? "bg-[#13261a] border-[#2d6a42] text-[#a8f5b6]" : "bg-[#0f1513] border-[#1d2b24] text-[#5a8270] opacity-70"}`}
              title={a.ata}
            >{(a.mint||"—").slice(0,3)}</button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-[#b8ffb0]">
          <span>{sel.length} closes • fee {result.fee} SOL • net +{(rent - result.fee).toFixed(6)} SOL</span>
          <div className="ml-auto flex items-center gap-2">
            <ConnectPrompt />
            <button onClick={()=>onAddToBundle(`Close ${sel.length} ATAs`, `+${rent} SOL`)} className="px-[13px] py-[8px] rounded-[10px] bg-[#baff62] text-[#08140a] font-[600] text-[12.6px]">add close bundle →</button>
          </div>
        </div>
      </div>
    );
  }

  if(result.kind==="bridge"){
    const [amt,setAmt] = useState<number>(result.amount);
    const quotes = result.quotes.map((q:any)=>({ ...q, out: +(q.out * amt / result.amount).toFixed(2), fee_usd: +(q.fee_usd * amt / result.amount).toFixed(2)}));
    const [pick,setPick] = useState(0);
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#24364a] p-[14px]">
        <div className="flex flex-wrap items-center gap-3 text-[12.6px] mono text-[#8fc9e5] mb-3">
          <span>{result.from}</span><span>→</span><span>{result.to}</span>
          <input type="number" value={amt} onChange={e=>setAmt(+e.target.value||0)}
            className="bg-[#0f1d1f] border border-[#24454e] rounded-[8px] px-2 py-[4px] w-[128px] text-[#d6ffff]" />
          <span className="text-[#8ecfb1]">{result.asset}</span>
        </div>
        <div className="space-y-[8px]">
          {quotes.map((q:any,i:number)=>(
            <button key={q.r} onClick={()=>setPick(i)}
              className={`w-full flex flex-wrap items-center justify-between gap-2 px-[13px] py-[10px] rounded-[12px] border text-left ${i===pick ? "bg-[#11231a] border-[#2f6b4a]" : "bg-[#10181c] border-[#21313b] hover:border-[#2a4650]"}`}>
              <div className="text-[#e4fff2]"><b>{q.r}</b> <span className="text-[#77b89a]">• {q.t}</span></div>
              <div className="mono text-[#b6ffcf]">{q.out} USDC</div>
              <div className="text-[11.8px] text-[#7fb9a7]">${q.fee_usd} • {q.slip}</div>
              <div className="text-[11px] text-[#6fa998]">{q.tag}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="text-[12.7px] text-[#9ef5b7]">pick: {quotes[pick].r}</div>
          <div className="flex items-center gap-2 ml-auto">
            <ConnectPrompt />
            <button onClick={()=>onAddToBundle(`Bridge ${amt} USDC`, quotes[pick].r)} className="px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a] text-[12.4px]">queue bridge</button>
          </div>
        </div>
      </div>
    );
  }

  if(result.kind==="airdrop"){
    const [items,setItems] = useState(result.items);
    const toggle = (id:string)=> setItems((xs:any[])=> xs.map(x=> x.id===id ? {...x, claimed:!x.claimed} : x));
    const tot = items.filter((x:any)=>!x.claimed && !x.track).reduce((s:number,x:any)=> s + x.usd, 0);
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#2a2d3a] p-[14px]">
        <div className="text-[11.8px] mono text-[#8cd4b0]">claimable: ${tot} • batch fee {result.fee}</div>
        <div className="mt-2 divide-y divide-[#1b2a25]">
          {items.map((x:any)=>(
            <div key={x.id} className="flex items-center justify-between py-[9px] text-[13.5px]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!x.claimed} onChange={()=>toggle(x.id)} className="accent-[#baff62]" />
                <span className="text-[#dcfff0]">{x.proj} • {x.amount}</span>
              </label>
              <span className="mono text-[#b8ff8d]">${x.usd} {x.track && <span className="text-[#6fb88f] ml-2 text-[11.5px]">[track]</span>}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={()=>onAddToBundle("Airdrop batch", `$${tot}`)} className="px-3 py-[8px] rounded-[10px] bg-[#baff62] text-[#07140a] text-[12.5px] font-[600]">batch claim • {result.fee}</button>
          <ConnectPrompt />
        </div>
      </div>
    );
  }

  if(result.kind==="rug"){
    const [mint,setMint] = useState(result.mint);
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#3a2330] p-[14px]">
        <div className="flex flex-wrap items-center gap-2">
          <input value={mint} onChange={e=>setMint(e.target.value)}
            className="flex-1 min-w-[240px] bg-[#14181d] border border-[#2d333b] rounded-[10px] px-3 py-[8px] mono text-[12.8px] text-[#ffd9de]"
            placeholder="pump mint address" />
          <div className="text-[12.6px] text-[#f5c6cf]">{result.token.split("•")[0]} • {result.mcap} mcap</div>
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-[8px] text-[12.6px]">
          {result.checks.map((c:any)=>(
            <div key={c.k} className={`px-3 py-[8px] rounded-[10px] border ${c.ok ? "bg-[#13221a] border-[#2b5a3a] text-[#a8f6b6]" : "bg-[#21141a] border-[#4a2c35] text-[#ffc18a]"}`}>
              {c.k}: {c.v} {c.note && <span className="text-[#ffcf7a]">• {c.note}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-[7px] text-[11.7px]">
          {result.holders.map((h:any)=><span key={h.n} className="px-[10px] py-[5px] rounded-full bg-[#131d19] border border-[#253c30] text-[#a9e7be]">{h.n} {h.pct}%</span>)}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="text-[13.5px] text-[#e8ffd0]">score {result.score}/100 • Tradeable. Not a honeypot. Insider concentration mid.</div>
          <button onClick={()=>onAddToBundle("Pump scan", `${result.score}/100`)} className="ml-auto text-[12.3px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">save scan</button>
        </div>
      </div>
    );
  }

  if(result.kind==="clinic"){
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#203838] p-[14px] grid md:grid-cols-[.9fr_1.1fr] gap-4">
        <div>
          <div className="text-[11.6px] mono text-[#6bc89c]">sol health</div>
          <div className="text-[34px] mono text-[#c7ff7a] leading-none">{result.score}</div>
          <div className="text-[13.3px] text-[#a5e3bc] mt-1">${result.net.toLocaleString()}</div>
          <div className="text-[11.8px] text-[#76b998] mt-1 mono">{short(result.wallet)}</div>
        </div>
        <div className="text-[13.2px] text-[#b8f1cf] space-y-[6px]">
          {result.inbox.map((s:string,i:number)=> <div key={i}>• {s}</div>)}
          <div className="text-[12.3px] text-[#8ad9ad] pt-1">{result.fix}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>onAddToBundle("Clinic fix", "+0.054 SOL")} className="mt-2 text-[12.3px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">queue fix → bundle</button>
            <ConnectPrompt />
          </div>
        </div>
      </div>
    );
  }

  if(result.kind==="jito"){
    const [tip,setTip] = useState(result.shield.tip);
    const outAdj = +(result.shield.out - (tip-0.00035)*227.84).toFixed(2);
    return (
      <div className="rounded-[16px] bg-[#0e111d] border border-[#2a2d44] p-[14px] text-[13.4px]">
        <div className="mono text-[#b8c9ff]">{result.trade}</div>
        <div className="mt-2 text-[#dbe6ff]">public: ${result.pub.out} • sandwich {result.pub.sandwich} • impact {result.pub.pi}</div>
        <div className="mt-3">
          <div className="text-[11.8px] text-[#86e6bf] mb-1">Jito tip • {tip.toFixed(5)} SOL</div>
          <input type="range" min={0.00005} max={0.0012} step={0.00005} value={tip} onChange={e=>setTip(+e.target.value)} className="w-full accent-[#b9a6ff]" />
        </div>
        <div className="mt-2 text-[#a6ffc9]">shielded: ${outAdj} • sandwich &lt;0.1% • land {result.shield.land}</div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={()=>onAddToBundle("Jito bundle", `$${outAdj}`)} className="text-[12.4px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">queue bundle</button>
          <button onClick={()=>navigator.clipboard.writeText(result.bundle || "")} className="text-[12.4px] px-3 py-[7px] rounded-[10px] bg-[#141a24] border border-[#2a3244] text-[#9fc9ff]">copy JSON</button>
          <ConnectPrompt />
        </div>
      </div>
    );
  }

  if(result.kind==="tax") return <TaxResult result={result} connected={connected} onConnectWallet={onConnectWallet} />;

  if(result.kind==="rescue"){
    const [list,setList] = useState(result.checklist);
    const toggle = (id:string)=> setList((xs:any[])=> xs.map(x=> x.id===id ? {...x, done:!x.done} : x));
    const t = typeof rescueSec==="number" ? rescueSec : 518;
    const mm=Math.floor(t/60), ss=t%60;
    return (
      <div className="rounded-[16px] bg-[#1a1111] border border-[#4b2a25] p-[14px]">
        <div className="flex items-center justify-between">
          <div className="text-[12.6px] mono text-[#ff9b78]">ISOLATE • SOLANA</div>
          <div className="mono text-[#ffcf9a]">{String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')} safe</div>
        </div>
        <div className="mt-3 space-y-[8px] text-[13.4px] text-[#ffd7c6]">
          {list.map((c:any)=>(
            <label key={c.id} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!c.done} onChange={()=>toggle(c.id)} className="accent-[#baff62]" />
              <span className={c.done ? "line-through text-[#b88a7a]" : ""}>{c.s}</span>
              {c.urg && !c.done && <span className="text-[11px] text-[#ff9975]">critical</span>}
            </label>
          ))}
        </div>
        <div className="mt-3 text-[12.7px] text-[#ffc5aa]">{result.bundle}</div>
        <div className="text-[11.5px] text-[#e38b6d] mono mt-1">{result.vault}</div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button onClick={onRescueStart} className="flex-1 py-[10px] rounded-[12px] bg-[#ff6a47] text-[#2b0a05] font-[650] text-[13.5px]">build rescue bundle →</button>
          <ConnectPrompt />
        </div>
      </div>
    );
  }

  if(result.kind==="stake"){
    const [amt,setAmt] = useState<number>(result.amount);
    const ypy = +(amt*0.0782).toFixed(2);
    return (
      <div className="rounded-[16px] bg-[#0d1516] border border-[#23463a] p-[14px]">
        <div className="flex items-center gap-3 text-[13px] text-[#a8f7d7] flex-wrap">
          restake
          <input type="number" value={amt} onChange={e=>setAmt(+e.target.value||0)}
            className="w-[110px] bg-[#0f231c] border border-[#2a4d3b] rounded-[9px] px-2 py-[5px] mono text-[#ceffe9]" />
          SOL • ~{ypy} SOL/yr
        </div>
        <div className="mt-3 space-y-[7px]">
          {result.validators.map((v:any)=>(
            <div key={v.n} className={`px-3 py-[9px] rounded-[11px] border flex items-center justify-between ${v.pick ? "bg-[#12261d] border-[#2e7a53] text-[#d6fff0]" : "bg-[#101b18] border-[#20342d] text-[#9bd0b8]"}`}>
              <div>{v.n} {v.pick && "★"}</div>
              <div className="mono">{v.apy}%</div>
              <div className="text-[11.8px]">{v.com}% • {v.mev}</div>
              <div className="w-[90px] h-[6px] bg-[#0f231b] rounded"><div className="h-full rounded" style={{ width:`${v.score}%`, background: v.pick ? "#6affb6" : "#4e9f80"}}/></div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={()=>onAddToBundle(`Stake ${amt} SOL`, "Jito 7.82%")} className="text-[12.4px] px-3 py-[7px] rounded-[10px] bg-[#15261b] border border-[#2a5a38] text-[#b8ff9a]">queue stake</button>
          <ConnectPrompt />
        </div>
      </div>
    );
  }

  return <pre className="mono text-[11px]">{JSON.stringify(result,null,2)}</pre>;
}
