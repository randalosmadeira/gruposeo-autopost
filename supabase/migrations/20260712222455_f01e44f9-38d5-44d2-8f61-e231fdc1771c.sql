
-- 1) TABLE
CREATE TABLE public.hyperlocal_title_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('criminal_24h','colarinho_branco','isp','fraude_bancaria','aeroporto','foruns')),
  title text NOT NULL,
  poi_type text CHECK (poi_type IN ('delegacia','forum','tribunal','polo','cartorio','outro')),
  ymyl_subarea text,
  neighborhood_hint text,
  city_hint text,
  is_urgency boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','draft','archived')),
  source text NOT NULL DEFAULT 'seed_geo_2026',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_htt_category ON public.hyperlocal_title_templates(category);
CREATE INDEX idx_htt_user ON public.hyperlocal_title_templates(user_id);
CREATE INDEX idx_htt_status ON public.hyperlocal_title_templates(status);

-- 2) GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hyperlocal_title_templates TO authenticated;
GRANT ALL ON public.hyperlocal_title_templates TO service_role;

-- 3) RLS
ALTER TABLE public.hyperlocal_title_templates ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES
CREATE POLICY "htt_read_globals_and_own"
  ON public.hyperlocal_title_templates FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "htt_insert_own"
  ON public.hyperlocal_title_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "htt_update_own"
  ON public.hyperlocal_title_templates FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "htt_delete_own"
  ON public.hyperlocal_title_templates FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 5) TRIGGER updated_at
CREATE TRIGGER trg_htt_updated_at
  BEFORE UPDATE ON public.hyperlocal_title_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) SEEDS (60 títulos globais — user_id NULL)
INSERT INTO public.hyperlocal_title_templates
  (user_id, category, title, poi_type, ymyl_subarea, neighborhood_hint, city_hint, is_urgency) VALUES
