import { FileText, Image, Link2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface DashboardStatsProps {
  totalArticles: number;
  todayArticles: number;
  imagesGenerated: number;
  todayImages: number;
  linkExtractions: number;
  maxLinkExtractions: number;
}

export function DashboardStats({
  totalArticles,
  todayArticles,
  imagesGenerated,
  todayImages,
  linkExtractions,
  maxLinkExtractions,
}: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Artigos Gerados */}
      <Card className="bg-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Artigos Gerados
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {totalArticles}
              </p>
              {todayArticles > 0 && (
                <p className="text-sm text-green-500 font-medium mt-1">
                  + {todayArticles} hoje
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Imagens Geradas */}
      <Card className="bg-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <Image className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Imagens Geradas
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {imagesGenerated}
              </p>
              {todayImages > 0 && (
                <p className="text-sm text-green-500 font-medium mt-1">
                  + {todayImages} hoje
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extrações de Links */}
      <Card className="bg-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <Link2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Extrações de Links
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {linkExtractions} <span className="text-lg text-muted-foreground font-normal">/ {maxLinkExtractions}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
