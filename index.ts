import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { Pool }  from 'pg';
import { Client as MinioClient } from 'minio'
import fetch from 'node-fetch'
import { Readable } from 'stream';
import { timeStamp } from 'console';

const app = new Hono()


// PostgreSQL connection
const pool = new Pool({
  host: process.env.PG_HOST || 'postgres',
  port: 5432,
  user: process.env.PG_USER || 'lucky',
  password: process.env.PG_PASS || 'secret',
  database: process.env.PG_DB || 'opentts',
});

// MinIO client
const minioClient = new MinioClient({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
})

// ================================
// 🔹 Postgres helper
// ================================
async function storeInPostgres({ id, input, groq_respose, openTTS_Voice, openTTS_Model, filename, audioBase64 }) {
  const query = `
    INSERT INTO opentts_audio 
    (id, input, groq_respose, openTTS_voice, openTTS_model, filename, audio_base64)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `
  await pool.query(query, [
    id, input, groq_respose, openTTS_Voice, openTTS_Model, filename, audioBase64
  ])
}

// ================================
// 🔹 MinIO helper
// ================================
async function storeInMinio(id: any, audioBuffer: string | Readable | Buffer<ArrayBufferLike>, arrayBuffer: any) {

  const exists = await minioClient.bucketExists('opentts-audio')

  if(!exists){

    console.log('Bucket doesnt exist, creating neew one in "us-east-1"');

    await minioClient.makeBucket('opentts-audio', 'us-east-1');
    console.log('Bucket created successfully in "us-east-1"');
    return true;
  }

  
  try {
      await minioClient.putObject('opentts-audio', `${id}.wav`, audioBuffer)
  await minioClient.putObject('opentts-audio', `${id}.json`, Buffer.from(JSON.stringify(arrayBuffer)))

console.log('Audio and JSON stored in bucket')
return true;
  } catch (error) {
    console.error('Error stroring in bucket: ', error)
    return false;
  }

  return true;

}

// ================================
// 🔹 Pushgateway helper
// ================================
async function pushMetrics(job: string, labels: { [s: string]: unknown; } | ArrayLike<unknown>, metrics: { [s: string]: unknown; } | ArrayLike<unknown>) {
  const labelString = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',')

  const payload = Object.entries(metrics)
    .map(([name, value]) => `${name}{${labelString}} ${value}`)
    .join('\n')

  try {
    await fetch(`http://pushgateway-container:9091/metrics/job/${job}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    })
    console.log(`📊 Metrics pushed: job=${job}`)
  } catch (err) {
    console.error('🔥 Failed to push metrics to Pushgateway:', err)
  }
}

// ================================
// 🔹 Connection health checks
// ================================
async function checkConnections() {
  
    const health = {
    postgres:false,
    mino:false,
    pushgateway: false
  }
  try {
    await pool.query('SELECT 1')
    console.log( '✅ Postgres OK')
  } catch {
    console.error('❌ Postgres connection failed')
  }

  try {
    await minioClient.listBuckets()
    console.log('✅ MinIO OK')
  } catch {
    console.error('❌ MinIO connection failed')
  }

  try {
    await fetch('http://pushgateway-container:9091/-/ready')
    console.log('✅ Pushgateway OK')
  } catch {
    console.error('❌ Pushgateway connection failed')
  }
}

// ================================
// 🔹 Main API route
// ================================
app.post('/create', async (c) => {
  console.log('🔔 /create endpoint hit')
  const start = Date.now()
  let status = 'success'
  let id: any

  try {
    const body = await c.req.json()
    const {
      id: clientId,
      input,
      openTTS_Voice,
      openTTS_Model,
      groq_respose,
      audioBase64,
      arrayBuffer,
    } = body


    // lets create check and return if something missing, invalid etc
    if (!input || input=='' || openTTS_Voice=='' || !openTTS_Voice || openTTS_Model=='' ||!openTTS_Model || !audioBase64 || audioBase64=='') {
      
      const missingFilds: string[] = [];
      // lets pin point whats missing for quixk resolutino 
      if(!input || input=='') missingFilds.push('input')
      if(!openTTS_Voice || openTTS_Voice=='') missingFilds.push('openTTS_Voice')
      if(!openTTS_Model || openTTS_Model=='') missingFilds.push('openTTS_Model')
      if(!audioBase64 || audioBase64=='') missingFilds.push('audioBase64')
      
      return c.json({ error: 'Missing required fields', missing: missingFilds }, 400)
    }

    // 1. Save to Postgres
/*
    // 2. Respond early
    c.executionCtx.waitUntil((async () => {
      try {
        // Store in MinIO
        await storeInMinio(id, audioBuffer, arrayBuffer)

        // Push success metrics
        await pushMetrics('opentts', { service: 'hono-api-dba-push', id }, {
          opentts_success_total: 1,
          opentts_duration_ms: Date.now() - start,
        })
      } catch (err) {
        status = 'minio-failure'
        await pushMetrics('opentts', { service: 'hono-api-dba-push', id }, {
          opentts_failure_total: 1,
        })
        console.error('🔥 MinIO failure:', err)
      }
    })())
*/
// Async background task without executionCtx
(async () => {
  try {
        //Decode base64 audio
    id = clientId || uuidv4()
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const filename = `${id}.wav`

    await storeInMinio(id, audioBuffer, arrayBuffer)
    await storeInPostgres({ id, input, groq_respose, openTTS_Voice, openTTS_Model, filename, audioBase64 })

    await pushMetrics('opentts', { service: 'hono-api-dba-push', id }, {
      opentts_success_total: 1,
      opentts_duration_ms: Date.now() - start,
    })

  } catch (err) {
    status = 'minio-failure'
    await pushMetrics('opentts', { service: 'hono-api-dba-push', id }, { opentts_failure_total: 1 })
    console.error('🔥 MinIO failure:', err)
  }
})()


    return c.json({ message: '✅ Audio stored successfully', id })
  } catch (err) {
    
    status = 'pg-failure'
    await pushMetrics('opentts', { service: 'hono-api-dba-push', id: id || 'unknown' }, {
      opentts_failure_total: 1,
    })
    console.error('🔥 Error in /create:', err)
    return c.json({ error: 'Failed to store audio' }, 500)
  }
})

//HEALTH Checks metrics
app.get('/health', async (c) => {

  const health = await checkConnections();

  return c.json({
    status: 'okay',
    timeStamp: new Date().toISOString(),
    health
  })

})

export default app
