import { createRoot } from 'react-dom/client';
import SpaceTrotter from './SpaceTrotter.jsx';
createRoot(document.getElementById('root')).render(<SpaceTrotter offscreen={location.search.includes('headless')} onReady={(api) => { window.spacetrotter = window.spaceroam = api; }} />);
