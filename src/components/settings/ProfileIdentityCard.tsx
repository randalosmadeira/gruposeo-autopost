import { FormEvent, useEffect, useState } from 'react';
import { IdCard, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

const MAX_DISPLAY_NAME_LENGTH = 120;

export function ProfileIdentityCard() {
  const { user } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    setDisplayName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  const normalizedName = displayName.trim().replace(/\s+/g, ' ');
  const currentName = profile?.full_name?.trim() ?? '';
  const canSave = normalizedName.length >= 2
    && normalizedName.length <= MAX_DISPLAY_NAME_LENGTH
    && normalizedName !== currentName
    && !updateProfile.isPending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    await updateProfile.mutateAsync({ full_name: normalizedName });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <IdCard className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Identificação do usuário</CardTitle>
            <CardDescription>
              Altere o nome exibido no cabeçalho e nos registros operacionais. O e-mail e o nível de acesso não são modificados.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="profile-display-name">Nome de exibição</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="name"
              disabled={isLoading || updateProfile.isPending}
              aria-describedby="profile-display-name-help"
            />
            <p id="profile-display-name-help" className="text-xs text-muted-foreground">
              Use entre 2 e {MAX_DISPLAY_NAME_LENGTH} caracteres. Espaços repetidos são normalizados ao salvar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-login-email">E-mail de login</Label>
            <Input id="profile-login-email" value={user?.email ?? ''} readOnly aria-readonly="true" />
          </div>

          <Button type="submit" disabled={!canSave}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {updateProfile.isPending ? 'Salvando...' : 'Salvar nome'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
