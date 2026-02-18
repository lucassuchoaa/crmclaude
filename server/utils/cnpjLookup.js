/**
 * CNPJ Lookup Utility
 * Consulta CNPJ via BrasilAPI + fallback ReceitaWS
 * Retorna objeto normalizado
 */

export async function lookupCnpj(cleanCnpj) {
  let data = null;

  // Tenta BrasilAPI primeiro
  try {
    const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
      headers: { 'User-Agent': 'CRMSomapay/1.0' }
    });
    if (brasilApiResponse.ok) {
      data = await brasilApiResponse.json();
    }
  } catch (e) {
    console.log('BrasilAPI indisponível, tentando ReceitaWS...');
  }

  // Se BrasilAPI falhar, tenta ReceitaWS
  if (!data) {
    const receitaWsResponse = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CRMSomapay/1.0' }
    });

    if (!receitaWsResponse.ok) {
      if (receitaWsResponse.status === 404 || receitaWsResponse.status === 400) {
        throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { status: 404 });
      }
      if (receitaWsResponse.status === 429) {
        throw Object.assign(new Error('Muitas consultas. Aguarde alguns segundos.'), { status: 429 });
      }
      throw new Error(`ReceitaWS error: ${receitaWsResponse.status}`);
    }

    const receitaData = await receitaWsResponse.json();

    if (receitaData.status === 'ERROR') {
      throw Object.assign(new Error(receitaData.message || 'CNPJ não encontrado.'), { status: 404 });
    }

    // Normaliza dados do ReceitaWS
    data = {
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
      }))
    };
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
      completo: `${data.logradouro}, ${data.numero}${data.complemento ? ' ' + data.complemento : ''} - ${data.bairro}, ${data.municipio}/${data.uf}`
    },
    telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : null,
    email: data.email,
    socios: data.qsa?.map(s => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio,
      data_entrada: s.data_entrada_sociedade
    })) || []
  };
}

export default { lookupCnpj };
