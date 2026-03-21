/**
 * AI Agent service — proxy for OpenAI/Claude API
 * Provides lead analysis, message drafting, cadence suggestions
 */

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250514';

export async function chatWithAI(messages, context, db) {
  // Try Claude first, fallback to OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return callClaude(anthropicKey, messages, context);
  } else if (openaiKey) {
    return callOpenAI(openaiKey, messages, context);
  } else {
    throw new Error('Nenhuma API key de IA configurada (ANTHROPIC_API_KEY ou OPENAI_API_KEY)');
  }
}

async function callClaude(apiKey, messages, context) {
  const systemPrompt = buildSystemPrompt(context);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  return { text, tokens_used: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0), model: data.model };
}

async function callOpenAI(apiKey, messages, context) {
  const systemPrompt = buildSystemPrompt(context);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text, tokens_used: data.usage?.total_tokens || 0, model: data.model };
}

function buildSystemPrompt(context) {
  let prompt = `Você é um assistente de vendas/prospecção B2B integrado a um CRM brasileiro.
Responda sempre em português do Brasil, de forma concisa e prática.
Foque em ajudar o usuário a prospectar, qualificar leads e fechar negócios.`;

  if (context?.lead) {
    prompt += `\n\nContexto do lead atual:
- Nome: ${context.lead.name || 'N/A'}
- Empresa: ${context.lead.company || context.lead.razao_social || 'N/A'}
- CNPJ: ${context.lead.cnpj || 'N/A'}
- Email: ${context.lead.email || 'N/A'}
- Telefone: ${context.lead.phone || 'N/A'}
- Cargo: ${context.lead.job_title || 'N/A'}
- Status: ${context.lead.status || 'N/A'}
- Score: ${context.lead.total_score || 0} (${context.lead.temperature || 'cold'})
- Fonte: ${context.lead.source || 'N/A'}`;
  }

  if (context?.activities?.length) {
    prompt += `\n\nÚltimas atividades:`;
    for (const a of context.activities.slice(0, 10)) {
      prompt += `\n- ${a.type}: ${a.description || a.subject || ''} (${a.created_at})`;
    }
  }

  if (context?.type === 'message_draft') {
    prompt += `\n\nO usuário quer redigir uma mensagem para este lead. Sugira texto profissional e persuasivo.`;
  } else if (context?.type === 'lead_analysis') {
    prompt += `\n\nAnalise este lead e sugira próximos passos para qualificação e conversão.`;
  } else if (context?.type === 'cadence_suggestion') {
    prompt += `\n\nSugira uma estratégia de cadência multicanal para este lead.`;
  }

  return prompt;
}
