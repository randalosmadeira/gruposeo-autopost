import React from 'react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl text-foreground">
          Instruções de Operação
        </h1>
        <p className="text-lg text-muted-foreground">
          Leia o arquivo instrucoes.md em anexo e siga as instruções. Analise também os demais arquivos anexados.
        </p>
      </div>
    </div>
  );
};

export default Index;
