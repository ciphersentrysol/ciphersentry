import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState, useCallback } from "react";

export type TxRow = {
  date: string;
  asset: string;
  type: string;
  gain: string;
  sig: string;
  positive: boolean;
};

export type TxHistoryState = {
  rows: TxRow[];
  loading: boolean;
  error: string | null;
  source: "live" | "none";
  fetch: (year: number) => Promise<void>;
};

const TOKEN_PROG  = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATOKEN_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1brs";
const JUP4        = "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB";
const JUP6        = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const PUMP_FUN    = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

function classifyTx(tx: any, pubkeyStr: string, solPrice: number): TxRow | null {
  if (!tx?.blockTime || !tx.meta) return null;

  const date = new Date(tx.blockTime * 1000).toISOString().split("T")[0];
  const sig  = tx.transaction?.signatures?.[0] ?? "";

  /* Find this wallet's account index */
  const keys: any[] = tx.transaction?.message?.accountKeys ?? [];
  const idx = keys.findIndex(
    (k: any) => (k?.pubkey?.toString?.() ?? k?.toString?.() ?? k) === pubkeyStr
  );
  if (idx < 0) return null;

  const pre  = tx.meta.preBalances?.[idx]  ?? 0;
  const post = tx.meta.postBalances?.[idx] ?? 0;
  const solChange = (post - pre) / 1e9;

  /* Ignore dust / fee-only rows */
  if (Math.abs(solChange) < 0.0001) return null;

  /* Classify by invoked programs */
  const instructions: any[] = tx.transaction?.message?.instructions ?? [];
  const programs = new Set(
    instructions.map((ix: any) => ix.programId?.toString?.() ?? ix.program ?? "")
  );

  let asset = "SOL";
  let type  = solChange > 0 ? "receive" : "transfer";

  if (programs.has(JUP4) || programs.has(JUP6)) {
    type  = "swap";
    asset = "SOL/SPL";
  } else if (programs.has(PUMP_FUN)) {
    type  = "pump.fun";
    asset = "MEME";
  } else if (programs.has(ATOKEN_PROG)) {
    type  = solChange > 0 ? "close ATA" : "open ATA";
  } else if (programs.has(TOKEN_PROG)) {
    asset = "SPL";
    type  = "token tx";
  }

  /* Airdrop heuristic: large positive SOL with no fee payer match */
  if (solChange > 0.01 && type === "receive") type = "airdrop";

  const usdAbs = Math.abs(solChange * solPrice);
  const positive = solChange > 0;
  const gain = positive
    ? `+$${usdAbs.toFixed(0)}`
    : `-$${usdAbs.toFixed(0)}`;

  return { date, asset, type, gain, sig, positive };
}

export function useTransactionHistory(solPrice: number): TxHistoryState {
  const { connection } = useConnection();
  const { publicKey }  = useWallet();

  const [rows,    setRows]    = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [source,  setSource]  = useState<"live" | "none">("none");

  const fetch = useCallback(async (year: number) => {
    if (!publicKey) { setError("Wallet not connected"); return; }
    setLoading(true);
    setError(null);

    try {
      /* Step 1 — get recent signatures (up to 50, then filter by year) */
      const allSigs = await connection.getSignaturesForAddress(publicKey, { limit: 50 });

      const yearStart = new Date(year,     0, 1).getTime() / 1000;
      const yearEnd   = new Date(year + 1, 0, 1).getTime() / 1000;
      const yearSigs  = allSigs.filter(
        s => s.blockTime != null && s.blockTime >= yearStart && s.blockTime < yearEnd
      );

      if (yearSigs.length === 0) {
        setError(`No transactions found for ${year}. Try an earlier year or connect on mainnet.`);
        setSource("none");
        setLoading(false);
        return;
      }

      /* Step 2 — fetch parsed transactions in parallel (cap at 20) */
      const slice = yearSigs.slice(0, 20);
      const txs = await Promise.all(
        slice.map(s =>
          connection.getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          }).catch(() => null)
        )
      );

      /* Step 3 — classify */
      const parsed = txs
        .map(tx => classifyTx(tx, publicKey.toBase58(), solPrice))
        .filter((r): r is TxRow => r !== null)
        .slice(0, 12);

      setRows(parsed);
      setSource("live");
    } catch (e: any) {
      const msg = e?.message ?? "RPC error";
      /* CORS in dev → friendly hint */
      if (msg.includes("CORS") || msg.includes("Failed to fetch") || msg.includes("blocked")) {
        setError("CORS blocked in dev — real history loads on deployed app.");
      } else {
        setError(msg);
      }
      setSource("none");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, solPrice]);

  return { rows, loading, error, source, fetch };
}
