import { createRoot } from 'react-dom/client';
import SpaceRoam from './SpaceRoam.jsx';
createRoot(document.getElementById('root')).render(<SpaceRoam offscreen={location.search.includes('headless')} onReady={(api) => { window.spaceroam = api; }} />);
