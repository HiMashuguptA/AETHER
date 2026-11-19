import { useState } from 'react';
import { Lightning } from '@phosphor-icons/react';
import { errorText } from '../../data/api';
import { useApp, type DirectionPick } from '../../data/store';
import { Button } from '../../components/Button';
import { navigate } from '../../lib/router';

/** A finished-looking project to explore before starting your own. It is an ordinary project: edit or delete it freely. */
const EXAMPLE: { name: string; idea: string; direction: DirectionPick } = {
  name: 'Example · Halden Coffee spring launch',
  idea: 'A seasonal launch site for three single-origin coffee lots from a small roastery, with a slow, warm scroll story and a clear way to order.',
  direction: {
    name: 'Warm lattice',
    summary: 'A calm, structured story that lets three coffees take turns in the light.',
    rationale: 'The lattice reads as craft and care; slow reveals match a slow morning ritual.',
    accent: '#c08457',
    swatches: ['#c08457', '#e8c7a0', '#3a2a20', '#f2f2f3'],
    type: 'Geist light for headlines, Geist for body',
    layout: 'One idea per screen, with generous space and left-aligned type.',
    motion: 'Slow fades with a short rise; nothing snaps.',
    interaction: 'The lattice turns gently as you scroll.',
    headline: 'Slow mornings\nbright cups',
    subhead: 'Three single-origin lots from the spring harvest, roasted in small batches.',
    visual: 'lattice',
  },
};

export function ExampleProjectButton() {
  const createProject = useApp((s) => s.createProject);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const id = await createProject({ ...EXAMPLE, outputs: ['site', 'motion'] });
      navigate(`project-${id}`, { transition: false });
    } catch (e) { toast({ text: errorText(e), tone: 'error' }); }
    finally { setBusy(false); }
  };
  return <Button icon={<Lightning size={14} />} onClick={start} loading={busy} disabled={busy}>Open an example</Button>;
}
