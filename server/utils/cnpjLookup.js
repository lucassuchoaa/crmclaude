/**
 * CNPJ Lookup Utility
 * Prioridade: Lemit Dados → BrasilAPI → ReceitaWS
 * Retorna objeto normalizado
 */

/**
 * Consulta CNPJ via Lemit Dados API
 * Doc: POST https://api.lemit.com.br/api/v1/consulta/empresa
 * Body: documento=CNPJ (apenas números)
 * Auth: Bearer token no header Authorization
 */
async function lookupLemit(cleanCnpj) {
  const token = process.env.LEMIT_API_TOKEN;
  if (!token) return null;

  const response = await fetch('https://api.lemit.com.br/api/v1/consulta/empresa', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `documento=${cleanCnpj}`,
  });

  if (!response.ok) {
    console.log(`Lemit API HTTP error: ${response.status}`);
    return null;
  }

  const result = await response.json();
  if (result.error) {
    console.log(`Lemit API error: ${result.error}`);
    return null;
  }

  const emp = result.empresa;
  if (!emp) return null;

  // Monta telefone principal (celular com melhor ranking, senão fixo)
  const bestPhone = emp.celulares?.[0] || emp.fixos?.[0];
  const phoneStr = bestPhone ? `(${bestPhone.ddd}) ${bestPhone.numero}` : null;

  // Monta lista de todos os telefones
  const allPhones = [
    ...(emp.celulares || []).map(t => ({ ddd: t.ddd, numero: t.numero, tipo: 'celular', whatsapp: t.whatsapp, ranking: t.ranking })),
    ...(emp.fixos || []).map(t => ({ ddd: t.ddd, numero: t.numero, tipo: 'fixo', ranking: t.ranking })),
  ];

  // Email principal
  const bestEmail = emp.emails?.[0]?.email || null;

  return {
    cnpj: emp.cnpj,
    razao_social: emp.razao_social,
    nome_fantasia: emp.nome_fantasia || emp.razao_social,
    descricao_situacao_cadastral: emp.situacao,
    capital_social: emp.socios?.reduce((s, sc) => s + (sc.capital_social || 0), 0) || 0,
    data_inicio_atividade: emp.data_fundacao ? emp.data_fundacao.split('T')[0] : null,
    cnae_fiscal_descricao: emp.cnae?.descricao,
    cnae_fiscal: emp.cnae?.numero,
    natureza_juridica: emp.tipo,
    porte: emp.tipo,
    logradouro: emp.endereco?.logradouro || emp.endereco?.endereco,
    numero: emp.endereco?.numero,
    complemento: emp.endereco?.complemento,
    bairro: emp.endereco?.bairro,
    municipio: emp.endereco?.cidade,
    uf: emp.endereco?.uf,
    cep: emp.endereco?.cep,
    ddd_telefone_1: phoneStr,
    email: bestEmail,
    qsa: (emp.socios || []).map(s => ({
      nome_socio: s.nome,
      qualificacao_socio: s.participacao ? `${s.participacao}%` : null,
      data_entrada_sociedade: null,
    })),
    // Dados extras da Lemit
    telefones: allPhones,
    emails: (emp.emails || []).map(e => e.email),
    num_funcionarios: null,
    _source: 'lemit',
  };
}

/**
 * Consulta CNPJ via BrasilAPI
 */
async function lookupBrasilAPI(cleanCnpj) {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
    headers: { 'User-Agent': 'CRMSomapay/1.0' }
  });
  if (!response.ok) return null;
  const data = await response.json();
  data._source = 'brasilapi';
  return data;
}

/**
 * Consulta CNPJ via ReceitaWS
 */
