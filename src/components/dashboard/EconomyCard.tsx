import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EconomyCardProps {
  totalArticles: number;
  totalImages: number;
}

export function EconomyCard({ totalArticles, totalImages }: EconomyCardProps) {
  // Cost calculation based on average
  const costPerArticle = 0.05;
  const costPerImage = 0.22;
  const totalInvested = (totalArticles * costPerArticle) + (totalImages * costPerImage);
  
  // Savings compared to other platforms
  const minSavingsPerArticle = 1.64;
  const maxSavingsPerArticle = 9.90;
  const minSaved = totalArticles * minSavingsPerArticle;
  const maxSaved = totalArticles * maxSavingsPerArticle;

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <Card className="bg-emerald-50 border-emerald-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          Sua Economia com o MAA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Articles */}
          <div className="text-center p-4 bg-white/60 rounded-xl">
            <p className="text-4xl font-bold text-foreground">{totalArticles}</p>
            <p className="text-sm text-muted-foreground mt-1">Artigos gerados (total)</p>
          </div>

          {/* Total Invested */}
          <div className="text-center p-4 bg-white/60 rounded-xl">
            <p className="text-sm text-muted-foreground">Total Investido com IA*</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">
              {formatCurrency(totalInvested)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalArticles} artigos + {totalImages} imagens
            </p>
          </div>

          {/* Savings */}
          <div className="text-center p-4 bg-white/60 rounded-xl">
            <p className="text-sm text-muted-foreground">Você economizou</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">
              {formatCurrency(minSaved)} ~ {formatCurrency(maxSaved)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              outras plataformas ({formatCurrency(minSavingsPerArticle)} ~ {formatCurrency(maxSavingsPerArticle)}/artigo)
            </p>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          * Estimativa com base no gasto médio dos usuários (R$ 0,05/artigo + R$ 0,22/imagem)
        </p>
      </CardContent>
    </Card>
  );
}
