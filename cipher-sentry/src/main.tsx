import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import App from "./App";
import "./index.css";

const wallets = [new PhantomWalletAdapter()];
/* Public mainnet endpoint. CORS preflight is blocked from localhost (dev proxy).
   In production the deployed domain is allowed, and Phantom injects its own provider on connect.
   useMarketData falls back to simulated chain stats gracefully when RPC is unreachable. */
const endpoint = "https://api.mainnet-beta.solana.com";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>
);
