# ZY-Trading-Backend

Backend для персональной торговой системы ZY Trading.

## Market Data — диагностика провайдеров

Эндпоинты для проверки, что внешние API возвращают актуальные данные по инструменту.

### Stocks — Twelve Data (fallback Polygon)

```
GET /api/market/stocks/:ticker
```

**Провайдер:** Twelve Data, при ошибке или отсутствии ключа — Polygon.

```bash
curl https://zy-trading-backend-production.up.railway.app/api/market/stocks/CVS
```

### Crypto — CryptoCompare

```
GET /api/market/crypto/:ticker
```

**Провайдер:** CryptoCompare.

```bash
curl https://zy-trading-backend-production.up.railway.app/api/market/crypto/BTCUSDT
```

### Forex — Stooq

```
GET /api/market/forex/:ticker
```

**Провайдер:** Stooq. Тикер в формате Stooq — строчные буквы, без разделителя: `eurusd`, `gbpjpy`, `usdjpy`.

```bash
curl https://zy-trading-backend-production.up.railway.app/api/market/forex/eurusd
```

### Пример ответа

```json
{
  "success": true,
  "ticker": "CVS",
  "marketType": "stocks",
  "source": "twelveData",
  "price": 102.45,
  "currentBar": {
    "date": "2026-07-06",
    "timestamp": 1751760000000,
    "open": 101.2,
    "high": 103.1,
    "low": 100.8,
    "close": 102.45,
    "volume": 1234567
  },
  "lastClosedBar": {
    "date": "2026-07-05",
    "timestamp": 1751673600000,
    "open": 97.1,
    "high": 99.0,
    "low": 96.5,
    "close": 98.5,
    "volume": 987654
  },
  "barsCount": 64,
  "ohlcvSummary": "2026-07-02 O:95.1 H:96.2 L:94.8 C:95.5 V:1100000\n..."
}
```

### Поля ответа

| Поле | Описание |
|------|----------|
| `source` | Какой провайдер ответил: `twelveData`, `polygon`, `cryptoCompare` или `stooq` |
| `price` | Текущая цена — close текущего бара, если есть, иначе последний закрытый |
| `currentBar` | Сегодняшний незакрытый бар. У Polygon и Stooq — `null` (только закрытые дневные данные) |
| `lastClosedBar` | Последний полностью закрытый дневной бар |
| `barsCount` | Количество закрытых баров в выборке |
| `ohlcvSummary` | Последние 5 баров в текстовом виде |

### Ошибки

| Код | Когда |
|-----|-------|
| `400` | Не передан `ticker` |
| `502` | Провайдер недоступен или вернул ошибку |

### Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `TWELVE_DATA_API_KEY` | Stocks через Twelve Data (рекомендуется). Без ключа — fallback на Polygon |
| `POLYGON_API_KEY` | Fallback для stocks |
| `CRYPTOCOMPARE_API_KEY` | Crypto |
| — | Forex через Stooq, ключ не требуется |
