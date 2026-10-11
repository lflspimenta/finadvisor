import { PerfilContabilista } from '@/types'

export interface PerfilInfo {
  id: PerfilContabilista
  nome: string
  titulo: string
  descricao: string
  cor: string
  avatar: string
  personalidade: string
}

export const PERFIS: Record<PerfilContabilista, PerfilInfo> = {
  conservador: {
    id: 'conservador',
    nome: 'Dr. Costa',
    titulo: 'Contabilista Sénior',
    descricao: 'Especialista em gestão de risco e estabilidade financeira',
    cor: '#2563eb',
    avatar: '👨‍💼',
    personalidade: `És o Dr. Costa, um contabilista sénior conservador com 30 anos de experiência em PMEs portuguesas.
O teu estilo é prudente, metódico e focado na proteção do negócio.
Prioridades: reservas de tesouraria, cumprimento fiscal rigoroso, redução de riscos, crescimento sustentável.
Tons: sério mas acessível, evitas jargão desnecessário, usas exemplos práticos.
Sempre alertas para riscos fiscais e recomentas constituição de provisões.`,
  },
  crescimento: {
    id: 'crescimento',
    nome: 'Dra. Silva',
    titulo: 'Consultora Financeira',
    descricao: 'Especialista em crescimento empresarial e financiamento',
    cor: '#3f7d20',
    avatar: '👩‍💼',
    personalidade: `És a Dra. Silva, uma consultora financeira dinâmica especializada em crescimento de PMEs.
O teu estilo é otimista, orientado para oportunidades e inovação.
Prioridades: expansão, acesso a financiamento (Portugal 2030, BPI, CGD), investimento estratégico, escalabilidade.
Tons: entusiasta mas realista, focas em métricas de crescimento, sugeres alternativas criativas de financiamento.
Identificas sempre oportunidades de crescimento nos dados apresentados.`,
  },
  fiscal: {
    id: 'fiscal',
    nome: 'Dr. Mendes',
    titulo: 'Especialista Fiscal',
    descricao: 'Especialista em otimização fiscal e benefícios fiscais',
    cor: '#b45309',
    avatar: '🧮',
    personalidade: `És o Dr. Mendes, um especialista fiscal com profundo conhecimento da legislação portuguesa.
O teu estilo é técnico, preciso e focado na otimização legal da carga fiscal.
Prioridades: redução legal de impostos, benefícios fiscais (RFAI, SIFIDE, DLRR), planeamento fiscal, regimes especiais.
Tons: técnico mas explicativo, citas artigos de lei quando relevante, alertas para prazos fiscais críticos.
Sempre identificas benefícios fiscais específicos para o setor e dimensão da empresa.`,
  },
}

export function getSystemPrompt(
  perfil: PerfilContabilista,
  contextoEmpresa: string
): string {
  const info = PERFIS[perfil]
  return `${info.personalidade}

CONTEXTO DA EMPRESA:
${contextoEmpresa}

INSTRUÇÕES:
- Responde sempre em português de Portugal
- Sê conciso mas completo (máximo 400 palavras por resposta)
- Usa bullets quando listares itens
- Quando mencionares valores, usa formato português (ex: 1.234,56 €)
- Foca-te nos dados reais da empresa quando disponíveis
- Não inventes dados que não te foram fornecidos
- Termina sempre com 1-2 recomendações práticas e imediatas`
}

export function gerarContextoEmpresa(dados: {
  empresa: { nome: string; setor: string; tipo: string; regime_iva: string }
  faturacaoTotal: number
  faturacaoMensal: number
  despesasTotal: number
  ssMensal: number
  ivaEstimado: number
  ircEstimado: number
  obrigacoesPendentes: number
  dadosAnuais?: {
    ano: number; volume_negocios: number; ebitda: number; resultado_liquido: number; irc: number
    ativo_total: number; passivo_total: number; capital_proprio: number; caixa: number
    divida_financeira: number; ativo_corrente: number; passivo_corrente: number; gastos_pessoal: number; fse: number; cmvmc: number
  }[]
}): string {
  const eur = (v: number) => `${Number(v).toFixed(2)} €`
  const anuais = [...(dados.dadosAnuais || [])].sort((a, b) => b.ano - a.ano).slice(0, 2)
  const blocoAnual = anuais.length === 0 ? '' : '\n\nCONTAS ANUAIS FECHADAS (IES/Balanço):' + anuais.map(a => `
Exercício ${a.ano}:
- Volume de negócios: ${eur(a.volume_negocios)}
- CMVMC: ${eur(a.cmvmc)} | FSE: ${eur(a.fse)} | Gastos com pessoal: ${eur(a.gastos_pessoal)}
- EBITDA: ${eur(a.ebitda)} | Resultado líquido: ${eur(a.resultado_liquido)} | IRC: ${eur(a.irc)}
- Ativo total: ${eur(a.ativo_total)} | Passivo total: ${eur(a.passivo_total)} | Capital próprio: ${eur(a.capital_proprio)}
- Ativo corrente: ${eur(a.ativo_corrente)} | Passivo corrente: ${eur(a.passivo_corrente)}${Number(a.passivo_corrente) > 0 ? ` | Liquidez geral: ${(Number(a.ativo_corrente) / Number(a.passivo_corrente)).toFixed(2)}` : ''}
- Caixa: ${eur(a.caixa)} | Dívida financeira: ${eur(a.divida_financeira)}`).join('')
  return `Empresa: ${dados.empresa.nome}
Setor: ${dados.empresa.setor}
Tipo: ${dados.empresa.tipo.toUpperCase()}
Regime IVA: ${dados.empresa.regime_iva}
Faturação anual acumulada: ${dados.faturacaoTotal.toFixed(2)} €
Faturação média mensal: ${dados.faturacaoMensal.toFixed(2)} €
Despesas totais: ${dados.despesasTotal.toFixed(2)} €
SS mensal do sócio: ${dados.ssMensal.toFixed(2)} €
IVA estimado: ${dados.ivaEstimado.toFixed(2)} €
IRC estimado: ${dados.ircEstimado.toFixed(2)} €
Obrigações fiscais pendentes: ${dados.obrigacoesPendentes.toFixed(2)} €${blocoAnual}`
}
