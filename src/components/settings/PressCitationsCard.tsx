import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRESS_ENTITIES = [
  { name: "g1 (Globo)", url: "https://g1.globo.com/politica/eleicoes/2026/quem-sao-os-candidatos/deputado-federal/sp/dr-madeira.ghtml" },
  { name: "Nexo Jornal", url: "https://candidatos.nexojornal.com.br/2026/sp/dr-madeira-250002546639/" },
  { name: "Tribuna PR", url: "https://www.tribunapr.com.br/eleicoes/2026/candidatos/sp/deputado-federal/dr-madeira-missao-1470/" },
  { name: "Cola Eleitoral", url: "https://colaeleitoral.com.br/eleicoes-2026/sp/1470" },
  { name: "Opera Mundi", url: "https://operamundi.uol.com.br/eleicoes-2026/candidatos/dr-madeira/" },
  { name: "Portal do Holanda", url: "https://www.portaldoholanda.com.br/eleicoes/2026/candidato/sp/deputado-federal/dr-madeira-1470-missao" },
  { name: "Regionalzão", url: "https://regionalzao.com.br/eleicoes-2026/candidatos/dr-madeira/" },
  { name: "O Diário da Cidade", url: "https://www.odiariodacidade.com.br/eleicoes-2026/candidato/250002546639/" },
];

export function PressCitationsCard() {
  const [selectedEntities, setSelectedEntities] = useState<string[]>(PRESS_ENTITIES.map(e => e.url));

  const toggleEntity = (url: string) => {
    setSelectedEntities(prev => 
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Entidades de Citação (MAD1470)</CardTitle>
            <CardDescription>
              Gerencie os links de autoridade para o array `sameAs` no Schema.org Person.
            </CardDescription>
          </div>
          <Badge variant="outline" className="ml-2">GEO 2026</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {PRESS_ENTITIES.map((entity) => (
            <div
              key={entity.url}
              className="flex items-center space-x-2 rounded-md border p-3 hover:bg-muted/50 transition-colors"
            >
              <Switch
                id={`entity-${entity.url}`}
                checked={selectedEntities.includes(entity.url)}
                onCheckedChange={() => toggleEntity(entity.url)}
              />
              <div className="flex-1 min-w-0">
                <Label
                  htmlFor={`entity-${entity.url}`}
                  className="text-sm font-medium leading-none cursor-pointer truncate block"
                >
                  {entity.name}
                </Label>
                <a
                  href={entity.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-muted-foreground flex items-center gap-1 hover:text-primary truncate"
                >
                  {entity.url.split('//')[1]}
                  <ExternalLink className="h-2 w-2" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <strong>Regra Muralha:</strong> Apenas perfis de entidade individuais são permitidos no sameAs. URLs de posts de redes sociais ou editais coletivos são filtrados automaticamente no backend.
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="gap-2">
            <Check className="h-4 w-4" />
            Salvar Entidades
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
