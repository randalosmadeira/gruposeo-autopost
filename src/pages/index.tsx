import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock } from "lucide-react";

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-[#FF5722] to-[#FF8A65] p-8 text-white shadow-2xl transition-all hover:scale-[1.02]">
          <div className="absolute top-6 left-8 flex items-center gap-2">
            <Badge variant="secondary" className="bg-white/20 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-white/30 border-none px-2 py-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              URGÊNCIA
            </Badge>
          </div>

          <div className="mt-12 mb-6">
            <span className="text-5xl block mb-6 drop-shadow-lg">🚓</span>
            <h1 className="text-3xl font-serif font-semibold leading-tight mb-4">
              Plantão Criminal 24 Horas
            </h1>
            <p className="text-white/90 text-sm leading-relaxed mb-8 font-medium">
              Advogado criminal de plantão para emergências. Flagrante, delegacia, mandado de busca. Atendimento imediato 24h.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {["24 horas", "Delegacia", "Flagrante"].map((tag) => (
              <Badge 
                key={tag} 
                variant="outline" 
                className="bg-white/10 border-white/20 text-white text-[10px] px-3 py-1 hover:bg-white/20"
              >
                {tag}
              </Badge>
            ))}
          </div>

          <button className="flex items-center gap-2 text-sm font-bold group">
            Advogado Criminal Agora 
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </Card>
        
        <p className="mt-8 text-center text-xs text-muted-foreground uppercase tracking-[0.2em] font-medium">
          Leia o arquivo instrucoes.md em anexo e siga as instruções contidas nele.
        </p>
      </div>
    </div>
  );
};

export default Index;
