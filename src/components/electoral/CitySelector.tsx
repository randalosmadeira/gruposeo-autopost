import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Search, X, CheckCircle } from 'lucide-react';
import { SP_REGIONS, ALL_SP_CITIES } from '@/data/sp-cities';

interface CitySelectorProps {
  selectedCities: string[];
  onCitiesChange: (cities: string[]) => void;
}

export function CitySelector({ selectedCities, onCitiesChange }: CitySelectorProps) {
  const [search, setSearch] = useState('');

  const filteredRegions = useMemo(() => {
    if (!search.trim()) return SP_REGIONS;
    const q = search.toLowerCase();
    return SP_REGIONS.map(r => ({
      ...r,
      cities: r.cities.filter(c => c.toLowerCase().includes(q)),
    })).filter(r => r.cities.length > 0);
  }, [search]);

  const toggleCity = (city: string) => {
    onCitiesChange(
      selectedCities.includes(city)
        ? selectedCities.filter(c => c !== city)
        : [...selectedCities, city]
    );
  };

  const selectRegion = (cities: string[]) => {
    const newCities = new Set([...selectedCities, ...cities]);
    onCitiesChange(Array.from(newCities));
  };

  const clearAll = () => onCitiesChange([]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Segmentação por Cidades — SP
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selectedCities.length} selecionada(s)</Badge>
            {selectedCities.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Selected cities */}
        {selectedCities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedCities.map(city => (
              <Badge key={city} className="text-xs gap-1 cursor-pointer" onClick={() => toggleCity(city)}>
                {city} <X className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="h-64">
          <div className="space-y-3 pr-3">
            {filteredRegions.map(region => (
              <div key={region.region}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">{region.region}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => selectRegion(region.cities)}
                  >
                    Selecionar região
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {region.cities.map(city => (
                    <Badge
                      key={city}
                      variant={selectedCities.includes(city) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs transition-all hover:shadow-sm"
                      onClick={() => toggleCity(city)}
                    >
                      {selectedCities.includes(city) && <CheckCircle className="w-3 h-3 mr-0.5" />}
                      {city}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
