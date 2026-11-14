import { squares } from '../../data/assets';
import { Button } from '../../components/Button';
import { navigate } from '../../lib/router';

/** Branded 404. */
export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-[100svh] flex-col items-center justify-center gap-6 px-6 text-center">
      <img src={squares.spark} alt="" className="h-40 w-40 rounded-full object-cover opacity-80 [mask-image:radial-gradient(closest-side,#000_60%,transparent)]" />
      <p className="mono-label text-violet-400">404</p>
      <h1 className="display-3 max-w-[720px] text-mist">This part of the universe hasn’t formed yet</h1>
      <p className="max-w-[440px] text-text-2">The page you followed doesn’t exist. Head back to the story or open the workspace.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => navigate('#')}>Back to the story</Button>
        <Button onClick={() => navigate('workspace')}>Open the workspace</Button>
      </div>
    </main>
  );
}
