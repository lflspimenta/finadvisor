/**
 * Custos com pessoal (modelo por total mensal).
 * Regras 2026:
 * - TSU trabalhadores: empresa 23,75% + trabalhador 11%.
 * - Gerentes (MOE) com proteção no desemprego: empresa 23,75% + MOE 11% (34,75%);
 *   restantes MOE: empresa 20,3% + MOE 9,3%. Base mínima: 1 IAS (537,13 € em 2026).
 * - Contribuições SS pagas entre o dia 1 e 25 do mês seguinte (DL 127/2025).
 * - Retenções de IRS entregues até dia 20 do mês seguinte.
 */

export interface ConfigPessoal {
  n_trabalhadores: number
  massa_salarial_mensal: number
  subsidio_alimentacao_mensal: number
  subsidios_duodecimos: boolean
  mes_subsidio_ferias: number
  mes_subsidio_natal: number
  taxa_tsu_empresa: number
  taxa_irs_trabalhadores: number
  outros_encargos_pct: number
  gerente_regime: 'com_desemprego' | 'outros'
  gerente_14_meses: boolean
  taxa_irs_gerente: number
}

export const IAS: Record<number, number> = { 2025: 522.5, 2026: 537.13 }
export const iasDoAno = (ano: number) => IAS[ano] ?? IAS[Math.max(...Object.keys(IAS).map(Number))]

export const TAXA_SS_TRABALHADOR = 0.11
export const TAXAS_GERENTE = {
  com_desemprego: { entidade: 0.2375, membro: 0.11 },
  outros: { entidade: 0.203, membro: 0.093 },
}

export const CONFIG_PESSOAL_PADRAO: ConfigPessoal = {
  n_trabalhadores: 0,
  massa_salarial_mensal: 0,
  subsidio_alimentacao_mensal: 0,
  subsidios_duodecimos: false,
  mes_subsidio_ferias: 6,
  mes_subsidio_natal: 12,
  taxa_tsu_empresa: 0.2375,
  taxa_irs_trabalhadores: 0,
  outros_encargos_pct: 0,
  gerente_regime: 'com_desemprego',
  gerente_14_meses: false,
  taxa_irs_gerente: 0,
}

export interface CustosPessoalMes {
  remuneracoesTrabalhadores: number   // brutas, incl. subsídios do mês
  remuneracaoGerente: number          // bruta, incl. subsídios do mês
  alimentacao: number
  outrosEncargos: number
  ssEntidade: number                  // custo da empresa
  ssTotal: number                     // a entregar à SS no mês seguinte (empresa + trabalhadores + gerente)
  irsRetido: number                   // a entregar à AT no mês seguinte
  liquidoPago: number                 // pago no próprio mês (salários líquidos + alimentação)
  custoEmpresa: number                // remunerações + SS entidade + alimentação + outros encargos
}

const r2 = (v: number) => Math.round(v * 100) / 100

function fatorSubsidios(mes: number, duodecimos: boolean, mesFerias: number, mesNatal: number): number {
  if (duodecimos) return 1 + 2 / 12
  return 1 + (mes === mesFerias ? 1 : 0) + (mes === mesNatal ? 1 : 0)
}

export function custosPessoalMes(cfg: ConfigPessoal, remuneracaoGerenteMensal: number, ano: number, mes: number): CustosPessoalMes {
  const f = fatorSubsidios(mes, cfg.subsidios_duodecimos, cfg.mes_subsidio_ferias, cfg.mes_subsidio_natal)
  const remTrab = Number(cfg.massa_salarial_mensal) * f
  const fGer = cfg.gerente_14_meses ? f : 1
  const remGer = Number(remuneracaoGerenteMensal || 0) * fGer
  const tg = TAXAS_GERENTE[cfg.gerente_regime] || TAXAS_GERENTE.com_desemprego
  const baseGer = remGer > 0 ? Math.max(remGer, iasDoAno(ano)) : 0

  const ssTrabEntidade = remTrab * Number(cfg.taxa_tsu_empresa)
  const ssTrabTrabalhador = remTrab * TAXA_SS_TRABALHADOR
  const ssGerEntidade = baseGer * tg.entidade
  const ssGerMembro = baseGer * tg.membro
  const irsTrab = remTrab * Number(cfg.taxa_irs_trabalhadores)
  const irsGer = remGer * Number(cfg.taxa_irs_gerente)
  const alimentacao = Number(cfg.subsidio_alimentacao_mensal)
  const outros = remTrab * Number(cfg.outros_encargos_pct)

  const ssEntidade = ssTrabEntidade + ssGerEntidade
  return {
    remuneracoesTrabalhadores: r2(remTrab),
    remuneracaoGerente: r2(remGer),
    alimentacao: r2(alimentacao),
    outrosEncargos: r2(outros),
    ssEntidade: r2(ssEntidade),
    ssTotal: r2(ssEntidade + ssTrabTrabalhador + ssGerMembro),
    irsRetido: r2(irsTrab + irsGer),
    liquidoPago: r2(remTrab - ssTrabTrabalhador - irsTrab + remGer - ssGerMembro - irsGer + alimentacao),
    custoEmpresa: r2(remTrab + remGer + ssEntidade + alimentacao + outros),
  }
}

/** Custo anual da empresa com pessoal. */
export function custoPessoalAno(cfg: ConfigPessoal, remuneracaoGerenteMensal: number, ano: number, ateMes = 12): number {
  let t = 0
  for (let m = 1; m <= ateMes; m++) t += custosPessoalMes(cfg, remuneracaoGerenteMensal, ano, m).custoEmpresa
  return r2(t)
}

/** Encargo anual da empresa com a SS do gerente (usado para não o contar duas vezes nas importações). */
export function ssEntidadeGerenteAnual(remuneracaoGerenteMensal: number, regime: ConfigPessoal['gerente_regime'] = 'com_desemprego', ano = new Date().getFullYear()): number {
  if (!remuneracaoGerenteMensal) return 0
  return r2(Math.max(remuneracaoGerenteMensal, iasDoAno(ano)) * TAXAS_GERENTE[regime].entidade * 12)
}
