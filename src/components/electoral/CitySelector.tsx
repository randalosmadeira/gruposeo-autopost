import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, Loader2, MapPin, Search, X } from 'lucide-react';
import {
  ALL_SP_CITIES,
  SP_REGIONS,
  fetchAllSpMunicipalities,
  fetchSpCapitalDistricts,
} from '@/data/sp-cities';

interface CitySelectorProps {
  selectedCities: string[];
  onCitiesChange: (cities: string[]) => void;
  selectedDistricts?: string[];
  onDistrictsChange?: (districts: string[]) => void;
}

export function CitySelector({
  selectedCities,
  onCitiesChange,
  selectedDistricts = [],
  onDistrictsChange,
}: CitySelectorProps) {
  const [search, setSearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');
  const [allMunicipalities, setAllMunicipalities] = useState<string[]>(ALL_SP_CITIES);
  const [capitalDistricts, setCapitalDistricts] = useState<string[]>([]);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [sourceWarning, setSourceWarning] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingMunicipalities(true);
    fetchAllSpMunicipalities(controller.signal)
      .then((cities) => {
        setAllMunicipalities(cities);
        setSourceWarning(cities.length === 645 ? '' : `IBGE retornou ${cities.length} municípios; confira atualização da base.`);
      })
      .catch(() => {
        setSourceWarning('API do IBGE indisponível; exibindo atalhos regionais locais como fallback.');
        setAllMunicipalities(ALL_SP_CITIES);
      })
      .finally(() => setIsLoadingMunicipalities(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCities.includes('São Paulo')) {
      setCapitalDistricts([]);
      if (selectedDistricts.length && onDistrictsChange) onDistrictsChange([]);
      return;
    }

    const controller = new AbortController();
    setIsLoadingDistricts(true);
    fetchSpCapitalDistricts(controller.signal)
      .then(setCapitalDistricts)
      .catch(() => setCapitalDistricts([]))
      .finally(() => setIsLoadingDistricts(false));
    return () => controller.abort();
  }, [selectedCities, onDistrictsChange, selectedDistricts.length]);

  const filteredMunicipalities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return allMunicipalities;
    return allMunicipalities.filter((city) => city.toLocaleLowerCase('pt-BR').includes(query));
  }, [allMunicipalities, search]);

  const filteredDistricts = useMemo(() => {
    const query = districtSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return capitalDistricts;
    return capitalDistricts.filter((district) => district.toLocaleLowerCase('pt-BR').includes(query));
  }, [capitalDistricts, districtSearch]);

  const toggleCity = (city: string) => {
    onCitiesChange(
      selectedCities.includes(city)
        ? selectedCities.filter((item) => item !== city)
        : [...selectedCities, city],
    );
  };

  const toggleDistrict = (district: string) => {
    if (!onDistrictsChange) return;
    onDistrictsChange(
      selectedDistricts.includes(district)
        ? selectedDistricts.filter((item) => item !== district)
        : [...selectedDistricts, district],
    );
  };

  const selectRegion = (cities: readonly string[]) => {
    const next = new Set([...selectedCities, ...cities]);
    onCitiesChange(Array.from(next));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-primary" /> Cobertura territorial editorial — Estado de São Paulo
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{allMunicipalities.length} municípios na base</Badge>
              <Badge variant="outline">{selectedCities.length} selecionado(s)</Badge>
              {selectedCities.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onCitiesChange([])}>
                  <X className="mr-1 h-3 w-3" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Fonte territorial: API oficial de Localidades do IBGE (UF 35). A localidade serve para contexto factual e organização editorial, não para perfilamento individual ou recomendação de voto.
            {sourceWarning && <div className="mt-1 text-amber-700 dark:text-amber-400">{sourceWarning}</div>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Atalhos por região editorial</p>
            <div className="flex flex-wrap gap-2">
              {SP_REGIONS.map((region) => (
                <Button key={region.region} size="sm" variant="outline" onClick={() => selectRegion(region.cities)}>
                  {region.region}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar qualquer município de SP..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>

          {selectedCities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedCities.map((city) => (
                <Badge key={city} className="cursor-pointer gap-1 text-xs" onClick={() => toggleCity(city)}>
                  {city} <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          <ScrollArea className="h-72 rounded-md border">
            <div className="flex flex-wrap gap-1.5 p-3">
              {isLoadingMunicipalities && (
                <div className="flex w-full items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando municípios do IBGE...
                </div>
              )}
              {!isLoadingMunicipalities && filteredMunicipalities.map((city) => (
                <Badge
                  key={city}
                  variant={selectedCities.includes(city) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleCity(city)}
                >
                  {selectedCities.includes(city) && <CheckCircle className="mr-1 h-3 w-3" />}
                  {city}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedCities.includes('São Paulo') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distritos do Município de São Paulo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Distritos carregados da API oficial do IBGE. “Bairro” não é uma divisão territorial nacional padronizada pelo IBGE; bairros devem ser importados de fonte municipal oficial antes de serem marcados como cobertura completa.
            </div>
            <Input placeholder="Buscar distrito..." value={districtSearch} onChange={(event) => setDistrictSearch(event.target.value)} />
            <ScrollArea className="h-48 rounded-md border">
              <div className="flex flex-wrap gap-1.5 p-3">
                {isLoadingDistricts && <Loader2 className="h-4 w-4 animate-spin" />}
                {!isLoadingDistricts && filteredDistricts.map((district) => (
                  <Badge
                    key={district}
                    variant={selectedDistricts.includes(district) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleDistrict(district)}
                  >
                    {district}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
