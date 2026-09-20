import { GoogleGenAI } from '@google/genai';
import { executeWithFailover, resetPoolForTesting, getEligibleCredentialsCount } from './src/services/geminiKeyPool.service';

async function runTests() {
  console.log('--- TEST A: Single Legacy Key ---');
  resetPoolForTesting();
  process.env.GEMINI_API_KEY = 'legacy-key';
  process.env.GEMINI_KEY_1 = '';
  process.env.GEMINI_KEY_2 = '';
  
  await executeWithFailover(async (ai, keyIndex) => {
    console.log(`Success with keyIndex ${keyIndex}`);
  });

  console.log('\n--- TEST B: Invalid Key 1 + Valid Key 2 ---');
  resetPoolForTesting();
  process.env.GEMINI_KEY_1 = 'invalid-key-1';
  process.env.GEMINI_KEY_2 = 'valid-key-2';
  
  let attemptsB = 0;
  await executeWithFailover(async (ai, keyIndex) => {
    attemptsB++;
    if (keyIndex === 1) {
      console.log('Simulating 403 Forbidden for Key 1');
      const err: any = new Error('Permission Denied');
      err.status = 403;
      throw err;
    }
    console.log(`Success with keyIndex ${keyIndex}`);
  });
  console.log('Eligible credentials left:', getEligibleCredentialsCount());

  console.log('\n--- TEST C/D: Transient Error (e.g. 503) ---');
  resetPoolForTesting();
  let attemptsC = 0;
  try {
    await executeWithFailover(async (ai, keyIndex) => {
      attemptsC++;
      console.log(`Simulating 503 for keyIndex ${keyIndex}`);
      const err: any = new Error('Service Unavailable');
      err.status = 503;
      throw err;
    });
  } catch (e: any) {
    console.log('Caught expected transient error bubble up:', e.message);
  }
  console.log('Eligible credentials left:', getEligibleCredentialsCount(), '(should still be 2 since 503 does not burn keys)');

  console.log('\n--- TEST E: Actual Quota Exhaustion ---');
  resetPoolForTesting();
  let attemptsE = 0;
  await executeWithFailover(async (ai, keyIndex) => {
    attemptsE++;
    if (keyIndex === 1) {
      console.log('Simulating 429 Quota Exhausted for Key 1');
      const err: any = new Error('Quota exceeded for metric...');
      err.status = 429;
      throw err;
    }
    console.log(`Success with keyIndex ${keyIndex}`);
  });
  console.log('Eligible credentials left:', getEligibleCredentialsCount());

  console.log('\n--- TEST F: All Credentials Unavailable ---');
  resetPoolForTesting();
  try {
    await executeWithFailover(async (ai, keyIndex) => {
      console.log(`Simulating Quota Exhausted for keyIndex ${keyIndex}`);
      const err: any = new Error('Quota exceeded');
      err.status = 429;
      throw err;
    });
  } catch (e: any) {
    console.log('Caught expected exhaustion error:', e.message);
  }
  console.log('Eligible credentials left:', getEligibleCredentialsCount(), '(should be 0)');
}

runTests().catch(console.error);
