import { useNavigate } from "react-router-dom";
import SideRays from './components/hero/SideRays';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#060608] text-white flex flex-col relative overflow-hidden font-sans">
      {/* Background Animation - Reduced Glare */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <SideRays
            speed={1.5}
            rayColor1="#EAB308"
            rayColor2="#96c8ff"
            intensity={1.2}
            spread={1.8}
            origin="top-right"
            tilt={0}
            saturation={1.2}
            blend={0.75}
            falloff={2.2}
            opacity={0.6}
          />
        </div>
      </div>

      {/* Floating Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl rounded-full border border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between z-50 shadow-2xl">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span className="font-semibold text-[17px] tracking-tight text-white">
            Clarity B2B
          </span>
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-7">
            <button className="text-[15px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer">
              Features
            </button>
            <button className="text-[15px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer">
              About
            </button>
          </div>
          <button 
            onClick={() => navigate("/pipeline")}
            className="px-5 py-2 bg-[#F1F5F9] hover:bg-white text-slate-900 text-[14px] font-bold rounded-full transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            Sign up
          </button>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 mt-16">
        
        {/* 'NEW' Badge */}
        <div className="mb-8 inline-flex items-center gap-3 p-1 pr-4 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md shadow-2xl">
          <span className="px-3 py-1 rounded-full bg-[#F1F5F9] text-black text-[12px] font-bold tracking-wide uppercase">
            NEW
          </span>
          <span className="text-[14px] font-medium text-slate-300">
            Just shipped v2.0
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[2.5rem] sm:text-5xl md:text-7xl lg:text-[5rem] leading-[1.05] font-extrabold tracking-tight text-white max-w-5xl mb-12">
          Light cascading from <br className="hidden md:block" /> the corner
        </h1>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
          <button 
            onClick={() => navigate("/pipeline")}
            className="w-full sm:w-auto px-8 py-3.5 bg-[#F1F5F9] hover:bg-white text-slate-900 text-[15px] font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg"
          >
            Get started
          </button>
          <button 
            onClick={() => navigate("/pipeline")}
            className="w-full sm:w-auto px-8 py-3.5 bg-transparent border border-white/10 hover:bg-white/[0.08] text-slate-300 hover:text-white text-[15px] font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Learn more
          </button>
        </div>
      </main>
    </div>
  );
}
