import { Show } from 'solid-js';
import { useLatestBlock } from '@/utils/rpc';

/**
 * Live status pill — modelled on the Figma export's single status pill.
 * Green dot indicates "the chain is alive right now" — we opened a WebSocket
 * to the chain and got a real block header back. The block number is from
 * that header. Lightweight: one WS, one message, close.
 */
export default function LiveBlock(props: {
  hostname?: string;
  chain?: string;
  variant?: 'pill' | 'inline';
}) {
  const url = () => `wss://${props.hostname ?? 'asset-hub-polkadot.dotters.network'}`;
  const block = useLatestBlock(url);
  const label = props.chain ?? 'Asset Hub';

  return (
    <Show
      when={props.variant === 'pill'}
      fallback={
        <span class="inline-flex items-center gap-2 text-xs text-paper-muted font-mono">
          <span class="ping-dot" style={{ width: '6px', height: '6px' }} />
          <Show when={block()} fallback={<>{label} · connecting…</>}>
            {(b) => <>{label} · #{b().number.toLocaleString()}</>}
          </Show>
        </span>
      }
    >
      <span class="pill-sm">
        <span
          class="inline-block rounded-full shrink-0"
          style={{
            width: '6px',
            height: '6px',
            background: '#3CFF8E',
            'box-shadow': '0 0 10px #3CFF8E',
          }}
        />
        <Show
          when={block()}
          fallback={<span>{label} {'·'} connecting…</span>}
        >
          {(b) => (
            <span>{label} {'·'} #{b().number.toLocaleString()}</span>
          )}
        </Show>
      </span>
    </Show>
  );
}
