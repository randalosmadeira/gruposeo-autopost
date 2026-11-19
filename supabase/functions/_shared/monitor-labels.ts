/** Constantes e rótulos do monitoramento, sem dependências (a tela importa daqui para não carregar o código do servidor). */
export type Frequency = 'daily' | 'weekly' | 'monthly';
export type Devices = 'mobile' | 'desktop' | 'both';
export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];
export const DEVICES: Devices[] = ['mobile', 'desktop', 'both'];
export const FREQUENCY_LABEL: Record<Frequency, string> = { daily: 'Todo dia', weekly: 'Toda semana', monthly: 'Todo mês' };
export const DEVICES_LABEL: Record<Devices, string> = { mobile: 'Celular', desktop: 'Computador', both: 'Celular e computador' };
export const MAX_EXTRA_URLS = 2;
export const DEFAULT_DROP_POINTS = 10;
