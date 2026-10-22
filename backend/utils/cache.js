
const { redisClient } = require("../config/redis");

const getOrSetCache = async (key, fetchData, ttlSeconds = 15) => {
  // Redis ready nahi hai to normal database fetch karo.
  if (!redisClient.isReady) {
    return fetchData();
  }

  try {
    // Pehle Redis mein check karo.
    const cached = await redisClient.get(key);

    if (cached !== null) {
      console.log(`Cache HIT: ${key}`);
      return JSON.parse(cached);
    }

    // Cache miss: fresh data fetch karo.
    console.log(`Cache MISS: ${key}`);
    const freshData = await fetchData();

    // Data ko TTL ke saath save karo.
    await redisClient.set(key, JSON.stringify(freshData), {
      EX: ttlSeconds,
    });

    return freshData;
  } catch (error) {
    // Redis fail ho to dashboard ko phir bhi chalna chahiye.
    console.error("Redis cache error:", error.message);
    return fetchData();
  }
};

module.exports = { getOrSetCache };
