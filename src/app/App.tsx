import { Charts } from './components/Charts';
import { ConfigDrawer } from './components/ConfigDrawer';
import { Controls } from './components/Controls';
import { Explain } from './components/Explain';
import { Schematic } from './components/Schematic';

export function App() {
  return (
    <main className="app">
      <header className="masthead">
        <h1>Infra Simulator</h1>
        <Explain
          short="A queue-and-workers backend under synthetic load. Turn the knobs, press 10×, and watch where it breaks."
          long="Web API containers accept requests and enqueue jobs. Workers pull jobs and call an external resource. Everything is a discrete-event simulation with a fixed seed, so the same settings replay the same way."
        />
      </header>
      <div className="top">
        <Controls />
        <Schematic />
      </div>
      <Charts />
      <ConfigDrawer />
    </main>
  );
}