-- 🚨 Criminal 24h (10)
(NULL,'criminal_24h','Preso em flagrante no Aeroporto de Guarulhos (GRU): Como funciona a audiência de custódia na Justiça Federal?','delegacia','penal-empresarial','Cumbica','Guarulhos',true),
(NULL,'criminal_24h','Intimação para depor na 1ª DDM ou delegacias de Santana: O que fazer e como um advogado criminalista pode ajudar?','delegacia','penal-empresarial','Santana','São Paulo',true),
(NULL,'criminal_24h','Plantão Criminal 24h na Zona Leste: Como funciona a Audiência de Custódia no Fórum de Itaquera?','forum','penal-empresarial','Itaquera','São Paulo',true),
(NULL,'criminal_24h','Advogado Criminalista no Tatuapé: O que fazer em caso de busca e apreensão preventiva na Zona Leste?','delegacia','penal-empresarial','Tatuapé','São Paulo',true),
(NULL,'criminal_24h','Fui intimado na Delegacia de Polícia do Brás: Direitos fundamentais e a importância do acompanhamento jurídico.','delegacia','penal-empresarial','Brás','São Paulo',true),
(NULL,'criminal_24h','Lei de Execuções Criminais na prática: Como funciona o pedido de progressão de regime no Fórum de Guarulhos?','forum','penal-empresarial',NULL,'Guarulhos',false),
(NULL,'criminal_24h','Flagrante por crime de estelionato na Zona Sul: Atuação do advogado no plantão policial de Santo Amaro.','delegacia','penal-empresarial','Santo Amaro','São Paulo',true),
(NULL,'criminal_24h','Advogado especialista em Audiência de Custódia perto do Fórum da Barra Funda: Agilidade que faz a diferença.','forum','penal-empresarial','Barra Funda','São Paulo',true),
(NULL,'criminal_24h','Operação da Polícia Civil na Vila Mariana: Como garantir a ampla defesa desde a fase do inquérito policial.','delegacia','penal-empresarial','Vila Mariana','São Paulo',true),
(NULL,'criminal_24h','Habeas Corpus de urgência em São Paulo: Como tirar um familiar da prisão preventiva na Região Central.','forum','penal-empresarial','Sé','São Paulo',true),
-- 💼 Colarinho Branco (10)
(NULL,'colarinho_branco','Fraudes de ICMS em polos industriais de Cumbica e Bonsucesso: Como defender a sua empresa de autuações milionárias.','polo','tributario','Cumbica','Guarulhos',false),
(NULL,'colarinho_branco','Crimes contra a Ordem Econômica e Tributária: Defesa penal empresarial para holdings na Vila Olímpia.','polo','penal-empresarial','Vila Olímpia','São Paulo',false),
(NULL,'colarinho_branco','Blindagem Jurídica e Investigação Defensiva para diretores de empresas em Alphaville e Zona Oeste.','polo','penal-empresarial','Alphaville','Barueri',false),
(NULL,'colarinho_branco','Lavagem de Dinheiro e Ocultação de Bens: Como empresas do Brooklin devem estruturar o Compliance Penal.','polo','penal-empresarial','Brooklin','São Paulo',false),
(NULL,'colarinho_branco','Responsabilidade penal dos sócios por crimes tributários: Análise de jurisprudência no Tribunal de Justiça de SP.','tribunal','tributario',NULL,'São Paulo',false),
(NULL,'colarinho_branco','Minha empresa foi envolvida em uma investigação de sonegação fiscal em Guarulhos: Qual o primeiro passo?','delegacia','tributario',NULL,'Guarulhos',true),
(NULL,'colarinho_branco','Apropriação indébita previdenciária empresarial: Como regularizar e evitar o processo penal na Zona Sul.','polo','tributario',NULL,'São Paulo',false),
(NULL,'colarinho_branco','Assessoria Jurídica Empresarial na Mooca: Como mitigar riscos em contratos comerciais e societários.','polo','penal-empresarial','Mooca','São Paulo',false),
(NULL,'colarinho_branco','Defesa criminal empresarial na Av. Paulista: O que fazer se a sua empresa for alvo de uma operação da Polícia Federal.','delegacia','penal-empresarial','Bela Vista','São Paulo',true),
(NULL,'colarinho_branco','Crimes de concorrência desleal entre empresas de tecnologia em Pinheiros: Mecanismos de defesa jurídica.','polo','penal-empresarial','Pinheiros','São Paulo',false),
-- 🌐 ISPs (10)
(NULL,'isp','Assessoria Jurídica para Provedores de Internet (ISPs) na Zona Leste: Como proteger sua rede contra sanções.','polo','digital-ispss',NULL,'São Paulo',false),
(NULL,'isp','Marco Civil da Internet e a responsabilidade civil de ISPs: Guia para provedores no polo tecnológico de Perdizes.','polo','digital-ispss','Perdizes','São Paulo',false),
(NULL,'isp','Notificação judicial para quebra de sigilo de IP: Como ISPs da Zona Norte devem responder legalmente.','polo','digital-ispss',NULL,'São Paulo',false),
(NULL,'isp','Contratos de trânsito IP e compartilhamento de postes: Blindagem jurídica para provedores em Guarulhos.','polo','digital-ispss',NULL,'Guarulhos',false),
(NULL,'isp','Adequação à LGPD para Provedores de Internet em Pinheiros: Como evitar multas da ANPD.','polo','digital-ispss','Pinheiros','São Paulo',false),
(NULL,'isp','Como ISPs do Butantã devem agir diante de crimes virtuais e estelionato cometidos por usuários da rede.','polo','digital-ispss','Butantã','São Paulo',false),
(NULL,'isp','Defesa administrativa e regulatória contra penalidades da ANATEL para provedores na Zona Sul.','polo','digital-ispss',NULL,'São Paulo',false),
(NULL,'isp','Contratos de permanência e SLA para provedores de banda larga: Proteção jurídica no centro de São Paulo.','polo','digital-ispss','Sé','São Paulo',false),
(NULL,'isp','Furto de cabos e vandalismo de infraestrutura de telecomunicações: Ações cíveis e criminais para ISPs em Itaquera.','polo','digital-ispss','Itaquera','São Paulo',false),
(NULL,'isp','Fusões e Aquisições (M&A) de Provedores de Internet na Vila Madalena: Auditoria jurídica e contratual.','polo','digital-ispss','Vila Madalena','São Paulo',false),
-- 🏦 Fraude bancária (10)
(NULL,'fraude_bancaria','Vítima de fraude do Pix e clonagem de contas: Responsabilidade dos bancos no Fórum de Santo Amaro.','forum','consumidor','Santo Amaro','São Paulo',false),
(NULL,'fraude_bancaria','Golpe do boleto falso em compras corporativas: Como recuperar valores na Justiça Cível de Guarulhos.','forum','consumidor',NULL,'Guarulhos',false),
(NULL,'fraude_bancaria','Sequestro relâmpago e transações bancárias sob coação: Defesa do consumidor de alta renda nos Jardins.','forum','consumidor','Jardins','São Paulo',false),
(NULL,'fraude_bancaria','Fraude interna por engenharia social em empresas do Itaim Bibi: Responsabilidade civil e penal do banco.','forum','consumidor','Itaim Bibi','São Paulo',false),
(NULL,'fraude_bancaria','Como recuperar patrimônio após golpes de falsas plataformas de investimento na Consolação.','forum','consumidor','Consolação','São Paulo',false),
(NULL,'fraude_bancaria','Direito do Consumidor Bancário: Ações contra vazamento de dados de cartões de crédito na Vila Guilherme.','forum','consumidor','Vila Guilherme','São Paulo',false),
(NULL,'fraude_bancaria','Uso de inteligência artificial em golpes de Deepfake de voz: Como as varas cíveis da Lapa estão julgando.','forum','consumidor','Lapa','São Paulo',false),
(NULL,'fraude_bancaria','Negativação indevida e danos morais por fraudes no Brás: Proteção ao micro e pequeno empresário.','forum','consumidor','Brás','São Paulo',false),
(NULL,'fraude_bancaria','Invasão de contas corporativas e desvio de fundos: Ação de reparação contra bancos no Fórum Central (Sé).','forum','consumidor','Sé','São Paulo',false),
(NULL,'fraude_bancaria','Golpe do falso funcionário de banco: Como provar a falha de segurança da instituição financeira em Higienópolis.','forum','consumidor','Higienópolis','São Paulo',false),
-- ✈️ Aeroporto / DEAIN (10)
(NULL,'aeroporto','Retenção de valores e moedas em espécie no Aeroporto de Congonhas (CGH): Como evitar a acusação de Evasão de Divisas.','delegacia','penal-empresarial','Congonhas','São Paulo',true),
(NULL,'aeroporto','Flagrante por Tráfico Internacional de Drogas na DEAIN (Guarulhos): A importância da defesa técnica imediata.','delegacia','penal-empresarial','Cumbica','Guarulhos',true),
(NULL,'aeroporto','Descaminho de mercadorias importadas em Cumbica: Como regularizar bens e evitar o processo criminal federal.','delegacia','tributario','Cumbica','Guarulhos',true),
(NULL,'aeroporto','Investigação de contrabando no Terminal de Cargas do Aeroporto de SP: Atuação do advogado tributarista e penal.','delegacia','tributario','Cumbica','Guarulhos',true),
(NULL,'aeroporto','Uso de passaporte ou documento falso na Polícia Federal aeroportuária: Consequências e rito da audiência de custódia.','delegacia','penal-empresarial','Cumbica','Guarulhos',true),
(NULL,'aeroporto','Tráfico Internacional de Armas e Munições: Competência da Justiça Federal de Guarulhos e teses de defesa.','forum','penal-empresarial',NULL,'Guarulhos',true),
(NULL,'aeroporto','Como funciona o perdimento de bens determinado pela Receita Federal no Aeroporto de São Paulo?','delegacia','tributario','Cumbica','Guarulhos',false),
(NULL,'aeroporto','Lavagem de dinheiro associada ao comércio internacional: Defesa em inquéritos instaurados na PF de Guarulhos.','delegacia','penal-empresarial','Cumbica','Guarulhos',true),
(NULL,'aeroporto','Detido por engano em inspeção de bagagem no aeroporto: Direitos do passageiro e reparação por danos morais.','delegacia','consumidor','Cumbica','Guarulhos',true),
(NULL,'aeroporto','O papel do advogado criminalista em crimes contra a segurança do transporte aéreo (Art. 261 CP) em Congonhas.','delegacia','penal-empresarial','Congonhas','São Paulo',true),
-- 🏢 Fóruns / Tribunais (10)
(NULL,'foruns','Como protocolar uma queixa-crime criminal no Fórum de Santana? Guia prático para empresas locais.','forum','penal-empresarial','Santana','São Paulo',false),
(NULL,'foruns','Ajuizamento de ações de consumo no Juizado Especial Cível (JEC) do Tatuapé: Documentos necessários.','forum','consumidor','Tatuapé','São Paulo',false),
(NULL,'foruns','Onde acontecem as audiências criminais da Zona Leste? Entendendo a competência do Fórum de São Miguel Paulista.','forum','penal-empresarial','São Miguel Paulista','São Paulo',false),
(NULL,'foruns','Despachando com o juiz criminal no Fórum de Guarulhos: Práticas para advogados e correspondentes.','forum','penal-empresarial',NULL,'Guarulhos',false),
(NULL,'foruns','Como funciona o balcão virtual e o atendimento no Tribunal de Justiça de São Paulo (Bela Vista)?','tribunal','penal-empresarial','Bela Vista','São Paulo',false),
(NULL,'foruns','Ações de despejo comercial e recuperação de crédito no Fórum da Lapa: Passo a passo para proprietários.','forum','consumidor','Lapa','São Paulo',false),
(NULL,'foruns','Processo criminal por estelionato no Fórum de Pinheiros: Quanto tempo demora e quais as fases de defesa?','forum','penal-empresarial','Pinheiros','São Paulo',false),
(NULL,'foruns','Como acompanhar um inquérito policial que tramita nas delegacias da Região Central de São Paulo?','delegacia','penal-empresarial','Sé','São Paulo',false),
(NULL,'foruns','Defesas administrativas em autos de infração da prefeitura na Zona Sul: Atuação do direito empresarial.','forum','tributario',NULL,'São Paulo',false),
(NULL,'foruns','Guia de localização e contatos úteis das varas federais da Subseção Judiciária de Guarulhos.','forum','penal-empresarial',NULL,'Guarulhos',false);
