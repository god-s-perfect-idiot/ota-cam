import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage.js';
import { CameraPage } from './pages/CameraPage.js';
import { HomePage } from './pages/HomePage.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/c/:code" element={<CameraPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
