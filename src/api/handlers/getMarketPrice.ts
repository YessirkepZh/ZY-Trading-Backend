import type { FastifyRequest, FastifyReply } from 'fastify';
import * as marketDataService from '../../services/marketDataService';

type TickerParams = { ticker: string };

export async function getStockPriceHandler(
  request: FastifyRequest<{ Params: TickerParams }>,
  reply: FastifyReply,
): Promise<void> {
  const ticker = request.params.ticker?.trim();
  if (!ticker) {
    reply.status(400).send({ success: false, error: 'ticker is required' });
    return;
  }

  try {
    const quote = await marketDataService.getStockPrice(ticker);
    reply.send({ success: true, ...quote });
  } catch (err) {
    request.log.error({ err, ticker }, 'getStockPrice failed');
    reply.status(502).send({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch stock price',
    });
  }
}

export async function getCryptoPriceHandler(
  request: FastifyRequest<{ Params: TickerParams }>,
  reply: FastifyReply,
): Promise<void> {
  const ticker = request.params.ticker?.trim();
  if (!ticker) {
    reply.status(400).send({ success: false, error: 'ticker is required' });
    return;
  }

  try {
    const quote = await marketDataService.getCryptoPrice(ticker);
    reply.send({ success: true, ...quote });
  } catch (err) {
    request.log.error({ err, ticker }, 'getCryptoPrice failed');
    reply.status(502).send({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch crypto price',
    });
  }
}

export async function getForexPriceHandler(
  request: FastifyRequest<{ Params: TickerParams }>,
  reply: FastifyReply,
): Promise<void> {
  const ticker = request.params.ticker?.trim();
  if (!ticker) {
    reply.status(400).send({ success: false, error: 'ticker is required' });
    return;
  }

  try {
    const quote = await marketDataService.getForexPrice(ticker);
    reply.send({ success: true, ...quote });
  } catch (err) {
    request.log.error({ err, ticker }, 'getForexPrice failed');
    reply.status(502).send({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch forex price',
    });
  }
}
