const BASE_URL = 'http://127.0.0.1:3001/api/ai/chat';
const pause = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

async function sendChat(payload) {
  const t0 = Date.now();
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const elapsed = Date.now() - t0;
  await pause(1500);
  return { status: res.status, elapsed, data };
}

async function runSuite() {
  console.log('=== STARTING SCIENTIFIC COPILOT VALIDATION SUITE ===\n');

  // Test A: "What is the oxygen at 1000 m?"
  console.log('--- TEST A: "What is the oxygen at 1000 m?" ---');
  const resA = await sendChat({
    message: 'What is the oxygen at 1000 m?',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 50,
      date: '2026-09-16',
      bgc: { oxygen_mmolm3: 68.1, nitrate_mmolm3: 29.19 },
    },
  });
  console.log('Test A Response Status:', resA.status, `(${resA.elapsed}ms)`);
  console.log('Test A Tool Actions:', JSON.stringify(resA.data.tool_actions, null, 2));
  console.log('Test A Scientific Data:', JSON.stringify(resA.data.scientific_data?.query, null, 2));
  console.log('Test A Answer Preview:\n', resA.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test B: "Compare surface and my current depth."
  console.log('--- TEST B: "Compare surface and my current depth." ---');
  const resB = await sendChat({
    message: 'Compare surface and my current depth.',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 500,
      date: '2026-09-16',
    },
  });
  console.log('Test B Response Status:', resB.status, `(${resB.elapsed}ms)`);
  console.log('Test B Tool Actions:', JSON.stringify(resB.data.tool_actions, null, 2));
  console.log('Test B Comparison Data Depths:', resB.data.comparison_data?.depths);
  console.log('Test B Row Count:', resB.data.comparison_data?.rows?.length);
  console.log('Test B Answer Preview:\n', resB.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test C: "Is there an Argo float nearby?"
  console.log('--- TEST C: "Is there an Argo float nearby?" ---');
  const resC = await sendChat({
    message: 'Is there an Argo float nearby?',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 0,
      date: '2026-09-16',
    },
  });
  console.log('Test C Response Status:', resC.status, `(${resC.elapsed}ms)`);
  console.log('Test C Tool Actions:', JSON.stringify(resC.data.tool_actions, null, 2));
  console.log('Test C Answer Preview:\n', resC.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test D: "Show me the Argo profile."
  console.log('--- TEST D: "Show me the Argo profile." ---');
  const resD = await sendChat({
    message: 'Show me the Argo profile.',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 50,
      date: '2026-09-16',
      nearest_argo_float: {
        platform_number: '2902768',
        distance_km: 310.6,
        type: 'bgc',
      },
    },
  });
  console.log('Test D Response Status:', resD.status, `(${resD.elapsed}ms)`);
  console.log('Test D Tool Actions:', JSON.stringify(resD.data.tool_actions, null, 2));
  console.log('Test D Answer Preview:\n', resD.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test E: "What about 1000 m?" after a previous location query
  console.log('--- TEST E: "What about 1000 m?" (Multi-turn Context Continuity) ---');
  const resE = await sendChat({
    message: 'What about 1000 m?',
    mode: 'scientist',
    history: [
      { role: 'user', content: 'What is the temperature and salinity here?' },
      { role: 'assistant', content: 'At lat 14.50°N, lon 78.50°E, surface depth (0 m), temperature is 28.6°C and salinity is 34.0 PSU.' },
    ],
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 0,
      date: '2026-09-16',
    },
  });
  console.log('Test E Response Status:', resE.status, `(${resE.elapsed}ms)`);
  console.log('Test E Tool Actions:', JSON.stringify(resE.data.tool_actions, null, 2));
  console.log('Test E Scientific Data Query:', JSON.stringify(resE.data.scientific_data?.query, null, 2));
  console.log('Test E Answer Preview:\n', resE.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test F: No location selected + point-specific question
  console.log('--- TEST F: No location selected + point-specific question ---');
  const resF = await sendChat({
    message: 'What is the water temperature here right now?',
    mode: 'scientist',
    context: {
      lat: null,
      lon: null,
      depth: null,
      date: null,
    },
  });
  console.log('Test F Response Status:', resF.status, `(${resF.elapsed}ms)`);
  console.log('Test F Tool Actions:', JSON.stringify(resF.data.tool_actions, null, 2));
  console.log('Test F Answer Preview:\n', resF.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test G: Null scientific field
  console.log('--- TEST G: Null scientific field handling ---');
  const resG = await sendChat({
    message: 'What is the pCO2 and pH at this point?',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 50,
      date: '2026-09-16',
      bgc: {
        oxygen_mmolm3: 68.1,
        nitrate_mmolm3: 29.19,
        ph: null,
        pco2_uatm: null,
      },
    },
  });
  console.log('Test G Response Status:', resG.status, `(${resG.elapsed}ms)`);
  console.log('Test G Tool Actions:', JSON.stringify(resG.data.tool_actions, null, 2));
  console.log('Test G Answer Preview:\n', resG.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test H: Student mode tone
  console.log('--- TEST H: Student mode question ---');
  const resH = await sendChat({
    message: 'Why is there less oxygen as we go deeper into the twilight zone?',
    mode: 'student',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 500,
      date: '2026-09-16',
      bgc: { oxygen_mmolm3: 68.1 },
    },
  });
  console.log('Test H Response Status:', resH.status, `(${resH.elapsed}ms)`);
  console.log('Test H Answer Preview:\n', resH.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');

  // Test I: Scientist mode technical precision
  console.log('--- TEST I: Scientist mode question ---');
  const resI = await sendChat({
    message: 'Analyze the biogeochemical oxygen minimum zone at 500 m vs surface.',
    mode: 'scientist',
    context: {
      lat: 14.5,
      lon: 78.5,
      depth: 500,
      date: '2026-09-16',
    },
  });
  console.log('Test I Response Status:', resI.status, `(${resI.elapsed}ms)`);
  console.log('Test I Tool Actions:', JSON.stringify(resI.data.tool_actions, null, 2));
  console.log('Test I Answer Preview:\n', resI.data.answer?.slice(0, 300));
  console.log('\n----------------------------------------\n');
}

runSuite().catch(console.error);