async function lookupReceitaWS(cleanCnpj) {
  const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'CRMSomapay/1.0' }
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { status: 404 });
    }
    if (response.status === 429) {
      throw Object.assign(new Error('Muitas consultas. Aguarde alguns segundos.'), { status: 429 });
    }
    throw new Error(`ReceitaWS error: ${response.status}`);
  }

  const receitaData = await response.json();
  if (receitaData.status === 'ERROR') {
    throw Object.assign(new Error(receitaData.message || 'CNPJ não encontrado.'), { status: 404 });
  }

  return {
    cnpj: receitaData.cnpj,
    razao_social: receitaData.nome,
    nome_fantasia: receitaData.fantasia,
    descricao_situacao_cadastral: receitaData.situacao,
    data_situacao_cadastral: receitaData.data_situacao,
    capital_social: parseFloat(receitaData.capital_social?.replace(/[^\d,]/g, '').replace(',', '.')) || 0,
    data_inicio_atividade: receitaData.abertura,
    cnae_fiscal_descricao: receitaData.atividade_principal?.[0]?.text,
    cnae_fiscal: receitaData.atividade_principal?.[0]?.code,
    natureza_juridica: receitaData.natureza_juridica,
    porte: receitaData.porte,
    logradouro: receitaData.logradouro,
    numero: receitaData.numero,
    complemento: receitaData.complemento,
    bairro: receitaData.bairro,
    municipio: receitaData.municipio,
    uf: receitaData.uf,
    cep: receitaData.cep,
    ddd_telefone_1: receitaData.telefone,
    email: receitaData.email,
    qsa: receitaData.qsa?.map(s => ({
      nome_socio: s.nome,
      qualificacao_socio: s.qual
    })),
    _source: 'receitaws',
  };
}

/**
 * Consulta CNPJ com prioridade: Lemit → BrasilAPI → ReceitaWS
 */
export async function lookupCnpj(cleanCnpj) {
  let data = null;

  // 1. Tenta Lemit primeiro (dados mais completos: telefones, emails, sócios)
  try {
    data = await lookupLemit(cleanCnpj);
    if (data) console.log(`CNPJ ${cleanCnpj} consultado via Lemit`);
  } catch (e) {
    console.log('Lemit indisponível:', e.message);
  }

  // 2. Fallback: BrasilAPI
  if (!data) {
    try {
      data = await lookupBrasilAPI(cleanCnpj);
      if (data) console.log(`CNPJ ${cleanCnpj} consultado via BrasilAPI`);
    } catch (e) {
      console.log('BrasilAPI indisponível:', e.message);
    }
  }

  // 3. Fallback: ReceitaWS
  if (!data) {
    data = await lookupReceitaWS(cleanCnpj);
    if (data) console.log(`CNPJ ${cleanCnpj} consultado via ReceitaWS`);
  }

  if (!data) {
    throw Object.assign(new Error('CNPJ não encontrado em nenhuma fonte.'), { status: 404 });
  }

  // Formata resposta padronizada
  return {
    cnpj: data.cnpj,
    razao_social: data.razao_social,
    nome_fantasia: data.nome_fantasia || data.razao_social,
    situacao: data.descricao_situacao_cadastral,
    data_situacao: data.data_situacao_cadastral,
    capital_social: data.capital_social,
    data_inicio_atividade: data.data_inicio_atividade,
    cnae_principal: data.cnae_fiscal_descricao,
    cnae_codigo: data.cnae_fiscal,
    natureza_juridica: data.natureza_juridica,
    porte: data.porte,
    endereco: {
      logradouro: data.logradouro,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      municipio: data.municipio,
      uf: data.uf,
      cep: data.cep,
      completo: [data.logradouro, data.numero, data.complemento].filter(Boolean).join(', ') +
        (data.bairro ? ` - ${data.bairro}` : '') +
        (data.municipio ? `, ${data.municipio}` : '') +
        (data.uf ? `/${data.uf}` : '')
    },
    telefone: data.ddd_telefone_1 || null,
    email: data.email,
    telefones: data.telefones || [],
    emails: data.emails || [],
    num_funcionarios: data.num_funcionarios || null,
    socios: (data.qsa || []).map(s => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio,
      data_entrada: s.data_entrada_sociedade
    })),
    _source: data._source || 'unknown',
  };
}

export default { lookupCnpj };
