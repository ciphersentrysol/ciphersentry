import { useState, useEffect } from "react";

const X_URL  = "https://x.com/ciphersentrysol";
const CA     = ""; // contract address — fill in when live

const AGENTS = [
  { id:"01", name:"TX Inspector",   desc:"v0 trace · CU map · sig decoder",          icon:"🔍" },
  { id:"02", name:"Priority",       desc:"CU + tip ladder · next-slot model",         icon:"⚡" },
  { id:"03", name:"Rent Reclaim",   desc:"Empty ATA sweep · live on-chain count",     icon:"✕"  },
  { id:"04", name:"Bridge Mesh",    desc:"SOL ⇔ EVM · wormhole · debridge sim",       icon:"⇄"  },
  { id:"05", name:"Drop Hunter",    desc:"JUP / JTO / TNSR claim radar",              icon:"★"  },
  { id:"06", name:"Pump Scan",      desc:"mint · LP · bonding curve sell-sim",        icon:"◆"  },
  { id:"07", name:"Clinic",         desc:"wallet health · 100-pt score",              icon:"◎"  },
  { id:"08", name:"Jito Shield",    desc:"MEV + bundle · tip auction",                icon:"⬡"  },
  { id:"09", name:"Stake",          desc:"validator APY · epoch calendar",            icon:"▲"  },
  { id:"10", name:"Rug Detector",   desc:"mint authority · freeze · honey-pot",       icon:"⚠"  },
  { id:"11", name:"Tax FIFO",       desc:"P&L bar chart · 8949-ready · on-chain txs", icon:"$"  },
];

const FEATURES = [
  { label:"Real-time SOL price",  body:"Live Binance feed, 15-second refresh, used across all USD conversions." },
  { label:"Phantom wallet",        body:"Connect once — balance, ATAs, and tx-signing all flow from your key." },
  { label:"Bundle cart",           body:"Queue multiple ops, sign a single Jito bundle, one confirmation." },
  { label:"Sentry autopilot",      body:"Scheduled sweeps run Clinic → Close → Airdrop → Stake hands-free." },
  { label:"On-chain tax history",  body:"Pull real signatures, classify by program, export FIFO rows as CSV." },
  { label:"Command palette",       body:"⌘K to jump to any agent, trigger workflows, or connect wallet." },
];

function Ticker() {
  const items = ["SOL · $67.78", "TPS · 3,759", "PRIO · 42.5k μL", "RENT · +0.2840 SOL", "HEALTH 81 · BUNDLE 0"];
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPos(p => p + 1), 2400);
    return () => clearInterval(id);
  }, []);
  const idx = pos % items.length;
  return (
    <div className="overflow-hidden h-[18px]">
      <div key={idx} className="text-[11px] mono text-[#4a8a68] animate-ticker">{items[idx]}</div>
    </div>
  );
}

