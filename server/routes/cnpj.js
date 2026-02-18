import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { lookupCnpj } from '../utils/cnpjLookup.js';

const router = express.Router();

/**
 * Consulta CNPJ na Receita Federal via múltiplas APIs (BrasilAPI, ReceitaWS)
 * GET /api/cnpj/:cnpj
 */
router.get('/:cnpj', authenticate, async (req, res) => {
  try {
    const { cnpj } = req.params;
    const cleanCnpj = cnpj.replace(/[^\d]/g, '');

    if (cleanCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Deve conter 14 dígitos.' });
    }

    const result = await lookupCnpj(cleanCnpj);
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('CNPJ lookup error:', error);
    res.status(500).json({ error: 'Erro ao consultar CNPJ. Tente novamente.' });
  }
});

export default router;
