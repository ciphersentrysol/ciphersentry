import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect, useCallback, useRef } from "react";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export type TokenAccount = {
  pubkey: string;
  mint: string;
  symbol: string;
  decimals: number;
  uiAmount: number;
  isEmpty: boolean;
  rentLamports: number;
};

export type WalletData = {
  solBalance: number | null;
  solBalanceUi: string;
  tokenAccounts: TokenAccount[];
  emptyAtas: TokenAccount[];
  emptyAtaCount: number;
  reclaimableSol: number;
  totalAccounts: number;
  loading: boolean;
  error: string | null;
  lastRefresh: number | null;
  refresh: () => void;
};

const RENT_PER_ACCOUNT = 0.002039;
const POLL_MS = 15_000;

export function useWalletData(): WalletData {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!publicKey) {
      setSolBalance(null);
      setTokenAccounts([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const [lamports, rawAccounts] = await Promise.all([
        connection.getBalance(publicKey, "confirmed"),
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID },
          "confirmed"
        ),
      ]);

      setSolBalance(lamports / LAMPORTS_PER_SOL);

      const accounts: TokenAccount[] = rawAccounts.value.map((a) => {
        const info = (a.account.data as any).parsed?.info ?? {};
        const amt = info.tokenAmount ?? {};
        const uiAmount: number = amt.uiAmount ?? 0;
        const decimals: number = amt.decimals ?? 0;
        const mint: string = info.mint ?? "";
        const symbol = mint.slice(0, 4);
        return {
          pubkey: a.pubkey.toBase58(),
          mint,
          symbol,
          decimals,
          uiAmount,
          isEmpty: uiAmount === 0,
          rentLamports: a.account.lamports,
        };
      });

      setTokenAccounts(accounts);
      setLastRefresh(Date.now());
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "RPC error");
      }
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    fetchData();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const emptyAtas = tokenAccounts.filter((a) => a.isEmpty);

  return {
    solBalance,
    solBalanceUi: solBalance !== null ? solBalance.toFixed(4) : "—",
    tokenAccounts,
    emptyAtas,
    emptyAtaCount: emptyAtas.length,
    reclaimableSol: +(emptyAtas.length * RENT_PER_ACCOUNT).toFixed(6),
    totalAccounts: tokenAccounts.length,
    loading,
    error,
    lastRefresh,
    refresh: fetchData,
  };
}