export default function App() {
  const [copied, setCopied] = useState(false);

  function copyCA() {
    if (!CA) return;
    navigator.clipboard.writeText(CA).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="min-h-screen bg-[#060e0a] text-[#cffff0] font-['Menlo','Monaco','Courier_New',monospace] overflow-x-hidden">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-[24px] h-[48px] border-b border-[#0f2018] bg-[#060e0aee] backdrop-blur-md">
        <div className="flex items-center gap-[10px]">
          <img src="/cipher-landing/logo.png" alt="Cipher Sentry" className="w-[28px] h-[28px] rounded-[8px]" />
          <span className="text-[13.5px] font-semibold text-[#d8fff0]">cipher sentry</span>
          <span className="hidden sm:block text-[10.5px] text-[#3a6650] ml-1">v2.2</span>
        </div>
        <div className="flex items-center gap-[18px]">
          <Ticker />
          <a href="https://github.com/ciphersentrysol/ciphersentry" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-[6px] text-[11.5px] text-[#6a9a80] hover:text-[#cffff0] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
          <a href={X_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-[6px] text-[11.5px] text-[#6a9a80] hover:text-[#cffff0] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @ciphersentrysol
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-[120px] pb-[80px] px-[24px] text-center overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(#0f2018 1px, transparent 1px), linear-gradient(90deg, #0f2018 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.35,
        }}/>
        {/* Glow */}
        <div className="absolute top-[60px] left-1/2 -translate-x-1/2 w-[560px] h-[320px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, #14ff7a18 0%, transparent 70%)" }}/>

        <div className="relative max-w-[720px] mx-auto">
          <div className="inline-flex items-center gap-2 px-[12px] py-[5px] rounded-full border border-[#1a4030] bg-[#0a1e14] text-[10.5px] text-[#5ab87a] mb-[24px]">
            <span className="w-[6px] h-[6px] rounded-full bg-[#3dff7a] animate-pulse inline-block"/>
            Solana · Mainnet · Multi-Agent Intelligence
          </div>

          <h1 className="text-[52px] sm:text-[68px] font-extrabold leading-[1.0] tracking-[-2px] mb-[18px]"
            style={{ background: "linear-gradient(135deg, #d0ffea 0%, #7dffb0 40%, #40e080 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            cipher sentry
          </h1>
          <p className="text-[17px] sm:text-[20px] text-[#7ab89a] leading-[1.6] mb-[14px]">
            11 SVM agents · real-time ops dashboard for Solana
          </p>
          <p className="text-[13px] text-[#4a7060] max-w-[480px] mx-auto mb-[36px]">
            Rent reclaim, MEV bundles, tax FIFO, pump scans, airdrop radar — all wired to your Phantom wallet, live on-chain.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-[12px]">
            <a href="/"
              className="px-[24px] py-[11px] rounded-[12px] bg-[#14ff7a] text-[#060e0a] text-[14px] font-bold hover:bg-[#3dffa0] transition-colors shadow-[0_0_28px_#14ff7a40]">
              Explore Agents →
            </a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer"
              className="px-[24px] py-[11px] rounded-[12px] border border-[#1a4030] text-[#90f4a0] text-[14px] hover:border-[#3a7a4a] transition-colors flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Follow on X
            </a>
          </div>
        </div>
      </section>

      {/* Contract Address */}
      <section className="py-[28px] px-[24px] flex justify-center">
        <div className="flex items-center gap-[12px] px-[20px] py-[12px] rounded-[14px] border border-[#1a3028] bg-[#080f0c] max-w-[560px] w-full">
          <div className="text-[10.5px] text-[#3a6650] uppercase tracking-widest whitespace-nowrap">CA</div>
          {CA ? (
            <>
              <div className="flex-1 text-[12.5px] text-[#90f4a0] mono truncate">{CA}</div>
              <button onClick={copyCA}
                className="text-[11px] px-[10px] py-[5px] rounded-[8px] border border-[#1a4030] text-[#5ab87a] hover:text-[#cffff0] hover:border-[#3a7a4a] transition-colors whitespace-nowrap">
                {copied ? "copied ✓" : "copy"}
              </button>
            </>
          ) : (
            <div className="flex-1 text-[12.5px] text-[#3a5548] mono">— announcing soon —</div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-[60px] px-[24px]">
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-[40px]">
            <div className="text-[11px] text-[#3a6650] uppercase tracking-[3px] mb-[8px]">capabilities</div>
            <h2 className="text-[28px] font-bold text-[#d0ffea]">Everything your wallet needs</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
            {FEATURES.map(f => (
              <div key={f.label} className="rounded-[14px] border border-[#122018] bg-[#080e0b] p-[20px] hover:border-[#1e4030] transition-colors">
                <div className="text-[13px] font-semibold text-[#a0ffcc] mb-[6px]">{f.label}</div>
                <div className="text-[12px] text-[#4a7060] leading-[1.6]">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents grid */}
      <section id="agents" className="py-[60px] px-[24px] border-t border-[#0d1e14]">
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-[40px]">
            <div className="text-[11px] text-[#3a6650] uppercase tracking-[3px] mb-[8px]">11 SVM agents</div>
            <h2 className="text-[28px] font-bold text-[#d0ffea]">Your on-chain crew</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[10px]">
            {AGENTS.map(a => (
              <div key={a.id}
                className="flex items-start gap-[12px] rounded-[12px] border border-[#0f1e16] bg-[#080e0b] px-[16px] py-[14px] hover:border-[#1e4030] hover:bg-[#0a1410] transition-all group cursor-default">
                <div className="w-[32px] h-[32px] rounded-[9px] bg-[#0d1e16] border border-[#1a3828] flex items-center justify-center text-[14px] shrink-0 group-hover:border-[#2a6040] transition-colors">
                  {a.icon}
                </div>
                <div>
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[10px] text-[#2a5040] mono">#{a.id}</span>
                    <span className="text-[13px] font-semibold text-[#c0ffe8]">{a.name}</span>
                  </div>
                  <div className="text-[11.5px] text-[#3a6050] mt-[2px]">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-[40px] px-[24px] border-t border-b border-[#0d1e14]">
        <div className="max-w-[720px] mx-auto grid grid-cols-2 sm:grid-cols-4 gap-[24px] text-center">
          {[
            { v:"11",    l:"SVM Agents" },
            { v:"15s",   l:"Price refresh" },
            { v:"FIFO",  l:"Tax method" },
            { v:"Jito",  l:"Bundle engine" },
          ].map(s => (
            <div key={s.l}>
              <div className="text-[28px] font-bold text-[#7dff9f] mono">{s.v}</div>
              <div className="text-[11px] text-[#3a6050] mt-[2px]">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-[80px] px-[24px] text-center">
        <div className="max-w-[520px] mx-auto">
          <h2 className="text-[32px] font-bold text-[#d0ffea] mb-[12px]">Ready to sentry your SOL?</h2>
          <p className="text-[13px] text-[#4a7060] mb-[32px]">Connect Phantom. All 11 agents go live instantly.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[12px]">
            <a href={X_URL} target="_blank" rel="noopener noreferrer"
              className="px-[24px] py-[11px] rounded-[12px] bg-[#14ff7a] text-[#060e0a] text-[14px] font-bold hover:bg-[#3dffa0] transition-colors shadow-[0_0_28px_#14ff7a30]">
              Follow updates on X →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#0d1e14] px-[24px] py-[24px] flex flex-col sm:flex-row items-center justify-between gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <img src="/cipher-landing/logo.png" alt="Cipher Sentry" className="w-[22px] h-[22px] rounded-[6px]" />
          <span className="text-[11px] text-[#2a5040]">cipher sentry v2.2 · Solana mainnet</span>
        </div>
        <div className="flex items-center gap-[18px] text-[11px] text-[#2a5040]">
          <a href={X_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[#7dff9a] transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @ciphersentrysol
          </a>
          <span>© 2026 Cipher Sentry</span>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        body { background: #060e0a; }
        .mono { font-family: 'Menlo','Monaco','Courier New',monospace; }
        @keyframes ticker { from { transform: translateY(20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        .animate-ticker { animation: ticker 0.35s ease-out; }
      `}</style>
    </div>
  );
}
