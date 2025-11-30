import React, { useState } from 'react';
import { WrkStudio } from './components/WrkStudio';
import { OpsConsole } from './components/OpsConsole';

function App() {
  // Simple routing for demo purposes
  // In reality this would be react-router
  const [currentApp, setCurrentApp] = useState<'studio' | 'ops'>('studio');

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A]">
       {currentApp === 'studio' ? (
         <WrkStudio />
       ) : (
         <OpsConsole />
       )}
       
       {/* Global Switcher for Demo - helps navigate between the two major views created */}
       <div 
          className="fixed bottom-4 right-4 z-[100] bg-[#0A0A0A] text-white px-5 py-3 rounded-full shadow-2xl text-xs font-bold cursor-pointer hover:bg-gray-900 transition-all flex items-center gap-2 border border-gray-800" 
          onClick={() => setCurrentApp(prev => prev === 'studio' ? 'ops' : 'studio')}
       >
          <div className="w-2 h-2 rounded-full bg-[#E43632]" />
          {currentApp === 'studio' ? 'View Ops Console' : 'View Client Studio'}
       </div>
    </div>
  );
}

export default App;
