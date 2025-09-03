import React from 'react';
import { ToastProvider } from './toast';
import AppShell from './components/AppShell';

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
