import type { FastifyInstance } from 'fastify';
import { getStockPriceHandler, getCryptoPriceHandler, getForexPriceHandler } from './handlers/getMarketPrice';

export function registerMarketRoutes(fastify: FastifyInstance): void {
  // Market data diagnostics — verify external API providers
  fastify.get<{ Params: { ticker: string } }>('/api/market/stocks/:ticker', getStockPriceHandler);
  fastify.get<{ Params: { ticker: string } }>('/api/market/crypto/:ticker', getCryptoPriceHandler);
  fastify.get<{ Params: { ticker: string } }>('/api/market/forex/:ticker', getForexPriceHandler);
}
