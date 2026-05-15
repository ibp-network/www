/**
 * Tiny JSON-RPC client over WebSocket.
 *
 * Polkadot's canonical transport is WebSocket — HTTPS is secondary. WS has no
 * CORS restrictions, so browser-side queries work against any IBP endpoint.
 * This file is deliberately tiny — no PAPI/polkadot-js bundle. We open one WS,
 * send a batch of JSON-RPC requests, accumulate results, close.
 */

import { createResource, type Resource } from 'solid-js';

export type Header = {
  number: number;
};

export type SubstrateProbe = {
  number: number;
  version: string | null;
  chain: string | null;
  nodeName: string | null;
  peers: number | null;
  syncing: boolean | null;
};

export type EvmProbe = {
  number: number;
  client: string | null;
  peers: number | null;
  chainId: number | null;
};

const WS_TIMEOUT_MS = 6000;

type RpcRequest = { id: number; method: string; params?: unknown[] };

/**
 * Open a WebSocket, dispatch N JSON-RPC requests in parallel, collect results
 * indexed by id. Resolves with a Map<id, result> as soon as every requested id
 * has reported, or with whatever arrived before timeout / error. Failed sub-
 * requests come back as `undefined` entries.
 */
function wsRpcBatch(
  wsUrl: string,
  requests: RpcRequest[],
  timeoutMs = WS_TIMEOUT_MS,
): Promise<Map<number, unknown>> {
  return new Promise((resolve) => {
    const out = new Map<number, unknown>();
    let settled = false;
    let ws: WebSocket | null = null;
    const expected = new Set(requests.map((r) => r.id));

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(out);
    };

    const timeout = window.setTimeout(finish, timeoutMs);

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      finish();
      return;
    }

    ws.onopen = () => {
      for (const r of requests) {
        try {
          ws?.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: r.id,
              method: r.method,
              params: r.params ?? [],
            }),
          );
        } catch {
          /* swallow — timeout handles it */
        }
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (typeof data?.id === 'number' && expected.has(data.id)) {
          // Store result if present, else explicit null so consumers can
          // distinguish "method unsupported" from "didn't arrive yet".
          out.set(data.id, data.result ?? null);
          if (out.size >= expected.size) finish();
        }
      } catch {
        /* keep waiting for valid frames */
      }
    };

    ws.onerror = finish;
    ws.onclose = finish;
  });
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

function asHexNum(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const n = Number.parseInt(v, 16);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch the latest *best* block header from a Substrate RPC over WebSocket.
 * `chain_getHeader` with no args returns the current best (not finalized — that
 * would need `chain_getFinalizedHead` first and a second RPC). For a live
 * block-height display the best block is what we want; finalized lags ~30s.
 * Returns null if the connection fails or times out.
 */
export async function fetchBestHeader(wsUrl: string): Promise<Header | null> {
  const out = await wsRpcBatch(wsUrl, [{ id: 1, method: 'chain_getHeader' }]);
  const r = out.get(1) as { number?: unknown } | null | undefined;
  if (!r) return null;
  const num = asHexNum(r.number);
  return num == null ? null : { number: num };
}

/**
 * Solid resource — fetches the latest header for a given WSS URL on mount.
 * No polling: one shot. Caller can re-fetch by changing the source signal.
 */
export function useLatestBlock(wsUrl: () => string): Resource<Header | null> {
  const [r] = createResource(wsUrl, (url) => fetchBestHeader(url));
  return r;
}

/**
 * Rich Substrate probe — block header + node version + chain name + health,
 * over a single WebSocket. Used by the inline "Test" widget so operators can
 * see what software the node runs and whether it's in sync.
 */
export async function probeSubstrate(wsUrl: string): Promise<SubstrateProbe | null> {
  const out = await wsRpcBatch(wsUrl, [
    { id: 1, method: 'chain_getHeader' },
    { id: 2, method: 'system_version' },
    { id: 3, method: 'system_chain' },
    { id: 4, method: 'system_name' },
    { id: 5, method: 'system_health' },
  ]);
  const head = out.get(1) as { number?: unknown } | null | undefined;
  if (!head) return null;
  const num = asHexNum(head.number);
  if (num == null) return null;

  const health = out.get(5) as
    | { peers?: unknown; isSyncing?: unknown }
    | null
    | undefined;

  return {
    number: num,
    version: asStr(out.get(2)),
    chain: asStr(out.get(3)),
    nodeName: asStr(out.get(4)),
    peers: typeof health?.peers === 'number' ? health.peers : null,
    syncing: typeof health?.isSyncing === 'boolean' ? health.isSyncing : null,
  };
}

/**
 * Fetch the latest block number from an Ethereum JSON-RPC endpoint over WSS.
 * Asset Hub's EVM RPC speaks Ethereum JSON-RPC, so we send `eth_blockNumber`.
 *
 * Why WSS and not HTTPS POST? The HTTPS endpoint mishandles CORS preflight
 * (OPTIONS response is missing `access-control-allow-origin`), so a browser
 * `fetch()` blocks the POST before it fires. WSS skips CORS entirely.
 */
export async function fetchEvmBlockNumber(wsUrl: string): Promise<number | null> {
  const out = await wsRpcBatch(wsUrl, [{ id: 1, method: 'eth_blockNumber' }]);
  return asHexNum(out.get(1));
}

/**
 * Rich EVM probe — block number + client version + peer count + chain id.
 */
export async function probeEvm(wsUrl: string): Promise<EvmProbe | null> {
  const out = await wsRpcBatch(wsUrl, [
    { id: 1, method: 'eth_blockNumber' },
    { id: 2, method: 'web3_clientVersion' },
    { id: 3, method: 'net_peerCount' },
    { id: 4, method: 'eth_chainId' },
  ]);
  const num = asHexNum(out.get(1));
  if (num == null) return null;
  return {
    number: num,
    client: asStr(out.get(2)),
    peers: asHexNum(out.get(3)),
    chainId: asHexNum(out.get(4)),
  };
}
