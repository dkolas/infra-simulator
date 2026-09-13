import type { ReplicaView } from '../../engine/types';
import { store, useSim, type DrawerId } from '../store';
import { Explain } from './Explain';

const STATE_LABEL: Record<ReplicaView['state'], string> = {
  ready: 'ready',
  coldStarting: 'cold-starting',
  draining: 'draining',
  dead: 'dead',
};

function Replicas({ replicas, capacity }: { replicas: ReplicaView[]; capacity: number }) {
  return (
    <ul className="replicas" aria-label="Replicas">
      {replicas.map((r) => (
        <li
          key={r.id}
          className={`replica ${r.state}`}
          style={{ '--load': r.state === 'ready' ? Math.min(1, r.inflight / Math.max(1, capacity)) : 0 } as React.CSSProperties}
          title={`#${r.id} ${STATE_LABEL[r.state]}, ${r.inflight} in flight`}
          aria-label={`Replica ${r.id} ${STATE_LABEL[r.state]}, ${r.inflight} in flight`}
        />
      ))}
    </ul>
  );
}

function Box({ id, title, stat, children }: { id: Exclude<DrawerId, null>; title: string; stat: string; children?: React.ReactNode }) {
  return (
    <button type="button" className="box" onClick={() => store.openDrawer(id)} aria-label={`${title}. ${stat}. Open configuration.`}>
      <span className="box-head">
        <span>{title}</span>
        <span className="muted">cfg</span>
      </span>
      <span className="box-body">{children}</span>
      <span className="box-stat">{stat}</span>
    </button>
  );
}

export function Schematic() {
  const { snapshot, config } = useSim();
  const s = snapshot?.schematic;
  const api = s?.api ?? [];
  const workers = s?.workers ?? [];
  const queue = s?.queue ?? { visible: 0, invisible: 0 };
  const ext = s?.external ?? { inflight: 0, capped: false };
  const apiInflight = api.reduce((n, r) => n + r.inflight, 0);
  const workerInflight = workers.reduce((n, r) => n + r.inflight, 0);
  const total = queue.visible + queue.invisible;
  const fill = Math.sqrt(Math.min(1, total / config.queue.maxDepth));
  const invisibleShare = total === 0 ? 0 : queue.invisible / total;
  const deaths = snapshot?.totals.workerDeaths ?? 0;

  return (
    <section className="panel schematic" aria-label="Architecture">
      <div className="panel-head">
        <h2>Architecture</h2>
        <span className="muted">click a component to configure it</span>
      </div>
      <Explain
        short="Requests enter at the API, wait in the queue, and are processed by workers calling the external resource. Each square is one container."
        long="Green squares are ready, filling as they take load. Amber is cold-starting. Red is dead from memory pressure. Dim squares are draining before shutdown."
      />
      <div className="flow">
        <Box id="api" title="Web API" stat={`${api.length} containers · ${apiInflight} in flight`}>
          <Replicas replicas={api} capacity={config.api.connections} />
        </Box>
        <span className="arrow" aria-hidden="true">
          ▶
        </span>
        <Box id="queue" title="Queue" stat={`${queue.visible} waiting · ${queue.invisible} invisible`}>
          <span className="queue-bar" role="img" aria-label={`Queue ${total} of ${config.queue.maxDepth}`}>
            <span className="queue-fill" style={{ width: `${fill * 100}%` }}>
              <span className="queue-invisible" style={{ width: `${invisibleShare * 100}%` }} />
            </span>
          </span>
        </Box>
        <span className="arrow" aria-hidden="true">
          ▶
        </span>
        <Box id="workers" title="Workers" stat={`${workers.length} containers · ${workerInflight} jobs · ${deaths} deaths`}>
          <Replicas replicas={workers} capacity={config.workers.concurrency} />
        </Box>
        <span className="arrow" aria-hidden="true">
          ▶
        </span>
        <Box id="external" title="External" stat={ext.capped ? `${ext.inflight} calls · at cap` : `${ext.inflight} calls in flight`}>
          <span className={`ext ${ext.capped ? 'capped' : ''}`}>{ext.inflight}</span>
        </Box>
      </div>
    </section>
  );
}
