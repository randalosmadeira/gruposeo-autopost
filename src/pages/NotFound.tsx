import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, Radar } from 'lucide-react';
import { NeuralEnergy } from '@/components/brand/NeuralEnergy';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Zica.ai:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="neural-auth-shell relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0D1117] px-5 text-slate-100">
      <NeuralEnergy variant="hero" />
      <div className="relative z-10 w-full max-w-xl rounded-[28px] border border-[#30363D] bg-[#161B22]/88 p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-12">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full border border-[#00F0FF]/25 bg-[#00F0FF]/6 shadow-[0_0_50px_rgba(0,240,255,.12)]">
          <BrainCircuit className="h-10 w-10 text-[#00F0FF]" />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/15 bg-[#D4FF00]/5 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-[#D4FF00]">
          <Radar className="h-3.5 w-3.5" /> rota fora do córtex
        </div>
        <h1 className="mt-5 text-6xl font-black tracking-[-.07em] text-white">404<span className="text-[#D4FF00]">.</span></h1>
        <p className="mt-3 text-lg font-bold text-slate-200">Esta onda não existe no mapa neural.</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">O endereço <span className="text-slate-300">{location.pathname}</span> não corresponde a uma rota ativa da Zica.ai.</p>
        <Link to="/" className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black text-[#0D1117] shadow-[0_0_30px_rgba(212,255,0,.16)] transition hover:-translate-y-0.5">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Cérebro de Tráfego
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
