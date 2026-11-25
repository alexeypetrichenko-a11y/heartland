import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MaritimeReview } from './ui/MaritimeReview';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><MaritimeReview /></StrictMode>,
);
