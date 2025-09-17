import { Hono } from 'hono';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const app = new Hono();

// PostgreSQL connection
const pool = new Pool({
  host: process.env.PG_HOST || 'postgres',
  port: 5432,
  user: process.env.PG_USER || 'lucky',
  password: process.env.PG_PASS || 'secret',
  database: process.env.PG_DB || 'opentts',
});

app.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const {
      input,
      groq_respose,
      openTTS_Voice,
      openTTS_Model,
      filename,
      audioBase64,
      id = uuidv4(),
    } = body;
 
    const audioData = Buffer.from(audioBase64, 'base64');

    
    const query = `
      INSERT INTO opentts_audio (id, input, groq_respose, openTTS_voice, openTTS_model, filename, audio_base64)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(query, [id, input, groq_respose, openTTS_Voice, openTTS_Model, filename, audioBase64]);

    return c.json({ message: '✅ Audio stored successfully', id });
  } catch (err) {
    console.error('🔥 Error in /create:', err);
    return c.json({ error: 'Failed to store audio' }, 500);
  }
});

export default app;
