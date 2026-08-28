import { useNavigate } from "react-router-dom";
import { Play, Settings, Zap, ShieldCheck, BarChart3, Activity, Wallet, ArrowRight } from "lucide-react";
import SideRays from "./components/hero/SideRays";
import { useAuth } from "./auth/AuthContext.jsx";

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#02060B] font-sans text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="pointer-events-none sticky left-0 top-0 z-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_54%,rgba(20,30,40,0.5)_0%,rgba(6,10,16,0.8)_34%,rgba(1,3,6,1)_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_35%_70%,rgba(45,80,125,0.15)_0%,rgba(45,80,125,0.05)_20%,transparent_49%)]" />
        <div className="absolute -left-[24rem] top-[44%] h-[44rem] w-[95rem] rotate-[14deg] rounded-[50%] border-t border-[#6EA6E9]/10" />
        <div className="absolute -left-[18rem] top-[52%] h-[34rem] w-[93rem] rotate-[11deg] rounded-[50%] border-t border-[#EDC160]/35 shadow-[0_-18px_46px_rgba(113,169,255,0.08)]" />
        <div className="absolute -right-[8rem] top-[5%] h-[46rem] w-[30rem] rotate-[23deg] bg-[#F0D17A]/10 blur-3xl" />
        <div className="absolute right-[7%] top-[12%] h-[42rem] w-[26rem] rotate-[32deg] bg-[#8FBEEF]/10 blur-3xl" />
        <div className="absolute left-[11%] top-[71%] h-48 w-[49rem] -rotate-[4deg] bg-[#7DB4FF]/10 blur-3xl" />
        <div className="absolute inset-0 opacity-90">
          <SideRays
            speed={1.25}
            rayColor1="#F7D987"
            rayColor2="#96c8ff"
            intensity={1.5}
            spread={2.2}
            origin="top-right"
            tilt={-10}
            saturation={1.5}
            blend={0.4}
            falloff={1.2}
            opacity={0.7}
          />
        </div>
        <div className="absolute right-[12%] top-[22%] h-1 w-1 rounded-full bg-[#CED8E4]/30" />
        <div className="absolute right-[17%] top-[33%] h-1 w-1 rounded-full bg-[#D8B96A]/30" />
        <div className="absolute right-[9%] top-[55%] h-1 w-1 rounded-full bg-[#F6D885]/30" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,2,4,0.1)_0%,rgba(1,2,4,0.3)_43%,rgba(1,2,4,0.95)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#010204] to-transparent" />
      </div>

      <div className="relative z-10 flex w-full flex-col -mt-[100vh]">
      <nav className="fixed left-1/2 top-[30px] z-50 flex h-[78px] w-[calc(100%-48px)] max-w-[1168px] -translate-x-1/2 items-center justify-between rounded-[40px] border border-white/10 bg-[#10151B]/72 px-7 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl max-md:top-5 max-md:h-[64px] max-md:px-5">
        <div className="flex items-center gap-4">
          <Settings className="h-[26px] w-[26px] text-white max-md:h-6 max-md:w-6" strokeWidth={2.4} />
          <span className="text-[20px] font-bold tracking-tight text-white max-md:text-[17px]">
            Clarity B2B
          </span>
        </div>

        <div className="flex items-center gap-9 max-md:gap-3">
          <div className="hidden items-center gap-10 md:flex">
            <button 
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="cursor-pointer text-[16px] font-semibold text-[#AEB5C2] transition-colors hover:text-white"
            >
              Features
            </button>
            <button 
              onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
              className="cursor-pointer text-[16px] font-semibold text-[#AEB5C2] transition-colors hover:text-white"
            >
              About
            </button>
          </div>
          {user ? (
            <button
              onClick={() => navigate("/home")}
              className="h-[46px] rounded-[25px] bg-[#F4F7FB] px-7 text-[16px] font-bold text-[#080B10] shadow-[inset_0_-11px_22px_rgba(16,28,46,0.12),0_14px_32px_rgba(255,255,255,0.16)] transition-all hover:bg-white active:scale-95 max-md:h-11 max-md:px-5 max-md:text-[14px]"
            >
              Go to Portal
            </button>
          ) : (
            <button
              onClick={() => navigate("/signup")}
              className="h-[46px] rounded-[25px] bg-[#F4F7FB] px-7 text-[16px] font-bold text-[#080B10] shadow-[inset_0_-11px_22px_rgba(16,28,46,0.12),0_14px_32px_rgba(255,255,255,0.16)] transition-all hover:bg-white active:scale-95 max-md:h-11 max-md:px-5 max-md:text-[14px]"
            >
              Sign up
            </button>
          )}
        </div>
      </nav>

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center max-md:pt-20">
        <h1
          className="max-w-[660px] leading-[1.05] text-[#F5F7FB] drop-shadow-[0_8px_30px_rgba(255,255,255,0.13)] max-md:max-w-[640px]"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(40px, 4.4vw, 72px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: "2.5rem"
          }}
        >
          Finance clarity.
          <br />
          B2B{" "}
          <span className="bg-gradient-to-r from-[#FFFFFF] via-[#F4E1AB] to-[#D6A44C] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(214,164,76,0.3)]">
            growth.
          </span>
        </h1>

        <p 
          className="mx-auto max-w-[660px] text-[17px] font-medium leading-[1.55] text-[#AEB7C7] max-sm:text-[16px]"
          style={{ marginBottom: "1.5rem" }}
        >
          Streamline invoices, automate workflows, and get paid faster with Clarity B2B&mdash;the smart way
          to manage your accounts.
        </p>

        <div className="flex items-center justify-center gap-3 max-sm:w-full max-sm:flex-col">
          {user ? (
            <button
              onClick={() => navigate("/home")}
              className="flex h-[46px] min-w-[140px] cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-white px-5 text-[14px] font-bold text-[#080B10] shadow-[0_0_38px_rgba(255,255,255,0.23),inset_0_-12px_24px_rgba(9,21,36,0.11)] transition-all hover:bg-[#f5f7fa] active:scale-95 max-sm:w-full"
            >
              <Zap className="h-[15px] w-[15px] fill-current" strokeWidth={2.5} />
              Go to Portal
            </button>
          ) : (
            <button
              onClick={() => navigate("/signup")}
              className="flex h-[46px] min-w-[140px] cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-white px-5 text-[14px] font-bold text-[#080B10] shadow-[0_0_38px_rgba(255,255,255,0.23),inset_0_-12px_24px_rgba(9,21,36,0.11)] transition-all hover:bg-[#f5f7fa] active:scale-95 max-sm:w-full"
            >
              <Zap className="h-[15px] w-[15px] fill-current" strokeWidth={2.5} />
              Get started
            </button>
          )}
          <button
            onClick={() => navigate("/pipeline")}
            className="flex h-[46px] min-w-[156px] cursor-pointer items-center justify-center gap-2 rounded-[24px] border border-white/14 bg-[#071018]/28 px-5 text-[14px] font-semibold text-[#F0F3F7] backdrop-blur-sm transition-all hover:border-white/22 hover:bg-white/[0.06] active:scale-95 max-sm:w-full"
          >
            <Play className="h-[15px] w-[15px]" strokeWidth={2.4} />
            See how it works
          </button>
        </div>
      </main>



      <section id="features" className="relative z-10 px-4 py-24 md:py-32">
        <div className="mx-auto max-w-[1168px]">
          <div className="mb-16 flex flex-col items-center text-center">
            <h2 className="mb-5 text-3xl font-bold tracking-tight md:text-5xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>
              Everything you need to <span className="bg-gradient-to-r from-[#F0CF88] to-[#D6A44C] bg-clip-text text-transparent">scale</span>
            </h2>
            <p className="max-w-[600px] text-center text-[17px] leading-[1.6] text-[#AEB7C7]">
              Clarity B2B provides a complete suite of financial tools designed specifically for modern business ecosystems.
            </p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Bento Box 1 */}
            <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0A1018]/60 p-8 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#0F1621]/80 lg:col-span-2 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
               <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0CF88]/10 text-[#F0CF88]">
                 <Activity className="h-6 w-6" />
               </div>
               <h3 className="mb-3 text-2xl font-bold text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Automated Workflows</h3>
               <p className="text-[#AEB7C7] max-w-md leading-relaxed">Eliminate manual data entry. Our intelligent routing system automatically categorizes, verifies, and approves invoices in milliseconds.</p>
            </div>
            
            {/* Bento Box 2 */}
            <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0A1018]/60 p-8 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#0F1621]/80 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
               <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6EA6E9]/10 text-[#6EA6E9]">
                 <BarChart3 className="h-6 w-6" />
               </div>
               <h3 className="mb-3 text-xl font-bold text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Real-time Analytics</h3>
               <p className="text-[#AEB7C7] leading-relaxed">Gain crystal-clear visibility into your cash flow with customizable, dynamic dashboards.</p>
            </div>

            {/* Bento Box 3 */}
            <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0A1018]/60 p-8 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#0F1621]/80 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
               <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8FBEEF]/10 text-[#8FBEEF]">
                 <Wallet className="h-6 w-6" />
               </div>
               <h3 className="mb-3 text-xl font-bold text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Fast Payments</h3>
               <p className="text-[#AEB7C7] leading-relaxed">Settle accounts globally with competitive FX rates and near-instant processing times.</p>
            </div>

            {/* Bento Box 4 */}
            <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0A1018]/60 p-8 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#0F1621]/80 lg:col-span-2 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
               <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white">
                 <ShieldCheck className="h-6 w-6" />
               </div>
               <h3 className="mb-3 text-2xl font-bold text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Enterprise-grade Security</h3>
               <p className="text-[#AEB7C7] max-w-md leading-relaxed">Your financial data is protected by SOC2 Type II certified infrastructure, end-to-end encryption, and continuous monitoring.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="relative z-10 px-4 py-20 md:py-24 border-t border-white/5 bg-[#03070D]">
        <div className="mx-auto max-w-[1168px]">
          <div className="mb-16 flex flex-col items-center text-center">
            <h2 className="mb-5 text-3xl font-bold tracking-tight md:text-5xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>
              What we are <span className="bg-gradient-to-r from-[#F0CF88] to-[#D6A44C] bg-clip-text text-transparent">doing here</span>
            </h2>
            <p className="max-w-[600px] text-center text-[17px] leading-[1.6] text-[#AEB7C7]">
              Clarity is transforming how businesses interact, bringing liquidity and transparency to global supply chains.
            </p>
          </div>
          
          <div className="flex w-full justify-center">
            <div className="w-full max-w-[800px] overflow-hidden rounded-[24px] border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.4)] bg-black">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute left-0 top-0 h-full w-full"
                  src="https://www.youtube.com/embed/ACLOzAxIfbU"
                  title="What we are doing here"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 py-20 md:py-24 border-t border-white/5 bg-[#03070D]">
        <div className="mx-auto flex max-w-[1168px] flex-col items-center text-center">
          <div className="relative -mb-8 w-full max-w-[540px] overflow-hidden pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]">
            <img 
              src="/eyes.png" 
              alt="Financial visibility" 
              className="w-full h-auto object-cover opacity-85 transition-transform duration-1000 hover:scale-105" 
            />
          </div>

          <h2 className="mb-5 text-4xl font-bold md:text-[52px]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>
            Total financial <span className="bg-gradient-to-r from-[#F0CF88] to-[#D6A44C] bg-clip-text text-transparent">visibility</span>
          </h2>
          <p className="mb-14 max-w-[500px] text-[16px] leading-[1.6] text-[#AEB7C7]">
            Stop guessing. See exactly where your capital is tied up and unlock liquidity faster than ever before.
          </p>
          {user ? (
            <button
              onClick={() => navigate("/home")}
              style={{ marginTop: '32px' }}
              className="flex h-[46px] cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-white px-6 text-[14px] font-bold text-[#080B10] shadow-[0_0_38px_rgba(255,255,255,0.23),inset_0_-12px_24px_rgba(9,21,36,0.11)] transition-all hover:bg-[#f5f7fa] active:scale-95"
            >
              Go to Portal <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              onClick={() => navigate("/signup")}
              style={{ marginTop: '32px' }}
              className="flex h-[46px] cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-white px-6 text-[14px] font-bold text-[#080B10] shadow-[0_0_38px_rgba(255,255,255,0.23),inset_0_-12px_24px_rgba(9,21,36,0.11)] transition-all hover:bg-[#f5f7fa] active:scale-95"
            >
              Uncover your cash flow <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </section>

      {/* Footer Section */}
      <footer className="relative z-10 border-t border-white/5 bg-[#02060B] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-[1168px]">
          <div className="grid grid-cols-2 gap-12 md:grid-cols-4 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-2">
              <div className="mb-6 flex items-center gap-2">
                <Settings className="h-[22px] w-[22px] text-white" strokeWidth={2.4} />
                <span className="text-lg font-bold tracking-tight text-white">Clarity B2B</span>
              </div>
              <p className="max-w-[280px] text-[15px] leading-relaxed text-[#AEB7C7]">
                The complete financial operating system for modern B2B supply chains. Built for speed, transparency, and growth.
              </p>
            </div>
            
            <div>
              <h4 className="mb-6 text-[12px] font-bold uppercase tracking-wider text-white">Product</h4>
              <ul className="flex flex-col gap-4 text-[14px] text-[#AEB7C7]">
                <li><a href="#" className="transition-colors hover:text-white">Dynamic Discounting</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Supplier Health</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Auto-Invest</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Dispute Centre</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-6 text-[12px] font-bold uppercase tracking-wider text-white">Company</h4>
              <ul className="flex flex-col gap-4 text-[14px] text-[#AEB7C7]">
                <li><a href="#" className="transition-colors hover:text-white">About Us</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Careers</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Blog</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-6 text-[12px] font-bold uppercase tracking-wider text-white">Legal</h4>
              <ul className="flex flex-col gap-4 text-[14px] text-[#AEB7C7]">
                <li><a href="#" className="transition-colors hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="transition-colors hover:text-white">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-20 flex flex-col items-center justify-between border-t border-white/5 pt-8 md:flex-row">
            <p className="text-[13px] text-[#64748B]">
              &copy; {new Date().getFullYear()} Clarity B2B. All rights reserved.
            </p>
            <div className="mt-4 flex gap-6 text-[13px] md:mt-0">
              <a href="#" className="text-[#64748B] transition-colors hover:text-white">Twitter</a>
              <a href="#" className="text-[#64748B] transition-colors hover:text-white">LinkedIn</a>
              <a href="#" className="text-[#64748B] transition-colors hover:text-white">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
