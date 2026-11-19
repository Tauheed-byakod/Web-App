import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCivicIssue, parseGeminiAnalysis } from './aiAnalysis.js';

test('analysis reports rule-based category and severity when Gemini is not configured', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await analyzeCivicIssue({ description: 'A deep pothole beside the road is forcing traffic to swerve.' });
    assert.equal(result.analysisMode, 'rule-based');
    assert.equal(result.category, 'Pothole');
    assert.equal(result.severity, 'High');
    assert.match(result.warning, /not configured/i);
    assert.match(result.description, /Please inspect and address this issue/);

    const roadSafetyResult = await analyzeCivicIssue({ description: 'Road are not safe.' });
    assert.equal(roadSafetyResult.category, 'Other');
    assert.equal(roadSafetyResult.severity, 'Medium');
    assert.equal(roadSafetyResult.suggestedDepartment, 'Roads');
    assert.equal(roadSafetyResult.description, 'Please inspect the roads and address the reported safety concern.');
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('Gemini output is rejected when it does not match allowed civic values and fields', () => {
  assert.equal(parseGeminiAnalysis(JSON.stringify({
    category: 'Road damage',
    severity: 'Critical',
    severityExplanation: 'Unsafe damage.',
    title: 'Road damage report',
    description: 'Please fix the road damage.'
  })), null);
});

test('configured Gemini authentication failures are explained to the user', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    const result = await analyzeCivicIssue({ description: 'There is a broken streetlight beside the road.' });
    assert.equal(result.analysisMode, 'rule-based');
    assert.match(result.warning, /API key or its permissions/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
